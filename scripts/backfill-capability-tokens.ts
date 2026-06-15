// One-time, idempotent backfill: give every existing cohort_member an
// unguessable capability token (the new invite-link credential). Run AFTER
// `npm run db:push` has added the capability_token column:
//
//   npx tsx scripts/backfill-capability-tokens.ts
//
// Safe to re-run — only touches rows whose capability_token is still NULL.
// After running, RE-ISSUE invite links to existing members (orchestrator UI
// builds /cbo-profile?t=<token>) before retiring slug access in Phase 3b.

import { isNull, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../server/db';
import { cohortMembers } from '@shared/cohort-schema';

async function main() {
  const members = await db.select().from(cohortMembers).where(isNull(cohortMembers.capabilityToken));
  let filled = 0;
  for (const m of members) {
    await db.update(cohortMembers).set({ capabilityToken: nanoid(24) }).where(eq(cohortMembers.id, m.id));
    filled++;
  }
  console.log(`[backfill] capability tokens set for ${filled} member(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('[backfill] failed:', e); process.exit(1); });
