import type { Express, Request, Response } from 'express';
import { PNG } from 'pngjs';
import { HAZARD_OVERLAP_CLASSES, HAZARD_OVERLAP_SGB_CLASSES, hazardOverlapClass, type HazardOverlapClass } from '@shared/hazard-overlap';
import { ARVC_HIGH_LEVEL, arvcLevelGrid } from '../services/arvcPointHazard';
import { sgbClassMask } from './sgbSuscTileRoutes';

// ============================================================================
// HOT SPOTS AS XYZ TILES — where official hazards overlap
// ============================================================================
// Only the overlaps are drawn, on a transparent background; definitions and
// colours in shared/hazard-overlap.ts. Built per tile from the committed
// sources, at the tile's own resolution (so the SGB edges stay as crisp as the
// SGB layers'): the two SGB class masks from sgbSuscTileRoutes' scanline fill,
// and the heat class from the climate plan's value raster (~29 m, nearest
// pixel — the same reading the site card gives at a pin).
// No network, no pre-baked files. Tiles are memoised.
// ============================================================================

const TILE = 256;
const R = 6378137;
const ORIGIN = Math.PI * R;

/**
 * The overlap class of every pixel of a tile (0 = none), plus the three masks'
 * raw bits for the shares script: bit 1 flood, 2 landslide, 4 hot, 8 = heat
 * raster has data there. Null when a source is missing.
 */
export function classifyHazardOverlapTile(z: number, x: number, y: number): { cls: Uint8Array; bits: Uint8Array; any: boolean } | null {
  const flood = sgbClassMask('sgb_flood_susc', HAZARD_OVERLAP_SGB_CLASSES.flood, z, x, y);
  const slide = sgbClassMask('sgb_landslide_susc', HAZARD_OVERLAP_SGB_CLASSES.landslide, z, x, y);
  const heat = arvcLevelGrid('heat');
  if (!flood || !slide || !heat) return null;

  const span = (2 * ORIGIN) / 2 ** z;
  const x0 = -ORIGIN + x * span, yTop = ORIGIN - y * span, px = span / TILE;
  const colW = (heat.east - heat.west) / heat.width, rowH = (heat.north - heat.south) / heat.height;
  // Heat column of each tile column, once per tile (-1 = outside the raster).
  const hc = new Int32Array(TILE);
  for (let c = 0; c < TILE; c++) {
    const k = Math.floor((x0 + (c + 0.5) * px - heat.west) / colW);
    hc[c] = k >= 0 && k < heat.width ? k : -1;
  }
  const cls = new Uint8Array(TILE * TILE), bits = new Uint8Array(TILE * TILE);
  let any = false;
  for (let row = 0; row < TILE; row++) {
    const hr = Math.floor((heat.north - (yTop - (row + 0.5) * px)) / rowH);
    const inRows = hr >= 0 && hr < heat.height;
    for (let c = 0; c < TILE; c++) {
      const i = row * TILE + c;
      const level = inRows && hc[c] >= 0 ? heat.level[hr * heat.width + hc[c]] : 255;
      const hot = level !== 255 && level >= ARVC_HIGH_LEVEL;
      const k = hazardOverlapClass(flood[i] === 1, slide[i] === 1, hot);
      cls[i] = k;
      bits[i] = flood[i] | (slide[i] << 1) | (hot ? 4 : 0) | (level !== 255 ? 8 : 0);
      if (k) any = true;
    }
  }
  return { cls, bits, any };
}

/** The overlap class at one point — the tile logic at a single pixel. Exported for tests. */
export function hazardOverlapAt(lat: number, lng: number): HazardOverlapClass | null {
  const z = 18, n = 2 ** z;
  const fx = ((lng + 180) / 360) * n;
  const fy = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const t = classifyHazardOverlapTile(z, tx, ty);
  if (!t) return null;
  const c = Math.min(TILE - 1, Math.floor((fx - tx) * TILE)), r = Math.min(TILE - 1, Math.floor((fy - ty) * TILE));
  return t.cls[r * TILE + c] as HazardOverlapClass;
}

const RGB = new Map(HAZARD_OVERLAP_CLASSES.map(c => [c.value as number, [1, 3, 5].map(i => parseInt(c.color.slice(i, i + 2), 16))]));

/** Render one tile; null when no overlap falls in it. Exported for tests. */
export function renderHazardOverlapTile(z: number, x: number, y: number): Buffer | null {
  const t = classifyHazardOverlapTile(z, x, y);
  if (!t || !t.any) return null;
  const png = new PNG({ width: TILE, height: TILE });
  png.data.fill(0);
  for (let i = 0; i < TILE * TILE; i++) {
    const rgb = RGB.get(t.cls[i]);
    if (!rgb) continue;
    const o = i * 4;
    png.data[o] = rgb[0]; png.data[o + 1] = rgb[1]; png.data[o + 2] = rgb[2]; png.data[o + 3] = 255;
  }
  return PNG.sync.write(png);
}

const memo = new Map<string, Buffer | null>();
const MEMO_MAX = 4000;

export function registerHazardOverlapTileRoutes(app: Express): void {
  app.get('/api/geospatial/hazard-overlap/:z/:x/:y.png', (req: Request, res: Response) => {
    const z = Number(req.params.z), x = Number(req.params.x), y = Number(req.params.y);
    if (![z, x, y].every(Number.isInteger) || z < 0 || z > 22) return res.status(400).json({ error: 'z/x/y must be integers' });
    const key = `${z}/${x}/${y}`;
    let buf = memo.get(key);
    if (buf === undefined) {
      buf = renderHazardOverlapTile(z, x, y);
      if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value as string);
      memo.set(key, buf);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (!buf) return res.status(204).end();
    res.setHeader('Content-Type', 'image/png');
    res.send(buf);
  });
}
