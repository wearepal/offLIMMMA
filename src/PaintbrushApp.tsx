import * as React from "react"
import { PaintbrushMap, PaintbrushMapRef, BoundingBox } from "./PaintbrushMap"
import { GeoTIFFLayer, loadGeoTIFF } from "./utils/geotiff_utils"
import { VectorFileLayer, loadShapefileFromComponents, loadShapefileFromZip, loadGeoJSONFile } from "./utils/vector_utils"
import { PaintbrushToolbar } from "./PaintbrushToolbar"
import { PaintbrushSidebar } from "./PaintbrushSidebar"
import { PaintClass, ToolMode } from "./utils/types"
import { OfflineDownloader, hasOfflineTiles } from "./OfflineDownloader"
import { LayerInfo } from "./LayersPanel"

export const PaintbrushApp: React.FC = () => {
  const [classes, setClasses] = React.useState<PaintClass[]>([])
  const [selectedClassId, setSelectedClassId] = React.useState<number | null>(null)
  const [activeTool, setActiveTool] = React.useState<ToolMode>(ToolMode.Cursor)
  const [opacity, setOpacity] = React.useState<number>(1.0)
  const [canUndo, setCanUndo] = React.useState(false)
  const [canRedo, setCanRedo] = React.useState(false)
  const [projectName, setProjectName] = React.useState<string>("Untitled Project")
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isLoadingGeoJSON, setIsLoadingGeoJSON] = React.useState(false)
  const [currentFilePath, setCurrentFilePath] = React.useState<string | null>(null)
  const [geoJsonData, setGeoJsonData] = React.useState<string | null>(null)
  const [showOfflineDownloader, setShowOfflineDownloader] = React.useState(false)
  const [offlineTilesAvailable, setOfflineTilesAvailable] = React.useState(hasOfflineTiles())
  const [geotiffLayers, setGeotiffLayers] = React.useState<GeoTIFFLayer[]>([])
  const [vectorLayers, setVectorLayers] = React.useState<VectorFileLayer[]>([])
  const [isLoadingLayer, setIsLoadingLayer] = React.useState(false)
  const [loadingMessage, setLoadingMessage] = React.useState("")
  const [usingCachedTiles, setUsingCachedTiles] = React.useState(false)
  const cachedTileTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  const mapRef = React.useRef<PaintbrushMapRef>(null)
  const previousToolRef = React.useRef<ToolMode>(ToolMode.Cursor)
  const spacebarPressedRef = React.useRef(false)

  // Unified layers state (OSM + GeoTIFFs)
  const [layers, setLayers] = React.useState<LayerInfo[]>([
    { id: "osm", name: "OpenStreetMap", type: "osm", opacity: 1, visible: true }
  ])

  // Expose unsaved changes state to window for Electron and send to main process
  React.useEffect(() => {
    // Ensure window object exists
    if (typeof window !== 'undefined') {
      window.hasUnsavedChanges = hasUnsavedChanges
      console.log('Updated window.hasUnsavedChanges to:', hasUnsavedChanges)
      
      // Also send to main process via IPC
      if (window.electronAPI?.setUnsavedChanges) {
        window.electronAPI.setUnsavedChanges(hasUnsavedChanges)
      }
    }
  }, [hasUnsavedChanges])
  
  // Initialize window.hasUnsavedChanges on mount
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.hasUnsavedChanges = false
      if (window.electronAPI?.setUnsavedChanges) {
        window.electronAPI.setUnsavedChanges(false)
      }
      console.log('Initialized window.hasUnsavedChanges to false')
    }
  }, [])

  // Listen for save trigger from Electron main process
  React.useEffect(() => {
    if (window.electronAPI?.onTriggerSave) {
      const unsubscribe = window.electronAPI.onTriggerSave(() => {
        handleSave()
      })
      return unsubscribe
    }
  }, [])

  const selectedClass = React.useMemo(
    () => classes.find(paintClass => paintClass.id === selectedClassId) ?? null,
    [classes, selectedClassId]
  )

  const handleUndo = () => {
    mapRef.current?.undo()
  }

  const handleRedo = () => {
    mapRef.current?.redo()
  }

  const handleSave = async () => {
    const geoJson = mapRef.current?.exportGeoJSON()
    if (!geoJson) {
      // No data to save, but still mark as saved if project name changed
      setHasUnsavedChanges(false)
      return
    }

    setIsSaving(true)

    try {
      let result
      if (currentFilePath) {
        // Quick save to existing file
        result = await window.electronAPI.quickSave(geoJson, currentFilePath)
      } else {
        // Save as new file
        result = await window.electronAPI.saveFile(geoJson, `${projectName}.geojson`)
      }

      if (result.success && result.filePath) {
        setCurrentFilePath(result.filePath)
        setHasUnsavedChanges(false)
        // Update project name from filename if it was a new save
        if (!currentFilePath) {
          const fileName = result.filePath.split(/[\\/]/).pop()?.replace(/\.(geojson|json)$/i, '') || projectName
          setProjectName(fileName)
        }
      } else if (result.error) {
        alert(`Error saving file: ${result.error}`)
      }
    } catch (error) {
      console.error('Error saving:', error)
      alert(`An error occurred while saving: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveAs = async () => {
    const geoJson = mapRef.current?.exportGeoJSON()
    if (!geoJson) {
      alert('No data to save')
      return
    }

    setIsSaving(true)

    try {
      const result = await window.electronAPI.saveFile(geoJson, `${projectName}.geojson`)

      if (result.success && result.filePath) {
        setCurrentFilePath(result.filePath)
        setHasUnsavedChanges(false)
        const fileName = result.filePath.split(/[\\/]/).pop()?.replace(/\.(geojson|json)$/i, '') || projectName
        setProjectName(fileName)
      } else if (result.error) {
        alert(`Error saving file: ${result.error}`)
      }
    } catch (error) {
      console.error('Error saving:', error)
      alert(`An error occurred while saving: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleOpen = async () => {
    if (hasUnsavedChanges) {
      const choice = confirm('You have unsaved changes. Do you want to save before opening a different file?')
      if (choice) {
        // User wants to save
        const geoJson = mapRef.current?.exportGeoJSON()
        if (geoJson) {
          setIsSaving(true)
          try {
            let result
            if (currentFilePath) {
              result = await window.electronAPI.quickSave(geoJson, currentFilePath)
            } else {
              result = await window.electronAPI.saveFile(geoJson, `${projectName}.geojson`)
            }
            
            if (result.success && result.filePath) {
              setCurrentFilePath(result.filePath)
              setHasUnsavedChanges(false)
              if (!currentFilePath) {
                const fileName = result.filePath.split(/[\\/]/).pop()?.replace(/\.(geojson|json)$/i, '') || projectName
                setProjectName(fileName)
              }
            } else {
              // Save was cancelled or failed, ask if they still want to open
              const stillOpen = confirm('Save was not completed. Open file anyway?')
              if (!stillOpen) {
                setIsSaving(false)
                return
              }
            }
          } catch (error) {
            const stillOpen = confirm('An error occurred while saving. Open file anyway?')
            if (!stillOpen) {
              setIsSaving(false)
              return
            }
          } finally {
            setIsSaving(false)
          }
        }
      } else {
        // User doesn't want to save, ask for confirmation
        const confirmOpen = confirm('Your unsaved changes will be lost. Are you sure you want to open a different file?')
        if (!confirmOpen) return
      }
    }

    try {
      const result = await window.electronAPI.openFile()

      if (result.success && result.data) {
        setGeoJsonData(result.data)
        setCurrentFilePath(result.filePath || null)
        setProjectName(result.fileName || 'Imported Project')
        setHasUnsavedChanges(false)
      } else if (result.error) {
        alert(`Error opening file: ${result.error}`)
      }
    } catch (error) {
      console.error('Error opening file:', error)
      alert(`An error occurred while opening: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleNew = async () => {
    if (hasUnsavedChanges) {
      const choice = confirm('You have unsaved changes. Do you want to save before starting a new project?')
      if (choice) {
        // User wants to save
        const geoJson = mapRef.current?.exportGeoJSON()
        if (geoJson) {
          setIsSaving(true)
          try {
            let result
            if (currentFilePath) {
              result = await window.electronAPI.quickSave(geoJson, currentFilePath)
            } else {
              result = await window.electronAPI.saveFile(geoJson, `${projectName}.geojson`)
            }
            
            if (result.success && result.filePath) {
              setCurrentFilePath(result.filePath)
              setHasUnsavedChanges(false)
              if (!currentFilePath) {
                const fileName = result.filePath.split(/[\\/]/).pop()?.replace(/\.(geojson|json)$/i, '') || projectName
                setProjectName(fileName)
              }
            } else {
              // Save was cancelled or failed, ask if they still want to create new
              const stillNew = confirm('Save was not completed. Start new project anyway?')
              if (!stillNew) {
                setIsSaving(false)
                return
              }
            }
          } catch (error) {
            const stillNew = confirm('An error occurred while saving. Start new project anyway?')
            if (!stillNew) {
              setIsSaving(false)
              return
            }
          } finally {
            setIsSaving(false)
          }
        }
      } else {
        // User doesn't want to save, ask for confirmation
        const confirmNew = confirm('Your unsaved changes will be lost. Are you sure you want to start a new project?')
        if (!confirmNew) return
      }
    }

    setClasses([])
    setSelectedClassId(null)
    setActiveTool(ToolMode.Cursor)
    setOpacity(1.0)
    setProjectName("Untitled Project")
    setCurrentFilePath(null)
    setGeoJsonData(null)
    setHasUnsavedChanges(false)
    
    // Clear the map
    mapRef.current?.clearAll?.()
  }

  const handleNameChange = (newName: string) => {
    setProjectName(newName)
    setHasUnsavedChanges(true)
  }

  const handleOpenOfflineDownloader = () => {
    setShowOfflineDownloader(true)
  }

  const handleOfflineDownloadComplete = () => {
    setOfflineTilesAvailable(true)
    mapRef.current?.refreshTiles()
  }

  const handleCachedTileUsed = React.useCallback(() => {
    setUsingCachedTiles(true)
    // Clear any existing timeout
    if (cachedTileTimeoutRef.current) {
      clearTimeout(cachedTileTimeoutRef.current)
    }
    // Hide indicator after 3 seconds of no cached tile activity
    cachedTileTimeoutRef.current = setTimeout(() => {
      setUsingCachedTiles(false)
    }, 3000)
  }, [])

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (cachedTileTimeoutRef.current) {
        clearTimeout(cachedTileTimeoutRef.current)
      }
    }
  }, [])

  const getMapBounds = (): BoundingBox | null => {
    return mapRef.current?.getBounds() ?? null
  }

  // GeoTIFF handling
  const handleLoadGeotiff = React.useCallback(async () => {
    try {
      setLoadingMessage("Selecting file...")
      const result = await window.electronAPI.openGeotiff()
      
      if (result.success && result.data) {
        setIsLoadingLayer(true)
        setLoadingMessage(`Loading ${result.fileName}...`)
        
        // Use setTimeout to allow the UI to update before heavy processing
        await new Promise(resolve => setTimeout(resolve, 50))
        
        setLoadingMessage(`Processing GeoTIFF (${result.fileSizeMB?.toFixed(1) || '?'}MB)...`)
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // Load from ArrayBuffer with automatic downsampling
        const geotiffLayer = await loadGeoTIFF(
          result.data,
          result.fileName || 'GeoTIFF',
          result.filePath || ''
        )
        
        setGeotiffLayers(prev => [...prev, geotiffLayer])
        
        // Add to unified layers (insert at top, before OSM)
        const newLayerInfo: LayerInfo = {
          id: `geotiff-${Date.now()}`,
          name: result.fileName || 'GeoTIFF',
          type: "geotiff",
          opacity: 0.7,
          visible: true,
          filePath: result.filePath,
          extent: geotiffLayer.extent
        }
        setLayers(prev => [newLayerInfo, ...prev])
        
        // Fit map to the GeoTIFF extent
        mapRef.current?.fitToExtent(geotiffLayer.extent)
        
        setIsLoadingLayer(false)
        setLoadingMessage("")
      } else if (result.error) {
        // Error was already shown by main process dialog
        console.log('GeoTIFF load cancelled or failed:', result.error)
      }
    } catch (error) {
      console.error('Failed to load GeoTIFF:', error)
      setIsLoadingLayer(false)
      setLoadingMessage("")
      alert('Failed to load GeoTIFF: ' + (error as Error).message)
    }
  }, [])

  // Vector file handling (Shapefile, GeoJSON)
  const handleLoadVector = React.useCallback(async () => {
    try {
      setLoadingMessage("Selecting file...")
      const result = await window.electronAPI.openVector()
      
      if (result.success && (result.data || result.shapefileData)) {
        setIsLoadingLayer(true)
        setLoadingMessage(`Loading ${result.fileName}...`)
        
        await new Promise(resolve => setTimeout(resolve, 50))
        
        setLoadingMessage(`Processing ${result.fileType} (${result.fileSizeMB?.toFixed(1) || '?'}MB)...`)
        await new Promise(resolve => setTimeout(resolve, 50))
        
        let vectorLayer: VectorFileLayer
        
        if (result.fileType === 'shapefile' && result.shapefileData) {
          // Load from individual .shp, .dbf, .prj files
          vectorLayer = await loadShapefileFromComponents(
            result.shapefileData, 
            result.fileName || 'Shapefile', 
            result.filePath || ''
          )
        } else if (result.fileType === 'shapefile-zip' && result.data) {
          // Load from zipped shapefile
          vectorLayer = await loadShapefileFromZip(
            result.data, 
            result.fileName || 'Shapefile', 
            result.filePath || ''
          )
        } else if (result.fileType === 'geojson' && result.data) {
          vectorLayer = await loadGeoJSONFile(
            result.data, 
            result.fileName || 'GeoJSON', 
            result.filePath || ''
          )
        } else {
          throw new Error('Unsupported file type: ' + result.fileType)
        }
        
        setVectorLayers(prev => [...prev, vectorLayer])
        
        // Add to unified layers
        const newLayerInfo: LayerInfo = {
          id: `vector-${Date.now()}`,
          name: vectorLayer.name,
          type: "vector",
          opacity: 0.8,
          visible: true,
          filePath: result.filePath,
          extent: vectorLayer.extent
        }
        setLayers(prev => [newLayerInfo, ...prev])
        
        // Fit map to the vector extent
        mapRef.current?.fitToExtent(vectorLayer.extent)
        
        setIsLoadingLayer(false)
        setLoadingMessage("")
      } else if (result.error) {
        console.log('Vector load cancelled or failed:', result.error)
      }
    } catch (error) {
      console.error('Failed to load vector file:', error)
      setIsLoadingLayer(false)
      setLoadingMessage("")
      alert('Failed to load vector file: ' + (error as Error).message)
    }
  }, [])

  const handleRemoveLayer = React.useCallback((id: string) => {
    // Find the layer to get its filePath and type
    const layerToRemove = layers.find(l => l.id === id)
    if (layerToRemove?.filePath) {
      if (layerToRemove.type === 'geotiff') {
        setGeotiffLayers(prev => prev.filter(l => l.filePath !== layerToRemove.filePath))
      } else if (layerToRemove.type === 'vector') {
        setVectorLayers(prev => prev.filter(l => l.filePath !== layerToRemove.filePath))
      }
    }
    setLayers(prev => prev.filter(l => l.id !== id))
  }, [layers])

  const handleZoomToLayer = React.useCallback((extent: [number, number, number, number]) => {
    mapRef.current?.fitToExtent(extent)
  }, [])

  // Mark as having unsaved changes when classes change
  const handleClassesChange = React.useCallback((newClasses: PaintClass[] | ((prev: PaintClass[]) => PaintClass[])) => {
    setClasses(newClasses)
    setHasUnsavedChanges(true)
  }, [])

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if we're in a text input/textarea
      const target = event.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      
      if (isTyping) {
        return
      }

      // Spacebar - switch to paint mode while held
      if (event.key === ' ' || event.key === 'Spacebar') {
        if (!spacebarPressedRef.current && selectedClass) {
          event.preventDefault()
          spacebarPressedRef.current = true
          previousToolRef.current = activeTool
          if (activeTool !== ToolMode.Paint) {
            setActiveTool(ToolMode.Paint)
          }
        }
        return
      }

      // Ctrl+S / Cmd+S for save
      if ((event.ctrlKey || event.metaKey) && event.key === 's' && !event.shiftKey) {
        event.preventDefault()
        handleSave()
      }
      // Ctrl+Shift+S / Cmd+Shift+S for save as
      else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 's') {
        event.preventDefault()
        handleSaveAs()
      }
      // Ctrl+O / Cmd+O for open
      else if ((event.ctrlKey || event.metaKey) && event.key === 'o') {
        event.preventDefault()
        handleOpen()
      }
      // Ctrl+N / Cmd+N for new
      else if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
        event.preventDefault()
        handleNew()
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      // Spacebar released - switch back to previous tool
      if ((event.key === ' ' || event.key === 'Spacebar') && spacebarPressedRef.current) {
        event.preventDefault()
        spacebarPressedRef.current = false
        if (activeTool === ToolMode.Paint && previousToolRef.current !== ToolMode.Paint) {
          setActiveTool(previousToolRef.current)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [hasUnsavedChanges, projectName, currentFilePath, activeTool, selectedClass])

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      width: "100%", 
      height: "100%",
      minHeight: 0,
      overflow: "hidden",
      background: "#f8f9fc"
    }}>
      <PaintbrushToolbar 
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        projectName={projectName}
        onProjectNameChange={handleNameChange}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onOpen={handleOpen}
        onNew={handleNew}
        onDownloadOffline={handleOpenOfflineDownloader}
        hasUnsavedChanges={hasUnsavedChanges}
        isSaving={isSaving}
        hasOfflineTiles={offlineTilesAvailable}
      />
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, overflow: "hidden", minHeight: 0, minWidth: 0, padding: "12px", paddingRight: "6px", position: "relative" }}>
          <PaintbrushMap 
            ref={mapRef}
            activeTool={activeTool} 
            selectedClass={selectedClass} 
            opacity={opacity} 
            classes={classes}
            geoJsonData={geoJsonData}
            onUndoRedoStateChange={(undo, redo) => {
              setCanUndo(undo)
              setCanRedo(redo)
            }}
            onClassesRestored={(restoredClasses) => {
              setClasses(restoredClasses)
            }}
            onLoadingChange={(isLoading) => {
              setIsLoadingGeoJSON(isLoading)
            }}
            onDataChange={() => {
              setHasUnsavedChanges(true)
            }}
            geotiffLayers={geotiffLayers}
            vectorLayers={vectorLayers}
            layers={layers}
            onCachedTileUsed={handleCachedTileUsed}
          />
          
          {/* Cached Tiles Indicator */}
          {usingCachedTiles && (
            <div style={{
              position: "absolute",
              bottom: "24px",
              left: "24px",
              background: "rgba(34, 139, 34, 0.9)",
              color: "white",
              padding: "8px 14px",
              borderRadius: "20px",
              fontSize: "12px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              animation: "fadeIn 0.2s ease-out",
              zIndex: 1000
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Using Offline Cache
            </div>
          )}
        </div>
        <PaintbrushSidebar
          classes={classes}
          setClasses={handleClassesChange}
          selectedClassId={selectedClassId}
          setSelectedClassId={setSelectedClassId}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          opacity={opacity}
          setOpacity={setOpacity}
          isLoadingGeoJSON={isLoadingGeoJSON}
          layers={layers}
          onLayersChange={setLayers}
          onAddGeotiff={handleLoadGeotiff}
          onAddVector={handleLoadVector}
          onZoomToLayer={handleZoomToLayer}
          onRemoveLayer={handleRemoveLayer}
        />
      </div>

      {/* Offline Downloader Modal */}
      <OfflineDownloader
        isOpen={showOfflineDownloader}
        onClose={() => setShowOfflineDownloader(false)}
        mapBounds={getMapBounds()}
        onDownloadComplete={handleOfflineDownloadComplete}
      />

      {/* Loading Overlay */}
      {isLoadingLayer && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999
        }}>
          <div style={{
            background: "white",
            borderRadius: "12px",
            padding: "32px 48px",
            textAlign: "center",
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
          }}>
            <div style={{
              width: "48px",
              height: "48px",
              border: "4px solid #e5e7eb",
              borderTopColor: "#4a6cf7",
              borderRadius: "50%",
              margin: "0 auto 16px",
              animation: "spin 1s linear infinite"
            }} />
            <div style={{ 
              fontSize: "16px", 
              fontWeight: 600, 
              color: "#1f2d3d",
              marginBottom: "8px"
            }}>
              Loading Layer
            </div>
            <div style={{ 
              fontSize: "14px", 
              color: "#6b7280" 
            }}>
              {loadingMessage}
            </div>
            <div style={{ 
              fontSize: "12px", 
              color: "#9ca3af",
              marginTop: "12px"
            }}>
              Large files may take a moment...
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

