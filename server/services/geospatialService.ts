import { GeoBounds, LayerType, LAYER_CONFIGS } from '../../shared/geospatial-schema';

export interface LayerResult<T = any> {
  cityLocode: string;
  layerType: LayerType;
  bounds: GeoBounds;
  data: T;
  geoJson?: any;
  metadata: {
    source: string;
    resolution: number;
    fetchedAt: string;
    processingTime: number;
  };
}

export function getLayerConfig(layerType: LayerType) {
  return LAYER_CONFIGS[layerType];
}

export function calculateBboxArea(bounds: GeoBounds): number {
  const latSpan = bounds.maxLat - bounds.minLat;
  const lngSpan = bounds.maxLng - bounds.minLng;
  const avgLat = (bounds.minLat + bounds.maxLat) / 2;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(avgLat * Math.PI / 180);
  return (latSpan * metersPerDegreeLat) * (lngSpan * metersPerDegreeLng) / 1_000_000;
}

export function expandBounds(bounds: GeoBounds, bufferDegrees: number = 0.01): GeoBounds {
  return {
    minLng: bounds.minLng - bufferDegrees,
    minLat: bounds.minLat - bufferDegrees,
    maxLng: bounds.maxLng + bufferDegrees,
    maxLat: bounds.maxLat + bufferDegrees,
  };
}

export function boundsToPolygon(bounds: GeoBounds): any {
  return {
    type: 'Polygon',
    coordinates: [[
      [bounds.minLng, bounds.minLat],
      [bounds.maxLng, bounds.minLat],
      [bounds.maxLng, bounds.maxLat],
      [bounds.minLng, bounds.maxLat],
      [bounds.minLng, bounds.minLat],
    ]],
  };
}

export function boundsToWkt(bounds: GeoBounds): string {
  return `POLYGON((${bounds.minLng} ${bounds.minLat}, ${bounds.maxLng} ${bounds.minLat}, ${bounds.maxLng} ${bounds.maxLat}, ${bounds.minLng} ${bounds.maxLat}, ${bounds.minLng} ${bounds.minLat}))`;
}
