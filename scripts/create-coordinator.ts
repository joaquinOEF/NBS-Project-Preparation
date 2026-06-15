// Provision a coordinator account (admin-run; we hand the password to the
// coordinator out-of-band). Run AFTER `npm run db:push` creates the
// coordinators table:
//
//   npx tsx scripts/create-coordinator.ts <email> <password> ["Full Name"] [cohortId]
//
// Example:
//   npx tsx scripts/create-coordinator.ts julia@vilaflores.org 'S0meStrongPass' 'Julia Caon'

import { createCoordinator } from '../server/services/coordinatorAuth';

async function main() {
  const [email, password, name, cohortId] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npx tsx scripts/create-coordinator.ts <email> <password> ["Name"] [cohortId]');
    process.exit(1);
  }
  const c = await createCoordinator({ email, password, name: name || undefined, cohortId: cohortId || null });
  console.log(`[create-coordinator] created ${c.email} (id ${c.id})${c.cohortId ? `, cohort ${c.cohortId}` : ', all cohorts'}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('[create-coordinator] failed:', e?.message || e); process.exit(1); });
