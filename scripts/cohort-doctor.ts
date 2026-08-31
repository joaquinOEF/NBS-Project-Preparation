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
import { cohorts, cohortMembers, effectiveUnlockedPhases, type CohortSettings } from '@shared/cohort-schema';
import { cboStates } from '@shared/cbo-db-schema';
import { phaseComplete, cboSectionsFilledCount, type CboState } from '@shared/cbo-schema';

type Verdict =
  | 'never-started'
  | 'in-progress'
  | 'ready-waiting'   // ⚠️ finished, and the next encontro is not open
  | 'ready-to-enter'  // finished, next is open — one tap away
  | 'finished';

const LABEL: Record<Verdict, string> = {
  'never-started': 'sem nenhuma resposta',
  'in-progress': 'no meio do encontro',
  'ready-waiting': '⚠️  TERMINOU E ESTÁ ESPERANDO',
  'ready-to-enter': 'pronta pra entrar no próximo',
  'finished': 'chegou ao fim do percurso',
};

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
    const open = (settings?.workshops ?? []).filter(w => w.openedAt).map(w => Number(w.unlocksPhase));
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

    const rows: Array<{ name: string; line: string; verdict: Verdict }> = [];
    for (const m of members) {
      const st = m.cboStateId ? byId.get(m.cboStateId) : undefined;
      const sections = ((st?.sections ?? {}) as CboState['sections']);
      const filled = st ? cboSectionsFilledCount({ sections } as any) : 0;
      const phase = st?.phase ?? 0;
      // The same union the gate applies, so this reads what the ORG will get,
      // not what the row happens to say.
      const unlocked = effectiveUnlockedPhases(m.unlockedPhases, settings);
      const complete = st && phase >= 1 ? phaseComplete({ sections, maturityScores: [] } as any, phase) : false;
      const next = unlocked.find(p => p > phase);

      let verdict: Verdict;
      if (!st || filled === 0) verdict = 'never-started';
      else if (!complete) verdict = 'in-progress';
      else if (phase >= 5) verdict = 'finished';
      else if (next == null) verdict = 'ready-waiting';
      else verdict = 'ready-to-enter';
      if (verdict === 'ready-waiting') waiting++;

      rows.push({
        name: m.orgName ?? m.memberSlug ?? m.id,
        verdict,
        line:
          `fase ${phase} · ${filled}/7 seções · acesso [${unlocked.join(',')}]` +
          `${complete ? ' · encontro fechado' : ''}${next ? ` · próximo aberto: ${next}` : ''}` +
          `${m.excludeFromPortfolio ? ' · fora do portfólio' : ''}`,
      });
    }

    // Worst first — the whole point is that the waiting ones are impossible to
    // miss in a list of eighteen.
    const order: Verdict[] = ['ready-waiting', 'in-progress', 'never-started', 'ready-to-enter', 'finished'];
    rows.sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict));
    for (const r of rows) {
      console.log(`\n  ${r.name}\n    ${LABEL[r.verdict]}\n    ${r.line}`);
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
