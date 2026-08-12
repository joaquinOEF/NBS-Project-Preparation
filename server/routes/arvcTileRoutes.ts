import type { Express, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import {
  ARVC_RAMPS,
  ARVC_TILE_SOURCES,
  ARVC_VALUE_LEVELS,
  HAZARD_TILE_RAMP,
  arvcOfficialPngUrl,
  type ArvcOfficialManifest,
} from '@shared/arvc-official';

// ============================================================================
// ARVC HAZARD TILES — XYZ tiles cut from the official rasters
// ============================================================================
// The CBO hazard tour and the orchestrator both consume XYZ tiles. The ARVC
// layers ship as one georeferenced PNG each (see shared/arvc-official.ts), which
// the Site Explorer draws with L.imageOverlay — but MapMicroapp and the
// orchestrator have no image-overlay path, and building one in each would be two
// new raster code paths in surfaces that already have one that works.
//
// So instead of changing three clients, this cuts tiles from the PNG we already
// build. The source is already in EPSG:3857 with axis-aligned bounds, so a tile
// is a crop-and-scale — no reprojection, no GDAL, no tile pyramid on disk.
//
// Why this matters beyond plumbing: until now the two surfaces rendered
// `poa_<haz>_hazard` from the OEF catalog while the bairro ranking underneath
// came from the municipality's ARVC rasters. A CBO could be shown a low-hazard
// tile under a bairro ranked FLOOD-primary. Same source on both now.
// ============================================================================

const TILE_SIZE = 256;
const ORIGIN_SHIFT = 20037508.342789244; // π · 6378137

/** lat/lng → EPSG:3857 metres. */
function lngToMerc(lng: number): number {
  return (lng * ORIGIN_SHIFT) / 180;
}
function latToMerc(lat: number): number {
  const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  return (y * ORIGIN_SHIFT) / 180;
}

interface Decoded {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  data: Buffer;
  /** Source extent in EPSG:3857 metres. */
  west: number;
  east: number;
  north: number;
  south: number;
  /** packed RGB → contrast-stretched packed RGB. See buildStretch(). */
  stretch: Map<number, number> | null;
}

/**
 * Per-layer contrast stretch, as a colour→colour table.
 *
 * The PNGs are painted with WayCarbon's ramp over the full 0–1 domain, which is
 * right for the Site Explorer: a screenshot there is recognisably the map printed
 * in the plan. It is wrong for the hazard tour, because the ameaça layers do not
 * span 0–1. Flood runs 0.637–0.810 — 44 of 255 ramp steps — so "where does water
 * pool when it rains hard?" renders as an almost uniform wash.
 *
 * Stretching each layer across its own range restores the pattern. It is honest
 * here and not in the Site Explorer because these two surfaces label the ramp
 * "low → high" (relative) while the Site Explorer legend prints the published
 * class values (absolute). Same data, different question.
 *
 * Built once per layer over the ≤255 distinct ramp colours, so a tile is still a
 * hash lookup per pixel.
 */
function buildStretch(data: Buffer, min: number, max: number): Map<number, number> | null {
  const span = max - min;
  if (!(span > 0)) return null;

  const ramp = (colors: string[], t: number): [number, number, number] => {
    const stops = colors.map((hex, i) => ({
      v: i / (colors.length - 1),
      rgb: [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ] as [number, number, number],
    }));
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let k = 0; k < stops.length - 1; k++) {
      if (t >= stops[k].v && t <= stops[k + 1].v) { a = stops[k]; b = stops[k + 1]; break; }
    }
    const d = b.v - a.v;
    const f = d > 0 ? Math.min(1, Math.max(0, (t - a.v) / d)) : 1;
    return [0, 1, 2].map(c => Math.round(a.rgb[c] + (b.rgb[c] - a.rgb[c]) * f)) as [number, number, number];
  };

  // WayCarbon's ramp only defines stops up to 0.8, so `t` here is value/0.8
  // clamped — the same clamp QGIS applies and the build script reproduces.
  const inAt = (value: number) => ramp(ARVC_RAMPS.threat.colors, Math.min(1, value / 0.8));
  const outAt = (t: number) => ramp(HAZARD_TILE_RAMP, t);

  // Build the input LUT, then key the table off the colours ACTUALLY present in
  // the PNG rather than off recomputed ones.
  //
  // This matters: the build script writes the palette with numpy's
  // `.astype(uint8)`, which truncates, while this recomputes with Math.round. On
  // any channel where they disagree by one the exact-match lookup missed, and the
  // pixel was left in WayCarbon's colours — which is precisely what happened: a
  // tile came back half red and half teal. Matching observed colours to the
  // nearest LUT entry is immune to that, and there are only ~256 of them.
  const lut: [number, number, number][] = [];
  for (let i = 0; i < ARVC_VALUE_LEVELS; i++) lut.push(inAt(i / (ARVC_VALUE_LEVELS - 1)));

  const pack = (c: [number, number, number]) => (c[0] << 16) | (c[1] << 8) | c[2];
  const seen = new Set<number>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }

  const table = new Map<number, number>();
  // Array.from rather than for-of: tsconfig has no `target`, so downlevel
  // iteration over a Set is a compile error.
  for (const key of Array.from(seen)) {
    const r = (key >> 16) & 0xff, g = (key >> 8) & 0xff, b = key & 0xff;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < lut.length; i++) {
      const d = (lut[i][0] - r) ** 2 + (lut[i][1] - g) ** 2 + (lut[i][2] - b) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    const value = best / (ARVC_VALUE_LEVELS - 1);
    const t = Math.min(1, Math.max(0, (value - min) / span));
    table.set(key, pack(outAt(t)));
  }
  return table;
}

const decoded = new Map<string, Promise<Decoded | null>>();
const tileCache = new Map<string, Buffer>();
const TILE_CACHE_MAX = 600; // ~40 MB of 256×256 RGBA PNGs, bounded

function manifestPath(): string {
  return path.join(process.cwd(), 'client', 'public', 'arvc-official', 'manifest.json');
}

async function loadLayer(layerId: string, valueTiles = false): Promise<Decoded | null> {
  const cacheKey = valueTiles ? `${layerId}::value` : layerId;
  let entry = decoded.get(cacheKey);
  if (entry) return entry;

  entry = (async () => {
    try {
      const man: ArvcOfficialManifest = JSON.parse(fs.readFileSync(manifestPath(), 'utf-8'));
      const meta = man.layers?.[layerId];
      if (!meta?.bounds) {
        console.warn(`[arvc-tiles] ${layerId} missing from manifest`);
        return null;
      }
      const rel = arvcOfficialPngUrl(layerId).replace(/^\//, '');
      const file = path.join(process.cwd(), 'client', 'public',
        valueTiles ? rel.replace(/\.png$/, '.value.png') : rel);
      const png = PNG.sync.read(fs.readFileSync(file));
      const [[south, west], [north, east]] = meta.bounds;
      const st = meta.stats;
      return {
        width: png.width,
        height: png.height,
        data: png.data,
        // Never stretch a value raster — the pixel IS the number.
        stretch: valueTiles || !st ? null : buildStretch(png.data, st.min, st.max),
        west: lngToMerc(west),
        east: lngToMerc(east),
        north: latToMerc(north),
        south: latToMerc(south),
      };
    } catch (err) {
      console.error(`[arvc-tiles] failed to load ${layerId}:`, err);
      return null;
    }
  })();

  decoded.set(cacheKey, entry);
  const result = await entry;
  if (!result) decoded.delete(cacheKey); // let a transient failure retry
  return result;
}

/**
 * Nearest-neighbour resample of the source into one 256×256 tile.
 *
 * Nearest rather than bilinear on purpose: the palette encodes the value
 * (index ÷ 254), so averaging two neighbouring colours would invent a class that
 * is not in the data — and at the edge of the analysed area it would blend the
 * fill with transparent nodata, painting a soft halo of risk over the Guaíba.
 */
function cutTile(src: Decoded, z: number, x: number, y: number): Buffer | null {
  const span = (2 * ORIGIN_SHIFT) / Math.pow(2, z);
  const tWest = -ORIGIN_SHIFT + x * span;
  const tEast = tWest + span;
  const tNorth = ORIGIN_SHIFT - y * span;
  const tSouth = tNorth - span;

  // Cheap reject: tiles that do not touch the raster at all.
  if (tEast <= src.west || tWest >= src.east || tNorth <= src.south || tSouth >= src.north) {
    return null;
  }

  const out = new PNG({ width: TILE_SIZE, height: TILE_SIZE });
  const sx = (src.east - src.west) / src.width;
  const sy = (src.north - src.south) / src.height;
  let any = false;

  for (let j = 0; j < TILE_SIZE; j++) {
    const my = tNorth - ((j + 0.5) / TILE_SIZE) * span;
    const row = Math.floor((src.north - my) / sy);
    for (let i = 0; i < TILE_SIZE; i++) {
      const o = (j * TILE_SIZE + i) * 4;
      if (row < 0 || row >= src.height) continue;
      const mx = tWest + ((i + 0.5) / TILE_SIZE) * span;
      const col = Math.floor((mx - src.west) / sx);
      if (col < 0 || col >= src.width) continue;
      const s = (row * src.width + col) * 4;
      const a = src.data[s + 3];
      if (a === 0) continue; // nodata stays transparent
      let r = src.data[s];
      let g = src.data[s + 1];
      let b = src.data[s + 2];
      if (src.stretch) {
        const mapped = src.stretch.get((r << 16) | (g << 8) | b);
        if (mapped !== undefined) {
          r = (mapped >> 16) & 0xff;
          g = (mapped >> 8) & 0xff;
          b = mapped & 0xff;
        }
      }
      out.data[o] = r;
      out.data[o + 1] = g;
      out.data[o + 2] = b;
      out.data[o + 3] = a;
      any = true;
    }
  }
  return any ? PNG.sync.write(out) : null;
}

export function registerArvcTileRoutes(app: Express): void {
  // Warm the decode at startup. The first request for a layer otherwise pays for
  // a synchronous ~1 MB PNG decode plus building the remap table, on the event
  // loop, while the CBO map is waiting for its first tiles. Cheap insurance —
  // three decodes, once, off the request path.
  setTimeout(() => {
    for (const source of Object.values(ARVC_TILE_SOURCES)) {
      void loadLayer(source);
      void loadLayer(source, true);
    }
  }, 0);

  // Value tiles — the number at a point, for ValueTooltip and for the site
  // sampling the CBO intervention gate depends on. Cut from the *.value.png
  // sibling: single channel at 1/254, never contrast-stretched, so the value a
  // click reports is the value in the raster and not a display convenience.
  app.get('/api/geospatial/arvc-value/:layerId/:z/:x/:y.png', async (req: Request, res: Response) => {
    const { layerId } = req.params;
    const source = ARVC_TILE_SOURCES[layerId];
    if (!source) return res.status(404).json({ error: `Unknown ARVC tile layer: ${layerId}` });
    const z = Number(req.params.z), x = Number(req.params.x), y = Number(req.params.y);
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 20) {
      return res.status(400).json({ error: 'z/x/y must be integers, z in 0..20' });
    }
    const key = `v:${layerId}/${z}/${x}/${y}`;
    const hit = tileCache.get(key);
    if (hit) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(hit);
    }
    const src = await loadLayer(source, true);
    if (!src) return res.status(503).json({ error: 'ARVC value raster unavailable' });
    const buf = cutTile(src, z, x, y);
    if (!buf) return res.status(204).end();
    if (tileCache.size >= TILE_CACHE_MAX) {
      const oldest = tileCache.keys().next().value;
      if (oldest) tileCache.delete(oldest);
    }
    tileCache.set(key, buf);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  });

  app.get('/api/geospatial/arvc/:layerId/:z/:x/:y.png', async (req: Request, res: Response) => {
    const { layerId } = req.params;
    if (!ARVC_TILE_SOURCES[layerId]) {
      return res.status(404).json({ error: `Unknown ARVC tile layer: ${layerId}` });
    }
    const z = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 20) {
      return res.status(400).json({ error: 'z/x/y must be integers, z in 0..20' });
    }

    const key = `${layerId}/${z}/${x}/${y}`;
    const hit = tileCache.get(key);
    if (hit) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(hit);
    }

    const src = await loadLayer(ARVC_TILE_SOURCES[layerId]);
    if (!src) return res.status(503).json({ error: 'ARVC raster unavailable' });

    const buf = cutTile(src, z, x, y);
    // 204 for "outside the raster" — Leaflet's errorTileUrl='' treats it as blank,
    // the same contract the SGB WMS proxy already uses.
    if (!buf) return res.status(204).end();

    if (tileCache.size >= TILE_CACHE_MAX) {
      const oldest = tileCache.keys().next().value;
      if (oldest) tileCache.delete(oldest);
    }
    tileCache.set(key, buf);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  });
}
