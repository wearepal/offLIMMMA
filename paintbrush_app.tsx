import * as React from "react"
import { PaintbrushMap, PaintbrushMapRef } from "./paintbrush_map"
import { PaintbrushToolbar } from "./paintbrush_toolbar"
import { PaintbrushSidebar } from "./paintbrush_sidebar"
import { PaintClass, ToolMode } from "./utils/types"

type PaintbrushAppProps = {
  annotationId: number
  annotationName: string
  teamId: number
  teamName: string
  backButtonPath: string
  geojsonUrl?: string
}

export const PaintbrushApp: React.FC<PaintbrushAppProps> = ({
  annotationId,
  annotationName,
  teamId,
  teamName,
  backButtonPath,
  geojsonUrl
}) => {
  const [classes, setClasses] = React.useState<PaintClass[]>([])
  const [selectedClassId, setSelectedClassId] = React.useState<number | null>(null)
  const [activeTool, setActiveTool] = React.useState<ToolMode>(ToolMode.Cursor)
  const [opacity, setOpacity] = React.useState<number>(1.0)
  const [canUndo, setCanUndo] = React.useState(false)
  const [canRedo, setCanRedo] = React.useState(false)
  const [currentAnnotationName, setCurrentAnnotationName] = React.useState<string>(annotationName)
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [isLoadingGeoJSON, setIsLoadingGeoJSON] = React.useState(false)
  const mapRef = React.useRef<PaintbrushMapRef>(null)
  
  // Update local name when prop changes (e.g., after save)
  React.useEffect(() => {
    setCurrentAnnotationName(annotationName)
    setHasUnsavedChanges(false)
  }, [annotationName])

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
    const csrfToken = (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement)?.content
    if (!csrfToken) {
      alert('CSRF token not found. Please refresh the page and try again.')
      return
    }

    const headers = new Headers()
    headers.set('X-CSRF-Token', csrfToken)

    // Save annotation name if it has changed
    if (hasUnsavedChanges) {
      setIsSaving(true)
      const method = 'PATCH'
      headers.set('X-CSRF-Token', csrfToken)

      const body = new FormData()
      body.set('annotation[name]', currentAnnotationName)

      const url = `/paintbrush/${annotationId}`
      
      try {
        const response = await fetch(url, { 
          method, 
          headers, 
          body,
          redirect: 'manual'
        })

        if (response.status === 0 || response.status === 200 || (response.status >= 200 && response.status < 400)) {
          setHasUnsavedChanges(false)
        } else {
          const errorText = await response.text().catch(() => response.statusText)
          throw new Error(`HTTP ${response.status}: ${errorText}`)
        }
      } catch (error) {
        console.error('Error saving annotation name:', error)
        alert(`An error occurred while saving the annotation name: ${error instanceof Error ? error.message : 'Unknown error'}`)
        setIsSaving(false)
        return
      } finally {
        setIsSaving(false)
      }
    }

    // Save polygons
    const geoJson = mapRef.current?.exportGeoJSON()
    if (geoJson) {
      const method = 'PATCH'
      const body = new FormData()
      body.set('geojson', geoJson)

      try {
        const response = await fetch(`/paintbrush/${annotationId}/save_geojson`, { 
          method, 
          headers, 
          body,
          redirect: 'manual'
        })

        if (response.status === 0 || response.status === 200 || (response.status >= 200 && response.status < 400)) {
          // Save successful - no alert needed
        } else {
          const errorText = await response.text().catch(() => response.statusText)
          throw new Error(`HTTP ${response.status}: ${errorText}`)
        }
      } catch (error) {
        console.error('Error saving polygons:', error)
        alert(`An error occurred while saving polygons: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
  }

  const handleNameChange = (newName: string) => {
    setCurrentAnnotationName(newName)
    setHasUnsavedChanges(newName !== annotationName)
  }

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      width: "100%", 
      height: "100%",
      minHeight: 0,
      overflow: "hidden"
    }}>
      <PaintbrushToolbar 
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        backButtonPath={backButtonPath}
        annotationName={currentAnnotationName}
        onAnnotationNameChange={handleNameChange}
        onSave={handleSave}
        hasUnsavedChanges={hasUnsavedChanges}
        isSaving={isSaving}
      />
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, overflow: "hidden", minHeight: 0, minWidth: 0 }}>
          <PaintbrushMap 
            ref={mapRef}
            activeTool={activeTool} 
            selectedClass={selectedClass} 
            opacity={opacity} 
            classes={classes}
            geojsonUrl={geojsonUrl}
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
          />
        </div>
        <PaintbrushSidebar
          classes={classes}
          setClasses={setClasses}
          selectedClassId={selectedClassId}
          setSelectedClassId={setSelectedClassId}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          opacity={opacity}
          setOpacity={setOpacity}
          isLoadingGeoJSON={isLoadingGeoJSON}
        />
      </div>
    </div>
  )
}

