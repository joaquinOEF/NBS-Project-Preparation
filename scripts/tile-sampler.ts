/**
 * Server-side tile value sampler.
 * Fetches PNG value tiles from S3, decodes RGB→numeric values.
 * Used by recalc-scores-v2.ts to sample FRI, HWM, CHIRPS, Dynamic World
 * at grid cell centroids.
 */

import { PNG } from 'pngjs';

const S3_BASE = 'https://geo-test-api.s3.us-east-1.amazonaws.com';

// ── Tile coordinate conversion (same as client-side valueTileUtils.ts) ────────
export function latLngToTilePixel(lat: number, lng: number, z: number) {
  const n = Math.pow(2, z);
  const latR = (lat * Math.PI) / 180;
  const mercY = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2;

  const tileX = Math.floor(((lng + 180) / 360) * n);
  const tileY = Math.floor(mercY * n);
  const px = Math.floor((((lng + 180) / 360) * n - tileX) * 256);
  const py = Math.floor((mercY * n - tileY) * 256);

  return {
    tileX: Math.max(0, Math.min(n - 1, tileX)),
    tileY: Math.max(0, Math.min(n - 1, tileY)),
    px: Math.max(0, Math.min(255, px)),
    py: Math.max(0, Math.min(255, py)),
  };
}

// ── Layer definitions with value tile encoding ────────────────────────────────
export interface LayerEncoding {
  id: string;
  name: string;
  type: 'numeric' | 'categorical';
  scale?: number;
  offset?: number;
  unit?: string;
  urlTemplate: string;
  classes?: Record<number, string>;
  channel?: 'rgb' | 'r' | 'g' | 'b'; // Which channel(s) to decode (default: rgb = R+256G+65536B)
}

const vtUrl = (path: string) => `${S3_BASE}/${path}/tiles_values/{z}/{x}/{y}.png`;

export const SAMPLE_LAYERS: LayerEncoding[] = [
  // Flood Risk Index
  { id: 'fri_2024', name: 'Flood Risk Index 2024', type: 'numeric', scale: 100, offset: 6, unit: 'index 0–1',
    urlTemplate: vtUrl('nbs/porto_alegre/climate_hazards/floods/flood_risk_index/oef_calculation/2024') },

  // Heatwave Magnitude
  { id: 'hwm_2024', name: 'Heatwave Magnitude 2024', type: 'numeric', scale: 100, offset: 600, unit: '°C·days',
    urlTemplate: vtUrl('nbs/porto_alegre/climate_hazards/heatwave_indices/hwm/2024') },

  // Precipitation extremes (key ones)
  { id: 'chirps_rx1day_2024', name: 'Max 1-Day Precip 2024', type: 'numeric', scale: 100, offset: 6459, unit: 'mm',
    urlTemplate: vtUrl('nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/2024/rx1day') },
  { id: 'chirps_r99p_2024', name: 'Precip 99th Percentile 2024', type: 'numeric', scale: 100, offset: 12196, unit: 'mm',
    urlTemplate: vtUrl('nbs/porto_alegre/climate_hazards/extreme_precipitation/chirps/V2_0/2024/r99p') },

  // Land use (categorical)
  { id: 'dynamic_world', name: 'Land Use (Dynamic World)', type: 'categorical',
    urlTemplate: vtUrl('dynamic_world/release/v1/2023/porto_alegre'),
    classes: { 0: 'Water', 1: 'Trees', 2: 'Grass', 3: 'Flooded veg', 4: 'Crops', 5: 'Shrub', 6: 'Built', 7: 'Bare', 8: 'Snow' } },

  // MERIT Hydro — critical for flood modeling
  { id: 'merit_hand', name: 'MERIT HAND (m above drainage)', type: 'numeric', scale: 1, offset: 0, unit: 'm',
    urlTemplate: vtUrl('merit_hydro/release/v1/porto_alegre/hnd') },
  { id: 'merit_elv', name: 'MERIT Elevation', type: 'numeric', scale: 100, offset: 0, unit: 'm',
    urlTemplate: vtUrl('merit_hydro/release/v1/porto_alegre/elv') },
  { id: 'merit_upa', name: 'MERIT Upstream Area', type: 'numeric', scale: 1, offset: 0, unit: 'cells',
    urlTemplate: vtUrl('merit_hydro/release/v1/porto_alegre/upa') },

  // Copernicus 2024 flood depth (encoded in B channel)
  { id: 'flood_depth_2024', name: '2024 Flood Depth (Copernicus)', type: 'numeric', scale: 1, offset: 0, unit: 'cm',
    urlTemplate: vtUrl('copernicus_emsn194/release/v1/2024/porto_alegre'), channel: 'b' },

  // Future projections
  { id: 'fri_2050s_585', name: 'FRI 2050s SSP5-8.5', type: 'numeric', scale: 100, offset: 0, unit: 'index 0–1',
    urlTemplate: vtUrl('nbs/porto_alegre/climate_hazards/floods/flood_risk_index/oef_calculation/2050s_ssp585') },
  { id: 'hwm_2030s_245', name: 'HWM 2030s SSP2-4.5', type: 'numeric', scale: 100, offset: 1035, unit: '°C·days',
    urlTemplate: vtUrl('nbs/porto_alegre/climate_hazards/heatwave_indices/hwm/2030s_ssp245') },
];

// ── Tile cache ────────────────────────────────────────────────────────────────
const tileCache = new Map<string, Buffer | null>();
const pendingFetches = new Map<string, Promise<Buffer | null>>();

async function fetchTileBuffer(url: string): Promise<Buffer | null> {
  if (tileCache.has(url)) return tileCache.get(url)!;
  if (pendingFetches.has(url)) return pendingFetches.get(url)!;

  const promise = (async () => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) { tileCache.set(url, null); return null; }
      const buffer = Buffer.from(await response.arrayBuffer());
      tileCache.set(url, buffer);
      return buffer;
    } catch {
      tileCache.set(url, null);
      return null;
    }
  })();

  pendingFetches.set(url, promise);
  const result = await promise;
  pendingFetches.delete(url);
  return result;
}

function decodePNG(buffer: Buffer): { width: number; height: number; data: Uint8Array } | null {
  try {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data };
  } catch {
    return null;
  }
}

// ── Sample a single value at lat/lng ──────────────────────────────────────────
export async function sampleValue(
  lat: number, lng: number,
  layer: LayerEncoding,
  z = 11
): Promise<number | null> {
  const { tileX, tileY, px, py } = latLngToTilePixel(lat, lng, z);
  const url = layer.urlTemplate
    .replace('{z}', String(z))
    .replace('{x}', String(tileX))
    .replace('{y}', String(tileY));

  const buffer = await fetchTileBuffer(url);
  if (!buffer) return null;

  const png = decodePNG(buffer);
  if (!png) return null;

  const i = (py * 256 + px) * 4;
  const r = png.data[i];
  const g = png.data[i + 1];
  const b = png.data[i + 2];
  const a = png.data[i + 3];

  if (a < 10) return null; // nodata

  if (layer.type === 'categorical') return r;

  // Channel selection
  let raw: number;
  switch (layer.channel) {
    case 'r': raw = r; break;
    case 'g': raw = g; break;
    case 'b': raw = b; break;
    default: raw = r + 256 * g + 65536 * b; break;
  }
  const scale = layer.scale ?? 100;
  const offset = layer.offset ?? 0;
  const value = (raw + offset) / scale;
  return isFinite(value) ? value : null;
}

// ── Batch sample all layers at a single point ─────────────────────────────────
export async function sampleAllLayers(
  lat: number, lng: number,
  layers: LayerEncoding[] = SAMPLE_LAYERS,
  z = 11
): Promise<Record<string, number | null>> {
  const results: Record<string, number | null> = {};
  await Promise.all(
    layers.map(async (layer) => {
      results[layer.id] = await sampleValue(lat, lng, layer, z);
    })
  );
  return results;
}

// ── Sample with grid-level averaging (sample multiple points within cell) ─────
export async function sampleCellAverage(
  lat: number, lng: number,
  cellSizeKm: number,
  layer: LayerEncoding,
  z = 11,
  samples = 5 // 5x5 grid within cell
): Promise<number | null> {
  const halfDeg = (cellSizeKm / 111) / 2;
  const values: number[] = [];

  for (let dy = 0; dy < samples; dy++) {
    for (let dx = 0; dx < samples; dx++) {
      const sLat = lat - halfDeg + (dy / (samples - 1)) * halfDeg * 2;
      const sLng = lng - halfDeg + (dx / (samples - 1)) * halfDeg * 2;
      const v = await sampleValue(sLat, sLng, layer, z);
      if (v !== null) values.push(v);
    }
  }

  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ── CLI test ──────────────────────────────────────────────────────────────────
if (process.argv[1]?.includes('tile-sampler')) {
  (async () => {
    // Test: sample all layers at Porto Alegre city center
    const lat = -30.0346;
    const lng = -51.2177;
    console.log(`Sampling at Porto Alegre center (${lat}, ${lng})...\n`);

    for (const layer of SAMPLE_LAYERS) {
      const value = await sampleValue(lat, lng, layer);
      if (layer.type === 'categorical' && value !== null) {
        console.log(`  ${layer.name}: ${layer.classes?.[value] || `Class ${value}`}`);
      } else if (value !== null) {
        console.log(`  ${layer.name}: ${value.toFixed(3)} ${layer.unit}`);
      } else {
        console.log(`  ${layer.name}: nodata`);
      }
    }

    // Test cell averaging
    console.log(`\n--- Cell average (1km) ---`);
    const friLayer = SAMPLE_LAYERS.find(l => l.id === 'fri_2024')!;
    const avg = await sampleCellAverage(lat, lng, 1, friLayer, 11, 3);
    console.log(`  FRI 2024 (3x3 avg): ${avg?.toFixed(3) ?? 'nodata'}`);
  })();
}
