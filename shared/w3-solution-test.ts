// ============================================================================
// ONE TEST — what a solution needs, what blocks it, what it does, what it costs
// ============================================================================
// The card Encontro 3 shows for each solution an organisation tries. Nothing
// here is new knowledge: every row is a function that already existed — the
// verdict (w3-dossier), the price band (w3-sizing), the expected effect
// (w3-benefits), the ficha, Robson's reading of the deck (nbs-catalog). This
// file only puts them side by side for ONE solution, so the same four
// questions get the same four answers for every card, and a comparison can be
// built from the cards rather than re-derived.
//
// Pure. Same inputs, same card; every row carries where it came from.
// ============================================================================

import { computeVerdict, studyRequirement, studyAlreadyDone, studiesDone, type Verdict, type W3Input } from './w3-dossier';
import { budgetLineFor, SOLUTION_COSTS, type BudgetLine, type BuildModel } from './w3-sizing';
import { benefitFor, type BenefitLine } from './w3-benefits';
import { scaleStatement } from './w3-scale';
import { getSolution, COMPLEXIDADE_LABEL, TIPO_LABEL, SOLUTION_MECHANISMS } from './nbs-catalog';
import { getSolutionFicha } from './nbs-solution-fichas';
import { shortlistForSite } from './w3-solutions';
import { labelOfWorry } from './w3-dossier';
import { approvalRequirement } from './nbs-approvals';
import type { SolutionTest } from './w3-tests';
import { notesFromInput, notesFor, toCardNote, type CardNote } from './w3-document-notes';

type Lang = 'pt' | 'en';

export interface SolutionTestCard {
  solutionId: string;
  label: string;
  familiaId: string;
  whatItIs: string;
  /** Robson's two words. `tipo` is only carried when it is a supporting measure. */
  complexity: { level: string; detail: string };
  supportingMeasure: string | null;
  /** The first sentence of the ficha's "quem precisa dizer sim", plus the study if one is named. */
  needs: string[];
  /** The verdict — what blocks it, and the one thing that would unblock it. */
  verdict: Verdict;
  /** Where the verdict came from, in words a page can print (`verdict.source` is the audit string). */
  verdictSource: string;
  /** The scale-honesty statement for a site-specific figure, as markdown lines for the CHAT — never for the card body. */
  scaleLines: string[];
  /** The effect, with the number when the footprint or count closes one. */
  effect: { headline: string | null; claim: string; siteSpecific: boolean; nota: string | null; source: string };
  /** The price line, in the ficha's own basis. */
  cost: { note: string; source: string; estimado: boolean; basis: BudgetLine['basis'] | 'none' } | null;
  /** The ficha's upkeep sentence, first sentence only. */
  upkeep: string;
  /** Where the site record argues with this solution, in one sentence. */
  caveat: string | null;
  /** "responde a …" when the solution answers a mechanism the organisation named. */
  answersWorry: string | null;
  /** The same, for the worry they put FIRST — what "responde ao que preocupa" may mean. */
  answersFocusWorry: string | null;
  /** The number this card's cost and effect were computed from, so it can be read back. */
  sizedBy: { areaM2?: number; units?: number };
  /**
   * What the organisation's OWN files say about this solution and this place —
   * quoted, with the file named. Set beside the rows above, never folded into
   * them: the verdict, the price and the effect stay functions. Empty when
   * nothing was sent or nothing in it bears on this card. shared/w3-document-notes.ts
   */
  fromTheirFiles: CardNote[];
  /**
   * How many notes hold for the PLACE whatever is built (work window, access,
   * money on hand…). Counted, not listed: listed on every card they buried each
   * card's own findings under the same six lines (staging, 2026-09-21). They are
   * listed once, under the comparison.
   */
  placeNoteCount: number;
}

/** First sentence of a ficha paragraph — the card is a summary, the sheet is the whole text. */
export function firstSentence(text: string): string {
  const m = /^(.+?[.!?])(\s|$)/.exec(text.trim());
  return (m ? m[1] : text).trim();
}

export function buildSolutionTest(
  solutionId: string,
  input: W3Input,
  test: SolutionTest | undefined,
  lang: Lang = 'pt',
): SolutionTestCard | null {
  const pt = lang === 'pt';
  const sol = getSolution(solutionId);
  const ficha = getSolutionFicha(solutionId);
  if (!sol || !ficha) return null;

  // The test's own size when it has one (0 = asked and unknown); the place's otherwise.
  const areaM2 = test?.areaM2 !== undefined ? (test.areaM2 || undefined) : (input.areaM2 || undefined);
  const units = test?.units || undefined;
  const buildModel = (input.w3?.construction_model || undefined) as BuildModel | undefined;

  const verdict = computeVerdict(solutionId, input, lang);
  const study = studyRequirement(solutionId, input.site);
  const studyHeld = studyAlreadyDone(solutionId, input.site);
  // Who has to say yes FOR THIS ORGANISATION'S LAND — the tenure-aware read the
  // concept note already uses, one line per door. The ficha's own first
  // sentence only when the approval reader has nothing for this solution.
  const appr = approvalRequirement(solutionId, input.site.land_tenure);
  const needs: string[] = appr?.bodies.length
    ? appr.bodies.map(b => `${b.name} — ${pt ? b.whatPt : b.whatEn}`)
    : [firstSentence(pt ? ficha.pt.quemPrecisaDizerSim : ficha.en.quemPrecisaDizerSim)];
  if (appr?.instrumentPt) needs.push(pt ? appr.instrumentPt : (appr.instrumentEn ?? appr.instrumentPt));
  if (study) needs.push(pt ? `Precisa de ${study.pt}.` : `Needs ${study.en}.`);
  if (studyHeld) needs.push(pt ? `Pede ${studyHeld.pt} — já realizado, segundo a organização${studyHeld.source ? ` (${studyHeld.source})` : ''}.` : `Asks for ${studyHeld.en} — already done, according to the organisation${studyHeld.source ? ` (${studyHeld.source})` : ''}.`);

  const line = budgetLineFor(solutionId, SOLUTION_COSTS[solutionId]?.basis === 'm2' ? areaM2 : undefined, units, buildModel);
  const cost = line
    ? { note: pt ? line.notePt : line.noteEn, source: pt ? line.sourcePt : line.sourceEn, estimado: line.estimado, basis: line.basis }
    : null;

  const perM2 = SOLUTION_COSTS[solutionId]?.basis === 'm2';
  const ben: BenefitLine | null = benefitFor(solutionId, perM2 ? areaM2 : undefined, units);
  // The scale honesty note travels WITH the figure — said in the chat, in
  // markdown, right before the card, so "parece pouco" never needs a second
  // beat. It is several lines and belongs in a bubble, not in a card cell.
  const scale = ben?.siteSpecific && perM2 && areaM2 ? scaleStatement([solutionId], areaM2, input.site.site_worry) : null;
  const effect = {
    headline: ben ? (pt ? ben.headlinePt : ben.headlineEn) : null,
    claim: ben ? (pt ? ben.claimPt : ben.claimEn) : (pt ? sol.pt.whatItIs : sol.en.whatItIs),
    siteSpecific: !!ben?.siteSpecific,
    nota: ben?.notaPt ? (pt ? ben.notaPt : ben.notaEn ?? ben.notaPt) : null,
    source: ben
      ? (pt ? ben.sourcePt : ben.sourceEn)
      : (pt ? 'sem número de referência na base de evidências' : 'no reference figure in the evidence base'),
  };

  const entry = shortlistForSite({ site: input.site }, lang).find(e => e.solution.id === solutionId);
  const caveat = entry ? (pt ? entry.caveatPt : entry.caveatEn) ?? null : null;

  const worries = String(input.site.site_worry ?? '').split(',').map(w => w.trim()).filter(Boolean);
  const hit = worries.find(w => (SOLUTION_MECHANISMS[solutionId] ?? []).includes(w as any));
  const answersWorry = hit ? labelOfWorry(hit, pt) : null;
  // The worry they put FIRST — Encontro 3's focus question moves it there — so
  // every reader can tell "answers what weighs most" from "answers something
  // else they also named". Null when this solution answers neither.
  const focus = worries.find(w => w && w !== 'other') ?? null;
  const answersFocusWorry = focus && (SOLUTION_MECHANISMS[solutionId] ?? []).includes(focus as any) ? labelOfWorry(focus, pt) : null;

  const cx = COMPLEXIDADE_LABEL[sol.complexidade][lang];
  const label = pt ? sol.pt.label : sol.en.label;
  return {
    verdictSource: pt
      ? `ficha ${label} · registro do lugar (Encontro 2)`
      : `${label} ficha · site record (Encontro 2)`,
    scaleLines: scale ? (pt ? scale.linesPt : scale.linesEn) : [],
    solutionId,
    label: pt ? sol.pt.label : sol.en.label,
    familiaId: sol.familiaId,
    whatItIs: pt ? sol.pt.whatItIs : sol.en.whatItIs,
    complexity: { level: cx.label, detail: cx.detail },
    supportingMeasure: sol.tipo === 'apoio' ? `${TIPO_LABEL.apoio[lang].label} — ${TIPO_LABEL.apoio[lang].detail}` : null,
    needs,
    verdict,
    effect,
    cost: cost ?? (SOLUTION_COSTS[solutionId]?.basis === 'none'
      ? { note: pt ? 'A ficha não fecha um preço para esta solução.' : 'The ficha does not close a price for this solution.', source: pt ? 'ficha' : 'ficha', estimado: false, basis: 'none' }
      : null),
    upkeep: firstSentence(pt ? ficha.pt.quemCuidaDepois : ficha.en.quemCuidaDepois),
    caveat,
    answersWorry,
    answersFocusWorry,
    // What THIS card's numbers rest on: the count for a counted solution, the
    // footprint for a measured one — never the footprint under a cistern.
    sizedBy: units ? { units } : perM2 && areaM2 ? { areaM2 } : {},
    fromTheirFiles: notesFor(solutionId, notesFromInput(input)).map(n => toCardNote(n, lang, studiesDone(input.site))).filter(n => n.scope === 'solution' || n.stance === 'dito'),
    placeNoteCount: notesFromInput(input).filter(n => n.solutionId === '*' && n.stance !== 'dito').length,
  };
}
