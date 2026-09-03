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

const orgs = (n: number) => (n === 1 ? '1 outra organização' : `${n} outras organizações`);

/**
 * The cohort in lines an advisor can use, computed against THIS organisation.
 *
 * Only what this organisation shares is reported: a study nobody else needs
 * says nothing useful to it, and listing the group's every need would be the
 * spread this file exists to avoid, in prose.
 */
export function cohortLines(mine: CohortPeer, peers: CohortPeer[]): string[] {
  if (!peers.length) return [];
  const out: string[] = [];

  for (const [need, n] of countBy(peers, p => p.studyNeeds)) {
    if (!mine.studyNeeds.includes(need)) continue;
    out.push(`${orgs(n)} do grupo precisam do mesmo estudo: ${need}. Isso é contratável em conjunto.`);
  }
  for (const [inst, n] of countBy(peers, p => p.approvalInstruments)) {
    if (!mine.approvalInstruments.includes(inst)) continue;
    out.push(`${orgs(n)} passam pelo mesmo instrumento de aprovação (${inst}) — uma conversa com o órgão, não uma por organização.`);
  }
  for (const [path, n] of countBy(peers, p => p.fundingBlocked)) {
    if (!mine.fundingBlocked.includes(path)) continue;
    out.push(`${orgs(n)} esbarram na mesma barreira de financiamento (${path}). É exatamente o caso que a agregação num portfólio resolve.`);
  }
  for (const [bairro, n] of countBy(peers, p => (p.bairro ? [p.bairro] : []))) {
    if (!mine.bairro || bairro !== mine.bairro) continue;
    out.push(`${orgs(n)} trabalham no mesmo bairro (${bairro}).`);
  }
  for (const [worry, n] of countBy(peers, p => (p.worry ? [p.worry.split(',')[0].trim()] : []))) {
    if (!mine.worry || !mine.worry.startsWith(worry)) continue;
    out.push(`${orgs(n)} nomearam o mesmo risco principal.`);
  }
  // Bounded. Four lines is a context; twenty is a list nobody reads, and the
  // advisor's own observation cap is four.
  return out.slice(0, 6);
}
