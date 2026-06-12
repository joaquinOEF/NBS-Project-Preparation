// One-time, idempotent backfill: create one organization per existing
// cohort_member (and per orphan cbo_state), and link org_id everywhere.
//
// Run AFTER `npm run db:push` has created the organizations table + the
// org_id columns:
//
//   npx tsx scripts/backfill-organizations.ts
//
// Safe to re-run — it only touches rows whose org_id is still NULL.

import { isNull, eq } from 'drizzle-orm';
import { db } from '../server/db';
import { organizations } from '@shared/org-schema';
import { cohortMembers } from '@shared/cohort-schema';
import { cboStates } from '@shared/cbo-db-schema';

async function main() {
  let orgsCreated = 0;
  let membersLinked = 0;
  let statesLinked = 0;

  // 1) One org per cohort_member missing an org_id. Cohort invites are
  //    community-first by default; a coordinator can reclassify implementers.
  const members = await db.select().from(cohortMembers).where(isNull(cohortMembers.orgId));
  for (const m of members) {
    const [org] = await db.insert(organizations).values({
      name: m.orgName,
      city: 'porto-alegre',
      type: 'community',
      cohortId: m.cohortId,
    }).returning();
    orgsCreated++;
    await db.update(cohortMembers).set({ orgId: org.id }).where(eq(cohortMembers.id, m.id));
    membersLinked++;
    // Link the working profile too, if the member↔state join exists.
    if (m.cboStateId) {
      await db.update(cboStates).set({ orgId: org.id }).where(eq(cboStates.id, m.cboStateId));
      statesLinked++;
    }
  }

  // 2) Orphan cbo_states (no member, no org) — e.g. standalone/demo sessions.
  const orphanStates = await db.select().from(cboStates).where(isNull(cboStates.orgId));
  for (const s of orphanStates) {
    const [org] = await db.insert(organizations).values({
      name: s.orgName || '(unnamed)',
      city: s.city || 'porto-alegre',
      type: 'unknown',
    }).returning();
    orgsCreated++;
    await db.update(cboStates).set({ orgId: org.id }).where(eq(cboStates.id, s.id));
    statesLinked++;
  }

  console.log(`[backfill] done — orgs created: ${orgsCreated}, members linked: ${membersLinked}, cbo_states linked: ${statesLinked}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('[backfill] failed:', e); process.exit(1); });
