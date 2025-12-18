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
  const newColor = distinctColors({ count: existingClasses.length + 1 })
  const lastColor = newColor[newColor.length - 1]
  const rgb = lastColor.rgb()
  return rgbToHex(rgb[0], rgb[1], rgb[2])
}


