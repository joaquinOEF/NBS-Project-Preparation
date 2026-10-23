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
import { summariseTracts, type CensusAround, type CensusNearby, type TractStats } from '@shared/census';
import { sitePoint } from './siteContext';

const RADIUS_M = 300;
const NEARBY_M = 1000;

interface Tract { id: string; bairro: string; rings: number[][][]; bbox: [number, number, number, number] }
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
      return { id: f.properties.s, bairro: f.properties.b, rings, bbox: bboxOf(rings) };
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

function summarise(L: Loaded, ids: string[], nearby: CensusNearby[]): CensusAround {
  return summariseTracts(Object.fromEntries(ids.filter(id => L.stats[id]).map(id => [id, L.stats[id]])), nearby)!;
}

/** The tracts around a point with their figures — what a board needs to count a combined project itself. */
export function tractStatsAround(lat: number, lng: number): Record<string, TractStats> | null {
  const L = load();
  if (!L) return null;
  const ids = tractsAround(L, lat, lng);
  return ids.length ? Object.fromEntries(ids.map(id => [id, L.stats[id]])) : null;
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
  const ids = tractsAround(L, lat, lng);
  if (!ids.length) return null;
  return summarise(L, ids, nearbyOf(L, lat, lng));
}

/** Several points together — each tract counted ONCE (a combined project). */
export function censusAroundMany(points: Array<{ lat: number; lng: number }>): CensusAround | null {
  const L = load();
  if (!L) return null;
  const ids = new Set<string>();
  for (const p of points) if (Number.isFinite(p.lat) && Number.isFinite(p.lng)) for (const id of tractsAround(L, p.lat, p.lng)) ids.add(id);
  return ids.size ? summarise(L, Array.from(ids), []) : null;
}

/** The census for a record's site fields — the same pin as the map facts (siteContext.sitePoint). */
export function censusForSite(site: Record<string, string | undefined>): CensusAround | null {
  const p = sitePoint(site);
  return p ? censusAround(p.lat, p.lng) : null;
}

/** For tests: forget the loaded snapshot. */
export function resetCensus(): void { cache = undefined; }
