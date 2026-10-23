// ============================================================================
// THE 2022 CENSUS AROUND A SITE — lookup over the imported snapshot
// ============================================================================
// Reads knowledge/porto-alegre/census-2022 (scripts/import-census-2022.ts) and
// answers, for a point or several: the tracts that touch ~300 m, summed; and
// the health units, public schools, quilombos and indigenous lands nearby.
// The lines that say it are shared/census.ts. Pure lookup, no model, no call
// at runtime.
//
// "Touching 300 m" (decision U2, 23 Oct): a tract counts whole if any part of
// it is within 300 m — honest about being approximate ("moram a até ~300 m"),
// and it over-counts where tracts are large or many (Floresta, Santana).
// ============================================================================

import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { summariseTracts, type CensusAround, type CensusNearby, type TractStats, type WeightedTract } from '@shared/census';
import { sitePoint } from './siteContext';

const RADIUS_M = 300;
const NEARBY_M = 1000;

interface Tract { id: string; bairro: string; rings: number[][][]; bbox: [number, number, number, number]; areaM2: number }
type Stats = TractStats;
interface Place { kind: CensusNearby['kind']; name: string; source: string; rings: number[][][] | null; point: [number, number] | null; bbox: [number, number, number, number] }
interface Loaded { tracts: Tract[]; stats: Record<string, Stats>; places: Place[] }

let cache: Loaded | null | undefined;
const dir = () => path.join(process.cwd(), 'knowledge', 'porto-alegre', 'census-2022');

function ringsOf(g: any): number[][][] {
  if (!g) return [];
  if (g.type === 'Polygon') return g.coordinates;
  if (g.type === 'MultiPolygon') return g.coordinates.flat();
  return [];
}
/** Shoelace in local metres: outer rings minus holes. */
function polygonAreaM2(g: any): number {
  const polys: number[][][][] = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  const k = Math.cos((-30.05 * Math.PI) / 180);
  const ringArea = (r: number[][]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2) * 111_320 * k * 110_540; };
  return polys.reduce((sum, poly) => sum + poly.reduce((a, r, i) => a + (i === 0 ? ringArea(r) : -ringArea(r)), 0), 0);
}
function bboxOf(rings: number[][][]): [number, number, number, number] {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const r of rings) for (const [x, y] of r) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}

function load(): Loaded | null {
  if (cache !== undefined) return cache;
  const read = (f: string) => JSON.parse(gunzipSync(readFileSync(path.join(dir(), f))).toString('utf8'));
  if (!existsSync(path.join(dir(), 'stats.json.gz'))) { cache = null; return null; }
  try {
    const tracts: Tract[] = read('tracts.geojson.gz').features.map((f: any) => {
      const rings = ringsOf(f.geometry);
      return { id: f.properties.s, bairro: f.properties.b, rings, bbox: bboxOf(rings), areaM2: polygonAreaM2(f.geometry) };
    });
    const places: Place[] = [...read('services.geojson.gz').features, ...read('territories.geojson.gz').features].map((f: any) => {
      const point = f.geometry?.type === 'Point' ? f.geometry.coordinates as [number, number] : null;
      const rings = point ? null : ringsOf(f.geometry);
      return { kind: f.properties.kind, name: f.properties.name, source: f.properties.source, point, rings, bbox: point ? [point[0], point[1], point[0], point[1]] : bboxOf(rings!) };
    });
    cache = { tracts, stats: read('stats.json.gz'), places };
  } catch (err) {
    console.warn(`[census] snapshot unreadable: ${(err as Error).message}`);
    cache = null;
  }
  return cache;
}

/** Local metres around (lat0, lng0) — fine at city scale. */
const toXY = (lat0: number, lng0: number, lng: number, lat: number): [number, number] =>
  [(lng - lng0) * 111_320 * Math.cos((lat0 * Math.PI) / 180), (lat - lat0) * 110_540];

function inside(x: number, y: number, ring: number[][]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[j];
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c;
  }
  return c;
}
function segDist(px: number, py: number, a: number[], b: number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L));
  return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy);
}
/** Metres from the point to a polygon (0 inside). Outer rings only matter for "touches". */
function distanceToRings(lat: number, lng: number, rings: number[][][]): number {
  let best = Infinity;
  for (const ring of rings) {
    const xy = ring.map(([x, y]) => toXY(lat, lng, x, y));
    if (inside(0, 0, xy)) return 0;
    for (let i = 1; i < xy.length; i++) best = Math.min(best, segDist(0, 0, xy[i - 1], xy[i]));
  }
  return best;
}
/** Cheap reject: the bbox expanded by `m` metres does not contain the point. */
function nearBbox(lat: number, lng: number, b: [number, number, number, number], m: number): boolean {
  const dLat = m / 110_540, dLng = m / (111_320 * Math.cos((lat * Math.PI) / 180));
  return lng >= b[0] - dLng && lng <= b[2] + dLng && lat >= b[1] - dLat && lat <= b[3] + dLat;
}

function tractsAround(L: Loaded, lat: number, lng: number): string[] {
  return L.tracts.filter(t => nearBbox(lat, lng, t.bbox, RADIUS_M) && distanceToRings(lat, lng, t.rings) <= RADIUS_M).map(t => t.id);
}

/**
 * How much of each tract lies inside the circle(s): a grid of 20 m cells over
 * the union of the 300 m circles, each cell given to the tract it falls in.
 * weight = cells × cell area ÷ tract area (≤ 1). Counting whole tracts that
 * merely touch the circle read ~2× high (median, 80 points across the city —
 * e2e/record-defects.spec.ts); this is the count inside the circle.
 */
const CELL_M = 20;
function weightsAround(L: Loaded, points: Array<{ lat: number; lng: number }>): Map<string, number> {
  const kx = 111_320 * Math.cos((-30.05 * Math.PI) / 180), ky = 110_540;
  const cells = new Set<string>();
  for (const p of points) {
    const gx0 = Math.round((p.lng * kx) / CELL_M), gy0 = Math.round((p.lat * ky) / CELL_M), n = Math.ceil(RADIUS_M / CELL_M);
    for (let dx = -n; dx <= n; dx++) for (let dy = -n; dy <= n; dy++) {
      const cx = (gx0 + dx) * CELL_M, cy = (gy0 + dy) * CELL_M;
      if (Math.hypot(cx - p.lng * kx, cy - p.lat * ky) <= RADIUS_M) cells.add(`${gx0 + dx}:${gy0 + dy}`);
    }
  }
  const candidates = L.tracts.filter(t => points.some(p => nearBbox(p.lat, p.lng, t.bbox, RADIUS_M + CELL_M)));
  const count = new Map<string, number>();
  for (const key of Array.from(cells)) {
    const [gx, gy] = key.split(':').map(Number);
    const lng = (gx * CELL_M) / kx, lat = (gy * CELL_M) / ky;
    for (const t of candidates) {
      if (lng < t.bbox[0] || lng > t.bbox[2] || lat < t.bbox[1] || lat > t.bbox[3]) continue;
      if (t.rings.some(r => inside(lng, lat, r))) { count.set(t.id, (count.get(t.id) ?? 0) + 1); break; }
    }
  }
  const area = new Map(candidates.map(t => [t.id, t.areaM2]));
  const out = new Map<string, number>();
  count.forEach((n, id) => out.set(id, Math.min(1, (n * CELL_M * CELL_M) / Math.max(area.get(id) ?? 1, 1))));
  return out;
}

function summarise(L: Loaded, weights: Map<string, number>, nearby: CensusNearby[]): CensusAround {
  const entries = Array.from(weights.entries()).filter(([id]) => L.stats[id]).map(([id, w]) => [id, { ...L.stats[id], share: w }]);
  return summariseTracts(Object.fromEntries(entries), nearby)!;
}

/** The tracts around a point with their figures — what a board needs to count a combined project itself. */
export function tractStatsAround(lat: number, lng: number): Record<string, WeightedTract> | null {
  const L = load();
  if (!L) return null;
  const w = weightsAround(L, [{ lat, lng }]);
  return w.size ? Object.fromEntries(Array.from(w.entries()).filter(([id]) => L.stats[id]).map(([id, x]) => [id, { ...L.stats[id], share: x }])) : null;
}

function nearbyOf(L: Loaded, lat: number, lng: number): CensusNearby[] {
  const out: CensusNearby[] = [];
  for (const p of L.places) {
    if (!nearBbox(lat, lng, p.bbox, NEARBY_M)) continue;
    const d = p.point ? Math.hypot(...toXY(lat, lng, p.point[0], p.point[1])) : distanceToRings(lat, lng, p.rings!);
    if (d <= NEARBY_M) out.push({ kind: p.kind, name: p.name, distanceM: Math.round(d), source: p.source });
  }
  return out.sort((a, b) => a.distanceM - b.distanceM);
}

/** The census around one point; null when the snapshot is absent or the point is outside the city. */
export function censusAround(lat: number, lng: number): CensusAround | null {
  const L = load();
  if (!L || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const w = weightsAround(L, [{ lat, lng }]);
  if (!w.size) return null;
  return summarise(L, w, nearbyOf(L, lat, lng));
}

/** Several points together — each tract counted ONCE (a combined project). */
export function censusAroundMany(points: Array<{ lat: number; lng: number }>): CensusAround | null {
  const L = load();
  if (!L) return null;
  const ok = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const w = ok.length ? weightsAround(L, ok) : new Map<string, number>();
  return w.size ? summarise(L, w, []) : null;
}

/** The census for a record's site fields — the same pin as the map facts (siteContext.sitePoint). */
export function censusForSite(site: Record<string, string | undefined>): CensusAround | null {
  const p = sitePoint(site);
  return p ? censusAround(p.lat, p.lng) : null;
}

/** The census bairro of the tract a point falls in — the official name for where the pin is. */
export function censusBairroAt(lat: number, lng: number): string | null {
  const L = load();
  if (!L) return null;
  for (const t of L.tracts) if (nearBbox(lat, lng, t.bbox, 0) && distanceToRings(lat, lng, t.rings) === 0) return t.bairro;
  return null;
}

/** 2022 population of a bairro (sum of its tracts), by census bairro name. */
export function censusBairroPopulation(bairro: string): number | null {
  const L = load();
  if (!L) return null;
  const want = normName(bairro);
  let sum = 0, hit = false;
  for (const t of L.tracts) if (normName(t.bairro) === want) { sum += L.stats[t.id]?.p ?? 0; hit = true; }
  return hit ? sum : null;
}
const normName = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** For tests: forget the loaded snapshot. */
export function resetCensus(): void { cache = undefined; }
