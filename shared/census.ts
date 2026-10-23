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
  kind: 'ubs' | 'hospital' | 'pronto-atendimento' | 'escola' | 'quilombo' | 'terra-indigena' | 'alimento';
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
export interface CensusRelevance { heat: boolean; water: boolean; food?: boolean }

/**
 * From the solution's família weights (shared/nbs-catalog.ts — the same ones
 * that rank famílias): ≥ 0.5 on heat → the street-tree line; ≥ 0.5 on flood →
 * the sewage line. Unknown solution → null (people only).
 */
export function relevanceFor(solutionId: string | null | undefined): CensusRelevance | null {
  const sol = solutionId ? getSolution(solutionId) : undefined;
  const fam = sol ? getFamilia(sol.familiaId) : undefined;
  if (!fam) return null;
  return { heat: (fam.hazards.heat ?? 0) >= 0.5, water: (fam.hazards.flood ?? 0) >= 0.5, food: fam.id === 'agricultura-urbana' };
}

const round = (v: number) => (v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10);
const fmt = (v: number, lang: Lang) => round(v).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-GB');
const pct = (v: number) => `${Math.round(v * 100)}%`;
const brl = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;

/** Title-case a CNES/INEP name ("UNIDADE DE SAUDE MORRO DA CRUZ" → "Unidade de Saúde Morro da Cruz"). */
export function niceName(name: string): string {
  const fix: Record<string, string> = { Saude: 'Saúde', Clinica: 'Clínica', Familia: 'Família', Basica: 'Básica', Esc: 'Escola', Est: 'Estadual', Mun: 'Municipal', Ens: 'Ensino', Fun: 'Fundamental', Ed: 'Educação', Bas: 'Básica', Col: 'Colégio', Nucl: 'Núcleo', Emef: 'EMEF', Emei: 'EMEI', Eja: 'EJA', Cp: 'CP', Prof: 'Prof.', Ifrs: 'IFRS' };
  return name.toLowerCase().split(/\s+/).map((w, i) => {
    if (i > 0 && ['de', 'da', 'do', 'dos', 'das', 'e'].includes(w)) return w;
    const t = w.charAt(0).toUpperCase() + w.slice(1);
    return fix[t] ?? t;
  }).join(' ');
}

/** Who lives there — one line: people, ages, typical income (+ race only for the coordination). */
export function censusPeopleLine(c: CensusAround | null | undefined, opts: { lang: Lang; withRace?: boolean }): { text: string; source: string } | null {
  if (!c || c.people <= 0) return null;
  const pt = opts.lang === 'pt';
  const ages = [
    c.children !== null && c.children > 0 ? (pt ? `${fmt(c.children, 'pt')} com até 14 anos` : `${fmt(c.children, 'en')} aged 14 or under`) : null,
    c.elderly !== null && c.elderly > 0 ? (pt ? `${fmt(c.elderly, 'pt')} com 60 anos ou mais` : `${fmt(c.elderly, 'en')} aged 60 or over`) : null,
  ].filter(Boolean);
  let text = pt
    ? `Cerca de ${fmt(c.people, 'pt')} pessoas moram num raio de 300 m do lugar${ages.length ? `, ${ages.join(' e ')}` : ''}`
    : `About ${fmt(c.people, 'en')} people live within 300 m of the site${ages.length ? `, ${ages.join(' and ')}` : ''}`;
  if (opts.withRace && c.blackOrBrown !== null) text += pt ? `; ${pct(c.blackOrBrown / c.people)} são pretas ou pardas` : `; ${pct(c.blackOrBrown / c.people)} are Black or brown (pretas ou pardas)`;
  if (c.incomeMedian !== null) text += pt ? `. Renda típica do responsável pelo domicílio: ${brl(c.incomeMedian)}` : `. Typical household-head income: ${brl(c.incomeMedian)}`;
  text += c.partial ? (pt ? ' (o IBGE protege alguns números de setores pequenos).' : ' (IBGE withholds some figures for small tracts).') : '.';
  return { text, source: CENSUS_SOURCE[opts.lang] };
}

/**
 * Why THIS solution here, from the census (round 3, C1-A): the line that argues
 * for the solution chosen — never repeating the people line.
 *   heat  → streets without trees, and how many of the most heat-vulnerable live near;
 *   water → homes without adequate sewage (only when it is a real share, ≥ 5%).
 */
export function censusImpactLines(c: CensusAround | null | undefined, rel: CensusRelevance | null | undefined, lang: Lang): Array<{ text: string; source: string }> {
  if (!c || c.people <= 0 || !rel) return [];
  const pt = lang === 'pt';
  const out: Array<{ text: string; source: string }> = [];
  if (rel.heat && c.noTreesShare !== null) {
    const vulnerable = [
      c.children ? (pt ? `~${fmt(c.children, 'pt')} crianças e adolescentes` : `~${fmt(c.children, 'en')} children and teenagers`) : null,
      c.elderly ? (pt ? `~${fmt(c.elderly, 'pt')} pessoas com 60 anos ou mais` : `~${fmt(c.elderly, 'en')} people aged 60 or over`) : null,
    ].filter(Boolean);
    out.push({
      text: pt
        ? `No entorno, ${pct(c.noTreesShare)} das casas estão em ruas sem árvores${vulnerable.length ? `; moram ali ${vulnerable.join(' e ')}, quem mais sofre no calor` : ''}.`
        : `Around it, ${pct(c.noTreesShare)} of homes are on streets with no trees${vulnerable.length ? `; ${vulnerable.join(' and ')} live there, those who suffer most in the heat` : ''}.`,
      source: pt ? 'IBGE, Censo 2022 — entorno dos domicílios e idade' : 'IBGE, 2022 Census — street surroundings and age',
    });
  }
  if (rel.water && c.noSewerShare !== null && c.noSewerShare >= 0.05) {
    out.push({
      text: pt ? `No entorno, ${pct(c.noSewerShare)} das casas não têm esgoto adequado.` : `Around it, ${pct(c.noSewerShare)} of homes lack adequate sewage.`,
      source: pt ? 'IBGE, Censo 2022 — saneamento' : 'IBGE, 2022 Census — sanitation',
    });
  }
  return out;
}

/** Public references beside an indicator's own baseline (round 3, C1-B) — the organisation's count still decides. */
export function indicatorReferences(c: CensusAround | null | undefined, lang: Lang): Record<string, string> {
  if (!c || c.people <= 0) return {};
  const pt = lang === 'pt';
  const out: Record<string, string> = {};
  if (c.homes > 0) out['familias-atendidas'] = pt ? `referência pública: ~${fmt(c.homes, 'pt')} domicílios num raio de 300 m (IBGE, Censo 2022)` : `public reference: ~${fmt(c.homes, 'en')} homes within 300 m (IBGE, 2022 Census)`;
  if (c.noTreesShare !== null) out.temperatura = pt ? `referência pública: hoje ${pct(c.noTreesShare)} das casas do entorno estão em ruas sem árvores (IBGE, Censo 2022)` : `public reference: today ${pct(c.noTreesShare)} of homes around it are on treeless streets (IBGE, 2022 Census)`;
  return out;
}

/** All of it, for a document with no separate sections (concept note, Perfil). */
export function censusLines(c: CensusAround | null | undefined, opts: { lang: Lang; relevance?: CensusRelevance | null; withRace?: boolean; nearby?: boolean }): Array<{ text: string; source: string }> {
  const people = censusPeopleLine(c, opts);
  if (!people) return [];
  const near = opts.nearby === false ? null : nearbyLine(c!.nearby, opts.lang, opts.relevance);
  return [people, ...censusImpactLines(c, opts.relevance, opts.lang), ...(near ? [near] : [])];
}

/** "No entorno: …" — context, never a partner (R2). Nearest first, a few. */
export function nearbyLine(nearby: CensusNearby[], lang: Lang, rel?: CensusRelevance | null): { text: string; source: string } | null {
  const pt = lang === 'pt';
  const near = (k: CensusNearby['kind'][], max: number, within: number) => nearby.filter(n => k.includes(n.kind) && n.distanceM <= within).sort((a, b) => a.distanceM - b.distanceM).slice(0, max);
  const m = (d: number) => `${Math.max(10, Math.round(d / 10) * 10)} m`;
  // An ambulance base is not a place people go to (SAMU) — noise on a funder's page (P1-B).
  const health = near(['ubs', 'pronto-atendimento', 'hospital'], 4, 1000).filter(n => !/^samu\b/i.test(n.name)).slice(0, 2);
  // Fresh-food shops only for urban agriculture, named, never counted (Overture is patchy).
  const food = rel?.food ? near(['alimento'], 2, 1000) : [];
  const schools = near(['escola'], 2, 500);
  const terr = near(['quilombo', 'terra-indigena'], 2, 1000);
  const parts = [
    ...health.map(n => `${niceName(n.name)} (${m(n.distanceM)})`),
    ...schools.map(n => `${niceName(n.name)} (${m(n.distanceM)})`),
    ...food.map(n => `${n.name} (${m(n.distanceM)})`),
    ...terr.map(n => n.kind === 'quilombo'
      ? (pt ? `território quilombola ${niceName(n.name)} (${n.distanceM === 0 ? 'no local' : m(n.distanceM)})` : `quilombola territory ${niceName(n.name)} (${n.distanceM === 0 ? 'on site' : m(n.distanceM)})`)
      : (pt ? `terra indígena ${n.name} (${n.distanceM === 0 ? 'no local' : m(n.distanceM)})` : `indigenous land ${n.name} (${n.distanceM === 0 ? 'on site' : m(n.distanceM)})`)),
  ];
  if (!parts.length) return null;
  const sources = Array.from(new Set([...health, ...schools, ...food, ...terr].map(n => n.source))).join('; ');
  return { text: pt ? `No entorno: ${parts.join(', ')}.` : `Nearby: ${parts.join(', ')}.`, source: sources };
}

/** One sentence for several places together — each tract counted once (P1-C: a sentence, not a dotted line). */
export function combinedCensusLine(c: CensusAround | null | undefined, places: number, opts: { lang: Lang; withRace?: boolean; heat?: boolean }): { text: string; source: string } | null {
  if (!c || c.people <= 0) return null;
  const pt = opts.lang === 'pt';
  const where = places > 1 ? (pt ? `Os ${places} lugares somam` : `The ${places} sites add up to`) : (pt ? 'O lugar tem' : 'The site has');
  const parts: string[] = [pt ? `${where} cerca de ${fmt(c.people, 'pt')} moradores num raio de 300 m` : `${where} about ${fmt(c.people, 'en')} residents within 300 m`];
  if (opts.withRace && c.blackOrBrown !== null) parts.push(pt ? `${pct(c.blackOrBrown / c.people)} se declaram pretos ou pardos` : `${pct(c.blackOrBrown / c.people)} identify as Black or brown`);
  if (opts.heat && c.noTreesShare !== null) parts.push(pt ? `${pct(c.noTreesShare)} das casas estão em ruas sem árvores` : `${pct(c.noTreesShare)} of homes are on treeless streets`);
  if (c.incomeMedian !== null) parts.push(pt ? `a renda típica do responsável é ${brl(c.incomeMedian)}` : `the typical household-head income is ${brl(c.incomeMedian)}`);
  const last = parts.pop()!;
  const text = parts.length ? `${parts.join('; ')}; ${pt ? 'e' : 'and'} ${last}.` : `${last}.`;
  return { text, source: pt ? 'IBGE, Censo 2022 (cada setor contado uma vez)' : 'IBGE, 2022 Census (each tract counted once)' };
}

/** Encontro 4's hint before "quem é atingido" (E1): a starting point, never their answer. */
export function beneficiariesHint(c: CensusAround | null | undefined, lang: Lang): string | null {
  if (!c || c.people < 50) return null;
  return lang === 'pt'
    ? `Pelo Censo 2022, cerca de ${fmt(c.people, 'pt')} pessoas moram num raio de 300 m daqui${c.children ? `, ${fmt(c.children, 'pt')} delas com até 14 anos` : ''}.`
    : `By the 2022 Census, about ${fmt(c.people, 'en')} people live within 300 m of here${c.children ? `, ${fmt(c.children, 'en')} of them aged 14 or under` : ''}.`;
}
