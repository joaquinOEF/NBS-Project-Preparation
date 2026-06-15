// Provision a coordinator account (admin-run; we hand the password to the
// coordinator out-of-band). Run AFTER `npm run db:push` creates the
// coordinators table:
//
//   npx tsx scripts/create-coordinator.ts <email> <password> ["Full Name"] [cohortSlug]
//
// cohortSlug (optional): the cohort's coordinator slug (e.g. 'default' for the
// Vila Flores pilot). Scopes the account to that cohort. Omit it to create an
// ADMIN coordinator (cohortId = null) who can reach every cohort.
//
// Examples:
//   npx tsx scripts/create-coordinator.ts julia@vilaflores.org 'pass' 'Julia' default
//   npx tsx scripts/create-coordinator.ts admin@oef.org 'pass' 'OEF Admin'   # admin (all cohorts)

import { eq } from 'drizzle-orm';
import { db } from '../server/db';
import { cohorts } from '@shared/cohort-schema';
import { createCoordinator } from '../server/services/coordinatorAuth';

async function main() {
  const [email, password, name, cohortSlug] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npx tsx scripts/create-coordinator.ts <email> <password> ["Name"] [cohortSlug]');
    process.exit(1);
  }

  let cohortId: string | null = null;
  if (cohortSlug) {
    const [cohort] = await db.select().from(cohorts).where(eq(cohorts.coordinatorSlug, cohortSlug)).limit(1);
    if (!cohort) {
      console.error(`[create-coordinator] no cohort with coordinatorSlug "${cohortSlug}". Existing cohorts:`);
      const all = await db.select({ slug: cohorts.coordinatorSlug, name: cohorts.name }).from(cohorts);
      all.forEach(c => console.error(`  - ${c.slug} (${c.name})`));
      process.exit(1);
    }
    cohortId = cohort.id;
  }

  const c = await createCoordinator({ email, password, name: name || undefined, cohortId });
  console.log(`[create-coordinator] created ${c.email} (id ${c.id}) — ${cohortId ? `scoped to cohort "${cohortSlug}"` : 'ADMIN (all cohorts)'}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('[create-coordinator] failed:', e?.message || e); process.exit(1); });
