// ============================================================================
// PLAC/ARVC AMEAÇA AT ONE POINT — for the E2 site card
// ============================================================================
// JVP, 10 Nov 2026: the site card shows the Prefeitura's hazard (ameaça) at the
// pin — Inundação (arroios), Calor, Deslizamento — in place of the removed
// "No bairro, em média" bars, which were OUR percentile of the ARVC RISCO
// composite. Official layer, sampled at the point, classed the way the map
// classes it.
//
// Values: the 2050 threat value rasters the build script writes next to the
// display PNGs (client/public/arvc-official/arvc_off_threat_<hz>_2050.value.png;
// value = R / 254, nodata = 255 / transparent; bounds in manifest.json — see
// shared/arvc-official.ts and server/routes/arvcTileRoutes.ts).
//
// Classes: relative, per layer, like the tour's tiles — the city's 2nd–98th
// percentile range in five equal classes. The flood ameaça spans only
// 0.637–0.810 across the whole city, so an absolute 0.2-class scheme would
// call every point in Porto Alegre "muito alta" and say nothing.
//
// The client never receives the 0–1 number: only a class index and its words.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ARVC_TILE_SOURCES } from '@shared/arvc-official';
import type { HazardKey } from '@shared/site-knowledge';

const ORIGIN_SHIFT = 20037508.342789244;
const lngToMerc = (lng: number) => (lng * ORIGIN_SHIFT) / 180;
const latToMerc = (lat: number) =>
  ((Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * ORIGIN_SHIFT) / 180;

interface ValueLayer {
  width: number;
  height: number;
  data: Buffer;
  west: number; east: number; north: number; south: number;
  /** City 2nd / 98th percentile of the valid pixels. */
  p2: number;
  p98: number;
}

const LAYER_FOR: Record<HazardKey, string> = {
  flood: ARVC_TILE_SOURCES.arvc_flood_hazard,
  heat: ARVC_TILE_SOURCES.arvc_heat_hazard,
  landslide: ARVC_TILE_SOURCES.arvc_landslide_hazard,
};

const cache = new Map<string, ValueLayer | null>();

function valueAt(l: ValueLayer, row: number, col: number): number | null {
  const s = (row * l.width + col) * 4;
  const r = l.data[s];
  if (l.data[s + 3] === 0 || r === 255) return null; // nodata
  return r / 254;
}

function load(layerId: string): ValueLayer | null {
  if (cache.has(layerId)) return cache.get(layerId)!;
  let out: ValueLayer | null = null;
  try {
    const dir = path.join(process.cwd(), 'client', 'public', 'arvc-official');
    const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));
    const meta = man.layers?.[layerId];
    const file = path.join(dir, `${layerId}.value.png`);
    if (meta?.bounds && fs.existsSync(file)) {
      const png = PNG.sync.read(fs.readFileSync(file));
      const [[south, west], [north, east]] = meta.bounds;
      const base = { width: png.width, height: png.height, data: png.data, west: lngToMerc(west), east: lngToMerc(east), north: latToMerc(north), south: latToMerc(south), p2: 0, p98: 1 };
      // Percentiles over the valid pixels, from a 255-bin histogram (the
      // raster only has 255 levels, so this is exact).
      const hist = new Array<number>(255).fill(0);
      let n = 0;
      for (let i = 0; i < png.width * png.height; i++) {
        const r = png.data[i * 4];
        if (png.data[i * 4 + 3] === 0 || r === 255) continue;
        hist[r]++; n++;
      }
      const at = (q: number) => {
        let acc = 0;
        for (let k = 0; k < 255; k++) { acc += hist[k]; if (acc >= q * n) return k / 254; }
        return 1;
      };
      out = n > 0 ? { ...base, p2: at(0.02), p98: at(0.98) } : null;
    }
  } catch (err) {
    console.warn(`[arvc-point] ${layerId} unreadable:`, (err as Error).message);
  }
  cache.set(layerId, out);
  return out;
}

const LEVELS = {
  pt: ['muito baixa', 'baixa', 'média', 'alta', 'muito alta'],
  en: ['very low', 'low', 'medium', 'high', 'very high'],
} as const;

export interface PinHazardLevel {
  hazard: HazardKey;
  /** 0..4 — the class of the point among the city's own range. */
  level: number;
  pt: string;
  en: string;
}

/** The class (0..4) of a raw value against a layer's p2–p98 range. Exported for tests. */
export function classOf(v: number, p2: number, p98: number): number {
  const span = p98 - p2;
  if (!(span > 0)) return 2;
  return Math.max(0, Math.min(4, Math.floor(((v - p2) / span) * 5)));
}

/**
 * PLAC/ARVC 2050 ameaça at a point, one entry per hazard that has data there
 * (a pin over the Guaíba, or outside the analysed area, gets none for that
 * layer). Nearest pixel — the same resampling the tiles use.
 */
export function arvcHazardAtPin(lat: number, lng: number): PinHazardLevel[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const mx = lngToMerc(lng), my = latToMerc(lat);
  const out: PinHazardLevel[] = [];
  for (const hazard of ['flood', 'heat', 'landslide'] as HazardKey[]) {
    const l = load(LAYER_FOR[hazard]);
    if (!l) continue;
    const col = Math.floor((mx - l.west) / ((l.east - l.west) / l.width));
    const row = Math.floor((l.north - my) / ((l.north - l.south) / l.height));
    if (row < 0 || row >= l.height || col < 0 || col >= l.width) continue;
    const v = valueAt(l, row, col);
    if (v == null) continue;
    const level = classOf(v, l.p2, l.p98);
    out.push({ hazard, level, pt: LEVELS.pt[level], en: LEVELS.en[level] });
  }
  return out;
}
