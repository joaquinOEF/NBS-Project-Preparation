// Builds postprocessed Leaflet layers by filtering vector features against
// raster tile values. Runs entirely client-side: fetches GeoJSON, samples
// value tiles at each feature's centroid, keeps features that pass the threshold.

import L from "leaflet";
import { TILE_LAYERS, LOCAL_RISK_LAYERS, type SpatialQueryDef } from "@shared/geospatial-layers";
import { sampleRasterAtPoint, geometryCentroid } from "./valueTileUtils";

function compareValue(value: number, threshold: number, comparator: string): boolean {
  switch (comparator) {
    case '>': return value > threshold;
    case '>=': return value >= threshold;
    case '<': return value < threshold;
    case '<=': return value <= threshold;
    default: return value > threshold;
  }
}

export interface SpatialQueryResult {
  layer: L.GeoJSON;
  featureCount: number;
  totalSampled: number;
}

export async function buildSpatialQueryLayer(
  query: SpatialQueryDef,
  onProgress?: (sampled: number, total: number) => void,
): Promise<SpatialQueryResult | null> {
  // Fetch vector data
  const res = await fetch(query.vectorSource);
  if (!res.ok) return null;
  const geojson = await res.json();
  const features = geojson?.features;
  if (!features || features.length === 0) return null;

  // Find raster encoding (check both S3 tile layers and local risk layers)
  const allLayers = [...TILE_LAYERS, ...LOCAL_RISK_LAYERS];
  const rasterLayer = allLayers.find(l => l.id === query.rasterLayerId);
  const enc = rasterLayer?.valueEncoding;
  if (!enc?.urlTemplate) return null;

  // Sample raster at each feature's centroid
  const passed: any[] = [];
  const total = features.length;

  for (let i = 0; i < total; i++) {
    const feature = features[i];
    const centroid = geometryCentroid(feature.geometry);
    if (!centroid) continue;

    const value = await sampleRasterAtPoint(centroid[0], centroid[1], enc, 11);
    if (value !== null && compareValue(value, query.threshold, query.comparator)) {
      passed.push({
        ...feature,
        properties: { ...feature.properties, [query.valueKey]: value },
      });
    }

    if (onProgress && (i % 10 === 0 || i === total - 1)) {
      onProgress(i + 1, total);
    }
  }

  if (passed.length === 0) return null;

  // Build styled layer
  const unit = enc.unit || '';
  const layer = L.geoJSON(
    { type: "FeatureCollection", features: passed } as any,
    {
      style: {
        color: query.color,
        fillColor: query.color,
        fillOpacity: 0.6,
        weight: 2,
        opacity: 1,
      },
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
        radius: 7,
        color: query.color,
        fillColor: query.color,
        fillOpacity: 0.7,
        weight: 2,
      }),
      onEachFeature: (feature: any, layer: L.Layer) => {
        const p = feature.properties || {};
        const name = p.name || p.amenity || p.leisure || p.natural || 'Feature';
        const val = p[query.valueKey]?.toFixed(enc.unit === 'index 0–1' ? 3 : 1) ?? '?';
        (layer as any).bindTooltip(
          `<div style="font-family:system-ui;font-size:11px;">
            <strong style="color:${query.color}">${query.tooltipIcon} ${query.tooltipLabel}</strong><br/>
            <strong>${name}</strong><br/>
            ${rasterLayer?.name}: <strong>${val} ${unit}</strong>
            <span style="color:#94a3b8">(threshold: ${query.threshold})</span>
           </div>`,
          { sticky: true }
        );
      },
    }
  );

  return { layer, featureCount: passed.length, totalSampled: total };
}
