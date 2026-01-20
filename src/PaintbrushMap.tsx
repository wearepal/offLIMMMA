import * as React from "react"
import { Map, View } from "ol"
import TileLayer from "ol/layer/Tile"
import VectorLayer from "ol/layer/Vector"
import OSM from "ol/source/OSM"
import XYZ from "ol/source/XYZ"
import VectorSource from "ol/source/Vector"
import { fromLonLat, toLonLat, transform } from "ol/proj"
import { Fill, Style, Stroke, Circle as CircleStyle } from "ol/style"
import { PaintClass, PaintStyle, ToolMode } from "./utils/types"
import Feature from "ol/Feature"
import LineString from "ol/geom/LineString"
import Point from "ol/geom/Point"
import Polygon from "ol/geom/Polygon"
import DragPan from "ol/interaction/DragPan"
import MapBrowserEvent from "ol/MapBrowserEvent"
import { unByKey } from "ol/Observable"
import GeoJSON from "ol/format/GeoJSON"
import { hexToRgba } from "./utils/utils"
import { mergeOverlappingPolygons } from "./utils/merge_utils"
import type { FeatureLike } from "ol/Feature"
import type Geometry from "ol/geom/Geometry"
import { getCachedTile } from "./OfflineDownloader"
import { GeoTIFFLayer } from "./utils/geotiff_utils"
import { VectorFileLayer } from "./utils/vector_utils"
import ImageLayer from "ol/layer/Image"
import OLVectorLayer from "ol/layer/Vector"
import { LayerInfo } from "./LayersPanel"

export type BoundingBox = {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
}

// Create render order function that uses current classes
const createRenderOrderFunction = (classes: PaintClass[]) => {
  return (feature1: FeatureLike, feature2: FeatureLike) => {
    const classId1 = (feature1 as Feature).get?.("classId")
    const classId2 = (feature2 as Feature).get?.("classId")
    const index1 = classId1 != null ? classes.findIndex(c => c.id === classId1) : -1
    const index2 = classId2 != null ? classes.findIndex(c => c.id === classId2) : -1
    return index2 - index1
  }
}

type PaintbrushMapProps = {
  activeTool: ToolMode
  paintStyle: PaintStyle
  selectedClass: PaintClass | null
  opacity: number
  classes: PaintClass[]
  onUndoRedoStateChange?: (canUndo: boolean, canRedo: boolean) => void
  geoJsonData?: string | null
  onClassesRestored?: (classes: PaintClass[]) => void
  onLoadingChange?: (isLoading: boolean) => void
  onDataChange?: () => void
  geotiffLayers?: GeoTIFFLayer[]
  vectorLayers?: VectorFileLayer[]
  layers?: LayerInfo[]
  onCachedTileUsed?: () => void
}

export type PaintbrushMapRef = {
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  exportGeoJSON: () => string | null
  clearAll?: () => void
  getBounds: () => BoundingBox | null
  refreshTiles: () => void
  fitToExtent: (extent: [number, number, number, number]) => void
}

export const PaintbrushMap = React.forwardRef<PaintbrushMapRef, PaintbrushMapProps>(
  ({ activeTool, paintStyle, selectedClass, opacity, classes, onUndoRedoStateChange, geoJsonData, onClassesRestored, onLoadingChange, onDataChange, geotiffLayers, vectorLayers, layers, onCachedTileUsed }, ref) => {
  const mapRef = React.useRef<HTMLDivElement>(null)
  const [map, setMap] = React.useState<Map | null>(null)
  const vectorSourceRef = React.useRef<VectorSource | null>(null)
  const dragPanInteractionsRef = React.useRef<DragPan[]>([])
  const isPaintingRef = React.useRef(false)
  const currentStrokeFeatureRef = React.useRef<Feature | null>(null)
  const currentStrokeCoordsRef = React.useRef<number[][]>([])
  const animationFrameRef = React.useRef<number | null>(null)
  const styleCacheRef = React.useRef<Record<string, Style>>({})
  const vectorLayerRef = React.useRef<VectorLayer<VectorSource> | null>(null)
  const tileLayerRef = React.useRef<TileLayer<any> | null>(null)
  const classesRef = React.useRef<PaintClass[]>(classes)
  const isDrawingPolygonRef = React.useRef(false)
  const polygonCoordsRef = React.useRef<number[][]>([])
  const polygonPointerCoordRef = React.useRef<number[] | null>(null)
  const polygonPreviewFeatureRef = React.useRef<Feature | null>(null)
  const snapIndicatorFeatureRef = React.useRef<Feature | null>(null)
  const TRANSIENT_KEY = "__transient"
  
  // Undo/Redo history
  const historyRef = React.useRef<any[]>([])
  const historyIndexRef = React.useRef<number>(-1)
  const maxHistorySize = 50
  const isRestoringStateRef = React.useRef(false)
  const geoJsonFormat = React.useRef<GeoJSON>(new GeoJSON())
  
  // Save current state to history
  const saveState = React.useCallback(() => {
    const source = vectorSourceRef.current
    if (!source || isRestoringStateRef.current) return
    
    const features = source.getFeatures().filter(feature => !feature.get(TRANSIENT_KEY))
    const state = features.map(feature => {
      const geometry = feature.getGeometry()
      if (!geometry) return null
      const geoJson = geoJsonFormat.current.writeFeatureObject(feature)
      return {
        geoJson,
        classId: feature.get("classId"),
        strokeColor: feature.get("strokeColor"),
        opacity: feature.get("opacity")
      }
    }).filter(f => f !== null)
    
    // Remove any future history if we're not at the end
    const currentIndex = historyIndexRef.current
    if (currentIndex < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, currentIndex + 1)
    }
    
    // Add new state
    historyRef.current.push(state)
    
    // Limit history size
    if (historyRef.current.length > maxHistorySize) {
      historyRef.current.shift()
    } else {
      historyIndexRef.current = historyRef.current.length - 1
    }
    
    // Notify parent of undo/redo state
    if (onUndoRedoStateChange) {
      onUndoRedoStateChange(
        historyIndexRef.current >= 0 || historyRef.current.length > 0,
        historyIndexRef.current < historyRef.current.length - 1
      )
    }
    
    // Notify parent of data change
    if (onDataChange) {
      onDataChange()
    }
  }, [onUndoRedoStateChange, onDataChange])
  
  // Restore state from history
  const restoreState = React.useCallback((state: any[]) => {
    const source = vectorSourceRef.current
    if (!source) return
    
    isRestoringStateRef.current = true
    source.clear()
    
    state.forEach(item => {
      try {
        const feature = geoJsonFormat.current.readFeature(item.geoJson, {
          dataProjection: 'EPSG:3857',
          featureProjection: 'EPSG:3857'
        }) as Feature<Geometry>
        feature.set("classId", item.classId)
        feature.set("strokeColor", item.strokeColor)
        feature.set("opacity", item.opacity)
        source.addFeature(feature)
      } catch (e) {
        console.warn("Failed to restore feature:", e)
      }
    })
    
    isRestoringStateRef.current = false
  }, [])
  
  // Undo function
  const undo = React.useCallback(() => {
    if (historyIndexRef.current < 0) return
    
    historyIndexRef.current--
    const state = historyIndexRef.current >= 0 ? historyRef.current[historyIndexRef.current] : []
    restoreState(state)
    
    if (onUndoRedoStateChange) {
      onUndoRedoStateChange(
        historyIndexRef.current >= 0 || historyRef.current.length > 0,
        historyIndexRef.current < historyRef.current.length - 1
      )
    }
  }, [restoreState, onUndoRedoStateChange])
  
  // Redo function
  const redo = React.useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    
    historyIndexRef.current++
    const state = historyRef.current[historyIndexRef.current]
    restoreState(state)
    
    if (onUndoRedoStateChange) {
      onUndoRedoStateChange(
        historyIndexRef.current >= 0 || historyRef.current.length > 0,
        historyIndexRef.current < historyRef.current.length - 1
      )
    }
  }, [restoreState, onUndoRedoStateChange])
  
  // Clear all features
  const clearAll = React.useCallback(() => {
    const source = vectorSourceRef.current
    if (!source) return
    source.clear()
    historyRef.current = [[]]
    historyIndexRef.current = 0
    if (onUndoRedoStateChange) {
      onUndoRedoStateChange(false, false)
    }
  }, [onUndoRedoStateChange])
  
  // Export features as GeoJSON
  const exportGeoJSON = React.useCallback((): string | null => {
    if (!vectorSourceRef.current || !geoJsonFormat.current) return null
    
    const features = vectorSourceRef.current.getFeatures().filter(feature => !feature.get(TRANSIENT_KEY))
    if (features.length === 0) return null
    
    // Create GeoJSON format configured for EPSG:3857 export
    // Both dataProjection and featureProjection set to 3857 means no transformation
    const exportFormat = new GeoJSON({
      dataProjection: 'EPSG:3857',
      featureProjection: 'EPSG:3857'
    })
    
    const geoJsonFeatures = features.map(feature => {
      const geometry = feature.getGeometry()
      if (!geometry) return null
      
      // Write feature in Web Mercator (EPSG:3857) - no transformation
      const geoJson = exportFormat.writeFeatureObject(feature)
      
      const classId = feature.get("classId")
      const paintClass = classesRef.current.find(c => c.id === classId)
      const classIndex = classesRef.current.findIndex(c => c.id === classId)
      
      geoJson.properties = {
        classId: classId,
        className: paintClass?.name || null,
        color: paintClass?.color || feature.get("strokeColor") || "#ff7f50",
        opacity: feature.get("opacity") ?? opacity,
        order: classIndex >= 0 ? classIndex : null
      }
      
      return geoJson
    }).filter(f => f !== null)
    
    const classesMetadata = classesRef.current.map((paintClass, index) => ({
      id: paintClass.id,
      name: paintClass.name,
      color: paintClass.color,
      order: index
    }))
    
    const featureCollection: any = {
      type: "FeatureCollection",
      crs: {
        type: "name",
        properties: {
          name: "EPSG:3857"
        }
      },
      metadata: {
        classes: classesMetadata,
        exportedAt: new Date().toISOString()
      },
      features: geoJsonFeatures
    }
    
    return JSON.stringify(featureCollection, null, 2)
  }, [opacity])
  
  // Expose methods via ref
  // Get current map bounds in lon/lat
  const getBounds = React.useCallback((): BoundingBox | null => {
    if (!map) return null
    const extent = map.getView().calculateExtent(map.getSize())
    const bottomLeft = toLonLat([extent[0], extent[1]])
    const topRight = toLonLat([extent[2], extent[3]])
    return {
      minLon: bottomLeft[0],
      minLat: bottomLeft[1],
      maxLon: topRight[0],
      maxLat: topRight[1]
    }
  }, [map])

  // Refresh tile layer (after downloading offline tiles)
  const refreshTiles = React.useCallback(() => {
    if (!map) return
    const layers = map.getLayers().getArray()
    const tileLayer = layers.find(layer => layer instanceof TileLayer) as TileLayer<any> | undefined
    if (tileLayer) {
      const source = tileLayer.getSource()
      if (source) {
        source.refresh()
      }
    }
  }, [map])

  // Fit map view to an extent
  const fitToExtent = React.useCallback((extent: [number, number, number, number]) => {
    if (!map) return
    map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 18 })
  }, [map])

  React.useImperativeHandle(ref, () => ({
    undo,
    redo,
    canUndo: () => historyIndexRef.current >= 0 || historyRef.current.length > 0,
    canRedo: () => historyIndexRef.current < historyRef.current.length - 1,
    exportGeoJSON,
    clearAll,
    getBounds,
    refreshTiles,
    fitToExtent
  }), [undo, redo, exportGeoJSON, clearAll, getBounds, refreshTiles, fitToExtent])
  
  // Keyboard shortcuts for undo/redo
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      }
      else if ((event.ctrlKey || event.metaKey) && (event.shiftKey && event.key === 'z' || event.key === 'y')) {
        event.preventDefault()
        redo()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])
  
  // Helper function to merge overlapping polygons
  const handleMergePolygons = (newPolygon: Polygon, classId: number): Feature[] => {
    if (!vectorSourceRef.current) return []
    
    return mergeOverlappingPolygons(newPolygon, classId, {
      vectorSource: vectorSourceRef.current,
      geoJsonFormat: geoJsonFormat.current,
      selectedClass,
      opacity
    })
  }
  
  // Update classes ref when classes prop changes
  React.useEffect(() => {
    classesRef.current = classes
  }, [classes])

  // Initialize map
  React.useEffect(() => {
    if (!mapRef.current) return

    // Get initial bounding box from command line args if provided
    const initialBbox = (window as any).initialBoundingBox
    console.log('PaintbrushMap: initialBoundingBox =', initialBbox)
    
    // Default center (world view)
    let defaultCenter = fromLonLat([0, 20])
    let defaultZoom = 3
    
    // Calculate center and zoom from bounding box if provided
    if (initialBbox) {
      const sourceEpsg = `EPSG:${initialBbox.epsg}`
      const targetEpsg = 'EPSG:3857' // Web Mercator (OpenLayers default)
      
      try {
        // Transform coordinates from source EPSG to Web Mercator
        const minCoord = transform([initialBbox.minX, initialBbox.minY], sourceEpsg, targetEpsg)
        const maxCoord = transform([initialBbox.maxX, initialBbox.maxY], sourceEpsg, targetEpsg)
        
        // Calculate center in Web Mercator
        defaultCenter = [
          (minCoord[0] + maxCoord[0]) / 2,
          (minCoord[1] + maxCoord[1]) / 2
        ] as [number, number]
        
        if (initialBbox.zoom !== undefined && initialBbox.zoom !== null) {
          defaultZoom = initialBbox.zoom
        }
      } catch (error) {
        console.warn('Failed to transform bounding box coordinates:', error)
        // Fall back to treating as WGS84 if transformation fails
        if (initialBbox.epsg === '4326') {
          const centerLon = (initialBbox.minX + initialBbox.maxX) / 2
          const centerLat = (initialBbox.minY + initialBbox.maxY) / 2
          defaultCenter = fromLonLat([centerLon, centerLat])
          if (initialBbox.zoom !== undefined && initialBbox.zoom !== null) {
            defaultZoom = initialBbox.zoom
          }
        }
      }
    }
    
    const vectorSource = new VectorSource()
    vectorSourceRef.current = vectorSource

    const vectorLayer = new VectorLayer({
      source: vectorSource,
      renderOrder: createRenderOrderFunction(classesRef.current) as any,
      style: (feature) => {
        const classId = feature.get("classId")
        const paintClass = classesRef.current.find(c => c.id === classId)
        const color = paintClass?.color || feature.get("strokeColor") || "#ff7f50"
        
        const strokeWidthPixels = 2
        const geometry = feature.getGeometry()
        
        const featureOpacity = feature.get("opacity") ?? opacity
        
        const opacityKey = Math.round(featureOpacity * 100) / 100
        const isPolygon = geometry instanceof Polygon
        const cacheKey = `${color}-${opacityKey}-${isPolygon ? 'poly' : 'line'}`
        
        if (!styleCacheRef.current[cacheKey]) {
          const styleConfig: { stroke: Stroke; fill?: Fill } = {
            stroke: new Stroke({
              color: hexToRgba(color, featureOpacity),
              width: strokeWidthPixels,
              lineCap: 'round',
              lineJoin: 'round'
            })
          }
          
          if (isPolygon) {
            styleConfig.fill = new Fill({
              color: hexToRgba(color, featureOpacity)
            })
          }
          
          styleCacheRef.current[cacheKey] = new Style(styleConfig)
        }
        
        return styleCacheRef.current[cacheKey]
      }
    })
    vectorLayerRef.current = vectorLayer

    // Create OSM source with custom tile load function for offline support
    const osmSource = new XYZ({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      maxZoom: 19,
      tileLoadFunction: (tile, src) => {
        const imageTile = tile as any
        const image = imageTile.getImage() as HTMLImageElement
        const urlParts = src.match(/(\d+)\/(\d+)\/(\d+)\.png/)
        
        if (urlParts) {
          const z = parseInt(urlParts[1])
          const x = parseInt(urlParts[2])
          const y = parseInt(urlParts[3])
          
          // Try to get cached tile first
          getCachedTile(z, x, y).then(cached => {
            if (cached) {
              image.src = cached
              onCachedTileUsed?.()
            } else {
              // Fall back to online
              image.src = src
            }
          }).catch(() => {
            image.src = src
          })
        } else {
          image.src = src
        }
      }
    })

    const tileLayer = new TileLayer({
      source: osmSource
    })
    tileLayerRef.current = tileLayer

    if (!mapRef.current) return
    
    const newMap = new Map({
      target: mapRef.current,
      layers: [
        tileLayer,
        vectorLayer
      ],
      view: new View({
        center: defaultCenter,
        zoom: defaultZoom
      })
    })

    setMap(newMap)
    
    // Fit to bounding box if provided (check immediately and after a delay for async setting)
    const fitToBbox = (bbox: any) => {
      if (!bbox) return
      
      setTimeout(() => {
        if (!newMap || !newMap.getView()) {
          console.log('Map not ready yet, retrying...')
          setTimeout(() => fitToBbox(bbox), 100)
          return
        }
        
        const sourceEpsg = `EPSG:${bbox.epsg}`
        const targetEpsg = 'EPSG:3857' // Web Mercator
        
        console.log('Attempting to fit map to bounding box:', bbox)
        
        try {
          // Transform coordinates from source EPSG to Web Mercator
          const minCoord = transform([bbox.minX, bbox.minY], sourceEpsg, targetEpsg)
          const maxCoord = transform([bbox.maxX, bbox.maxY], sourceEpsg, targetEpsg)
          
          // OpenLayers extent format: [minX, minY, maxX, maxY]
          const extent: [number, number, number, number] = [
            Math.min(minCoord[0], maxCoord[0]),
            Math.min(minCoord[1], maxCoord[1]),
            Math.max(minCoord[0], maxCoord[0]),
            Math.max(minCoord[1], maxCoord[1])
          ]
          
          const fitOptions: any = {
            padding: [50, 50, 50, 50],
            duration: 500
          }
          
          // If zoom is specified, constrain the fit to that zoom level
          if (bbox.zoom !== undefined && bbox.zoom !== null) {
            fitOptions.maxZoom = bbox.zoom
            fitOptions.minZoom = bbox.zoom
          }
          
          newMap.getView().fit(extent, fitOptions)
          console.log('Fit command executed')
        } catch (error) {
          console.error('Failed to transform bounding box for fit:', error)
          // Fall back to WGS84 if transformation fails
          if (bbox.epsg === '4326') {
            const minCoord = fromLonLat([bbox.minX, bbox.minY])
            const maxCoord = fromLonLat([bbox.maxX, bbox.maxY])
            
            const extent: [number, number, number, number] = [
              Math.min(minCoord[0], maxCoord[0]),
              Math.min(minCoord[1], maxCoord[1]),
              Math.max(minCoord[0], maxCoord[0]),
              Math.max(minCoord[1], maxCoord[1])
            ]
            
            const fitOptions: any = {
              padding: [50, 50, 50, 50],
              duration: 500
            }
            
            if (bbox.zoom !== undefined && bbox.zoom !== null) {
              fitOptions.maxZoom = bbox.zoom
              fitOptions.minZoom = bbox.zoom
            }
            
            newMap.getView().fit(extent, fitOptions)
          }
        }
      }, 300)
    }
    
    // Try to fit immediately if bbox is available
    if (initialBbox) {
      fitToBbox(initialBbox)
    } else {
      // Wait a bit for Electron to set it, then try again
      setTimeout(() => {
        const bbox = (window as any).initialBoundingBox
        if (bbox) {
          fitToBbox(bbox)
        }
      }, 500)
    }
    
    // Initialize history with empty state
    historyRef.current = [[]]
    historyIndexRef.current = 0

    return () => {
      if (newMap) {
        newMap.setTarget(undefined)
        newMap.dispose()
      }
      vectorSourceRef.current = null
    }
  }, [])

  // Track GeoJSON loading
  const geoJsonLoadedRef = React.useRef<string | null>(null)
  const isLoadingGeoJSONRef = React.useRef(false)
  const onClassesRestoredRef = React.useRef(onClassesRestored)
  const saveStateRef = React.useRef(saveState)
  const onLoadingChangeRef = React.useRef(onLoadingChange)

  React.useEffect(() => {
    onClassesRestoredRef.current = onClassesRestored
    saveStateRef.current = saveState
    onLoadingChangeRef.current = onLoadingChange
  }, [onClassesRestored, saveState, onLoadingChange])

  // Load GeoJSON when data is provided
  React.useEffect(() => {
    if (!geoJsonData || !vectorSourceRef.current || !geoJsonFormat.current || !map) return
    
    // Prevent loading the same data multiple times
    if (geoJsonLoadedRef.current === geoJsonData) {
      return
    }

    if (isLoadingGeoJSONRef.current) {
      return
    }

    const loadGeoJSON = async () => {
      try {
        isLoadingGeoJSONRef.current = true
        geoJsonLoadedRef.current = geoJsonData
        if (onLoadingChangeRef.current) {
          onLoadingChangeRef.current(true)
        }

        const geoJsonParsed = JSON.parse(geoJsonData)
        
        // Restore classes from metadata if present (always restore, even if classes already exist)
        if (geoJsonParsed.metadata?.classes && onClassesRestoredRef.current) {
          const restoredClasses: PaintClass[] = geoJsonParsed.metadata.classes
            .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
            .map((c: { id: number; name?: string; color?: string }) => ({
              id: Number(c.id),
              name: String(c.name || 'Unnamed Class'),
              color: String(c.color || '#ff7f50')
            }))
          
          if (restoredClasses.length > 0) {
            onClassesRestoredRef.current(restoredClasses)
          }
        }

        // Load features
        const features = geoJsonFormat.current.readFeatures(geoJsonParsed, {
          dataProjection: 'EPSG:3857',
          featureProjection: 'EPSG:3857'
        }) as Feature<Geometry>[]

        features.forEach(feature => {
          const props = feature.getProperties()
          if (props.classId) {
            feature.set("classId", props.classId)
          }
          if (props.color) {
            feature.set("strokeColor", props.color)
          }
          if (props.opacity !== undefined) {
            feature.set("opacity", props.opacity)
          }
        })

        if (vectorSourceRef.current) {
          vectorSourceRef.current.clear()
          vectorSourceRef.current.addFeatures(features as Feature<Geometry>[])
          
          // Fit view to features
          if (features.length > 0 && map) {
            const extent = vectorSourceRef.current.getExtent()
            map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 18 })
          }
          
          setTimeout(() => {
            if (saveStateRef.current) {
              saveStateRef.current()
            }
          }, 100)
        }
      } catch (error) {
        console.error('Error loading GeoJSON:', error)
        geoJsonLoadedRef.current = null
      } finally {
        isLoadingGeoJSONRef.current = false
        if (onLoadingChangeRef.current) {
          onLoadingChangeRef.current(false)
        }
      }
    }

    loadGeoJSON()
  }, [geoJsonData, map, classes.length])

  // Track previous classes for deletion handling
  const previousClassesRef = React.useRef<PaintClass[]>(classes)

  // Update styles when classes change
  React.useEffect(() => {
    if (!map || !vectorSourceRef.current) return
    
    const previousClasses = previousClassesRef.current
    const currentClassIds = new Set(classes.map(c => c.id))
    
    const deletedClassIds = previousClasses
      .filter(prevClass => !currentClassIds.has(prevClass.id))
      .map(prevClass => prevClass.id)
    
    if (deletedClassIds.length > 0) {
      const features = vectorSourceRef.current.getFeatures()
      const featuresToRemove = features.filter(feature => {
        const featureClassId = feature.get("classId")
        return featureClassId !== null && featureClassId !== undefined && deletedClassIds.includes(featureClassId)
      })
      
      featuresToRemove.forEach(feature => {
        vectorSourceRef.current?.removeFeature(feature)
      })
      
      if (featuresToRemove.length > 0) {
        saveState()
      }
    }
    
    classesRef.current = classes
    previousClassesRef.current = classes
    
    styleCacheRef.current = {}
    
    if (vectorLayerRef.current && vectorSourceRef.current) {
      (vectorLayerRef.current as any).setRenderOrder(createRenderOrderFunction(classes))
      vectorLayerRef.current.changed()
    }
  }, [map, classes, saveState])

  // Update opacity
  React.useEffect(() => {
    if (!map || !vectorSourceRef.current) return
    
    const features = vectorSourceRef.current.getFeatures()
    features.forEach(feature => {
      feature.set("opacity", opacity)
      feature.changed()
    })
    
    styleCacheRef.current = {}
    
    if (vectorLayerRef.current) {
      vectorLayerRef.current.changed()
    }
  }, [map, opacity])

  // Manage GeoTIFF layers
  const geotiffLayerRefsMap = React.useRef<globalThis.Map<string, ImageLayer<any>>>(new globalThis.Map())
  
  React.useEffect(() => {
    if (!map) return
    
    const currentLayerPaths = new Set(geotiffLayers?.map(l => l.filePath) || [])
    
    // Remove layers that are no longer in the list
    geotiffLayerRefsMap.current.forEach((layer: ImageLayer<any>, path: string) => {
      if (!currentLayerPaths.has(path)) {
        map.removeLayer(layer)
        geotiffLayerRefsMap.current.delete(path)
      }
    })
    
    // Add new layers
    geotiffLayers?.forEach(geotiffLayer => {
      if (!geotiffLayerRefsMap.current.has(geotiffLayer.filePath)) {
        // Insert GeoTIFF layer between tile layer and vector layer
        const mapLayers = map.getLayers()
        const vectorLayerIndex = mapLayers.getArray().findIndex(l => l === vectorLayerRef.current)
        if (vectorLayerIndex > 0) {
          mapLayers.insertAt(vectorLayerIndex, geotiffLayer.layer)
        } else {
          mapLayers.push(geotiffLayer.layer)
        }
        geotiffLayerRefsMap.current.set(geotiffLayer.filePath, geotiffLayer.layer)
      }
    })
  }, [map, geotiffLayers])

  // Manage vector layers
  const vectorLayerRefsMap = React.useRef<globalThis.Map<string, OLVectorLayer<any>>>(new globalThis.Map())
  
  React.useEffect(() => {
    if (!map) return
    
    const currentLayerPaths = new Set(vectorLayers?.map(l => l.filePath) || [])
    
    // Remove layers that are no longer in the list
    vectorLayerRefsMap.current.forEach((layer: OLVectorLayer<any>, path: string) => {
      if (!currentLayerPaths.has(path)) {
        map.removeLayer(layer)
        vectorLayerRefsMap.current.delete(path)
      }
    })
    
    // Add new layers
    vectorLayers?.forEach(vectorLayer => {
      if (!vectorLayerRefsMap.current.has(vectorLayer.filePath)) {
        // Insert vector layer between tile layer and annotation layer
        const mapLayers = map.getLayers()
        const annotationLayerIndex = mapLayers.getArray().findIndex(l => l === vectorLayerRef.current)
        if (annotationLayerIndex > 0) {
          mapLayers.insertAt(annotationLayerIndex, vectorLayer.layer)
        } else {
          mapLayers.push(vectorLayer.layer)
        }
        vectorLayerRefsMap.current.set(vectorLayer.filePath, vectorLayer.layer)
      }
    })
  }, [map, vectorLayers])

  // Manage all layers (OSM + GeoTIFFs + Vectors) based on layers prop
  React.useEffect(() => {
    if (!map || !layers) return
    
    const mapLayers = map.getLayers()
    
    // Update OSM layer
    const osmLayerInfo = layers.find(l => l.type === "osm")
    if (osmLayerInfo && tileLayerRef.current) {
      tileLayerRef.current.setOpacity(osmLayerInfo.opacity)
      tileLayerRef.current.setVisible(osmLayerInfo.visible)
    }
    
    // Update GeoTIFF layers opacity and visibility
    layers.filter(l => l.type === "geotiff").forEach(layerInfo => {
      const geotiffLayer = geotiffLayerRefsMap.current.get(layerInfo.filePath || "")
      if (geotiffLayer) {
        geotiffLayer.setOpacity(layerInfo.opacity)
        geotiffLayer.setVisible(layerInfo.visible)
      }
    })
    
    // Update Vector layers opacity and visibility
    layers.filter(l => l.type === "vector").forEach(layerInfo => {
      const vectorLayer = vectorLayerRefsMap.current.get(layerInfo.filePath || "")
      if (vectorLayer) {
        vectorLayer.setOpacity(layerInfo.opacity)
        vectorLayer.setVisible(layerInfo.visible)
      }
    })
    
    // Reorder layers based on layers array order
    // layers array is top-to-bottom (first = top), but OpenLayers is bottom-to-top
    
    const reversedLayers = [...layers].reverse() // Now bottom-to-top
    let zIndex = 0
    
    reversedLayers.forEach(layerInfo => {
      if (layerInfo.type === "osm" && tileLayerRef.current) {
        tileLayerRef.current.setZIndex(zIndex++)
      } else if (layerInfo.type === "geotiff" && layerInfo.filePath) {
        const geotiffLayer = geotiffLayerRefsMap.current.get(layerInfo.filePath)
        if (geotiffLayer) {
          geotiffLayer.setZIndex(zIndex++)
        }
      } else if (layerInfo.type === "vector" && layerInfo.filePath) {
        const vectorLayer = vectorLayerRefsMap.current.get(layerInfo.filePath)
        if (vectorLayer) {
          vectorLayer.setZIndex(zIndex++)
        }
      }
    })
    
    // Vector layer always on top
    if (vectorLayerRef.current) {
      vectorLayerRef.current.setZIndex(zIndex + 100)
    }
  }, [map, layers])

  // Manage drag pan interactions
  React.useEffect(() => {
    if (!map) return
    const dragPans = map
      .getInteractions()
      .getArray()
      .filter((interaction): interaction is DragPan => interaction instanceof DragPan)
    dragPanInteractionsRef.current = dragPans
  }, [map])

  React.useEffect(() => {
    dragPanInteractionsRef.current.forEach(interaction =>
      interaction.setActive(!(activeTool === ToolMode.Paint && selectedClass) && activeTool !== ToolMode.Erase)
    )
  }, [activeTool, selectedClass])

  // Update cursor based on tool
  React.useEffect(() => {
    if (!map) return
    const viewport = map.getViewport()
    if (viewport) {
      if (activeTool === ToolMode.Paint) {
        viewport.style.cursor = "crosshair"
      } else if (activeTool === ToolMode.Erase) {
        viewport.style.cursor = "pointer"
      } else {
        viewport.style.cursor = ""
      }
    }
  }, [map, activeTool])

  // Paint functionality
  React.useEffect(() => {
    if (!map || !vectorSourceRef.current) return
    if (activeTool !== ToolMode.Paint || !selectedClass) {
      isPaintingRef.current = false
      if (currentStrokeFeatureRef.current) {
        vectorSourceRef.current.removeFeature(currentStrokeFeatureRef.current)
        currentStrokeFeatureRef.current = null
        currentStrokeCoordsRef.current = []
      }
      // Cancel polygon drawing state too
      isDrawingPolygonRef.current = false
      polygonCoordsRef.current = []
      if (polygonPreviewFeatureRef.current) {
        vectorSourceRef.current.removeFeature(polygonPreviewFeatureRef.current)
        polygonPreviewFeatureRef.current = null
      }
      return
    }

    const source = vectorSourceRef.current

    const setSnapIndicator = (coordinate: number[] | null) => {
      if (!source) return
      if (!coordinate) {
        if (snapIndicatorFeatureRef.current) {
          source.removeFeature(snapIndicatorFeatureRef.current)
          snapIndicatorFeatureRef.current = null
        }
        return
      }

      if (!snapIndicatorFeatureRef.current) {
        const feature = new Feature({
          geometry: new Point(coordinate)
        })
        feature.set(TRANSIENT_KEY, true)
        feature.setStyle(new Style({
          image: new CircleStyle({
            radius: 4,
            fill: new Fill({ color: "#22c55e" }),
            stroke: new Stroke({ color: "#ffffff", width: 2 })
          })
        }))
        snapIndicatorFeatureRef.current = feature
        source.addFeature(feature)
      } else {
        const geom = snapIndicatorFeatureRef.current.getGeometry()
        if (geom instanceof Point) {
          geom.setCoordinates(coordinate)
        } else {
          snapIndicatorFeatureRef.current.setGeometry(new Point(coordinate))
        }
      }
    }

    const cancelPolygon = () => {
      isDrawingPolygonRef.current = false
      polygonCoordsRef.current = []
      polygonPointerCoordRef.current = null
      if (polygonPreviewFeatureRef.current) {
        source.removeFeature(polygonPreviewFeatureRef.current)
        polygonPreviewFeatureRef.current = null
      }
      setSnapIndicator(null)
    }

    const commitPolygon = () => {
      if (!selectedClass) return
      const coords = polygonCoordsRef.current
      if (coords.length < 3) return

      const closedCoords = [...coords]
      const first = coords[0]
      const last = coords[coords.length - 1]
      const isAlreadyClosed = first[0] === last[0] && first[1] === last[1]
      if (!isAlreadyClosed) {
        closedCoords.push([first[0], first[1]])
      }

      let polygon = new Polygon([closedCoords])

      // Make boundaries flush (no overlap, no gap) across zoom levels:
      // do boolean ops with a fixed precision model (EPSG:3857 units) instead of a zoom-based buffer.
      try {
        const jsts = (window as any).jsts
        if (jsts?.io?.GeoJSONReader && jsts?.io?.GeoJSONWriter) {
          const jstsReader = new jsts.io.GeoJSONReader()
          const jstsWriter = new jsts.io.GeoJSONWriter()

          // Use a fixed precision grid in meters (Web Mercator units).
          // 1e6 => 1 micrometer grid; effectively "flush" for mapping purposes.
          const precisionScale = 1e6
          const reducer =
            jsts?.precision?.GeometryPrecisionReducer && jsts?.geom?.PrecisionModel
              ? new jsts.precision.GeometryPrecisionReducer(new jsts.geom.PrecisionModel(precisionScale))
              : null
          if (reducer) {
            reducer.setChangePrecisionModel(true)
            reducer.setRemoveCollapsedComponents(true)
          }

          const newPolyGeo = geoJsonFormat.current.writeGeometryObject(polygon)
          let newJstsGeom = jstsReader.read(newPolyGeo)
          try { newJstsGeom = newJstsGeom.buffer(0) } catch {}
          if (reducer) {
            try { newJstsGeom = reducer.reduce(newJstsGeom) } catch {}
          }

          // subtract every other-class polygon that intersects/touches
          const others = source.getFeatures().filter(f => {
            if (f.get(TRANSIENT_KEY)) return false
            const classId = f.get("classId")
            if (classId == null || classId === selectedClass.id) return false
            const g = f.getGeometry()
            return g instanceof Polygon
          })

          for (const f of others) {
            const g = f.getGeometry() as Polygon
            const otherGeo = geoJsonFormat.current.writeGeometryObject(g)
            let otherJsts = jstsReader.read(otherGeo)
            try { otherJsts = otherJsts.buffer(0) } catch {}
            if (reducer) {
              try { otherJsts = reducer.reduce(otherJsts) } catch {}
            }

            // only subtract if nearby/intersecting
            if (newJstsGeom.intersects(otherJsts) || newJstsGeom.touches(otherJsts)) {
              try {
                const diff = newJstsGeom.difference(otherJsts)
                newJstsGeom = diff
                try { newJstsGeom = newJstsGeom.buffer(0) } catch {}
                if (reducer) {
                  try { newJstsGeom = reducer.reduce(newJstsGeom) } catch {}
                }
              } catch {
                // ignore failures, keep current geometry
              }
            }
          }

          const trimmedGeo = jstsWriter.write(newJstsGeom)
          const trimmedOl = geoJsonFormat.current.readGeometry(trimmedGeo, {
            dataProjection: 'EPSG:3857',
            featureProjection: 'EPSG:3857'
          }) as Polygon
          if (trimmedOl) {
            polygon = trimmedOl
          }
        }
      } catch (e) {
        // If JSTS isn't available or something fails, just keep the original polygon.
      }

      // Remove preview feature if present
      if (polygonPreviewFeatureRef.current) {
        source.removeFeature(polygonPreviewFeatureRef.current)
        polygonPreviewFeatureRef.current = null
      }

      const mergedFeatures = handleMergePolygons(polygon, selectedClass.id)
      if (mergedFeatures.length > 0) {
        mergedFeatures.forEach(f => source.addFeature(f))
      } else {
        const feature = new Feature({ geometry: polygon })
        feature.set("strokeColor", selectedClass.color)
        feature.set("opacity", opacity)
        feature.set("classId", selectedClass.id)
        source.addFeature(feature)
      }

      cancelPolygon()
      saveState()
    }

    // Polygon (click-to-vertex) paint style
    if (paintStyle === PaintStyle.Polygon) {
      const updatePreview = () => {
        if (!selectedClass) return
        const coords = polygonCoordsRef.current
        if (coords.length === 0) return

        // Show the polygon outline while drawing; only fill once committed.
        // Use a "rubber band" segment to the current pointer position.
        const pointerCoord = polygonPointerCoordRef.current
        const lineCoords =
          pointerCoord && isDrawingPolygonRef.current
            ? [...coords, pointerCoord]
            : coords
        const geometry = new LineString(lineCoords)

        if (!polygonPreviewFeatureRef.current) {
          const feature = new Feature({ geometry })
          feature.set("strokeColor", selectedClass.color)
          feature.set("opacity", opacity)
          feature.set("classId", selectedClass.id)
          polygonPreviewFeatureRef.current = feature
          source.addFeature(feature)
        } else {
          polygonPreviewFeatureRef.current.setGeometry(geometry)
        }
      }

      const isCloseToFirstVertex = (coordinate: number[]) => {
        const coords = polygonCoordsRef.current
        if (coords.length < 3) return false
        const first = coords[0]
        const firstPx = map.getPixelFromCoordinate(first)
        const curPx = map.getPixelFromCoordinate(coordinate)
        const dx = firstPx[0] - curPx[0]
        const dy = firstPx[1] - curPx[1]
        const dist = Math.hypot(dx, dy)
        return dist <= 10 // pixels
      }

      const snapToBoundary = (coordinate: number[]): number[] => {
        if (!selectedClass || !vectorSourceRef.current) return coordinate
        
        const resolution = map.getView().getResolution() || 1

        // Get all existing polygon features with different classId
        const existingFeatures = vectorSourceRef.current.getFeatures().filter(feature => {
          const featureClassId = feature.get("classId")
          const geometry = feature.getGeometry()
          return featureClassId !== null && 
                 featureClassId !== undefined && 
                 featureClassId !== selectedClass.id && 
                 geometry instanceof Polygon
        })

        // Context-sensitive snapping:
        // - If cursor is *inside* another-class polygon: allow longer snap range (30px)
        // - If cursor is *outside*: smaller snap range (5px)
        const isInsideOtherClass = existingFeatures.some(feature => {
          const geometry = feature.getGeometry()
          return geometry instanceof Polygon && geometry.intersectsCoordinate(coordinate)
        })
        const snapTolerancePixels = isInsideOtherClass ? 35 : 10
        const snapTolerance = resolution * snapTolerancePixels // pixels -> map units
        
        if (existingFeatures.length === 0) return coordinate
        
        let closestPoint: number[] | null = null
        let closestDistance = Infinity
        let closestBoundaryCoords: number[][] | null = null
        
        // Check each polygon boundary
        existingFeatures.forEach(feature => {
          const geometry = feature.getGeometry() as Polygon
          const exteriorRing = geometry.getLinearRing(0) // Get exterior ring
          if (!exteriorRing) return
          
          // Convert LinearRing to LineString for easier manipulation
          const ringCoords = exteriorRing.getCoordinates() as number[][]
          const boundaryLine = new LineString(ringCoords)
          
          // Get the closest point on the boundary to the current coordinate
          const closestOnBoundary = boundaryLine.getClosestPoint(coordinate)
          const distance = Math.sqrt(
            Math.pow(closestOnBoundary[0] - coordinate[0], 2) + 
            Math.pow(closestOnBoundary[1] - coordinate[1], 2)
          )
          
          if (distance < snapTolerance && distance < closestDistance) {
            closestDistance = distance
            closestPoint = closestOnBoundary
            closestBoundaryCoords = ringCoords
          }
        })
        
        // If we found a close boundary, snap to it and trace along it
        if (closestPoint && closestBoundaryCoords) {
          const boundaryCoords: number[][] = closestBoundaryCoords
          
          // Find the segment we're closest to
          let bestSegmentIndex = 0
          let bestSegmentDistance = Infinity
          let bestPointOnSegment: number[] | null = null
          
          for (let i = 0; i < boundaryCoords.length - 1; i++) {
            const segStart = boundaryCoords[i]
            const segEnd = boundaryCoords[i + 1]
            const segLine = new LineString([segStart, segEnd])
            const closestOnSeg = segLine.getClosestPoint(coordinate)
            const segDist = Math.sqrt(
              Math.pow(closestOnSeg[0] - coordinate[0], 2) + 
              Math.pow(closestOnSeg[1] - coordinate[1], 2)
            )
            
            if (segDist < bestSegmentDistance) {
              bestSegmentDistance = segDist
              bestSegmentIndex = i
              bestPointOnSegment = closestOnSeg
            }
          }
          
          // If we're very close to a segment, snap to the closest point on that segment
          // This allows tracing along the boundary
          if (bestSegmentDistance < snapTolerance && bestPointOnSegment) {
            setSnapIndicator(bestPointOnSegment)
            return bestPointOnSegment
          }
          
          setSnapIndicator(closestPoint)
          return closestPoint
        }
        
        setSnapIndicator(null)
        return coordinate
      }

      const handleClick = (event: MapBrowserEvent<UIEvent>) => {
        // Click to add vertex; clicking near the first vertex closes & commits (fills).
        // Snap to boundary if near one
        const snappedCoord = snapToBoundary(event.coordinate)
        
        if (isDrawingPolygonRef.current && isCloseToFirstVertex(snappedCoord)) {
          commitPolygon()
        } else {
          isDrawingPolygonRef.current = true
          polygonCoordsRef.current = [...polygonCoordsRef.current, snappedCoord]
          polygonPointerCoordRef.current = snappedCoord
          updatePreview()
        }
        // Once the vertex is placed, hide the snap dot until we snap again
        setSnapIndicator(null)
        event.preventDefault()
        event.stopPropagation()
      }

      const handlePointerMove = (event: MapBrowserEvent<UIEvent>) => {
        if (!isDrawingPolygonRef.current) return
        const snappedCoord = snapToBoundary(event.coordinate)
        polygonPointerCoordRef.current = snappedCoord
        updatePreview()
      }

      const handleDblClick = (event: MapBrowserEvent<UIEvent>) => {
        // Finish polygon on double click
        if (!isDrawingPolygonRef.current) return
        event.preventDefault()
        event.stopPropagation()
        commitPolygon()
      }

      const handleKeyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement
        if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
        if (activeTool !== ToolMode.Paint) return

        if (event.key === 'Escape') {
          event.preventDefault()
          cancelPolygon()
          return
        }

        if (event.key === 'Backspace') {
          if (!isDrawingPolygonRef.current) return
          event.preventDefault()
          polygonCoordsRef.current = polygonCoordsRef.current.slice(0, -1)
          if (polygonCoordsRef.current.length === 0) {
            cancelPolygon()
          } else {
            polygonPointerCoordRef.current = polygonCoordsRef.current[polygonCoordsRef.current.length - 1] ?? null
            updatePreview()
          }
          return
        }

        if (event.key === 'Enter') {
          if (!isDrawingPolygonRef.current) return
          event.preventDefault()
          commitPolygon()
        }
      }

      const clickKey = map.on("click" as any, handleClick)
      const pointerMoveKey = map.on("pointermove" as any, handlePointerMove)
      const dblClickKey = map.on("dblclick" as any, handleDblClick)
      window.addEventListener('keydown', handleKeyDown)

      return () => {
        unByKey(clickKey)
        unByKey(pointerMoveKey)
        unByKey(dblClickKey)
        window.removeEventListener('keydown', handleKeyDown)
        cancelPolygon()
      }
    }

    // Freehand (existing drag brush) paint style
    const getResolution = () => map.getView().getResolution() || 1

    const mapDistance = (coord1: number[], coord2: number[]): number => {
      const dx = coord1[0] - coord2[0]
      const dy = coord1[1] - coord2[1]
      return Math.hypot(dx, dy)
    }

    const updateStroke = (coordinate: number[]) => {
      if (!vectorSourceRef.current || !selectedClass) return
      
      const resolution = getResolution()
      const minDistancePixels = 3 // minimum screen pixels between points
      const minDistanceMapUnits = minDistancePixels * resolution
      
      const coords = currentStrokeCoordsRef.current
      if (coords.length > 0) {
        const lastCoord = coords[coords.length - 1]
        const dist = mapDistance(lastCoord, coordinate)
        if (dist < minDistanceMapUnits) {
          return
        }
      }
      
      currentStrokeCoordsRef.current.push(coordinate)
      
      if (!currentStrokeFeatureRef.current) {
        const lineString = new LineString([coordinate])
        const feature = new Feature({
          geometry: lineString
        })
        feature.set("strokeColor", selectedClass.color)
        feature.set("opacity", opacity)
        feature.set("classId", selectedClass.id)
        currentStrokeFeatureRef.current = feature
        vectorSourceRef.current.addFeature(feature)
      } else {
        const geometry = currentStrokeFeatureRef.current.getGeometry() as LineString
        geometry.setCoordinates(currentStrokeCoordsRef.current)
      }
    }

    const scheduleUpdate = () => {
      if (animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(() => {
          animationFrameRef.current = null
        })
      }
    }

    const handlePointerDown = (event: MapBrowserEvent<UIEvent>) => {
      isPaintingRef.current = true
      currentStrokeCoordsRef.current = []
      currentStrokeFeatureRef.current = null
      updateStroke(event.coordinate)
      event.preventDefault()
      event.stopPropagation()
    }

    const handlePointerMove = (event: MapBrowserEvent<UIEvent>) => {
      if (!isPaintingRef.current || (event.originalEvent instanceof MouseEvent && event.originalEvent.buttons !== 1)) {
        return
      }
      updateStroke(event.coordinate)
      scheduleUpdate()
      event.preventDefault()
      event.stopPropagation()
    }

    const handlePointerUp = () => {
      isPaintingRef.current = false
      
      if (currentStrokeFeatureRef.current && currentStrokeCoordsRef.current.length >= 3) {
        const coords = currentStrokeCoordsRef.current
        const closedCoords = [...coords]
        const first = coords[0]
        const last = coords[coords.length - 1]
        
        const isAlreadyClosed = first[0] === last[0] && first[1] === last[1]
        
        if (!isAlreadyClosed) {
          closedCoords.push([first[0], first[1]])
        }
        
        const polygon = new Polygon([closedCoords])
        const feature = currentStrokeFeatureRef.current
        const classId = feature.get("classId")
        
        vectorSourceRef.current?.removeFeature(feature)
        
        const mergedFeatures = handleMergePolygons(polygon, classId)
        
        if (mergedFeatures.length > 0) {
          mergedFeatures.forEach(mergedFeature => {
            vectorSourceRef.current?.addFeature(mergedFeature)
          })
        } else {
          feature.setGeometry(polygon)
          vectorSourceRef.current?.addFeature(feature)
        }
        
        saveState()
      } else if (currentStrokeFeatureRef.current && currentStrokeCoordsRef.current.length < 3) {
        vectorSourceRef.current?.removeFeature(currentStrokeFeatureRef.current)
      }
      
      currentStrokeFeatureRef.current = null
      currentStrokeCoordsRef.current = []
    }

    const pointerDownKey = map.on("pointerdown" as any, handlePointerDown)
    const pointerDragKey = map.on("pointerdrag" as any, handlePointerMove)
    const pointerUpKey = map.on("pointerup" as any, handlePointerUp)

    return () => {
      isPaintingRef.current = false
      if (currentStrokeFeatureRef.current) {
        currentStrokeFeatureRef.current = null
      }
      currentStrokeCoordsRef.current = []
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      unByKey(pointerDownKey)
      unByKey(pointerDragKey)
      unByKey(pointerUpKey)
    }
  }, [map, activeTool, paintStyle, selectedClass, opacity, saveState])

  // Erase functionality
  React.useEffect(() => {
    if (!map || !vectorSourceRef.current) return
    if (activeTool !== ToolMode.Erase) return

    const handleClick = (event: MapBrowserEvent<UIEvent>) => {
      if (!vectorSourceRef.current) return
      
      const features = map.getFeaturesAtPixel(event.pixel, {
        hitTolerance: 5
      })
      
      if (features && features.length > 0) {
        const actualFeatures = (features.filter(f => f instanceof Feature) as Feature[])
          .filter(f => !(f as Feature).get?.(TRANSIENT_KEY))
        
        if (actualFeatures.length > 0) {
          const featureToRemove = actualFeatures[0]
          vectorSourceRef.current.removeFeature(featureToRemove)
          saveState()
        }
      }
      
      event.preventDefault()
      event.stopPropagation()
    }

    const clickKey = map.on("click" as any, handleClick)

    return () => {
      unByKey(clickKey)
    }
  }, [map, activeTool, saveState])

  // Pan the map in a direction
  const panMap = React.useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (!map) return
    const view = map.getView()
    const center = view.getCenter()
    if (!center) return
    
    const resolution = view.getResolution() || 1
    const panDistance = resolution * 100 // Pan by 100 pixels worth
    
    let newCenter: [number, number]
    switch (direction) {
      case 'up':
        newCenter = [center[0], center[1] + panDistance]
        break
      case 'down':
        newCenter = [center[0], center[1] - panDistance]
        break
      case 'left':
        newCenter = [center[0] - panDistance, center[1]]
        break
      case 'right':
        newCenter = [center[0] + panDistance, center[1]]
        break
    }
    
    view.animate({
      center: newCenter,
      duration: 150
    })
  }, [map])

  // Keyboard arrow key navigation
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault()
          panMap('up')
          break
        case 'ArrowDown':
          event.preventDefault()
          panMap('down')
          break
        case 'ArrowLeft':
          event.preventDefault()
          panMap('left')
          break
        case 'ArrowRight':
          event.preventDefault()
          panMap('right')
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [panMap])

  const ArrowButton: React.FC<{ direction: 'up' | 'down' | 'left' | 'right'; style?: React.CSSProperties }> = ({ direction, style }) => {
    const arrows = {
      up: 'M12 19V5M5 12l7-7 7 7',
      down: 'M12 5v14M5 12l7 7 7-7',
      left: 'M19 12H5M12 5l-7 7 7 7',
      right: 'M5 12h14M12 5l7 7-7 7'
    }
    
    return (
      <button
        onClick={() => panMap(direction)}
        style={{
          width: '32px',
          height: '32px',
          border: 'none',
          borderRadius: '6px',
          background: 'white',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          transition: 'background 0.15s',
          ...style
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#f0f0f0'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={arrows[direction]} />
        </svg>
      </button>
    )
  }

  return (
    <div style={{ 
      width: "100%", 
      height: "100%", 
      minHeight: 0, 
      minWidth: 0,
      borderRadius: "8px",
      overflow: "hidden",
      border: "1px solid #dfe4f4",
      position: "relative"
    }}>
      <div style={{ width: "100%", height: "100%", minHeight: 0 }} ref={mapRef} />
      
      {/* Arrow Navigation Controls */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 32px)',
        gridTemplateRows: 'repeat(3, 32px)',
        gap: '4px',
        zIndex: 100
      }}>
        <div /> {/* Empty top-left */}
        <ArrowButton direction="up" />
        <div /> {/* Empty top-right */}
        <ArrowButton direction="left" />
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '6px',
          background: 'white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <ArrowButton direction="right" />
        <div /> {/* Empty bottom-left */}
        <ArrowButton direction="down" />
        <div /> {/* Empty bottom-right */}
      </div>
    </div>
  )
})

PaintbrushMap.displayName = "PaintbrushMap"

