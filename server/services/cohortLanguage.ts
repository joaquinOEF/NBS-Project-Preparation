// Cohort language authority (CBO-LANG-AUTH).
//
// When a CBO belongs to a coordinator-managed cohort, the cohort's forced
// language (cohort.settings.language) is the ONE authority for the whole
// session — it overrides the client-sent lang and any text detection. This is
// what stops the PT/EN drift the coordinator sees (an English-looking org name,
// a standalone/test fallback, or a pre-fetch race would otherwise flip the agent
// to English mid-flow). Standalone CBOs (no cohort) return null and keep the
// legacy client/stored/detect behavior.

import { db } from '../db';
import { cohorts, cohortMembers, type CohortSettings } from '@shared/cohort-schema';
import { eq } from 'drizzle-orm';

export async function getCohortLanguageForCbo(cboStateId: string): Promise<'pt' | 'en' | null> {
  if (!cboStateId) return null;
  try {
    const [member] = await db
      .select({ cohortId: cohortMembers.cohortId })
      .from(cohortMembers)
      .where(eq(cohortMembers.cboStateId, cboStateId))
      .limit(1);
    if (!member?.cohortId) return null;
    const [cohort] = await db
      .select({ settings: cohorts.settings })
      .from(cohorts)
      .where(eq(cohorts.id, member.cohortId))
      .limit(1);
    return (cohort?.settings as CohortSettings | null)?.language ?? null;
  } catch {
    return null;
  }
}
