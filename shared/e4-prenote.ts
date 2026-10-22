// ============================================================================
// THE PRE-NOTE — Encontro 4's one page: problem, solution, impact, indicators,
// a basic budget, partners
// ============================================================================
// Decided 13–14 Oct 2026 (JVP, Ana, Vila Flores): after the technical visit,
// each organisation writes a ONE-PAGE pre-concept note on the ONE solution it
// takes forward. The organisations are not NBS specialists (Julia: "não achamos
// que as organizações têm capacidade de desenvolver esses itens"), so this page
// is mostly COMPUTED — from what Encontros 1–3 already hold, the fichas, the
// cost and benefit tables, the indicator menu — and Encontro 4 asks only what
// is genuinely missing. `prenoteGaps()` IS that list: each gap is one question.
//
// ── Rules ───────────────────────────────────────────────────────────────────
//   · No model in this file. Every number comes from a function with a source;
//     a sentence an organisation said is quoted as theirs.
//   · One solution. Which one: what Encontro 4 confirmed, else the technical
//     visit's recommendation, else the first test that made sense to them.
//     Where it came from is printed, because "indicada na visita técnica" and
//     "escolhida pela organização, sem visita" are different claims.
//   · A section with something missing still prints what it has, and says what
//     is missing in a sentence — a gap is a next step, not a blank.
//   · The coordination may rewrite any section's text (Vila Flores fixing a
//     word); the page then says "ajustado pela coordenação". The numbers stay
//     computed underneath, so a later answer is never lost to an old edit —
//     the edit is cleared on that section when its inputs change (see
//     `editIsStale`).
//   · One optional technical review stamp for the whole note. Until someone
//     stamps it the page says "estimativa técnica" — which it is.
//   · Written register: third person, a nota técnica (docs/document-register.md).
// ============================================================================

import { getSolution, type NbsSolution } from './nbs-catalog';
import { sizeOf, testOf, type SolutionTest } from './w3-tests';
import { testsOf, namesOutsideCatalogue } from './recorded-solutions';
import { budgetLineFor, SOLUTION_COSTS, type BuildModel } from './w3-sizing';
import { benefitFor } from './w3-benefits';
import { studyRequirement } from './w3-dossier';
import { studyCostLine, STUDY_COSTS } from './w3-studies';
import { approvalRequirement } from './nbs-approvals';
import { HARDEST, type HardestId } from './w3-criteria';
import { WORRY_SUBTYPES } from './site-knowledge';
import { cboDisplayValue } from './cbo-field-catalog';
import { parseVisit } from './e4-visit';
import { noteIndicators, INDICATOR_MENU_REVIEW, type ResolvedIndicator } from './e4-indicators';
import { buildConceptNote, applyStoredAuthoring, conceptNoteFacts, type ConceptSectionId, type Paragraph } from './concept-note';
import type { W3Input } from './w3-dossier';
import { FIELD_DESTINY } from './field-destiny';

type Lang = 'pt' | 'en';
type Rec = Record<string, string | undefined>;

export interface PrenoteInput {
  org?: Rec;
  /** intervention_site fields. */
  site: Rec;
  /** intervention_type fields — the tests, the visit, Encontro 4's answers, the stamps. */
  type: Rec;
  /** operations_sustain / impact_monitoring fields, merged (who maintains, upkeep cost). */
  ops?: Rec;
  /**
   * Their photographs, with the CAPTION only (never a literal description) —
   * passed by the server, which holds the documents. The first one prints.
   */
  photos?: Array<{ src: string; caption: string }>;
  /** What this organisation shares with the cohort, as counts (cohortLines). */
  cohort?: string[];
  /** What the city's maps say about the marked site (server/services/siteContext.ts). */
  cityMap?: Array<{ text: string; source: string }>;
}

/** What Encontro 4 stores about the solution it confirmed. */
export interface E4Solution {
  solutionId: string;
  source: 'visita' | 'organizacao';
  areaM2?: number;
  units?: number;
}

export type PrenoteSectionId = 'organizacao' | 'problema' | 'territorio' | 'solucao' | 'impacto' | 'indicadores' | 'orcamento' | 'financiamento' | 'parceiros' | 'pendencias';
export const PRENOTE_SECTIONS: PrenoteSectionId[] = ['organizacao', 'problema', 'territorio', 'solucao', 'impacto', 'indicadores', 'orcamento', 'financiamento', 'parceiros', 'pendencias'];

/** The five things Encontro 4 asks — one per gap, in the order it asks them. */
export type PrenoteGap = 'beneficiarios' | 'mudancas' | 'quem-faz' | 'contrapartida' | 'parceiros';
export const GAP_ORDER: PrenoteGap[] = ['beneficiarios', 'mudancas', 'quem-faz', 'contrapartida', 'parceiros'];

export interface PrenoteLine {
  text: string;
  kind: 'written' | 'quote' | 'figure';
  /** Where it came from, in a few words. Never empty. */
  source: string;
}

export interface PrenoteSection {
  id: PrenoteSectionId;
  title: string;
  lines: PrenoteLine[];
  /** What is still missing here, in a sentence — null when nothing is. */
  missing: string | null;
  /** The coordination rewrote this section's text. */
  edited?: { by?: string; at: string };
}

export interface BudgetRow {
  label: string;
  /** "R$ 48.000–84.000", or a sentence when there is no figure. */
  value: string;
  low?: number;
  high?: number;
  source: string;
  /** What the row is for — so a page can say what a total leaves out without parsing labels. */
  kind?: 'obra' | 'estudos' | 'manutencao' | 'contrapartida';
}

export interface PrenoteReview {
  status: 'revisada' | 'dispensada';
  by?: string;
  at: string;
}

export interface Prenote {
  /** Null when no solution can be named yet — the page says so and stops. */
  solution: { id: string; label: string; source: 'visita' | 'organizacao' | 'teste'; areaM2?: number; units?: number } | null;
  title: string;
  orgName: string;
  place: string;
  sections: PrenoteSection[];
  budget: BudgetRow[];
  /** Low/high of the rows that carry a figure. Null when none does. */
  total: { low: number; high: number } | null;
  indicators: ResolvedIndicator[];
  gaps: PrenoteGap[];
  review: PrenoteReview | null;
  /** "estimativa técnica" until a review stamp says otherwise. */
  status: string;
  indicatorsReviewed: boolean;
  /**
   * The summary written over the facts when Encontro 4 closed (the concept
   * note's authoring pass, same guards) — empty until it has run.
   */
  summary: string[];
  /** One of their photographs, captioned, when there is one. */
  photo: { src: string; caption: string } | null;
}

// ⚠️ The chip labels are spoken ("A gente mesmo"); a page is written. The
// written form of each answer, in the third person (docs/document-register.md).
const MAINTAINER: Record<string, { pt: string; en: string }> = {
  nos: { pt: 'a própria organização', en: 'the organisation itself' },
  voluntarios: { pt: 'voluntários da comunidade', en: 'community volunteers' },
  'parceria-prefeitura': { pt: 'parceria com a prefeitura', en: 'a partnership with the city' },
  contratada: { pt: 'empresa contratada', en: 'a hired contractor' },
  indefinido: { pt: 'ainda não definido', en: 'not decided yet' },
};

const has = (v: string | undefined | null): v is string => typeof v === 'string' && v.trim() !== '' && !/^(null|undefined)$/i.test(v.trim());
/**
 * An answer that is "I don't know": it closes the question (asking again would
 * be nagging) but never prints as though it were information.
 */
const NOT_KNOWN = /^(n[ãa]o sei( dizer)?|i could not say|don'?t know|ninguém ainda|nobody yet|nada por enquanto|nothing for now)\.?$/i;
const said = (v: string | undefined | null): v is string => has(v) && !NOT_KNOWN.test(v.trim());
const brl = (v: number, lang: Lang) => `R$ ${Math.round(v).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US')}`;
const range = (lo: number, hi: number, lang: Lang) => (lo === hi ? brl(lo, lang) : `${brl(lo, lang)}–${brl(hi, lang)}`);
const label = (s: NbsSolution | undefined, lang: Lang) => (s ? (lang === 'pt' ? s.pt.label : s.en.label) : '');

export function parseE4Solution(raw: string | undefined): E4Solution | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || !getSolution(String(v.solutionId))) return null;
    return {
      solutionId: v.solutionId,
      source: v.source === 'visita' ? 'visita' : 'organizacao',
      ...(Number(v.areaM2) > 0 ? { areaM2: Number(v.areaM2) } : {}),
      ...(Number(v.units) > 0 ? { units: Math.round(Number(v.units)) } : {}),
    };
  } catch {
    return null;
  }
}

export function parseReview(raw: string | undefined): PrenoteReview | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v?.status !== 'revisada' && v?.status !== 'dispensada') return null;
    return { status: v.status, at: String(v.at ?? ''), ...(has(v.by) ? { by: String(v.by) } : {}) };
  } catch {
    return null;
  }
}

/** Coordinator rewrites: { [section]: { text, at, by?, basis } }. */
export interface PrenoteEdit { text: string; at: string; by?: string; basis: string }
export function parseEdits(raw: string | undefined): Partial<Record<PrenoteSectionId, PrenoteEdit>> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    const out: Partial<Record<PrenoteSectionId, PrenoteEdit>> = {};
    for (const id of PRENOTE_SECTIONS) {
      const e = v?.[id];
      if (e && has(e.text)) out[id] = { text: String(e.text), at: String(e.at ?? ''), basis: String(e.basis ?? ''), ...(has(e.by) ? { by: String(e.by) } : {}) };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Which solution the note is about, and at what size.
 * Encontro 4's confirmation → the visit → the first test that made sense.
 */
export function prenoteSolution(input: PrenoteInput): Prenote['solution'] {
  const tests = testsOf(input.type);
  const sized = (id: string, own?: { areaM2?: number; units?: number }) => {
    // A size the visit or Encontro 4 gave wins; otherwise the size it was tested at.
    const fallback = sizeOf(id, { site: input.site, w3: input.type }, testOf(tests, id));
    const byUnits = SOLUTION_COSTS[id]?.basis === 'unit';
    return byUnits
      ? { ...(own?.units || fallback.units ? { units: own?.units || fallback.units } : {}) }
      : { ...(own?.areaM2 || fallback.areaM2 ? { areaM2: own?.areaM2 || fallback.areaM2 } : {}) };
  };
  const e4 = parseE4Solution(input.type._e4_solution_json);
  if (e4) return { id: e4.solutionId, label: label(getSolution(e4.solutionId), 'pt'), source: e4.source, ...sized(e4.solutionId, e4) };
  const visit = parseVisit(input.type._visit_json);
  if (visit) return { id: visit.solutionId, label: label(getSolution(visit.solutionId), 'pt'), source: 'visita', ...sized(visit.solutionId, visit) };
  const liked = tests.find(t => t.reaction === 'faz-sentido');
  if (liked) return { id: liked.solutionId, label: label(getSolution(liked.solutionId), 'pt'), source: 'teste', ...sized(liked.solutionId) };
  return null;
}

/**
 * What Encontro 4 still has to ask — in the order it asks. A gap closes when
 * its field holds an answer; "não sei" is an answer (it closes the question
 * and prints as an open item, never as a figure).
 */
export function prenoteGaps(input: PrenoteInput): PrenoteGap[] {
  const t = input.type;
  const s = input.site;
  const ops = input.ops ?? {};
  const out: PrenoteGap[] = [];
  if (!has(s.beneficiaries_note)) out.push('beneficiarios');
  if (!has(t._e4_changes)) out.push('mudancas');
  if (!has(t.construction_model) || !has(ops.who_maintains)) out.push('quem-faz');
  if (!has(t.e4_contribution)) out.push('contrapartida');
  if (!has(t.e4_partners)) out.push('parceiros');
  return out;
}

/** The household count inside "umas 40 famílias, as da rua de baixo". */
export function householdsFrom(note: string | undefined): number | null {
  const m = (note ?? '').replace(/\./g, '').match(/\b(\d{1,5})\b/);
  return m ? Number(m[1]) : null;
}

/** An edit holds while the inputs it was written over have not changed. */
export function editIsStale(edit: PrenoteEdit, basis: string): boolean {
  return edit.basis !== basis;
}

const T = {
  pt: {
    organizacao: 'A organização e o território',
    problema: 'O problema', territorio: 'O lugar nos mapas da cidade', solucao: 'A solução', impacto: 'Impacto esperado', indicadores: 'Indicadores',
    orcamento: 'Orçamento básico', financiamento: 'Caminhos de financiamento', parceiros: 'Parceiros e autorizações', pendencias: 'Pendências',
    estimate: 'estimativa técnica', reviewed: (by?: string, at?: string) => `revisada${by ? ` por ${by}` : ''}${at ? ` em ${fmtDate(at)}` : ''}`,
    waived: 'revisão técnica dispensada pela coordenação',
  },
  en: {
    organizacao: 'The organisation and the territory',
    problema: 'The problem', territorio: "The site on the city's maps", solucao: 'The solution', impacto: 'Expected impact', indicadores: 'Indicators',
    orcamento: 'Basic budget', financiamento: 'Funding paths', parceiros: 'Partners and approvals', pendencias: 'Open items',
    estimate: 'technical estimate', reviewed: (by?: string, at?: string) => `reviewed${by ? ` by ${by}` : ''}${at ? ` on ${fmtDate(at)}` : ''}`,
    waived: 'technical review waived by the coordination',
  },
} as const;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** The inputs a section is built from, as one string — what an edit is pinned to. */
function basisOf(id: PrenoteSectionId, input: PrenoteInput, sol: Prenote['solution']): string {
  const t = input.type, s = input.site, o = input.ops ?? {};
  const parts: Record<PrenoteSectionId, Array<string | undefined>> = {
    organizacao: [JSON.stringify(input.org ?? {}), s.bairro],
    financiamento: [sol?.id, String(sol?.areaM2 ?? ''), String(sol?.units ?? ''), input.org?.has_cnpj, input.org?.funding_history, (input.cohort ?? []).join('|')],
    problema: [s.site_worry, s.site_story, s.beneficiaries_note],
    territorio: [(input.cityMap ?? []).map(x => x.text).join('|')],
    solucao: [sol?.id, String(sol?.areaM2 ?? ''), String(sol?.units ?? ''), t.construction_model],
    impacto: [sol?.id, String(sol?.areaM2 ?? ''), String(sol?.units ?? ''), t._e4_changes],
    indicadores: [sol?.id, String(sol?.areaM2 ?? ''), String(sol?.units ?? ''), t._e4_changes, s.beneficiaries_note],
    orcamento: [sol?.id, String(sol?.areaM2 ?? ''), String(sol?.units ?? ''), t.construction_model, t.e4_contribution, o.opex_band],
    parceiros: [sol?.id, t.e4_partners, o.who_maintains, s.land_tenure],
    pendencias: [sol?.id, t.solution_tests_json, s.studies_done],
  };
  return parts[id].map(v => v ?? '').join('¦');
}

export function buildPrenote(input: PrenoteInput, lang: Lang = 'pt'): Prenote {
  const pt = lang === 'pt';
  const L = T[lang];
  const { site, type } = input;
  const ops = input.ops ?? {};
  const org = input.org ?? {};
  const orgName = (org.org_name ?? '').trim();
  const place = [site.site_name, site.bairro].filter(has).join(', ');
  const sol = prenoteSolution(input);
  const review = parseReview(type._prenote_review_json);
  const status = review ? (review.status === 'revisada' ? L.reviewed(review.by, review.at) : L.waived) : L.estimate;
  const gaps = prenoteGaps(input);

  if (!sol) {
    return {
      solution: null, title: pt ? 'Proposta inicial' : 'Initial proposal', orgName, place, sections: [], budget: [], total: null,
      indicators: [], gaps, review, status, indicatorsReviewed: !!INDICATOR_MENU_REVIEW, summary: [], photo: input.photos?.[0] ?? null,
    };
  }

  const s = getSolution(sol.id)!;
  const solLabel = label(s, lang);
  const size = { ...(sol.areaM2 ? { areaM2: sol.areaM2 } : {}), ...(sol.units ? { units: sol.units } : {}) };
  const tests = testsOf(type);
  const test: SolutionTest | undefined = testOf(tests, sol.id);
  const display = (sec: string, f: string, v: string | undefined) => (has(v) ? cboDisplayValue(sec, f, v, lang) || v : '');
  const sections: PrenoteSection[] = [];
  const W = (text: string, source: string): PrenoteLine => ({ text, kind: 'written', source });
  const Q = (text: string, source: string): PrenoteLine => ({ text: `“${text.trim()}”`, kind: 'quote', source });
  const F = (text: string, source: string): PrenoteLine => ({ text, kind: 'figure', source });
  const theirs = pt ? 'a organização' : 'the organisation';

  // ── 1 · O problema ────────────────────────────────────────────────────────
  const worries = (site.site_worry ?? '').split(',').map(w => w.trim()).filter(Boolean)
    .map(w => WORRY_SUBTYPES.find(x => x.id === w)).filter(Boolean).map(w => (pt ? w!.dPt : w!.dEn).toLowerCase());
  const problem: PrenoteLine[] = [];
  if (worries.length) {
    problem.push(W(
      pt ? `${place ? `Em ${place}, o` : 'O'} problema apontado pela organização é ${worries.join('; ')}.`
        : `${place ? `At ${place}, the` : 'The'} problem the organisation names is ${worries.join('; ')}.`,
      pt ? 'Encontro 2' : 'Encontro 2',
    ));
  }
  if (has(site.site_story)) problem.push(Q(site.site_story, pt ? 'a organização, Encontro 2' : 'the organisation, Encontro 2'));
  if (said(site.beneficiaries_note)) {
    problem.push(W(pt ? `Quem é atingido, segundo a organização: ${site.beneficiaries_note.trim()}.` : `Who is affected, according to the organisation: ${site.beneficiaries_note.trim()}.`, pt ? 'a organização, Encontro 4' : 'the organisation, Encontro 4'));
  }
  sections.push({
    id: 'problema', title: L.problema, lines: problem,
    missing: has(site.beneficiaries_note) ? null : (pt ? 'Falta dizer quem é atingido e quantas famílias, mais ou menos.' : 'Still missing: who is affected and roughly how many households.'),
  });

  // ── 2 · A solução ─────────────────────────────────────────────────────────
  const sizeText = sol.areaM2
    ? `${sol.areaM2.toLocaleString(pt ? 'pt-BR' : 'en-US')} m²`
    : sol.units
      ? `${sol.units} ${sol.units === 1 ? (pt ? SOLUTION_COSTS[sol.id]?.unitPt : SOLUTION_COSTS[sol.id]?.unitEn) : (pt ? SOLUTION_COSTS[sol.id]?.unitPluralPt : SOLUTION_COSTS[sol.id]?.unitPluralEn) ?? ''}`.trim()
      : '';
  const from = {
    visita: pt ? 'indicada na visita técnica' : 'recommended by the technical visit',
    organizacao: pt ? 'escolhida pela organização, sem visita técnica registrada' : 'chosen by the organisation, with no technical visit recorded',
    teste: pt ? 'a que fez sentido para a organização no Encontro 3, ainda sem visita técnica registrada' : 'the one that made sense to the organisation in Encontro 3, with no technical visit recorded yet',
  }[sol.source];
  const solution: PrenoteLine[] = [
    W(`**${solLabel}**${sizeText ? ` · ${sizeText}` : ''} — ${from}.`, sol.source === 'visita' ? (pt ? 'visita técnica' : 'technical visit') : (pt ? 'Encontro 3' : 'Encontro 3')),
    W(pt ? s.pt.whatItIs : s.en.whatItIs, pt ? 'catálogo de soluções' : 'solution catalogue'),
  ];
  if (has(type.construction_model)) {
    solution.push(W(pt ? `Execução: ${display('intervention_type', 'construction_model', type.construction_model)}.` : `Delivery: ${display('intervention_type', 'construction_model', type.construction_model)}.`, theirs));
  }
  // What they named in a first Encontro 3 that the catalogue does not hold —
  // not priced, not tested, but said, so it is not silently lost.
  const outside = namesOutsideCatalogue(type.solution_types);
  if (outside.length) {
    solution.push(W(pt ? `Também mencionaram: ${outside.join(', ')} (fora do catálogo de soluções).` : `They also named: ${outside.join(', ')} (not in the solution catalogue).`, theirs));
  }
  sections.push({ id: 'solucao', title: L.solucao, lines: solution, missing: null });

  // ── 3 · Impacto esperado ──────────────────────────────────────────────────
  const benefit = benefitFor(sol.id, size.areaM2, size.units);
  const impact: PrenoteLine[] = [];
  if (benefit) {
    impact.push(W(pt ? benefit.claimPt : benefit.claimEn, pt ? benefit.sourcePt : benefit.sourceEn));
    const headline = pt ? benefit.headlinePt : benefit.headlineEn;
    if (headline && benefit.siteSpecific) impact.push(F(`${headline} ${pt ? '(estimativa de projeto, não medição)' : '(a design estimate, not a measurement)'}`, pt ? benefit.sourcePt : benefit.sourceEn));
  }
  const indicators = noteIndicators(sol.id, (type._e4_changes ?? '').split(',').map(x => x.trim()).filter(Boolean), site.site_worry, size, lang);
  const chosenChanges = indicators.filter(i => i.kind === 'efeito' && (type._e4_changes ?? '').split(',').includes(i.id));
  if (chosenChanges.length) {
    impact.push(W(pt ? `O que a organização quer ver mudar: ${chosenChanges.map(i => i.label.toLowerCase()).join('; ')}.` : `What the organisation wants to see change: ${chosenChanges.map(i => i.label.toLowerCase()).join('; ')}.`, theirs));
  }
  sections.push({
    id: 'impacto', title: L.impacto, lines: impact,
    missing: has(type._e4_changes) ? null : (pt ? 'Falta a organização dizer o que quer ver mudar.' : 'Still missing: what the organisation wants to see change.'),
  });

  // ── 4 · Indicadores ───────────────────────────────────────────────────────
  const households = householdsFrom(site.beneficiaries_note);
  const indLines = indicators.map(i => {
    const target = i.id === 'familias-atendidas' && households ? `${households} ${i.unit}` : i.target;
    const head = `**${i.label}**${target ? ` — meta: ${target}` : ''}${i.estimate ? ` — ${pt ? 'estimativa' : 'estimate'}: ${i.estimate.replace(/\.$/, '')}` : ''}`;
    return F(`${head}. ${pt ? 'Como medir' : 'How to measure'}: ${i.how} ${pt ? 'Linha de base' : 'Baseline'}: ${i.baseline}`, `${i.source}${INDICATOR_MENU_REVIEW ? '' : pt ? ' · proposta técnica, a revisar' : ' · technical proposal, to review'}`);
  });
  sections.push({ id: 'indicadores', title: L.indicadores, lines: indLines, missing: null });

  // ── 5 · Orçamento básico ──────────────────────────────────────────────────
  const buildModel = (has(type.construction_model) ? type.construction_model : undefined) as BuildModel | undefined;
  const line = budgetLineFor(sol.id, size.areaM2, size.units, buildModel);
  const budget: BudgetRow[] = [];
  budget.push({
    label: pt ? `Implantação${sizeText ? ` (${sizeText})` : ''}` : `Works${sizeText ? ` (${sizeText})` : ''}`,
    value: line?.lowBrl != null ? range(line.lowBrl, line.highBrl ?? line.lowBrl, lang) : (pt ? 'a cotar' : 'to be quoted'),
    ...(line?.lowBrl != null ? { low: line.lowBrl, high: line.highBrl ?? line.lowBrl } : {}),
    source: pt ? 'preço de referência da ficha' : "the ficha's reference price",
    kind: 'obra',
  });
  const study = studyRequirement(sol.id, site);
  const studyLine = study ? studyCostLine(study.pt, lang) : null;
  const sc = study ? STUDY_COSTS[study.pt] : undefined;
  // ⚠️ Only a figure that buys THE STUDY enters the total. The ART row prices
  // the registration fee alone (R$ 103–271); the professional's work is the
  // real cost and has no reference — summing the fee made a study look free.
  const feeOnly = !!sc?.scalePt && /\btaxa\b/i.test(sc.scalePt);
  const studyPriced = sc?.lowBrl != null && !feeOnly;
  budget.push({
    label: pt ? 'Estudos e licenças' : 'Studies and permits',
    value: !study
      ? (pt ? 'nenhum estudo exigido pela ficha' : 'no study required by the ficha')
      : studyPriced
        ? range(sc!.lowBrl!, sc!.highBrl ?? sc!.lowBrl!, lang)
        : feeOnly && sc?.lowBrl != null
          ? (pt ? `a cotar (a taxa da ART é ${range(sc.lowBrl, sc.highBrl ?? sc.lowBrl, lang)}; o trabalho do profissional, à parte)` : `to be quoted (the ART fee is ${range(sc.lowBrl, sc.highBrl ?? sc.lowBrl, lang)}; the professional's work on top)`)
          : (pt ? 'a cotar' : 'to be quoted'),
    ...(studyPriced ? { low: sc!.lowBrl!, high: sc!.highBrl ?? sc!.lowBrl! } : {}),
    source: study ? (pt ? `${study.pt} — custos de estudo` : `${study.en} — study costs`) : (pt ? 'ficha da solução' : "the solution's ficha"),
    // No study required is not a gap in the sum.
    ...(study ? { kind: 'estudos' as const } : {}),
  });
  budget.push({
    label: pt ? 'Manutenção no 1º ano' : 'Upkeep, first year',
    value: has(ops.opex_band) ? display('operations_sustain', 'opex_band', ops.opex_band) : (pt ? 'a levantar' : 'to be estimated'),
    source: has(ops.opex_band) ? (pt ? 'estimativa da organização' : "the organisation's estimate") : (pt ? 'a ficha descreve o cuidado, sem valor' : 'the ficha describes the upkeep, with no figure'),
    kind: 'manutencao',
  });
  budget.push({
    label: pt ? 'Contrapartida da organização' : "The organisation's contribution",
    value: has(type.e4_contribution) ? type.e4_contribution.trim() : (pt ? 'a definir' : 'to be defined'),
    source: has(type.e4_contribution) ? theirs : (pt ? 'ainda não respondido' : 'not answered yet'),
    kind: 'contrapartida',
  });
  const priced = budget.filter(b => b.low != null);
  const total = priced.length ? { low: priced.reduce((n, b) => n + (b.low ?? 0), 0), high: priced.reduce((n, b) => n + (b.high ?? 0), 0) } : null;
  const budgetLines: PrenoteLine[] = budget.map(b => F(`${b.label}: ${b.value}`, b.source));
  if (total) budgetLines.push(F(pt ? `Total estimado: ${range(total.low, total.high, lang)} — uma faixa para pedir cotação, não um orçamento fechado.` : `Estimated total: ${range(total.low, total.high, lang)} — a range to request quotes against, not a closed budget.`, pt ? 'soma das linhas com valor' : 'sum of the priced rows'));
  if (line?.builtBySelfWithoutFigure) budgetLines.push(W(pt ? 'A faixa de implantação é de execução contratada; em mutirão o custo cai, e a ficha não fecha quanto.' : 'The works range is for contracted delivery; built by mutirão it drops, and the ficha does not close by how much.', pt ? 'ficha da solução' : "the solution's ficha"));
  sections.push({
    id: 'orcamento', title: L.orcamento, lines: budgetLines,
    missing: has(type.e4_contribution) ? null : (pt ? 'Falta dizer o que a organização já tem para colocar.' : 'Still missing: what the organisation already has to put in.'),
  });

  // ── 6 · Parceiros e autorizações ──────────────────────────────────────────
  const partners: PrenoteLine[] = [];
  if (said(type.e4_partners)) partners.push(W(pt ? `Com quem a organização já conversou: ${type.e4_partners.trim()}.` : `Who the organisation has already talked to: ${type.e4_partners.trim()}.`, theirs));
  const appr = approvalRequirement(sol.id, site.land_tenure);
  if (appr) partners.push(W(pt ? `Precisa dizer sim: ${appr.bodies.map(b => b.name).join(', ')}${appr.instrumentPt ? ` (${appr.instrumentPt})` : ''}.` : `Must say yes: ${appr.bodies.map(b => b.name).join(', ')}${appr.instrumentEn ? ` (${appr.instrumentEn})` : ''}.`, pt ? 'ficha da solução e situação do terreno' : "the solution's ficha and the land tenure"));
  else partners.push(W(pt ? 'Pela ficha e pela situação do terreno, nenhuma autorização externa é exigida.' : "By the ficha and the land tenure, no outside approval is required.", pt ? 'ficha da solução' : "the solution's ficha"));
  // Who looks after it, when they said. When they have not, Pendências says so
  // in one line — the ficha's paragraph on upkeep is for the comparison, and
  // it would take a third of this page.
  if (has(ops.who_maintains)) partners.push(W(pt ? `Quem cuida depois: ${MAINTAINER[ops.who_maintains]?.pt ?? display('operations_sustain', 'who_maintains', ops.who_maintains)}.` : `Who looks after it: ${MAINTAINER[ops.who_maintains]?.en ?? display('operations_sustain', 'who_maintains', ops.who_maintains)}.`, theirs));
  sections.push({
    id: 'parceiros', title: L.parceiros, lines: partners,
    missing: has(type.e4_partners) ? null : (pt ? 'Falta dizer com quem a organização já conversou.' : 'Still missing: who the organisation has already talked to.'),
  });

  // ── 7 · Pendências ────────────────────────────────────────────────────────
  const open: PrenoteLine[] = [];
  const hardest = test?.hardest as HardestId | undefined;
  if (hardest && !['nada', 'pulou'].includes(hardest)) {
    const what = hardest === 'outro' && has(test?.hardestNote) ? test!.hardestNote! : (pt ? HARDEST[hardest].reportPt : HARDEST[hardest].reportEn);
    open.push(W(pt ? `O que mais pega, segundo a organização: ${what.charAt(0).toLowerCase()}${what.slice(1)}.` : `What is hardest, according to the organisation: ${what.charAt(0).toLowerCase()}${what.slice(1)}.`, pt ? 'a organização, Encontro 3' : 'the organisation, Encontro 3'));
  }
  if (studyLine) open.push(W(studyLine, pt ? 'custos de estudo' : 'study costs'));
  if (!has(type.construction_model) || type.construction_model === 'indefinido') open.push(W(pt ? 'Quem executa a obra ainda não está definido.' : 'Who carries out the works is not decided yet.', theirs));
  if (!has(ops.who_maintains) || ops.who_maintains === 'indefinido') open.push(W(pt ? 'Quem cuida depois da obra ainda não está definido.' : 'Who looks after it afterwards is not decided yet.', theirs));
  if (sol.source !== 'visita') open.push(W(pt ? 'A escolha da solução ainda não passou pela visita técnica.' : 'The choice of solution has not been through the technical visit yet.', pt ? 'coordenação' : 'the coordination'));
  sections.push({ id: 'pendencias', title: L.pendencias, lines: open, missing: null });

  // ── Everything else the record holds ──────────────────────────────────────
  // ⚠️ The first version printed only what Encontro 4 asked plus a few E2/E3
  // fields — and left out Robson's visit reading, who the organisation is,
  // the closing observations, the questions written for this organisation,
  // what their own files say, the bairro's data and the funding paths, all of
  // which the record already held (JVP, 15 Oct: "use as much context as
  // possible"). The concept note already turns every one of those into a
  // sourced paragraph, and so does the field registry for every answer that
  // declares where it belongs — so the pre-note takes ITS paragraphs for the
  // chosen solution, placed by section, never a second engine.
  // ── The site on the city's maps ───────────────────────────────────────────
  // Its own section, before the record's paragraphs are placed, so the same
  // lines the concept note prints under "a organização e o território" are
  // recognised as already said and not repeated there.
  const cityMap = (input.cityMap ?? []).map(x => W(x.text, x.source));
  if (cityMap.length) sections.splice(sections.findIndex(x => x.id === 'problema') + 1, 0, { id: 'territorio', title: L.territorio, lines: cityMap, missing: null });

  const extra = recordParagraphs(input, sol, lang);
  const seen = new Set<string>();
  const remember = (text: string) => seen.add(normText(text));
  for (const sec of sections) for (const l of sec.lines) remember(l.text);
  for (const b of budget) remember(`${b.label}: ${b.value}`);
  const fresh = (ls: PrenoteLine[]) => ls.filter(l => {
    const k = normText(l.text);
    if (!k || Array.from(seen).some(x => x.includes(k) || (k.length > 40 && k.includes(x) && x.length > 40))) return false;
    seen.add(k);
    return true;
  });
  const into = (id: PrenoteSectionId, ls: PrenoteLine[], where: 'start' | 'end' = 'end') => {
    const sec = sections.find(x => x.id === id);
    if (!sec) return;
    const add = fresh(ls);
    sec.lines = where === 'start' ? [...add, ...sec.lines] : [...sec.lines, ...add];
  };
  const organizacao = fresh(extra.organizacao);
  if (organizacao.length) sections.unshift({ id: 'organizacao', title: L.organizacao, lines: organizacao, missing: null });
  into('problema', extra.problema);
  into('solucao', extra.solucao);
  into('impacto', extra.impacto);
  into('orcamento', extra.orcamento);
  const financiamento = fresh(extra.financiamento);
  if (financiamento.length) sections.splice(sections.findIndex(x => x.id === 'parceiros'), 0, { id: 'financiamento', title: L.financiamento, lines: financiamento, missing: null });
  into('parceiros', extra.parceiros);
  into('pendencias', extra.pendencias);
  // What the organisation brings, from Encontros 1–3, when Encontro 4 has not
  // been asked yet — said as the record's, so the room confirms it.
  if (!has(type.e4_contribution) && extra.contribution.length) {
    const row = budget.find(b => b.source === (pt ? 'ainda não respondido' : 'not answered yet'));
    if (row) { row.value = extra.contribution.join('; '); row.source = pt ? 'Encontros 1 a 3 — a confirmar' : 'Encontros 1 to 3 — to confirm'; }
  }

  // ── Coordinator rewrites, where they still hold ───────────────────────────
  const edits = parseEdits(type._prenote_edits_json);
  for (const sec of sections) {
    const e = edits[sec.id];
    if (!e || editIsStale(e, basisOf(sec.id, input, sol))) continue;
    sec.lines = [{ text: e.text, kind: 'written', source: pt ? 'ajustado pela coordenação' : 'adjusted by the coordination' }];
    sec.edited = { at: e.at, ...(e.by ? { by: e.by } : {}) };
  }

  return {
    solution: { ...sol, label: solLabel },
    title: `${solLabel}${has(site.site_name) ? ` · ${site.site_name}` : ''}`,
    orgName, place, sections, budget, total, indicators, gaps, review, status,
    indicatorsReviewed: !!INDICATOR_MENU_REVIEW,
    summary: extra.summary,
    photo: input.photos?.[0] ?? null,
  };
}

const normText = (t: string) => t.toLowerCase().replace(/\*\*|_|[“”"'«»]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 160);

/** The concept note's input for the ONE solution of the pre-note, at its confirmed size. */
export function conceptInputFor(input: PrenoteInput, sol: NonNullable<Prenote['solution']>): W3Input {
  const tests = testsOf(input.type).map(t => (t.solutionId === sol.id
    ? { ...t, ...(sol.areaM2 ? { areaM2: sol.areaM2 } : {}), ...(sol.units ? { units: sol.units } : {}) }
    : t));
  return {
    site: input.site,
    org: input.org ?? {},
    solutions: [sol.id],
    ...(sol.areaM2 ? { areaM2: sol.areaM2 } : {}),
    w3: { ...input.type, ...(input.ops ?? {}), solution_tests_json: JSON.stringify(tests), chosen_solutions: sol.id, ...(sol.units ? { intervention_units: String(sol.units) } : {}) },
    cohort: input.cohort ?? [],
    cityMap: input.cityMap ?? [],
  };
}

/**
 * Every sourced paragraph the concept note would write for this solution,
 * sorted into the pre-note's sections. Answers the field registry routes to a
 * section ("feeds") and the questions written for this organisation come with
 * them, so a field declared once reaches both documents.
 */
function recordParagraphs(input: PrenoteInput, sol: NonNullable<Prenote['solution']>, lang: Lang) {
  const pt = lang === 'pt';
  const ci = conceptInputFor(input, sol);
  const note = applyStoredAuthoring(buildConceptNote(ci, lang), input.type._prenote_authored_json, lang).note;
  const facts = conceptNoteFacts(ci, lang);
  const sec = (id: ConceptSectionId): Paragraph[] => note.sections.find(x => x.id === id)?.paragraphs ?? [];
  const line = (p: Paragraph): PrenoteLine => ({
    text: p.kind === 'bullet' ? `• ${p.text}` : p.text,
    kind: p.kind === 'quote' ? 'quote' : p.kind === 'figure' ? 'figure' : 'written',
    source: p.sources.join(' · '),
  });
  // A paragraph from the record itself — an answer, a question asked in the room, a file.
  // Answers the pre-note already prints in its own words — not twice.
  const ownLabels = ['beneficiaries_note', 'e4_contribution', 'e4_partners', 'site_story']
    .map(f => (FIELD_DESTINY as any)[f]).filter((d: any) => d && 'feeds' in d).map((d: any) => `**${pt ? d.labelPt : d.labelEn}:**`);
  const notOwn = (p: Paragraph) => !ownLabels.some(l => p.text.startsWith(l));
  const fromRecord = (p: Paragraph) => p.sources.some(x => /organiza[çc][ãa]o, nos encontros|organisation, during|Encontro 3 question|pergunta do Encontro 3|arquivo enviado|file sent/i.test(x));
  const solLabel = getSolution(sol.id) ? (pt ? getSolution(sol.id)!.pt.label : getSolution(sol.id)!.en.label) : sol.id;
  const notDescription = (p: Paragraph) => !p.text.startsWith(`**${solLabel}** —`) && !/^(Dimensão|Size|Execução|Delivery):/.test(p.text);
  // The generic funding paragraphs (philanthropic vs commercial, the
  // aggregation argument, the caveat) belong to the long note; the pre-note
  // keeps what is specific: the cohort counts and the paths matched to them.
  const specificFunding = (p: Paragraph) => p.kind === 'bullet' || p.text.startsWith('**') || /não chega sozinho|does not arrive alone|Fora de alcance|Out of reach/.test(p.text);
  // The benefit paragraph repeats the pre-note's own impact lines.
  const notBenefit = (p: Paragraph) => !p.text.startsWith(`**${solLabel}.** `);
  // Matched paths first, capped: a one-page note names the best few; the long note has them all.
  const funding = sec('financiamento').filter(specificFunding);
  const paths = funding.filter(p => p.text.startsWith('**'));
  // Who they have worked with (Encontro 2) — named, as a partner to confirm.
  const site = input.site;
  const partnersFromRecord: PrenoteLine[] = has(site.prior_collaboration_detail)
    ? [{ text: pt ? `Já trabalhou com: ${site.prior_collaboration_detail!.trim()}.` : `Has worked with: ${site.prior_collaboration_detail!.trim()}.`, kind: 'written', source: pt ? 'a organização, Encontro 2' : 'the organisation, Encontro 2' }]
    : [];
  return {
    // The map facts have their own section in the pre-note; their heading line stays in the long note.
    organizacao: sec('organizacao').filter(p => !/^(No lugar marcado, segundo os mapas|At the marked site, according to)/.test(p.text)).map(line),
    problema: sec('problema').filter(notOwn).map(line),
    solucao: [...sec('intervencao').filter(notDescription).filter(notOwn), ...sec('porque').filter(notOwn)].map(line),
    impacto: sec('resultados').filter(notOwn).filter(notBenefit).map(line),
    orcamento: [...sec('custo'), ...sec('manutencao')].filter(fromRecord).filter(notOwn).map(line),
    financiamento: [...funding.filter(p => !p.text.startsWith('**')), ...paths.slice(0, 4)]
      .sort((a, b) => funding.indexOf(a) - funding.indexOf(b)).map(line),
    parceiros: [...partnersFromRecord, ...sec('exige').filter(p => fromRecord(p) || /visita|visit|coordena/i.test(p.sources.join(' '))).filter(notOwn).map(line)],
    pendencias: sec('pendencias').filter(p => !/pr[óo]ximos passos|next steps/i.test(p.text)).map(line),
    summary: sec('resumo').filter(p => p.authored).map(p => p.text),
    contribution: facts.contribution,
  };
}

/** The basis an edit to `section` is pinned to — the route stores it with the text. */
export function editBasis(input: PrenoteInput, section: PrenoteSectionId): string {
  return basisOf(section, input, prenoteSolution(input));
}

/** The pre-note's input from a stored record's sections. */
export function prenoteInputFromSections(sections: unknown): PrenoteInput {
  const rec = (id: string): Rec =>
    Object.fromEntries(
      Object.entries((((sections as any)?.[id]?.fields) ?? {}) as Record<string, { value?: unknown }>)
        .map(([k, v]) => [k, v?.value == null ? undefined : String(v.value)]),
    );
  return {
    org: rec('org_profile'),
    site: rec('intervention_site'),
    type: rec('intervention_type'),
    ops: { ...rec('impact_monitoring'), ...rec('operations_sustain') },
  };
}

/**
 * What the record already says the organisation brings (Encontros 1–3: who
 * builds, the team, years in the territory, the land) — Encontro 4 offers it
 * as a confirmation instead of asking cold.
 */
export function recordedContribution(input: PrenoteInput, lang: Lang = 'pt'): string[] {
  const sol = prenoteSolution(input);
  if (!sol) return [];
  return conceptNoteFacts(conceptInputFor(input, sol), lang).contribution;
}

/** Who the record already names as a partner or a contact (Encontros 2–3). */
export function recordedPartners(input: PrenoteInput): string[] {
  const s = input.site;
  return [s.prior_collaboration_detail, s.institution_contact_note]
    .filter((v): v is string => has(v) && !NOT_KNOWN.test(v.trim()))
    .map(v => v.trim().replace(/[.;]+$/, ''));
}
