/**
 * Generate per-layer legends → client/public/sample-data/layer-legends.json.
 *
 * Hybrid color sourcing (see docs/risk-catalog-migration-playbook.md):
 *   - classes  : categorical layers from valueEncoding.classes (Dynamic World)
 *   - file     : the 17 authoritative GDAL color-relief files in geospatial-data
 *   - code     : the local heat/landslide ramps from generate-risk-tiles.ts
 *   - sampled  : OEF index layers with no colormap (poa_flood_*, CHIRPS, HWM, FRI)
 *                — recovered by pairing value-tile decode × visual-tile RGB.
 *
 * Usage: npx tsx scripts/generate-legends.ts
 */

import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import { TILE_LAYERS, LOCAL_RISK_LAYERS, FLOOD_INDEX_LAYERS, HEAT_INDEX_LAYERS, LANDSLIDE_INDEX_LAYERS } from '../shared/geospatial-layers';
import type { LegendSpec, LegendStop, LegendIndex } from '../shared/legend-types';

const S3 = 'https://geo-test-api.s3.us-east-1.amazonaws.com';
const GH_RAW = 'https://raw.githubusercontent.com/Open-Earth-Foundation/geospatial-data/main';
const Z = 13;
// Central-POA tiles at z=13 (cover the city core; enough for the ramp shape).
const SAMPLE_TILES = [[2930, 4813], [2929, 4813], [2930, 4812], [2931, 4814], [2929, 4812]];

const rgb = (r: number, g: number, b: number) => `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;

// ── layerId → repo GDAL color file (authoritative breakpoints) ────────────────
const COLOR_FILES: Record<string, { path: string; unit?: string }> = {
  oef_copernicus_dem: { path: 'transformation/copernicus_dem/release/v1/data/dem_glo30_colors.txt', unit: 'm' },
  oef_emsn194: { path: 'transformation/copernicus_emsn194/release/v1/2024/data/maxwaterdepth_visual_colors.txt', unit: 'm' },
  oef_ghsl_built_up: { path: 'transformation/ghsl_built_up/release/v1/data/ghsl_built_up_colors.txt', unit: 'm²' },
  oef_ghsl_urbanization: { path: 'transformation/ghsl_degree_urbanization/release/v2/data/ghsl_degree_urb_colors.txt' },
  oef_ghsl_population: { path: 'transformation/ghsl_population/release/v1/data/ghsl_population_colors.txt', unit: 'people' },
  oef_solar_tiles: { path: 'transformation/global_solar_atlas/release/v2/data/pvout_visual_colors.txt', unit: 'kWh/kWp' },
  oef_hansen_forest: { path: 'transformation/hansen_forest_change/release/v1/data/hansen_loss_colors.txt' },
  oef_hansen_treecover: { path: 'transformation/hansen_forest_change/release/v1/data/hansen_treecover2000_colors.txt', unit: '%' },
  oef_jrc_occurrence: { path: 'transformation/jrc_global_surface_water/release/v1/data/gsw_occurrence_colors.txt', unit: '%' },
  oef_jrc_seasonality: { path: 'transformation/jrc_global_surface_water/release/v1/data/gsw_seasonality_colors.txt', unit: 'months' },
  oef_jrc_change: { path: 'transformation/jrc_global_surface_water/release/v1/data/gsw_transition_colors.txt' },
  oef_merit_elv: { path: 'transformation/merit_hydro/release/v1/data/merit_elv_colors.txt', unit: 'm' },
  oef_merit_hydro: { path: 'transformation/merit_hydro/release/v1/data/merit_hnd_colors.txt', unit: 'm' },
  oef_merit_upa: { path: 'transformation/merit_hydro/release/v1/data/merit_upa_colors.txt', unit: 'cells' },
  oef_modis_ndvi: { path: 'transformation/modis_ndvi/release/v1/2024/data/ndvi_visual_colors.txt', unit: 'NDVI' },
  oef_viirs_nightlights: { path: 'transformation/noaa_viirs_nightlights/release/v1/data/nightlights_visual_colors.txt', unit: 'nW/cm²/sr' },
};

// Categorical class colors from the catalog datasets.yaml (valueEncoding.classes has names only).
const CLASS_COLORS: Record<string, Record<number, string>> = {
  oef_dynamic_world: { 0: '#62B0CC', 1: '#488C5F', 2: '#98B982', 3: '#A0AAC3', 4: '#D7A55F', 5: '#CDB982', 6: '#B45F55', 7: '#AFA89E', 8: '#B9CDE1' },
  // Mechanism-type palettes from catalog datasets.yaml. All three verified
  // against the visual tiles 2026-07-16: class = encoded - 1, colour distance 0.0.
  poa_flood_mechanism: { 0: '#e0e0e0', 1: '#2166ac', 2: '#fdae61', 3: '#abd9e9', 4: '#7b3294', 5: '#969696' },
  poa_heat_mechanism: { 0: '#e0e0e0', 1: '#d73027', 2: '#fee08b', 3: '#fc8d59', 4: '#9970ab', 5: '#636363', 6: '#969696' },
  poa_landslide_mechanism: { 0: '#e0e0e0', 1: '#b2182b', 2: '#2166ac', 3: '#8c510a', 4: '#d8b365', 5: '#4393c3', 6: '#a6611a', 7: '#5e3c99', 8: '#636363', 9: '#969696' },
};

// Local risk ramps — mirror the colorFns in generate-risk-tiles.ts (value → color).
const CODE_RAMPS: Record<string, LegendStop[]> = {
  risk_heat_250m: [
    { value: 0.15, color: '#fecdcd' }, { value: 0.3, color: '#fca5a5' },
    { value: 0.5, color: '#dc2626' }, { value: 0.7, color: '#991b1b' },
  ],
  risk_landslide_250m: [
    { value: 0.15, color: '#eab308' }, { value: 0.3, color: '#ca8a04' },
    { value: 0.5, color: '#a16207' }, { value: 0.7, color: '#78350f' },
  ],
};

async function fetchText(url: string): Promise<string | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(15000) }); return r.ok ? await r.text() : null; }
  catch { return null; }
}
async function fetchPNG(url: string): Promise<PNG | null> {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(15000) }); if (!r.ok) return null;
    return PNG.sync.read(Buffer.from(await r.arrayBuffer())); } catch { return null; }
}

/** Parse a GDAL color-relief file: lines of `value R G B [A]`, skipping nv/comments. */
function parseColorFile(text: string, unit?: string): LegendStop[] {
  const stops: LegendStop[] = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#') || s.toLowerCase().startsWith('nv')) continue;
    const p = s.split(/\s+/);
    const v = Number(p[0]); const r = Number(p[1]), g = Number(p[2]), b = Number(p[3]);
    if (!isFinite(v) || !isFinite(r)) continue;
    stops.push({ value: v, color: rgb(r, g, b) });
  }
  return stops.sort((a, b) => a.value - b.value);
}

/** Recover a ramp from the baked tiles: decode value (24-bit / scale) × visual RGB. */
async function sampleRamp(valueUrl: string, scale: number, offset: number): Promise<{ stops: LegendStop[]; min: number; max: number } | null> {
  const visualUrl = valueUrl.replace('tiles_values', 'tiles_visual');
  const pairs: { v: number; r: number; g: number; b: number }[] = [];
  for (const [x, y] of SAMPLE_TILES) {
    const sub = (u: string) => u.replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y));
    const [val, vis] = await Promise.all([fetchPNG(sub(valueUrl)), fetchPNG(sub(visualUrl))]);
    if (!val || !vis) continue;
    for (let i = 0; i < val.data.length; i += 4) {
      const aV = val.data[i + 3], aVis = vis.data[i + 3];
      if (aV < 20 || aVis < 20) continue;
      const raw = val.data[i] + 256 * val.data[i + 1] + 65536 * val.data[i + 2];
      const v = (raw + offset) / scale;
      if (!isFinite(v)) continue;
      pairs.push({ v, r: vis.data[i], g: vis.data[i + 1], b: vis.data[i + 2] });
    }
  }
  if (pairs.length < 50) return null;
  pairs.sort((a, b) => a.v - b.v);
  const q = (p: number) => pairs[Math.floor(p * (pairs.length - 1))].v;
  const min = q(0.02), max = q(0.98);
  if (max <= min) return null;
  const N = 7;
  const stops: LegendStop[] = [];
  for (let k = 0; k < N; k++) {
    const target = min + (k / (N - 1)) * (max - min);
    const win = (max - min) / (N * 1.5);
    const near = pairs.filter(p => Math.abs(p.v - target) <= win);
    const pool = near.length >= 5 ? near : [pairs[Math.round((k / (N - 1)) * (pairs.length - 1))]];
    pool.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));
    const m = pool[Math.floor(pool.length / 2)];
    stops.push({ value: Math.round(target * 1000) / 1000, color: rgb(m.r, m.g, m.b) });
  }
  return { stops, min: Math.round(min * 1000) / 1000, max: Math.round(max * 1000) / 1000 };
}

async function main() {
  const all = [...LOCAL_RISK_LAYERS, ...FLOOD_INDEX_LAYERS, ...HEAT_INDEX_LAYERS, ...LANDSLIDE_INDEX_LAYERS, ...TILE_LAYERS];
  const legends: LegendIndex = {};
  let nFile = 0, nClass = 0, nCode = 0, nSample = 0, nSkip = 0;

  for (const l of all) {
    const enc: any = (l as any).valueEncoding;
    const id = l.id;

    // 1) categorical
    if (enc?.type === 'categorical' && enc.classes) {
      const colors = CLASS_COLORS[id] || {};
      const stops: LegendStop[] = Object.entries(enc.classes).map(([v, name]) => ({
        value: Number(v), color: colors[Number(v)] || '#888', label: String(name),
      }));
      legends[id] = { layerId: id, kind: 'classes', stops, source: 'classes' };
      nClass++; continue;
    }

    // 2) authoritative repo color file
    if (COLOR_FILES[id]) {
      const { path: p, unit } = COLOR_FILES[id];
      const txt = await fetchText(`${GH_RAW}/${p}`);
      if (txt) {
        const stops = parseColorFile(txt, unit);
        if (stops.length) {
          legends[id] = { layerId: id, kind: 'gradient', unit: unit ?? enc?.unit, stops,
            min: stops[0].value, max: stops[stops.length - 1].value, source: 'file' };
          nFile++; continue;
        }
      }
    }

    // 3) local code ramp
    if (CODE_RAMPS[id]) {
      const stops = CODE_RAMPS[id];
      legends[id] = { layerId: id, kind: 'gradient', unit: 'index 0–1', stops,
        min: stops[0].value, max: stops[stops.length - 1].value, source: 'code',
        note: 'screening index 0–1' };
      nCode++; continue;
    }

    // 4) sample the baked tiles (OEF indices with value tiles, no colormap file)
    if (enc?.urlTemplate && enc.urlTemplate.startsWith('http')) {
      const res = await sampleRamp(enc.urlTemplate, enc.scale ?? 1, enc.offset ?? 0);
      if (res) {
        legends[id] = { layerId: id, kind: 'gradient', unit: enc.unit, stops: res.stops,
          min: res.min, max: res.max, source: 'sampled', note: 'colors recovered from tiles' };
        nSample++;
        process.stdout.write(`  sampled ${id} (${res.min}–${res.max} ${enc.unit})\n`);
        continue;
      }
    }

    nSkip++;
  }

  const outPath = path.join(process.cwd(), 'client', 'public', 'sample-data', 'layer-legends.json');
  fs.writeFileSync(outPath, JSON.stringify(legends, null, 2));
  console.log(`\n✓ ${Object.keys(legends).length} legends → ${path.relative(process.cwd(), outPath)}`);
  console.log(`  file ${nFile} · classes ${nClass} · code ${nCode} · sampled ${nSample} · skipped ${nSkip}`);
}

main().catch(e => { console.error(e); process.exit(1); });
