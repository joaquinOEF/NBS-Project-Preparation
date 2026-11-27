// ============================================================================
// OFFICIAL HAZARD SHARES PER BAIRRO — the input to the zone hazard flags
// ============================================================================
// Since 24 Nov 2026 a hazard shown to a user is official data
// (docs/sgb-suscetibilidade.md): flood + landslide = SGB susceptibility,
// heat = the climate plan's ameaça (PLAC/ARVC 2050). This module answers one
// question per bairro and hazard: WHAT SHARE OF ITS AREA is in the official
// high class(es)?
//
//   sgbFloodAltaShare   SGB inundação, classe Alta
//   guaiba2024Share     inside the area the Guaíba reached in May 2024 — the
//                       SMAMUS contours at or below 5,35 m, the same fact the pin
//                       reading uses where SGB draws nothing
//                       (server/services/officialHazardFacts.ts → guaiba2024CmAt).
//                       Read here straight from the same file,
//                       knowledge/porto-alegre/city/layers/cotas-inundacao.geojson.gz:
//                       that function runs every city layer per point, far too
//                       slow for the ~800 000 lattice points.
//   sgbLandslideShare   SGB movimento de massa, classes Média + Alta
//   heatHighShare       PLAC/ARVC calor 2050, the two top classes (3 and 4) —
//                       the same "hot" the site card and the tour use
//                       (server/services/arvcPointHazard.ts → level ≥ 3)
//
// Method: a regular lattice of points ~25 m apart inside the bairro polygon,
// each point classed by the same sources the pin reading uses. The denominator
// is always the bairro's whole area, so a share reads "X% of the neighbourhood".
// Deterministic (no random sampling), no GDAL.
//
// Used by scripts/generate-neighborhood-zones.ts. Run on its own to print the
// distribution the cuts were chosen from:
//   npx tsx scripts/zone-official-shares.ts
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { arvcHazardAtPin } from '../server/services/arvcPointHazard';
import { gunzipSync } from 'node:zlib';

const STEP_M = 25;
const M_PER_DEG_LAT = 111_320;

interface Part { rings: Float64Array[]; minX: number; minY: number; maxX: number; maxY: number }

function toParts(geometry: any): Part[] {
  const polys: number[][][][] = !geometry ? []
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  return polys.map(poly => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const rings = poly.map(ring => {
      const a = new Float64Array(ring.length * 2);
      ring.forEach(([x, y], i) => {
        a[2 * i] = x; a[2 * i + 1] = y;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      });
      return a;
    });
    return { rings, minX, minY, maxX, maxY };
  });
}

/** Even–odd over a polygon's rings (holes included), like the SGB tile route. */
function inParts(parts: Part[], x: number, y: number): boolean {
  for (const p of parts) {
    if (x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) continue;
    let inside = false;
    for (const r of p.rings) {
      const n = r.length / 2;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = r[2 * i + 1], yj = r[2 * j + 1];
        if ((yi > y) !== (yj > y) && x < r[2 * i] + ((y - yi) / (yj - yi)) * (r[2 * j] - r[2 * i])) inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

let sgb: { floodAlta: Part[]; landslide: Part[]; landslideAlta: Part[] } | undefined;
function loadSgb() {
  if (sgb) return sgb;
  const dir = path.join(process.cwd(), 'knowledge/official-risk/porto-alegre');
  const read = (slug: string) => JSON.parse(fs.readFileSync(path.join(dir, `sgb-suscetibilidade-${slug}.json`), 'utf-8'));
  const partsOf = (gj: any, classes: string[]) =>
    (gj.features as any[]).filter(f => classes.includes(f.properties?.classe)).flatMap(f => toParts(f.geometry));
  const flood = read('inundacao'), mass = read('movimento-de-massa');
  sgb = {
    floodAlta: partsOf(flood, ['Alta']),
    landslide: partsOf(mass, ['Média', 'Alta']),
    landslideAlta: partsOf(mass, ['Alta']),
  };
  return sgb;
}

/** The Guaíba level of May 2024 in the SMAMUS contours' unit (cm) — as in officialHazardFacts.ts. */
const GUAIBA_MAY_2024_CM = 535;
let guaiba2024: Part[] | undefined;
function loadGuaiba2024(): Part[] {
  if (guaiba2024) return guaiba2024;
  const file = path.join(process.cwd(), 'knowledge/porto-alegre/city/layers/cotas-inundacao.geojson.gz');
  const gj = JSON.parse(gunzipSync(fs.readFileSync(file)).toString('utf8'));
  // The contours are cumulative (each holds the lower ones, to within 0.4% of
  // the area after simplification), so the highest one the flood reached is the
  // whole reached area — one feature instead of 30.
  const reached = (gj.features as any[])
    .filter(f => /Polygon/.test(f?.geometry?.type ?? '') && Number(f.properties?.contourmax) <= GUAIBA_MAY_2024_CM)
    .sort((a, b) => Number(b.properties.contourmax) - Number(a.properties.contourmax));
  guaiba2024 = reached.length ? toParts(reached[0].geometry) : [];
  return guaiba2024;
}

export interface OfficialShares {
  /** Share (0–1) of the bairro's area in SGB flood susceptibility class Alta. */
  sgbFloodAltaShare: number;
  /** Share inside the area the Guaíba reached in May 2024 (SMAMUS contours ≤ 5,35 m). */
  guaiba2024Share: number;
  /** Share in SGB mass-movement susceptibility classes Média + Alta. */
  sgbLandslideShare: number;
  /** Share in SGB mass-movement class Alta alone (informational). */
  sgbLandslideAltaShare: number;
  /** Share in the climate plan's 2050 heat hazard, two top classes. */
  heatHighShare: number;
  /** Lattice points used (≈ area / 625 m²). */
  samples: number;
  /** Share of the bairro the heat raster covers at all (it has no value over water). */
  heatCoverage: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function officialShares(geometry: any): OfficialShares {
  const s = loadSgb();
  const reached2024 = loadGuaiba2024();
  const parts = toParts(geometry);
  const minY = Math.min(...parts.map(p => p.minY)), maxY = Math.max(...parts.map(p => p.maxY));
  const minX = Math.min(...parts.map(p => p.minX)), maxX = Math.max(...parts.map(p => p.maxX));
  const dLat = STEP_M / M_PER_DEG_LAT;
  const dLng = STEP_M / (M_PER_DEG_LAT * Math.cos(((minY + maxY) / 2) * Math.PI / 180));
  let n = 0, flood = 0, guaiba = 0, slide = 0, slideAlta = 0, hot = 0, heatSeen = 0;
  for (let lat = minY + dLat / 2; lat < maxY; lat += dLat) {
    for (let lng = minX + dLng / 2; lng < maxX; lng += dLng) {
      if (!inParts(parts, lng, lat)) continue;
      n++;
      if (inParts(s.floodAlta, lng, lat)) flood++;
      if (inParts(reached2024, lng, lat)) guaiba++;
      if (inParts(s.landslide, lng, lat)) { slide++; if (inParts(s.landslideAlta, lng, lat)) slideAlta++; }
      const heat = arvcHazardAtPin(lat, lng).find(h => h.hazard === 'heat');
      if (heat) { heatSeen++; if (heat.level >= 3) hot++; }
    }
  }
  const share = (k: number) => (n > 0 ? round3(k / n) : 0);
  return {
    sgbFloodAltaShare: share(flood),
    guaiba2024Share: share(guaiba),
    sgbLandslideShare: share(slide),
    sgbLandslideAltaShare: share(slideAlta),
    heatHighShare: share(hot),
    samples: n,
    heatCoverage: share(heatSeen),
  };
}

// ── CLI: print the three shares for every bairro (how the cuts were chosen) ──
if (process.argv[1] && /zone-official-shares\.ts$/.test(process.argv[1])) {
  const ibge = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'client/public/sample-data/porto-alegre-neighborhood-zones.json'), 'utf-8'));
  const rows = (ibge.geoJson.features as any[]).map(f => ({ name: f.properties.neighbourhoodName as string, ...officialShares(f.geometry) }));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows));
  } else {
    for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`${r.name.padEnd(28)} flood ${String(Math.round(r.sgbFloodAltaShare * 100)).padStart(3)}%  guaíba 2024 ${String(Math.round(r.guaiba2024Share * 100)).padStart(3)}%  landslide ${String(Math.round(r.sgbLandslideShare * 100)).padStart(3)}% (alta ${String(Math.round(r.sgbLandslideAltaShare * 100)).padStart(2)}%)  heat ${String(Math.round(r.heatHighShare * 100)).padStart(3)}%  n=${r.samples}`);
    }
  }
}
