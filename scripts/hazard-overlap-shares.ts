/**
 * Hot spots layer (hazard_overlap): how much of the city each class covers,
 * and a check of the classification at known points.
 *
 * Reads the same per-tile classification the tile route serves
 * (server/routes/hazardOverlapTileRoutes.ts), over every z14 tile that touches
 * the climate plan's heat raster (~8 m pixels). Shares are of that raster's
 * mapped area — the municipality's land as the plan analysed it.
 *
 * Usage: npx tsx scripts/hazard-overlap-shares.ts     (exits 1 if a check fails)
 */
import { classifyHazardOverlapTile, hazardOverlapAt } from '../server/routes/hazardOverlapTileRoutes';
import { arvcHazardAtPin, arvcLevelGrid, ARVC_HIGH_LEVEL } from '../server/services/arvcPointHazard';

const Z = 14, N = 2 ** Z, R = 6378137, ORIGIN = Math.PI * R;
const heat = arvcLevelGrid('heat');
if (!heat) { console.error('heat value raster missing'); process.exit(1); }
const tx = (m: number) => Math.floor(((m + ORIGIN) / (2 * ORIGIN)) * N);
const ty = (m: number) => Math.floor(((ORIGIN - m) / (2 * ORIGIN)) * N);

const n = { city: 0, flood: 0, slide: 0, hot: 0, floodHot: 0, slideHot: 0, floodSlide: 0, all3: 0, drawn: 0 };
const outside = { drawn: 0 };
let tiles = 0;
const t0 = Date.now();
for (let x = tx(heat.west); x <= tx(heat.east); x++) {
  for (let y = ty(heat.north); y <= ty(heat.south); y++) {
    const t = classifyHazardOverlapTile(Z, x, y);
    if (!t) continue;
    tiles++;
    for (let i = 0; i < t.bits.length; i++) {
      const b = t.bits[i];
      if (!(b & 8)) { if (t.cls[i]) outside.drawn++; continue; }
      const f = b & 1, s = b & 2, h = b & 4;
      n.city++;
      if (f) n.flood++;
      if (s) n.slide++;
      if (h) n.hot++;
      if (f && h) n.floodHot++;
      if (s && h) n.slideHot++;
      if (f && s) n.floodSlide++;
      if (f && s && h) n.all3++;
      if (t.cls[i]) n.drawn++;
    }
  }
}
// Ground size of a z14 pixel at the raster's mid-latitude.
const midLat = (2 * Math.atan(Math.exp((heat.north + heat.south) / 2 / R)) - Math.PI / 2);
const pxM = ((2 * ORIGIN) / N / 256) * Math.cos(midLat);
const km2 = (k: number) => ((k * pxM * pxM) / 1e6).toFixed(1);
const pct = (k: number) => ((100 * k) / n.city).toFixed(2) + '%';
console.log(`${tiles} tiles at z${Z} in ${Date.now() - t0} ms — mapped area ${km2(n.city)} km²\n`);
console.log('Single hazards (share of the mapped area)');
console.log(`  floods (SGB flood Alta)                 ${pct(n.flood)}  ${km2(n.flood)} km²`);
console.log(`  slides (SGB landslide Média + Alta)     ${pct(n.slide)}  ${km2(n.slide)} km²`);
console.log(`  overheats (PLAC heat, classes ${ARVC_HIGH_LEVEL}–4)     ${pct(n.hot)}  ${km2(n.hot)} km²`);
console.log('Overlaps (what the layer draws)');
console.log(`  floods and overheats                    ${pct(n.floodHot - n.all3)}  ${km2(n.floodHot - n.all3)} km²`);
console.log(`  slides and overheats                    ${pct(n.slideHot - n.all3)}  ${km2(n.slideHot - n.all3)} km²`);
console.log(`  floods and slides (incl. all three)     ${pct(n.floodSlide)}  ${km2(n.floodSlide)} km²`);
console.log(`    of which all three                    ${pct(n.all3)}  ${km2(n.all3)} km²`);
console.log(`  any overlap                             ${pct(n.drawn)}  ${km2(n.drawn)} km²`);
console.log(`  drawn outside the heat raster (flood + landslide only): ${km2(outside.drawn)} km²\n`);

// ── Known points (picked from the data; lat, lng) ───────────────────────────
// `hot` is cross-checked against arvcHazardAtPin, the site card's own reading.
const POINTS: Array<{ name: string; lat: number; lng: number; expect: 0 | 1 | 2 | 3; hot: boolean }> = [
  { name: 'Sarandi, northern floodplain — floods + overheats', lat: -29.9975, lng: -51.1300, expect: 1, hot: true },
  { name: 'Morro Santa Tereza slopes — slides + overheats', lat: -30.0718, lng: -51.2306, expect: 2, hot: true },
  { name: 'Moinhos de Vento — none', lat: -30.0260, lng: -51.2010, expect: 0, hot: false },
  { name: 'Lami floodplain, far south — floods, not hot: none', lat: -30.2300, lng: -51.0900, expect: 0, hot: false },
];
let failed = 0;
for (const p of POINTS) {
  const got = hazardOverlapAt(p.lat, p.lng);
  const level = arvcHazardAtPin(p.lat, p.lng).find(h => h.hazard === 'heat')?.level;
  const hot = level != null && level >= ARVC_HIGH_LEVEL;
  const ok = got === p.expect && hot === p.hot;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${p.name}: class ${got} (expected ${p.expect}), heat level ${level ?? '—'}`);
}
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
