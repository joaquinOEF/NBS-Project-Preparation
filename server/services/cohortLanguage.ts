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
    // One JOIN instead of two serial round-trips — this runs on the hot
    // per-turn chat path before the model can even start (audit LT-2).
    const [row] = await db
      .select({ settings: cohorts.settings })
      .from(cohortMembers)
      .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
      .where(eq(cohortMembers.cboStateId, cboStateId))
      .limit(1);
    return (row?.settings as CohortSettings | null)?.language ?? null;
  } catch {
    return null;
  }
}
