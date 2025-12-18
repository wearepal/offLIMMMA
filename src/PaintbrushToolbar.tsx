import * as React from "react"

type PaintbrushToolbarProps = {
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  projectName?: string
  onProjectNameChange?: (name: string) => void
  onSave?: () => void
  onSaveAs?: () => void
  onOpen?: () => void
  onNew?: () => void
  onDownloadOffline?: () => void
  hasUnsavedChanges?: boolean
  isSaving?: boolean
  hasOfflineTiles?: boolean
}

export const PaintbrushToolbar: React.FC<PaintbrushToolbarProps> = ({ 
  onUndo, 
  onRedo, 
  canUndo = false, 
  canRedo = false, 
  projectName = "Untitled",
  onProjectNameChange,
  onSave,
  onSaveAs,
  onOpen,
  onNew,
  onDownloadOffline,
  hasUnsavedChanges = false,
  isSaving = false,
  hasOfflineTiles = false
}) => {
  const [isEditingName, setIsEditingName] = React.useState(false)
  const [editedName, setEditedName] = React.useState(projectName)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setEditedName(projectName)
  }, [projectName])

  React.useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditingName])

  const handleNameSubmit = () => {
    if (editedName.trim()) {
      onProjectNameChange?.(editedName.trim())
    } else {
      setEditedName(projectName)
    }
    setIsEditingName(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit()
    } else if (e.key === 'Escape') {
      setEditedName(projectName)
      setIsEditingName(false)
    }
  }

  return (
    <div style={{ 
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "10px 16px",
      background: "#f8f9fc",
      borderBottom: "1px solid #e8ecf4",
      flexShrink: 0
    }}>
      {/* App Logo and Name */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <img 
          src="icon.png" 
          alt="offLIMMMA" 
          style={{ 
            width: "40px", 
            height: "40px", 
            borderRadius: "2px"
          }} 
        />
        <span style={{ 
          fontSize: "15px", 
          fontWeight: 600,
          color: "#1f2d3d"
        }}>offLIMMMA</span>
      </div>

      {/* Divider */}
      <div style={{ width: "1px", height: "24px", background: "#dfe4f4" }} />

      {/* File Actions */}
      <div style={{ display: "flex", gap: "4px" }}>
        <button 
          className="btn btn-ghost btn-sm"
          onClick={onNew}
          title="New Project (Ctrl+N)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          New
        </button>
        <button 
          className="btn btn-ghost btn-sm"
          onClick={onOpen}
          title="Open File (Ctrl+O)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Open
        </button>
        <button 
          className="btn btn-ghost btn-sm"
          onClick={onSave}
          disabled={isSaving}
          title="Save (Ctrl+S)"
        >
          {isSaving ? (
            <div className="animate-spin" style={{ width: 16, height: 16, border: "2px solid var(--border-color)", borderTopColor: "var(--accent-primary)", borderRadius: "50%" }} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17,21 17,13 7,13 7,21"/>
              <polyline points="7,3 7,8 15,8"/>
            </svg>
          )}
          Save
        </button>
        <button 
          className="btn btn-ghost btn-sm"
          onClick={onSaveAs}
          disabled={isSaving}
          title="Save As (Ctrl+Shift+S)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
          </svg>
          Save As
        </button>
      </div>

      {/* Divider */}
      <div style={{ width: "1px", height: "24px", background: "#dfe4f4" }} />

      {/* Offline Download */}
      <button 
        className="btn btn-ghost btn-sm"
        onClick={onDownloadOffline}
        title="Download map tiles for offline use"
        style={{ 
          position: "relative",
          color: hasOfflineTiles ? "#22c55e" : undefined 
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Offline
        {hasOfflineTiles && (
          <span style={{
            position: "absolute",
            top: "2px",
            right: "2px",
            width: "8px",
            height: "8px",
            background: "#22c55e",
            borderRadius: "50%"
          }} />
        )}
      </button>

      {/* Divider */}
      <div style={{ width: "1px", height: "24px", background: "#dfe4f4" }} />

      {/* Project Name */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {isEditingName ? (
          <input
            ref={inputRef}
            type="text"
            className="input"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={handleKeyDown}
            style={{ 
              width: "200px",
              padding: "6px 12px",
              fontSize: "14px"
            }}
          />
        ) : (
          <div 
            onClick={() => setIsEditingName(true)}
            style={{ 
              cursor: "pointer",
              padding: "6px 12px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "#ffffff",
              border: "1px solid #dfe4f4",
              transition: "all 0.15s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#4a6cf7"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#dfe4f4"
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: 500, color: "#1f2d3d" }}>{projectName}</span>
            {hasUnsavedChanges && (
              <span style={{ 
                width: "8px", 
                height: "8px", 
                borderRadius: "50%", 
                background: "#f59e0b",
                flexShrink: 0
              }} title="Unsaved changes" />
            )}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8492a6" strokeWidth="2">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Undo/Redo */}
      <div style={{ display: "flex", gap: "4px" }}>
        <button 
          className="btn btn-secondary btn-icon btn-sm"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
        </button>
        <button 
          className="btn btn-secondary btn-icon btn-sm"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 7v6h-6"/>
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

