/**
 * Render risk score maps as PNG images for visual validation.
 * Uses the grid data to create color-coded maps of flood, heat, and landslide risk.
 */

import * as fs from 'fs';
import { PNG } from 'pngjs';

const gridPath = 'client/public/sample-data/porto-alegre-grid.json';
const gridData = JSON.parse(fs.readFileSync(gridPath, 'utf-8'));

const cells = gridData.geoJson.features;

// Find grid bounds
let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
for (const cell of cells) {
  const [lng, lat] = cell.properties.centroid;
  minLng = Math.min(minLng, lng);
  maxLng = Math.max(maxLng, lng);
  minLat = Math.min(minLat, lat);
  maxLat = Math.max(maxLat, lat);
}

const CELL_SIZE = 0.009; // ~1km in degrees
const width = Math.ceil((maxLng - minLng) / CELL_SIZE) + 2;
const height = Math.ceil((maxLat - minLat) / CELL_SIZE) + 2;

console.log(`Grid bounds: lng [${minLng.toFixed(3)}, ${maxLng.toFixed(3)}], lat [${minLat.toFixed(3)}, ${maxLat.toFixed(3)}]`);
console.log(`Image size: ${width}×${height} pixels (1 pixel = ~1km)\n`);

// Color scales
function floodColor(v: number): [number, number, number] {
  if (v >= 0.7) return [29, 78, 216];   // dark blue
  if (v >= 0.5) return [59, 130, 246];  // blue
  if (v >= 0.3) return [96, 165, 250];  // light blue
  if (v >= 0.15) return [147, 197, 253]; // very light blue
  return [219, 234, 254];                // near white
}

function heatColor(v: number): [number, number, number] {
  if (v >= 0.7) return [153, 27, 27];   // dark red
  if (v >= 0.5) return [220, 38, 38];   // red
  if (v >= 0.3) return [248, 113, 113]; // light red
  if (v >= 0.15) return [252, 165, 165]; // pink
  return [254, 226, 226];                // near white
}

function landslideColor(v: number): [number, number, number] {
  if (v >= 0.5) return [120, 53, 15];   // dark amber
  if (v >= 0.3) return [161, 98, 7];    // amber
  if (v >= 0.15) return [202, 138, 4];  // yellow-amber
  if (v >= 0.05) return [234, 179, 8];  // yellow
  return [254, 243, 199];                // near white
}

function compositeColor(f: number, h: number, l: number): [number, number, number] {
  // Blend flood (blue), heat (red), landslide (amber) by dominance
  const max = Math.max(f, h, l);
  if (max < 0.15) return [240, 240, 240]; // gray for low risk
  const total = f + h + l || 1;
  const rf = f / total, rh = h / total, rl = l / total;
  const fc = floodColor(f), hc = heatColor(h), lc = landslideColor(l);
  return [
    Math.round(rf * fc[0] + rh * hc[0] + rl * lc[0]),
    Math.round(rf * fc[1] + rh * hc[1] + rl * lc[1]),
    Math.round(rf * fc[2] + rh * hc[2] + rl * lc[2]),
  ];
}

// Render function
function renderMap(
  name: string,
  getColor: (m: any) => [number, number, number],
  getAlpha: (m: any) => number = () => 255,
) {
  const scale = 4; // 4x upscale for better visibility
  const png = new PNG({ width: width * scale, height: height * scale });

  // Fill with white
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 250; png.data[i + 1] = 250; png.data[i + 2] = 250; png.data[i + 3] = 255;
  }

  for (const cell of cells) {
    const [lng, lat] = cell.properties.centroid;
    const m = cell.properties.metrics;
    const col = Math.round((lng - minLng) / CELL_SIZE);
    const row = Math.round((maxLat - lat) / CELL_SIZE); // flip Y
    const [r, g, b] = getColor(m);
    const alpha = getAlpha(m);

    // Fill scaled pixel block
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const px = col * scale + dx;
        const py = row * scale + dy;
        if (px >= 0 && px < width * scale && py >= 0 && py < height * scale) {
          const idx = (py * width * scale + px) * 4;
          png.data[idx] = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = alpha;
        }
      }
    }
  }

  const outPath = `scripts/output/${name}.png`;
  fs.mkdirSync('scripts/output', { recursive: true });
  fs.writeFileSync(outPath, PNG.sync.write(png));
  console.log(`  ✓ ${outPath} (${width * scale}×${height * scale})`);
}

console.log('Rendering risk maps...\n');

renderMap('flood-risk-v2', m => floodColor(m.flood_score || 0));
renderMap('heat-risk-v2', m => heatColor(m.heat_score || 0));
renderMap('landslide-risk-v2', m => landslideColor(m.landslide_score || 0));
renderMap('composite-risk-v2', m => compositeColor(m.flood_score || 0, m.heat_score || 0, m.landslide_score || 0));

// FRI raw comparison
renderMap('fri-raw', m => {
  const v = m.fri_raw ?? 0;
  return floodColor(v);
});

// Difference map: our flood score vs FRI
renderMap('flood-vs-fri-diff', m => {
  const diff = (m.flood_score || 0) - (m.fri_raw || 0); // positive = our score higher
  if (diff > 0.2) return [220, 38, 38];  // red: we're much higher
  if (diff > 0.1) return [248, 113, 113]; // light red
  if (diff > -0.1) return [200, 200, 200]; // gray: similar
  if (diff > -0.2) return [96, 165, 250]; // light blue: we're lower
  return [29, 78, 216]; // dark blue: we're much lower
});

console.log('\nDone. Open scripts/output/ to view maps.');
console.log('Legend:');
console.log('  Flood:     dark blue (high) → light blue → white (low)');
console.log('  Heat:      dark red (high) → pink → white (low)');
console.log('  Landslide: dark amber (high) → yellow → white (low)');
console.log('  Composite: blend of all three by dominance');
console.log('  Flood-vs-FRI: red = our score higher, blue = FRI higher, gray = similar');
