import * as React from "react"

type DownloadProgress = {
  total: number
  downloaded: number
  failed: number
  currentZoom: number
}

type BoundingBox = {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
}

type OfflineDownloaderProps = {
  isOpen: boolean
  onClose: () => void
  mapBounds: BoundingBox | null
  onDownloadComplete: () => void
}

// Calculate tile coordinates from lat/lon at a given zoom level
function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom))
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom))
  return { x, y }
}

// Calculate total number of tiles for a bounding box and zoom range
function calculateTileCount(bounds: BoundingBox, minZoom: number, maxZoom: number): number {
  let total = 0
  for (let z = minZoom; z <= maxZoom; z++) {
    const topLeft = lonLatToTile(bounds.minLon, bounds.maxLat, z)
    const bottomRight = lonLatToTile(bounds.maxLon, bounds.minLat, z)
    const tilesX = bottomRight.x - topLeft.x + 1
    const tilesY = bottomRight.y - topLeft.y + 1
    total += tilesX * tilesY
  }
  return total
}

// Estimate download size (average OSM tile is ~15-20KB)
function estimateSize(tileCount: number): string {
  const avgTileSize = 17 * 1024 // 17KB average
  const totalBytes = tileCount * avgTileSize
  if (totalBytes < 1024 * 1024) {
    return `${(totalBytes / 1024).toFixed(1)} KB`
  } else if (totalBytes < 1024 * 1024 * 1024) {
    return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
  } else {
    return `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
}

export const OfflineDownloader: React.FC<OfflineDownloaderProps> = ({
  isOpen,
  onClose,
  mapBounds,
  onDownloadComplete
}) => {
  const [minZoom, setMinZoom] = React.useState(5)
  const [maxZoom, setMaxZoom] = React.useState(15)
  const [isDownloading, setIsDownloading] = React.useState(false)
  const [progress, setProgress] = React.useState<DownloadProgress | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const abortControllerRef = React.useRef<AbortController | null>(null)

  const tileCount = React.useMemo(() => {
    if (!mapBounds) return 0
    return calculateTileCount(mapBounds, minZoom, maxZoom)
  }, [mapBounds, minZoom, maxZoom])

  const estimatedSize = React.useMemo(() => {
    return estimateSize(tileCount)
  }, [tileCount])

  const handleDownload = async () => {
    if (!mapBounds) return

    setIsDownloading(true)
    setError(null)
    setProgress({ total: tileCount, downloaded: 0, failed: 0, currentZoom: minZoom })

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    let downloaded = 0
    let failed = 0

    try {
      for (let z = minZoom; z <= maxZoom; z++) {
        if (signal.aborted) break

        setProgress(prev => prev ? { ...prev, currentZoom: z } : null)

        const topLeft = lonLatToTile(mapBounds.minLon, mapBounds.maxLat, z)
        const bottomRight = lonLatToTile(mapBounds.maxLon, mapBounds.minLat, z)

        for (let x = topLeft.x; x <= bottomRight.x; x++) {
          for (let y = topLeft.y; y <= bottomRight.y; y++) {
            if (signal.aborted) break

            try {
              // Download tile from OSM
              const url = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
              const response = await fetch(url, { signal })
              
              if (response.ok) {
                const blob = await response.blob()
                const arrayBuffer = await blob.arrayBuffer()
                const base64 = btoa(
                  new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                )
                
                // Store in localStorage (for simplicity - could use IndexedDB for larger storage)
                const key = `tile_${z}_${x}_${y}`
                try {
                  localStorage.setItem(key, base64)
                  downloaded++
                } catch (e) {
                  // localStorage might be full
                  console.warn('Storage full, using IndexedDB fallback')
                  await storeTileInIndexedDB(z, x, y, base64)
                  downloaded++
                }
              } else {
                failed++
              }
            } catch (e) {
              if (!signal.aborted) {
                failed++
              }
            }

            setProgress({ total: tileCount, downloaded, failed, currentZoom: z })
            
            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        }
      }

      if (!signal.aborted) {
        // Store metadata about downloaded region
        const metadata = {
          bounds: mapBounds,
          minZoom,
          maxZoom,
          downloadedAt: new Date().toISOString(),
          tileCount: downloaded
        }
        localStorage.setItem('offline_tiles_metadata', JSON.stringify(metadata))
        onDownloadComplete()
      }
    } catch (e) {
      if (!signal.aborted) {
        setError(`Download failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
      }
    } finally {
      setIsDownloading(false)
      abortControllerRef.current = null
    }
  }

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsDownloading(false)
    setProgress(null)
  }

  const handleClose = () => {
    if (isDownloading) {
      handleCancel()
    }
    onClose()
  }

  if (!isOpen) return null

  const progressPercent = progress ? Math.round((progress.downloaded / progress.total) * 100) : 0

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: "8px",
        padding: "24px",
        width: "420px",
        maxWidth: "90vw",
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.15)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "#1f2d3d" }}>
            Download Offline Maps
          </h2>
          <button
            onClick={handleClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "#8492a6"
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {!mapBounds ? (
          <div style={{ 
            padding: "20px", 
            background: "#fff3cd", 
            borderRadius: "6px",
            color: "#856404",
            fontSize: "14px"
          }}>
            <strong>No area selected.</strong> Navigate to the area you want to download on the map, then open this dialog again.
          </div>
        ) : (
          <>
            <div style={{ marginBottom: "16px" }}>
              <p style={{ margin: "0 0 12px", fontSize: "14px", color: "#4d5c7b" }}>
                Download map tiles for the current view area for offline use.
              </p>
              
              <div style={{ 
                background: "#f1f3f9", 
                padding: "12px", 
                borderRadius: "6px",
                fontSize: "13px",
                color: "#4d5c7b"
              }}>
                <div style={{ marginBottom: "8px" }}>
                  <strong>Area:</strong> {mapBounds.minLat.toFixed(4)}° to {mapBounds.maxLat.toFixed(4)}° N, {mapBounds.minLon.toFixed(4)}° to {mapBounds.maxLon.toFixed(4)}° E
                </div>
                <div style={{ marginBottom: "8px" }}>
                  <strong>Tiles:</strong> {tileCount.toLocaleString()}
                </div>
                <div>
                  <strong>Est. Size:</strong> {estimatedSize}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "13px", fontWeight: 500, color: "#1f2d3d" }}>
                Zoom Range
              </label>
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", color: "#8492a6" }}>Min Zoom</label>
                  <select
                    value={minZoom}
                    onChange={(e) => setMinZoom(Number(e.target.value))}
                    disabled={isDownloading}
                    className="input"
                    style={{ marginTop: "4px" }}
                  >
                    {[...Array(15)].map((_, i) => (
                      <option key={i} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", color: "#8492a6" }}>Max Zoom</label>
                  <select
                    value={maxZoom}
                    onChange={(e) => setMaxZoom(Number(e.target.value))}
                    disabled={isDownloading}
                    className="input"
                    style={{ marginTop: "4px" }}
                  >
                    {[...Array(19 - minZoom)].map((_, i) => (
                      <option key={i} value={minZoom + i + 1}>{minZoom + i + 1}</option>
                    ))}
                  </select>
                </div>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#8492a6" }}>
                Higher zoom = more detail but larger download. Zoom 15 is street-level.
              </p>
            </div>

            {tileCount > 10000 && (
              <div style={{ 
                padding: "12px", 
                background: "#fee2e2", 
                borderRadius: "6px",
                color: "#dc2626",
                fontSize: "13px",
                marginBottom: "16px"
              }}>
                ⚠️ Large download ({tileCount.toLocaleString()} tiles). Consider reducing the zoom range or selecting a smaller area.
              </div>
            )}

            {error && (
              <div style={{ 
                padding: "12px", 
                background: "#fee2e2", 
                borderRadius: "6px",
                color: "#dc2626",
                fontSize: "13px",
                marginBottom: "16px"
              }}>
                {error}
              </div>
            )}

            {isDownloading && progress && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  fontSize: "13px",
                  marginBottom: "8px",
                  color: "#4d5c7b"
                }}>
                  <span>Downloading zoom level {progress.currentZoom}...</span>
                  <span>{progressPercent}%</span>
                </div>
                <div style={{
                  height: "8px",
                  background: "#e8ecf4",
                  borderRadius: "4px",
                  overflow: "hidden"
                }}>
                  <div style={{
                    height: "100%",
                    width: `${progressPercent}%`,
                    background: "#4a6cf7",
                    borderRadius: "4px",
                    transition: "width 0.2s ease"
                  }} />
                </div>
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  fontSize: "12px",
                  marginTop: "8px",
                  color: "#8492a6"
                }}>
                  <span>{progress.downloaded.toLocaleString()} / {progress.total.toLocaleString()} tiles</span>
                  {progress.failed > 0 && <span style={{ color: "#dc2626" }}>{progress.failed} failed</span>}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              {isDownloading ? (
                <button
                  onClick={handleCancel}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
              ) : (
                <>
                  <button
                    onClick={handleClose}
                    className="btn btn-secondary"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleDownload}
                    className="btn btn-primary"
                    disabled={tileCount === 0}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7,10 12,15 17,10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download {tileCount.toLocaleString()} Tiles
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// IndexedDB fallback for larger storage
async function storeTileInIndexedDB(z: number, x: number, y: number, base64: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('OfflineTiles', 1)
    
    request.onerror = () => reject(request.error)
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('tiles')) {
        db.createObjectStore('tiles', { keyPath: 'key' })
      }
    }
    
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(['tiles'], 'readwrite')
      const store = transaction.objectStore('tiles')
      
      const key = `${z}_${x}_${y}`
      store.put({ key, data: base64 })
      
      transaction.oncomplete = () => {
        db.close()
        resolve()
      }
      transaction.onerror = () => {
        db.close()
        reject(transaction.error)
      }
    }
  })
}

// Function to get a tile from cache (localStorage or IndexedDB)
export async function getCachedTile(z: number, x: number, y: number): Promise<string | null> {
  // Try localStorage first
  const localKey = `tile_${z}_${x}_${y}`
  const localTile = localStorage.getItem(localKey)
  if (localTile) {
    return `data:image/png;base64,${localTile}`
  }
  
  // Try IndexedDB
  return new Promise((resolve) => {
    const request = indexedDB.open('OfflineTiles', 1)
    
    request.onerror = () => resolve(null)
    
    request.onsuccess = () => {
      const db = request.result
      try {
        const transaction = db.transaction(['tiles'], 'readonly')
        const store = transaction.objectStore('tiles')
        const key = `${z}_${x}_${y}`
        const getRequest = store.get(key)
        
        getRequest.onsuccess = () => {
          db.close()
          if (getRequest.result) {
            resolve(`data:image/png;base64,${getRequest.result.data}`)
          } else {
            resolve(null)
          }
        }
        getRequest.onerror = () => {
          db.close()
          resolve(null)
        }
      } catch (e) {
        db.close()
        resolve(null)
      }
    }
  })
}

// Function to check if we have offline tiles
export function hasOfflineTiles(): boolean {
  const metadata = localStorage.getItem('offline_tiles_metadata')
  return metadata !== null
}

// Function to get offline tiles metadata
export function getOfflineTilesMetadata(): { bounds: any; minZoom: number; maxZoom: number; tileCount: number; downloadedAt: string } | null {
  const metadata = localStorage.getItem('offline_tiles_metadata')
  if (metadata) {
    return JSON.parse(metadata)
  }
  return null
}

// Function to clear all offline tiles
export async function clearOfflineTiles(): Promise<void> {
  // Clear localStorage tiles
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('tile_')) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key))
  localStorage.removeItem('offline_tiles_metadata')
  
  // Clear IndexedDB
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase('OfflineTiles')
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
  })
}

