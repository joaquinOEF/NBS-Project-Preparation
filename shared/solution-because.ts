// ============================================================================
// THE "BECAUSE" LINE — why a solution fits THIS place, from the official reading
// ============================================================================
// "Calor aqui: ameaça muito alta (plano climático, 2050) → soluções de sombra e
// resfriamento." One line that ties what the map says at a point to what a
// solution does, for a chat message or a card on the map demo (27 Nov 2026).
//
// Nothing here is a new judgement:
//  - the reading is `hazardAtPin`'s (server/services/sgbPointHazard.ts): its
//    level (≥ 3 = high), its own words ("alta", "muito alta") and its source;
//  - whether a catalogue solution answers a hazard is Robson's classification
//    (shared/solution-strengths.ts — Forte or Média = it addresses it, the rule
//    of 26 Oct). A solution he rated Fraca/nenhum everywhere gets NO line;
//  - a legacy explorer intervention (client/public/sample-data/
//    interventions.json) answers the hazard of its category.
// SOLUTION_MECHANISMS (nbs-catalog.ts) is not read here: it is our provisional
// read, by water mechanism, and Robson's table covers all 27 solutions.
//
// ⚠️ REGISTER (docs/document-register.md). These strings are SPOKEN — workshop
// chat and map cards, second person allowed. They must not be placed on
// anything an organisation downloads or prints.
//
// ⚠️ "Nothing high here" is never an all-clear: the official maps do not cover
// everything (rain ponding is mapped by nobody) — the sentence says so.
// ============================================================================

import { NBS_FAMILIAS, NBS_SOLUTIONS, getSolution, type NbsFamiliaId } from './nbs-catalog';
import { SOLUTION_STRENGTHS, addresses, strengthOf, type Strength } from './solution-strengths';
import type { CboSiteCard } from './cbo-schema';
import type { HazardKey } from './site-knowledge';

/** One entry of what `hazardAtPin` returns (the site card's `pinHazard` carries the same shape). */
export type HazardReading = NonNullable<CboSiteCard['pinHazard']>[number];

/** The level from which a hazard reads as high — the same ≥ 3 everywhere downstream. */
export const HIGH_LEVEL = 3;

export type LegacyCategory = 'flood_storage' | 'urban_cooling' | 'slope_stability' | 'multi_benefit';

/** What each legacy explorer category answers; multi_benefit answers any of the three. */
export const LEGACY_CATEGORY_HAZARDS: Record<LegacyCategory, HazardKey[]> = {
  flood_storage: ['flood'],
  urban_cooling: ['heat'],
  slope_stability: ['landslide'],
  multi_benefit: ['flood', 'heat', 'landslide'],
};

/** A legacy explorer intervention: its category decides; `id` is only carried through. */
export interface LegacyIntervention { category: string; id?: string }

export interface Bilingual { pt: string; en: string }

export interface SolutionBecause {
  /** True when the solution answers a hazard that is HIGH at this point. */
  fits: boolean;
  /** The high hazard it answers (only when `fits`). */
  hazard?: HazardKey;
  level?: number;
  line: Bilingual;
  /** Who says the hazard is high: 'SGB', 'PLAC' (climate plan) or 'SMAMUS'. */
  source?: string;
}

const HAZARD_ORDER: HazardKey[] = ['flood', 'heat', 'landslide'];

// The card's own names for the three hazards (CboSiteCard STRINGS.hz, without the emoji).
const NAME: Record<HazardKey, Bilingual> = {
  flood: { pt: 'Inundação', en: 'Flooding' },
  heat: { pt: 'Calor', en: 'Heat' },
  landslide: { pt: 'Deslizamento', en: 'Landslide' },
};

/** What kind of solution answers each hazard — the tail of a line about a hazard, not one solution. */
const ANSWER: Record<HazardKey, Bilingual> = {
  flood: { pt: 'soluções que seguram e infiltram a água', en: 'solutions that hold and soak up water' },
  heat: { pt: 'soluções de sombra e resfriamento', en: 'shade and cooling solutions' },
  landslide: { pt: 'soluções que seguram a encosta', en: 'solutions that hold the slope' },
};

/**
 * "Calor aqui: ameaça muito alta (plano climático, 2050)". The level words are
 * the reading's own (`pt` / `en`), never re-derived from the number: SGB says
 * "alta", the climate plan "muito alta", and a flood read off the May 2024
 * contours says where it comes from.
 */
export function readingPhrase(r: HazardReading): Bilingual {
  const n = NAME[r.hazard];
  if (r.source === 'SMAMUS') return { pt: `${n.pt} aqui: ${r.pt} (cheia de maio de 2024, SMAMUS)`, en: `${n.en} here: ${r.en} (May 2024 flood, SMAMUS)` };
  if (r.source === 'SGB') return { pt: `${n.pt} aqui: suscetibilidade ${r.pt} (SGB)`, en: `${n.en} here: ${r.en} susceptibility (SGB)` };
  return { pt: `${n.pt} aqui: ameaça ${r.pt} (plano climático, 2050)`, en: `${n.en} here: ${r.en} hazard (climate plan, 2050)` };
}

const usable = (readings: HazardReading[] | null | undefined): HazardReading[] =>
  (readings ?? []).filter(r => r && HAZARD_ORDER.includes(r.hazard) && Number.isFinite(r.level));

/** The site's high hazards (level ≥ 3), strongest first; equal levels keep flood · heat · landslide. */
export function highReadings(readings: HazardReading[] | null | undefined): HazardReading[] {
  return usable(readings)
    .filter(r => r.level >= HIGH_LEVEL)
    .sort((a, b) => b.level - a.level || HAZARD_ORDER.indexOf(a.hazard) - HAZARD_ORDER.indexOf(b.hazard));
}

/**
 * The sentence for a point with no high hazard — never an all-clear. With no
 * reading at all (outside the city, over the water) it says that instead.
 */
export function noHighHazardLine(readings: HazardReading[] | null | undefined): Bilingual {
  if (!usable(readings).length) return {
    pt: 'Não temos dado oficial de ameaça para este ponto. Isso não diz se o lugar é seguro ou não — vale o que vocês conhecem dele.',
    en: 'We hold no official hazard data for this point. That says nothing about whether the place is safe — what you know of it is what counts.',
  };
  return {
    pt: 'Nenhuma ameaça alta mapeada neste ponto nos dados oficiais (SGB e plano climático). Isso não quer dizer que o lugar é seguro: os mapas não cobrem tudo — alagamento de chuva, por exemplo, ninguém mapeia.',
    en: 'No high hazard is mapped at this point in the official data (SGB and the climate plan). That does not mean the place is safe: the maps do not cover everything — rain ponding, for one, is mapped by nobody.',
  };
}

const list = (xs: string[], and: string) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`);
const lower = (h: HazardKey): Bilingual => ({ pt: NAME[h].pt.toLowerCase(), en: NAME[h].en.toLowerCase() });

/** Declared hazards of a solution, strongest first; [] = it gets no because line. */
function declaredHazards(solution: string | LegacyIntervention): Array<{ hazard: HazardKey; strength?: Strength }> {
  if (typeof solution === 'string') {
    const row = SOLUTION_STRENGTHS[solution];
    if (!row || !getSolution(solution)) return [];
    return HAZARD_ORDER.filter(h => addresses(row[h])).map(h => ({ hazard: h, strength: row[h] }));
  }
  const hs = Object.prototype.hasOwnProperty.call(LEGACY_CATEGORY_HAZARDS, solution?.category ?? '')
    ? LEGACY_CATEGORY_HAZARDS[solution.category as LegacyCategory] : [];
  return hs.map(hazard => ({ hazard }));
}

/** The tail after the arrow, for ONE solution: Robson's scale in plain words, or the legacy category. */
function tailFor(solution: string | LegacyIntervention, hazard: HazardKey, strength?: Strength): Bilingual {
  if (typeof solution === 'string') {
    const s = getSolution(solution)!;
    // His scale: Forte acts directly on the physical process; Média contributes,
    // depending on scale, place and combination (solution-strengths.ts).
    return strength === 'forte'
      ? { pt: `${s.pt.label} age direto nisso`, en: `${s.en.label} acts directly on it` }
      : { pt: `${s.pt.label} ajuda, dependendo do tamanho e do lugar`, en: `${s.en.label} helps, depending on size and place` };
  }
  return solution.category === 'multi_benefit'
    ? { pt: 'esta solução responde a mais de uma ameaça, e a esta também', en: 'this solution answers more than one hazard, this one included' }
    : { pt: `esta é uma das ${ANSWER[hazard].pt}`, en: `this is one of the ${ANSWER[hazard].en}` };
}

/**
 * Why this solution fits this place — or that, by the official data, it does not.
 *
 * `solution`: a catalogue id (shared/nbs-catalog.ts) or a legacy explorer
 * intervention (`{ category, id? }` from interventions.json).
 *
 * Returns null when the solution declares no hazard (Robson rated it Fraca or
 * nenhum on all three, or the id / category is unknown): no line is better than
 * an invented one. When several high hazards match, the highest level wins;
 * equal levels go to the one the solution is stronger on.
 */
export function becauseFor(readings: HazardReading[] | null | undefined, solution: string | LegacyIntervention): SolutionBecause | null {
  const declared = declaredHazards(solution);
  if (!declared.length) return null;
  const rank = (s?: Strength) => (s === 'forte' ? 0 : 1);
  const hit = highReadings(readings)
    .map(r => ({ r, d: declared.find(d => d.hazard === r.hazard) }))
    .filter((x): x is { r: HazardReading; d: { hazard: HazardKey; strength?: Strength } } => !!x.d)
    .sort((a, b) => b.r.level - a.r.level || rank(a.d.strength) - rank(b.d.strength))[0];
  if (hit) {
    const p = readingPhrase(hit.r), t = tailFor(solution, hit.r.hazard, hit.d.strength);
    return {
      fits: true, hazard: hit.r.hazard, level: hit.r.level, source: hit.r.source,
      line: { pt: `${p.pt} → ${t.pt}.`, en: `${p.en} → ${t.en}.` },
    };
  }
  // It answers something — just nothing the official data marks high here.
  const hs = declared.map(d => lower(d.hazard));
  const subject: Bilingual = typeof solution === 'string'
    ? { pt: getSolution(solution)!.pt.label, en: getSolution(solution)!.en.label }
    : { pt: 'Esta solução', en: 'This solution' };
  return {
    fits: false,
    line: {
      pt: `${subject.pt} responde a ${list(hs.map(h => h.pt), 'e')}. Neste ponto os dados oficiais não marcam isso como alto — eles não cobrem tudo, então vale também o que vocês veem no lugar.`,
      en: `${subject.en} answers ${list(hs.map(h => h.en), 'and')}. At this point the official data does not mark that as high — it does not cover everything, so what you see on the ground counts too.`,
    },
  };
}

export interface FamiliaForHazard {
  id: NbsFamiliaId;
  label: Bilingual;
  /** This família's solutions that address the hazard: Forte first, then Média, catalogue order within. */
  solutionIds: string[];
}

export interface HazardSolutions {
  hazard: HazardKey;
  level: number;
  source?: string;
  /** "Calor aqui: ameaça muito alta (plano climático, 2050) → soluções de sombra e resfriamento." */
  line: Bilingual;
  /** Catalogue famílias with at least one solution that addresses it, by the família's own weight for the hazard. */
  familias: FamiliaForHazard[];
  /** Legacy explorer categories that answer it (the single-hazard one first, then multi_benefit). */
  legacyCategories: LegacyCategory[];
}

export interface SolutionsForReadings {
  /** One entry per HIGH hazard at the site, strongest first. Empty when none is high. */
  high: HazardSolutions[];
  /** Present only when `high` is empty: the sentence to say instead — never an all-clear. */
  none?: Bilingual;
}

/**
 * The famílias and legacy categories that address the site's high hazards
 * (level ≥ 3), strongest hazard first, each with its because line.
 */
export function solutionsForReadings(readings: HazardReading[] | null | undefined): SolutionsForReadings {
  const high = highReadings(readings).map((r): HazardSolutions => {
    const p = readingPhrase(r), a = ANSWER[r.hazard];
    const familias = NBS_FAMILIAS
      .map(f => {
        const mine = NBS_SOLUTIONS.filter(s => s.familiaId === f.id && addresses(strengthOf(s.id, r.hazard)));
        const solutionIds = [...mine.filter(s => strengthOf(s.id, r.hazard) === 'forte'), ...mine.filter(s => strengthOf(s.id, r.hazard) === 'media')].map(s => s.id);
        return { id: f.id as NbsFamiliaId, label: { pt: f.pt.label, en: f.en.label }, solutionIds, weight: (f.hazards as Record<HazardKey, number>)[r.hazard] ?? 0 };
      })
      .filter(f => f.solutionIds.length > 0)
      .sort((x, y) => y.weight - x.weight)
      .map(({ weight: _w, ...f }) => f);
    const legacyCategories = (Object.keys(LEGACY_CATEGORY_HAZARDS) as LegacyCategory[])
      .filter(c => LEGACY_CATEGORY_HAZARDS[c].includes(r.hazard))
      .sort((x, y) => LEGACY_CATEGORY_HAZARDS[x].length - LEGACY_CATEGORY_HAZARDS[y].length);
    return {
      hazard: r.hazard, level: r.level, source: r.source,
      line: { pt: `${p.pt} → ${a.pt}.`, en: `${p.en} → ${a.en}.` },
      familias, legacyCategories,
    };
  });
  return high.length ? { high } : { high, none: noHighHazardLine(readings) };
}
