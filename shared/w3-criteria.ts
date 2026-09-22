// ============================================================================
// WHAT WEIGHS MOST FOR THEM — asked once, and the comparison answers to it
// ============================================================================
// JVP, 2026-09-21, after a staging run in which three solutions were tested in
// 100 seconds and all three "made sense": "are we getting enough from the
// person? … they get the solutions but they're also … thinking about what they
// could or could not do." The room was being shown options and asked for a
// thumb. Decision-aid practice (IPDAS) and participatory multi-criteria work on
// NbS agree on the order: FIRST what matters to the people choosing, THEN the
// options set against it — and kept light, because a heavy values exercise buys
// little. So: one question before the shelf, two per test, and a comparison
// ordered by their own criteria.
//
// Every criterion is one a FUNCTION can read off the card — the catalogue's
// cost band and delivery, the verdict, the mechanism match. Nothing here is a
// model's opinion, and "light upkeep" is deliberately absent: the fichas carry
// upkeep as prose, not as a band, and a criterion we cannot rank honestly is a
// row of guesses.
// Pure.
// ============================================================================
import type { SolutionTestCard } from './w3-solution-test';
import { getSolution } from './nbs-catalog';
import { budgetLineFor } from './w3-sizing';
import type { SolutionTest } from './w3-tests';

export type CriterionId = 'custo' | 'nossa-gente' | 'pouco-papel' | 'efeito';
export type Fit = 'bom' | 'medio' | 'fraco';

export const CRITERIA: Array<{ id: CriterionId; chipPt: string; chipEn: string; dPt: string; dEn: string; rowPt: string; rowEn: string }> = [
  { id: 'custo', chipPt: 'Custar pouco', chipEn: 'Low cost', dPt: 'O que cabe no bolso', dEn: 'What the budget can carry', rowPt: 'custo', rowEn: 'cost' },
  { id: 'nossa-gente', chipPt: 'Dar pra fazer com a nossa gente', chipEn: 'Doable with our own people', dPt: 'Mutirão, sem depender de empresa', dEn: 'A mutirão, without depending on a contractor', rowPt: 'fazer com a própria gente', rowEn: 'doing it with their own people' },
  { id: 'pouco-papel', chipPt: 'Depender de pouca autorização', chipEn: 'Few authorisations', dPt: 'Menos porta pra bater', dEn: 'Fewer doors to knock on', rowPt: 'pouca autorização', rowEn: 'few authorisations' },
  { id: 'efeito', chipPt: 'Resolver mais o problema', chipEn: 'Doing most for the problem', dPt: 'O maior efeito no que preocupa', dEn: 'The biggest effect on the worry', rowPt: 'efeito no problema', rowEn: 'effect on the problem' },
];
export const MAX_CRITERIA = 2;

export const parseCriteria = (csv: string | undefined | null): CriterionId[] =>
  String(csv ?? '').split(',').map(x => x.trim()).filter((x): x is CriterionId => CRITERIA.some(c => c.id === x)).slice(0, MAX_CRITERIA);

/** What the public field stores — words, because a `feeds` field is printed as it is. */
export const criteriaSentence = (ids: CriterionId[], lang: 'pt' | 'en') =>
  ids.map(id => CRITERIA.find(c => c.id === id)!).map(c => (lang === 'pt' ? c.chipPt : c.chipEn).toLowerCase()).join('; ');

// ── The two questions every test asks ───────────────────────────────────────
export type WhoId = 'nos' | 'nos-com-parceiro' | 'contratar' | 'ninguem' | 'nao-sei';
/** 'pulou' = they skipped the question — never 'nada', which is an answer ("nada disso pega"). */
export type HardestId = 'autorizacao' | 'estudo' | 'custo' | 'cuidar' | 'espaco' | 'nada' | 'outro' | 'pulou';

export const WHO: Record<WhoId, { chipPt: string; chipEn: string; reportPt: string; reportEn: string }> = {
  nos: { chipPt: 'A gente, em mutirão', chipEn: 'Us, in a mutirão', reportPt: 'A própria organização, em mutirão', reportEn: 'The organisation itself, as a mutirão' },
  'nos-com-parceiro': { chipPt: 'A gente, com um parceiro técnico', chipEn: 'Us, with a technical partner', reportPt: 'A organização, com um parceiro técnico', reportEn: 'The organisation, with a technical partner' },
  contratar: { chipPt: 'Teria que contratar', chipEn: 'It would have to be hired', reportPt: 'Execução contratada', reportEn: 'Hired works' },
  ninguem: { chipPt: 'Hoje ninguém — teria que achar', chipEn: 'Nobody today — someone to find', reportPt: 'Ninguém hoje — a encontrar', reportEn: 'Nobody today — to be found' },
  'nao-sei': { chipPt: 'Não sei dizer', chipEn: 'I could not say', reportPt: 'Não soube dizer', reportEn: 'Could not say' },
};

export const HARDEST: Record<HardestId, { reportPt: string; reportEn: string }> = {
  autorizacao: { reportPt: 'Conseguir a autorização', reportEn: 'Getting the authorisation' },
  estudo: { reportPt: 'O estudo técnico', reportEn: 'The technical study' },
  custo: { reportPt: 'O custo', reportEn: 'The cost' },
  cuidar: { reportPt: 'Cuidar depois', reportEn: 'Looking after it afterwards' },
  espaco: { reportPt: 'O espaço no lugar', reportEn: 'The space at the place' },
  nada: { reportPt: 'Nada de grande', reportEn: 'Nothing major' },
  outro: { reportPt: 'Outra coisa', reportEn: 'Something else' },
  pulou: { reportPt: 'Não respondeu', reportEn: 'Not answered' },
};

/** The "what would be hardest?" chips for ONE card — only what that card actually carries. */
export function hardestOptions(card: SolutionTestCard, lang: 'pt' | 'en'): Array<{ id: HardestId; label: string; description?: string }> {
  const pt = lang === 'pt';
  const out: Array<{ id: HardestId; label: string; description?: string }> = [];
  if (card.verdict.state === 'needs_permission') out.push({ id: 'autorizacao', label: pt ? 'Conseguir a autorização' : 'Getting the authorisation', description: card.verdict.unblockedBy });
  if (card.verdict.state === 'needs_study') out.push({ id: 'estudo', label: pt ? 'O estudo técnico' : 'The technical study', description: card.verdict.unblockedBy });
  out.push({ id: 'custo', label: pt ? 'O custo' : 'The cost' });
  out.push({ id: 'cuidar', label: pt ? 'Cuidar depois' : 'Looking after it afterwards', description: card.upkeep.slice(0, 90) });
  out.push({ id: 'espaco', label: pt ? 'O espaço no lugar' : 'The space at the place' });
  out.push({ id: 'nada', label: pt ? 'Nada disso pega' : 'None of that is hard' });
  return out;
}

// ── How one tested solution does on one criterion ───────────────────────────
export interface CriterionFit { id: CriterionId; fit: Fit; why: string; source: string }

export function fitFor(id: CriterionId, card: SolutionTestCard, test: SolutionTest | undefined, lang: 'pt' | 'en'): CriterionFit {
  const pt = lang === 'pt';
  const sol = getSolution(card.solutionId);
  if (id === 'custo') {
    // ⚠️ The PRICE this card shows, for the size it was tested at — not the
    // catalogue's rough class. An end-to-end run read "custo alto" for a green
    // retaining wall whose own price row said R$ 8–12 mil, below the solution it
    // was ranked under. Thresholds are for a community organisation's budget.
    const line = budgetLineFor(card.solutionId, card.sizedBy.areaM2, card.sizedBy.units);
    if (line?.highBrl != null) {
      const hi = line.highBrl;
      const fit: Fit = hi <= 20_000 ? 'bom' : hi <= 100_000 ? 'medio' : 'fraco';
      const fmt = (n: number) => `R$ ${Math.round(n / 1000).toLocaleString(pt ? 'pt-BR' : 'en-US')} mil`;
      return { id, fit, why: pt ? `até ${fmt(hi)} nesse tamanho` : `up to ${fmt(hi).replace(' mil', 'k')} at this size`, source: pt ? 'faixa de preço da ficha, no tamanho testado' : 'the ficha\'s price band, at the size tested' };
    }
    const band = sol?.costBand ?? 'medio';
    const fit: Fit = band === 'baixo' ? 'bom' : band === 'medio' ? 'medio' : 'fraco';
    return { id, fit, why: pt ? `custo ${band === 'medio' ? 'médio' : band}` : `${band === 'baixo' ? 'low' : band === 'medio' ? 'medium' : 'high'} cost`, source: pt ? 'catálogo (faixa de custo)' : 'catalogue (cost band)' };
  }
  if (id === 'nossa-gente') {
    // Their own answer outranks our classification: they know their people.
    const who = (test as any)?.who as WhoId | undefined;
    if (who === 'nos') return { id, fit: 'bom', why: pt ? 'a organização diz que faz em mutirão' : 'the organisation says it can, as a mutirão', source: pt ? 'resposta da organização' : "the organisation's answer" };
    if (who === 'nos-com-parceiro') return { id, fit: 'medio', why: pt ? 'a organização faz, com um parceiro técnico' : 'the organisation does it, with a technical partner', source: pt ? 'resposta da organização' : "the organisation's answer" };
    if (who === 'contratar' || who === 'ninguem') return { id, fit: 'fraco', why: pt ? WHO[who].reportPt.toLowerCase() : WHO[who].reportEn.toLowerCase(), source: pt ? 'resposta da organização' : "the organisation's answer" };
    const d = sol?.delivery ?? 'parceria';
    const fit: Fit = d === 'mutirao' ? 'bom' : d === 'parceria' ? 'medio' : 'fraco';
    return { id, fit, why: pt ? (d === 'mutirao' ? 'dá pra fazer em mutirão' : d === 'parceria' ? 'pede um parceiro técnico' : 'pede responsável técnico e licença') : (d === 'mutirao' ? 'can be built as a mutirão' : d === 'parceria' ? 'asks for a technical partner' : 'asks for a licensed lead and a permit'), source: pt ? 'catálogo (forma de execução)' : 'catalogue (delivery)' };
  }
  if (id === 'pouco-papel') {
    const st = card.verdict.state;
    const fit: Fit = st === 'ready' ? 'bom' : st === 'needs_permission' ? 'fraco' : 'medio';
    return { id, fit, why: pt ? (st === 'ready' ? 'nada trava' : st === 'needs_permission' ? `depende de ${card.verdict.unblockedBy}` : 'o que trava é técnico, não papel') : (st === 'ready' ? 'nothing blocks it' : st === 'needs_permission' ? `depends on ${card.verdict.unblockedBy}` : 'what blocks it is technical, not paperwork'), source: pt ? 'veredito' : 'verdict' };
  }
  // ⚠️ THE WORRY THEY PUT FIRST, not any worry they ever named. Encontro 3 asks
  // which one this project faces first and moves it to the front of
  // `site_worry`; the shelf already reserves seats on that reading. This line
  // did not, so on a heat-first project a bioswale scored a full ✔ "responde ao
  // que preocupa" (it answers enxurrada, named second) and ranked above the rain
  // garden the technical visit had recommended (staging, 22 Sept).
  const answersFocus = !!card.answersWorry && card.answersWorry === card.answersFocusWorry;
  const fit: Fit = answersFocus ? 'bom' : card.answersWorry || card.effect.headline ? 'medio' : 'fraco';
  const whyPt = answersFocus ? 'responde ao que pesa mais'
    : card.answersWorry ? `o problema que resolve — ${card.answersWorry.toLowerCase()} — não é o foco deste projeto`
    : card.effect.headline ? 'tem efeito estimado, em outro problema' : 'sem número de referência';
  const whyEn = answersFocus ? 'answers what weighs most'
    : card.answersWorry ? `what it answers — ${card.answersWorry.toLowerCase()} — is not this project's focus`
    : card.effect.headline ? 'has an estimated effect, on another problem' : 'no reference figure';
  return { id, fit, why: pt ? whyPt : whyEn, source: pt ? 'catálogo (mecanismo) e ficha' : 'catalogue (mechanism) and ficha' };
}

const POINTS: Record<Fit, number> = { bom: 2, medio: 1, fraco: 0 };
/** First criterion counts double — it is the one they named first. */
export function criteriaScore(fits: CriterionFit[]): number {
  return fits.reduce((n, f, i) => n + POINTS[f.fit] * (i === 0 ? 2 : 1), 0);
}
export const FIT_MARK: Record<Fit, string> = { bom: '✔', medio: '~', fraco: '✘' };
