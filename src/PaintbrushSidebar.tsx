import * as React from "react"
import { PaintClass, PaintStyle, ToolMode } from "./utils/types"
import { getNextDistinctColor } from "./utils/utils"
import { LayerInfo } from "./LayersPanel"

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
  paintStyle: PaintStyle
  setPaintStyle: React.Dispatch<React.SetStateAction<PaintStyle>>
  opacity: number
  setOpacity: React.Dispatch<React.SetStateAction<number>>
  snapToBoundaryEnabled?: boolean
  setSnapToBoundaryEnabled?: React.Dispatch<React.SetStateAction<boolean>>
  isLoadingGeoJSON?: boolean
  // Layer management props
  layers?: LayerInfo[]
  onLayersChange?: (layers: LayerInfo[]) => void
  onImportLayer?: () => void
  onZoomToLayer?: (extent: [number, number, number, number]) => void
  onRemoveLayer?: (id: string) => void
  onAddFromShapefile?: (classId: number) => void
  onAddClassFromFile?: () => void
  importFileResult?: { fileName: string; tableRows: Record<string, unknown>[] } | null
  onOpenVectorForImport?: () => void
  onImportWithAssignments?: (assignments: (number | null)[]) => void
  onCloseImportModal?: () => void
}

export const PaintbrushSidebar: React.FC<PaintbrushSidebarProps> = ({
  classes,
  setClasses,
  selectedClassId,
  setSelectedClassId,
  activeTool,
  setActiveTool,
  paintStyle,
  setPaintStyle,
  opacity,
  setOpacity,
  snapToBoundaryEnabled = true,
  setSnapToBoundaryEnabled,
  isLoadingGeoJSON = false,
  layers = [],
  onLayersChange,
  onImportLayer,
  onZoomToLayer,
  onRemoveLayer,
  onAddFromShapefile,
  onAddClassFromFile,
  importFileResult = null,
  onOpenVectorForImport,
  onImportWithAssignments,
  onCloseImportModal
}) => {
  const [activeTab, setActiveTab] = React.useState<SidebarTab>(SidebarTab.Paint)
  const [expandedClassId, setExpandedClassId] = React.useState<number | null>(null)
  // Per-row class assignment for import modal (index -> classId or null for None)
  const [rowClassAssignments, setRowClassAssignments] = React.useState<(number | null)[]>([])
  const [filterField, setFilterField] = React.useState<string>("")
  const [filterText, setFilterText] = React.useState<string>("")
  const [bulkClassId, setBulkClassId] = React.useState<number | null>(null)
  const [classifyField, setClassifyField] = React.useState<string>("")
  const bulkClass = React.useMemo(
    () => (bulkClassId != null ? classes.find(c => c.id === bulkClassId) ?? null : null),
    [classes, bulkClassId]
  )
  React.useEffect(() => {
    if (importFileResult?.tableRows?.length) {
      setRowClassAssignments(importFileResult.tableRows.map(() => null))
    } else {
      setRowClassAssignments([])
    }
    setFilterField("")
    setFilterText("")
    setClassifyField("")
  }, [importFileResult])

  // Create (or reuse) a class for every distinct value of a field and
  // auto-assign rows accordingly. Respects the current filter so the user
  // can narrow down which rows are classified.
  const handleClassifyByField = React.useCallback(() => {
    if (!importFileResult || !classifyField) return
    const allKeys = Object.keys(importFileResult.tableRows[0] || {}) as string[]
    const indexedRows = importFileResult.tableRows.map((row, i) => ({ row, index: i }))
    const lowered = filterText.trim().toLowerCase()
    const visibleRows = lowered
      ? indexedRows.filter(({ row }) => {
          if (filterField) {
            const v = (row as any)[filterField]
            return v != null && String(v).toLowerCase().includes(lowered)
          }
          return allKeys
            .filter(k => k !== "__index")
            .some(k => {
              const v = (row as any)[k]
              return v != null && String(v).toLowerCase().includes(lowered)
            })
        })
      : indexedRows

    // Collect distinct non-empty values (preserving first-seen order)
    const valueOrder: string[] = []
    const valuesPerIndex = new Map<number, string>()
    for (const { row, index } of visibleRows) {
      const raw = (row as any)[classifyField]
      if (raw == null) continue
      const value = String(raw).trim()
      if (value === "") continue
      valuesPerIndex.set(index, value)
      if (!valueOrder.includes(value)) valueOrder.push(value)
    }
    if (valueOrder.length === 0) return

    // Map value -> class id, reusing existing classes with the same name
    // (case-insensitive) and otherwise creating new classes with distinct colors.
    const existingByName = new Map<string, PaintClass>()
    for (const c of classes) existingByName.set(c.name.toLowerCase(), c)

    const valueToClassId = new Map<string, number>()
    const newClasses: PaintClass[] = []
    // Track "pending" classes (existing + freshly created) so color picking
    // stays distinct across multiple new classes created in this pass.
    const pendingForColor: PaintClass[] = [...classes]
    for (const value of valueOrder) {
      const existing = existingByName.get(value.toLowerCase())
      if (existing) {
        valueToClassId.set(value, existing.id)
        continue
      }
      const color = getNextDistinctColor(pendingForColor)
      // Ensure unique id even when created in the same millisecond
      const id = Date.now() + newClasses.length
      const newClass: PaintClass = { id, name: value, color, opacity: 1 }
      newClasses.push(newClass)
      pendingForColor.push(newClass)
      valueToClassId.set(value, id)
    }

    if (newClasses.length > 0) {
      setClasses(prev => [...prev, ...newClasses])
    }

    setRowClassAssignments(prev => {
      const next = [...prev]
      valuesPerIndex.forEach((value, index) => {
        const classId = valueToClassId.get(value)
        if (classId != null) next[index] = classId
      })
      return next
    })
  }, [importFileResult, classifyField, filterField, filterText, classes, setClasses])
  
  const handleAddClass = () => {
    const newClassIndex = classes.length + 1
    const distinctColor = getNextDistinctColor(classes)
    const newClass: PaintClass = { id: Date.now(), name: `Class ${newClassIndex}`, color: distinctColor, opacity: 1 }
    setClasses(prev => [...prev, newClass])
    setSelectedClassId(newClass.id)
    setExpandedClassId(newClass.id)
  }

  const handleSelectClass = (classId: number) => {
    setSelectedClassId(classId)
    setExpandedClassId(expandedClassId === classId ? null : classId)
  }

  const handleUpdateClass = (classId: number, updates: Partial<PaintClass>) => {
    setClasses(prev => prev.map(paintClass => 
      paintClass.id === classId ? { ...paintClass, ...updates } : paintClass
    ))
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
      if (index <= 0) return prev
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
      if (index === -1 || index >= updated.length - 1) return prev
      const temp = updated[index]
      updated[index] = updated[index + 1]
      updated[index + 1] = temp
      return updated
    })
  }

  const ToolButton: React.FC<{
    tool: ToolMode
    icon: React.ReactNode
    label: string
  }> = ({ tool, icon, label }) => (
    <button
      className={`btn btn-sm ${activeTool === tool ? 'btn-primary' : 'btn-secondary'}`}
      onClick={() => setActiveTool(tool)}
      style={{ flex: 1 }}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div style={{ 
      width: "340px", 
      height: "100%", 
      display: "flex", 
      flexDirection: "column",
      background: "#ffffff",
      borderLeft: "1px solid #e8ecf4",
      padding: "12px",
      paddingLeft: "6px"
    }}>
      {/* Tabs */}
      <div style={{ 
        display: "flex", 
        gap: "4px", 
        marginBottom: "16px",
        background: "#f1f3f9",
        padding: "4px",
        borderRadius: "6px"
      }}>
        <button
          className={`btn btn-sm ${activeTab === SidebarTab.Paint ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab(SidebarTab.Paint)}
          style={{ flex: 1 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
            <path d="M2 2l7.586 7.586"/>
            <circle cx="11" cy="11" r="2"/>
          </svg>
          Paint
        </button>
        <button
          className={`btn btn-sm ${activeTab === SidebarTab.Layers ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab(SidebarTab.Layers)}
          style={{ flex: 1 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12,2 2,7 12,12 22,7"/>
            <polyline points="2,17 12,22 22,17"/>
            <polyline points="2,12 12,17 22,12"/>
          </svg>
          Layers
        </button>
      </div>

      {activeTab === SidebarTab.Paint && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {/* Classes Section */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, marginBottom: "16px" }}>
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between", 
              marginBottom: "12px" 
            }}>
              <span style={{ 
                fontSize: "11px", 
                fontWeight: 600, 
                textTransform: "uppercase", 
                letterSpacing: "0.05em",
                color: "#8492a6"
              }}>
                Classes
              </span>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                {onOpenVectorForImport && (
                  <button 
                    className="btn btn-secondary btn-sm btn-icon"
                    onClick={() => onOpenVectorForImport()}
                    disabled={isLoadingGeoJSON}
                    title="Import from file"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </button>
                )}
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={handleAddClass}
                  disabled={isLoadingGeoJSON}
                  title={isLoadingGeoJSON ? "Loading saved data..." : "Add a new class"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add Class
                </button>
              </div>
            </div>

            {isLoadingGeoJSON && (
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                gap: "8px",
                padding: "12px",
                background: "#f1f3f9",
                borderRadius: "6px",
                marginBottom: "12px"
              }}>
                <div className="animate-spin" style={{ 
                  width: 16, 
                  height: 16, 
                  border: "2px solid #dfe4f4", 
                  borderTopColor: "#4a6cf7", 
                  borderRadius: "50%" 
                }} />
                <span style={{ fontSize: "13px", color: "#4d5c7b" }}>
                  Loading saved polygons...
                </span>
              </div>
            )}

            <div style={{ 
              flex: 1, 
              overflowY: "auto", 
              display: "flex", 
              flexDirection: "column", 
              gap: "8px",
              minHeight: 0
            }}>
              {classes.map((paintClass, index) => (
                <div key={paintClass.id} className="animate-fadeIn">
                  <div 
                    style={{
                      background: selectedClassId === paintClass.id ? "#f5f7ff" : "#ffffff",
                      borderRadius: "6px",
                      border: `1px solid ${selectedClassId === paintClass.id ? "#4a6cf7" : "#dfe4f4"}`,
                      overflow: "hidden",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <div 
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "10px 12px",
                        cursor: "pointer",
                        gap: "10px"
                      }}
                      onClick={() => handleSelectClass(paintClass.id)}
                    >
                      <div style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "6px",
                        background: paintClass.color,
                        boxShadow: `0 2px 8px ${paintClass.color}40`,
                        flexShrink: 0
                      }} />
                      <span style={{ 
                        flex: 1, 
                        fontWeight: 500,
                        fontSize: "13px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "#1f2d3d"
                      }}>
                        {paintClass.name}
                      </span>
                      {selectedClassId === paintClass.id && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3">
                          <polyline points="20,6 9,17 4,12"/>
                        </svg>
                      )}
                      <div style={{ display: "flex", gap: "2px" }}>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={(e) => { e.stopPropagation(); handleMoveUp(paintClass.id) }}
                          disabled={index === 0}
                          title="Move up"
                          style={{ opacity: index === 0 ? 0.3 : 1 }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="18,15 12,9 6,15"/>
                          </svg>
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={(e) => { e.stopPropagation(); handleMoveDown(paintClass.id) }}
                          disabled={index === classes.length - 1}
                          title="Move down"
                          style={{ opacity: index === classes.length - 1 ? 0.3 : 1 }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="6,9 12,15 18,9"/>
                          </svg>
                        </button>
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={(e) => { e.stopPropagation(); handleDeleteClass(paintClass.id) }}
                          title="Delete class"
                          style={{ color: "#ef4444" }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Expanded edit section */}
                    {expandedClassId === paintClass.id && (
                      <div style={{ 
                        padding: "12px",
                        borderTop: "1px solid #e8ecf4",
                        background: "#f8f9fc",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px"
                      }}>
                        <div>
                          <label style={{ 
                            fontSize: "11px", 
                            fontWeight: 600, 
                            color: "#8492a6",
                            marginBottom: "6px",
                            display: "block"
                          }}>
                            Class Name
                          </label>
                          <input
                            type="text"
                            className="input"
                            value={paintClass.name}
                            onChange={e => handleUpdateClass(paintClass.id, { name: e.target.value })}
                            style={{ fontSize: "13px" }}
                          />
                        </div>
                        <div>
                          <label style={{ 
                            fontSize: "11px", 
                            fontWeight: 600, 
                            color: "#8492a6",
                            marginBottom: "6px",
                            display: "block"
                          }}>
                            Color
                          </label>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <input
                              type="color"
                              value={paintClass.color}
                              onChange={e => handleUpdateClass(paintClass.id, { color: e.target.value })}
                            />
                            <input
                              type="text"
                              className="input"
                              value={paintClass.color}
                              onChange={e => handleUpdateClass(paintClass.id, { color: e.target.value })}
                              style={{ flex: 1, minWidth: 0, fontSize: "13px", fontFamily: "Consolas, 'Courier New', monospace" }}
                            />
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", maxWidth: "80px" }}>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={paintClass.opacity ?? 1}
                                onChange={e => handleUpdateClass(paintClass.id, { opacity: Number(e.target.value) })}
                                style={{ flex: 1 }}
                              />
                              <span style={{ fontSize: "10px", color: "#8492a6", minWidth: "2.5em", textAlign: "right" }}>
                                {Math.round((paintClass.opacity ?? 1) * 100)}%
                              </span>
                            </div>
                            {onAddFromShapefile && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => onAddFromShapefile(paintClass.id)}
                                title="Import polygons from a shapefile into this class"
                                style={{
                                  flexShrink: 0,
                                  padding: "6px 10px",
                                  fontSize: "11px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px"
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                  <polyline points="17 8 12 3 7 8"/>
                                  <line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                                from file
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {classes.length === 0 && !isLoadingGeoJSON && (
                <div style={{ 
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#8492a6"
                }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: "0 auto 12px", opacity: 0.5 }}>
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="16"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                  <p style={{ fontSize: "13px", marginBottom: "4px" }}>No classes yet</p>
                  <p style={{ fontSize: "12px" }}>Add a class to start painting</p>
                </div>
              )}
            </div>
          </div>

          {/* Tools Section */}
          <div style={{ flexShrink: 0, borderTop: "1px solid #e8ecf4", paddingTop: "16px" }}>
            <span style={{ 
              fontSize: "11px", 
              fontWeight: 600, 
              textTransform: "uppercase", 
              letterSpacing: "0.05em",
              color: "#8492a6",
              marginBottom: "12px",
              display: "block"
            }}>
              Tools
            </span>

            {/* Paint style */}
            <div style={{ marginBottom: "12px" }}>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                marginBottom: "8px"
              }}>
                <span style={{ 
                  fontSize: "11px", 
                  fontWeight: 600, 
                  textTransform: "uppercase", 
                  letterSpacing: "0.05em",
                  color: "#8492a6"
                }}>
                  Paint Style
                </span>
              </div>
              <select
                className="input"
                value={paintStyle}
                onChange={(e) => setPaintStyle(e.target.value as PaintStyle)}
                style={{ width: "100%", fontSize: "13px" }}
              >
                <option value={PaintStyle.Polygon}>Polygon (click vertices)</option>
                <option value={PaintStyle.Freehand}>Freehand (drag brush)</option>
              </select>
            </div>

            {paintStyle === PaintStyle.Polygon && setSnapToBoundaryEnabled && (
              <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", cursor: "pointer", fontSize: "13px", color: "#1f2d3d" }}>
                <input
                  type="checkbox"
                  checked={snapToBoundaryEnabled}
                  onChange={(e) => setSnapToBoundaryEnabled(e.target.checked)}
                />
                Snap to boundary
              </label>
            )}
            
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <ToolButton 
                tool={ToolMode.Cursor} 
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
                    <path d="M13 13l6 6"/>
                  </svg>
                }
                label="Cursor"
              />
              <ToolButton 
                tool={ToolMode.Paint} 
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                  </svg>
                }
                label="Paint"
              />
              <ToolButton 
                tool={ToolMode.Erase} 
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 20H7L3 16c-.6-.6-.6-1.5 0-2.1L13.1 3.8c.6-.6 1.5-.6 2.1 0l5.1 5.1c.6.6.6 1.5 0 2.1L11 20"/>
                    <path d="M6 11l4 4"/>
                  </svg>
                }
                label="Erase"
              />
            </div>

            {/* Opacity Slider */}
            <div>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                marginBottom: "8px"
              }}>
                <span style={{ 
                  fontSize: "11px", 
                  fontWeight: 600, 
                  textTransform: "uppercase", 
                  letterSpacing: "0.05em",
                  color: "#8492a6"
                }}>
                  Opacity
                </span>
                <span className="badge badge-primary">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={opacity}
                onChange={e => setOpacity(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === SidebarTab.Layers && (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {/* Layers List */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, marginBottom: "16px" }}>
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between", 
              marginBottom: "12px" 
            }}>
              <span style={{ 
                fontSize: "11px", 
                fontWeight: 600, 
                textTransform: "uppercase", 
                letterSpacing: "0.05em",
                color: "#8492a6"
              }}>
                Map Layers
              </span>
              <button 
                className="btn btn-primary btn-sm"
                onClick={onImportLayer}
                title="Import a GeoTIFF or vector file"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Import Layer
              </button>
            </div>

            <div style={{ 
              flex: 1, 
              overflowY: "auto", 
              display: "flex", 
              flexDirection: "column", 
              gap: "8px",
              minHeight: 0
            }}>
              {layers.map((layer, index) => (
                <div 
                  key={layer.id} 
                  style={{
                    background: "#ffffff",
                    borderRadius: "6px",
                    border: "1px solid #dfe4f4",
                    overflow: "hidden"
                  }}
                >
                  {/* Layer Header */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 12px",
                    gap: "10px"
                  }}>
                    {/* Visibility Toggle */}
                    <button
                      onClick={() => {
                        onLayersChange?.(layers.map(l => 
                          l.id === layer.id ? { ...l, visible: !l.visible } : l
                        ))
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "2px",
                        color: layer.visible ? "#4a6cf7" : "#d1d5db",
                        display: "flex"
                      }}
                      title={layer.visible ? "Hide layer" : "Show layer"}
                    >
                      {layer.visible ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      )}
                    </button>

                    {/* Layer Icon */}
                    <span style={{ 
                      color: layer.type === "osm" ? "#22c55e" : 
                             layer.type === "vector" ? "#f59e0b" : "#4a6cf7" 
                    }}>
                      {layer.type === "osm" ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="2" y1="12" x2="22" y2="12"/>
                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                        </svg>
                      ) : layer.type === "vector" ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="1,6 1,22 8,18 16,22 23,18 23,2 16,6 8,2"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21,15 16,10 5,21"/>
                        </svg>
                      )}
                    </span>

                    {/* Layer Name */}
                    <span style={{ 
                      flex: 1, 
                      fontWeight: 500,
                      fontSize: "13px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: layer.visible ? "#1f2d3d" : "#9ca3af"
                    }} title={layer.name}>
                      {layer.name}
                    </span>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: "2px" }}>
                      {/* Move Up */}
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => {
                          if (index <= 0) return
                          const newLayers = [...layers]
                          const temp = newLayers[index]
                          newLayers[index] = newLayers[index - 1]
                          newLayers[index - 1] = temp
                          onLayersChange?.(newLayers)
                        }}
                        disabled={index === 0}
                        title="Move up (render on top)"
                        style={{ opacity: index === 0 ? 0.3 : 1 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="18,15 12,9 6,15"/>
                        </svg>
                      </button>

                      {/* Move Down */}
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => {
                          if (index >= layers.length - 1) return
                          const newLayers = [...layers]
                          const temp = newLayers[index]
                          newLayers[index] = newLayers[index + 1]
                          newLayers[index + 1] = temp
                          onLayersChange?.(newLayers)
                        }}
                        disabled={index === layers.length - 1}
                        title="Move down (render below)"
                        style={{ opacity: index === layers.length - 1 ? 0.3 : 1 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6,9 12,15 18,9"/>
                        </svg>
                      </button>

                      {/* Zoom to (for GeoTIFF and Vector layers) */}
                      {(layer.type === "geotiff" || layer.type === "vector") && layer.extent && (
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => onZoomToLayer?.(layer.extent!)}
                          title="Zoom to layer"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8"/>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            <line x1="11" y1="8" x2="11" y2="14"/>
                            <line x1="8" y1="11" x2="14" y2="11"/>
                          </svg>
                        </button>
                      )}

                      {/* Remove (for GeoTIFF and Vector layers) */}
                      {(layer.type === "geotiff" || layer.type === "vector") && (
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => onRemoveLayer?.(layer.id)}
                          title="Remove layer"
                          style={{ color: "#ef4444" }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3,6 5,6 21,6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Opacity Slider */}
                  <div style={{ 
                    padding: "8px 12px",
                    borderTop: "1px solid #f3f4f6",
                    background: "#f8f9fc",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" opacity="0.5"/>
                    </svg>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={layer.opacity}
                      onChange={(e) => {
                        onLayersChange?.(layers.map(l => 
                          l.id === layer.id ? { ...l, opacity: parseFloat(e.target.value) } : l
                        ))
                      }}
                      disabled={!layer.visible}
                      style={{ flex: 1 }}
                    />
                    <span style={{ 
                      fontSize: "11px", 
                      color: "#6b7280", 
                      width: "32px",
                      textAlign: "right"
                    }}>
                      {Math.round(layer.opacity * 100)}%
                    </span>
                  </div>
                </div>
              ))}

              {layers.length === 0 && (
                <div style={{ 
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#8492a6"
                }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: "0 auto 12px", opacity: 0.5 }}>
                    <polygon points="12,2 2,7 12,12 22,7"/>
                    <polyline points="2,17 12,22 22,17"/>
                    <polyline points="2,12 12,17 22,12"/>
                  </svg>
                  <p style={{ fontSize: "13px", marginBottom: "4px" }}>No layers</p>
                  <p style={{ fontSize: "12px" }}>Add a GeoTIFF to get started</p>
                </div>
              )}
            </div>
          </div>

          {/* Layer Info */}
          <div style={{ 
            flexShrink: 0, 
            borderTop: "1px solid #e8ecf4", 
            paddingTop: "16px",
            fontSize: "12px",
            color: "#8492a6"
          }}>
            <p style={{ marginBottom: "4px" }}>
              <strong>Tip:</strong> Layers at the top render on top.
            </p>
            <p>
              Your annotations always appear above all layers.
            </p>
          </div>
        </div>
      )}

      {/* From File modal: shown after file is loaded, table with per-row class dropdown */}
      {importFileResult && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000
          }}
          onClick={() => onCloseImportModal?.()}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "12px",
              padding: "20px 24px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
              minWidth: "360px",
              maxWidth: "90vw",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden"
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ 
              fontSize: "13px", 
              fontWeight: 600, 
              color: "#1f2d3d",
              marginBottom: "8px",
              flexShrink: 0
            }}>
              Polygons from {importFileResult.fileName}
            </div>
            {/* Filter by field */}
            <div style={{ 
              display: "flex", 
              gap: "8px", 
              alignItems: "center", 
              marginBottom: "8px",
              flexShrink: 0
            }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#8492a6", whiteSpace: "nowrap" }}>Filter</span>
              <select
                className="input"
                style={{ fontSize: "12px", padding: "4px 6px", width: "140px", flexShrink: 0, flexGrow: 0 }}
                value={filterField}
                onChange={e => setFilterField(e.target.value)}
              >
                <option value="">All fields</option>
                {(Object.keys(importFileResult.tableRows[0] || {}) as string[])
                  .filter(key => key !== "__index")
                  .map(key => (
                    <option key={key} value={key}>{key}</option>
                  ))}
              </select>
              <input
                className="input"
                placeholder={filterField ? "Contains..." : "Search..."}
                style={{ fontSize: "12px", padding: "4px 8px", flex: 1, minWidth: 0 }}
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
              />
            </div>
            {/* Bulk assign class to all (filtered) rows */}
            <div style={{ 
              display: "flex", 
              gap: "8px", 
              alignItems: "center", 
              marginBottom: "8px",
              flexShrink: 0
            }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#8492a6", whiteSpace: "nowrap" }}>Set class</span>
              <select
                className="input"
                style={{ 
                  fontSize: "12px", 
                  padding: "4px 6px", 
                  width: "160px", 
                  flexShrink: 0, 
                  flexGrow: 0,
                  backgroundColor: bulkClass ? `${bulkClass.color}33` : undefined,
                  borderColor: bulkClass ? bulkClass.color : undefined
                }}
                value={bulkClassId != null ? String(bulkClassId) : ""}
                onChange={e => {
                  const v = e.target.value
                  setBulkClassId(v === "" ? null : Number(v))
                }}
              >
                <option value="">Select class...</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                className="btn btn-secondary btn-sm"
                style={{ whiteSpace: "nowrap" }}
                disabled={bulkClassId == null || !rowClassAssignments.length}
                onClick={() => {
                  if (bulkClassId == null || !importFileResult) return
                  const allKeys = Object.keys(importFileResult.tableRows[0] || {}) as string[]
                  const indexedRows = importFileResult.tableRows.map((row, i) => ({ row, index: i }))
                  const lowered = filterText.trim().toLowerCase()
                  const visibleRows = lowered
                    ? indexedRows.filter(({ row }) => {
                        if (filterField) {
                          const v = (row as any)[filterField]
                          return v != null && String(v).toLowerCase().includes(lowered)
                        }
                        return allKeys
                          .filter(k => k !== "__index")
                          .some(k => {
                            const v = (row as any)[k]
                            return v != null && String(v).toLowerCase().includes(lowered)
                          })
                      })
                    : indexedRows
                  const visibleIndexes = new Set(visibleRows.map(v => v.index))
                  setRowClassAssignments(prev => prev.map((val, idx) => (
                    visibleIndexes.has(idx) ? bulkClassId : val
                  )))
                }}
              >
                Set as class
              </button>
            </div>
            {/* Auto-classify: create one class per distinct value of a field */}
            <div style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              marginBottom: "8px",
              flexShrink: 0
            }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#8492a6", whiteSpace: "nowrap" }}>
                Classify by
              </span>
              <select
                className="input"
                style={{ fontSize: "12px", padding: "4px 6px", width: "160px", flexShrink: 0, flexGrow: 0 }}
                value={classifyField}
                onChange={e => setClassifyField(e.target.value)}
              >
                <option value="">Select field...</option>
                {(Object.keys(importFileResult.tableRows[0] || {}) as string[])
                  .filter(key => key !== "__index" && key !== "__area")
                  .map(key => (
                    <option key={key} value={key}>{key}</option>
                  ))}
              </select>
              <button
                className="btn btn-secondary btn-sm"
                style={{ whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "4px" }}
                disabled={!classifyField}
                onClick={handleClassifyByField}
                title="Create a class for each distinct value of the selected field and assign rows automatically"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                  <circle cx="18" cy="18" r="3" />
                </svg>
                Create classes
              </button>
              {classifyField && (() => {
                const allKeys = Object.keys(importFileResult.tableRows[0] || {}) as string[]
                const indexedRows = importFileResult.tableRows.map((row, i) => ({ row, index: i }))
                const lowered = filterText.trim().toLowerCase()
                const visibleRows = lowered
                  ? indexedRows.filter(({ row }) => {
                      if (filterField) {
                        const v = (row as any)[filterField]
                        return v != null && String(v).toLowerCase().includes(lowered)
                      }
                      return allKeys
                        .filter(k => k !== "__index")
                        .some(k => {
                          const v = (row as any)[k]
                          return v != null && String(v).toLowerCase().includes(lowered)
                        })
                    })
                  : indexedRows
                const distinct = new Set<string>()
                visibleRows.forEach(({ row }) => {
                  const raw = (row as any)[classifyField]
                  if (raw == null) return
                  const value = String(raw).trim()
                  if (value !== "") distinct.add(value)
                })
                return (
                  <span style={{ fontSize: "11px", color: "#8492a6", whiteSpace: "nowrap" }}>
                    {distinct.size} distinct value{distinct.size === 1 ? "" : "s"}
                  </span>
                )
              })()}
            </div>
            {(() => {
              const allKeys = Object.keys(importFileResult.tableRows[0] || {}) as string[]
              const indexedRows = importFileResult.tableRows.map((row, i) => ({ row, index: i }))
              const lowered = filterText.trim().toLowerCase()
              const visibleRows = lowered
                ? indexedRows.filter(({ row }) => {
                    if (filterField) {
                      const v = (row as any)[filterField]
                      return v != null && String(v).toLowerCase().includes(lowered)
                    }
                    // search all non-internal fields
                    return allKeys
                      .filter(k => k !== "__index")
                      .some(k => {
                        const v = (row as any)[k]
                        return v != null && String(v).toLowerCase().includes(lowered)
                      })
                  })
                : indexedRows
              return (
                <div style={{ flex: 1, minHeight: 0, overflow: "auto", marginBottom: "12px", border: "1px solid #e8ecf4", borderRadius: "8px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ background: "#f1f3f9", borderBottom: "1px solid #e8ecf4" }}>
                        <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#4d5c7b" }}>Class</th>
                        {allKeys.map(key => (
                          <th key={key} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#4d5c7b" }}>
                            {key === "__index" ? "#" : key === "__area" ? "Area (m²)" : key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map(({ row, index }) => {
                        const assignedClassId = rowClassAssignments[index]
                        const assignedClass = assignedClassId != null ? classes.find(c => c.id === assignedClassId) : undefined
                        const rowBg = assignedClass ? `${assignedClass.color}33` : "transparent"
                        return (
                          <tr
                            key={index}
                            style={{
                              borderBottom: "1px solid #f3f4f6",
                              background: rowBg,
                              transition: "background 0.12s ease"
                            }}
                          >
                            <td style={{ padding: "4px 8px" }}>
                              <select
                                className="input"
                                style={{ fontSize: "12px", padding: "4px 8px", minWidth: "100px" }}
                                value={rowClassAssignments[index] != null ? String(rowClassAssignments[index]) : ""}
                                onChange={e => {
                                  const v = e.target.value
                                  setRowClassAssignments(prev => {
                                    const next = [...prev]
                                    next[index] = v === "" ? null : Number(v)
                                    return next
                                  })
                                }}
                              >
                                <option value="">None</option>
                                {classes.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </td>
                            {allKeys.map(key => (
                              <td key={key} style={{ padding: "6px 10px", color: "#1f2d3d" }}>
                                {key === "__area" && row[key] != null
                                  ? typeof row[key] === "number"
                                    ? (row[key] as number) >= 1e6
                                      ? ((row[key] as number) / 1e6).toFixed(2) + " km²"
                                      : (row[key] as number).toFixed(0) + " m²"
                                    : String(row[key])
                                  : String(row[key] ?? "")}
                              </td>
                            ))}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })()}
            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  onImportWithAssignments?.(rowClassAssignments)
                  onCloseImportModal?.()
                }}
                style={{ flex: 1 }}
              >
                Import selected
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onCloseImportModal?.()}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

