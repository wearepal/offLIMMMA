import * as React from "react"

export type LayerType = "osm" | "geotiff" | "vector"

export type LayerInfo = {
  id: string
  name: string
  type: LayerType
  opacity: number
  visible: boolean
  filePath?: string // For GeoTIFF layers
  extent?: [number, number, number, number] // For zoom-to functionality
}

type LayersPanelProps = {
  layers: LayerInfo[]
  onLayersChange: (layers: LayerInfo[]) => void
  onAddGeotiff: () => void
  onZoomToLayer: (extent: [number, number, number, number]) => void
  onRemoveLayer: (id: string) => void
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  layers,
  onLayersChange,
  onAddGeotiff,
  onZoomToLayer,
  onRemoveLayer
}) => {
  const [isCollapsed, setIsCollapsed] = React.useState(false)

  const handleOpacityChange = (id: string, opacity: number) => {
    onLayersChange(
      layers.map(layer => 
        layer.id === id ? { ...layer, opacity } : layer
      )
    )
  }

  const handleVisibilityToggle = (id: string) => {
    onLayersChange(
      layers.map(layer => 
        layer.id === id ? { ...layer, visible: !layer.visible } : layer
      )
    )
  }

  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    const newLayers = [...layers]
    const temp = newLayers[index]
    newLayers[index] = newLayers[index - 1]
    newLayers[index - 1] = temp
    onLayersChange(newLayers)
  }

  const handleMoveDown = (index: number) => {
    if (index >= layers.length - 1) return
    const newLayers = [...layers]
    const temp = newLayers[index]
    newLayers[index] = newLayers[index + 1]
    newLayers[index + 1] = temp
    onLayersChange(newLayers)
  }

  const getLayerIcon = (type: LayerType) => {
    if (type === "osm") {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      )
    }
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21,15 16,10 5,21"/>
      </svg>
    )
  }

  return (
    <div style={{
      position: "absolute",
      bottom: "24px",
      left: "24px",
      width: isCollapsed ? "auto" : "280px",
      background: "white",
      borderRadius: "10px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
      zIndex: 1000,
      overflow: "hidden",
      transition: "width 0.2s ease"
    }}>
      {/* Header */}
      <div 
        style={{
          padding: "10px 14px",
          borderBottom: isCollapsed ? "none" : "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#f8f9fc",
          cursor: "pointer"
        }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a6cf7" strokeWidth="2">
            <polygon points="12,2 2,7 12,12 22,7"/>
            <polyline points="2,17 12,22 22,17"/>
            <polyline points="2,12 12,17 22,12"/>
          </svg>
          <span style={{ fontWeight: 600, color: "#1f2d5c", fontSize: "13px" }}>Layers</span>
          <span style={{
            background: "#e0e7ff",
            color: "#4a6cf7",
            fontSize: "11px",
            padding: "2px 6px",
            borderRadius: "10px",
            fontWeight: 600
          }}>{layers.length}</span>
        </div>
        <svg 
          width="16" 
          height="16" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="#6b7280" 
          strokeWidth="2"
          style={{ 
            transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease"
          }}
        >
          <polyline points="6,9 12,15 18,9"/>
        </svg>
      </div>

      {!isCollapsed && (
        <>
          {/* Layers List */}
          <div style={{ maxHeight: "250px", overflowY: "auto" }}>
            {layers.map((layer, index) => (
              <div 
                key={layer.id} 
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid #f3f4f6",
                  background: layer.visible ? "white" : "#fafafa"
                }}
              >
                {/* Layer Header */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px"
                }}>
                  {/* Visibility Toggle */}
                  <button
                    onClick={() => handleVisibilityToggle(layer.id)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "2px",
                      color: layer.visible ? "#4a6cf7" : "#d1d5db",
                      display: "flex",
                      alignItems: "center"
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
                  <span style={{ color: layer.type === "osm" ? "#22c55e" : "#4a6cf7" }}>
                    {getLayerIcon(layer.type)}
                  </span>

                  {/* Layer Name */}
                  <span style={{
                    flex: 1,
                    fontSize: "12px",
                    color: layer.visible ? "#374151" : "#9ca3af",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }} title={layer.name}>
                    {layer.name}
                  </span>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "2px" }}>
                    {/* Move Up */}
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: index === 0 ? "default" : "pointer",
                        padding: "2px",
                        color: index === 0 ? "#e5e7eb" : "#9ca3af",
                        display: "flex"
                      }}
                      title="Move up"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="18,15 12,9 6,15"/>
                      </svg>
                    </button>

                    {/* Move Down */}
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === layers.length - 1}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: index === layers.length - 1 ? "default" : "pointer",
                        padding: "2px",
                        color: index === layers.length - 1 ? "#e5e7eb" : "#9ca3af",
                        display: "flex"
                      }}
                      title="Move down"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6,9 12,15 18,9"/>
                      </svg>
                    </button>

                    {/* Zoom to (only for GeoTIFF) */}
                    {layer.type === "geotiff" && layer.extent && (
                      <button
                        onClick={() => onZoomToLayer(layer.extent!)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "2px",
                          color: "#9ca3af",
                          display: "flex"
                        }}
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

                    {/* Remove (only for GeoTIFF) */}
                    {layer.type === "geotiff" && (
                      <button
                        onClick={() => onRemoveLayer(layer.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "2px",
                          color: "#ef4444",
                          display: "flex"
                        }}
                        title="Remove layer"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/>
                          <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Opacity Slider */}
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "8px",
                  paddingLeft: "24px"
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
                    onChange={(e) => handleOpacityChange(layer.id, parseFloat(e.target.value))}
                    disabled={!layer.visible}
                    style={{ 
                      flex: 1,
                      height: "4px",
                      cursor: layer.visible ? "pointer" : "default"
                    }}
                  />
                  <span style={{ 
                    fontSize: "10px", 
                    color: "#9ca3af", 
                    width: "32px",
                    textAlign: "right"
                  }}>
                    {Math.round(layer.opacity * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Add GeoTIFF Button */}
          <div style={{
            padding: "10px 14px",
            borderTop: "1px solid #e5e7eb",
            background: "#f8f9fc"
          }}>
            <button
              onClick={onAddGeotiff}
              style={{
                width: "100%",
                padding: "8px",
                fontSize: "12px",
                background: "#4a6cf7",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px"
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add GeoTIFF Layer
            </button>
          </div>
        </>
      )}
    </div>
  )
}

