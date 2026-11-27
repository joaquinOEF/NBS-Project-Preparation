import type { Express, Request, Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { SGB_SUSC_TILE_STYLE, type SgbSuscLayerId } from '@shared/sgb-susceptibility';

// ============================================================================
// SGB SUSCEPTIBILITY AS XYZ TILES — the tour's and the orchestrator's
// flood and landslide maps (since 24 Nov 2026, docs/sgb-suscetibilidade.md)
// ============================================================================
// Drawn here from the committed SGB vectors
// (knowledge/official-risk/porto-alegre/sgb-suscetibilidade-*.json), not
// proxied from SGB's WMS: that one paints "Baixa" yellow across the whole city,
// which is the "everything is coloured" problem Julia raised about the PLAC map.
// Landslide shows Média + Alta only; flood all three classes.
//
// A scanline fill per class (even–odd over each polygon's rings), in Web
// Mercator, at the pixel centre. Higher classes are drawn last. No GDAL, no
// canvas. Tiles are memoised; the source never changes between deploys.
// ============================================================================

const TILE = 256;
const R = 6378137;
const ORIGIN = Math.PI * R;
const mx = (lng: number) => (lng * Math.PI / 180) * R;
const my = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));

/** One polygon: its rings as flat [x0,y0,x1,y1,…] in metres, plus a bbox. */
interface Part { rings: Float64Array[]; minX: number; minY: number; maxX: number; maxY: number }
interface ClassLayer { classe: string; color: [number, number, number, number]; parts: Part[] }

const FILE: Record<SgbSuscLayerId, string> = {
  sgb_flood_susc: 'sgb-suscetibilidade-inundacao.json',
  sgb_landslide_susc: 'sgb-suscetibilidade-movimento-de-massa.json',
};

const hex = (h: string, a: number): [number, number, number, number] =>
  [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];

const layers = new Map<SgbSuscLayerId, ClassLayer[] | null>();
function load(id: SgbSuscLayerId): ClassLayer[] | null {
  if (layers.has(id)) return layers.get(id)!;
  let out: ClassLayer[] | null = null;
  try {
    const file = path.join(process.cwd(), 'knowledge', 'official-risk', 'porto-alegre', FILE[id]);
    if (existsSync(file)) {
      const gj = JSON.parse(readFileSync(file, 'utf8'));
      const style = SGB_SUSC_TILE_STYLE[id];
      out = style.classes.map(({ classe, color }) => {
        const f = gj.features.find((x: any) => x.properties?.classe === classe);
        const polys: number[][][][] = !f ? [] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
        const parts: Part[] = polys.map(poly => {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          const rings = poly.map(ring => {
            const a = new Float64Array(ring.length * 2);
            ring.forEach(([lng, lat], i) => {
              const x = mx(lng), y = my(lat);
              a[2 * i] = x; a[2 * i + 1] = y;
              if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
            });
            return a;
          });
          return { rings, minX, minY, maxX, maxY };
        });
        return { classe, color: hex(color, style.alpha), parts };
      });
    }
  } catch (err) {
    console.warn(`[sgb-tiles] ${id} unreadable:`, (err as Error).message);
  }
  layers.set(id, out);
  return out;
}

/** Web Mercator frame of one 256-px tile. */
function tileFrame(z: number, x: number, y: number) {
  const span = (2 * ORIGIN) / 2 ** z;
  return { span, x0: -ORIGIN + x * span, yTop: ORIGIN - y * span, px: span / TILE };
}

/** Scanline-fill a class's polygons into one tile; `paint` gets each covered pixel index. */
function fillParts(parts: Part[], z: number, x: number, y: number, paint: (pixel: number) => void): void {
  const { span, x0, yTop, px } = tileFrame(z, x, y);
  const tMinX = x0, tMaxX = x0 + span, tMinY = yTop - span, tMaxY = yTop;
  const xs: number[] = [];
  for (const p of parts) {
    if (p.maxX < tMinX || p.minX > tMaxX || p.maxY < tMinY || p.minY > tMaxY) continue;
    for (let row = 0; row < TILE; row++) {
      const cy = yTop - (row + 0.5) * px;
      if (cy < p.minY || cy > p.maxY) continue;
      xs.length = 0;
      for (const r of p.rings) {
        const n = r.length / 2;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const yi = r[2 * i + 1], yj = r[2 * j + 1];
          if ((yi > cy) !== (yj > cy)) xs.push(r[2 * i] + ((cy - yi) / (yj - yi)) * (r[2 * j] - r[2 * i]));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - x0) / px - 0.5));
        const c1 = Math.min(TILE - 1, Math.floor((xs[k + 1] - x0) / px - 0.5));
        for (let c = c0; c <= c1; c++) paint(row * TILE + c);
      }
    }
  }
}

/**
 * Which pixels of a tile fall in the given classes of a layer: 1 = inside.
 * 256×256, row-major; null when the source is missing. The same fill the tiles
 * use, so a mask and the drawn layer agree pixel for pixel
 * (server/routes/hazardOverlapTileRoutes.ts builds the hot spots from it).
 */
export function sgbClassMask(id: SgbSuscLayerId, classes: readonly string[], z: number, x: number, y: number): Uint8Array | null {
  const cls = load(id);
  if (!cls) return null;
  const mask = new Uint8Array(TILE * TILE);
  for (const c of cls) {
    if (classes.includes(c.classe)) fillParts(c.parts, z, x, y, pixel => { mask[pixel] = 1; });
  }
  return mask;
}

/** Render one tile; null when nothing of the layer falls in it. Exported for tests. */
export function renderSgbTile(id: SgbSuscLayerId, z: number, x: number, y: number): Buffer | null {
  const cls = load(id);
  if (!cls) return null;
  const img = new Uint8Array(TILE * TILE * 4);
  let any = false;
  for (const { color, parts } of cls) {
    fillParts(parts, z, x, y, pixel => {
      const o = pixel * 4;
      img[o] = color[0]; img[o + 1] = color[1]; img[o + 2] = color[2]; img[o + 3] = color[3];
      any = true;
    });
  }
  if (!any) return null;
  const png = new PNG({ width: TILE, height: TILE });
  png.data = Buffer.from(img);
  return PNG.sync.write(png);
}

const memo = new Map<string, Buffer | null>();
const MEMO_MAX = 4000;

export function registerSgbSuscTileRoutes(app: Express): void {
  app.get('/api/geospatial/sgb-susc/:layerId/:z/:x/:y.png', (req: Request, res: Response) => {
    const id = req.params.layerId as SgbSuscLayerId;
    if (!(id in FILE)) return res.status(404).json({ error: `Unknown layer: ${id}` });
    const z = Number(req.params.z), x = Number(req.params.x), y = Number(req.params.y);
    if (![z, x, y].every(Number.isInteger) || z < 0 || z > 22) return res.status(400).json({ error: 'z/x/y must be integers' });
    const key = `${id}/${z}/${x}/${y}`;
    let buf = memo.get(key);
    if (buf === undefined) {
      buf = renderSgbTile(id, z, x, y);
      if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value as string);
      memo.set(key, buf);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    if (!buf) return res.status(204).end();
    res.setHeader('Content-Type', 'image/png');
    res.send(buf);
  });
}
