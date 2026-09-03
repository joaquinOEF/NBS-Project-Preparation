// ============================================================================
// THE COHORT LAYER — what the group has in common, without naming anyone
// ============================================================================
// The last gap in docs/context-first.md's registry, and the one the W3 advisor
// held back on purpose: `cohort: []` was passed deliberately, because it is the
// only input that leaves an organisation's own record.
//
// The value is real and unreachable from inside a single record — "três outras
// organizações da rede precisam do mesmo teste de infiltração, e duas estão
// paradas na mesma exigência de histórico comprovado" is the observation that
// turns an interviewer into a programme. So the question was never whether to
// pass it, but WHAT.
//
// ⚠️ AN ALLOWLIST, NEVER A SPREAD. Every line this produces is a COUNT over the
// cohort — how many organisations share a need, an instrument, a barrier, a
// bairro. No names, no quotes, no site, no verdict of any individual
// organisation. The previous time a peer-facing view was built as a denylist
// over a member object, a `review` field and its reviewer's name reached an
// external partner; a spread leaks whatever is added to the type next, and this
// type is added to often.
//
// The counts are what carry the advice anyway. An organisation does not need to
// know WHO else needs the infiltration test — the coordination does, and it has
// the synergy report for that. It needs to know that it is not alone in needing
// it, because that is what makes pooling worth asking for.
// ============================================================================

import type { SynergyFacts } from '@shared/w3-synergies';

/** The de-identified facts a peer contributes. Never the member object. */
export interface CohortPeer {
  bairro: string | null;
  worry: string | null;
  studyNeeds: string[];
  approvalInstruments: string[];
  fundingBlocked: string[];
  solutions: string[];
}

/** ⚠️ The allowlist itself. Adding a field here is a deliberate act. */
export function peerFrom(facts: SynergyFacts, bairro: string | null, worry: string | null): CohortPeer {
  return {
    bairro,
    worry,
    studyNeeds: facts.studyNeeds ?? [],
    approvalInstruments: facts.approvalInstruments ?? [],
    fundingBlocked: facts.fundingBlocked ?? [],
    solutions: facts.solutions ?? [],
  };
}

const countBy = (peers: CohortPeer[], get: (p: CohortPeer) => string[]): Array<[string, number]> => {
  const n = new Map<string, number>();
  for (const p of peers) for (const v of Array.from(new Set(get(p)))) n.set(v, (n.get(v) ?? 0) + 1);
  return Array.from(n).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
};

const orgs = (n: number, pt: boolean) =>
  pt
    ? n === 1 ? '1 outra organização' : `${n} outras organizações`
    : n === 1 ? '1 other organisation' : `${n} other organisations`;

/**
 * ⚠️ Agreement, because these lines are printed now.
 *
 * The first version wrote "1 outra organização precisam do mesmo estudo" onto a
 * concept note. Nobody's test caught it — every guard here is about what may
 * leak, and none about whether the sentence is grammatical. It was found by
 * running the simulation and reading the page, which is the only way this class
 * of defect is ever found.
 */
const agree = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The cohort in lines an advisor can use, computed against THIS organisation.
 *
 * Only what this organisation shares is reported: a study nobody else needs
 * says nothing useful to it, and listing the group's every need would be the
 * spread this file exists to avoid, in prose.
 *
 * ⚠️ Bilingual since these lines stopped being advisor-only context and started
 * reaching the page. An advisor can be handed Portuguese and write English; a
 * concept note printed in English cannot carry a Portuguese sentence, and the
 * organisations that read the English document are the funders.
 */
export function cohortLines(mine: CohortPeer, peers: CohortPeer[], lang: 'pt' | 'en' = 'pt'): string[] {
  if (!peers.length) return [];
  const pt = lang === 'pt';
  const out: string[] = [];
  const n_ = (n: number) => orgs(n, pt);

  for (const [need, n] of countBy(peers, p => p.studyNeeds)) {
    if (!mine.studyNeeds.includes(need)) continue;
    out.push(pt
      ? `${n_(n)} ${agree(n, 'precisa', 'precisam')} do mesmo estudo: ${need} — contratável em conjunto.`
      : `${n_(n)} ${agree(n, 'needs', 'need')} the same study: ${need} — contractable jointly.`);
  }
  for (const [inst, n] of countBy(peers, p => p.approvalInstruments)) {
    if (!mine.approvalInstruments.includes(inst)) continue;
    out.push(pt
      ? `${n_(n)} ${agree(n, 'passa', 'passam')} pelo mesmo instrumento de aprovação (${inst}) — uma conversa com o órgão, não uma por organização.`
      : `${n_(n)} ${agree(n, 'goes', 'go')} through the same approval instrument (${inst}) — one conversation with the authority, not one per organisation.`);
  }
  // ⚠️ ONE aggregation clause, on the first barrier only. Two funding paths
  // blocked for the same reason produced the same closing sentence twice in a
  // row inside a single paragraph — true both times, and it read as padding.
  let saidWhyItMatters = false;
  for (const [path, n] of countBy(peers, p => p.fundingBlocked)) {
    if (!mine.fundingBlocked.includes(path)) continue;
    const why = saidWhyItMatters
      ? ''
      : pt
        ? ' É exatamente o caso que a agregação num portfólio resolve.'
        : ' That is precisely the case aggregation into a portfolio solves.';
    saidWhyItMatters = true;
    out.push(pt
      ? `${n_(n)} ${agree(n, 'esbarra', 'esbarram')} na mesma barreira de financiamento (${path}).${why}`
      : `${n_(n)} ${agree(n, 'hits', 'hit')} the same funding barrier (${path}).${why}`);
  }
  for (const [bairro, n] of countBy(peers, p => (p.bairro ? [p.bairro] : []))) {
    if (!mine.bairro || bairro !== mine.bairro) continue;
    out.push(pt
      ? `${n_(n)} ${agree(n, 'trabalha', 'trabalham')} no mesmo bairro (${bairro}).`
      : `${n_(n)} ${agree(n, 'works', 'work')} in the same bairro (${bairro}).`);
  }
  for (const [worry, n] of countBy(peers, p => (p.worry ? [p.worry.split(',')[0].trim()] : []))) {
    if (!mine.worry || !mine.worry.startsWith(worry)) continue;
    // ⚠️ The risk itself is named. It is this organisation's own risk too —
    // saying "o mesmo risco principal" and leaving it unnamed made the sentence
    // read as though something were being withheld, when nothing is: naming a
    // hazard the reader already saw in section 3 identifies nobody.
    out.push(pt
      ? `${n_(n)} ${agree(n, 'nomeou', 'nomearam')} o mesmo risco principal (${worry}).`
      : `${n_(n)} named the same main risk (${worry}).`);
  }
  // Bounded. Four lines is a context; twenty is a list nobody reads, and the
  // advisor's own observation cap is four.
  return out.slice(0, 6);
}
