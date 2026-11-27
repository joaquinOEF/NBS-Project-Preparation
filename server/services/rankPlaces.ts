// ============================================================================
// RANK PLACES — "which parks sit in the hottest part of the city, and have the
// most people around them?"
// ============================================================================
// The rule (product owner, 27 Nov 2026) — NO combined score. Two official
// numbers and one plain rule:
//
//   1. the official hazard reading of each place
//        heat      → the climate plan's 2050 heat hazard (PLAC/ARVC ameaça):
//                    the mean within `radiusM` of the place, classed with the
//                    same city fifths a pin gets (arvcPointHazard.classOf)
//        flood     → what a pin there is told (sgbPointHazard: SGB susceptibility,
//        landslide   SMAMUS May-2024 fallback) — see `readingOf` for why a
//                    point inside the place and not "the worst class it touches"
//   2. keep the HIGHEST class that can fill the list: if at least `top` places
//      are "muito alta" (level 4), only those; otherwise level ≥ 3. Fewer than
//      `top` even so? Say so, and fill with the next class down, each flagged.
//      (With plain level ≥ 3, 252 of 316 parks qualified on heat and the list
//      was simply "most people nearby".)
//   3. order by the people living within `radiusM` (Censo 2022), most first.
//      Ties: the hazard's raw value, then area, then OSM id.
//
// Why people and not the hazard value: by mean heat alone the top five parks
// are all small squares in Sarandi / Rubem Berta, a few blocks apart.
//
// Deterministic, no network, no model: committed OSM snapshots
// (knowledge/osm/<city>/), committed hazard files, the committed census.
// Readings are memoised per place — the sources never change between deploys.
// ============================================================================

import * as turf from '@turf/turf';
import { readSnapshot } from './osmReferenceLayers';
import { arvcHazardAround } from './arvcPointHazard';
import { sgbHazardAtPin, type PinHazard } from './sgbPointHazard';
import { censusAround, censusBairroAt } from './censusContext';

export type RankHazard = 'heat' | 'flood' | 'landslide';
export const RANK_HAZARDS: RankHazard[] = ['heat', 'flood', 'landslide'];

/** The level from which a place is "in the top classes" — the same ≥ 3 = high every card reads. */
export const HIGH_LEVEL = 3;
/** "Muito alta" — when enough places reach it, only they qualify (see `applyRule`). */
export const TOP_LEVEL = 4;
export const DEFAULT_TOP = 5;
export const MAX_TOP = 25;
export const DEFAULT_RADIUS_M = 300;
const MIN_RADIUS_M = 50;
const MAX_RADIUS_M = 1000;
/** Same name this close = one place (OSM often draws one park as several ways). */
export const SAME_PLACE_M = 150;

/**
 * A kind of place that can be ranked. Adding one (e.g. a city-wide snapshot of
 * sports grounds) is ONE entry here: where its features come from, what it is
 * called, and its default minimum area.
 */
export interface PlaceKind {
  label: { pt: string; en: string };
  /** A GeoJSON FeatureCollection (or null when the snapshot is missing). */
  load: () => Promise<{ features: any[] } | null>;
  /** Default `minAreaHa`: a pocket square is not "a park" for this question. */
  defaultMinAreaHa: number;
  /** Which of the snapshot's features are this kind at all (by their OSM tags). Default: every one. */
  keep?: (tags: Record<string, any>) => boolean;
  source: string;
}

const osmSnapshot = (layerId: string) => () => readSnapshot(layerId);
const OSM_SOURCE = 'OpenStreetMap contributors (ODbL) — snapshot in knowledge/osm/porto-alegre';

export const PLACE_KINDS: Record<string, PlaceKind> = {
  // Parks and recreation grounds only. The snapshot also holds leisure=garden (105), and one
  // recreation_ground that is a museum's fenced yard (tourism=museum) — it topped "parks" by flood.
  parks: { label: { pt: 'parques e praças', en: 'parks and squares' }, load: osmSnapshot('parks'), defaultMinAreaHa: 0.5, keep: t => t.leisure !== 'garden' && t.tourism !== 'museum', source: `${OSM_SOURCE} (leisure=park, landuse=recreation_ground; sem leisure=garden nem tourism=museum)` },
  schools: { label: { pt: 'escolas', en: 'schools' }, load: osmSnapshot('schools'), defaultMinAreaHa: 0, source: OSM_SOURCE },
  hospitals: { label: { pt: 'hospitais e unidades de saúde', en: 'hospitals and health units' }, load: osmSnapshot('hospitals'), defaultMinAreaHa: 0, source: OSM_SOURCE },
  wetlands: { label: { pt: 'áreas úmidas', en: 'wetlands' }, load: osmSnapshot('wetlands'), defaultMinAreaHa: 0, source: OSM_SOURCE },
};

export interface RankPlacesRequest {
  kind: string;
  by: RankHazard;
  /** Default 5, at most 25. */
  top?: number;
  /** Default: the kind's (0.5 ha for parks, 0 otherwise). */
  minAreaHa?: number;
  /** Default true. */
  namedOnly?: boolean;
  /** Default 300 (50–1000). */
  radiusM?: number;
  /** Census 2022 bairro name; accents and case ignored. */
  bairro?: string;
}

export interface RankedPlace {
  rank: number;
  name: string | null;
  osmId: string;
  kind: string;
  /** A point inside the place: its centroid, or a point on it when the centroid falls outside. */
  lat: number;
  lng: number;
  /** Geodesic area (turf); every piece of a place OSM split, summed. 0 for a point. */
  areaHa: number;
  /** The Censo 2022 bairro of the tract the point falls in. */
  bairro: string | null;
  hazard: {
    key: RankHazard;
    /** 0..4 — ≥ 3 is high. */
    level: number;
    label: { pt: string; en: string };
    /** Who says so: 'PLAC' (climate plan), 'SGB' or 'SMAMUS'. */
    source: PinHazard['source'];
  };
  /**
   * People living within `radiusM` of the place's point — an ESTIMATE from the
   * 2022 Census, not a count: each census tract contributes its residents × the
   * share of its area inside the circle (censusContext.censusAround, a 20 m
   * grid). The circle is around the point, not a buffer of the whole outline.
   */
  residentsNearby: number;
  radiusM: number;
  /** True for a place below the top classes, added because fewer than `top` qualified. */
  belowTopClass?: true;
  /** How many OSM features were merged into this place (same name within ~150 m), when > 1. */
  mergedParts?: number;
  /** The largest piece's outline, simplified to ~5 m. */
  geometry: any;
}

export interface RankPlacesResponse {
  /** The rule actually applied, in plain language. */
  rule: { pt: string; en: string };
  kind: string;
  by: RankHazard;
  radiusM: number;
  /** Places of this kind in the city after the name, area, bairro filters and de-duplication. */
  considered: number;
  /** Of those, how many are in the qualifying class or above. */
  qualified: number;
  /** The class threshold used: 4 when at least `top` places are "muito alta", else 3. */
  qualifyingLevel: number;
  /** How many of `places` come from the next class down (0 when enough qualified). */
  filledFromNextClass: number;
  places: RankedPlace[];
  sources: string[];
}

export class RankPlacesInputError extends Error {}

// ── Places of a kind, prepared once ─────────────────────────────────────────

interface Prepared {
  osmId: string;
  name: string | null;
  lat: number;
  lng: number;
  areaHa: number;
  bairro: string;
  bbox: number[];
  feature: any;
  parts: number;
}

export const normName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Metres between two bboxes (0 when they overlap) — how far apart two outlines can be at least. */
function bboxGapM(a: number[], b: number[]): number {
  const lat = (a[1] + a[3] + b[1] + b[3]) / 4;
  const dx = Math.max(a[0] - b[2], b[0] - a[2], 0) * 111_320 * Math.cos((lat * Math.PI) / 180);
  const dy = Math.max(a[1] - b[3], b[1] - a[3], 0) * 110_540;
  return Math.hypot(dx, dy);
}

/** One feature → a place inside Porto Alegre, or null (no geometry, or outside the city's census tracts). */
function prepare(f: any): Prepared | null {
  const g = f?.geometry;
  if (!g || !g.coordinates) return null;
  let pt: number[];
  try {
    pt = turf.centroid(f).geometry.coordinates;
    // A crescent-shaped park's centroid can sit across the street.
    if (/Polygon/.test(g.type) && !turf.booleanPointInPolygon(pt, f)) pt = turf.pointOnFeature(f).geometry.coordinates;
  } catch { return null; }
  const [lng, lat] = pt;
  // The OSM snapshot's box takes in Canoas, Viamão, Alvorada: the hazard files and the census do not.
  const bairro = censusBairroAt(lat, lng);
  if (!bairro) return null;
  const p = f.properties ?? {};
  const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null;
  return {
    osmId: `${p.osm_type ?? 'osm'}/${p.osm_id ?? `${lat.toFixed(6)},${lng.toFixed(6)}`}`,
    name, lat, lng, bairro,
    areaHa: /Polygon/.test(g.type) ? turf.area(f) / 10_000 : 0,
    bbox: turf.bbox(f),
    feature: f,
    parts: 1,
  };
}

/**
 * Same (normalised) name within ~150 m → one place: the largest piece stands
 * for it (point, outline, id) and the areas add up. Single linkage, so three
 * pieces in a row merge. Unnamed features are never merged.
 */
export function mergeSamePlaces<T extends { name: string | null; bbox: number[]; areaHa: number; osmId: string; parts: number }>(items: T[]): T[] {
  const byName = new Map<string, T[]>();
  const out: T[] = [];
  for (const it of items) {
    if (!it.name) { out.push(it); continue; }
    const k = normName(it.name);
    byName.set(k, [...(byName.get(k) ?? []), it]);
  }
  byName.forEach(group => {
    const parent = group.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++)
      if (bboxGapM(group[i].bbox, group[j].bbox) <= SAME_PLACE_M) parent[find(i)] = find(j);
    const clusters = new Map<number, T[]>();
    group.forEach((it, i) => clusters.set(find(i), [...(clusters.get(find(i)) ?? []), it]));
    clusters.forEach(c => {
      const main = c.slice().sort((a, b) => b.areaHa - a.areaHa || (a.osmId < b.osmId ? -1 : 1))[0];
      out.push(c.length === 1 ? main : { ...main, areaHa: c.reduce((a, x) => a + x.areaHa, 0), parts: c.length });
    });
  });
  return out.sort((a, b) => (a.osmId < b.osmId ? -1 : a.osmId > b.osmId ? 1 : 0));
}

const prepared = new Map<string, Promise<Prepared[]>>();
function placesOf(kind: string): Promise<Prepared[]> {
  if (!prepared.has(kind)) {
    prepared.set(kind, PLACE_KINDS[kind].load().then(fc =>
      mergeSamePlaces((fc?.features ?? []).filter((f: any) => !PLACE_KINDS[kind].keep || PLACE_KINDS[kind].keep!(f?.properties ?? {})).map(prepare).filter((p: Prepared | null): p is Prepared => !!p))));
  }
  return prepared.get(kind)!;
}

// ── The two numbers ─────────────────────────────────────────────────────────

interface Reading { level: number; pt: string; en: string; source: PinHazard['source']; raw: number }

const readings = new Map<string, Reading | null>();
/**
 * The official reading of a place.
 *
 * Heat is a field (a 29 m raster): the mean within `radiusM`, classed like a pin.
 *
 * Flood and landslide are SGB polygons, and the reading is the pin's
 * (`sgbHazardAtPin`, the entry `hazardAtPin` gives) at the place's point —
 * NOT the highest class the outline touches. Two reasons:
 *  - it is exactly what the site card says when someone drops a pin on the
 *    place, so the list and the card can never disagree (same SMAMUS May-2024
 *    fallback, same named source);
 *  - "touches" favours size: every large park brushes a stream margin or a
 *    slope somewhere, and SGB's 1:70.000 lines are ~70 m wide at the edge.
 * SGB publishes classes, not a continuous value, so `raw` is the level itself.
 */
function readingOf(p: Prepared, by: RankHazard, radiusM: number): Reading | null {
  const key = `${by}|${by === 'heat' ? radiusM : 0}|${p.lat},${p.lng}`;
  if (readings.has(key)) return readings.get(key)!;
  let r: Reading | null = null;
  if (by === 'heat') {
    const h = arvcHazardAround('heat', p.lat, p.lng, radiusM);
    if (h) r = { level: h.level, pt: h.pt, en: h.en, source: 'PLAC', raw: h.value };
  } else {
    const h = sgbHazardAtPin(by, p.lat, p.lng);
    if (h) r = { level: h.level, pt: h.pt, en: h.en, source: h.source, raw: h.level };
  }
  readings.set(key, r);
  return r;
}

const residents = new Map<string, number>();
function residentsOf(p: Prepared, radiusM: number): number {
  const key = `${radiusM}|${p.lat},${p.lng}`;
  if (!residents.has(key)) residents.set(key, censusAround(p.lat, p.lng, { radiusM })?.people ?? 0);
  return residents.get(key)!;
}

// ── The rule ────────────────────────────────────────────────────────────────

export interface RankCandidate { osmId: string; level: number; raw: number; residents: number; areaHa: number }

/**
 * Steps 2 and 3 of the rule, on their own so they can be tested without a map:
 * the hottest class first, then people. If at least `top` places are at level 4
 * ("muito alta") only those qualify; otherwise level ≥ 3 does, and when even
 * that is fewer than `top`, the next class down (only that one) fills the rest,
 * after them, flagged by the caller. Within the set: residents, most first.
 * `residents` is read lazily, so only the classes that can appear pay for it.
 */
export function applyRule<T extends { osmId: string; level: number; raw: number; areaHa: number }>(
  items: T[], top: number, residentsOf: (x: T) => number,
): { picked: Array<{ item: T; residents: number; belowTopClass: boolean }>; qualified: number; filled: number; qualifyingLevel: number } {
  const order = (xs: T[]) => xs.map(item => ({ item, residents: residentsOf(item) }))
    .sort((a, b) => b.residents - a.residents || b.item.raw - a.item.raw || b.item.areaHa - a.item.areaHa || (a.item.osmId < b.item.osmId ? -1 : a.item.osmId > b.item.osmId ? 1 : 0));
  // The highest class that can fill the list on its own: with `top` places at
  // "muito alta", an "alta" place with more neighbours must not push one out.
  const qualifyingLevel = items.filter(x => x.level >= TOP_LEVEL).length >= top ? TOP_LEVEL : HIGH_LEVEL;
  const high = items.filter(x => x.level >= qualifyingLevel);
  const picked = order(high).slice(0, top).map(x => ({ ...x, belowTopClass: false }));
  let filled = 0;
  if (picked.length < top) {
    const next = Math.max(-1, ...items.filter(x => x.level < HIGH_LEVEL).map(x => x.level));
    const fill = order(items.filter(x => x.level === next)).slice(0, top - picked.length);
    filled = fill.length;
    picked.push(...fill.map(x => ({ ...x, belowTopClass: true })));
  }
  return { picked, qualified: high.length, filled, qualifyingLevel };
}

const HAZARD_WORDS: Record<RankHazard, { pt: string; en: string; srcPt: string; srcEn: string; source: string }> = {
  heat: {
    pt: 'calor', en: 'heat',
    srcPt: 'ameaça de calor do plano climático (2050)', srcEn: "the climate plan's heat hazard (2050)",
    source: 'Prefeitura de Porto Alegre / SMAMUS — Plano de Ação Climática, Análise de Riscos e Vulnerabilidade Climáticas (ARVC): ameaça de calor, 2050. Classe = quintos da faixa p2–p98 da cidade; média no raio.',
  },
  flood: {
    pt: 'inundação', en: 'flood',
    srcPt: 'suscetibilidade a inundação do SGB', srcEn: "SGB's flood susceptibility",
    source: 'SGB/CPRM — Carta de suscetibilidade a inundações (1:70.000), lida num ponto dentro do lugar; fora dos polígonos do SGB, a área atingida pelo Guaíba em maio de 2024 (SMAMUS, cotas de inundação).',
  },
  landslide: {
    pt: 'deslizamento', en: 'landslide',
    srcPt: 'suscetibilidade a movimentos de massa do SGB', srcEn: "SGB's mass-movement susceptibility",
    source: 'SGB/CPRM — Carta de suscetibilidade a movimentos gravitacionais de massa (1:70.000), lida num ponto dentro do lugar.',
  },
};

const residentsSource = (radiusM: number) =>
  `IBGE, Censo Demográfico 2022 — moradores a até ${radiusM} m: ESTIMATIVA, não contagem (setores censitários ponderados pela parcela da área dentro do círculo de ${radiusM} m em torno do ponto do lugar).`;

function num(v: unknown, fallback: number, name: string): number {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new RankPlacesInputError(`${name} must be a number`);
  return v;
}

/** Rank the places of a kind by an official hazard, then by the people around them. */
export async function rankPlaces(req: RankPlacesRequest): Promise<RankPlacesResponse> {
  const kindDef = typeof req?.kind === 'string' && Object.prototype.hasOwnProperty.call(PLACE_KINDS, req.kind) ? PLACE_KINDS[req.kind] : null;
  if (!kindDef) throw new RankPlacesInputError(`Unknown kind: ${String(req?.kind)}. One of: ${Object.keys(PLACE_KINDS).join(', ')}`);
  if (!RANK_HAZARDS.includes(req.by)) throw new RankPlacesInputError(`Unknown hazard: ${String(req.by)}. One of: ${RANK_HAZARDS.join(', ')}`);
  const { kind, by } = req;
  const top = Math.max(1, Math.min(MAX_TOP, Math.round(num(req.top, DEFAULT_TOP, 'top'))));
  const minAreaHa = Math.max(0, num(req.minAreaHa, kindDef.defaultMinAreaHa, 'minAreaHa'));
  const radiusM = Math.max(MIN_RADIUS_M, Math.min(MAX_RADIUS_M, Math.round(num(req.radiusM, DEFAULT_RADIUS_M, 'radiusM'))));
  if (req.namedOnly !== undefined && typeof req.namedOnly !== 'boolean') throw new RankPlacesInputError('namedOnly must be a boolean');
  if (req.bairro !== undefined && typeof req.bairro !== 'string') throw new RankPlacesInputError('bairro must be a string');
  const namedOnly = req.namedOnly ?? true;
  const bairro = req.bairro?.trim() ? normName(req.bairro) : null;

  const pool = (await placesOf(kind)).filter(p =>
    (!namedOnly || p.name) && p.areaHa >= minAreaHa && (!bairro || normName(p.bairro) === bairro));
  const read = pool
    .map(p => ({ p, r: readingOf(p, by, radiusM) }))
    .filter((x): x is { p: Prepared; r: Reading } => !!x.r)
    .map(({ p, r }) => ({ p, r, osmId: p.osmId, level: r.level, raw: r.raw, areaHa: p.areaHa }));
  const { picked, qualified, filled, qualifyingLevel } = applyRule(read, top, x => residentsOf(x.p, radiusM));

  const places: RankedPlace[] = picked.map(({ item: { p, r }, residents: n, belowTopClass }, i) => ({
    rank: i + 1,
    name: p.name,
    osmId: p.osmId,
    kind,
    lat: Number(p.lat.toFixed(6)),
    lng: Number(p.lng.toFixed(6)),
    areaHa: Number(p.areaHa.toFixed(2)),
    bairro: p.bairro,
    hazard: { key: by, level: r.level, label: { pt: r.pt, en: r.en }, source: r.source },
    residentsNearby: n,
    radiusM,
    ...(belowTopClass ? { belowTopClass: true as const } : {}),
    ...(p.parts > 1 ? { mergedParts: p.parts } : {}),
    geometry: simplified(p.feature),
  }));

  const w = HAZARD_WORDS[by];
  const where = req.bairro?.trim() ? { pt: ` no bairro ${req.bairro.trim()}`, en: ` in ${req.bairro.trim()}` } : { pt: '', en: '' };
  const short = qualified < top;
  // SGB's scale stops at Alta: only the climate plan's heat has a "very high".
  const rule = {
    pt: `${cap(kindDef.label.pt)}${where.pt} onde a ${w.srcPt} é ${qualifyingLevel >= TOP_LEVEL ? 'muito alta' : by === 'heat' ? 'alta ou muito alta' : 'alta'}${by === 'heat' ? ` (média a até ${radiusM} m)` : ''}, `
      + `em ordem de quantas pessoas moram a até ${radiusM} m (estimativa do Censo 2022). Sem nota combinada: dois dados oficiais e uma regra.`
      + (short ? ` Só ${qualified} de ${read.length} ${qualified === 1 ? 'está' : 'estão'} nessas classes`
        + (filled ? `; ${filled === 1 ? 'o outro vem' : `os outros ${filled} vêm`} da classe logo abaixo e ${filled === 1 ? 'está marcado' : 'estão marcados'}.` : '.') : ''),
    en: `${cap(kindDef.label.en)}${where.en} where ${w.srcEn} is ${qualifyingLevel >= TOP_LEVEL ? 'very high' : by === 'heat' ? 'high or very high' : 'high'}${by === 'heat' ? ` (mean within ${radiusM} m)` : ''}, `
      + `ordered by how many people live within ${radiusM} m (2022 Census estimate). No combined score: two official figures and one rule.`
      + (short ? ` Only ${qualified} of ${read.length} ${qualified === 1 ? 'is' : 'are'} in those classes`
        + (filled ? `; the other ${filled === 1 ? 'one comes' : `${filled} come`} from the next class down and ${filled === 1 ? 'is' : 'are'} flagged.` : '.') : ''),
  };

  return {
    rule, kind, by, radiusM,
    considered: pool.length,
    qualified,
    qualifyingLevel,
    filledFromNextClass: filled,
    places,
    sources: [w.source, residentsSource(radiusM), kindDef.source],
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const simplifiedMemo = new WeakMap<object, any>();
function simplified(f: any): any {
  if (!simplifiedMemo.has(f)) {
    let g = f.geometry;
    try { if (g.type !== 'Point') g = turf.simplify(turf.feature(g), { tolerance: 0.00005, highQuality: false, mutate: false }).geometry; } catch { /* keep the original */ }
    simplifiedMemo.set(f, roundCoords(g));
  }
  return simplifiedMemo.get(f);
}
const roundCoords = (g: any): any => ({ type: g.type, coordinates: JSON.parse(JSON.stringify(g.coordinates, (_k, v) => (typeof v === 'number' ? Number(v.toFixed(6)) : v))) });

/** For tests: forget every memoised place and reading. */
export function resetRankPlaces(): void { prepared.clear(); readings.clear(); residents.clear(); }
