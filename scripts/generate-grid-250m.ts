/**
 * Generate 250m risk grid for Porto Alegre.
 *
 * Strategy: subdivide existing 1km grid into 16 sub-cells (4×4),
 * inheriting parent GeoJSON metrics (elevation, rivers, landcover)
 * and adding raster-sampled values at z=13 for finer detail.
 *
 * New data integrated:
 * - FRI 2024 (Flood Risk Index) at ~90m
 * - HWM 2024 (Heatwave Magnitude)
 * - CHIRPS Rx1day 2024 (precipitation intensity)
 * - Dynamic World (land use at 10m)
 * - SoilGrids 250m (clay/sand → soil permeability)
 * - 2024 flood extent (validation ground truth)
 *
 * Usage: npx tsx scripts/generate-grid-250m.ts
 */

import * as fs from 'fs';
// @ts-ignore - tsx handles .ts imports at runtime
const tileSampler = await import('./tile-sampler.ts');
const { sampleValue, SAMPLE_LAYERS } = tileSampler;

// ── Load existing data ────────────────────────────────────────────────────────
const gridPath = 'client/public/sample-data/porto-alegre-grid.json';
const grid1km = JSON.parse(fs.readFileSync(gridPath, 'utf-8'));
const soilData = JSON.parse(fs.readFileSync('scripts/data/soilgrids-poa.json', 'utf-8'));

// Load flood 2024 extent for validation
const flood2024File = 'client/public/sample-data/porto-alegre-flood-2024.json';
let flood2024Features: any[] = [];
if (fs.existsSync(flood2024File)) {
  const fd = JSON.parse(fs.readFileSync(flood2024File, 'utf-8'));
  flood2024Features = fd.geoJson?.features || fd.features || [];
  console.log(`Loaded 2024 flood extent: ${flood2024Features.length} polygons`);
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PARENT_CELL_SIZE = 1000; // meters
const SUB_DIVISIONS = 4;      // 4×4 = 16 sub-cells
const SUB_CELL_SIZE = PARENT_CELL_SIZE / SUB_DIVISIONS; // 250m
const DEG_PER_250M = 250 / 111000; // ~0.00225°

const LAKE_WEST_BOUNDARY = -51.23;
const DELTA_CENTER_LAT = -30.05;
const DELTA_CENTER_LNG = -51.22;

// Raster layer refs
const friLayer = SAMPLE_LAYERS.find(l => l.id === 'fri_2024')!;
const hwmLayer = SAMPLE_LAYERS.find(l => l.id === 'hwm_2024')!;
const hwm2030Layer = SAMPLE_LAYERS.find(l => l.id === 'hwm_2030s_245')!;
const chirpsLayer = SAMPLE_LAYERS.find(l => l.id === 'chirps_rx1day_2024')!;
const dwLayer = SAMPLE_LAYERS.find(l => l.id === 'dynamic_world')!;

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }
function round3(v: number): number { return Math.round(v * 1000) / 1000; }

// Simple point-in-polygon test (ray casting)
function pointInPolygon(lat: number, lng: number, coords: number[][][]): boolean {
  for (const ring of coords) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]; // [lng, lat]
      const [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

function isInFloodExtent(lat: number, lng: number): boolean {
  for (const feature of flood2024Features) {
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
      if (pointInPolygon(lat, lng, geom.coordinates)) return true;
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        if (pointInPolygon(lat, lng, poly)) return true;
      }
    }
  }
  return false;
}

// Build spatial index for soil data: bin by rounded 0.01° (~1km) for fast lookup
const soilBins = new Map<string, Array<{ lat: number; lng: number; clay: number; sand: number }>>();
for (const [key, val] of Object.entries(soilData.cells) as [string, any][]) {
  const [latStr, lngStr] = key.split(',');
  const lat = parseFloat(latStr), lng = parseFloat(lngStr);
  const binKey = `${Math.round(lat * 100)},${Math.round(lng * 100)}`;
  if (!soilBins.has(binKey)) soilBins.set(binKey, []);
  soilBins.get(binKey)!.push({ lat, lng, clay: val.clay, sand: val.sand });
}
console.log(`Soil spatial index: ${soilBins.size} bins, ${Object.keys(soilData.cells).length} points`);

function getSoilData(lat: number, lng: number): { clay: number; sand: number } | null {
  // Search in the bin and 8 neighbors
  const bLat = Math.round(lat * 100), bLng = Math.round(lng * 100);
  let best: { clay: number; sand: number } | null = null;
  let bestDist = 0.004; // max ~400m
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const bin = soilBins.get(`${bLat + dy},${bLng + dx}`);
      if (!bin) continue;
      for (const pt of bin) {
        const d = Math.abs(pt.lat - lat) + Math.abs(pt.lng - lng);
        if (d < bestDist) { bestDist = d; best = { clay: pt.clay, sand: pt.sand }; }
      }
    }
  }
  return best;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const parentCells = grid1km.geoJson.features;
  console.log(`Parent grid: ${parentCells.length} cells at 1km`);
  console.log(`Target: ${parentCells.length * SUB_DIVISIONS * SUB_DIVISIONS} cells at ${SUB_CELL_SIZE}m\n`);

  const subCells: any[] = [];
  let processed = 0;
  let rasterSampled = 0;

  for (const parent of parentCells) {
    const pm = parent.properties.metrics;
    const [pLng, pLat] = parent.properties.centroid;

    // Subdivide into 4×4 sub-cells
    for (let dy = 0; dy < SUB_DIVISIONS; dy++) {
      for (let dx = 0; dx < SUB_DIVISIONS; dx++) {
        const subLat = pLat - DEG_PER_250M * 1.5 + dy * DEG_PER_250M;
        const subLng = pLng - DEG_PER_250M * 1.5 + dx * DEG_PER_250M;

        // Create sub-cell feature (simple square polygon)
        const half = DEG_PER_250M / 2;
        const coords = [
          [subLng - half, subLat - half],
          [subLng + half, subLat - half],
          [subLng + half, subLat + half],
          [subLng - half, subLat + half],
          [subLng - half, subLat - half],
        ];

        // Inherit parent metrics (will be overridden by raster where available)
        const metrics: any = {
          // Inherited from parent (1km resolution)
          elevation_mean: pm.elevation_mean,
          elevation_min: pm.elevation_min,
          elevation_max: pm.elevation_max,
          slope_mean: pm.slope_mean,
          flow_accum_pct: pm.flow_accum_pct,
          depression_pct: pm.depression_pct,
          dist_river_m: pm.dist_river_m,
          river_prox_pct: pm.river_prox_pct,
          dist_water_m: pm.dist_water_m,
          floodplain_adj_pct: pm.floodplain_adj_pct,
          imperv_pct: pm.imperv_pct,
          canopy_pct: pm.canopy_pct,
          green_pct: pm.green_pct,
          building_density: pm.building_density,
          pop_density: pm.pop_density,
          low_lying_pct: pm.low_lying_pct,
          vegetation_pct: pm.vegetation_pct,
          water_cooling: pm.water_cooling,
        };

        // Soil data (250m native resolution — direct match!)
        const soil = getSoilData(subLat, subLng);
        if (soil) {
          metrics.clay_pct = round3(soil.clay);
          metrics.sand_pct = round3(soil.sand);
          metrics.soil_permeability = round3(clamp01((soil.sand - 30) / 40)); // Sandy = permeable
        }

        // Flood 2024 validation
        metrics.in_flood_2024 = isInFloodExtent(subLat, subLng) ? 1 : 0;

        subCells.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [coords] },
          properties: {
            id: `cell_${processed}`,
            centroid: [subLng, subLat],
            parentId: parent.properties.id,
            metrics,
          },
        });

        processed++;
      }
    }

    if (processed % 1000 === 0) {
      process.stdout.write(`  Generated ${processed} sub-cells...\r`);
    }
  }

  console.log(`\nGenerated ${subCells.length} sub-cells`);

  // ── Sample raster tiles at sub-cell centroids ───────────────────────────────
  console.log('Sampling raster tiles at z=13...');

  for (let i = 0; i < subCells.length; i++) {
    const cell = subCells[i];
    const [lng, lat] = cell.properties.centroid;
    const m = cell.properties.metrics;

    // Sample key layers in parallel
    const [fri, hwm, hwm2030, rx1day, dw] = await Promise.all([
      sampleValue(lat, lng, friLayer, 13),
      sampleValue(lat, lng, hwmLayer, 13),
      sampleValue(lat, lng, hwm2030Layer, 13),
      sampleValue(lat, lng, chirpsLayer, 13),
      sampleValue(lat, lng, dwLayer, 13),
    ]);

    m.fri_raw = fri != null ? round3(fri) : null;
    m.hwm_raw = hwm ?? hwm2030 ?? null;
    if (m.hwm_raw != null) m.hwm_raw = round3(m.hwm_raw);
    m.precip_rx1day = rx1day != null ? round3(rx1day) : null;
    m.dw_class = dw;

    // Override imperviousness from Dynamic World
    if (dw === 6) m.imperv_pct = Math.max(m.imperv_pct || 0, 0.7); // Built
    if (dw === 0) m.imperv_pct = 0; // Water
    if (dw === 1 || dw === 2 || dw === 5) m.vegetation_pct = Math.max(m.vegetation_pct || 0, 0.6); // Trees/Grass/Shrub

    rasterSampled++;
    if (rasterSampled % 500 === 0) {
      process.stdout.write(`  Sampled ${rasterSampled}/${subCells.length}...\r`);
    }
  }

  console.log(`\n  Sampled ${rasterSampled} cells at z=13`);

  // ── Stats ───────────────────────────────────────────────────────────────────
  const friVals = subCells.map(c => c.properties.metrics.fri_raw).filter((v: any) => v != null) as number[];
  const soilVals = subCells.filter(c => c.properties.metrics.clay_pct != null);
  const floodCells = subCells.filter(c => c.properties.metrics.in_flood_2024 === 1);
  const dwVals = subCells.map(c => c.properties.metrics.dw_class).filter((v: any) => v != null);

  console.log(`\n=== 250m Grid Statistics ===`);
  console.log(`Total cells: ${subCells.length}`);
  console.log(`FRI coverage: ${friVals.length} (${(friVals.length / subCells.length * 100).toFixed(0)}%)`);
  console.log(`Soil data: ${soilVals.length} (${(soilVals.length / subCells.length * 100).toFixed(0)}%)`);
  console.log(`Dynamic World: ${dwVals.length} (${(dwVals.length / subCells.length * 100).toFixed(0)}%)`);
  console.log(`In 2024 flood extent: ${floodCells.length} (${(floodCells.length / subCells.length * 100).toFixed(0)}%)`);

  if (friVals.length > 0) {
    console.log(`FRI range: ${Math.min(...friVals).toFixed(3)} – ${Math.max(...friVals).toFixed(3)}`);
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const output = {
    version: 'v3-250m',
    cellSizeMeters: SUB_CELL_SIZE,
    parentCellSize: PARENT_CELL_SIZE,
    totalCells: subCells.length,
    dataSources: {
      terrain: 'Copernicus DEM 30m (inherited from 1km grid)',
      floodIndex: 'OEF FRI 2024 (sampled at z=13)',
      heatwave: 'OEF HWM 2024 / 2030s SSP2-4.5 (sampled at z=13)',
      precipitation: 'CHIRPS Rx1day 2024 (sampled at z=13)',
      landUse: 'Dynamic World 2023 10m (sampled at z=13)',
      soil: 'SoilGrids 250m (clay/sand from WCS)',
      floodValidation: '2024 Planet SkySat flood extent (197 polygons)',
      hydrology: 'OSM rivers/water (inherited from 1km grid)',
    },
    geoJson: {
      type: 'FeatureCollection',
      features: subCells,
    },
  };

  const outPath = 'client/public/sample-data/porto-alegre-grid-250m.json';
  fs.writeFileSync(outPath, JSON.stringify(output));
  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`\n✓ Saved ${outPath} (${sizeMB} MB, ${subCells.length} cells)`);
}

main().catch(console.error);
