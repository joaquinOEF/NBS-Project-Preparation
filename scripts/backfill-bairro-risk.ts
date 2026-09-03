// ============================================================================
// BACKFILL — the bairro risk percentiles written before 2026-08-03 20:05
// ============================================================================
// The server already runs this at every boot (see
// server/services/bairroRiskBackfill.ts). This is the same function behind a
// CLI, for looking BEFORE writing — which is the thing a boot hook cannot do.
//
//   npx tsx scripts/backfill-bairro-risk.ts           # report only
//   npx tsx scripts/backfill-bairro-risk.ts --apply   # write
//
// ⚠️ On Replit the shell's DATABASE_URL is the DEV database, not the
// deployment's.
// ============================================================================
import { backfillBairroRisk } from '../server/services/bairroRiskBackfill';

async function main() {
  const apply = process.argv.includes('--apply');
  const r = await backfillBairroRisk({ apply });

  console.log(`\n${'═'.repeat(78)}`);
  console.log(`PERCENTIS DE RISCO DO BAIRRO — ${r.scanned} registro(s) com bairro${apply ? '  · GRAVANDO' : '  · só relatório'}`);
  console.log('═'.repeat(78));

  for (const item of r.repaired) {
    console.log(`\n⚠️  ${item.orgName} — ${item.bairro}`);
    for (const c of item.changes) {
      const label = c.field.replace('_bairro_', '').replace('_pct', '');
      console.log(`     ${label.padEnd(10)} guardado ${String(c.stored ?? '—').padStart(4)}  →  ${String(c.correct).padStart(3)}${apply ? '   ✓' : ''}`);
    }
  }

  console.log(`\n${'─'.repeat(78)}`);
  console.log(`${r.clean} corretos · ${r.repaired.length} com divergência · ${r.unknown} com bairro desconhecido`);
  if (r.repaired.length && !apply) {
    console.log('\nNada foi gravado. Rode de novo com --apply — ou reinicie o servidor, que ele corrige sozinho no boot.');
    console.log('⚠️  No Replit, o DATABASE_URL do shell é o banco de DEV — não o do deployment.');
  }
  console.log('');
  process.exitCode = r.repaired.length && !apply ? 1 : 0;
}

main().catch(err => {
  console.error('[backfill-bairro-risk]', err?.message || err);
  process.exitCode = 1;
});
