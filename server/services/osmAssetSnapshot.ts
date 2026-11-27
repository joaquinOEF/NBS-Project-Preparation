import fs from 'fs/promises';
import path from 'path';
import * as turf from '@turf/turf';
import { CITY_SLUG, snapshotDir } from './osmReferenceLayers';

// ============================================================================
// OSM ASSET SNAPSHOT — every candidate site of the "add a site" flow, city-wide.
//
// The Site Explorer used to ask Overpass, live, for up to 20 `key=value` types
// in the bounding box of the chosen neighbourhood. That took 35–45 s when it
// answered and failed outright most of the time. The candidate features change
// slowly, so they are committed under knowledge/osm/<city>/assets/ — one file
// per `key=value` type plus an index — the same way the four reference layers
// are (see osmReferenceLayers.ts). `npm run osm:refresh -- assets` rewrites
// them. Overpass stays only as a fallback for a type the index says is missing.
//
// This module has no database import on purpose: it is the pure part (decode,
// zone filter, sort, cap) and is exercised directly by e2e/osm-asset-snapshot.
//
// FILE FORMAT (minified JSON, one per type):
//   { type, generatedAt, count, assets: [ [id, kind, coords, name?, otherTypes?] ] }
//     id          "n123" | "w123"  (OSM node / way)
//     kind        0 point · 1 line · 2 polygon (outer ring of a closed way)
//     coords      integers, degrees × 1e5 (~1 m): lon0, lat0, then the DELTA to
//                 each following point. A polygon's closing point is dropped
//                 and restored on load.
//     name        tags.name (or name:en); "" / absent when the feature is unnamed
//     otherTypes  the feature's other candidate `key=value` tags, so a park
//                 that is also landuse=grass keeps both wherever it is read from
// Lines are simplified at ~5 m; polygons are exact apart from the rounding,
// because a polygon is what gets saved as a site.
// ============================================================================

export const ASSET_COORD_SCALE = 1e5;
/** ~5 m in degrees — the Douglas-Peucker tolerance applied to lines only. */
export const LINE_SIMPLIFY_TOLERANCE_DEG = 0.000045;
export const OSM_ASSET_LIMIT = 200;

export type AssetKind = 0 | 1 | 2;
export type CompactAsset = [
  id: string,
  kind: AssetKind,
  coords: number[],
  name?: string,
  otherTypes?: string[],
];

export interface AssetTypeFile {
  type: string;
  generatedAt: string;
  count: number;
  assets: CompactAsset[];
}

export interface AssetIndexEntry {
  count: number;
  bytes: number;
  /** Raw Overpass response size, for the record of what the snapshot saves. */
  rawBytes?: number;
  file: string;
  generatedAt: string;
}

export interface AssetIndex {
  generatedAt: string;
  source: string;
  /** S,W,N,E — the Overpass bbox the snapshot was cut from. */
  sourceBbox: string;
  totalCount: number;
  totalBytes: number;
  types: Record<string, AssetIndexEntry>;
  /** Types Overpass would not deliver; these are served by the live fallback. */
  missing: Record<string, { reason: string; attemptedAt: string }>;
}

/** A candidate feature held in memory, full geometry, before any zone cut. */
export interface CandidateAsset {
  id: string;
  osmId: number;
  osmType: 'node' | 'way';
  /** tags.name, when the feature has one. */
  name?: string;
  /** Every candidate `key=value` the feature carries. */
  types: string[];
  geometry: any;
  /** [minLat, minLng, maxLat, maxLng] */
  bbox: [number, number, number, number];
}

/** What the client receives — unchanged from the live-Overpass days. */
export interface OsmAsset {
  id: string;
  osmId: number;
  osmType: string;
  name: string;
  tags: Record<string, string>;
  geometry: any;
  centroid: [number, number] | null;
  area: number;
  length: number;
  assetType: string;
}

// ----------------------------------------------------------------------------
// Paths
// ----------------------------------------------------------------------------

export function assetSnapshotDir(city: string = CITY_SLUG): string {
  return path.join(snapshotDir(city), 'assets');
}

/** `highway=service` → `highway__service.json` */
export function assetTypeFileName(type: string): string {
  const [key, value] = type.split('=');
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safe(key)}__${safe(value)}.json`;
}

export function assetIndexPath(city: string = CITY_SLUG): string {
  return path.join(assetSnapshotDir(city), 'index.json');
}

// ----------------------------------------------------------------------------
// Encode (refresh script) / decode (server)
// ----------------------------------------------------------------------------

function q(n: number): number {
  return Math.round(n * ASSET_COORD_SCALE);
}

export function encodeCoords(points: number[][]): number[] {
  const out: number[] = [];
  let px = 0;
  let py = 0;
  for (let i = 0; i < points.length; i++) {
    const x = q(points[i][0]);
    const y = q(points[i][1]);
    if (i === 0) out.push(x, y);
    else out.push(x - px, y - py);
    px = x;
    py = y;
  }
  return out;
}

export function decodeCoords(ints: number[]): number[][] {
  const out: number[][] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < ints.length; i += 2) {
    x = i === 0 ? ints[0] : x + ints[i];
    y = i === 0 ? ints[1] : y + ints[i + 1];
    out.push([x / ASSET_COORD_SCALE, y / ASSET_COORD_SCALE]);
  }
  return out;
}

/** Drop consecutive points that round to the same ~1 m cell. */
function dedupeRounded(points: number[][]): number[][] {
  const out: number[][] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || q(last[0]) !== q(p[0]) || q(last[1]) !== q(p[1])) out.push(p);
  }
  return out;
}

/**
 * Turn one Overpass element (`out tags geom`) into a compact snapshot record.
 * Relations are skipped: the live path never produced a geometry for them
 * either, so the list of candidates is the same one the app has always shown.
 *
 * @param candidateTypes every `key=value` the app can ask for, so the record
 *   keeps the feature's other candidate tags.
 */
export function compactFromOverpass(
  el: any,
  ownType: string,
  candidateTypes: Set<string>
): CompactAsset | null {
  let kind: AssetKind;
  let points: number[][];

  if (el.type === 'node' && el.lat != null && el.lon != null) {
    kind = 0;
    points = [[el.lon, el.lat]];
  } else if (el.type === 'way' && Array.isArray(el.geometry)) {
    const coords: number[][] = el.geometry
      .filter((p: any) => p && p.lon != null && p.lat != null)
      .map((p: any) => [p.lon, p.lat]);
    if (coords.length < 2) return null;
    const first = coords[0];
    const last = coords[coords.length - 1];
    const closed = first[0] === last[0] && first[1] === last[1];
    if (closed) {
      kind = 2;
      points = dedupeRounded(coords.slice(0, -1));
      if (points.length < 3) return null;
    } else {
      kind = 1;
      let line = coords;
      if (line.length > 2) {
        line = turf.simplify(turf.lineString(line), {
          tolerance: LINE_SIMPLIFY_TOLERANCE_DEG,
          highQuality: true,
        }).geometry.coordinates as number[][];
      }
      points = dedupeRounded(line);
      if (points.length < 2) return null;
    }
  } else {
    return null;
  }

  const tags: Record<string, string> = el.tags || {};
  const name: string = tags.name || tags['name:en'] || '';
  const otherTypes = Object.entries(tags)
    .map(([k, v]) => `${k}=${v}`)
    .filter(t => t !== ownType && candidateTypes.has(t));

  const record: CompactAsset = [
    `${el.type === 'node' ? 'n' : 'w'}${el.id}`,
    kind,
    encodeCoords(points),
  ];
  if (name || otherTypes.length) record.push(name);
  if (otherTypes.length) record.push(otherTypes);
  return record;
}

function bboxOf(points: number[][]): [number, number, number, number] {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const [lng, lat] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [minLat, minLng, maxLat, maxLng];
}

export function candidateFromCompact(
  record: CompactAsset,
  ownType: string
): CandidateAsset {
  const [cid, kind, ints, name, otherTypes] = record;
  const points = decodeCoords(ints);
  const osmType = cid[0] === 'n' ? 'node' : 'way';
  const osmId = Number(cid.slice(1));

  let geometry: any;
  if (kind === 0) geometry = { type: 'Point', coordinates: points[0] };
  else if (kind === 1) geometry = { type: 'LineString', coordinates: points };
  else geometry = { type: 'Polygon', coordinates: [[...points, points[0]]] };

  return {
    id: `${osmType}/${osmId}`,
    osmId,
    osmType,
    name: name || undefined,
    types: [ownType, ...(otherTypes || [])],
    geometry,
    bbox: bboxOf(points),
  };
}

/** The same normalisation for an element fetched live (the fallback path). */
export function candidateFromOverpass(
  el: any,
  ownType: string,
  candidateTypes: Set<string>
): CandidateAsset | null {
  const compact = compactFromOverpass(el, ownType, candidateTypes);
  return compact ? candidateFromCompact(compact, ownType) : null;
}

// ----------------------------------------------------------------------------
// Reading the committed snapshot (lazy, memoised per type)
// ----------------------------------------------------------------------------

const indexMemo = new Map<string, AssetIndex | null>();
const typeMemo = new Map<string, Promise<CandidateAsset[] | null>>();

export async function readAssetIndex(
  city: string = CITY_SLUG
): Promise<AssetIndex | null> {
  if (indexMemo.has(city)) return indexMemo.get(city)!;
  let index: AssetIndex | null = null;
  try {
    index = JSON.parse(await fs.readFile(assetIndexPath(city), 'utf-8'));
  } catch {
    index = null;
  }
  indexMemo.set(city, index);
  return index;
}

/** Candidates of one type, or null when the snapshot does not hold that type. */
export function readAssetType(
  type: string,
  city: string = CITY_SLUG
): Promise<CandidateAsset[] | null> {
  const memoKey = `${city}/${type}`;
  const memo = typeMemo.get(memoKey);
  if (memo) return memo;

  const loading = (async () => {
    const index = await readAssetIndex(city);
    const entry = index?.types?.[type];
    if (!entry) return null;
    try {
      const raw = await fs.readFile(
        path.join(assetSnapshotDir(city), entry.file),
        'utf-8'
      );
      const file: AssetTypeFile = JSON.parse(raw);
      return file.assets.map(r => candidateFromCompact(r, type));
    } catch (err: any) {
      console.warn(
        `[osm-assets] index lists ${type} but ${entry.file} is unreadable: ${err?.message || err}`
      );
      typeMemo.delete(memoKey);
      return null;
    }
  })();
  typeMemo.set(memoKey, loading);
  return loading;
}

export function clearAssetSnapshotMemo(): void {
  indexMemo.clear();
  typeMemo.clear();
}

/** Is this [S,W,N,E] bbox wholly inside the area the snapshot was cut from? */
export function bboxWithinCoverage(
  bbox: [number, number, number, number],
  index: AssetIndex
): boolean {
  const [s, w, n, e] = index.sourceBbox.split(',').map(Number);
  return bbox[0] >= s && bbox[1] >= w && bbox[2] <= n && bbox[3] <= e;
}

export async function logAssetSnapshotStatus(
  city: string = CITY_SLUG
): Promise<void> {
  const index = await readAssetIndex(city);
  if (!index) {
    console.warn(
      '[osm-assets] NO ASSET SNAPSHOT — every site search will hit Overpass. ' +
        'Run `npm run osm:refresh -- assets` and commit the result.'
    );
    return;
  }
  const ageDays = Math.round(
    (Date.now() - new Date(index.generatedAt).getTime()) / 86_400_000
  );
  const missing = Object.keys(index.missing || {});
  console.log(
    `[osm-assets] snapshot: ${index.totalCount} candidate sites in ${Object.keys(index.types).length} types, ` +
      `${(index.totalBytes / 1_048_576).toFixed(1)} MB, ${ageDays}d old` +
      (missing.length ? ` — MISSING (live fallback): ${missing.join(', ')}` : '')
  );
}

// ----------------------------------------------------------------------------
// Zone filter — "is this feature in the neighbourhood?", against its outline
// ----------------------------------------------------------------------------

type Ring = number[][];

export interface PreparedZone {
  /** [minLat, minLng, maxLat, maxLng] */
  bbox: [number, number, number, number];
  /** Each polygon: outer ring first, then holes. */
  polygons: Ring[][];
  /** Every ring edge as [x1, y1, x2, y2], for the crossing test. */
  edges: Float64Array;
}

function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygons(x: number, y: number, polygons: Ring[][]): boolean {
  for (const rings of polygons) {
    if (!pointInRing(x, y, rings[0])) continue;
    let inHole = false;
    for (let h = 1; h < rings.length; h++) {
      if (pointInRing(x, y, rings[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

/** Accepts a Polygon / MultiPolygon geometry (or a Feature wrapping one). */
export function prepareZone(zoneGeometry: any): PreparedZone | null {
  const g = zoneGeometry?.type === 'Feature' ? zoneGeometry.geometry : zoneGeometry;
  let polygons: Ring[][];
  if (g?.type === 'Polygon') polygons = [g.coordinates];
  else if (g?.type === 'MultiPolygon') polygons = g.coordinates;
  else return null;
  polygons = polygons.filter(p => Array.isArray(p?.[0]) && p[0].length >= 4);
  if (!polygons.length) return null;

  const edges: number[] = [];
  const all: number[][] = [];
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        edges.push(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1]);
      }
    }
    all.push(...rings[0]);
  }
  return { bbox: bboxOf(all), polygons, edges: Float64Array.from(edges) };
}

function segmentsCross(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number
): boolean {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}

function pathCrossesZone(points: number[][], zone: PreparedZone): boolean {
  const e = zone.edges;
  for (let i = 0; i < points.length - 1; i++) {
    const ax = points[i][0];
    const ay = points[i][1];
    const bx = points[i + 1][0];
    const by = points[i + 1][1];
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    for (let k = 0; k < e.length; k += 4) {
      if (
        Math.max(e[k], e[k + 2]) < minX ||
        Math.min(e[k], e[k + 2]) > maxX ||
        Math.max(e[k + 1], e[k + 3]) < minY ||
        Math.min(e[k + 1], e[k + 3]) > maxY
      ) {
        continue;
      }
      if (segmentsCross(ax, ay, bx, by, e[k], e[k + 1], e[k + 2], e[k + 3])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * True when any part of the feature lies inside the zone outline: a point in
 * it, a line or polygon with a vertex in it or an edge crossing it, or a
 * polygon that swallows the zone whole. A bbox test is not enough — a
 * neighbourhood's bbox takes in pieces of every neighbour around it.
 */
export function candidateInZone(
  asset: Pick<CandidateAsset, 'geometry' | 'bbox'>,
  zone: PreparedZone
): boolean {
  const [s, w, n, e] = asset.bbox;
  const [zs, zw, zn, ze] = zone.bbox;
  if (s > zn || n < zs || w > ze || e < zw) return false;

  const g = asset.geometry;
  if (g.type === 'Point') {
    return pointInPolygons(g.coordinates[0], g.coordinates[1], zone.polygons);
  }

  const paths: number[][][] =
    g.type === 'LineString'
      ? [g.coordinates]
      : g.type === 'MultiLineString' || g.type === 'Polygon'
        ? g.coordinates
        : g.type === 'MultiPolygon'
          ? g.coordinates.flat()
          : [];

  for (const pts of paths) {
    for (const p of pts) {
      if (pointInPolygons(p[0], p[1], zone.polygons)) return true;
    }
  }
  for (const pts of paths) {
    if (pathCrossesZone(pts, zone)) return true;
  }
  if (g.type === 'Polygon') {
    const [zx, zy] = zone.polygons[0][0][0];
    if (pointInRing(zx, zy, g.coordinates[0])) return true;
  }
  return false;
}

// ----------------------------------------------------------------------------
// Candidate → the asset the client draws and lists
// ----------------------------------------------------------------------------

function lineLengthMeters(coords: number[][]): number {
  let length = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i];
    const [lng2, lat2] = coords[i + 1];
    const dLat = (lat2 - lat1) * 111319;
    const dLng =
      (lng2 - lng1) * 111319 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
    length += Math.sqrt(dLat * dLat + dLng * dLng);
  }
  return length;
}

/**
 * Shape a candidate exactly as the live service always has: a polygon carries
 * its area and vertex-mean centroid; a line is clipped to the zone's bounding
 * box and carries the clipped length. The arithmetic (including the planar
 * area) is the service's own, kept so a site reads the same size as before.
 *
 * @param bbox the zone's [S, W, N, E]
 */
export function toOsmAsset(
  c: CandidateAsset,
  requestedTypes: string[],
  bbox: [number, number, number, number]
): OsmAsset | null {
  let geometry: any = c.geometry;
  let centroid: [number, number] | null = null;
  let area = 0;
  let length = 0;

  if (geometry.type === 'Point') {
    centroid = [geometry.coordinates[1], geometry.coordinates[0]];
  } else if (geometry.type === 'Polygon') {
    const coords: number[][] = geometry.coordinates[0];
    const latSum = coords.reduce((s, p) => s + p[1], 0);
    const lngSum = coords.reduce((s, p) => s + p[0], 0);
    centroid = [latSum / coords.length, lngSum / coords.length];
    area =
      Math.abs(
        coords.reduce((a, p, i) => {
          const next = coords[(i + 1) % coords.length];
          return a + (p[0] * next[1] - next[0] * p[1]);
        }, 0) / 2
      ) *
      111319 *
      111319;
  } else {
    const coords: number[][] = geometry.coordinates;
    try {
      const clipped = turf.bboxClip(turf.lineString(coords), [
        bbox[1],
        bbox[0],
        bbox[3],
        bbox[2],
      ]);
      const cg = clipped.geometry;
      if (cg.type === 'LineString' && cg.coordinates.length >= 2) {
        geometry = cg;
        const cc = cg.coordinates as number[][];
        centroid = cc[Math.floor(cc.length / 2)].slice().reverse() as [number, number];
        length = lineLengthMeters(cc);
      } else if (cg.type === 'MultiLineString' && cg.coordinates.length > 0) {
        geometry = cg;
        const all = (cg.coordinates as number[][][]).flat();
        centroid = all[Math.floor(all.length / 2)].slice().reverse() as [number, number];
        length = (cg.coordinates as number[][][]).reduce(
          (total, seg) => total + lineLengthMeters(seg),
          0
        );
      } else {
        return null;
      }
    } catch {
      centroid = [coords[0][1], coords[0][0]];
      length = lineLengthMeters(coords);
    }
  }

  const assetType =
    requestedTypes.find(t => c.types.includes(t)) || c.types[0] || 'unknown';
  const tags: Record<string, string> = {};
  if (c.name) tags.name = c.name;
  for (const t of c.types) {
    const [k, v] = t.split('=');
    tags[k] = v;
  }

  return {
    id: c.id,
    osmId: c.osmId,
    osmType: c.osmType,
    name: c.name || `${assetType.split('=')[1] || 'Asset'} #${c.osmId}`,
    tags,
    geometry,
    centroid,
    area,
    length,
    assetType,
  };
}

// ----------------------------------------------------------------------------
// Sort + cap — what used to happen in the browser
// ----------------------------------------------------------------------------

/** Named sites first, then the largest (area for polygons, length for lines). */
export function sortOsmAssets<T extends Pick<OsmAsset, 'id' | 'tags' | 'area' | 'length'>>(
  assets: T[]
): T[] {
  return [...assets].sort((a, b) => {
    const aNamed = a.tags?.name ? 1 : 0;
    const bNamed = b.tags?.name ? 1 : 0;
    if (aNamed !== bNamed) return bNamed - aNamed;
    const aSize = a.area || a.length || 0;
    const bSize = b.area || b.length || 0;
    if (aSize !== bSize) return bSize - aSize;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface ZoneSelection {
  assets: OsmAsset[];
  /** How many sites the zone holds before the cap. */
  totalFound: number;
  /** Candidates inside the zone's bounding box. */
  inBbox: number;
  /** Of those, how many the zone outline excluded. */
  outsideZone: number;
}

/**
 * The whole server-side selection: bbox prefilter → zone outline → shape →
 * sort → cap. Candidates may repeat across types; the first one wins.
 *
 * @param bbox the zone's [S, W, N, E], as the client sends it
 */
export function selectAssetsForZone(
  candidates: CandidateAsset[],
  requestedTypes: string[],
  bbox: [number, number, number, number],
  zoneGeometry: any,
  limit: number = OSM_ASSET_LIMIT
): ZoneSelection {
  const zone = prepareZone(zoneGeometry);
  const seen = new Set<string>();
  const kept: OsmAsset[] = [];
  let inBbox = 0;
  let outsideZone = 0;

  for (const c of candidates) {
    const [s, w, n, e] = c.bbox;
    if (s > bbox[2] || n < bbox[0] || w > bbox[3] || e < bbox[1]) continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    inBbox++;
    if (zone && !candidateInZone(c, zone)) {
      outsideZone++;
      continue;
    }
    const asset = toOsmAsset(c, requestedTypes, bbox);
    if (asset) kept.push(asset);
  }

  const sorted = sortOsmAssets(kept);
  return {
    assets: sorted.slice(0, limit),
    totalFound: sorted.length,
    inBbox,
    outsideZone,
  };
}
