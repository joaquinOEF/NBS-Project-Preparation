/**
 * Render 250m risk maps as PNG images for visual validation.
 * Also renders flood validation map (predicted vs observed).
 */

import * as fs from 'fs';
import { PNG } from 'pngjs';

const gridPath = 'client/public/sample-data/porto-alegre-grid-250m.json';
const gridData = JSON.parse(fs.readFileSync(gridPath, 'utf-8'));
const cells = gridData.geoJson.features;

let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
for (const cell of cells) {
  const [lng, lat] = cell.properties.centroid;
  minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
  minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
}

const CELL_DEG = 250 / 111000; // ~0.00225°
const width = Math.ceil((maxLng - minLng) / CELL_DEG) + 2;
const height = Math.ceil((maxLat - minLat) / CELL_DEG) + 2;
const scale = 2; // 2x for 250m grid (already denser)

console.log(`Grid: ${cells.length} cells, image: ${width*scale}×${height*scale}px\n`);

function floodColor(v: number): [number, number, number] {
  if (v >= 0.7) return [29, 78, 216];
  if (v >= 0.5) return [59, 130, 246];
  if (v >= 0.3) return [96, 165, 250];
  if (v >= 0.15) return [147, 197, 253];
  return [219, 234, 254];
}

function heatColor(v: number): [number, number, number] {
  if (v >= 0.7) return [153, 27, 27];
  if (v >= 0.5) return [220, 38, 38];
  if (v >= 0.3) return [248, 113, 113];
  if (v >= 0.15) return [252, 165, 165];
  return [254, 226, 226];
}

function renderMap(name: string, getColor: (m: any) => [number, number, number]) {
  const png = new PNG({ width: width * scale, height: height * scale });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 250; png.data[i+1] = 250; png.data[i+2] = 250; png.data[i+3] = 255;
  }
  for (const cell of cells) {
    const [lng, lat] = cell.properties.centroid;
    const col = Math.round((lng - minLng) / CELL_DEG);
    const row = Math.round((maxLat - lat) / CELL_DEG);
    const [r, g, b] = getColor(cell.properties.metrics);
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const px = col * scale + dx, py = row * scale + dy;
        if (px >= 0 && px < width*scale && py >= 0 && py < height*scale) {
          const idx = (py * width * scale + px) * 4;
          png.data[idx] = r; png.data[idx+1] = g; png.data[idx+2] = b; png.data[idx+3] = 255;
        }
      }
    }
  }
  const outPath = `scripts/output/${name}.png`;
  fs.mkdirSync('scripts/output', { recursive: true });
  fs.writeFileSync(outPath, PNG.sync.write(png));
  console.log(`  ✓ ${outPath}`);
}

renderMap('flood-risk-v3-250m', m => floodColor(m.flood_score || 0));
renderMap('heat-risk-v3-250m', m => heatColor(m.heat_score || 0));
renderMap('flood-2024-observed', m => m.in_flood_2024 === 1 ? [220, 38, 38] : [219, 234, 254]);

// Validation map: TP=green, FP=orange, FN=red, TN=gray
const THRESH = 0.40;
renderMap('flood-validation-250m', m => {
  const pred = (m.flood_score || 0) >= THRESH;
  const actual = m.in_flood_2024 === 1;
  if (pred && actual) return [34, 197, 94];   // TP: green (got it right)
  if (pred && !actual) return [249, 115, 22]; // FP: orange (false alarm)
  if (!pred && actual) return [220, 38, 38];  // FN: red (missed)
  return [229, 231, 235];                      // TN: light gray
});

// FRI raw
renderMap('fri-raw-250m', m => floodColor(m.fri_raw || 0));

// Soil permeability
renderMap('soil-permeability-250m', m => {
  const p = m.soil_permeability;
  if (p == null) return [200, 200, 200]; // no data
  if (p >= 0.6) return [34, 197, 94];    // high permeability (sandy)
  if (p >= 0.3) return [250, 204, 21];   // medium
  return [220, 38, 38];                   // low (clay)
});

console.log('\nDone. Legend:');
console.log('  Validation: green=TP, orange=FP, red=FN, gray=TN');
console.log('  Soil: green=permeable(sandy), red=impermeable(clay)');
