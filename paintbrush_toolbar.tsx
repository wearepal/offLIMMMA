import * as React from "react"

type PaintbrushToolbarProps = {
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  backButtonPath?: string
  annotationName?: string
  onAnnotationNameChange?: (name: string) => void
  onSave?: () => void
  hasUnsavedChanges?: boolean
  isSaving?: boolean
}

export const PaintbrushToolbar: React.FC<PaintbrushToolbarProps> = ({ 
  onUndo, 
  onRedo, 
  canUndo = false, 
  canRedo = false, 
  backButtonPath, 
  annotationName,
  onAnnotationNameChange,
  onSave,
  hasUnsavedChanges = false,
  isSaving = false
}) => {
  return (
    <div className="btn-toolbar p-2 bg-light border-top">
      <div className="btn-group mr-2">
        {backButtonPath ? (
          <a className="btn btn-sm btn-outline-primary" href={backButtonPath}>
            <i className="fas fa-arrow-left" /> Back
          </a>
        ) : (
          <button className="btn btn-sm btn-outline-primary" disabled>
            <i className="fas fa-arrow-left" /> Back
          </button>
        )}
      </div>
      {annotationName !== undefined && (
        <div className="input-group mr-2">
          <input 
            type="text" 
            className="form-control form-control-sm" 
            value={annotationName} 
            onChange={(e) => onAnnotationNameChange?.(e.target.value)}
            style={{ minWidth: "200px" }}
            placeholder="Annotation name"
          />
        </div>
      )}
      {onSave && (
        <div className="btn-group mr-2">
          <button 
            className="btn btn-sm btn-outline-primary" 
            onClick={onSave}
            disabled={isSaving}
            title="Save annotation name and polygons"
          >
            <i className="fas fa-save" /> {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      )}
      <div className="btn-group mr-2">
        <button 
          className="btn btn-sm btn-outline-primary" 
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <i className="fas fa-undo" /> Undo
        </button>
        <button 
          className="btn btn-sm btn-outline-primary" 
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <i className="fas fa-redo" /> Redo
        </button>
      </div>
    </div>
  )
}