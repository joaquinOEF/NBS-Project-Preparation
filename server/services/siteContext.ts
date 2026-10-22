// ============================================================================
// WHAT THE CITY'S MAPS SAY ABOUT ONE SITE
// ============================================================================
// Reads the site layers imported from the coordination's Drive folder
// (knowledge/porto-alegre/city/layers, see scripts/import-city-folder.ts and
// shared/city-layers.ts) and answers, for one point: which polder, sub-basin,
// APP, REURB area, corridor it falls in; at what Guaíba level it floods; what
// the city built or plans within walking distance.
//
// Each fact is one written line with the layer as its source. They reach the
// pre-note's "território" section through `prenoteInputFor`, and from there
// every pass that reads the pre-note: the summary, the plan links, the
// project narrative, the board's grouping.
//
// ⚠️ Pure lookup — no model. A fact is the layer's own attribute restated
// (`describe`); the interpretation is left to the passes that read it.
// ============================================================================

import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import * as turf from '@turf/turf';
import { CITY_LAYERS, type CityLayer, type CityLayerTopic } from '@shared/city-layers';

export interface SiteFact {
  layerId: string;
  topic: CityLayerTopic;
  text: string;
  /** "SMAMUS — Pôlderes do Sistema de Proteção contra Cheias" */
  source: string;
  /** For `near` layers: metres from the site (0 when it is inside). */
  distanceM?: number;
  /** A stable key for "same X" comparisons between sites (layer + feature). */
  key: string;
  /** For grouping layers: what two sites must share ("Polder EBAP 02"). */
  group?: { kind: 'polder' | 'bacia' | 'corredor'; name: string };
}

/** At most this many `near` features per layer, nearest first. */
const NEAR_MAX = 3;

interface Loaded { layer: CityLayer; features: Array<{ f: any; bbox: [number, number, number, number]; i: number }> }
let cache: Loaded[] | null = null;

const layersDir = () => path.join(process.cwd(), 'knowledge', 'porto-alegre', 'city', 'layers');

/** One layer per `yield` — see `build()` in cityDocs.ts for why. */
function* build(): Generator<void, Loaded[]> {
  const out: Loaded[] = [];
  for (const layer of CITY_LAYERS) {
    const file = path.join(layersDir(), `${layer.id}.geojson.gz`);
    if (!existsSync(file)) continue;
    let gj: any;
    try { gj = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')); }
    catch (err) { console.warn(`[site-context] ${layer.id} unreadable: ${(err as Error).message}`); continue; }
    out.push({ layer, features: (gj.features ?? []).map((f: any, i: number) => ({ f, i, bbox: turf.bbox(f) as [number, number, number, number] })) });
    yield;
  }
  return out;
}

function load(): Loaded[] {
  if (cache) return cache;
  const it = build();
  let r = it.next();
  while (!r.done) r = it.next();
  return (cache = r.value);
}

/** The boot warm-up: the same build, one layer per event-loop turn. */
export async function warmSiteContext(): Promise<void> {
  if (cache) return;
  const it = build();
  let r = it.next();
  while (!r.done) {
    await new Promise<void>(res => setImmediate(res));
    if (cache) return;
    r = it.next();
  }
  if (!cache) cache = r.value;
}

/** Test seam: forget the loaded layers (a re-import in the same process). */
export function resetSiteContext(): void { cache = null; }

const inBox = (b: [number, number, number, number], lng: number, lat: number, padDeg = 0) =>
  lng >= b[0] - padDeg && lng <= b[2] + padDeg && lat >= b[1] - padDeg && lat <= b[3] + padDeg;

function distanceM(f: any, pt: ReturnType<typeof turf.point>): number {
  const g = f.geometry;
  if (g.type === 'Point') return turf.distance(pt, g, { units: 'meters' });
  if ((g.type === 'Polygon' || g.type === 'MultiPolygon') && turf.booleanPointInPolygon(pt, f)) return 0;
  // Every ring or line as a plain coordinate list; a degenerate one (fewer
  // than two valid points after simplification) is skipped, not fatal.
  const lines: number[][][] =
    g.type === 'LineString' ? [g.coordinates]
    : g.type === 'MultiLineString' || g.type === 'Polygon' ? g.coordinates
    : g.type === 'MultiPolygon' ? g.coordinates.flat()
    : [];
  let best = Infinity;
  for (const c of lines) {
    const ok = (c ?? []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (ok.length < 2) continue;
    try { best = Math.min(best, turf.pointToLineDistance(pt, turf.lineString(ok), { units: 'meters' })); } catch { /* skip */ }
  }
  return best;
}

const round = (m: number) => (m < 100 ? Math.round(m / 10) * 10 : Math.round(m / 50) * 50);

/** Every fact the site layers hold about the point, in registry order. */
export function siteFacts(lat: number, lng: number): SiteFact[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const pt = turf.point([lng, lat]);
  const facts: SiteFact[] = [];
  for (const { layer, features } of load()) {
    const source = `${layer.owner} — ${layer.title}`;
    if (layer.mode === 'contains' || layer.mode === 'lowest-level') {
      const hits = features.filter(x => inBox(x.bbox, lng, lat) && /Polygon/.test(x.f.geometry.type) && turf.booleanPointInPolygon(pt, x.f));
      const chosen = layer.mode === 'lowest-level'
        ? hits.sort((a, b) => Number(a.f.properties.contourmax) - Number(b.f.properties.contourmax)).slice(0, 1)
        : hits;
      for (const h of chosen) {
        const text = layer.describe(h.f.properties ?? {});
        const g = layer.group?.name(h.f.properties ?? {});
        if (text) facts.push({ layerId: layer.id, topic: layer.topic, text, source, key: `${layer.id}#${h.i}`, distanceM: 0, ...(layer.group && g ? { group: { kind: layer.group.kind, name: g } } : {}) });
      }
      continue;
    }
    // near: a cheap box test first (1° ≈ 111 km), then the real distance.
    const pad = (layer.radiusM ?? 300) / 111_000 * 1.5;
    const near = features
      .filter(x => inBox(x.bbox, lng, lat, pad))
      .map(x => ({ x, d: distanceM(x.f, pt) }))
      .filter(({ d }) => d <= (layer.radiusM ?? 300))
      .sort((a, b) => a.d - b.d);
    const seen = new Set<string>();
    for (const { x, d } of near) {
      const text = layer.describe(x.f.properties ?? {});
      if (!text || seen.has(text)) continue;
      seen.add(text);
      const where = d === 0 ? 'no próprio lugar' : d < 15 ? 'junto ao lugar' : `a cerca de ${round(d)} m`;
      facts.push({ layerId: layer.id, topic: layer.topic, text: `${text.replace(/\.$/, '')} (${where}).`, source, distanceM: d, key: `${layer.id}#${x.i}` });
      if (seen.size >= NEAR_MAX) break;
    }
  }
  return facts;
}

/** The point a pre-note's territory is read from: the site marked on the map. */
export function sitePoint(site: Record<string, string | undefined>): { lat: number; lng: number } | null {
  const rawLat = site.site_lat ?? site._site_lat, rawLng = site.site_lng ?? site._site_lng;
  const lat = Number(rawLat), lng = Number(rawLng);
  if (!rawLat || !rawLng || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Porto Alegre's box, generously: a pin dropped in the ocean is not a site.
  if (lat < -30.4 || lat > -29.9 || lng < -51.4 || lng > -50.9) return null;
  return { lat, lng };
}

/** The pre-note's and the concept note's map lines for a site record ([] when none is marked). */
export function cityMapFor(site: Record<string, string | undefined>): Array<{ text: string; source: string }> {
  const pt = sitePoint(site);
  if (!pt) return [];
  try { return siteFacts(pt.lat, pt.lng).map(f => ({ text: f.text, source: f.source })); }
  catch (err) { console.warn('[site-context] lookup failed:', (err as Error).message); return []; }
}

/** Where a site sits for grouping purposes: its polder, basin and corridor, by name. */
export function siteGroupsFor(site: Record<string, string | undefined>): Partial<Record<'polder' | 'bacia' | 'corredor', string>> {
  const pt = sitePoint(site);
  if (!pt) return {};
  const out: Partial<Record<'polder' | 'bacia' | 'corredor', string>> = {};
  try { for (const f of siteFacts(pt.lat, pt.lng)) if (f.group && !out[f.group.kind]) out[f.group.kind] = f.group.name; } catch { /* no grouping facts */ }
  return out;
}
