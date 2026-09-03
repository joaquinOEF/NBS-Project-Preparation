// ============================================================================
// BACKFILL — the bairro risk percentiles written before 2026-08-03 20:05
// ============================================================================
// See shared/bairro-risk.ts for what went wrong and why nothing threw. This is
// the repair: for every stored CBO record, compare the three `_bairro_*_pct`
// fields against the published within-city ranks and correct the ones that
// disagree.
//
//   npx tsx scripts/backfill-bairro-risk.ts           # report only
//   npx tsx scripts/backfill-bairro-risk.ts --apply   # write
//
// ⚠️ Reports first, always. The dry run is the same code path as the write, so
// what it prints is what it would do — and on Replit remember the shell's
// DATABASE_URL is the DEV database, not the deployment's.
// ============================================================================
import { db } from '../server/db';
import { cboStates } from '@shared/cbo-db-schema';
import { eq } from 'drizzle-orm';
import { riskDrift, correctedRiskFields, bairroRisk } from '@shared/bairro-risk';
import type { CboSectionState } from '@shared/cbo-schema';

const APPLY = process.argv.includes('--apply');

async function main() {
  const rows = await db
    .select({ id: cboStates.id, orgName: cboStates.orgName, sections: cboStates.sections })
    .from(cboStates);

  let drifted = 0;
  let unknown = 0;
  let clean = 0;

  console.log(`\n${'═'.repeat(78)}`);
  console.log(`PERCENTIS DE RISCO DO BAIRRO — ${rows.length} registro(s)${APPLY ? '  · GRAVANDO' : '  · só relatório'}`);
  console.log('═'.repeat(78));

  for (const row of rows) {
    const sections = (row.sections ?? {}) as Record<string, CboSectionState>;
    const site = sections.intervention_site;
    if (!site?.fields) continue;
    const fields = Object.fromEntries(
      Object.entries(site.fields).map(([k, v]) => [k, String((v as any)?.value ?? '')]),
    );
    if (!fields.bairro?.trim()) continue;

    if (!bairroRisk(fields.bairro)) {
      unknown++;
      console.log(`\n?  ${row.orgName || row.id} — bairro "${fields.bairro}" não está na tabela; nada tocado`);
      continue;
    }
    const drift = riskDrift(fields);
    if (!drift.length) { clean++; continue; }

    drifted++;
    console.log(`\n⚠️  ${row.orgName || row.id} — ${drift[0].bairro}`);
    for (const d of drift) {
      const label = d.field.replace('_bairro_', '').replace('_pct', '');
      console.log(`     ${label.padEnd(10)} guardado ${String(d.stored ?? '—').padStart(4)}  →  ${String(d.correct).padStart(3)}`);
    }

    if (!APPLY) continue;
    const corrected = correctedRiskFields(fields);
    const next: Record<string, CboSectionState> = {
      ...sections,
      intervention_site: {
        ...site,
        fields: {
          ...site.fields,
          ...Object.fromEntries(
            Object.entries(corrected).map(([k, v]) => [
              k,
              // Keeps whatever else the field carried; only the value moves, and
              // the source records that this was a repair rather than an answer.
              { ...((site.fields as any)[k] ?? {}), value: v, confidence: 'high', source: 'backfill' },
            ]),
          ),
        },
      },
    };
    await db.update(cboStates).set({ sections: next }).where(eq(cboStates.id, row.id));
    console.log('     ✓ gravado');
  }

  console.log(`\n${'─'.repeat(78)}`);
  console.log(`${clean} corretos · ${drifted} com divergência · ${unknown} com bairro desconhecido`);
  if (drifted && !APPLY) {
    console.log('\nNada foi gravado. Rode de novo com --apply.');
    console.log('⚠️  No Replit, o DATABASE_URL do shell é o banco de DEV — não o do deployment.');
  }
  console.log('');
  process.exitCode = drifted && !APPLY ? 1 : 0;
}

main().catch(err => {
  console.error('[backfill-bairro-risk]', err?.message || err);
  process.exitCode = 1;
});
