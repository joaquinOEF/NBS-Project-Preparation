// ============================================================================
// HAZARD AT ONE POINT — what an organisation is told about its pin
// ============================================================================
// Since 24 Nov 2026 (Julia Caon Froeder, Rede SCbN; refine
// cougar-sgb-hazard-maps-2026-11-24; docs/sgb-suscetibilidade.md):
//
//   - flood     → SGB/CPRM susceptibility (streams AND Guaíba, one layer)
//   - landslide → SGB/CPRM susceptibility + the nearest SGB mass-movement sector
//   - heat      → PLAC/ARVC ameaça 2050 (SGB does not map heat), unchanged
//
// The PLAC/ARVC landslide layer is classed relative to the city, so 36% of
// Porto Alegre read "alta/muito alta" — Cooperativa 20 de Novembro in flat
// Centro Histórico got "alta", SDV Reciclando "muito alta" — where SGB, the
// agency Civil Defence works with, rates 1.7% of the city high and every Rede
// site low.
//
// Levels stay on the 0..4 scale the card, the synergy report and the chat
// already read (≥ 3 = high): SGB Baixa 1 · Média 2 · Alta 3. A flood point
// outside SGB's polygons used to read "não mapeada"; Julia (25 Nov) read that
// as "no data". Since 25 Nov (refine cougar-flood-blanks-2026-11-25) it takes
// the strongest official fact at the address instead, naming its source:
//   1. inside the area the Guaíba reached in May 2024 (SMAMUS cotas ≤ 5,35 m)
//      → 3 "alta". SGB's chart is 1:70.000 (a 1 mm line ≈ 70 m), so ground at
//      the edge of its polygons can fall outside them: e.g. a Floresta
//      address 37 m from SGB alta, and Mercado Público, both under water in 2024
//   2. an SGB inundação/enxurrada risk sector within 100 m → 2 "perto de setor
//      de risco"
//   3. otherwise → 1 "baixa", fora da área suscetível do SGB (+ the nearest
//      such sector within 1 km). Rain-driven alagamento is mapped by nobody.
// No 1 km share or threshold: those would be our score, not an official one.
//
// Pure, synchronous, no network: the E2 checkpoint calls it while building a
// card.
// ============================================================================

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as turf from '@turf/turf';
import { arvcHazardAtPin, type PinHazardLevel as ArvcLevel } from './arvcPointHazard';
import { guaiba2024CmAt } from './officialHazardFacts';

export interface PinHazard {
  hazard: 'flood' | 'heat' | 'landslide';
  /** 0..4 — ≥ 3 reads as high everywhere downstream. */
  level: number;
  pt: string;
  en: string;
  /** Who says so, short: shown beside the level. */
  source: 'SGB' | 'PLAC' | 'SMAMUS';
  /** One more line, e.g. the nearest SGB risk sector. */
  notePt?: string;
  noteEn?: string;
}

const DIR = () => path.join(process.cwd(), 'knowledge', 'official-risk', 'porto-alegre');

interface ClassPoly { level: number; f: any; bbox: [number, number, number, number] }
const memo = new Map<string, any>();
function readJson(file: string): any | null {
  if (memo.has(file)) return memo.get(file);
  let v: any = null;
  try { if (existsSync(file)) v = JSON.parse(readFileSync(file, 'utf8')); }
  catch (err) { console.warn(`[sgb-point] ${path.basename(file)} unreadable:`, (err as Error).message); }
  memo.set(file, v);
  return v;
}

const LEVEL_OF: Record<string, number> = { Baixa: 1, 'Média': 2, Alta: 3 };
function classes(slug: 'inundacao' | 'movimento-de-massa'): ClassPoly[] {
  const key = `classes:${slug}`;
  if (memo.has(key)) return memo.get(key);
  const gj = readJson(path.join(DIR(), `sgb-suscetibilidade-${slug}.json`));
  const out: ClassPoly[] = (gj?.features ?? [])
    .filter((f: any) => f?.geometry && LEVEL_OF[f.properties?.classe] != null)
    .map((f: any) => ({ level: LEVEL_OF[f.properties.classe], f, bbox: turf.bbox(f) as ClassPoly['bbox'] }))
    .sort((a: ClassPoly, b: ClassPoly) => b.level - a.level);
  memo.set(key, out);
  return out;
}

function classAt(slug: 'inundacao' | 'movimento-de-massa', lng: number, lat: number): number | null {
  const pt = turf.point([lng, lat]);
  for (const c of classes(slug)) {
    const [w, s, e, n] = c.bbox;
    if (lng < w || lng > e || lat < s || lat > n) continue;
    if (turf.booleanPointInPolygon(pt, c.f)) return c.level;
  }
  return null;
}

let city: any | undefined;
function inCity(lng: number, lat: number): boolean {
  if (city === undefined) {
    const b = readJson(path.join(process.cwd(), 'client', 'public', 'sample-data', 'porto-alegre-boundary.json'));
    city = b?.boundaryGeoJson ?? null;
  }
  return city ? turf.booleanPointInPolygon(turf.point([lng, lat]), city) : true;
}

const MASS = new Set(['Deslizamento', 'Queda', 'Corrida de massa']);
const WET = new Set(['Inundação', 'Enxurrada']);
function sectorsOf(types: Set<string>): any[] {
  const key = `sectors:${Array.from(types).join("|")}`;
  if (!memo.has(key)) {
    const gj = readJson(path.join(DIR(), 'sgb-setorizacao.json'));
    memo.set(key, (gj?.features ?? [])
      .filter((f: any) => f?.geometry && /Polygon/.test(f.geometry.type) && types.has(f.properties?.tipolo_g1))
      .map((f: any) => ({ f, bbox: turf.bbox(f) })));
  }
  return memo.get(key);
}
/**
 * A floor for the metres from a point to anything inside a bbox (0 inside it).
 * 1% short on purpose, so the skip below can never drop the true nearest.
 */
function bboxFloorM(lat: number, lng: number, [w, s, e, n]: number[]): number {
  const dx = Math.max(w - lng, 0, lng - e) * 111_320 * Math.cos((lat * Math.PI) / 180);
  const dy = Math.max(s - lat, 0, lat - n) * 110_540;
  return Math.hypot(dx, dy) * 0.99;
}
/** The nearest SGB risk sector of these types: metres (0 = inside) and its typology. */
function nearestSector(types: Set<string>, lat: number, lng: number): { m: number; tipo: string } | null {
  const pt = turf.point([lng, lat]);
  let best: { m: number; tipo: string } | null = null;
  for (const { f, bbox } of sectorsOf(types)) {
    // A sector whose box is already farther than the best cannot win: the exact
    // distance (22 ms a point over all 145 sectors) is only paid for the near ones.
    if (best && bboxFloorM(lat, lng, bbox) >= best.m) continue;
    const m = turf.booleanPointInPolygon(pt, f) ? 0 : turf.pointToPolygonDistance(pt, f, { units: 'meters' });
    if (!best || m < best.m) best = { m, tipo: f.properties.tipolo_g1 };
    if (m === 0) break;
  }
  return best;
}
/** Metres to the nearest SGB mass-movement risk sector (0 = inside one). */
export function nearestLandslideSectorM(lat: number, lng: number): number | null {
  return nearestSector(MASS, lat, lng)?.m ?? null;
}

// 100 m steps under 1 km, then 0,1 km — a pin is never more precise than that.
const distPt = (m: number) => m < 1000 ? `${Math.max(100, Math.round(m / 100) * 100)} m` : `${(Math.round(m / 100) / 10).toFixed(1).replace('.', ',')} km`;
const distEn = (m: number) => m < 1000 ? `${Math.max(100, Math.round(m / 100) * 100)} m` : `${(Math.round(m / 100) / 10).toFixed(1)} km`;
const metres = (cm: number, dec: string) => (cm / 100).toFixed(2).replace('.', dec);

/** Flood where SGB draws no susceptibility polygon: the strongest official fact (see header). */
function floodOutsideSgb(lat: number, lng: number): PinHazard {
  const cm = guaiba2024CmAt(lat, lng);
  if (cm != null) return {
    hazard: 'flood', level: 3, pt: 'alta', en: 'high', source: 'SMAMUS',
    notePt: `inundação: atingida pela cheia de maio de 2024 (dentro da cota de ${metres(cm, ',')} m do Guaíba); o mapa do SGB não marca o lugar`,
    noteEn: `flood: reached by the May 2024 flood (inside the Guaíba ${metres(cm, '.')} m contour); SGB's map does not mark the place`,
  };
  const s = nearestSector(WET, lat, lng);
  const kindPt = s?.tipo === 'Enxurrada' ? 'enxurrada' : 'inundação';
  const kindEn = s?.tipo === 'Enxurrada' ? 'flash flood' : 'flood';
  if (s && s.m <= 100) return {
    hazard: 'flood', level: 2, pt: 'perto de setor de risco', en: 'near a risk sector', source: 'SGB',
    notePt: s.m === 0 ? `dentro de um setor de risco de ${kindPt} do SGB` : `setor de risco de ${kindPt} do SGB a menos de 100 m`,
    noteEn: s.m === 0 ? `inside an SGB ${kindEn} risk sector` : `SGB ${kindEn} risk sector less than 100 m away`,
  };
  const near = s && s.m <= 1000;
  return {
    hazard: 'flood', level: 1, pt: 'baixa', en: 'low', source: 'SGB',
    notePt: `inundação: fora da área suscetível do SGB${near ? `; setor de risco de ${kindPt} a ${distPt(s!.m)}` : ''}`,
    noteEn: `flood: outside SGB's susceptible area${near ? `; ${kindEn} risk sector ${distEn(s!.m)} away` : ''}`,
  };
}

const WORDS = { 1: ['baixa', 'low'], 2: ['média', 'medium'], 3: ['alta', 'high'] } as Record<number, [string, string]>;

function sectorNote(m: number | null): Pick<PinHazard, 'notePt' | 'noteEn'> {
  if (m == null) return {};
  if (m === 0) return { notePt: 'dentro de um setor de risco mapeado pelo SGB', noteEn: 'inside a risk sector mapped by SGB' };
  return { notePt: `setor de risco do SGB mais próximo a ${distPt(m)}`, noteEn: `nearest SGB risk sector ${distEn(m)} away` };
}

/**
 * One SGB hazard at a point — the same entry `hazardAtPin` gives; null outside the city.
 * On its own because the flood fallback (the May-2024 contours) costs ~7 ms a point,
 * which a list of 300 places asked about landslide should not pay (rankPlaces.ts).
 */
export function sgbHazardAtPin(hazard: 'flood' | 'landslide', lat: number, lng: number): PinHazard | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inCity(lng, lat)) return null;
  if (hazard === 'flood') {
    const f = classAt('inundacao', lng, lat);
    return f == null
      ? floodOutsideSgb(lat, lng)
      : { hazard: 'flood', level: f, pt: WORDS[f][0], en: WORDS[f][1], source: 'SGB' };
  }
  // SGB classes the whole municipality; outside Média/Alta it is Baixa.
  const l = classAt('movimento-de-massa', lng, lat) ?? 1;
  return { hazard: 'landslide', level: l, pt: WORDS[l][0], en: WORDS[l][1], source: 'SGB', ...sectorNote(nearestLandslideSectorM(lat, lng)) };
}

/** Flood and landslide from SGB, heat from PLAC/ARVC — one entry per hazard with a reading. */
export function hazardAtPin(lat: number, lng: number): PinHazard[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const out: PinHazard[] = [];
  const flood = sgbHazardAtPin('flood', lat, lng);
  if (flood) out.push(flood);
  const heat = arvcHazardAtPin(lat, lng).find((h: ArvcLevel) => h.hazard === 'heat');
  if (heat) out.push({ hazard: 'heat', level: heat.level, pt: heat.pt, en: heat.en, source: 'PLAC' });
  const landslide = sgbHazardAtPin('landslide', lat, lng);
  if (landslide) out.push(landslide);
  return out;
}
