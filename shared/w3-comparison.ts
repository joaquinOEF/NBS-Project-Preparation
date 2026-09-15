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
  docLabel: string;
  docAudience: string;
  rows: Array<{ id: RowId; label: string }>;
}

export type RowId =
  | 'complexity' | 'type' | 'needs' | 'blocks' | 'effect' | 'cost' | 'upkeep' | 'pros' | 'cons' | 'reaction' | 'detail';

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
    { id: 'complexity', label: 'Complexidade' },
    { id: 'type', label: 'Tipo' },
    { id: 'needs', label: 'O que precisa' },
    { id: 'blocks', label: 'O que trava' },
    { id: 'effect', label: 'Efeito esperado' },
    { id: 'cost', label: 'Custo estimado' },
    { id: 'upkeep', label: 'Quem cuida depois' },
    { id: 'pros', label: 'A favor' },
    { id: 'cons', label: 'Contra' },
    { id: 'reaction', label: 'Leitura da organização' },
    { id: 'detail', label: 'Detalhe informado' },
  ],
  en: [
    { id: 'complexity', label: 'Complexity' },
    { id: 'type', label: 'Type' },
    { id: 'needs', label: 'What it needs' },
    { id: 'blocks', label: 'What blocks it' },
    { id: 'effect', label: 'Expected effect' },
    { id: 'cost', label: 'Estimated cost' },
    { id: 'upkeep', label: 'Who looks after it' },
    { id: 'pros', label: 'For' },
    { id: 'cons', label: 'Against' },
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
    });
  }
  const areaM2 = input.areaM2 || undefined;
  return {
    columns,
    siteName: input.site.site_name?.trim() || null,
    bairro: input.site.bairro?.trim() || null,
    orgName: input.org?.org_name?.trim() || null,
    sizedBy: {
      ...(areaM2 ? { areaM2 } : {}),
      ...(input.site.site_area_source ? { source: input.site.site_area_source } : {}),
    },
    technicalNote: technicalNote?.trim() || null,
    docLabel: pt ? 'Comparação das soluções testadas' : 'Comparison of the solutions tested',
    docAudience: pt
      ? 'Para a organização e a coordenação — base para a conversa de portfólio'
      : 'For the organisation and the coordination — the basis for the portfolio conversation',
    rows: ROWS[lang],
  };
}
