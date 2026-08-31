import { z } from 'zod';
import type { Dossier as W3Dossier } from './w3-dossier';
import type { Roadmap as W3Roadmap } from './w3-roadmap';
import type { OpenMapParams } from './concept-note-schema';

// ============================================================================
// CBO INTERVENTION PROFILE — 5 sections aligned to COUGAR NBS Mapping Criteria
// ============================================================================

export const CBO_SECTIONS = [
  { id: 'org_profile', title: '1. Who We Are', phase: 1, maturityMetrics: ['org_delivery_capacity', 'team_technical_experience'] },
  { id: 'intervention_site', title: '2. Where We Work', phase: 2, maturityMetrics: ['site_control', 'community_anchoring'] },
  { id: 'intervention_type', title: '3a. What We\'re Building', phase: 3, subPhase: 'a', maturityMetrics: ['problem_clarity', 'solution_clarity'] },
  { id: 'impact_monitoring', title: '3b. Expected Impact', phase: 3, subPhase: 'b', maturityMetrics: ['climate_nbs_impact'] },
  { id: 'operations_sustain', title: '3c. Operations & Sustainability', phase: 3, subPhase: 'c', maturityMetrics: ['financial_thinking'] },
  { id: 'needs_assessment', title: '4. What We Need', phase: 4, maturityMetrics: ['regulatory_awareness'] },
  { id: 'results_evidence', title: '5. Results & Evidence', phase: 5, maturityMetrics: [] },
] as const;

export type CboSectionId = typeof CBO_SECTIONS[number]['id'];
export const ALL_CBO_SECTION_IDS = CBO_SECTIONS.map(s => s.id);

// Phase → the maturity metrics the agent must score before that phase is
// "complete" (and the next-workshop banner may appear). Derived ONCE from
// CBO_SECTIONS so the server validation, the phase-advance gate, and the
// client banner can never drift. Previously this lived as a hand-maintained
// literal in cbo-profile.tsx with a "keep in sync" comment — it didn't.
export const PHASE_COMPLETION_METRICS: Record<number, string[]> = (() => {
  const map: Record<number, string[]> = {};
  for (const sec of CBO_SECTIONS) {
    const bucket = (map[sec.phase] ??= []);
    for (const m of sec.maturityMetrics) {
      if (!bucket.includes(m)) bucket.push(m);
    }
  }
  return map;
})();

/** A field counts as "filled" when it holds a real value (non-null, non-empty). */
export function cboFieldIsFilled(f?: CboFieldState): boolean {
  if (!f) return false;
  const v = f.value;
  if (v == null) return false;
  return typeof v === 'string' ? v.trim().length > 0 : true;
}

/**
 * Whether a section has real work in it: at least one filled field the ORG
 * provided. Invite-prefilled values (source:'invite' — the org name / bairro the
 * ORCHESTRATOR typed at invite time) don't count; they aren't the org's work.
 *
 * This is THE definition of "filled" for a section. The server's snapshot
 * (syncMemberSnapshot) and the shared phaseComplete() both use it; the client's
 * "X/7 seções" progress readout must too, or the CBO's count and the
 * coordinator's roster disagree — the CBO saw 1/7 at turn 0 (org_profile,
 * invite-prefilled) while the coordinator derived 0/7.
 */
export function cboSectionIsFilled(
  section?: { fields?: Record<string, CboFieldState> },
): boolean {
  const fields = section?.fields ?? {};
  return Object.values(fields).some(f => cboFieldIsFilled(f) && f?.source !== 'invite');
}

/** How many of the 7 sections have real (non-invite) work. One source of truth. */
export function cboSectionsFilledCount(
  state: Pick<CboState, 'sections'>,
): number {
  return CBO_SECTIONS.filter(sec =>
    cboSectionIsFilled(state.sections?.[sec.id as keyof CboState['sections']]),
  ).length;
}

/**
 * Phases whose skill GUARANTEES its maturity scores at the encontro's close.
 * For these, the scores ARE the completion signal and the section-fill
 * fallback below must not apply — it is far too weak. Phase 1 has exactly one
 * section (org_profile), so the fallback's every() collapsed to some(): the
 * agent's very first update_section (contact_name) marked Encontro 1 complete
 * and fired the "Começar Encontro 2" banner one exchange into the interview
 * (docs/audit-e1-first-turn-2026-07-10.md §3). encontro-1.md:220 mandates both
 * score_maturity calls at the E1 close, and the score_maturity validator
 * already tells the model "the next-workshop banner only appears when the
 * phase's metrics are scored" — this makes that sentence true.
 *
 * NOT in the set: phase 2 (encontro-2.md:81 explicitly DEFERS scoring — the
 * fallback exists for it) and phases 3-5 (no skill files yet; their scoring
 * behavior is unverified, so their gate is left untouched).
 */
const PHASES_SCORED_AT_CLOSE = new Set([1]);

/**
 * Whether a phase's work is done — the single forward-progress predicate used by
 * the next-workshop advance banner (and available to the server phase gate).
 * A phase is complete when EITHER signal holds:
 *   (a) every maturity metric for the phase is scored (the legacy signal — still
 *       true for phases that DO score), OR
 *   (b) every section belonging to the phase has at least one filled field —
 *       UNLESS the phase is in PHASES_SCORED_AT_CLOSE, where (a) is the contract.
 * (b) is what unblocks Encontro 2, whose skill intentionally DEFERS its two
 * maturity scores (site_control / community_anchoring) — so (a) is never
 * satisfiable there and the advance banner used to dead-end with no way forward.
 */
export function phaseComplete(
  state: Pick<CboState, 'sections' | 'maturityScores'>,
  phase: number,
): boolean {
  const sections = CBO_SECTIONS.filter(s => s.phase === phase);
  if (sections.length === 0) return true;

  const required = PHASE_COMPLETION_METRICS[phase] ?? [];
  if (required.length > 0) {
    const scored = new Set((state.maturityScores ?? []).map(s => s.metric));
    if (required.every(m => scored.has(m))) return true;
    // The skill scores these at the encontro's close — until it does, the
    // phase is not complete, no matter how many fields are filled.
    if (PHASES_SCORED_AT_CLOSE.has(phase)) return false;
  }

  // Invite-prefilled values don't count — see cboSectionIsFilled. Counting them
  // made phase 1 "complete" at turn 0 for every invited org, firing the green
  // "Começar Encontro 2" banner mid-interview.
  return sections.every(sec =>
    cboSectionIsFilled(state.sections?.[sec.id as keyof CboState['sections']]),
  );
}

// Maturity scores (0-3 per COUGAR NBS Mapping Criteria)
export interface MaturityScore {
  metric: string;
  score: 0 | 1 | 2 | 3;
  justification: string;
}

export interface PriorityFlag {
  flag: string;
  met: boolean;
  notes?: string;
}

export type Confidence = 'high' | 'medium' | 'low' | 'empty';

export interface CboFieldState {
  value: string | number | null;
  confidence: Confidence;
  source?: string;
  userEdited: boolean;
}

/** E2 checkpoint helper fields ("_"-prefixed): persisted so the linear flow
 *  can derive its step and build the site card / recommendation, but hidden
 *  from every human-facing field render (CBO document panel, coordinator
 *  profile summary) — a raw "_bairro_flood_pct: 82" row is machine state,
 *  not an answer. */
export const isInternalCboField = (field: string) => field.startsWith('_');

export interface CboSectionState {
  id: CboSectionId;
  title: string;
  phase: number;
  fields: Record<string, CboFieldState>;
  confidence: Confidence;
  sources: string[];
  lastUpdatedBy: 'agent' | 'user' | null;
}

export interface CboGapEntry {
  sectionId: CboSectionId;
  field: string;
  reason: string;
  severity: 'critical' | 'important' | 'minor';
}

export interface CboState {
  id: string;
  orgName: string;
  city: string;
  phase: number;
  sections: Record<CboSectionId, CboSectionState>;
  // Crawl-trust gate (field report 2026-07: extracted values were filled with
  // no validation, "sometimes asks for validation sometimes doesn't"). Doc-
  // sourced FREE-TEXT extractions land here instead of the section; the
  // confirm_doc_fields tool commits them only after the user confirmed the
  // recap in chat (enum fields keep their canonicalize-or-reject guard and
  // commit directly). Keyed `${sectionId}.${field}`.
  stagedDocFields?: Record<string, { sectionId: CboSectionId; field: string; value: string; confidence: Confidence; stagedAtUserTurns: number }>;
  gaps: CboGapEntry[];
  maturityScores: MaturityScore[];
  priorityFlags: PriorityFlag[];
  totalMaturityScore: number; // out of 27
  // The right-panel tool the agent has opened for this phase (map / type selector).
  // Persisted so the tool stays reachable across reloads — the panel isn't gated
  // behind a one-shot agent button. Cleared/superseded as the task completes.
  //
  // `tourIdx` is the E2 hazard tour's position (0=flood, 1=heat, 2=landslide,
  // 3=done). It lives HERE, next to {kind}, because "where the user is inside
  // the open tool" is one fact and needs one home: React state loses it on
  // reload, and localStorage loses it on a device switch (the token link is
  // meant to resume anywhere — see docs/cbo-chat-composers.md rule 5).
  activeTool?: { kind: 'map' | 'interventions'; tourIdx?: number } | null;
  editLog: Array<{ timestamp: string; sectionId: string; field: string; oldValue: any; newValue: any; source: 'agent' | 'user' }>;
  uploadedFiles: Array<{ name: string; path: string; parsedAt: string; summary: string }>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    sessionId?: string;
    // Sticky session language, set once (first explicit pick / first-message
    // detection) and never auto-flipped mid-session. Drives BOTH chat and
    // update_section content so the document isn't half-EN/half-PT.
    language?: 'pt' | 'en';
  };
}

// NBS intervention types available in the selector micro-app
// Each type has EN fields at the top level and a `pt` object with Portuguese translations
export const NBS_INTERVENTION_TYPES = [
  { id: 'bioswales-rain-gardens', label: 'Bioswales & Rain Gardens', emoji: '🌿', primaryBenefit: 'adaptation', knowledgeFile: 'bioswales-rain-gardens.md',
    description: 'Channels and planted areas that filter rainwater naturally',
    example: 'Rain garden in a park, bioswale along a street',
    pt: { label: 'Biovaletas e Jardins de Chuva', description: 'Canais e áreas plantadas que filtram a água da chuva naturalmente', example: 'Jardim de chuva em um parque, biovaleta ao longo de uma rua' },
    caseStudy: {
      city: 'Portland, USA', project: 'Bioretention Rain Garden', image: '/assets/interventions/bioswales.jpg',
      outcome: 'Bioswales reduce stormwater runoff by 65% and remove 85-95% of sediment. 78% cheaper than grey infrastructure.',
      outcomePt: 'Biovaletas reduzem o escoamento de água da chuva em 65% e removem 85-95% dos sedimentos. 78% mais baratas que infraestrutura cinza.',
      cost: 'R$ 350-1.400/m²', timeline: '2-6 months design + 2-8 weeks construction', timelinePt: '2-6 meses de projeto + 2-8 semanas de construção',
      photoCredit: 'EmilyBlueGreen, CC BY-SA 3.0',
    } },
  { id: 'flood-parks', label: 'Flood Parks', emoji: '🌊', primaryBenefit: 'adaptation', knowledgeFile: 'flood-parks.md',
    description: 'Parks that absorb floodwater and serve the community',
    example: 'Praça that becomes a retention pond during rain',
    pt: { label: 'Parques de Retenção de Cheias', description: 'Parques que absorvem enchentes e servem à comunidade', example: 'Praça que vira lagoa de retenção durante a chuva' },
    caseStudy: {
      city: 'Curitiba, PR', project: 'Parque Barigui', image: '/assets/interventions/flood-parks.jpg',
      outcome: '5% cheaper than concrete canals. 52 m² green space per capita. Significant flood reduction in protected areas.',
      outcomePt: '5% mais barato que canais de concreto. 52 m² de área verde por habitante. Redução significativa de enchentes nas áreas protegidas.',
      cost: 'Investimento público + incentivos fiscais', timeline: 'Multi-year (park network since 1996)', timelinePt: 'Multi-ano (rede de parques desde 1996)',
      photoCredit: 'Agrinaldo Caires Fonseca, CC BY-SA 3.0',
    } },
  { id: 'green-corridors', label: 'Green Corridors', emoji: '🌳', primaryBenefit: 'both', knowledgeFile: 'green-corridors.md',
    description: 'Linear green spaces connecting neighborhoods and ecosystems',
    example: 'Tree-lined avenue, riverside walking path with native plants',
    pt: { label: 'Corredores Verdes', description: 'Espaços verdes lineares conectando bairros e ecossistemas', example: 'Avenida arborizada, caminhada à beira-rio com plantas nativas' },
    caseStudy: {
      city: 'Recife, PE', project: 'Parque Capibaribe', image: '/assets/interventions/green-corridors.jpg',
      outcome: '60 ha of riverbank recovered. Controlled flooding sectors reduce damage. Catalyzed private investment nearby.',
      outcomePt: '60 ha de margem de rio recuperados. Setores de inundação controlada reduzem danos. Catalisou investimento privado no entorno.',
      cost: 'Municipal + cooperação internacional', timeline: 'Phased — pilot filtering garden first, then scaling', timelinePt: 'Faseado — jardim filtrante piloto primeiro, depois escala',
      photoCredit: 'Lais Castro, CC BY-SA 3.0',
    } },
  { id: 'green-roofs-walls', label: 'Green Roofs & Walls', emoji: '🏗️', primaryBenefit: 'both', knowledgeFile: 'green-roofs-walls.md',
    description: 'Vegetation on rooftops and building facades for cooling and insulation',
    example: 'Garden on a school roof, vertical garden on a community center',
    pt: { label: 'Telhados e Paredes Verdes', description: 'Vegetação em telhados e fachadas para resfriamento e isolamento', example: 'Horta no telhado de uma escola, jardim vertical em centro comunitário' },
    caseStudy: {
      city: 'São Paulo, SP', project: 'Fundação Cásper Líbero', image: '/assets/interventions/green-roofs.jpg',
      outcome: '600 m² rooftop garden on Av. Paulista. Green roofs reduce flooding, cool buildings by 1-3°C, and cut energy use.',
      outcomePt: 'Jardim de 600 m² no telhado na Av. Paulista. Telhados verdes reduzem enchentes, resfriam edifícios em 1-3°C e diminuem consumo de energia.',
      cost: 'R$ 600-1.800/m²', timeline: '1-3 months installation', timelinePt: '1-3 meses de instalação',
      photoCredit: 'Joalpe, CC BY-SA 4.0',
    } },
  { id: 'urban-forests', label: 'Urban Forests', emoji: '🌲', primaryBenefit: 'both', knowledgeFile: 'urban-forests.md',
    description: 'Tree planting to cool neighborhoods, clean air, and absorb water',
    example: 'Reforestation of a hillside, street tree program, community orchard',
    pt: { label: 'Florestas Urbanas', description: 'Plantio de árvores para resfriar bairros, limpar o ar e absorver água', example: 'Reflorestamento de encosta, programa de arborização, pomar comunitário' },
    caseStudy: {
      city: 'Porto Alegre, RS', project: 'Rua Gonçalo de Carvalho', image: '/assets/interventions/urban-forests.jpg',
      outcome: '100+ Tipuana trees planted in 1930s. Declared Environmental Heritage of Latin America. Full canopy tunnel over 3 blocks.',
      outcomePt: '100+ Tipuanas plantadas nos anos 1930. Declarada Patrimônio Ambiental da América Latina. Túnel de copa em 3 quarteirões.',
      cost: 'Baixo — árvores maduras, manutenção municipal', timeline: 'Decades of growth — new plantings take 10-20 years for canopy', timelinePt: 'Décadas de crescimento — novos plantios levam 10-20 anos para copa',
      photoCredit: 'Amigos da Rua Gonçalo de Carvalho, CC BY-SA 3.0',
    } },
  { id: 'wetland-restoration', label: 'Wetland Restoration', emoji: '🌾', primaryBenefit: 'adaptation', knowledgeFile: 'wetland-restoration.md',
    description: 'Restoring natural water areas for filtration, flood control, and habitat',
    example: 'Recovering a degraded stream or várzea area',
    pt: { label: 'Restauração de Áreas Úmidas', description: 'Restauração de áreas naturais de água para filtragem, controle de enchentes e habitat', example: 'Recuperação de um arroio degradado ou área de várzea' },
    caseStudy: {
      city: 'Belo Horizonte, MG', project: 'DRENURBS — Parque Primeiro de Maio', image: '/assets/interventions/wetland-restoration.jpg',
      outcome: 'Green-blue infra proved more resilient than canalization during 2020 floods. IDB-financed. Recreation + biodiversity.',
      outcomePt: 'Infraestrutura verde-azul se mostrou mais resiliente que canalização durante enchentes de 2020. Financiado pelo BID. Recreação + biodiversidade.',
      cost: 'Empréstimo BID + orçamento municipal', timeline: 'Multi-phase since 2003 (Córrego do Onça sub-basin)', timelinePt: 'Multi-fase desde 2003 (sub-bacia do Córrego do Onça)',
      photoCredit: 'Marcio Adauto Dutra, CC BY 3.0',
    } },
] as const;

// Helper to get localized NBS type fields
export function getLocalizedNbsType(type: typeof NBS_INTERVENTION_TYPES[number], lang: string) {
  const isPt = lang === 'pt';
  return {
    ...type,
    label: isPt ? type.pt.label : type.label,
    description: isPt ? type.pt.description : type.description,
    example: isPt ? type.pt.example : type.example,
    caseStudy: {
      ...type.caseStudy,
      outcome: isPt ? type.caseStudy.outcomePt : type.caseStudy.outcome,
      timeline: isPt ? type.caseStudy.timelinePt : type.caseStudy.timeline,
    },
  };
}

export type NbsInterventionTypeId = typeof NBS_INTERVENTION_TYPES[number]['id'];

// Params for the NBS Solution Selector micro-app (two-level: família → variante,
// catalog in shared/nbs-catalog.ts). The agent recommends at the FAMÍLIA level;
// the organization picks the variant.
export interface OpenInterventionSelectorParams {
  prompt: string;
  preSelectedType?: NbsInterventionTypeId;
  showCaseStudies?: boolean;
  multiSelect?: boolean; // allow selecting multiple solutions (e.g., wetland + bioswales combo)
  siteHazards?: { flood: number; heat: number; landslide: number }; // from Phase 2 to highlight relevant famílias
  recommendedTypes?: NbsInterventionTypeId[]; // legacy: ordered type recommendations (mapped to famílias)
  recommendedFamilias?: string[]; // ordered NbsFamiliaId[] — preferred over recommendedTypes
  maxRecommendations?: number; // max famílias to badge as "Recommended" (default: 2)
}

// Result returned when user confirms selection in the micro-app
export interface InterventionSelectorResult {
  interventionTypes: NbsInterventionTypeId[]; // mapped deep-content types (may be empty for agricultura/encostas variants)
  labels: string[];
  primaryBenefits: string[];
  knowledgeFiles: string[];
  // Two-level catalog fields (shared/nbs-catalog.ts)
  solutionIds?: string[];
  familias?: string[]; // localized labels of the chosen variants' famílias
  // Legacy single-select fields for backwards compat
  interventionType: NbsInterventionTypeId;
  label: string;
  primaryBenefit: string;
  knowledgeFile: string;
}

// SSE events — same structure as concept note but with CBO types
export type CboEvent =
  | { type: 'chat'; content: string; role: 'assistant'; messageType?: 'content' | 'thinking' | 'tool_status' }
  // Transient token-streaming delta (LT-4): NOT persisted — the finalizing
  // 'chat' event (whole block, post-normalizer) is the durable record. The
  // client accumulates deltas into a live draft bubble and replaces it when
  // the finalizer arrives, so the inline-options converter keeps operating
  // on whole blocks (buffer-then-finalize).
  | { type: 'chat_delta'; content: string }
  | { type: 'chat_thinking'; content: string }
  | { type: 'thinking_step'; step: { id: string; label: string; status: 'pending' | 'active' | 'complete' | 'error' } }
  | { type: 'field_update'; sectionId: string; field: string; value: string; confidence: Confidence; source?: string }
  | { type: 'gap'; sectionId: string; field: string; reason: string; severity: string }
  | { type: 'phase_change'; phase: number }
  // set_path persists to cohort_members and used to be silent — the panel's
  // Path section kept saying "not yet chosen" until a full page refresh
  // (Perfect Demo 2026-07-14). This event lets the client update live.
  | { type: 'path_set'; path: 'has-project' | 'has-idea' | 'needs-help' }
  | { type: 'maturity_update'; scores: MaturityScore[]; total: number; flags: PriorityFlag[] }
  // options[].action 'upload': the chip renders as a prominent attach banner
  // (paperclip icon) and opens the file picker instead of answering — the
  // intake opening's "send your site or documents" affordance.
  | { type: 'ask_user'; question: string; options: Array<{ label: string; description: string; recommended?: boolean; imageUrl?: string; location?: string; action?: 'upload' | 'upload_then_answer' }>; relatedSections?: string[]; showMap?: boolean;
      /** Offer real cases beside this question, WITHOUT answering it. */
      showExamples?: boolean; multiSelect?: boolean }
  | { type: 'open_map'; params: OpenMapParams }
  | { type: 'open_intervention_selector'; params: OpenInterventionSelectorParams }
  | { type: 'show_examples'; cardIds: string[]; mode: 'browse' | 'favorites'; intro?: string }
  | { type: 'show_types'; typeIds: string[]; intro?: string }
  // Two-level taxonomy strip (shared/nbs-catalog.ts): empty familiaIds = all 5.
  | { type: 'show_familias'; familiaIds?: string[]; intro?: string }
  // E2 linear flow — the site card served after the focused site session: what
  // they picked, the bairro's risk profile (0–100 means), the inferred kind of
  // place. The serving checkpoint pairs it with a confirm ask_user.
  | { type: 'show_site_card'; card: CboSiteCard }
  // E2 linear flow closing — famílias worth studying for THIS site (always ≥2,
  // never a single verdict), each with a one-line why in the session language
  // and concrete example variants from the 27-solution catalog.
  | { type: 'show_familia_recommendation'; items: FamiliaRecoItem[]; intro?: string }
  // E3 — the shortlist (ordered, never filtered: `full` is the "ver todas" view)
  // and the closing dossier. Both are computed server-side with no model in the
  // path; see shared/w3-solutions.ts and shared/w3-dossier.ts.
  | { type: 'show_solution_options'; items: Array<{ solutionId: string; reason: string; caveat?: string }>; full?: boolean }
  | { type: 'show_dossier'; dossier: W3Dossier }
  | { type: 'show_roadmap'; roadmap: W3Roadmap }
  | { type: 'ask_priority_rank'; prompt: string; minRanked: number }
  | { type: 'ask_community_anchoring'; prompt: string }
  | { type: 'done'; summary: string }
  | { type: 'error'; message: string };

// E2 linear flow — payload of show_site_card. Risks are the bairro's mean
// hazard scores as 0–100 integers (parsed from the map confirmation).
export interface CboSiteCard {
  name: string;
  bairro: string;
  lat?: number;
  lng?: number;
  siteKind: 'osm' | 'custom' | 'zone';
  /** Keyword-inferred kind of place ("praça", "escola", …); absent = unknown. */
  siteTypeLabel?: string;
  /**
   * Reverse-geocoded street address for a dropped pin, when Nominatim gave one.
   * Shown as the card's headline so the org confirms a place it can recognise
   * and repeat, instead of a latitude. Absent = we only have the coordinate.
   */
  address?: string;
  /**
   * Bairro-wide MEAN hazard scores, 0–100 — NOT measured at this site. The card
   * must label them as such: the diagnostic's hazard-check beat exists to ask
   * whether the bairro figure matches the org's own place, and a card that
   * presents these as "your place's risk" pre-empts that question with an
   * answer it never had. See shared/site-knowledge.ts → hazardCheckQuestion.
   */
  risks: { flood: number; heat: number; landslide: number };
}

// E2 linear flow — one recommended família in show_familia_recommendation.
export interface FamiliaRecoItem {
  familiaId: string;
  /** One-line reason in the session language, tied to their data. */
  why: string;
  exampleSolutionIds: string[];
  /**
   * No real signal behind this família for this place. Shown grouped rather
   * than ranked, so the list can honestly carry all five without pretending
   * the last two were reasoned into position. Every família always ships —
   * "nada fica descartado" is on screen and has to be true.
   */
  weak?: boolean;
}

// Chat message type (same as concept note — shared)
export interface CboChatMessage {
  role: 'user' | 'assistant';
  // For messageType 'composer', `content` is a JSON payload describing an inline
  // widget to re-render (e.g. {kind:'types',typeIds} / {kind:'examples',cardIds,mode}).
  content: string;
  messageType: 'content' | 'thinking' | 'tool_status' | 'composer';
  timestamp: string;
}

// Helper to create empty CBO state
export function createEmptyCboState(city: string): CboState {
  const sections: Record<string, CboSectionState> = {};
  for (const sec of CBO_SECTIONS) {
    sections[sec.id] = {
      id: sec.id,
      title: sec.title,
      phase: sec.phase,
      fields: {},
      confidence: 'empty',
      sources: [],
      lastUpdatedBy: null,
    };
  }
  return {
    id: crypto.randomUUID(),
    orgName: '',
    city,
    // Start at phase 1 — Encontro 1 begins on the first chat turn. Phase 0
    // ("pre-introduction") required the agent to call set_phase(1) on its
    // first response; the only prompt rule that triggers it is gated on
    // RECENT CONVERSATION being empty, which the instant-kickoff template
    // (persisted before the first agent turn) makes never true — so sessions
    // finished E1 stuck at phase 0 and the "Começar Encontro 2" banner
    // (hard-gated to phase >= 1) never appeared. This restores 431eb98e,
    // which was collateral damage in the 020fe0a7 rollback.
    phase: 1,
    sections: sections as Record<CboSectionId, CboSectionState>,
    gaps: [],
    maturityScores: [],
    priorityFlags: [],
    totalMaturityScore: 0,
    editLog: [],
    uploadedFiles: [],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

// COUGAR maturity metrics
export const MATURITY_METRICS = [
  'problem_clarity',
  'climate_nbs_impact',
  'solution_clarity',
  'site_control',
  'org_delivery_capacity',
  'team_technical_experience',
  'financial_thinking',
  'community_anchoring',
  'regulatory_awareness',
] as const;

export const PRIORITY_FLAG_DEFINITIONS = [
  'Land tenure secure or likely secure',
  'Baseline environmental data exists',
  'Local government expressed interest',
  'Potential buyers/payors identified',
  'Co-financing possibility identified',
  'Scalable beyond one site',
] as const;

// ----------------------------------------------------------------------------
// Tool-arg validators — the agent passes free strings for metric / section /
// flag. A misspelled metric used to be stored silently and then the phase
// never registered as complete (dead-end at the end of a session). These
// guards let the tool handlers reject bad args with a corrective message the
// agent must retry, instead of writing garbage.
// ----------------------------------------------------------------------------

const MATURITY_METRIC_SET = new Set<string>(MATURITY_METRICS);
export function isValidMaturityMetric(metric: string): metric is typeof MATURITY_METRICS[number] {
  return MATURITY_METRIC_SET.has(metric);
}

const SECTION_ID_SET = new Set<string>(ALL_CBO_SECTION_IDS);
export function isValidSectionId(sectionId: string): sectionId is CboSectionId {
  return SECTION_ID_SET.has(sectionId);
}

// Priority flags are matched on a normalized key so trivial casing/whitespace
// differences from the agent still resolve to the canonical definition.
const normalizeFlag = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const PRIORITY_FLAG_BY_KEY = new Map<string, string>(
  PRIORITY_FLAG_DEFINITIONS.map(f => [normalizeFlag(f), f]),
);
/** Returns the canonical flag string if `flag` matches a known definition, else null. */
export function canonicalPriorityFlag(flag: string): string | null {
  return PRIORITY_FLAG_BY_KEY.get(normalizeFlag(flag)) ?? null;
}
