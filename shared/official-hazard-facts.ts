// ============================================================================
// OFFICIAL HAZARD FACTS AT ONE POINT — what an organisation may be TOLD
// ============================================================================
// Stance (JVP, 11 Aug 2026, PR #470; restated 10 Nov 2026): anything an
// organisation SEES or HEARS about climate hazard rests on OFFICIAL data, so the
// accountability is the municipality's — PLAC/ARVC ameaça, SMAMUS facts (cotas
// do Guaíba, pontos de alagamento, erosão), SGB/CPRM sectors, IBGE.
//
// What it must NEVER be told is our own bairro index. The `_bairro_*_pct`
// numbers are within-city percentile ranks of the ARVC RISCO composite
// (scripts/sample-arvc-grid.py). They still drive INTERNAL ordering — família
// ranking, which worry chip comes first, `hazardsToCheck` — but no sentence an
// organisation reads may quote them ("o risco de enchente é alto no Floresta").
//
// This module is the shape of a fact that MAY be said: one hazard, one spoken
// clause in each language, and the official source it restates. The lookup that
// fills it lives server-side (server/services/officialHazardFacts.ts), because
// it reads the city's layers off disk. Pure types and phrasing here, so the
// site card, the read-back and the família copy all say a fact the same way.
// ============================================================================

import type { HazardKey } from './site-knowledge';

export type OfficialFactKind = 'sgb-setor' | 'cota-guaiba' | 'ponto-alagamento' | 'erosao';

export interface OfficialHazardFact {
  hazard: HazardKey;
  kind: OfficialFactKind;
  /** Spoken clause, starting lower-case: "o lugar fica dentro da cota de 4,00 m do Guaíba". */
  pt: string;
  en: string;
  /** The official source, short enough to sit in brackets after the line. */
  source: string;
}

/**
 * Most specific first: an SGB sector was walked by a geologist and is two or
 * three blocks wide; the Guaíba cota is a surveyed level line; a ponto de
 * alagamento is a recorded point, possibly a few hundred metres off; erosion
 * susceptibility is a municipal zoning.
 */
const KIND_ORDER: OfficialFactKind[] = ['sgb-setor', 'cota-guaiba', 'ponto-alagamento', 'erosao'];

export function sortOfficialFacts(facts: OfficialHazardFact[]): OfficialHazardFact[] {
  return facts.slice().sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/** The facts that speak to one hazard, most specific first. */
export function officialFactsFor(facts: OfficialHazardFact[] | undefined, hazard: HazardKey): OfficialHazardFact[] {
  return sortOfficialFacts((facts ?? []).filter(f => f.hazard === hazard));
}

/**
 * "O lugar fica dentro da cota de 4,00 m do Guaíba (SMAMUS, …)." — a sentence.
 * `withSource: false` when the source is rendered separately (the site card).
 */
export function officialFactSentence(f: OfficialHazardFact, lang: 'pt' | 'en', withSource = true): string {
  const clause = lang === 'pt' ? f.pt : f.en;
  return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}${withSource ? ` (${f.source})` : ''}.`;
}
