// ============================================================================
// WHERE EVERY COLLECTED FIELD ENDS UP — declared, and PROVED
// ============================================================================
// JVP, 2026-09-04:
//
//   "the context bundle should by design include all! stop missing them, make
//    it so that structurally it can't miss them"
//
// The failure that forced this: Encontro 3's eight extra questions each write a
// field — contributing_area_note, beneficiaries_note, opex_band,
// other_users_note, slope_exposure_note, prior_funding_note,
// institution_contact_note, outfall_note — and NOTHING READ ANY OF THEM. Not
// the concept note, not the dossier, not the roadmap, not the synergy facts,
// not the UI. An organisation was asked "quantas casas ficam com água?" — which
// that question's own `whyPt` calls the first question of any edital — it
// answered, we stored it, and every document ignored it.
//
// The cause is structural, not careless: `conceptNoteFacts()` is a HAND-WRITTEN
// allowlist. It is a good contract for what the note may assert, and a terrible
// one for what the note must not forget, because forgetting is its default.
// Every new field starts invisible and stays invisible until somebody
// remembers. Nobody remembered eight times.
//
// So every public field declares one of three destinies here, and a spec PROVES
// each one rather than trusting it:
//
//   feeds      → the generic renderer puts it on the page. Proof: set a
//                sentinel value, build the note, find the sentinel.
//   carriedBy  → a named fact already carries it, possibly transformed. Proof:
//                set a sentinel, build the facts, resolve the declared path,
//                assert it is populated.
//   declines   → deliberately not on the document, with the reason. The only
//                way a field may be invisible, and it costs a sentence.
//
// ⚠️ A `feeds` field reaches the page WITHOUT ANY EDIT to concept-note.ts.
// That is the whole point: the note is no longer a list somebody maintains.
// ============================================================================

import type { ConceptSectionId } from './concept-note';

export type FieldDestiny =
  | {
      /** The section of the concept note this answer belongs under. */
      feeds: ConceptSectionId;
      /** How it is introduced on the page. Third person — it is a document. */
      labelPt: string;
      labelEn: string;
      /** Values that mean "asked and not answered" and must not be printed. */
      skipIf?: RegExp;
    }
  | {
      /**
       * Already on the page through a named fact, in a form the generic
       * renderer would duplicate or mangle. The dotted path is checked.
       */
      carriedBy: string;
      /**
       * A valid value to prove the path with. Required for anything that is not
       * free text: an enum reaches the page through its written label, so an
       * arbitrary string resolves to nothing and the proof cannot run. Naming a
       * real id here also documents the field's shape where somebody will look.
       */
      probe?: string;
      /**
       * How the declaration is proved. A named fact is checked by resolving the
       * path; dedicated rendering code that never lands in `facts` is checked
       * the same way a `feeds` field is — set it, build the document, find it.
       */
      provenBy?: 'facts' | 'page';
      /**
       * Companion fields the rendering needs. Some answers do not stand alone —
       * the decisive detail is meaningless without the id of the question it
       * answered — and declaring that here both makes the proof runnable and
       * records the dependency where somebody will find it.
       */
      probeWith?: Record<string, string>;
      /**
       * What must then appear on the page. Needed when the stored value is not
       * the printed one — a JSON block is stored, and what a reader sees is one
       * answer inside a sentence.
       */
      probeExpect?: string;
    }
  | {
      /** Not for the document, and why. Declining is legitimate. */
      declines: string;
    };

/** Anything asked and not answered. Never printed as though it were an answer. */
const NO_ANSWER = /^(n[ãa]o sei|nao-sei|nenhuma|não informado|pular|skip|-|—)$/i;

export const FIELD_DESTINY: Record<string, FieldDestiny> = {
  // ── The eight that were collected and dropped ─────────────────────────────
  // Each was already worth asking; the `why` on every one of them argues its
  // own case, and every one of those arguments was wasted.
  contributing_area_note: {
    feeds: 'problema',
    labelPt: 'De onde vem a água que chega no lugar',
    labelEn: 'Where the water arriving at the site comes from',
    skipIf: NO_ANSWER,
  },
  outfall_note: {
    feeds: 'exige',
    labelPt: 'Para onde a água vai quando transborda',
    labelEn: 'Where the water goes when it overflows',
    skipIf: NO_ANSWER,
  },
  beneficiaries_note: {
    feeds: 'problema',
    labelPt: 'Quantas casas são atingidas',
    labelEn: 'How many households are affected',
    skipIf: NO_ANSWER,
  },
  opex_band: {
    feeds: 'manutencao',
    labelPt: 'Custo anual de manutenção, na estimativa da organização',
    labelEn: "Annual upkeep cost, as the organisation estimates it",
    skipIf: NO_ANSWER,
  },
  other_users_note: {
    feeds: 'exige',
    labelPt: 'Quem mais usa o lugar hoje',
    labelEn: 'Who else uses the place today',
    skipIf: NO_ANSWER,
  },
  slope_exposure_note: {
    feeds: 'problema',
    labelPt: 'Casas acima ou abaixo do barranco',
    labelEn: 'Houses above or below the slope',
    skipIf: NO_ANSWER,
  },
  prior_funding_note: {
    feeds: 'financiamento',
    labelPt: 'O que o financiamento anterior cobriu',
    labelEn: 'What the previous funding covered',
    skipIf: NO_ANSWER,
  },
  institution_contact_note: {
    feeds: 'exige',
    labelPt: 'Contato que a organização já tem na instituição',
    labelEn: 'The contact the organisation already has inside the institution',
    skipIf: NO_ANSWER,
  },

  // ── Asked in Encontro 3, and already argued on the page ────────────────────
  chosen_solutions: { carriedBy: 'solutions.0.id', probe: 'jardins-de-chuva' },
  site_area_m2: { carriedBy: 'place.areaM2', probe: '500' },
  intervention_units: { carriedBy: 'place.units', probe: '3' },
  justification_why_here: { carriedBy: 'problem.whyHere' },
  baseline_condition: { carriedBy: 'problem.baseline' },
  site_story: { carriedBy: 'problem.story' },
  site_worry: { carriedBy: 'problem.worry' },
  expected_impact: { carriedBy: 'solutions.0.benefit.claim' },
  construction_model: { carriedBy: 'delivery.buildModel', probe: 'mutirao' },
  project_timeframe: { carriedBy: 'delivery.timeframe', probe: '1-ano' },
  who_maintains: { carriedBy: 'delivery.maintainer', probe: 'parceria-prefeitura' },
  maintenance_frequency: { carriedBy: 'delivery.frequency', probe: 'trimestral' },
  sustainability_model: { carriedBy: 'delivery.recurringMoney', probe: 'edital' },
  monitoring_capacity: { carriedBy: 'delivery.monitoring', probe: 'parceiro' },
  bairro: { carriedBy: 'place.bairro' },
  site_name: { carriedBy: 'place.siteName' },
  land_tenure: { carriedBy: 'place.tenure', probe: 'public-informal' },
  current_use: { carriedBy: 'place.currentUse', probe: 'paved' },

  // ⚠️ The decisive detail the ficha names — soil, roof load, flow speed. It
  // already has a rendering, and a better one than the generic renderer could
  // give it: an authored sentence per question that puts the answer back beside
  // the question it answers, and beside the ficha threshold that makes it
  // matter. Declaring this `feeds` printed it twice, and the second copy read
  // "O que a organização observou no terreno: 'Dá pra atravessar'" — a chip
  // label with its question stripped off, which is worse than nothing on a page
  // a funder reads. See shared/w3-detail-questions.ts.
  detail_answer: {
    carriedBy: 'the authored note in §porque, which restates the question around the answer',
    provenBy: 'page',
    probe: 'Mais barro — a água empoça',
    probeWith: { detail_question_id: 'soil-type' },
  },

  // ⚠️ The dig round, as one field. Its questions are WRITTEN per organisation,
  // so their answers cannot each have a pre-declared field name — but the block
  // itself is declared, and the proof runs the same way: set it, build the
  // document, find the answer on the page. Each entry names the section it
  // belongs under and carries a third-person sentence to carry it there.
  // See shared/w3-dig.ts.
  dig_json: {
    carriedBy: 'the dig block, rendered into the section each answer declares',
    provenBy: 'page',
    probe: JSON.stringify([{
      id: 'dig-probe', round: 1,
      askPt: 'Quantas casas ficam com água?', askEn: 'How many houses get flooded?',
      notePt: 'O alagamento atinge {answer}, conforme o relato da organização.',
      noteEn: 'The flooding affects {answer}, as the organisation reports it.',
      feeds: 'problema', basedOn: 'site_story', answer: 'umas 8 casas do fundo',
    }]),
    probeExpect: 'O alagamento atinge umas 8 casas do fundo',
  },

  // The paired solution, if round 2 proposed one. It reaches the page only if
  // they TAKE it — and then it is a chosen solution like any other, with its own
  // route and its own cost. The proposal itself is a thing we said in the room.
  dig_pairing_json: { declines: 'a suggestion made in the workshop — if they took it, it is in chosen_solutions and priced; if they did not, a document that records what we proposed and they declined is a document about us' },

  who_pays_today: {
    feeds: 'manutencao',
    labelPt: 'Quem paga as contas do lugar hoje',
    labelEn: 'Who pays for the place today',
    skipIf: NO_ANSWER,
  },

  // ── Encontro 1: the organisation itself ───────────────────────────────────
  org_name: { carriedBy: 'org.name' },
  contact_name: { carriedBy: 'org.contact' },
  contact_role: { carriedBy: 'org.contactRole' },
  mission_summary: { carriedBy: 'org.mission' },
  main_activities: { carriedBy: 'org.activities' },
  legal_form: { carriedBy: 'org.legalStatus', probe: 'ngo' },
  groups_served: { carriedBy: 'org.groupsServed' },
  nbs_experience: { carriedBy: 'org.nbsExperience' },
  paid_vs_volunteer: { carriedBy: 'org.volunteerBase' },
  team_size: { carriedBy: 'org.teamSize' },
  year_founded: { carriedBy: 'org.yearsPresent', probe: '2010' },
  funding_history: { carriedBy: 'org.fundedBefore', probe: 'yes' },
  biggest_project_budget: { carriedBy: 'org.largestBudget' },

  // Already in the organisation paragraph, appended to nbs_experience — the
  // generic renderer printed the same sentence twice.
  // ⚠️ Only reaches the page when nbs_experience is set — it is appended to it,
  // never rendered alone. Same companion dependency as detail_answer, declared
  // for the same reason: it makes the proof runnable and records the
  // dependency where somebody will look for it.
  nbs_experience_detail: { carriedBy: 'org.nbsExperience', probeWith: { nbs_experience: 'sim' } },
  proud_moment: {
    feeds: 'organizacao',
    labelPt: 'O que a organização conta como sua maior realização',
    labelEn: 'What the organisation names as its proudest achievement',
    skipIf: NO_ANSWER,
  },
  bairro_of_operation: {
    feeds: 'organizacao',
    labelPt: 'Onde a organização atua',
    labelEn: 'Where the organisation works',
    skipIf: NO_ANSWER,
  },
  funded_project_count: {
    feeds: 'organizacao',
    labelPt: 'Projetos financiados já executados',
    labelEn: 'Funded projects already delivered',
    skipIf: NO_ANSWER,
  },
  community_anchoring_lead: {
    feeds: 'organizacao',
    labelPt: 'Quem carrega este projeto na organização',
    labelEn: 'Who carries this project inside the organisation',
    skipIf: NO_ANSWER,
  },

  // ⚠️ Declared `feeds` first, and the concept-note spec caught it within the
  // hour: the page already says "com CNPJ" in the organisation line, and the
  // generic renderer added **CNPJ:** "Sim, temos CNPJ" underneath — a chip
  // label, quoted, on a nota técnica. "A chip is an answer; a document states a
  // fact" is a rule this repo already had, and the generic renderer is exactly
  // the thing that can break it at scale.
  has_cnpj: { carriedBy: 'org.legalStatus', probe: 'sim' },
  prior_project_scale: { carriedBy: 'org.fundedBefore', probe: 'funded' },

  // ── Found by the runtime marker, not the scanner ──────────────────────────
  // ⚠️ These three are written through a HELPER that returns a record, not a
  // `writeFields({ … })` literal, so the static scan never saw them. That is the
  // scanner's honest limit and the reason the runtime warning exists beside it:
  // one covers what can be read from source, the other covers what actually
  // happens. Both are needed, and neither alone would have found these.
  role_preference: {
    feeds: 'organizacao',
    labelPt: 'O papel que a organização quer ter no projeto',
    labelEn: 'The role the organisation wants in the project',
    skipIf: NO_ANSWER,
  },
  bairro_priority: { declines: 'our own priority score for the bairro, used to order a list on our side — a document that argues for this project does not carry our ranking of it' },
  site_photo_intent: { declines: 'which photographs we asked them for, so the upload prompt knows what it is expecting — a fact about our request, not about their place' },

  // ── Deliberately not on the document ──────────────────────────────────────
  site_lat: { declines: 'a coordinate is not prose; the place reaches the page as its name and bairro, and the map as a figure' },
  site_lng: { declines: 'a coordinate is not prose, and the pair is already a figure on the map — printing the longitude tells a reader nothing the map does not' },
  site_area_source: { declines: 'HOW the area was obtained qualifies the figure and is already said in the sentence that states it ("por comparação, não por medida")' },
  baseline_source: { declines: 'provenance of a draft, used to decide whether to quote or paraphrase — the reader sees the result, not the bookkeeping' },
  justification_source: { declines: 'provenance of the draft behind "por que aqui" — used to decide whether to quote or paraphrase, and the reader sees the result rather than the bookkeeping' },
  // ⚠️ Not on the page, and not droppable either: it selects WHICH authored
  // sentence restates detail_answer. Losing it makes the answer unrenderable,
  // which is why the destiny of detail_answer names it as a companion.
  detail_question_id: { declines: 'the id of the question asked — it is the key that selects the authored sentence for detail_answer, never a fact about the project' },
  intervention_scale_band: { declines: 'a derived band, recomputed by the sizing code on every build — storing it on the page would let paper and screen disagree' },
  project_verdict: { carriedBy: 'verdict', probe: 'needs_study' },
  project_capacity_grade: { declines: 'a grade about the organisation, for the coordination — a document that argues FOR them does not carry our score of them' },
  expected_impact_reaction: { declines: 'whether they found the figure plausible steers the maturity score and the coordinator roster; the figure itself is what a funder reads' },
  site_knowledge_depth: { declines: 'our read of how well we know the place, used to route questions — not a fact about the project' },
  nbs_interest: { declines: 'the Encontro 2 família picks, superseded on the page by the solution they actually chose' },
  bairro_population: { carriedBy: 'territory.population', probe: '5000' },
  bairro_poverty_pct: { carriedBy: 'territory.povertyPct', probe: '31.2' },
};

export type DestinyState = 'feeds' | 'carriedBy' | 'declines';

export function destinyOf(field: string): FieldDestiny | null {
  return FIELD_DESTINY[field] ?? null;
}

export function stateOf(d: FieldDestiny): DestinyState {
  return 'feeds' in d ? 'feeds' : 'carriedBy' in d ? 'carriedBy' : 'declines';
}

/** Fields the generic renderer places on the page, in declaration order. */
export function fieldsFeeding(section: ConceptSectionId): Array<[string, Extract<FieldDestiny, { feeds: ConceptSectionId }>]> {
  return Object.entries(FIELD_DESTINY).filter(
    (e): e is [string, Extract<FieldDestiny, { feeds: ConceptSectionId }>] =>
      'feeds' in e[1] && e[1].feeds === section,
  );
}

/**
 * ⚠️ Runtime half of the guarantee. A field written with no declared destiny is
 * a field on its way to being forgotten, and the write funnel says so out loud
 * — the same treatment a timed-out model pass gets, for the same reason: the
 * failure is invisible otherwise.
 */
export const FIELD_ORPHAN_MARKER = '[field-orphan]';

export function warnIfOrphan(sectionId: string, field: string): void {
  if (field.startsWith('_')) return; // internal machinery, never on a page
  if (FIELD_DESTINY[field]) return;
  console.warn(
    `⚠️ ${FIELD_ORPHAN_MARKER} ${sectionId}.${field} was written and has no declared destiny — ` +
      `it will not reach the concept note. Declare it in shared/field-destiny.ts (feeds / carriedBy / declines).`,
  );
}
