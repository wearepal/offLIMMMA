import * as React from "react"
import { PaintClass, ToolMode } from "./utils/types"
import { getNextDistinctColor } from "./utils/utils"

enum SidebarTab {
  Paint,
  Layers
}

type PaintbrushSidebarProps = {
  classes: PaintClass[]
  setClasses: React.Dispatch<React.SetStateAction<PaintClass[]>>
  selectedClassId: number | null
  setSelectedClassId: React.Dispatch<React.SetStateAction<number | null>>
  activeTool: ToolMode
  setActiveTool: React.Dispatch<React.SetStateAction<ToolMode>>
  opacity: number
  setOpacity: React.Dispatch<React.SetStateAction<number>>
  isLoadingGeoJSON?: boolean
}

export const PaintbrushSidebar: React.FC<PaintbrushSidebarProps> = ({
  classes,
  setClasses,
  selectedClassId,
  setSelectedClassId,
  activeTool,
  setActiveTool,
  opacity,
  setOpacity,
  isLoadingGeoJSON = false
}) => {
  const [activeTab, setActiveTab] = React.useState<SidebarTab>(SidebarTab.Paint)
  const [expandedClassId, setExpandedClassId] = React.useState<number | null>(null)
  const tabButtonStyle = {
    borderRadius: 0,
    borderLeft: "none",
    borderRight: "none",
    borderTop: "none",
    fontSize: "0.95rem",
    padding: "0.75rem 0",
    backgroundColor: "#f8f9fc",
    color: "#4d5c7b",
    borderBottom: "2px solid transparent",
    transition: "all 0.15s ease"
  }
  const activeTabButtonStyle: React.CSSProperties = {
    backgroundColor: "#eef2ff",
    color: "#1f2d5c",
    borderBottom: "2px solid #6471c0",
    fontWeight: 600
  }
  const classButtonStyle: React.CSSProperties = {
    cursor: "pointer",
    transition: "background-color 0.15s ease, border-color 0.15s ease",
    position: "relative"
  }
  const selectedClassButtonStyle: React.CSSProperties = {
    backgroundColor: "#f5f7ff",
    borderColor: "#cfd7f6",
    color: "#1f2d5c",
    boxShadow: "inset 0 0 0 1px rgba(98, 114, 190, 0.2)"
  }
  const handleAddClass = () => {
    const newClassIndex = classes.length + 1
    const distinctColor = getNextDistinctColor(classes)
    const newClass: PaintClass = { id: Date.now(), name: `Class ${newClassIndex}`, color: distinctColor }
    setClasses(prev => [...prev, newClass])
    setSelectedClassId(newClass.id)
    setExpandedClassId(newClass.id)
  }

  const handleSelectClass = (classId: number) => {
    setSelectedClassId(classId)
    setExpandedClassId(classId)
  }

  const handleUpdateClass = (classId: number, updates: Partial<PaintClass>) => {
    console.log('Updating class:', { classId, updates, currentClasses: classes.map(c => ({ id: c.id, name: c.name })) })
    setClasses(prev => {
      const updated = prev.map(paintClass => {
        if (paintClass.id === classId) {
          const newClass = { ...paintClass, ...updates }
          console.log('Class updated:', { old: paintClass, new: newClass })
          return newClass
        }
        return paintClass
      })
      console.log('Updated classes array:', updated.map(c => ({ id: c.id, name: c.name })))
      return updated
    })
  }


  const handleDeleteClass = (classId: number) => {
    setClasses(prev => prev.filter(paintClass => paintClass.id !== classId))
    setSelectedClassId(prev => (prev === classId ? null : prev))
    setExpandedClassId(prev => (prev === classId ? null : prev))
  }

  const handleMoveUp = (classId: number) => {
    setClasses(prev => {
      const updated = [...prev]
      const index = updated.findIndex(paintClass => paintClass.id === classId)
      if (index <= 0) return prev // Already at top or not found
      // Swap elements
      const temp = updated[index - 1]
      updated[index - 1] = updated[index]
      updated[index] = temp
      return updated
    })
  }

  const handleMoveDown = (classId: number) => {
    setClasses(prev => {
      const updated = [...prev]
      const index = updated.findIndex(paintClass => paintClass.id === classId)
      if (index === -1 || index >= updated.length - 1) return prev // Already at bottom or not found
      // Swap elements
      const temp = updated[index]
      updated[index] = updated[index + 1]
      updated[index + 1] = temp
      return updated
    })
  }

  return (
    <div className="d-flex flex-column" style={{ width: "500px", height: "100%" }}>
      <div className="border-top border-bottom bg-light">
        <div className="d-flex">
          <button
            className="btn btn-sm flex-grow-1"
            onClick={() => setActiveTab(SidebarTab.Paint)}
            style={{ ...tabButtonStyle, ...(activeTab === SidebarTab.Paint ? activeTabButtonStyle : {}) }}
          >
            <i className="fas fa-paint-brush" /> Paint
          </button>
          <button
            className="btn btn-sm flex-grow-1"
            onClick={() => setActiveTab(SidebarTab.Layers)}
            style={{ ...tabButtonStyle, ...(activeTab === SidebarTab.Layers ? activeTabButtonStyle : {}) }}
          >
            <i className="fas fa-layer-group" /> Layers
          </button>
        </div>
      </div>
      <div className="flex-grow-1" style={{ minHeight: 0 }}>
        {activeTab === SidebarTab.Paint && (
          <div
            className="p-3 d-flex flex-column"
            style={{ height: "100%", minHeight: 0 }}
          >
            <div className="d-flex flex-column" style={{ flex: 2, minHeight: 0 }}>
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h6 className="mb-0 text-uppercase text-muted" style={{ letterSpacing: "0.05em" }}>
                  Classes
                </h6>
                <button 
                  className="btn btn-sm btn-outline-primary" 
                  onClick={handleAddClass}
                  disabled={isLoadingGeoJSON}
                  title={isLoadingGeoJSON ? "Loading saved data, please wait..." : "Add a new class"}
                >
                  <i className="fas fa-plus mr-1" />
                  New Class
                </button>
                {isLoadingGeoJSON && (
                  <div className="mt-2 text-center">
                    <small className="text-muted">
                      <i className="fas fa-spinner fa-spin mr-1" />
                      Loading saved polygons...
                    </small>
                  </div>
                )}
              </div>
              <div
                className="list-group border rounded flex-grow-1 overflow-auto"
                style={{ minHeight: 0, borderColor: "#dfe4f4" }}
              >
                {classes.map((paintClass, index) => (
                  <div
                    key={paintClass.id}
                    className="mb-2"
                  >
                    <div
                      className="list-group-item d-flex justify-content-between align-items-center p-0"
                      style={{
                        ...classButtonStyle,
                        ...(selectedClassId === paintClass.id ? selectedClassButtonStyle : {})
                      }}
                    >
                      <div
                        className="flex-grow-1 d-flex align-items-center"
                        style={{ padding: "0.75rem 1.25rem", cursor: "pointer" }}
                        onClick={() => handleSelectClass(paintClass.id)}
                      >
                        <i className="fas fa-grip-vertical mr-2 text-muted" />
                        {paintClass.name}
                        <span
                          className="rounded-circle ml-2"
                          style={{
                            width: "14px",
                            height: "14px",
                            backgroundColor: paintClass.color,
                            border: "1px solid rgba(0,0,0,0.2)"
                          }}
                        />
                        {selectedClassId === paintClass.id && <i className="fas fa-check text-success ml-2" />}
                      </div>
                      <div 
                        style={{ 
                          flexShrink: 0,
                          display: "flex",
                          gap: "4px",
                          padding: "0.5rem",
                          pointerEvents: "auto"
                        }}
                      >
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleMoveUp(paintClass.id)
                          }}
                          disabled={index === 0}
                          title="Move up"
                          style={{ 
                            minWidth: "28px",
                            minHeight: "28px",
                            border: "1px solid #ddd",
                            background: index === 0 ? "#f5f5f5" : "white",
                            padding: "0.25rem",
                            cursor: index === 0 ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          <i className="fas fa-arrow-up" style={{ fontSize: "12px" }} />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleMoveDown(paintClass.id)
                          }}
                          disabled={index === classes.length - 1}
                          title="Move down"
                          style={{ 
                            minWidth: "28px",
                            minHeight: "28px",
                            border: "1px solid #ddd",
                            background: index === classes.length - 1 ? "#f5f5f5" : "white",
                            padding: "0.25rem",
                            cursor: index === classes.length - 1 ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                        >
                          <i className="fas fa-arrow-down" style={{ fontSize: "12px" }} />
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleDeleteClass(paintClass.id)
                          }}
                          title="Delete"
                          style={{ 
                            minWidth: "28px",
                            minHeight: "28px",
                            border: "1px solid #ddd",
                            background: "white",
                            padding: "0.25rem",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#dc3545"
                          }}
                        >
                          <i className="fas fa-trash" style={{ fontSize: "12px" }} />
                        </button>
                      </div>
                    </div>
                    {expandedClassId === paintClass.id && (
                      <div className="border border-top-0 rounded-bottom p-3 bg-light">
                        <div className="form-group mb-2">
                          <label className="small font-weight-bold text-muted mb-1">Class Name</label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={paintClass.name}
                            onChange={event => handleUpdateClass(paintClass.id, { name: event.target.value })}
                          />
                        </div>
                        <div className="form-group mb-0">
                          <label className="small font-weight-bold text-muted mb-1">Color</label>
                          <div className="d-flex align-items-center">
                            <input
                              type="color"
                              className="mr-2"
                              value={paintClass.color}
                              onChange={event => handleUpdateClass(paintClass.id, { color: event.target.value })}
                              style={{ width: "48px", height: "32px", border: "none", background: "transparent" }}
                            />
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={paintClass.color}
                              onChange={event => handleUpdateClass(paintClass.id, { color: event.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {classes.length === 0 && <div className="text-muted text-center py-4">No classes yet</div>}
              </div>
            </div>
            <div
              className="pt-3 mt-3"
              style={{ flexShrink: 0, borderTop: "1px solid #dfe4f4" }}
            >
              <div className="d-flex align-items-center justify-content-between mb-3">
                <h6 className="mb-0 text-uppercase text-muted" style={{ letterSpacing: "0.05em" }}>
                  Tools
                </h6>
              </div>
              <div className="d-flex mb-3">
                <button
                  type="button"
                  className={`btn btn-sm flex-fill mr-2 ${
                    activeTool === ToolMode.Cursor ? "btn-primary" : "btn-outline-secondary"
                  }`}
                  onClick={() => setActiveTool(ToolMode.Cursor)}
                  aria-pressed={activeTool === ToolMode.Cursor}
                >
                  <i className="fas fa-mouse-pointer mr-2" />
                  Cursor
                </button>
                <button
                  type="button"
                  className={`btn btn-sm flex-fill mr-2 ${
                    activeTool === ToolMode.Paint ? "btn-primary" : "btn-outline-secondary"
                  }`}
                  onClick={() => setActiveTool(ToolMode.Paint)}
                  aria-pressed={activeTool === ToolMode.Paint}
                >
                  <i className="fas fa-paint-brush mr-2" />
                  Paint
                </button>
                <button
                  type="button"
                  className={`btn btn-sm flex-fill ${
                    activeTool === ToolMode.Erase ? "btn-primary" : "btn-outline-secondary"
                  }`}
                  onClick={() => setActiveTool(ToolMode.Erase)}
                  aria-pressed={activeTool === ToolMode.Erase}
                >
                  <i className="fas fa-eraser mr-2" />
                  Erase
                </button>
              </div>
              <div className="mt-3">
                <label className="small font-weight-bold text-muted mb-2 d-flex justify-content-between align-items-center">
                  Opacity
                  <span className="badge badge-light text-primary">{Math.round(opacity * 100)}%</span>
                </label>
                <input
                  type="range"
                  className="custom-range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={opacity}
                  onChange={event => setOpacity(Number(event.target.value))}
                  aria-label="Fill opacity"
                />
              </div>
            </div>
          </div>
        )}
        {activeTab === SidebarTab.Layers && (
          <div className="d-flex flex-column" style={{ height: "100%", minHeight: 0 }}>
            <div className="px-3 py-2 border-top border-bottom d-flex align-items-center bg-light">
              <div className="flex-grow-1">Layers</div>
              <i className="ml-2 fas fa-plus fa-fw" style={{ cursor: "pointer" }} title="Add layer" />
            </div>
            <div
              className="flex-grow-1 bg-white"
              style={{ overflowY: "auto", flexBasis: "0px" }}
            >
              {/* Layers list will go here */}
              <div className="px-3 py-4 text-center text-muted">
                <p className="mb-0">No layers added yet</p>
                <small>Click the + icon to add a layer</small>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}