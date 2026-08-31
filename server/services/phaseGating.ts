// Workshop-phased unlock (P-8) — gating helpers.
//
// A CBO that is part of a coordinator-managed cohort can only advance to
// phases that the coordinator has unlocked (via "Open Workshop" on the
// orchestrator dashboard). CBOs not in any cohort are ungated — full backwards
// compatibility for standalone usage.
//
// ⚠️ Access is the UNION of two records, not one. `cohort_members.unlockedPhases`
// is the per-member grant; `cohorts.settings.workshops[].openedAt` is the
// coordinator opening an encontro for everyone. They are written together, and
// a row that missed that write is an organisation locked out of an encontro its
// own board says is AO VIVO — with no repair available, because the card stops
// offering "Abrir para o grupo" once it is open. Reading both, and healing the
// row when they differ, is what keeps that from being possible.

import { db } from '../db';
import { cohortMembers, cohorts, effectiveUnlockedPhases, type CohortSettings } from '@shared/cohort-schema';
import { eq } from 'drizzle-orm';

export type PhasePolicy = {
  /** Member is part of a cohort. If false, the CBO is standalone and ungated. */
  gated: boolean;
  /** Phases the CBO is allowed to enter. Empty if no member found (treated as ungated). */
  unlockedPhases: number[];
  /** Max phase the CBO can currently work on. 5 means everything is open; 1 means only Phase 1. */
  maxAllowedPhase: number;
  /** Member id (if any) — useful for downstream snapshot pushes. */
  memberId: string | null;
};

const UNGATED: PhasePolicy = {
  gated: false,
  unlockedPhases: [1, 2, 3, 4, 5],
  maxAllowedPhase: 5,
  memberId: null,
};

/**
 * Look up the gating policy for a given CBO state id.
 *
 * If no cohort_member row references this cboStateId, the CBO is standalone
 * and gets the ungated policy (everything open) — this preserves the
 * pre-cohort behavior for testing and one-off use.
 */
export async function getPhasePolicyForCbo(cboStateId: string): Promise<PhasePolicy> {
  if (!cboStateId) return UNGATED;
  try {
    // Joined, because access is the union of what this member was granted and
    // what the coordinator opened for the whole cohort. Reading only the member
    // row is what let an organisation be told "o coordenador vai abrir o acesso
    // ao Encontro 3 em breve" while the board showed Encontro 3 as AO VIVO.
    const [row] = await db
      .select({ member: cohortMembers, settings: cohorts.settings })
      .from(cohortMembers)
      .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
      .where(eq(cohortMembers.cboStateId, cboStateId))
      .limit(1);
    if (!row) return UNGATED;
    const { member } = row;
    const stored = Array.isArray(member.unlockedPhases) && member.unlockedPhases.length > 0
      ? (member.unlockedPhases as number[])
      : [1];
    const unlocked = effectiveUnlockedPhases(stored, row.settings as CohortSettings | null);

    // Heal the row, so the coordinator's roster and the org's own page agree
    // with the answer this function just gave. Deliberately additive: closing an
    // encontro clears `openedAt` AND re-locks every member, so nothing here can
    // resurrect access the coordination took away.
    if (unlocked.length !== stored.length) {
      console.warn(
        `[phaseGating] member ${member.id} had ${JSON.stringify(stored)} but the cohort has ` +
        `${JSON.stringify(unlocked)} open — healing the row`,
      );
      await db.update(cohortMembers)
        .set({ unlockedPhases: unlocked })
        .where(eq(cohortMembers.id, member.id))
        .catch(e => console.error('[phaseGating] heal failed:', e?.message || e));
    }

    return {
      gated: true,
      unlockedPhases: unlocked,
      maxAllowedPhase: Math.max(...unlocked),
      memberId: member.id,
    };
  } catch (e: any) {
    // A DB error is NOT "this CBO is standalone". Returning UNGATED here made
    // the gate fail OPEN: unlockedPhases [1,2,3,4,5] for everyone, so a
    // transient connection blip — exactly what a redeploy or restart produces —
    // let any org walk into a workshop the coordinator hasn't opened. The two
    // situations look identical to the caller and are opposites.
    //
    // Fail closed instead: phase 1 only, which every invited org has by design.
    // The worst case is an org briefly told "the next workshop isn't open yet",
    // which self-corrects on the next successful query — versus an org running
    // an encontro the coordination never opened, which does not.
    console.error(`[phaseGating] policy lookup failed for ${cboStateId}; failing CLOSED:`, e?.message || e);
    return { gated: true, unlockedPhases: [1], maxAllowedPhase: 1, memberId: null };
  }
}

/** Pure helper — does this policy allow the agent to advance to the requested phase? */
export function isPhaseAllowed(policy: PhasePolicy, requestedPhase: number): boolean {
  return policy.unlockedPhases.includes(requestedPhase);
}

/** Build the prompt fragment that tells the agent which phases are open. */
export function buildAccessPolicyPrompt(policy: PhasePolicy): string {
  if (!policy.gated) return '';
  const max = policy.maxAllowedPhase;
  if (max >= 5) {
    return '\n## ACCESS POLICY\nAll workshop phases are open. No phase-advancement restrictions.';
  }
  return [
    '\n## ACCESS POLICY',
    `The coordinator has currently opened phases ${policy.unlockedPhases.join(', ')} for this CBO (workshop-phased unlock).`,
    `You MUST NOT advance the user past Phase ${max}. The set_phase tool will refuse any phase > ${max}.`,
    'If the user finishes Phase ' + max + ', do not advance to the next phase. Instead, tell them warmly that the next workshop will open the next phase, and offer to revisit earlier answers or wait. Do not invent a workshop date — just say the coordinator will open it.',
  ].join('\n');
}
