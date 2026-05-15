// Workshop-phased unlock (P-8) — gating helpers.
//
// A CBO that is part of a coordinator-managed cohort can only advance to
// phases that the coordinator has unlocked (via "Open Workshop" on the
// orchestrator dashboard). The cohort_members.unlockedPhases column is the
// source of truth. CBOs not in any cohort are ungated — full backwards
// compatibility for standalone usage.

import { db } from '../db';
import { cohortMembers } from '@shared/cohort-schema';
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
    const [member] = await db
      .select()
      .from(cohortMembers)
      .where(eq(cohortMembers.cboStateId, cboStateId))
      .limit(1);
    if (!member) return UNGATED;
    const unlocked = Array.isArray(member.unlockedPhases) && member.unlockedPhases.length > 0
      ? (member.unlockedPhases as number[])
      : [1];
    return {
      gated: true,
      unlockedPhases: unlocked,
      maxAllowedPhase: Math.max(...unlocked),
      memberId: member.id,
    };
  } catch {
    return UNGATED;
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
