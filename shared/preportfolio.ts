// ============================================================================
// THE PRE-PORTFOLIO — collective projects, suggested, then moved by hand
// ============================================================================
// The year-end deliverable (decided 13 Oct 2026): a pre-portfolio of the Rede's
// projects, validated by Vila Flores and the communities. Built on the
// coordinator side, as a board: a few preference questions, a SUGGESTED
// arrangement with a one-line reason per group, and cards the coordinator drags
// between projects (JVP, 14 Oct).
//
// ── Three layers, so a drag never waits on a model ──────────────────────────
//   1 · Per organisation, computed once: the pre-note's solution, budget,
//       risks, place and readiness (`portfolioOrg`), and — later — its links
//       to the city's plans (a model pass, cached per org).
//   2 · Per project, on every drop: pure arithmetic over its members
//       (`projectCard`) — members, places, risks covered, combined budget,
//       readiness (the slowest member sets it), plan links (the union).
//   3 · Per project, when the board settles: the narrative ("por que
//       juntas"), a model pass keyed by the member set, so moving a card back
//       finds the old text instantly.
// This file is layers 1 and 2 and the suggestion. No model in it.
// ============================================================================

import { getSolution } from './nbs-catalog';
import { familiesOfWorries, type HazardKey } from './site-knowledge';
import { studyRequirement } from './w3-dossier';
import { approvalRequirement } from './nbs-approvals';
import { buildPrenote, prenoteInputFromSections, type Prenote } from './e4-prenote';
import type { PlanLink } from './plan-links';

type Lang = 'pt' | 'en';

export type Horizon = 'agora' | '2-6-meses' | '1-ano';
export const HORIZON_ORDER: Horizon[] = ['agora', '2-6-meses', '1-ano'];
export const HORIZON_LABEL: Record<Horizon, { pt: string; en: string }> = {
  agora: { pt: 'pronto pra começar', en: 'ready to start' },
  '2-6-meses': { pt: '2 a 6 meses', en: '2 to 6 months' },
  '1-ano': { pt: 'cerca de 1 ano', en: 'about 1 year' },
};
const HAZARD_LABEL: Record<HazardKey, { pt: string; en: string }> = {
  flood: { pt: 'água', en: 'water' },
  heat: { pt: 'calor', en: 'heat' },
  landslide: { pt: 'encosta', en: 'slope' },
};

export interface PortfolioPrefs {
  /** 0 = group only by theme, 1 = only by geography. */
  geoWeight: number;
  /** A framing theme set by the coordination (backlog #44), or null. */
  theme: HazardKey | null;
  /** May a project have a single organisation? (backlog #42: collective by default) */
  allowSingle: boolean;
}
export const DEFAULT_PREFS: PortfolioPrefs = { geoWeight: 0.5, theme: null, allowSingle: false };

export interface PortfolioOrg {
  memberId: string;
  orgName: string;
  bairro: string;
  lat?: number;
  lng?: number;
  families: HazardKey[];
  solutionId: string | null;
  solutionLabel: string | null;
  familiaId: string | null;
  budget: { low: number; high: number } | null;
  horizon: Horizon;
  /** Why that horizon, in a few words each. */
  horizonWhy: string[];
  /** Encontro 4 questions still open. */
  gaps: number;
  /** The solution came from the technical visit. */
  visited: boolean;
  /**
   * What its pre-note total leaves out, by row: the works when they have no
   * price yet, a required study still to quote, the upkeep. The total sums only
   * rows with a published price (works at the ficha's reference, a study priced
   * in w3-studies) — never a percentage we chose — so what is outside is named.
   */
  outside?: Array<'obra' | 'estudos' | 'manutencao'>;
  /** Where its pre-note meets the city's plans — set by the server, current readings only. */
  planLinks?: PlanLink[];
  /** A reading is missing or out of date and is being redone. */
  planLinksPending?: boolean;
  /**
   * Polder, basin and proposed corridor at the marked site, from the city's
   * maps (server/services/siteContext.ts) — set by the server. Two sites in the
   * same polder share a pumping station and a drainage problem regardless of
   * which bairro they are in.
   */
  places?: Partial<Record<'polder' | 'bacia' | 'corredor', string>>;
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && v !== '' && v != null ? n : undefined; };

/** Layer 1 — one organisation, from its record. */
export function portfolioOrg(memberId: string, orgName: string, sections: unknown, lang: Lang = 'pt'): PortfolioOrg {
  const input = prenoteInputFromSections(sections);
  const note: Prenote = buildPrenote(input, lang);
  const site = input.site;
  const pt = lang === 'pt';
  const why: string[] = [];
  let horizon: Horizon = 'agora';
  const later = (h: Horizon, reason: string) => {
    why.push(reason);
    if (HORIZON_ORDER.indexOf(h) > HORIZON_ORDER.indexOf(horizon)) horizon = h;
  };
  const sol = note.solution;
  const lat = num(site._site_lat ?? site.site_lat);
  const lng = num(site._site_lng ?? site.site_lng);
  if (!sol) later('1-ano', pt ? 'sem solução escolhida' : 'no solution chosen');
  if (lat == null || lng == null) later('1-ano', pt ? 'sem lugar marcado' : 'no place marked');
  if (sol) {
    const study = studyRequirement(sol.id, site);
    const appr = approvalRequirement(sol.id, site.land_tenure);
    // A study and an approval usually run side by side, so together they are
    // still months, not a year. ⚠️ A first rule, for Robson to set: only a
    // missing solution or place says "a year".
    if (study && appr) later('2-6-meses', pt ? 'estudo técnico e autorização' : 'a technical study and an approval');
    else if (study) later('2-6-meses', pt ? 'estudo técnico' : 'a technical study');
    else if (appr) later('2-6-meses', pt ? `autorização (${appr.bodies.map(b => b.name).join(', ')})` : `approval (${appr.bodies.map(b => b.name).join(', ')})`);
    const build = input.type.construction_model;
    if (!build || build === 'indefinido') later('2-6-meses', pt ? 'quem executa ainda não definido' : 'who builds not decided');
  }
  return {
    memberId,
    orgName,
    bairro: (site.bairro ?? '').split(',')[0].trim(),
    ...(lat != null && lng != null ? { lat, lng } : {}),
    families: familiesOfWorries((site.site_worry ?? '').split(',').map(s => s.trim()).filter(Boolean)),
    solutionId: sol?.id ?? null,
    solutionLabel: sol?.label ?? null,
    familiaId: sol ? getSolution(sol.id)?.familiaId ?? null : null,
    budget: note.total,
    horizon,
    horizonWhy: why,
    gaps: note.gaps.length,
    visited: sol?.source === 'visita',
    outside: note.budget
      .filter(b => (b.kind === 'obra' || b.kind === 'estudos' || b.kind === 'manutencao') && b.low == null)
      .map(b => b.kind as 'obra' | 'estudos' | 'manutencao'),
  };
}

/** Kilometres between two points (haversine). */
export function km(a: { lat?: number; lng?: number }, b: { lat?: number; lng?: number }): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * How far apart two organisations are, 0–1, under the coordination's weighting.
 * Geography: same bairro 0, otherwise distance saturating at 5 km (no place
 * = unknown, 0.7). Theme: a shared hazard 0, the same solution família 0.5,
 * nothing in common 1.
 */
export function distance(a: PortfolioOrg, b: PortfolioOrg, prefs: PortfolioPrefs): number {
  const d = km(a, b);
  const sameWater = (k: 'polder' | 'bacia') => !!a.places?.[k] && a.places[k] === b.places?.[k];
  const geo = (a.bairro && a.bairro === b.bairro) || sameWater('polder') ? 0
    : sameWater('bacia') ? Math.min(0.3, d == null ? 0.3 : d / 5)
    : d == null ? 0.7 : Math.min(d / 5, 1);
  const theme = a.families.some(f => b.families.includes(f)) ? 0 : a.familiaId && a.familiaId === b.familiaId ? 0.5 : 1;
  const w = Math.max(0, Math.min(1, prefs.geoWeight));
  return w * geo + (1 - w) * theme;
}

export interface SuggestedGroup {
  memberIds: string[];
  /** One line on why these belong together. */
  reason: string;
}

const MERGE_UNDER = 0.45;
const MAX_SIZE = 5;

function cluster(orgs: PortfolioOrg[], prefs: PortfolioPrefs): string[][] {
  let groups = orgs.map(o => [o]);
  const avg = (g: PortfolioOrg[], h: PortfolioOrg[]) => {
    let s = 0;
    for (const a of g) for (const b of h) s += distance(a, b, prefs);
    return s / (g.length * h.length);
  };
  for (;;) {
    let best: [number, number, number] | null = null;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (groups[i].length + groups[j].length > MAX_SIZE) continue;
        const d = avg(groups[i], groups[j]);
        if (d <= MERGE_UNDER && (!best || d < best[0])) best = [d, i, j];
      }
    }
    if (!best) break;
    const [, i, j] = best;
    groups = [...groups.filter((_, k) => k !== i && k !== j), [...groups[i], ...groups[j]]];
  }
  return groups.map(g => g.map(o => o.memberId));
}

/**
 * The arrangement the board opens on. Deterministic: the same organisations
 * and preferences always give the same suggestion. With a framing theme, the
 * organisations that answer it are grouped among themselves first.
 */
export function suggestGroups(orgs: PortfolioOrg[], prefs: PortfolioPrefs = DEFAULT_PREFS, lang: Lang = 'pt'): SuggestedGroup[] {
  const sorted = [...orgs].sort((a, b) => a.memberId.localeCompare(b.memberId));
  const parts = prefs.theme
    ? [sorted.filter(o => o.families.includes(prefs.theme!)), sorted.filter(o => !o.families.includes(prefs.theme!))]
    : [sorted];
  let groups = parts.flatMap(p => cluster(p, prefs));

  if (!prefs.allowSingle) {
    // Collective by default: a single organisation joins the nearest group
    // with room — or, if there is none, the nearest other single.
    const byId = new Map(sorted.map(o => [o.memberId, o]));
    const singles = groups.filter(g => g.length === 1);
    for (const [id] of singles) {
      if (!groups.some(g => g.length === 1 && g[0] === id)) continue;
      const me = byId.get(id)!;
      let best: { g: string[]; d: number } | null = null;
      for (const g of groups) {
        if (g.includes(id) || g.length >= MAX_SIZE) continue;
        const d = g.reduce((s, m) => s + distance(me, byId.get(m)!, prefs), 0) / g.length;
        if (!best || d < best.d) best = { g, d };
      }
      if (best) {
        groups = groups.filter(g => !(g.length === 1 && g[0] === id)).map(g => (g === best!.g ? [...g, id] : g));
      }
    }
  }
  const byId = new Map(sorted.map(o => [o.memberId, o]));
  return groups.map(ids => ({ memberIds: ids, reason: reasonFor(ids.map(i => byId.get(i)!), lang) }));
}

/** Why these organisations sit together — what they actually share. */
export function reasonFor(members: PortfolioOrg[], lang: Lang = 'pt'): string {
  const pt = lang === 'pt';
  if (members.length === 1) return pt ? 'Projeto de uma organização só' : 'A single-organisation project';
  const parts: string[] = [];
  const bairros = Array.from(new Set(members.map(m => m.bairro).filter(Boolean)));
  if (bairros.length === 1) parts.push(pt ? `mesmo bairro (${bairros[0]})` : `same neighbourhood (${bairros[0]})`);
  else {
    let max = 0;
    for (const a of members) for (const b of members) { const d = km(a, b); if (d != null) max = Math.max(max, d); }
    if (max > 0 && max <= 5) parts.push(pt ? `a até ${Math.ceil(max)} km umas das outras` : `within ${Math.ceil(max)} km of each other`);
  }
  // The city's own water geography, when every member's site is on it.
  const all = (k: 'polder' | 'bacia' | 'corredor') => {
    const v = members.map(m => m.places?.[k]);
    return v.every(x => x && x === v[0]) ? v[0]! : null;
  };
  const polder = all('polder'), bacia = all('bacia'), corredor = all('corredor');
  if (polder) parts.push(pt ? `o mesmo pôlder (${polder})` : `the same polder (${polder})`);
  else if (bacia) parts.push(pt ? `a mesma bacia (${bacia.replace(/^Arroio /, 'arroio ')})` : `the same basin (${bacia})`);
  if (corredor) parts.push(pt ? `o mesmo corredor ecológico proposto (${corredor})` : `the same proposed ecological corridor (${corredor})`);
  const shared = (['flood', 'heat', 'landslide'] as HazardKey[]).filter(h => members.every(m => m.families.includes(h)));
  if (shared.length) parts.push(pt ? `o mesmo problema (${shared.map(h => HAZARD_LABEL[h].pt).join(', ')})` : `the same problem (${shared.map(h => HAZARD_LABEL[h].en).join(', ')})`);
  const familias = Array.from(new Set(members.map(m => m.familiaId).filter(Boolean)));
  if (familias.length === 1 && members.every(m => m.familiaId)) parts.push(pt ? 'o mesmo tipo de solução' : 'the same kind of solution');
  if (!parts.length) return pt ? 'Agrupadas por proximidade no conjunto — vale conferir' : 'Grouped as the closest in the set — worth checking';
  const s = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} ${pt ? 'e' : 'and'} ${parts[parts.length - 1]}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface ProjectCard {
  memberIds: string[];
  orgNames: string[];
  places: Array<{ memberId: string; lat: number; lng: number; label: string }>;
  risks: HazardKey[];
  riskLabels: string[];
  solutions: string[];
  budget: { low: number; high: number } | null;
  /** Organisations whose budget is not closed yet — the sum leaves them out. */
  unpriced: string[];
  /** Per kind of cost, the organisations whose sum leaves it out. */
  outside: Partial<Record<'obra' | 'estudos' | 'manutencao', string[]>>;
  horizon: Horizon;
  horizonLabel: string;
  /** Who sets the horizon, and why. */
  slowest: { orgName: string; why: string[] } | null;
  gaps: number;
  unvisited: string[];
  reason: string;
  /** The union of the members' plan connections, each with the organisation it came from. */
  planLinks: Array<PlanLink & { orgName: string }>;
}

/**
 * What every pre-portfolio sum leaves out, said once: no published price at
 * community scale exists for the detailed design and the technical lead's work
 * (w3-studies: "sem referência de preço publicada"), nor for managing the
 * project and mobilising the community. Named, never estimated.
 */
export const ALWAYS_OUTSIDE_PT = ['projeto executivo e o trabalho do responsável técnico', 'gestão do projeto e mobilização da comunidade'];
export const OUTSIDE_LABEL_PT: Record<'obra' | 'estudos' | 'manutencao', string> = {
  obra: 'a obra ainda sem preço',
  estudos: 'estudos e licenças a cotar',
  manutencao: 'a manutenção',
};

/** Layer 2 — a project's card, from its members. Instant; no model. */
export function projectCard(memberIds: string[], orgs: PortfolioOrg[], lang: Lang = 'pt'): ProjectCard {
  const pt = lang === 'pt';
  const ms = memberIds.map(id => orgs.find(o => o.memberId === id)).filter((m): m is PortfolioOrg => !!m);
  const risks = (['flood', 'heat', 'landslide'] as HazardKey[]).filter(h => ms.some(m => m.families.includes(h)));
  const priced = ms.filter(m => m.budget);
  const slowest = [...ms].sort((a, b) => HORIZON_ORDER.indexOf(b.horizon) - HORIZON_ORDER.indexOf(a.horizon))[0];
  const horizon: Horizon = slowest?.horizon ?? 'agora';
  return {
    memberIds: ms.map(m => m.memberId),
    orgNames: ms.map(m => m.orgName),
    places: ms.filter(m => m.lat != null && m.lng != null).map(m => ({ memberId: m.memberId, lat: m.lat!, lng: m.lng!, label: m.orgName })),
    risks,
    riskLabels: risks.map(h => HAZARD_LABEL[h][lang]),
    solutions: Array.from(new Set(ms.map(m => m.solutionLabel).filter((x): x is string => !!x))),
    budget: priced.length ? { low: priced.reduce((s, m) => s + m.budget!.low, 0), high: priced.reduce((s, m) => s + m.budget!.high, 0) } : null,
    unpriced: ms.filter(m => !m.budget).map(m => m.orgName),
    outside: (['obra', 'estudos', 'manutencao'] as const).reduce((acc, k) => {
      const who = ms.filter(m => m.outside?.includes(k)).map(m => m.orgName);
      return who.length ? { ...acc, [k]: who } : acc;
    }, {} as Partial<Record<'obra' | 'estudos' | 'manutencao', string[]>>),
    horizon,
    horizonLabel: HORIZON_LABEL[horizon][lang],
    slowest: slowest && slowest.horizon !== 'agora' ? { orgName: slowest.orgName, why: slowest.horizonWhy } : null,
    gaps: ms.reduce((s, m) => s + m.gaps, 0),
    unvisited: ms.filter(m => !m.visited).map(m => m.orgName),
    reason: ms.length ? reasonFor(ms, lang) : (pt ? 'Projeto vazio' : 'Empty project'),
    planLinks: ms.flatMap(m => (m.planLinks ?? []).map(l => ({ ...l, orgName: m.orgName }))),
  };
}

/** The key layer 3 caches a narrative under — the member set, order-free. */
export const memberSetKey = (memberIds: string[]) => [...memberIds].sort().join('|');
