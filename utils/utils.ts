import Feature from "ol/Feature"
import { PaintClass } from "./types"
import distinctColors from "distinct-colors"

/**
 * Convert hex color to rgba with transparency
 */
export const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Convert RGB array to hex color string
 */
const rgbToHex = (r: number, g: number, b: number): string => {
  return "#" + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16)
    return hex.length === 1 ? "0" + hex : hex
  }).join("")
}

/**
 * Get a distinct color that hasn't been used by existing classes
 * Generates a palette of distinct colors and picks the next available one
 */
export const getNextDistinctColor = (existingClasses: PaintClass[]): string => {
  // Generate a palette of distinct colors (enough for many classes)
  const paletteSize = Math.max(20, existingClasses.length + 10)
  const distinctPalette = distinctColors({ count: paletteSize })
  
  // Convert to hex strings
  const hexPalette = distinctPalette.map(color => {
    const rgb = color.rgb()
    return rgbToHex(rgb[0], rgb[1], rgb[2])
  })
  
  // Find the first color that's not already used
  const usedColors = new Set(existingClasses.map(c => c.color.toLowerCase()))
  
  for (const color of hexPalette) {
    if (!usedColors.has(color.toLowerCase())) {
      return color
    }
  }
  
  // If all colors in palette are used, generate a new one
  // This shouldn't happen often, but just in case
  const newColor = distinctColors({ count: existingClasses.length + 1 })
  const lastColor = newColor[newColor.length - 1]
  const rgb = lastColor.rgb()
  return rgbToHex(rgb[0], rgb[1], rgb[2])
}

/**
 * Get class index for render ordering
 * Higher index = rendered on top
 */
export const getClassIndex = (
  classId: number | null | undefined,
  classes: PaintClass[]
): number => {
  if (classId === null || classId === undefined) return -1
  const index = classes.findIndex(c => c.id === classId)
  if (index === -1) {
    console.log("Class not found:", classId, "Current classes:", classes.map(c => ({ id: c.id, name: c.name })))
  }
  return index >= 0 ? index : -1
}

/**
 * Create render order function that uses current classes
 */
export const createRenderOrderFunction = (classes: PaintClass[]) => {
  return (feature1: Feature, feature2: Feature) => {
    const classId1 = feature1.get("classId")
    const classId2 = feature2.get("classId")
    const index1 = getClassIndex(classId1, classes)
    const index2 = getClassIndex(classId2, classes)
    // Higher index should be rendered on top (positive return value)
    return index2 - index1
  }
}

