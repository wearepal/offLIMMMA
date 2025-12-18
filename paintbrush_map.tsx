import * as React from "react"
import { Map, View } from "ol"
import TileLayer from "ol/layer/Tile"
import VectorLayer from "ol/layer/Vector"
import OSM from "ol/source/OSM"
import VectorSource from "ol/source/Vector"
import { fromLonLat } from "ol/proj"
import { Fill, Style, Stroke } from "ol/style"
import { PaintClass, ToolMode } from "./utils/types"
import Feature from "ol/Feature"
import LineString from "ol/geom/LineString"
import Polygon from "ol/geom/Polygon"
import DragPan from "ol/interaction/DragPan"
import MapBrowserEvent from "ol/MapBrowserEvent"
import { unByKey } from "ol/Observable"
import GeoJSON from "ol/format/GeoJSON"
import { hexToRgba, createRenderOrderFunction } from "./utils/utils"
import { mergeOverlappingPolygons } from "./utils/merge_utils"

type PaintbrushMapProps = {
  activeTool: ToolMode
  selectedClass: PaintClass | null
  opacity: number
  classes: PaintClass[]
  onUndoRedoStateChange?: (canUndo: boolean, canRedo: boolean) => void
  geojsonUrl?: string
  onClassesRestored?: (classes: PaintClass[]) => void
  onLoadingChange?: (isLoading: boolean) => void
}

export type PaintbrushMapRef = {
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  exportGeoJSON: () => string | null
}

export const PaintbrushMap = React.forwardRef<PaintbrushMapRef, PaintbrushMapProps>(
  ({ activeTool, selectedClass, opacity, classes, onUndoRedoStateChange, geojsonUrl, onClassesRestored, onLoadingChange }, ref) => {
  const mapRef = React.useRef<HTMLDivElement>()
  const [map, setMap] = React.useState<Map | null>(null)
  const vectorSourceRef = React.useRef<VectorSource | null>(null)
  const dragPanInteractionsRef = React.useRef<DragPan[]>([])
  const isPaintingRef = React.useRef(false)
  const currentStrokeFeatureRef = React.useRef<Feature | null>(null)
  const currentStrokeCoordsRef = React.useRef<number[][]>([])
  const animationFrameRef = React.useRef<number | null>(null)
  const styleCacheRef = React.useRef<Record<string, Style>>({})
  const vectorLayerRef = React.useRef<VectorLayer<VectorSource> | null>(null)
  const classesRef = React.useRef<PaintClass[]>(classes)
  
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
    
    const features = source.getFeatures()
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
  }, [onUndoRedoStateChange])
  
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
        })
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
    // Allow undoing from index 0 back to -1 (empty state)
    if (historyIndexRef.current < 0) return
    
    historyIndexRef.current--
    // If we're at -1, restore empty state, otherwise restore from history
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
  
  // Export features as GeoJSON
  const exportGeoJSON = React.useCallback((): string | null => {
    if (!vectorSourceRef.current || !geoJsonFormat.current) return null
    
    const features = vectorSourceRef.current.getFeatures()
    if (features.length === 0) return null
    
    // Convert features to GeoJSON FeatureCollection
    const geoJsonFeatures = features.map(feature => {
      const geometry = feature.getGeometry()
      if (!geometry) return null
      
      const geoJson = geoJsonFormat.current.writeFeatureObject(feature)
      
      // Add class metadata to properties
      const classId = feature.get("classId")
      const paintClass = classesRef.current.find(c => c.id === classId)
      const classIndex = classesRef.current.findIndex(c => c.id === classId)
      
      geoJson.properties = {
        classId: classId,
        className: paintClass?.name || null,
        color: paintClass?.color || feature.get("strokeColor") || "#ff7f50",
        opacity: feature.get("opacity") ?? opacity,
        order: classIndex >= 0 ? classIndex : null // Attach order directly to feature
      }
      
      return geoJson
    }).filter(f => f !== null)
    
    // Include class ordering information in metadata
    const classesMetadata = classesRef.current.map((paintClass, index) => ({
      id: paintClass.id,
      name: paintClass.name,
      color: paintClass.color,
      order: index // Save the order/index for render ordering
    }))
    
    const featureCollection = {
      type: "FeatureCollection",
      metadata: {
        classes: classesMetadata,
        exportedAt: new Date().toISOString()
      },
      features: geoJsonFeatures
    }
    
    return JSON.stringify(featureCollection, null, 2)
  }, [opacity])
  
  // Expose undo/redo and export via ref
  React.useImperativeHandle(ref, () => ({
    undo,
    redo,
    canUndo: () => historyIndexRef.current >= 0 || historyRef.current.length > 0,
    canRedo: () => historyIndexRef.current < historyRef.current.length - 1,
    exportGeoJSON
  }), [undo, redo, exportGeoJSON])
  
  // Keyboard shortcuts for undo/redo
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if we're in a text input/textarea
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      
      // Ctrl+Z or Cmd+Z for undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      }
      // Ctrl+Shift+Z or Ctrl+Y or Cmd+Shift+Z for redo
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
    console.log('Classes ref updated:', classes.map(c => ({ id: c.id, name: c.name, color: c.color })))
  }, [classes])

  React.useEffect(() => {
    if (!mapRef.current) return

    // Indonesia center: approximately 120°E, -2°S
    const indonesiaCenter = fromLonLat([120, -2])
    const vectorSource = new VectorSource()
    vectorSourceRef.current = vectorSource

    const vectorLayer = new VectorLayer({
          source: vectorSource,
          renderOrder: createRenderOrderFunction(classesRef.current),
          style: (feature, resolution) => {
            // Look up the current class color based on classId stored in the feature
            // Use ref to access current classes array
            const classId = feature.get("classId")
            const paintClass = classesRef.current.find(c => c.id === classId)
            const color = paintClass?.color || feature.get("strokeColor") || "#ff7f50"
            
            // Use fixed stroke width (2 pixels)
            const strokeWidthPixels = 2
            const geometry = feature.getGeometry()
            
            // Get opacity from feature or use default
            const featureOpacity = feature.get("opacity") ?? opacity
            
            // Use style cache keyed by color and opacity
            const opacityKey = Math.round(featureOpacity * 100) / 100 // Round to 0.01 precision
            const isPolygon = geometry instanceof Polygon
            const cacheKey = `${color}-${opacityKey}-${isPolygon ? 'poly' : 'line'}`
            
            if (!styleCacheRef.current[cacheKey]) {
              const styleConfig: any = {
                stroke: new Stroke({
                  color: hexToRgba(color, featureOpacity),
                  width: strokeWidthPixels,
                  lineCap: 'round',
                  lineJoin: 'round'
                })
              }
              
              // Add fill for polygons with opacity
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

    const newMap = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new OSM()
        }),
        vectorLayer
      ],
      view: new View({
        center: indonesiaCenter,
        zoom: 5
      })
    })

    setMap(newMap)
    
    // Initialize history with empty state so we can undo the first shape
    historyRef.current = [[]]
    historyIndexRef.current = 0

    return () => {
      newMap.setTarget(undefined)
      newMap.dispose()
      vectorSourceRef.current = null
    }
  }, [])

  // Track if GeoJSON has been loaded to prevent duplicate loads
  const geojsonLoadedRef = React.useRef<string | null>(null)
  const isLoadingGeoJSONRef = React.useRef(false)
  const onClassesRestoredRef = React.useRef(onClassesRestored)
  const saveStateRef = React.useRef(saveState)
  const onLoadingChangeRef = React.useRef(onLoadingChange)

  // Update refs when callbacks change
  React.useEffect(() => {
    onClassesRestoredRef.current = onClassesRestored
    saveStateRef.current = saveState
    onLoadingChangeRef.current = onLoadingChange
  }, [onClassesRestored, saveState, onLoadingChange])

  // Load GeoJSON when URL is provided
  React.useEffect(() => {
    if (!geojsonUrl || !vectorSourceRef.current || !geoJsonFormat.current || !map) return
    
    // Prevent loading the same GeoJSON multiple times
    if (geojsonLoadedRef.current === geojsonUrl) {
      console.log('GeoJSON already loaded, skipping:', geojsonUrl)
      return
    }

    // Prevent concurrent loads
    if (isLoadingGeoJSONRef.current) {
      console.log('GeoJSON load already in progress, skipping')
      return
    }

    const loadGeoJSON = async () => {
      try {
        // Mark as loading
        isLoadingGeoJSONRef.current = true
        geojsonLoadedRef.current = geojsonUrl
        if (onLoadingChangeRef.current) {
          onLoadingChangeRef.current(true)
        }
        
        const response = await fetch(geojsonUrl)
        if (!response.ok) {
          console.warn('Failed to load GeoJSON:', response.statusText)
          geojsonLoadedRef.current = null // Reset on error so it can be retried
          isLoadingGeoJSONRef.current = false
          if (onLoadingChangeRef.current) {
            onLoadingChangeRef.current(false)
          }
          return
        }

        const geoJsonData = await response.json()
        
        // Restore classes from metadata if present (only if classes array is empty)
        if (geoJsonData.metadata?.classes && onClassesRestoredRef.current && classes.length === 0) {
          const restoredClasses: PaintClass[] = geoJsonData.metadata.classes
            .sort((a: any, b: any) => a.order - b.order) // Sort by order
            .map((c: any) => ({
              id: Number(c.id), // Ensure ID is a number
              name: String(c.name || 'Unnamed Class'),
              color: String(c.color || '#ff7f50')
            }))
          
          // Notify parent component to restore classes
          if (restoredClasses.length > 0) {
            console.log('Restoring classes from GeoJSON:', restoredClasses)
            onClassesRestoredRef.current(restoredClasses)
          }
        }

        // Load features from GeoJSON
        const features = geoJsonFormat.current.readFeatures(geoJsonData, {
          dataProjection: 'EPSG:3857',
          featureProjection: 'EPSG:3857'
        })

        // Set properties from GeoJSON properties
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
          // Clear existing features before adding new ones to prevent duplicates
          const existingFeatures = vectorSourceRef.current.getFeatures()
          if (existingFeatures.length > 0) {
            console.log('Clearing existing features before loading GeoJSON')
            vectorSourceRef.current.clear()
          }
          
          vectorSourceRef.current.addFeatures(features)
          
          // Save initial state after loading
          setTimeout(() => {
            if (saveStateRef.current) {
              saveStateRef.current()
            }
          }, 100)
        }
        
        console.log('Loaded GeoJSON:', { featureCount: features.length, url: geojsonUrl })
      } catch (error) {
        console.error('Error loading GeoJSON:', error)
        geojsonLoadedRef.current = null // Reset on error so it can be retried
      } finally {
        isLoadingGeoJSONRef.current = false
        if (onLoadingChangeRef.current) {
          onLoadingChangeRef.current(false)
        }
      }
    }

    loadGeoJSON()
  }, [geojsonUrl, map, classes.length])

  // Track previous classes to detect deletions
  const previousClassesRef = React.useRef<PaintClass[]>(classes)

  // Update classes ref and trigger style refresh when classes change
  React.useEffect(() => {
    if (!map || !vectorSourceRef.current) return
    
    const previousClasses = previousClassesRef.current
    const currentClassIds = new Set(classes.map(c => c.id))
    
    // Find deleted classes (were in previous but not in current)
    const deletedClassIds = previousClasses
      .filter(prevClass => !currentClassIds.has(prevClass.id))
      .map(prevClass => prevClass.id)
    
    // Remove all features that belong to deleted classes
    if (deletedClassIds.length > 0) {
      const features = vectorSourceRef.current.getFeatures()
      const featuresToRemove = features.filter(feature => {
        const featureClassId = feature.get("classId")
        return featureClassId !== null && featureClassId !== undefined && deletedClassIds.includes(featureClassId)
      })
      
      featuresToRemove.forEach(feature => {
        vectorSourceRef.current?.removeFeature(feature)
      })
      
      // Save state after removing features
      if (featuresToRemove.length > 0) {
        saveState()
      }
    }
    
    // Update the ref with current classes
    classesRef.current = classes
    previousClassesRef.current = classes
    
    console.log("Classes updated. New order:", classes.map((c, idx) => ({ index: idx, id: c.id, name: c.name })))
    
    // Clear style cache to force regeneration with new class colors
    styleCacheRef.current = {}
    
    // Update render order function when classes change
    // OpenLayers caches the render order, so we need to update it explicitly
    if (vectorLayerRef.current && vectorSourceRef.current) {
      // Update the render order function with the new classes
      vectorLayerRef.current.setRenderOrder(createRenderOrderFunction(classes))
      
      // Get all features
      const features = vectorSourceRef.current.getFeatures()
      
      console.log("Features count:", features.length)
      console.log("Features details:", features.map(f => ({
        classId: f.get("classId"),
        classIndex: classesRef.current.findIndex(c => c.id === f.get("classId")),
        className: classesRef.current.find(c => c.id === f.get("classId"))?.name
      })))
      
      // Trigger layer changed to force re-render with new render order
      vectorLayerRef.current.changed()
    }
  }, [map, classes])

  // Update style cache and all features when opacity changes
  React.useEffect(() => {
    if (!map || !vectorSourceRef.current) return
    
    // Update opacity on all existing features
    const features = vectorSourceRef.current.getFeatures()
    features.forEach(feature => {
      feature.set("opacity", opacity)
      feature.changed()
    })
    
    // Clear style cache to force regeneration with new opacity
    styleCacheRef.current = {}
    
    // Trigger layer refresh
    if (vectorLayerRef.current) {
      vectorLayerRef.current.changed()
    }
  }, [map, opacity])

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

  React.useEffect(() => {
    if (!map || !vectorSourceRef.current) return
    if (activeTool !== ToolMode.Paint || !selectedClass) {
      isPaintingRef.current = false
      // Clean up any active stroke
      if (currentStrokeFeatureRef.current) {
        vectorSourceRef.current.removeFeature(currentStrokeFeatureRef.current)
        currentStrokeFeatureRef.current = null
        currentStrokeCoordsRef.current = []
      }
      return
    }

    // Get current resolution for distance calculations
    const getResolution = () => map.getView().getResolution() || 1

    // Simple pixel-based distance check (much faster than Haversine)
    const pixelDistance = (coord1: number[], coord2: number[]): number => {
      const dx = coord1[0] - coord2[0]
      const dy = coord1[1] - coord2[1]
      return Math.hypot(dx, dy)
    }

    // Convert meters to pixels at current zoom
    const metersToPixels = (meters: number, resolution: number): number => {
      return meters / resolution
    }

    // Update the current stroke with new coordinate
    const updateStroke = (coordinate: number[]) => {
      if (!vectorSourceRef.current || !selectedClass) return
      
      const resolution = getResolution()
      // Use fixed minimum distance (approximately 5 meters) for smoother lines
      const minDistancePixels = metersToPixels(5, resolution)
      
      // Check if we should add this point (avoid too many points)
      const coords = currentStrokeCoordsRef.current
      if (coords.length > 0) {
        const lastCoord = coords[coords.length - 1]
        const pixelDist = pixelDistance(lastCoord, coordinate)
        if (pixelDist < minDistancePixels) {
          return // Skip if too close to last point
        }
      }
      
      // Add coordinate to current stroke
      currentStrokeCoordsRef.current.push(coordinate)
      
      // Create or update the LineString feature
      if (!currentStrokeFeatureRef.current) {
        // Create new stroke feature
        const lineString = new LineString([coordinate])
        const feature = new Feature({
          geometry: lineString
        })
        feature.set("strokeColor", selectedClass.color)
        feature.set("opacity", opacity)
        feature.set("classId", selectedClass.id)
        currentStrokeFeatureRef.current = feature
        vectorSourceRef.current.addFeature(feature)
        console.log("Feature added:", {
          classId: selectedClass.id,
          className: selectedClass.name,
          totalFeatures: vectorSourceRef.current.getFeatures().length
        })
      } else {
        // Update existing stroke geometry
        const geometry = currentStrokeFeatureRef.current.getGeometry() as LineString
        geometry.setCoordinates(currentStrokeCoordsRef.current)
      }
    }

    // Schedule update using requestAnimationFrame for smooth rendering
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
      
      // Convert LineString to closed Polygon when stroke is complete
      if (currentStrokeFeatureRef.current && currentStrokeCoordsRef.current.length >= 3) {
        const coords = currentStrokeCoordsRef.current
        // Close the polygon by adding the first coordinate at the end if not already closed
        const closedCoords = [...coords]
        const first = coords[0]
        const last = coords[coords.length - 1]
        
        // Check if already closed (first and last points are the same)
        const isAlreadyClosed = first[0] === last[0] && first[1] === last[1]
        
        if (!isAlreadyClosed) {
          closedCoords.push([first[0], first[1]]) // Close the polygon
        }
        
        // Create polygon from closed coordinates
        const polygon = new Polygon([closedCoords])
        const feature = currentStrokeFeatureRef.current
        const classId = feature.get("classId")
        
        // Remove the current feature from source temporarily
        vectorSourceRef.current?.removeFeature(feature)
        
        // Try to merge with overlapping polygons of the same class
        const mergedFeatures = handleMergePolygons(polygon, classId)
        
        if (mergedFeatures.length > 0) {
          // Add the merged feature(s)
          mergedFeatures.forEach(mergedFeature => {
            vectorSourceRef.current?.addFeature(mergedFeature)
          })
          console.log("Polygon merged with overlapping shapes:", {
            classId: classId,
            totalFeatures: vectorSourceRef.current?.getFeatures().length || 0
          })
        } else {
          // No overlaps, add the original polygon
          feature.setGeometry(polygon)
          vectorSourceRef.current?.addFeature(feature)
          console.log("Polygon finalized:", {
            classId: classId,
            totalFeatures: vectorSourceRef.current?.getFeatures().length || 0
          })
        }
        
        // Save state after polygon is finalized (merged or not)
        saveState()
      } else if (currentStrokeFeatureRef.current && currentStrokeCoordsRef.current.length < 3) {
        // Remove incomplete strokes (need at least 3 points for a polygon)
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
        // Keep the stroke when cleaning up (it's already in the source)
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
  }, [map, activeTool, selectedClass, opacity, handleMergePolygons, saveState])

  // Erase functionality - click on features to remove them
  React.useEffect(() => {
    if (!map || !vectorSourceRef.current) return
    if (activeTool !== ToolMode.Erase) return

    const handleClick = (event: MapBrowserEvent<UIEvent>) => {
      if (!vectorSourceRef.current) return
      
      // Find features at the click location
      const features = map.getFeaturesAtPixel(event.pixel, {
        hitTolerance: 5 // 5 pixel tolerance for easier clicking
      })
      
      if (features && features.length > 0) {
        // Filter to only actual Feature objects (not RenderFeature)
        const actualFeatures = features.filter(f => f instanceof Feature) as Feature[]
        
        if (actualFeatures.length > 0) {
          // Remove the first feature found (topmost)
          const featureToRemove = actualFeatures[0]
          vectorSourceRef.current.removeFeature(featureToRemove)
          
          // Save state for undo/redo
          saveState()
          
          console.log("Feature erased:", {
            classId: featureToRemove.get("classId"),
            totalFeatures: vectorSourceRef.current.getFeatures().length
          })
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

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 0, minWidth: 0 }}>
      <div style={{ width: "100%", height: "100%", minHeight: 0 }} ref={mapRef as any} />
    </div>
  )
})

PaintbrushMap.displayName = "PaintbrushMap"