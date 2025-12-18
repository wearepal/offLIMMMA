import VectorSource from "ol/source/Vector"
import Polygon from "ol/geom/Polygon"
import Feature from "ol/Feature"
import GeoJSON from "ol/format/GeoJSON"
import { PaintClass } from "./types"

type MergeOptions = {
  vectorSource: VectorSource
  geoJsonFormat: GeoJSON
  selectedClass: PaintClass | null
  opacity: number
}

/**
 * Merge overlapping polygons of the same class using JSTS
 */
export const mergeOverlappingPolygons = (
  newPolygon: Polygon,
  classId: number,
  options: MergeOptions
): Feature[] => {
  const { vectorSource, geoJsonFormat, selectedClass, opacity } = options
  
  // Check if JSTS is available as global
  const jsts = (window as any).jsts
  if (!jsts || !jsts.io || !jsts.io.GeoJSONReader) {
    console.warn("JSTS not available, skipping merge operation")
    return []
  }
  
  try {
    const jstsReader = new jsts.io.GeoJSONReader()
    const jstsWriter = new jsts.io.GeoJSONWriter()
    
    // Get all existing features of the same class
    const existingFeatures = vectorSource.getFeatures().filter(feature => {
      const featureClassId = feature.get("classId")
      const geometry = feature.getGeometry()
      return featureClassId === classId && geometry instanceof Polygon
    })
    
    if (existingFeatures.length === 0) {
      return [] // No overlapping features to merge
    }
    
    // Convert new polygon to JSTS geometry
    const newPolygonGeoJson = geoJsonFormat.writeGeometryObject(newPolygon)
    let newJstsGeometry = jstsReader.read(newPolygonGeoJson)
    
    // Clean the geometry with a buffer of 0 to fix topology issues
    // This helps resolve precision problems that cause TopologyException
    try {
      newJstsGeometry = newJstsGeometry.buffer(0)
    } catch (e) {
      console.warn("Could not buffer new geometry, using as-is:", e)
    }
    
    // Find overlapping features and collect geometries to merge
    const geometriesToMerge: any[] = [newJstsGeometry]
    const featuresToRemove: Feature[] = []
    
    existingFeatures.forEach(feature => {
      const geometry = feature.getGeometry() as Polygon
      const featureGeoJson = geoJsonFormat.writeGeometryObject(geometry)
      let jstsGeometry = jstsReader.read(featureGeoJson)
      
      // Clean the geometry with buffer(0) to fix topology issues
      try {
        jstsGeometry = jstsGeometry.buffer(0)
      } catch (e) {
        console.warn("Could not buffer existing geometry, using as-is:", e)
      }
      
      // Check if geometries overlap (intersect or touch)
      if (newJstsGeometry.intersects(jstsGeometry) || newJstsGeometry.touches(jstsGeometry)) {
        geometriesToMerge.push(jstsGeometry)
        featuresToRemove.push(feature)
      }
    })
    
    if (featuresToRemove.length === 0) {
      return [] // No overlaps found
    }
    
    // Merge all overlapping geometries using union
    // For multiple geometries, use a cascaded union approach
    let mergedGeometry: any
    
    if (geometriesToMerge.length === 1) {
      mergedGeometry = geometriesToMerge[0]
    } else {
      // Use cascaded union for better performance and reliability with multiple geometries
      // First, try using UnaryUnionOp if available
      try {
        const UnaryUnionOp = jsts.operation.union?.UnaryUnionOp
        if (UnaryUnionOp) {
          // Create a geometry collection from all geometries
          const geomFactory = newJstsGeometry.getFactory()
          const geometryCollection = geomFactory.createGeometryCollection(geometriesToMerge)
          mergedGeometry = UnaryUnionOp.union(geometryCollection)
        } else {
          throw new Error("UnaryUnionOp not available")
        }
      } catch (e) {
        // Fallback: use cascaded union (merge in pairs, then merge results)
        // This is more stable than sequential union
        console.log("Using cascaded union fallback for", geometriesToMerge.length, "geometries")
        
        // Create a list to hold intermediate results
        let geometries = [...geometriesToMerge]
        
        // Merge in pairs until we have one geometry
        while (geometries.length > 1) {
          const nextGeometries: any[] = []
          
          // Process pairs
          for (let i = 0; i < geometries.length; i += 2) {
            if (i + 1 < geometries.length) {
              // Merge pair
              try {
                const merged = geometries[i].union(geometries[i + 1])
                // Clean the merged result
                try {
                  nextGeometries.push(merged.buffer(0))
                } catch {
                  nextGeometries.push(merged)
                }
              } catch (e) {
                console.warn("Union failed for pair, trying with buffer:", e)
                // Try buffering both before union
                try {
                  const buffered1 = geometries[i].buffer(0)
                  const buffered2 = geometries[i + 1].buffer(0)
                  const merged = buffered1.union(buffered2)
                  nextGeometries.push(merged.buffer(0))
                } catch (e2) {
                  // If still fails, just add both (shouldn't happen but be safe)
                  console.error("Union completely failed, keeping both geometries:", e2)
                  nextGeometries.push(geometries[i])
                  nextGeometries.push(geometries[i + 1])
                }
              }
            } else {
              // Odd one out, add it as-is
              nextGeometries.push(geometries[i])
            }
          }
          
          geometries = nextGeometries
        }
        
        mergedGeometry = geometries[0]
      }
    }
    
    // Clean the merged result with buffer(0) to ensure valid geometry
    try {
      mergedGeometry = mergedGeometry.buffer(0)
    } catch (e) {
      console.warn("Could not buffer merged geometry:", e)
    }
    
    // Convert merged geometry back to OpenLayers format
    const mergedGeoJson = jstsWriter.write(mergedGeometry)
    const mergedOlGeometry = geoJsonFormat.readGeometry(mergedGeoJson, {
      dataProjection: 'EPSG:3857',
      featureProjection: 'EPSG:3857'
    }) as Polygon
    
    // Remove overlapping features
    featuresToRemove.forEach(feature => {
      vectorSource.removeFeature(feature)
    })
    
    // Create new merged feature
    const mergedFeature = new Feature({
      geometry: mergedOlGeometry
    })
    // Get current selectedClass from the first feature being merged (they should all have the same class)
    const firstFeature = featuresToRemove[0]
    mergedFeature.set("strokeColor", selectedClass?.color || firstFeature?.get("strokeColor") || "#ff7f50")
    mergedFeature.set("opacity", firstFeature?.get("opacity") ?? opacity)
    mergedFeature.set("classId", classId)
    
    return [mergedFeature]
  } catch (error) {
    console.error("Error merging polygons:", error)
    return []
  }
}

