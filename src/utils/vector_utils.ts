// @ts-ignore - no types for shpjs
import shp from 'shpjs'
import JSZip from 'jszip'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'
import KML from 'ol/format/KML'
import { Style, Fill, Stroke, Circle } from 'ol/style'
import Feature from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'

export type VectorFileLayer = {
  layer: VectorLayer<VectorSource<Feature<Geometry>>>
  name: string
  filePath: string
  extent: [number, number, number, number]
  opacity: number
  featureCount: number
}

export type ShapefileData = {
  shp: ArrayBuffer
  dbf: ArrayBuffer | null
  prj: string | null
  shx: ArrayBuffer | null
}

// Generate a random color for vector styling
function getRandomColor(): string {
  const colors = [
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
    '#ffff33', '#a65628', '#f781bf', '#999999', '#66c2a5',
    '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f'
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

// Create a style for vector features
function createVectorStyle(color: string): Style {
  return new Style({
    fill: new Fill({
      color: color + '40' // 25% opacity
    }),
    stroke: new Stroke({
      color: color,
      width: 2
    }),
    image: new Circle({
      radius: 6,
      fill: new Fill({ color: color }),
      stroke: new Stroke({ color: '#ffffff', width: 1 })
    })
  })
}

/**
 * Load a Shapefile from individual component files (.shp, .dbf, .prj)
 * Creates a zip in memory and passes to shpjs
 */
export async function loadShapefileFromComponents(
  shapefileData: ShapefileData,
  fileName: string,
  filePath: string
): Promise<VectorFileLayer> {
  // shpjs needs a zip file, so we create one in memory
  const baseName = fileName.replace(/\.shp$/i, '')
  
  const zip = new JSZip()
  zip.file(`${baseName}.shp`, shapefileData.shp)
  
  if (shapefileData.dbf) {
    zip.file(`${baseName}.dbf`, shapefileData.dbf)
  }
  
  if (shapefileData.prj) {
    zip.file(`${baseName}.prj`, shapefileData.prj)
  }
  
  if (shapefileData.shx) {
    zip.file(`${baseName}.shx`, shapefileData.shx)
  }
  
  // Generate zip as ArrayBuffer
  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })
  
  // Parse using shpjs
  const geojson = await shp(zipBuffer)
  
  // Handle both single layer and multiple layers
  const featureCollection = Array.isArray(geojson) ? geojson[0] : geojson
  
  if (!featureCollection || !featureCollection.features || featureCollection.features.length === 0) {
    throw new Error('No features found in shapefile')
  }
  
  // Create GeoJSON format for OpenLayers
  const format = new GeoJSON()
  
  // Parse features and transform to Web Mercator
  const olFeatures = format.readFeatures(featureCollection, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }) as Feature<Geometry>[]
  
  // Create vector source
  const source = new VectorSource<Feature<Geometry>>({
    features: olFeatures
  })
  
  // Get random color for this layer
  const color = getRandomColor()
  
  // Create vector layer
  const layer = new VectorLayer({
    source: source,
    style: createVectorStyle(color),
    opacity: 0.8
  })
  
  // Calculate extent
  const extent = source.getExtent() as [number, number, number, number]
  
  return {
    layer,
    name: baseName,
    filePath,
    extent,
    opacity: 0.8,
    featureCount: olFeatures.length
  }
}

/**
 * Parse a shapefile (from component files) to OpenLayers features in Web Mercator.
 * Used when adding shapefile features into a paint class.
 */
export async function parseShapefileToOlFeaturesFromComponents(
  shapefileData: ShapefileData,
  fileName: string
): Promise<Feature<Geometry>[]> {
  const baseName = fileName.replace(/\.shp$/i, '')
  const zip = new JSZip()
  zip.file(`${baseName}.shp`, shapefileData.shp)
  if (shapefileData.dbf) zip.file(`${baseName}.dbf`, shapefileData.dbf)
  if (shapefileData.prj) zip.file(`${baseName}.prj`, shapefileData.prj)
  if (shapefileData.shx) zip.file(`${baseName}.shx`, shapefileData.shx)
  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })
  const geojson = await shp(zipBuffer)
  const featureCollection = Array.isArray(geojson) ? geojson[0] : geojson
  if (!featureCollection?.features?.length) throw new Error('No features found in shapefile')
  const format = new GeoJSON()
  return format.readFeatures(featureCollection, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }) as Feature<Geometry>[]
}

/**
 * Parse a shapefile from a ZIP to OpenLayers features in Web Mercator.
 */
export async function parseShapefileToOlFeaturesFromZip(
  arrayBuffer: ArrayBuffer
): Promise<Feature<Geometry>[]> {
  const geojson = await shp(arrayBuffer)
  const featureCollection = Array.isArray(geojson) ? geojson[0] : geojson
  if (!featureCollection?.features?.length) throw new Error('No features found in shapefile')
  const format = new GeoJSON()
  return format.readFeatures(featureCollection, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }) as Feature<Geometry>[]
}

/**
 * Load a Shapefile from a ZIP file
 */
export async function loadShapefileFromZip(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  filePath: string
): Promise<VectorFileLayer> {
  // Parse shapefile - shpjs expects a zip file
  const geojson = await shp(arrayBuffer)
  
  // Handle both single layer and multiple layers
  const featureCollection = Array.isArray(geojson) ? geojson[0] : geojson
  
  if (!featureCollection || !featureCollection.features || featureCollection.features.length === 0) {
    throw new Error('No features found in shapefile')
  }
  
  // Create GeoJSON format for OpenLayers
  const format = new GeoJSON()
  
  // Parse features and transform to Web Mercator
  const olFeatures = format.readFeatures(featureCollection, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }) as Feature<Geometry>[]
  
  // Create vector source
  const source = new VectorSource<Feature<Geometry>>({
    features: olFeatures
  })
  
  // Get random color for this layer
  const color = getRandomColor()
  
  // Create vector layer
  const layer = new VectorLayer({
    source: source,
    style: createVectorStyle(color),
    opacity: 0.8
  })
  
  // Calculate extent
  const extent = source.getExtent() as [number, number, number, number]
  
  return {
    layer,
    name: fileName.replace(/\.(zip|shp)$/i, ''),
    filePath,
    extent,
    opacity: 0.8,
    featureCount: olFeatures.length
  }
}

/**
 * Load a GeoJSON file
 */
export async function loadGeoJSONFile(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  filePath: string
): Promise<VectorFileLayer> {
  // Convert ArrayBuffer to string
  const decoder = new TextDecoder('utf-8')
  const jsonString = decoder.decode(arrayBuffer)
  const geojson = JSON.parse(jsonString)
  
  // Create GeoJSON format for OpenLayers
  const format = new GeoJSON()
  
  // Parse features and transform to Web Mercator
  const olFeatures = format.readFeatures(geojson, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }) as Feature<Geometry>[]
  
  if (olFeatures.length === 0) {
    throw new Error('No features found in GeoJSON')
  }
  
  // Create vector source
  const source = new VectorSource<Feature<Geometry>>({
    features: olFeatures
  })
  
  // Get random color for this layer
  const color = getRandomColor()
  
  // Create vector layer
  const layer = new VectorLayer({
    source: source,
    style: createVectorStyle(color),
    opacity: 0.8
  })
  
  // Calculate extent
  const extent = source.getExtent() as [number, number, number, number]
  
  return {
    layer,
    name: fileName.replace(/\.(geojson|json)$/i, ''),
    filePath,
    extent,
    opacity: 0.8,
    featureCount: olFeatures.length
  }
}

/**
 * Load a KML file
 */
export async function loadKMLFile(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  filePath: string
): Promise<VectorFileLayer> {
  // Convert ArrayBuffer to string
  const decoder = new TextDecoder('utf-8')
  const kmlString = decoder.decode(arrayBuffer)

  // Parse KML. Most KML is EPSG:4326; we project features into EPSG:3857.
  const format = new KML({
    extractStyles: true
  })

  const olFeatures = format.readFeatures(kmlString, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }) as Feature<Geometry>[]

  if (olFeatures.length === 0) {
    throw new Error('No features found in KML')
  }

  const source = new VectorSource<Feature<Geometry>>({
    features: olFeatures
  })

  // If the KML contains styles, let them render; otherwise provide a default style.
  const hasAnyStyle = olFeatures.some((f) => typeof (f as any).getStyleFunction?.() === 'function' || typeof (f as any).getStyle?.() === 'function')
  const color = getRandomColor()

  const layer = new VectorLayer({
    source,
    style: hasAnyStyle ? undefined : createVectorStyle(color),
    opacity: 0.8
  })

  const extent = source.getExtent() as [number, number, number, number]

  return {
    layer,
    name: fileName.replace(/\.kml$/i, ''),
    filePath,
    extent,
    opacity: 0.8,
    featureCount: olFeatures.length
  }
}

/**
 * Parse an array of GeoJSON features (e.g. from GeoPackage) to OpenLayers features in Web Mercator.
 */
export function parseGeoJSONFeaturesToOlFeatures(geoJsonFeatures: Array<{ type?: string; geometry: unknown; properties?: Record<string, unknown> }>): Feature<Geometry>[] {
  if (!geoJsonFeatures || geoJsonFeatures.length === 0) return []
  const featureCollection = { type: 'FeatureCollection' as const, features: geoJsonFeatures }
  const format = new GeoJSON()
  return format.readFeatures(featureCollection, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }) as Feature<Geometry>[]
}

/**
 * Parse a KML file buffer to OpenLayers features in Web Mercator.
 */
export function parseKMLToOlFeatures(arrayBuffer: ArrayBuffer): Feature<Geometry>[] {
  const decoder = new TextDecoder('utf-8')
  const kmlString = decoder.decode(arrayBuffer)
  const format = new KML({ extractStyles: true })
  return format.readFeatures(kmlString, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  }) as Feature<Geometry>[]
}

/**
 * Build table rows from OL features for display: index, area (m²), and attribute properties.
 */
export function buildTableRowsFromFeatures(olFeatures: Feature<Geometry>[]): Record<string, unknown>[] {
  return olFeatures.map((f, i) => {
    const props = f.getProperties()
    const geom = f.getGeometry()
    let area: number | null = null
    if (geom && typeof (geom as any).getArea === 'function') {
      area = (geom as any).getArea()
    }
    const row: Record<string, unknown> = { __index: i + 1, __area: area }
    for (const [k, v] of Object.entries(props)) {
      if (k === 'geometry' || k === 'geom') continue
      row[k] = v
    }
    return row
  })
}
