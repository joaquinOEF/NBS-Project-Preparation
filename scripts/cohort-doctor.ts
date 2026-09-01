// ============================================================================
// COHORT DOCTOR — who can move, and who is waiting on you
// ============================================================================
// Run this before a session, the way you run db:preflight.
//
// The thing it exists to catch: an organisation that has FINISHED its encontro
// and cannot get into the next one. That state is invisible from the board —
// the rail shows the encontro as open, the org's card shows a phase, and
// nothing anywhere says "this org is done and stuck". Maria sat in it, and the
// only reason anyone found out is that she said so.
//
//   npx tsx scripts/cohort-doctor.ts            # every cohort
//   npx tsx scripts/cohort-doctor.ts "Vila Flores"
//
// Exits non-zero when anything is waiting, so it can gate a deploy.
// ============================================================================
import { eq, inArray } from 'drizzle-orm';
import { db } from '../server/db';
import { cohorts, cohortMembers, openPhasesFrom, type CohortSettings } from '@shared/cohort-schema';
import { cboStates } from '@shared/cbo-db-schema';
import { type CboState } from '@shared/cbo-schema';
import { orgHealth, VERDICT_ORDER, VERDICT_PT, type OrgVerdict } from '@shared/cohort-doctor';

async function main() {
  const wanted = process.argv[2];
  const all = await db.select().from(cohorts);
  const list = wanted
    ? all.filter(c => c.name?.toLowerCase().includes(wanted.toLowerCase()))
    : all;
  if (!list.length) {
    console.log(wanted ? `\nNenhum grupo com "${wanted}".\n` : '\nNenhum grupo.\n');
    return;
  }

  let waiting = 0;
  for (const cohort of list) {
    const settings = cohort.settings as CohortSettings | null;
    const open = openPhasesFrom(settings);
    const members = await db.select().from(cohortMembers).where(eq(cohortMembers.cohortId, cohort.id));
    const stateIds = members.map(m => m.cboStateId).filter((v): v is string => !!v);
    const states = stateIds.length
      ? await db.select({ id: cboStates.id, phase: cboStates.phase, sections: cboStates.sections })
          .from(cboStates).where(inArray(cboStates.id, stateIds))
      : [];
    const byId = new Map(states.map(s => [s.id, s]));

    console.log(`\n${'═'.repeat(78)}`);
    console.log(`${cohort.name ?? cohort.id} — ${members.length} organizações`);
    console.log(`encontros abertos: ${open.length ? open.sort((a, b) => a - b).map(p => `Fase ${p}`).join(', ') : 'nenhum'}`);
    console.log('═'.repeat(78));

    const rows: Array<{ name: string; line: string; verdict: OrgVerdict }> = [];
    for (const m of members) {
      const st = m.cboStateId ? byId.get(m.cboStateId) : undefined;
      const state = st
        ? { phase: st.phase ?? 0, sections: ((st.sections ?? {}) as CboState['sections']), maturityScores: [] }
        : null;
      const h = orgHealth(state as any, m.unlockedPhases, settings);
      if (h.verdict === 'ready-waiting') waiting++;
      rows.push({
        name: m.orgName ?? m.memberSlug ?? m.id,
        verdict: h.verdict,
        line:
          `fase ${h.phase} · ${h.sectionsFilled}/7 seções · acesso [${h.unlockedPhases.join(',')}]` +
          `${h.closed ? ' · encontro fechado' : ''}${h.nextOpen ? ` · próximo aberto: ${h.nextOpen}` : ''}` +
          `${m.excludeFromPortfolio ? ' · fora do portfólio' : ''}`,
      });
    }

    // Worst first — the whole point is that the waiting ones are impossible to
    // miss in a list of eighteen.
    rows.sort((a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict));
    for (const r of rows) {
      const label = r.verdict === 'ready-waiting' ? `⚠️  ${VERDICT_PT[r.verdict].toUpperCase()}` : VERDICT_PT[r.verdict];
      console.log(`\n  ${r.name}\n    ${label}\n    ${r.line}`);
    }
  }

  console.log(`\n${'─'.repeat(78)}`);
  if (waiting) {
    console.log(`⚠️  ${waiting} organização(ões) terminou o encontro e não tem o próximo aberto.`);
    console.log('   Abra o encontro no quadro, ou confirme que é isso mesmo que vocês querem.\n');
    process.exitCode = 1;
  } else {
    console.log('✅ ninguém está esperando: toda organização que terminou tem para onde ir.\n');
  }
}
main().then(() => process.exit(process.exitCode ?? 0));
