// ============================================================================
// WHO LIVES AROUND A SITE — the 2022 Census, said on a document
// ============================================================================
// Decided 23 Oct 2026 (docs/census-2022.md, two /refinehtml rounds):
//   · used AFTER the encontros, to enrich documents — the proposta inicial's
//     Território, the combined project, the pre-portfolio, the Perfil, the
//     concept note, the synergy report. Nothing an organisation answered is
//     ever written: these lines sit beside their words, with their source.
//   · people always; street trees only when the solution acts on heat, sewage
//     only when it acts on water (D2);
//   · pretos e pardos only in the coordination's views (D3) — `withRace`;
//   · health units and schools "no entorno", never as partners (R2).
//
// Pure — the numbers come from server/services/censusContext.ts.
// ============================================================================

import { getFamilia, getSolution } from './nbs-catalog';

export type Lang = 'pt' | 'en';

/** The tracts that touch ~300 m around a point (or several, each tract once). */
export interface CensusAround {
  /** Tract ids, so a combined project can count each one once. */
  tracts: string[];
  people: number;
  /** 0–14. Null when IBGE withheld every tract's figure; `partial` when some. */
  children: number | null;
  elderly: number | null;
  /** Pretos e pardos — coordination views only. */
  blackOrBrown: number | null;
  homes: number;
  /** Median, across the tracts, of each tract's average household-head income (R$) — "renda típica". */
  incomeMedian: number | null;
  /** Share of homes on a street with no trees, weighted by homes. */
  noTreesShare: number | null;
  /** Share of homes without adequate sewage. */
  noSewerShare: number | null;
  /** Some tracts had a figure withheld by IBGE — counts may be a little low. */
  partial: boolean;
  /** Health units, schools, quilombos and indigenous lands near the point. */
  nearby: CensusNearby[];
}

export interface CensusNearby {
  kind: 'ubs' | 'hospital' | 'pronto-atendimento' | 'escola' | 'quilombo' | 'terra-indigena';
  name: string;
  distanceM: number;
  source: string;
}

/** One tract's figures, as imported (null = withheld by IBGE). */
export interface TractStats { p: number | null; c: number | null; e: number | null; pp: number | null; d: number | null; r: number | null; t: number | null; w: number | null }
/** A tract's figures with the share of its area inside the circle(s) (0–1; absent = 1). */
export type WeightedTract = TractStats & { share?: number };

/**
 * Sum tracts into what a document says. Shared so a combined project on the
 * board (client, on every drop) and the server count the same way — each tract
 * once, because the map is keyed by tract id.
 */
export function summariseTracts(stats: Record<string, TractStats & { share?: number }>, nearby: CensusNearby[] = []): CensusAround | null {
  const ids = Object.keys(stats).filter(id => (stats[id].share ?? 1) > 0);
  if (!ids.length) return null;
  const s = ids.map(id => stats[id]);
  const f = (x: TractStats & { share?: number }) => x.share ?? 1;
  const sum = (k: keyof TractStats) => (s.some(x => x[k] !== null) ? s.reduce((a, x) => a + (x[k] ?? 0) * f(x), 0) : null);
  const homes = s.reduce((a, x) => a + (x.d ?? 0) * f(x), 0);
  const trees = s.filter(x => x.t !== null && (x.d ?? 0) > 0);
  const treeHomes = trees.reduce((a, x) => a + (x.d ?? 0) * f(x), 0);
  const sewer = s.filter(x => x.w !== null && (x.d ?? 0) > 0);
  const sewerHomes = sewer.reduce((a, x) => a + (x.d ?? 0) * f(x), 0);
  // The typical income: tracts that are meaningfully inside the circle.
  const incomes = s.filter(x => f(x) >= 0.05).map(x => x.r).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const round = (v: number | null) => (v === null ? null : Math.round(v));
  return {
    tracts: ids,
    people: Math.round(s.reduce((a, x) => a + (x.p ?? 0) * f(x), 0)),
    children: round(sum('c')),
    elderly: round(sum('e')),
    blackOrBrown: round(sum('pp')),
    homes: Math.round(homes),
    incomeMedian: incomes.length ? incomes[Math.floor(incomes.length / 2)] : null,
    noTreesShare: treeHomes > 0 ? trees.reduce((a, x) => a + (x.t as number) * (x.d ?? 0) * f(x), 0) / treeHomes : null,
    noSewerShare: sewerHomes > 0 ? sewer.reduce((a, x) => a + (x.w as number) * f(x), 0) / sewerHomes : null,
    partial: s.some(x => x.c === null || x.e === null || x.r === null),
    nearby,
  };
}

export const CENSUS_SOURCE: Record<Lang, string> = {
  pt: 'IBGE, Censo 2022 — raio de 300 m (setores ponderados pela área)',
  en: 'IBGE, 2022 Census — within a 300 m radius (tracts weighted by area)',
};

/** What a solution acts on, so a line argues for THIS solution (D2). */
export interface CensusRelevance { heat: boolean; water: boolean }

/**
 * From the solution's família weights (shared/nbs-catalog.ts — the same ones
 * that rank famílias): ≥ 0.5 on heat → the street-tree line; ≥ 0.5 on flood →
 * the sewage line. Unknown solution → null (people only).
 */
export function relevanceFor(solutionId: string | null | undefined): CensusRelevance | null {
  const sol = solutionId ? getSolution(solutionId) : undefined;
  const fam = sol ? getFamilia(sol.familiaId) : undefined;
  if (!fam) return null;
  return { heat: (fam.hazards.heat ?? 0) >= 0.5, water: (fam.hazards.flood ?? 0) >= 0.5 };
}

const round = (v: number) => (v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10);
const fmt = (v: number, lang: Lang) => round(v).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-GB');
const pct = (v: number) => `${Math.round(v * 100)}%`;
const brl = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;

/** Title-case a CNES/INEP name ("UNIDADE DE SAUDE MORRO DA CRUZ" → "Unidade de Saúde Morro da Cruz"). */
export function niceName(name: string): string {
  const fix: Record<string, string> = { Saude: 'Saúde', Clinica: 'Clínica', Familia: 'Família', Basica: 'Básica', Esc: 'Escola', Est: 'Estadual', Mun: 'Municipal', Ens: 'Ensino', Fun: 'Fundamental', Ed: 'Educação', Bas: 'Básica' };
  return name.toLowerCase().split(/\s+/).map((w, i) => {
    if (i > 0 && ['de', 'da', 'do', 'dos', 'das', 'e'].includes(w)) return w;
    const t = w.charAt(0).toUpperCase() + w.slice(1);
    return fix[t] ?? t;
  }).join(' ');
}

/**
 * The lines for a document about ONE site. Third person, rounded, sourced.
 * `relevance` null = a document with no solution yet: people only.
 */
export function censusLines(c: CensusAround | null | undefined, opts: { lang: Lang; relevance?: CensusRelevance | null; withRace?: boolean; nearby?: boolean }): Array<{ text: string; source: string }> {
  if (!c || c.people <= 0) return [];
  const pt = opts.lang === 'pt';
  const src = CENSUS_SOURCE[opts.lang];
  const out: Array<{ text: string; source: string }> = [];
  const ages = [
    c.children !== null && c.children > 0 ? (pt ? `${fmt(c.children, 'pt')} com até 14 anos` : `${fmt(c.children, 'en')} aged 14 or under`) : null,
    c.elderly !== null && c.elderly > 0 ? (pt ? `${fmt(c.elderly, 'pt')} com 60 anos ou mais` : `${fmt(c.elderly, 'en')} aged 60 or over`) : null,
  ].filter(Boolean);
  let people = pt
    ? `Cerca de ${fmt(c.people, 'pt')} pessoas moram a até ~300 m do lugar${ages.length ? `, ${ages.join(' e ')}` : ''}`
    : `About ${fmt(c.people, 'en')} people live within ~300 m of the site${ages.length ? `, ${ages.join(' and ')}` : ''}`;
  if (opts.withRace && c.blackOrBrown !== null && c.people > 0) {
    people += pt ? `; ${pct(c.blackOrBrown / c.people)} são pretas ou pardas` : `; ${pct(c.blackOrBrown / c.people)} are Black or brown (pretas ou pardas)`;
  }
  if (c.incomeMedian !== null) people += pt ? `. Renda típica do responsável pelo domicílio: ${brl(c.incomeMedian)}` : `. Typical household-head income: ${brl(c.incomeMedian)}`;
  people += c.partial ? (pt ? ' (o IBGE protege alguns números de setores pequenos).' : ' (IBGE withholds some figures for small tracts).') : '.';
  out.push({ text: people, source: src });
  const rel = opts.relevance;
  if (rel?.heat && c.noTreesShare !== null) {
    out.push({ text: pt ? `${pct(c.noTreesShare)} das casas do entorno estão em ruas sem árvores.` : `${pct(c.noTreesShare)} of homes around it are on streets with no trees.`, source: pt ? 'IBGE, Censo 2022 — entorno dos domicílios' : 'IBGE, 2022 Census — street surroundings' });
  }
  if (rel?.water && c.noSewerShare !== null && c.noSewerShare >= 0.05) {
    out.push({ text: pt ? `${pct(c.noSewerShare)} das casas do entorno não têm esgoto adequado.` : `${pct(c.noSewerShare)} of homes around it lack adequate sewage.`, source: pt ? 'IBGE, Censo 2022 — saneamento' : 'IBGE, 2022 Census — sanitation' });
  }
  if (opts.nearby !== false) {
    const line = nearbyLine(c.nearby, opts.lang);
    if (line) out.push(line);
  }
  return out;
}

/** "No entorno: …" — context, never a partner (R2). Nearest first, a few. */
export function nearbyLine(nearby: CensusNearby[], lang: Lang): { text: string; source: string } | null {
  const pt = lang === 'pt';
  const near = (k: CensusNearby['kind'][], max: number, within: number) => nearby.filter(n => k.includes(n.kind) && n.distanceM <= within).sort((a, b) => a.distanceM - b.distanceM).slice(0, max);
  const m = (d: number) => `${Math.max(10, Math.round(d / 10) * 10)} m`;
  const health = near(['ubs', 'pronto-atendimento', 'hospital'], 2, 1000);
  const schools = near(['escola'], 2, 500);
  const terr = near(['quilombo', 'terra-indigena'], 2, 1000);
  const parts = [
    ...health.map(n => `${niceName(n.name)} (${m(n.distanceM)})`),
    ...schools.map(n => `${niceName(n.name)} (${m(n.distanceM)})`),
    ...terr.map(n => n.kind === 'quilombo'
      ? (pt ? `território quilombola ${niceName(n.name)} (${n.distanceM === 0 ? 'no local' : m(n.distanceM)})` : `quilombola territory ${niceName(n.name)} (${n.distanceM === 0 ? 'on site' : m(n.distanceM)})`)
      : (pt ? `terra indígena ${n.name} (${n.distanceM === 0 ? 'no local' : m(n.distanceM)})` : `indigenous land ${n.name} (${n.distanceM === 0 ? 'on site' : m(n.distanceM)})`)),
  ];
  if (!parts.length) return null;
  const sources = Array.from(new Set([...health, ...schools, ...terr].map(n => n.source))).join('; ');
  return { text: pt ? `No entorno: ${parts.join(', ')}.` : `Nearby: ${parts.join(', ')}.`, source: sources };
}

/** One line for several places together — each tract counted once (B). */
export function combinedCensusLine(c: CensusAround | null | undefined, places: number, opts: { lang: Lang; withRace?: boolean; heat?: boolean }): { text: string; source: string } | null {
  if (!c || c.people <= 0) return null;
  const pt = opts.lang === 'pt';
  const parts = [pt ? `~${fmt(c.people, 'pt')} pessoas a até ~300 m ${places > 1 ? `dos ${places} lugares` : 'do lugar'}` : `~${fmt(c.people, 'en')} people within ~300 m of ${places > 1 ? `the ${places} sites` : 'the site'}`];
  if (opts.withRace && c.blackOrBrown !== null) parts.push(pt ? `${pct(c.blackOrBrown / c.people)} pretas ou pardas` : `${pct(c.blackOrBrown / c.people)} Black or brown`);
  if (c.incomeMedian !== null) parts.push(pt ? `renda típica do responsável ${brl(c.incomeMedian)}` : `typical household-head income ${brl(c.incomeMedian)}`);
  if (opts.heat && c.noTreesShare !== null) parts.push(pt ? `${pct(c.noTreesShare)} das casas em ruas sem árvores` : `${pct(c.noTreesShare)} of homes on treeless streets`);
  return { text: parts.join(' · '), source: pt ? 'IBGE, Censo 2022 (cada setor contado uma vez)' : 'IBGE, 2022 Census (each tract counted once)' };
}

/** Encontro 4's hint before "quem é atingido" (E1): a starting point, never their answer. */
export function beneficiariesHint(c: CensusAround | null | undefined, lang: Lang): string | null {
  if (!c || c.people < 50) return null;
  return lang === 'pt'
    ? `Pelo Censo 2022, cerca de ${fmt(c.people, 'pt')} pessoas moram a até uns 300 m daqui${c.children ? `, ${fmt(c.children, 'pt')} delas com até 14 anos` : ''}.`
    : `By the 2022 Census, about ${fmt(c.people, 'en')} people live within ~300 m of here${c.children ? `, ${fmt(c.children, 'en')} of them aged 14 or under` : ''}.`;
}
