import { fromArrayBuffer } from 'geotiff'
import ImageLayer from 'ol/layer/Image'
import ImageStatic from 'ol/source/ImageStatic'
import { transformExtent } from 'ol/proj'

export type GeoTIFFLayer = {
  layer: ImageLayer<ImageStatic>
  name: string
  filePath: string
  extent: [number, number, number, number]
  opacity: number
}

// Maximum pixels to render (to prevent memory issues with canvas)
const MAX_RENDER_PIXELS = 4096 * 4096 // ~64MB for RGBA

/**
 * Load a GeoTIFF from ArrayBuffer with automatic downsampling for large images
 */
export async function loadGeoTIFF(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  filePath: string
): Promise<GeoTIFFLayer> {
  // Parse the GeoTIFF
  const tiff = await fromArrayBuffer(arrayBuffer)
  const image = await tiff.getImage()
  
  // Get image dimensions
  const fullWidth = image.getWidth()
  const fullHeight = image.getHeight()
  const totalPixels = fullWidth * fullHeight
  
  // Calculate downsampling factor if image is too large for rendering
  let scale = 1
  if (totalPixels > MAX_RENDER_PIXELS) {
    scale = Math.sqrt(MAX_RENDER_PIXELS / totalPixels)
  }
  
  const width = Math.floor(fullWidth * scale)
  const height = Math.floor(fullHeight * scale)
  
  console.log(`GeoTIFF: ${fullWidth}x${fullHeight} -> ${width}x${height} (scale: ${scale.toFixed(3)})`)
  
  // Get the bounding box from the GeoTIFF
  const bbox = image.getBoundingBox()
  
  // Get the GeoTIFF's CRS info
  const geoKeys = image.getGeoKeys()
  
  // Determine the source projection
  let sourceProj = 'EPSG:4326'
  
  if (geoKeys) {
    if (geoKeys.ProjectedCSTypeGeoKey) {
      sourceProj = `EPSG:${geoKeys.ProjectedCSTypeGeoKey}`
    } else if (geoKeys.GeographicTypeGeoKey) {
      sourceProj = `EPSG:${geoKeys.GeographicTypeGeoKey}`
    }
  }
  
  // Read the raster data with optional downsampling
  // The geotiff library handles this efficiently
  const rasters = await image.readRasters({
    width,
    height,
    resampleMethod: 'bilinear'
  })
  
  // Create a canvas to render the image
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  
  // Create ImageData
  const imageData = ctx.createImageData(width, height)
  const data = imageData.data
  
  // Determine if it's RGB, RGBA, or single band
  const samplesPerPixel = image.getSamplesPerPixel()
  
  if (samplesPerPixel >= 3) {
    // RGB or RGBA image
    const red = rasters[0] as Uint8Array | Uint16Array | Float32Array
    const green = rasters[1] as Uint8Array | Uint16Array | Float32Array
    const blue = rasters[2] as Uint8Array | Uint16Array | Float32Array
    const alpha = samplesPerPixel >= 4 ? rasters[3] as Uint8Array | Uint16Array | Float32Array : null
    
    // Get max value for normalization
    const bitsPerSample = image.getBitsPerSample()
    const maxVal = bitsPerSample === 8 ? 255 : bitsPerSample === 16 ? 65535 : 1
    
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4
      data[idx] = Math.round((Number(red[i]) / maxVal) * 255)
      data[idx + 1] = Math.round((Number(green[i]) / maxVal) * 255)
      data[idx + 2] = Math.round((Number(blue[i]) / maxVal) * 255)
      data[idx + 3] = alpha ? Math.round((Number(alpha[i]) / maxVal) * 255) : 255
    }
  } else {
    // Single band - render as grayscale
    const band = rasters[0] as Uint8Array | Uint16Array | Float32Array
    
    // Find min/max for normalization
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < band.length; i++) {
      const val = Number(band[i])
      if (isFinite(val)) {
        if (val < min) min = val
        if (val > max) max = val
      }
    }
    
    const range = max - min || 1
    
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4
      const val = Number(band[i])
      const normalized = isFinite(val) ? Math.round(((val - min) / range) * 255) : 0
      
      data[idx] = normalized
      data[idx + 1] = normalized
      data[idx + 2] = normalized
      data[idx + 3] = isFinite(val) && val !== 0 ? 255 : 0
    }
  }
  
  ctx.putImageData(imageData, 0, 0)
  
  // Convert canvas to data URL (PNG)
  const dataUrl = canvas.toDataURL('image/png')
  
  // Transform extent to Web Mercator (EPSG:3857)
  let extent: [number, number, number, number]
  try {
    extent = transformExtent(bbox, sourceProj, 'EPSG:3857') as [number, number, number, number]
  } catch (e) {
    console.warn(`Could not transform from ${sourceProj}, assuming EPSG:4326`)
    extent = transformExtent(bbox, 'EPSG:4326', 'EPSG:3857') as [number, number, number, number]
  }
  
  // Create OpenLayers layer
  const layer = new ImageLayer({
    source: new ImageStatic({
      url: dataUrl,
      imageExtent: extent,
    }),
    opacity: 0.7
  })
  
  return {
    layer,
    name: fileName,
    filePath,
    extent,
    opacity: 0.7
  }
}
