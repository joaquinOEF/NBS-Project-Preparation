// ============================================================================
// THE COMPARISON — the solutions an organisation tested, side by side
// ============================================================================
// What Encontro 3 hands back now. Ana (15 Sept): "ter como output um
// comparativo de prós e contras de cada SbN. Para cada opção, pergunta se têm
// o que é necessário para implementar e dá uma expectativa de impacto."
//
// Derived, never narrated: every cell is a test card row, and every "a favor"
// or "contra" is a rule over facts the cards already carry, with its source.
// The organisation's own contribution is one row — its reaction — and it is
// quoted as theirs, never blended into ours.
//
// ⚠️ WRITTEN REGISTER. This lands on a page someone downloads, so it is in the
// third person, states what each option is, and never explains how it was
// built. See docs/document-register.md.
// ============================================================================

import { buildSolutionTest, type SolutionTestCard } from './w3-solution-test';
import { REACTION, type SolutionTest } from './w3-tests';
import type { W3Input } from './w3-dossier';
import { getFamilia } from './nbs-catalog';
import { parseCriteria, fitFor, criteriaScore, CRITERIA, WHO, HARDEST, FIT_MARK, type CriterionFit, type WhoId, type HardestId } from './w3-criteria';
import { notesFromInput, placeNotes, toCardNote, STANCE_LABEL, NOTES_HEADING, type CardNote } from './w3-document-notes';
import { studiesDone } from './w3-dossier';

type Lang = 'pt' | 'en';

export interface ComparisonPoint {
  text: string;
  source: string;
}

export interface ComparisonColumn {
  solutionId: string;
  label: string;
  familia: string;
  card: SolutionTestCard;
  /** Derived, each with its source. Empty is allowed and honest. */
  pros: ComparisonPoint[];
  cons: ComparisonPoint[];
  /** The organisation's reaction, in the written register; null when not given. */
  reaction: { value: SolutionTest['reaction']; text: string } | null;
  /** Their answer to this solution's decisive-detail question, if any. */
  detail: string | null;
  /** "Quem faria isso aí?" — theirs, in the written register; null when not asked. */
  who: string | null;
  /** "O que mais pega?" — theirs; their own words when they wrote them. */
  hardest: string | null;
  /** How this solution does on what THEY said weighs most — empty when they named nothing. */
  criteria: Array<CriterionFit & { label: string; mark: string }>;
}

export interface Comparison {
  columns: ComparisonColumn[];
  /** The place these were tested against. */
  siteName: string | null;
  bairro: string | null;
  orgName: string | null;
  /** What every column was sized by, so the reader knows what the numbers rest on. */
  sizedBy: { areaM2?: number; source?: string };
  /** The coordinator's technical reading, when one was entered. Attributed as theirs. */
  technicalNote: string | null;
  /**
   * What the organisation's own files say about the PLACE, whatever is built —
   * once, under the table, not repeated in every column. A solution's own notes
   * are in its column's prós / contras, each with the file as its source.
   */
  placeNotes: { heading: string; notes: CardNote[] };
  /** What they said weighs most, in words — the columns are ordered by it. Empty when nothing was named. */
  criteriaNamed: string[];
  docLabel: string;
  docAudience: string;
  rows: Array<{ id: RowId; label: string }>;
}

export type RowId =
  | 'criteria' | 'complexity' | 'type' | 'needs' | 'blocks' | 'effect' | 'cost' | 'upkeep' | 'pros' | 'cons' | 'who' | 'hardest' | 'reaction' | 'detail';

const STATE_TEXT: Record<string, { pt: string; en: string }> = {
  ready: { pt: 'Nada trava', en: 'Nothing blocks it' },
  needs_study: { pt: 'Precisa de estudo', en: 'Needs a study' },
  needs_permission: { pt: 'Precisa de autorização', en: 'Needs permission' },
  needs_site: { pt: 'Falta o lugar', en: 'The place is missing' },
};

export function verdictText(state: string, lang: Lang): string {
  return STATE_TEXT[state]?.[lang] ?? state;
}

const ROWS: Record<Lang, Array<{ id: RowId; label: string }>> = {
  pt: [
    { id: 'criteria', label: 'No que pesa pra organização' },
    { id: 'complexity', label: 'Complexidade' },
    { id: 'type', label: 'Tipo' },
    { id: 'needs', label: 'O que precisa' },
    { id: 'blocks', label: 'O que trava' },
    { id: 'effect', label: 'Efeito esperado' },
    { id: 'cost', label: 'Custo estimado' },
    { id: 'upkeep', label: 'Quem cuida depois' },
    { id: 'pros', label: 'A favor' },
    { id: 'cons', label: 'Contra' },
    { id: 'who', label: 'Quem faria, segundo a organização' },
    { id: 'hardest', label: 'O que mais pega, segundo a organização' },
    { id: 'reaction', label: 'Leitura da organização' },
    { id: 'detail', label: 'Detalhe informado' },
  ],
  en: [
    { id: 'criteria', label: 'On what weighs for the organisation' },
    { id: 'complexity', label: 'Complexity' },
    { id: 'type', label: 'Type' },
    { id: 'needs', label: 'What it needs' },
    { id: 'blocks', label: 'What blocks it' },
    { id: 'effect', label: 'Expected effect' },
    { id: 'cost', label: 'Estimated cost' },
    { id: 'upkeep', label: 'Who looks after it' },
    { id: 'pros', label: 'For' },
    { id: 'cons', label: 'Against' },
    { id: 'who', label: 'Who would do it, according to the organisation' },
    { id: 'hardest', label: 'What would be hardest, according to the organisation' },
    { id: 'reaction', label: "The organisation's reading" },
    { id: 'detail', label: 'Detail given' },
  ],
};

/**
 * The rules. Each one reads a fact the card already carries and says what it
 * means for choosing — and names the fact, so a reader can disagree with the
 * fact rather than with us.
 */
export function prosAndCons(card: SolutionTestCard, lang: Lang): { pros: ComparisonPoint[]; cons: ComparisonPoint[] } {
  const pt = lang === 'pt';
  const pros: ComparisonPoint[] = [];
  const cons: ComparisonPoint[] = [];

  if (card.answersWorry) {
    pros.push({
      text: pt ? `Responde ao problema nomeado: ${card.answersWorry}.` : `Answers the named problem: ${card.answersWorry}.`,
      source: pt ? 'mecanismo da solução × risco nomeado no Encontro 2' : "the solution's mechanism × the risk named in Encontro 2",
    });
  }
  if (card.verdict.state === 'ready') {
    pros.push({
      text: pt ? 'Nada trava o projeto daqui — falta cotação e assinatura.' : 'Nothing blocks the project from here — a quote and a signature remain.',
      source: card.verdictSource,
    });
  }
  if (card.verdict.state === 'needs_study') {
    cons.push({
      text: pt ? `Não se desenha só com o que a comunidade sabe: ${card.verdict.unblockedBy}.` : `Cannot be designed on community knowledge alone: ${card.verdict.unblockedBy}.`,
      source: card.verdictSource,
    });
  }
  if (card.verdict.state === 'needs_permission') {
    cons.push({
      text: pt ? `Depende de papel: ${card.verdict.unblockedBy}.` : `Depends on paperwork: ${card.verdict.unblockedBy}.`,
      source: card.verdictSource,
    });
  }
  if (card.verdict.state === 'needs_site') {
    cons.push({
      text: pt ? 'Sem lugar marcado, nem tamanho nem preço fecham.' : 'Without a marked place, neither size nor price closes.',
      source: card.verdictSource,
    });
  }
  if (card.caveat) {
    cons.push({ text: card.caveat, source: pt ? 'registro do lugar no Encontro 2' : 'the site record from Encontro 2' });
  }
  if (card.complexity.level === (pt ? 'Simples' : 'Simple')) {
    pros.push({
      text: pt ? 'Complexidade simples — dá pra fazer com apoio técnico leve.' : 'Simple — can be built with light technical support.',
      source: 'Capretz, Pipeline Assessment COUGAR POA, ago. 2026',
    });
  }
  if (card.complexity.level === (pt ? 'Complexa' : 'Complex')) {
    cons.push({
      text: pt ? 'Escala de paisagem — depende da prefeitura, de licença e de gestão de longo prazo.' : 'Landscape scale — depends on the city, a licence and long-term governance.',
      source: 'Capretz, Pipeline Assessment COUGAR POA, ago. 2026',
    });
  }
  if (card.effect.headline && card.effect.siteSpecific) {
    pros.push({
      text: pt ? `Efeito estimado: ${card.effect.headline}` : `Estimated effect: ${card.effect.headline}`,
      source: card.effect.source,
    });
  }
  if (!card.effect.headline) {
    cons.push({
      text: pt ? 'Sem número de referência para o efeito — o que existe é a descrição da ficha.' : 'No reference figure for the effect — what exists is the ficha description.',
      source: card.effect.source,
    });
  }
  if (card.cost?.basis === 'none') {
    cons.push({ text: pt ? 'A ficha não fecha um preço.' : 'The ficha does not close a price.', source: 'ficha' });
  }
  // Their own files, for THIS solution. The place-wide ones are shown once,
  // under the table (Comparison.placeNotes).
  const fileSource = (n: CardNote) => (pt ? `arquivo enviado: ${n.source}` : `file sent: ${n.source}`);
  for (const n of card.fromTheirFiles.filter(x => x.scope === 'solution')) {
    if (n.stance === 'a-favor') pros.push({ text: n.text, source: fileSource(n) });
    else cons.push({ text: n.stance === 'condicao' ? `${STANCE_LABEL.condicao[lang]}: ${n.text}` : n.text, source: fileSource(n) });
  }
  return { pros, cons };
}

export function buildComparison(
  input: W3Input,
  tests: SolutionTest[],
  lang: Lang = 'pt',
  technicalNote?: string | null,
): Comparison {
  const pt = lang === 'pt';
  const columns: ComparisonColumn[] = [];
  const criteria = parseCriteria(input.w3?._choice_criteria);
  for (const t of tests) {
    const card = buildSolutionTest(t.solutionId, input, t, lang);
    if (!card) continue;
    const { pros, cons } = prosAndCons(card, lang);
    const familia = getFamilia(card.familiaId as any);
    columns.push({
      solutionId: t.solutionId,
      label: card.label,
      familia: familia ? (pt ? familia.pt.label : familia.en.label) : card.familiaId,
      card,
      pros,
      cons,
      reaction: t.reaction ? { value: t.reaction, text: pt ? REACTION[t.reaction].pt : REACTION[t.reaction].en } : null,
      detail: t.detailAnswer?.trim() ? t.detailAnswer.trim() : null,
      who: t.who && WHO[t.who as WhoId] ? (pt ? WHO[t.who as WhoId].reportPt : WHO[t.who as WhoId].reportEn) : null,
      hardest: t.hardest === 'outro' && t.hardestNote?.trim()
        ? `“${t.hardestNote.trim()}”`
        : t.hardest && HARDEST[t.hardest as HardestId] ? (pt ? HARDEST[t.hardest as HardestId].reportPt : HARDEST[t.hardest as HardestId].reportEn) : null,
      criteria: criteria.map(id => {
        const f = fitFor(id, card, t, lang);
        const c = CRITERIA.find(x => x.id === id)!;
        return { ...f, label: pt ? c.rowPt : c.rowEn, mark: FIT_MARK[f.fit] };
      }),
    });
  }
  // ⚠️ ORDERED BY WHAT THEY SAID WEIGHS MOST — not by the order they happened to
  // test in. Stable: equal scores keep the order tried. With no criteria named
  // the order is untouched, and the row is not shown at all.
  if (criteria.length) {
    const at = new Map(columns.map((c, i) => [c.solutionId, i]));
    columns.sort((a, b) => criteriaScore(b.criteria) - criteriaScore(a.criteria) || at.get(a.solutionId)! - at.get(b.solutionId)!);
  }
  const areaM2 = input.areaM2 || undefined;
  return {
    columns,
    siteName: input.site.site_name?.trim() || null,
    bairro: input.site.bairro?.trim() || null,
    orgName: input.org?.org_name?.trim() || null,
    // One line "calculated over N m²" for the whole table was right when the
    // place had one size. Since sizes are per TEST (a roof's, a strip's) it would
    // be wrong under any column sized otherwise — each cost cell then says its own.
    sizedBy: areaM2 && columns.every(c => !c.card.sizedBy.areaM2 || c.card.sizedBy.areaM2 === areaM2)
      ? { areaM2, ...(input.site.site_area_source ? { source: input.site.site_area_source } : {}) }
      : {},
    technicalNote: technicalNote?.trim() || null,
    placeNotes: { heading: NOTES_HEADING[lang], notes: placeNotes(notesFromInput(input)).map(n => toCardNote(n, lang, studiesDone(input.site))) },
    docLabel: pt ? 'Comparação das soluções testadas' : 'Comparison of the solutions tested',
    docAudience: pt
      ? 'Para a organização e a coordenação — base para a conversa de portfólio'
      : 'For the organisation and the coordination — the basis for the portfolio conversation',
    // A row nobody has anything in is not a row: sessions from before these
    // questions existed keep exactly the comparison they had.
    rows: ROWS[lang].filter(r =>
      r.id === 'criteria' ? criteria.length > 0
      : r.id === 'who' ? columns.some(c => c.who)
      : r.id === 'hardest' ? columns.some(c => c.hardest)
      : true),
    criteriaNamed: criteria.map(id => { const c = CRITERIA.find(x => x.id === id)!; return pt ? c.rowPt : c.rowEn; }),
  };
}

/**
 * What this organisation takes to the portfolio table — one line per solution it
 * kept: what it would pursue, what that needs from SOMEBODY ELSE, who would do
 * it and what they said would be hardest. The hand-off to the project-based
 * encontro: those last two are exactly its starting questions. Written register.
 */
export function portfolioTakeaway(cmp: Comparison, lang: Lang = 'pt'): string[] {
  const pt = lang === 'pt';
  const kept = cmp.columns.filter(c => c.reaction?.value === 'faz-sentido');
  if (!kept.length) {
    return [pt
      ? `Nenhuma das ${cmp.columns.length} soluções testadas foi levada adiante pela organização — a comparação registra o motivo de cada uma.`
      : `None of the ${cmp.columns.length} solutions tested was taken forward by the organisation — the comparison records why for each.`];
  }
  return kept.map(c => {
    const needs = c.card.verdict.state === 'ready'
      ? (pt ? 'nada trava' : 'nothing blocks it')
      : (pt ? `depende de ${c.card.verdict.unblockedBy}` : `depends on ${c.card.verdict.unblockedBy}`);
    const parts = [
      `${c.label}: ${needs}`,
      c.who ? (pt ? `quem faria — ${c.who.toLowerCase()}` : `who would do it — ${c.who.toLowerCase()}`) : null,
      c.hardest ? (pt ? `o que mais pega, segundo a organização — ${c.hardest.replace(/^[A-ZÀ-Ú]/, m => m.toLowerCase())}` : `hardest, according to the organisation — ${c.hardest.replace(/^[A-Z]/, m => m.toLowerCase())}`) : null,
    ].filter(Boolean);
    return parts.join('; ') + '.';
  });
}
