// ============================================================================
// WHAT EVERY MODEL PASS IS ALLOWED TO FORGET — and what it has to declare
// ============================================================================
// JVP, 2026-09-03:
//
//   "every time we are either creating a concept note or creating the synergy
//    report or trying to parse what the community has shared in order to
//    process it with an LM, we should always try to use as much context as
//    possible. They have shared it — images, files, data, all the fields. The
//    main idea is not just to get verbatim what they share. It's to help them
//    process what they know into something useful, as a consultant."
//
// The failure this file exists to end is not a bug. It is a SILENCE: a pass
// that never consumes a source nobody remembered it could have. Silence leaves
// no stack trace, no failing test and no angry user — the output is merely
// thinner than it could have been, and thinner in a way only someone holding
// the whole record can see. Four of five passes were in that state when this
// was written, including the one whose job is to find what a cohort has in
// common.
//
// So: DECLINING A SOURCE IS LEGITIMATE. FORGETTING ONE IS NOT.
//
// Every (pass × source) pair carries one of three states, and the test in
// e2e/context-first.spec.ts fails on any pair that carries none. Adding a
// source to the catalogue below therefore forces every pass to say something
// about it — which is the whole mechanism.
//
// See docs/context-first.md.
// ============================================================================

/** Everything an organisation has given us, or that we hold about it. */
export const CONTEXT_SOURCES = {
  fields: 'the structured record — every field of every section',
  ownWords: 'their own sentences, verbatim: site_story, why here, the baseline',
  transcript: 'the chat itself — what they said that no field captured',
  docSummary: 'the 280-character summary of an uploaded document',
  docFullText: 'the full extracted text of an uploaded document',
  photos: 'the site photographs they walked out and took',
  geo: 'the map layer: coordinates, drawn footprint, bairro risk percentiles',
  fichas: 'the 27 solution fichas — mechanism, cost, approvals, upkeep',
  evidence: 'the benefit figures and the scale reference volumes',
  knowledge: 'the knowledge slice: approval routes and their timings, and the funding landscape from the 26 Aug workshop',
  cohort: 'what the other organisations in this cohort are doing',
  artefacts: 'what earlier passes produced — the dossier, roadmap, concept note',
} as const;

export type ContextSource = keyof typeof CONTEXT_SOURCES;

export type SourceUse =
  /** Consumed by this pass today. */
  | { state: 'uses' }
  /**
   * Deliberately not consumed, with the reason. A refusal is a design
   * decision and reads as one; the reason is what makes it reviewable.
   */
  | { state: 'declines'; because: string }
  /**
   * Should be consumed and is not. Named, so it is a backlog item rather than
   * a silence — and so the count is visible every time the suite runs.
   */
  | { state: 'missing'; because: string };

export interface ModelPass {
  id: string;
  /** What it is for, in one line. */
  purpose: string;
  file: string;
  sources: Record<ContextSource, SourceUse>;
}

const uses: SourceUse = { state: 'uses' };
/** The city path has no organisation in it — nobody speaks, uploads or photographs. */
const CITY_SIDE: SourceUse = {
  state: 'declines',
  because: 'the city flow has no community organisation in it: nobody speaks, uploads a document or photographs a site, so this source does not exist on that path',
};
const no = (because: string): SourceUse => ({ state: 'declines', because });
const gap = (because: string): SourceUse => ({ state: 'missing', because });

/**
 * ⚠️ Filled from a real audit on 2026-09-03, not from intent. Where a row says
 * `missing`, the pass genuinely does not read that source today.
 */
export const MODEL_PASSES: ModelPass[] = [
  {
    id: 'w3Advisor',
    purpose: 'reads everything an organisation has ever told us, and proposes drafts, questions and a shortlist',
    file: 'server/services/w3Advisor.ts',
    sources: {
      fields: uses,
      ownWords: uses,
      transcript: uses,
      docSummary: uses,
      docFullText: uses,
      photos: uses,
      geo: uses,
      fichas: uses,
      evidence: no('it selects and observes; it never produces a number — the benefit figures are computed'),
      knowledge: gap('the approval routes with their timings, and the funding landscape, would sharpen its observations about what a project needs and what it could realistically apply to'),
      cohort: gap('`cohort: []` is passed deliberately — the one input that leaves this org’s own record, held back for its own review. Three other organisations needing the same infiltration test is advice no single org can reach.'),
      artefacts: no('it runs BEFORE the dossier and the note exist'),
    },
  },
  {
    id: 'familiaRanker',
    purpose: 'ranks the NBS famílias for a site, in Encontro 2',
    file: 'server/services/familiaRanker.ts',
    sources: {
      fields: uses,
      ownWords: uses,
      transcript: gap('the org often describes the place in chat before any field captures it'),
      docSummary: gap('a Teia Sprint proposal names what they already want to build'),
      docFullText: gap('same, and the advisor already reads it — this pass runs earlier and sees less'),
      photos: uses,
      geo: uses,
      fichas: uses,
      evidence: no('it ranks famílias, not solutions; no figure applies yet'),
      knowledge: no('approval routes do not bear on which família fits a site'),
      cohort: no('a ranking that depended on the cohort would move under an organisation for reasons it cannot see'),
      artefacts: no('nothing has been produced yet at Encontro 2'),
    },
  },
  {
    id: 'conceptNoteAuthor',
    purpose: 'writes three sections of the concept note',
    file: 'server/services/conceptNoteAuthor.ts',
    sources: {
      fields: uses,
      ownWords: uses,
      geo: uses,
      fichas: uses,
      evidence: uses,
      knowledge: uses,
      // ⚠️ The rule that keeps this pass auditable, stated as a refusal.
      transcript: no('it receives the FACT BASE and never raw state — a fact absent from conceptNoteFacts() cannot reach the page, which is what stops an invented figure in a funder document'),
      docSummary: gap('should reach it as a sourced OBSERVATION in the fact base, not as raw text'),
      docFullText: gap('same: pre-digested into observations carrying "proposta Teia, p.3", so the writing pass still sees only facts'),
      photos: gap('the richest thing they sent — they walked the site and photographed it — and it informs the W2 ranking and nothing else. Pre-digest into observations with "foto 02" as the source.'),
      cohort: gap('“três outras organizações da rede precisam do mesmo estudo” belongs in a funder document and is the programme’s whole argument'),
      artefacts: uses,
    },
  },
  {
    id: 'synergyReport',
    purpose: 'finds what a cohort has in common and where organisations should be introduced',
    file: 'server/services/synergyReport.ts',
    sources: {
      fields: uses,
      ownWords: uses,
      geo: uses,
      fichas: uses,
      cohort: uses,
      docSummary: uses,
      transcript: no('eighteen transcripts is not a context that fits, and the fields plus their own words carry the substance'),
      evidence: no('it groups organisations; it states no impact figure'),
      // ⚠️ The three that make this pass thinner than the record it reads.
      docFullText: gap('it reads the 280-character SUMMARY where the advisor reads the whole document. A Teia Sprint proposal is exactly the artefact that shows two organisations proposing the same thing.'),
      photos: gap('two organisations photographing the same kind of failing wall is a synergy no field expresses'),
      knowledge: gap('shared approval routes are the most poolable thing in the cohort — same Termo de Adoção, same 30-day analysis, one conversation'),
      artefacts: gap('⚠️ JVP’s own hypothesis, confirmed: the concept notes never reach this pass. Section 7’s approval routes and section 5’s argument are precisely the pooling material, and SynergyMember has no field for either.'),
    },
  },
  {
    id: 'impactModelService',
    purpose: 'the legacy city-side impact model',
    file: 'server/services/impactModelService.ts',
    sources: {
      fields: uses,
      geo: uses,
      // ⚠️ Written as "same" five times over on the first pass, which the
      // declaration test rejected — and rightly. A reason repeated by reference
      // is a silence with better manners; a reader six months from now has to
      // be able to disagree with each one on its own.
      ownWords: CITY_SIDE,
      transcript: CITY_SIDE,
      docSummary: CITY_SIDE,
      docFullText: CITY_SIDE,
      photos: CITY_SIDE,
      fichas: no('it predates the ficha catalogue and prices from its own tables; wiring the fichas in would be a rewrite, not a context fix'),
      evidence: no('it carries its own impact figures, from the city model rather than from the community evidence base'),
      knowledge: no('the approval routes are for a community organisation asking a municipality; a municipality does not ask itself'),
      cohort: no('there is no cohort on the city path — one city, one plan, no peers to be introduced to'),
      artefacts: no('the CBO artefacts belong to organisations this flow never sees'),
    },
  },
];

/** Every pair a pass has not decided about. The test fails on any of these. */
export function undeclaredPairs(): Array<{ pass: string; source: ContextSource }> {
  const out: Array<{ pass: string; source: ContextSource }> = [];
  for (const p of MODEL_PASSES) {
    for (const source of Object.keys(CONTEXT_SOURCES) as ContextSource[]) {
      if (!p.sources[source]) out.push({ pass: p.id, source });
    }
  }
  return out;
}

/** The named gaps, worst pass first. Reported on every run, never fatal. */
export function contextGaps(): Array<{ pass: string; source: ContextSource; because: string }> {
  return MODEL_PASSES.flatMap(p =>
    (Object.entries(p.sources) as Array<[ContextSource, SourceUse]>)
      .filter(([, u]) => u.state === 'missing')
      .map(([source, u]) => ({ pass: p.id, source, because: (u as { because: string }).because })),
  );
}
