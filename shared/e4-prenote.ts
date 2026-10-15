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
import { parseTests, sizeOf, testOf, type SolutionTest } from './w3-tests';
import { budgetLineFor, SOLUTION_COSTS, type BuildModel } from './w3-sizing';
import { benefitFor } from './w3-benefits';
import { studyRequirement } from './w3-dossier';
import { studyCostLine } from './w3-studies';
import { approvalRequirement } from './nbs-approvals';
import { HARDEST, type HardestId } from './w3-criteria';
import { WORRY_SUBTYPES } from './site-knowledge';
import { cboDisplayValue } from './cbo-field-catalog';
import { parseVisit } from './e4-visit';
import { noteIndicators, INDICATOR_MENU_REVIEW, type ResolvedIndicator } from './e4-indicators';

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
}

/** What Encontro 4 stores about the solution it confirmed. */
export interface E4Solution {
  solutionId: string;
  source: 'visita' | 'organizacao';
  areaM2?: number;
  units?: number;
}

export type PrenoteSectionId = 'problema' | 'solucao' | 'impacto' | 'indicadores' | 'orcamento' | 'parceiros' | 'pendencias';
export const PRENOTE_SECTIONS: PrenoteSectionId[] = ['problema', 'solucao', 'impacto', 'indicadores', 'orcamento', 'parceiros', 'pendencias'];

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
  const tests = parseTests(input.type.solution_tests_json);
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
    problema: 'O problema', solucao: 'A solução', impacto: 'Impacto esperado', indicadores: 'Indicadores',
    orcamento: 'Orçamento básico', parceiros: 'Parceiros e autorizações', pendencias: 'Pendências',
    estimate: 'estimativa técnica', reviewed: (by?: string, at?: string) => `revisada${by ? ` por ${by}` : ''}${at ? ` em ${fmtDate(at)}` : ''}`,
    waived: 'revisão técnica dispensada pela coordenação',
  },
  en: {
    problema: 'The problem', solucao: 'The solution', impacto: 'Expected impact', indicadores: 'Indicators',
    orcamento: 'Basic budget', parceiros: 'Partners and approvals', pendencias: 'Open items',
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
    problema: [s.site_worry, s.site_story, s.beneficiaries_note],
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
      solution: null, title: pt ? 'Pré-nota' : 'Pre-note', orgName, place, sections: [], budget: [], total: null,
      indicators: [], gaps, review, status, indicatorsReviewed: !!INDICATOR_MENU_REVIEW,
    };
  }

  const s = getSolution(sol.id)!;
  const solLabel = label(s, lang);
  const size = { ...(sol.areaM2 ? { areaM2: sol.areaM2 } : {}), ...(sol.units ? { units: sol.units } : {}) };
  const tests = parseTests(type.solution_tests_json);
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
  });
  const study = studyRequirement(sol.id, site);
  const studyLine = study ? studyCostLine(study.pt, lang) : null;
  const studyFig = studyLine?.match(/R\$ ([\d.,]+)(?:–R\$ ([\d.,]+))?/);
  const num = (x: string) => Number(x.replace(/[.,]/g, ''));
  budget.push({
    label: pt ? 'Estudos e licenças' : 'Studies and permits',
    value: study ? (studyFig ? studyFig[0] : (pt ? 'a cotar' : 'to be quoted')) : (pt ? 'nenhum estudo exigido pela ficha' : 'no study required by the ficha'),
    ...(studyFig ? { low: num(studyFig[1]), high: num(studyFig[2] ?? studyFig[1]) } : {}),
    source: study ? (pt ? `${study.pt} — custos de estudo` : `${study.en} — study costs`) : (pt ? 'ficha da solução' : "the solution's ficha"),
  });
  budget.push({
    label: pt ? 'Manutenção no 1º ano' : 'Upkeep, first year',
    value: has(ops.opex_band) ? display('operations_sustain', 'opex_band', ops.opex_band) : (pt ? 'a levantar' : 'to be estimated'),
    source: has(ops.opex_band) ? (pt ? 'estimativa da organização' : "the organisation's estimate") : (pt ? 'a ficha descreve o cuidado, sem valor' : 'the ficha describes the upkeep, with no figure'),
  });
  budget.push({
    label: pt ? 'Contrapartida da organização' : "The organisation's contribution",
    value: has(type.e4_contribution) ? type.e4_contribution.trim() : (pt ? 'a definir' : 'to be defined'),
    source: has(type.e4_contribution) ? theirs : (pt ? 'ainda não respondido' : 'not answered yet'),
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
