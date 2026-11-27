// ============================================================================
// SITE EXPLORER — "what is at this point?"
// ============================================================================
// One read for the click-to-add card on the map and for the chat's proposal
// (shared/explorer-site.ts has the shape): the neighbourhood, the OFFICIAL
// readings (`hazardAtPin`: SGB flood + landslide, climate-plan heat), what
// answers the high ones with its because line (shared/solution-because.ts), the
// legacy interventions to offer, and a name to prefill.
//
// Committed files only — no network, no model, no organisation data.
// ============================================================================

import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as turf from '@turf/turf';
import { hazardAtPin } from './sgbPointHazard';
import { censusBairroAt } from './censusContext';
import { readSnapshot } from './osmReferenceLayers';
import { solutionsForReadings } from '@shared/solution-because';
import { interventionsForHazard, type ExplorerPlaceKind, type ExplorerSiteReading, type LegacyInterventionLite } from '@shared/explorer-site';

const SAMPLE = () => path.join(process.cwd(), 'client', 'public', 'sample-data');
const memo = new Map<string, any>();
function sample(file: string): any | null {
  if (!memo.has(file)) {
    let v: any = null;
    try { v = JSON.parse(readFileSync(path.join(SAMPLE(), file), 'utf8')); }
    catch (err) { console.warn(`[explorer-site] ${file} unreadable:`, (err as Error).message); }
    memo.set(file, v);
  }
  return memo.get(file);
}

export interface LegacyIntervention extends LegacyInterventionLite {
  description: string;
  costRange: { min: number; max: number; unit: string };
  impacts: { flood: string; heat: string; landslide: string };
}
/** The explorer's interventions (client/public/sample-data/interventions.json). */
export function legacyInterventions(): LegacyIntervention[] {
  return sample('interventions.json')?.interventions ?? [];
}

interface Zone { zoneId: string; name: string; f: any; bbox: number[]; props: any }
function zones(): Zone[] {
  if (!memo.has('zones')) {
    const d = sample('porto-alegre-neighborhood-zones.json');
    const fs: any[] = d?.geoJson?.features ?? d?.features ?? [];
    memo.set('zones', fs.filter(f => f?.geometry && f.properties?.zoneId).map(f => ({
      zoneId: f.properties.zoneId, name: f.properties.neighbourhoodName || f.properties.zoneId, f, bbox: turf.bbox(f), props: f.properties,
    })));
  }
  return memo.get('zones');
}
/** Every zone's properties (the official shares among them). */
export function allZoneProps(): any[] { return zones().map(z => z.props); }
/** The explorer zone (neighbourhood) a point falls in. */
export function zoneAt(lat: number, lng: number): Zone | null {
  const pt = turf.point([lng, lat]);
  for (const z of zones()) {
    const [w, s, e, n] = z.bbox;
    if (lng < w || lng > e || lat < s || lat > n) continue;
    if (turf.booleanPointInPolygon(pt, z.f)) return z;
  }
  return null;
}
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** A zone by its neighbourhood name or id; accents and case ignored. */
export function zoneByName(name: string): Zone | null {
  const w = fold(name);
  return zones().find(z => fold(z.name) === w || fold(z.zoneId) === w) ?? null;
}

function inCity(lat: number, lng: number): boolean {
  const b = sample('porto-alegre-boundary.json')?.boundaryGeoJson;
  return b ? turf.booleanPointInPolygon(turf.point([lng, lat]), b) : true;
}

// ── A named place at the point ──────────────────────────────────────────────
/** "At" a place: inside it, or this close to its outline. */
export const NEAR_PLACE_M = 60;
const NEAR_KINDS: ExplorerPlaceKind[] = ['parks', 'schools', 'hospitals'];
interface Named { name: string; kind: ExplorerPlaceKind; f: any; bbox: number[] }
let named: Promise<Named[]> | null = null;
function namedPlaces(): Promise<Named[]> {
  if (!named) {
    named = Promise.all(NEAR_KINDS.map(async kind => {
      const fc = await readSnapshot(kind);
      return ((fc?.features ?? []) as any[])
        .filter(f => f?.geometry?.coordinates && typeof f.properties?.name === 'string' && f.properties.name.trim())
        .map(f => ({ name: f.properties.name.trim(), kind, f, bbox: turf.bbox(f) }));
    })).then(xs => xs.flat());
  }
  return named;
}
async function nearestNamed(lat: number, lng: number): Promise<ExplorerSiteReading['nearest']> {
  const pt = turf.point([lng, lat]);
  const padLat = NEAR_PLACE_M / 110_540, padLng = NEAR_PLACE_M / (111_320 * Math.cos((lat * Math.PI) / 180));
  let best: ExplorerSiteReading['nearest'] = null;
  for (const p of await namedPlaces()) {
    const [w, s, e, n] = p.bbox;
    if (lng < w - padLng || lng > e + padLng || lat < s - padLat || lat > n + padLat) continue;
    let m: number;
    try {
      const t = p.f.geometry.type;
      m = t === 'Point' ? turf.distance(pt, p.f, { units: 'meters' })
        : /Polygon/.test(t) ? (turf.booleanPointInPolygon(pt, p.f) ? 0 : turf.pointToPolygonDistance(pt, p.f, { units: 'meters' }))
        : Infinity;
    } catch { continue; }
    if (m <= NEAR_PLACE_M && (!best || m < best.distanceM)) best = { name: p.name, kind: p.kind, distanceM: Math.round(m), ...(/Polygon/.test(p.f.geometry.type) ? { geometry: outline(p.f) } : {}) };
    if (m === 0) break;
  }
  return best;
}

const outlines = new WeakMap<object, any>();
/** A place's outline, simplified to ~5 m — enough to draw "this square". */
function outline(f: any): any {
  if (!outlines.has(f)) {
    let g = f.geometry;
    try { g = turf.simplify(turf.feature(g), { tolerance: 0.00005, highQuality: false, mutate: false }).geometry; } catch { /* keep the original */ }
    outlines.set(f, g);
  }
  return outlines.get(f);
}

/** Everything the explorer says about one point. */
export async function siteReadingAt(lat: number, lng: number): Promise<ExplorerSiteReading> {
  const empty: ExplorerSiteReading = {
    lat, lng, inCity: false, bairro: null, zone: null, readings: [], solutions: solutionsForReadings([]), options: [], nearest: null,
    suggestedName: { pt: 'Novo local', en: 'New site' },
  };
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inCity(lat, lng)) return empty;
  const z = zoneAt(lat, lng);
  const bairro = censusBairroAt(lat, lng) ?? z?.name ?? null;
  const readings = hazardAtPin(lat, lng);
  const solutions = solutionsForReadings(readings);
  const nearest = await nearestNamed(lat, lng);
  const all = legacyInterventions();
  const where = bairro ?? z?.name;
  return {
    lat, lng, inCity: true, bairro,
    zone: z ? { zoneId: z.zoneId, name: z.name } : null,
    readings, solutions,
    options: solutions.high.map(h => ({ hazard: h.hazard, interventionIds: interventionsForHazard(all, h.hazard, nearest?.kind).map(i => i.id) })),
    nearest,
    suggestedName: nearest ? { pt: nearest.name, en: nearest.name }
      : where ? { pt: `Local em ${where}`, en: `Site in ${where}` } : empty.suggestedName,
  };
}
