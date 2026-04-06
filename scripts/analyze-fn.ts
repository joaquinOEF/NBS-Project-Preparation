import * as fs from 'fs';
const grid = JSON.parse(fs.readFileSync('client/public/sample-data/porto-alegre-grid-250m.json', 'utf-8'));

const THRESH = 0.40;
const tp: any[] = [], fn: any[] = [], fp: any[] = [], tn: any[] = [];

for (const cell of grid.geoJson.features) {
  const m = cell.properties.metrics;
  const pred = (m.flood_score || 0) >= THRESH;
  const actual = m.in_flood_2024 === 1;
  if (pred && actual) tp.push(m);
  else if (!pred && actual) fn.push(m);
  else if (pred && !actual) fp.push(m);
  else tn.push(m);
}

function avg(arr: any[], key: string) {
  const vals = arr.map(m => m[key]).filter((v: any) => v != null);
  return vals.length > 0 ? (vals.reduce((a: number, b: number) => a + b, 0) / vals.length).toFixed(3) : 'N/A';
}

console.log('=== What distinguishes TP from FN? ===');
console.log('Metric                 TP (caught)  FN (missed)');
console.log('FRI raw:              ', avg(tp, 'fri_raw'), '      ', avg(fn, 'fri_raw'));
console.log('Elevation:            ', avg(tp, 'elevation_mean'), '     ', avg(fn, 'elevation_mean'));
console.log('River proximity:      ', avg(tp, 'river_prox_pct'), '      ', avg(fn, 'river_prox_pct'));
console.log('Low-lying:            ', avg(tp, 'low_lying_pct'), '      ', avg(fn, 'low_lying_pct'));
console.log('Flow accumulation:    ', avg(tp, 'flow_accum_pct'), '      ', avg(fn, 'flow_accum_pct'));
console.log('Imperviousness:       ', avg(tp, 'imperv_pct'), '      ', avg(fn, 'imperv_pct'));
console.log('Soil permeability:    ', avg(tp, 'soil_permeability'), '      ', avg(fn, 'soil_permeability'));
console.log('Flood score:          ', avg(tp, 'flood_score'), '      ', avg(fn, 'flood_score'));

console.log('\nTP:', tp.length, '| FN:', fn.length, '| FP:', fp.length, '| TN:', tn.length);

// How many FN have high FRI?
const fnHighFri = fn.filter(m => m.fri_raw != null && m.fri_raw > 0.4);
const fnNoFri = fn.filter(m => m.fri_raw == null);
console.log('\nFN with FRI > 0.4:', fnHighFri.length, '(FRI says risky but our score missed)');
console.log('FN with null FRI:', fnNoFri.length, '(no FRI data at all)');
console.log('FN avg FRI (where available):', avg(fn.filter(m => m.fri_raw != null), 'fri_raw'));
console.log('TP avg FRI (where available):', avg(tp.filter(m => m.fri_raw != null), 'fri_raw'));

// DW class distribution
const dwClasses = ['Water', 'Trees', 'Grass', 'FloodedVeg', 'Crops', 'Shrub', 'Built', 'Bare', 'Snow'];
console.log('\nDW class distribution:');
console.log('Class          FN     TP     TN');
for (let c = 0; c <= 8; c++) {
  const fnC = fn.filter(m => m.dw_class === c).length;
  const tpC = tp.filter(m => m.dw_class === c).length;
  const tnC = tn.filter(m => m.dw_class === c).length;
  if (fnC + tpC > 0) console.log(`  ${dwClasses[c].padEnd(12)} ${String(fnC).padStart(5)}  ${String(tpC).padStart(5)}  ${String(tnC).padStart(5)}`);
}
const fnNoClass = fn.filter(m => m.dw_class == null).length;
console.log(`  NoData       ${String(fnNoClass).padStart(5)}`);

// Geographic pattern of FN: where are they?
const fnCentroids = grid.geoJson.features
  .filter((c: any) => {
    const m = c.properties.metrics;
    return m.in_flood_2024 === 1 && (m.flood_score || 0) < THRESH;
  })
  .map((c: any) => c.properties.centroid);

const avgFnLat = fnCentroids.reduce((s: number, c: number[]) => s + c[1], 0) / fnCentroids.length;
const avgFnLng = fnCentroids.reduce((s: number, c: number[]) => s + c[0], 0) / fnCentroids.length;
const avgTpLat = grid.geoJson.features
  .filter((c: any) => c.properties.metrics.in_flood_2024 === 1 && (c.properties.metrics.flood_score || 0) >= THRESH)
  .map((c: any) => c.properties.centroid)
  .reduce((s: number, c: number[]) => s + c[1], 0) / tp.length;
const avgTpLng = grid.geoJson.features
  .filter((c: any) => c.properties.metrics.in_flood_2024 === 1 && (c.properties.metrics.flood_score || 0) >= THRESH)
  .map((c: any) => c.properties.centroid)
  .reduce((s: number, c: number[]) => s + c[0], 0) / tp.length;

console.log(`\nGeographic center of FN: (${avgFnLat.toFixed(3)}, ${avgFnLng.toFixed(3)})`);
console.log(`Geographic center of TP: (${avgTpLat.toFixed(3)}, ${avgTpLng.toFixed(3)})`);
