/**
 * Pre-render 250m risk grid as PNG tile pyramids.
 *
 * Output: client/public/tiles/{risk_type}/{z}/{x}/{y}.png
 * Served by the frontend as regular Leaflet tile layers.
 * Eliminates the need to load 15MB GeoJSON on the client.
 *
 * Generates tiles for zoom levels 10-14.
 * At z=13, each tile covers ~4.9km × ~4.9km (19.5 × 19.5 cells at 250m).
 *
 * Usage: npx tsx scripts/generate-risk-tiles.ts
 */

import * as fs from 'fs';
import { PNG } from 'pngjs';

const gridPath = 'client/public/sample-data/porto-alegre-grid-250m.json';
const gridData = JSON.parse(fs.readFileSync(gridPath, 'utf-8'));
const cells = gridData.geoJson.features;

console.log(`Grid: ${cells.length} cells at ${gridData.cellSizeMeters}m`);

// ── Tile math ─────────────────────────────────────────────────────────────────
function latLngToTileXY(lat: number, lng: number, z: number): { x: number; y: number; px: number; py: number } {
  const n = Math.pow(2, z);
  const latR = (lat * Math.PI) / 180;
  const mercY = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2;
  const tileX = Math.floor(((lng + 180) / 360) * n);
  const tileY = Math.floor(mercY * n);
  const px = Math.floor((((lng + 180) / 360) * n - tileX) * 256);
  const py = Math.floor((mercY * n - tileY) * 256);
  return { x: tileX, y: tileY, px, py };
}

// ── Color scales ──────────────────────────────────────────────────────────────
type ColorFn = (v: number) => [number, number, number, number]; // RGBA

const floodColor: ColorFn = (v) => {
  if (v <= 0.01) return [0, 0, 0, 0]; // transparent
  const a = Math.min(255, Math.round(v * 300)); // fade in
  if (v >= 0.7) return [29, 78, 216, a];
  if (v >= 0.5) return [59, 130, 246, a];
  if (v >= 0.3) return [96, 165, 250, a];
  if (v >= 0.15) return [147, 197, 253, a];
  return [191, 219, 254, a];
};

const heatColor: ColorFn = (v) => {
  if (v <= 0.01) return [0, 0, 0, 0];
  const a = Math.min(255, Math.round(v * 300));
  if (v >= 0.7) return [153, 27, 27, a];
  if (v >= 0.5) return [220, 38, 38, a];
  if (v >= 0.3) return [248, 113, 113, a];
  if (v >= 0.15) return [252, 165, 165, a];
  return [254, 205, 205, a];
};

const landslideColor: ColorFn = (v) => {
  if (v <= 0.01) return [0, 0, 0, 0];
  const a = Math.min(255, Math.round(v * 400));
  if (v >= 0.5) return [120, 53, 15, a];
  if (v >= 0.3) return [161, 98, 7, a];
  if (v >= 0.15) return [202, 138, 4, a];
  return [234, 179, 8, a];
};

const compositeColor: ColorFn = (v) => {
  // v is not used directly — we need the metrics object
  return [0, 0, 0, 0]; // placeholder, handled specially
};

// ── Determine which tiles are needed ──────────────────────────────────────────
interface RiskLayer {
  name: string;
  scoreKey: string;
  colorFn: ColorFn;
}

const layers: RiskLayer[] = [
  { name: 'flood_risk', scoreKey: 'flood_score', colorFn: floodColor },
  { name: 'heat_risk', scoreKey: 'heat_score', colorFn: heatColor },
  { name: 'landslide_risk', scoreKey: 'landslide_score', colorFn: landslideColor },
];

const ZOOM_LEVELS = [10, 11, 12, 13, 14];

// ── Pre-compute cell positions at each zoom ───────────────────────────────────
interface CellPosition {
  tileKey: string; // "z/x/y"
  px: number;
  py: number;
  metrics: any;
  cellSizePx: number; // how many pixels this cell covers at this zoom
}

for (const layer of layers) {
  let totalTiles = 0;

  for (const z of ZOOM_LEVELS) {
    // Group cells by tile
    const tileGroups = new Map<string, CellPosition[]>();

    // Cell size in pixels at this zoom
    const n = Math.pow(2, z);
    const degreesPerPixel = 360 / (n * 256);
    const cellDegrees = gridData.cellSizeMeters / 111000; // ~0.00225°
    const cellSizePx = Math.max(1, Math.round(cellDegrees / degreesPerPixel));

    for (const cell of cells) {
      const [lng, lat] = cell.properties.centroid;
      const { x, y, px, py } = latLngToTileXY(lat, lng, z);
      const key = `${z}/${x}/${y}`;
      if (!tileGroups.has(key)) tileGroups.set(key, []);
      tileGroups.get(key)!.push({ tileKey: key, px, py, metrics: cell.properties.metrics, cellSizePx });
    }

    // Render each tile
    for (const [key, positions] of tileGroups) {
      const png = new PNG({ width: 256, height: 256 });
      // Start transparent
      for (let i = 0; i < png.data.length; i += 4) {
        png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 0;
      }

      for (const pos of positions) {
        const score = pos.metrics[layer.scoreKey] ?? 0;
        if (score <= 0.01) continue;
        const [r, g, b, a] = layer.colorFn(score);

        // Fill a square of cellSizePx × cellSizePx
        const half = Math.floor(pos.cellSizePx / 2);
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            const px = pos.px + dx;
            const py = pos.py + dy;
            if (px >= 0 && px < 256 && py >= 0 && py < 256) {
              const idx = (py * 256 + px) * 4;
              // Alpha blending
              const existingA = png.data[idx + 3];
              if (a > existingA) {
                png.data[idx] = r; png.data[idx + 1] = g; png.data[idx + 2] = b; png.data[idx + 3] = a;
              }
            }
          }
        }
      }

      // Write tile
      const [, tileX, tileY] = key.split('/');
      const dir = `client/public/tiles/${layer.name}/${z}/${tileX}`;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(`${dir}/${tileY}.png`, PNG.sync.write(png));
      totalTiles++;
    }
  }

  console.log(`  ${layer.name}: ${totalTiles} tiles across z${ZOOM_LEVELS[0]}-${ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}`);
}

// ── VALUE TILES — encode scores as RGB for programmatic decoding ──────────────
// Encoding: raw = score * 1000 (0.423 → 423)
//   R = raw % 256, G = floor(raw / 256), B = 0
//   Alpha = 255 (data) or 0 (nodata)
// Decode formula: value = (R + 256*G + 65536*B + 0) / 1000
// This matches the OEF ValueTileEncoding interface with scale=1000, offset=0

console.log('\nGenerating value tiles...');

for (const layer of layers) {
  let totalTiles = 0;

  for (const z of ZOOM_LEVELS) {
    const tileGroups = new Map<string, CellPosition[]>();
    const n = Math.pow(2, z);
    const degreesPerPixel = 360 / (n * 256);
    const cellDegrees = gridData.cellSizeMeters / 111000;
    const cellSizePx = Math.max(1, Math.round(cellDegrees / degreesPerPixel));

    for (const cell of cells) {
      const [lng, lat] = cell.properties.centroid;
      const { x, y, px, py } = latLngToTileXY(lat, lng, z);
      const key = `${z}/${x}/${y}`;
      if (!tileGroups.has(key)) tileGroups.set(key, []);
      tileGroups.get(key)!.push({ tileKey: key, px, py, metrics: cell.properties.metrics, cellSizePx });
    }

    for (const [key, positions] of tileGroups) {
      const png = new PNG({ width: 256, height: 256 });
      // Transparent = nodata
      for (let i = 0; i < png.data.length; i += 4) {
        png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 0;
      }

      for (const pos of positions) {
        const score = pos.metrics[layer.scoreKey] ?? 0;
        if (score <= 0) continue;

        // Encode: score * 1000 → R + 256*G
        const raw = Math.round(score * 1000);
        const r = raw % 256;
        const g = Math.floor(raw / 256) % 256;
        const b = 0;

        const half = Math.floor(pos.cellSizePx / 2);
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            const px = pos.px + dx;
            const py = pos.py + dy;
            if (px >= 0 && px < 256 && py >= 0 && py < 256) {
              const idx = (py * 256 + px) * 4;
              if (png.data[idx + 3] === 0) { // Don't overwrite
                png.data[idx] = r;
                png.data[idx + 1] = g;
                png.data[idx + 2] = b;
                png.data[idx + 3] = 255; // data present
              }
            }
          }
        }
      }

      const [, tileX, tileY] = key.split('/');
      const dir = `client/public/tiles_values/${layer.name}/${z}/${tileX}`;
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(`${dir}/${tileY}.png`, PNG.sync.write(png));
      totalTiles++;
    }
  }

  console.log(`  ${layer.name}: ${totalTiles} value tiles`);
}

// ── COMPOSITE HOTSPOT LAYER — additive RGB glow ──────────────────────────────
// Red = heat, Blue = flood, Green component from landslide (amber = R+G)
// Overlaps blend naturally: flood+heat = purple, all three = white
// Alpha proportional to max risk — safe areas are transparent

console.log('\nGenerating composite hotspot tiles...');

let compositeTotal = 0;
const RISK_THRESHOLD = 0.15; // Below this, pixel is transparent

for (const z of ZOOM_LEVELS) {
  const tileGroups = new Map<string, CellPosition[]>();
  const n = Math.pow(2, z);
  const degreesPerPixel = 360 / (n * 256);
  const cellDegrees = gridData.cellSizeMeters / 111000;
  const cellSizePx = Math.max(1, Math.round(cellDegrees / degreesPerPixel));

  for (const cell of cells) {
    const [lng, lat] = cell.properties.centroid;
    const { x, y, px, py } = latLngToTileXY(lat, lng, z);
    const key = `${z}/${x}/${y}`;
    if (!tileGroups.has(key)) tileGroups.set(key, []);
    tileGroups.get(key)!.push({ tileKey: key, px, py, metrics: cell.properties.metrics, cellSizePx });
  }

  for (const [key, positions] of tileGroups) {
    const png = new PNG({ width: 256, height: 256 });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 0;
    }

    for (const pos of positions) {
      const flood = pos.metrics.flood_score ?? 0;
      const heat = pos.metrics.heat_score ?? 0;
      const landslide = pos.metrics.landslide_score ?? 0;
      const maxRisk = Math.max(flood, heat, landslide);

      if (maxRisk < RISK_THRESHOLD) continue;

      // Additive color channels:
      // Red = heat (+ landslide amber component)
      // Green = landslide amber component (R+G = amber)
      // Blue = flood
      const r = Math.min(255, Math.round(heat * 255 + landslide * 200));
      const g = Math.min(255, Math.round(landslide * 180));
      const b = Math.min(255, Math.round(flood * 255));

      // Alpha: stronger glow for higher risk, fade in from threshold
      const intensity = (maxRisk - RISK_THRESHOLD) / (1 - RISK_THRESHOLD);
      const a = Math.min(220, Math.round(intensity * 250));

      const half = Math.floor(pos.cellSizePx / 2);
      // Add a 1px soft edge for glow effect at higher zooms
      const glowExtra = cellSizePx >= 3 ? 1 : 0;
      for (let dy = -(half + glowExtra); dy <= half + glowExtra; dy++) {
        for (let dx = -(half + glowExtra); dx <= half + glowExtra; dx++) {
          const px = pos.px + dx;
          const py = pos.py + dy;
          if (px >= 0 && px < 256 && py >= 0 && py < 256) {
            const idx = (py * 256 + px) * 4;
            // Soft edge: reduce alpha at the boundary
            const isEdge = Math.abs(dx) > half || Math.abs(dy) > half;
            const edgeA = isEdge ? Math.round(a * 0.4) : a;

            // Additive blend: brighter where risks overlap
            png.data[idx] = Math.min(255, png.data[idx] + r);
            png.data[idx + 1] = Math.min(255, png.data[idx + 1] + g);
            png.data[idx + 2] = Math.min(255, png.data[idx + 2] + b);
            png.data[idx + 3] = Math.max(png.data[idx + 3], edgeA);
          }
        }
      }
    }

    const [, tileX, tileY] = key.split('/');
    const dir = `client/public/tiles/composite_hotspot/${z}/${tileX}`;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/${tileY}.png`, PNG.sync.write(png));
    compositeTotal++;
  }
}

console.log(`  composite_hotspot: ${compositeTotal} tiles`);

console.log('\n✓ Visual tiles: client/public/tiles/{layer}/{z}/{x}/{y}.png');
console.log('✓ Value tiles:  client/public/tiles_values/{layer}/{z}/{x}/{y}.png');
console.log('✓ Composite:    client/public/tiles/composite_hotspot/{z}/{x}/{y}.png');
console.log('  Decode: value = (R + 256*G) / 1000 (scale=1000, offset=0)');
console.log('  Hotspot: R=heat, G=landslide, B=flood (additive)');
