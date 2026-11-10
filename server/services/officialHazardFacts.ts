// ============================================================================
// OFFICIAL HAZARD FACTS AT A POINT — the lookup
// ============================================================================
// Fills shared/official-hazard-facts.ts from the two official sources we hold
// on disk:
//   - the SMAMUS layers already read per site by siteContext.ts (cotas do
//     Guaíba, pontos de alagamento, suscetibilidade à erosão);
//   - the SGB/CPRM Setorização de Risco snapshot
//     (knowledge/official-risk/porto-alegre/sgb-setorizacao.json).
//
// Pure lookup, synchronous, no model and no network: the E2 checkpoint calls it
// while it builds a card, and a slow lookup there would stall the turn. A
// missing file or a point outside every layer yields [] — and [] is a real
// answer: the copy that reads this says nothing rather than reaching for our
// own bairro index.
//
// ⚠️ An SGB sector's ABSENCE is not an all-clear (SGB surveyed precarious
// settlements only), so no "fora de setor de risco" fact is ever produced.
// ============================================================================

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as turf from '@turf/turf';
import { siteFacts, sitePoint } from './siteContext';
import { sectorTypologies, type RiskSectorProps } from '@shared/official-risk';
import type { HazardKey } from '@shared/site-knowledge';
import { sortOfficialFacts, type OfficialHazardFact } from '@shared/official-hazard-facts';

const SGB_FILE = () => path.join(process.cwd(), 'knowledge', 'official-risk', 'porto-alegre', 'sgb-setorizacao.json');

let sgbCache: Array<{ f: any; bbox: [number, number, number, number] }> | null = null;
function sgbSectors() {
  if (sgbCache) return sgbCache;
  try {
    const file = SGB_FILE();
    const gj = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
    sgbCache = (gj?.features ?? [])
      .filter((f: any) => f?.geometry && /Polygon/.test(f.geometry.type))
      .map((f: any) => ({ f, bbox: turf.bbox(f) as [number, number, number, number] }));
  } catch (err) {
    console.warn('[official-hazard] SGB snapshot unreadable:', (err as Error).message);
    sgbCache = [];
  }
  return sgbCache!;
}

/** SGB typology → the hazard family we speak about. Null = not one of ours. */
function hazardOfTypology(t: string): HazardKey | null {
  const s = t.toLowerCase();
  if (/inunda|alaga|enxurrada|margem fluvial/.test(s)) return 'flood';
  if (/desliza|queda|corrida|eros|ravina|rastejo/.test(s)) return 'landslide';
  return null;
}

const SGB_SOURCE = 'SGB/CPRM, Setorização de Risco';

function sgbFacts(lat: number, lng: number): OfficialHazardFact[] {
  const pt = turf.point([lng, lat]);
  const out: OfficialHazardFact[] = [];
  for (const { f, bbox } of sgbSectors()) {
    if (lng < bbox[0] || lng > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
    if (!turf.booleanPointInPolygon(pt, f)) continue;
    const p = (f.properties ?? {}) as Partial<RiskSectorProps>;
    const grau = String(p.grau_risco ?? '').trim();
    const byHazard = new Map<HazardKey, string[]>();
    for (const t of sectorTypologies(p)) {
      const h = hazardOfTypology(t);
      if (!h) continue;
      byHazard.set(h, [...(byHazard.get(h) ?? []), t.toLowerCase()]);
    }
    for (const [hazard, types] of Array.from(byHazard.entries())) {
      if (out.some(x => x.hazard === hazard)) continue;
      out.push({
        hazard,
        kind: 'sgb-setor',
        pt: `o lugar está num setor de risco${grau ? ` ${grau.toLowerCase()}` : ''} mapeado em campo pelo Serviço Geológico do Brasil (${types.join(', ')})`,
        en: `the place is in a${grau ? ` "${grau}"` : ''} risk sector the Brazilian Geological Survey mapped on the ground (${types.join(', ')})`,
        source: SGB_SOURCE,
      });
    }
  }
  return out;
}

const metresPt = (cm: unknown) => (Number(cm) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const metresEn = (cm: unknown) => (Number(cm) / 100).toFixed(2);
const roundM = (m: number) => (m < 100 ? Math.round(m / 10) * 10 : Math.round(m / 50) * 50);
/** The address is the popup's first line; the rest is the layer's attribute dump. */
const addressOf = (p: Record<string, unknown>) =>
  String(p.popupinfo ?? '').split(/<br\s*\/?>/i)[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const EROSION: Record<string, { pt: string; en: string }> = {
  alto: { pt: 'alta', en: 'high' },
  'médio': { pt: 'média', en: 'medium' },
  medio: { pt: 'média', en: 'medium' },
  baixo: { pt: 'baixa', en: 'low' },
};

function cityLayerFacts(lat: number, lng: number): OfficialHazardFact[] {
  const out: OfficialHazardFact[] = [];
  let facts: ReturnType<typeof siteFacts> = [];
  try { facts = siteFacts(lat, lng); } catch (err) { console.warn('[official-hazard] site layers failed:', (err as Error).message); }
  for (const f of facts) {
    const p = f.props ?? {};
    if (f.layerId === 'cotas-inundacao' && Number.isFinite(Number(p.contourmax))) {
      out.push({
        hazard: 'flood',
        kind: 'cota-guaiba',
        pt: `o lugar fica dentro da mancha da cota de ${metresPt(p.contourmax)} m do Guaíba (em maio de 2024 o Guaíba chegou a 5,35 m)`,
        en: `the place lies inside the Guaíba ${metresEn(p.contourmax)} m flood level (in May 2024 the Guaíba reached 5.35 m)`,
        source: 'SMAMUS, cotas de inundação do Guaíba',
      });
    } else if (f.layerId === 'pontos-alagamento' && !out.some(x => x.kind === 'ponto-alagamento')) {
      const d = f.distanceM ?? 0;
      const addr = addressOf(p);
      const wherePt = d < 15 ? 'junto ao lugar' : `a cerca de ${roundM(d)} m`;
      const whereEn = d < 15 ? 'right at the place' : `about ${roundM(d)} m away`;
      out.push({
        hazard: 'flood',
        kind: 'ponto-alagamento',
        pt: `há um ponto de alagamento registrado pela Prefeitura ${wherePt}${addr ? ` (${addr})` : ''}`,
        en: `the city has a recorded flooding point ${whereEn}${addr ? ` (${addr})` : ''}`,
        source: 'SMAMUS, pontos de alagamento',
      });
    } else if (f.layerId === 'erosao' && p.erosao) {
      const lvl = EROSION[String(p.erosao).trim().toLowerCase()];
      if (!lvl) continue;
      out.push({
        hazard: 'landslide',
        kind: 'erosao',
        pt: `a Prefeitura classifica a suscetibilidade à erosão ali como ${lvl.pt}`,
        en: `the city rates erosion susceptibility there as ${lvl.en}`,
        source: 'SMAMUS, suscetibilidade à erosão',
      });
    }
  }
  return out;
}

/** Every official hazard fact at a point, most specific first. */
export function officialHazardFactsAt(lat: number, lng: number): OfficialHazardFact[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  return sortOfficialFacts([...sgbFacts(lat, lng), ...cityLayerFacts(lat, lng)]);
}

/** The Guaíba level the May 2024 flood reached, in cm — the SMAMUS contours' unit. */
const GUAIBA_MAY_2024_CM = 535;

/**
 * "Dentro da área atingida com o Guaíba a 2,90 m" — when the point lies inside
 * a SMAMUS Guaíba contour at or below the May 2024 level. The LOWEST such
 * contour (siteContext's `lowest-level` mode): the level at which the water
 * first reaches the point. Null outside every contour that flood reached.
 */
export function guaibaLineAt(lat: number, lng: number): { pt: string; en: string; source: string } | null {
  let facts: ReturnType<typeof siteFacts> = [];
  try { facts = siteFacts(lat, lng); } catch { return null; }
  const cota = facts.find(f => f.layerId === 'cotas-inundacao');
  const cm = Number(cota?.props?.contourmax);
  if (!cota || !Number.isFinite(cm) || cm > GUAIBA_MAY_2024_CM) return null;
  return {
    pt: `Dentro da área atingida com o Guaíba a ${metresPt(cm)} m`,
    en: `Inside the area reached when the Guaíba is at ${metresEn(cm)} m`,
    source: 'SMAMUS',
  };
}

/** Same, for a site record (`site_lat`/`_site_lat`…); [] when no point is marked. */
export function officialHazardFactsFor(site: Record<string, string | undefined>): OfficialHazardFact[] {
  const pt = sitePoint(site);
  return pt ? officialHazardFactsAt(pt.lat, pt.lng) : [];
}
