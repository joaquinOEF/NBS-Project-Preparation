// ============================================================================
// THE SYNERGY PASS, RUN FOR REAL
// ============================================================================
// It had never been run with a model. Not once — the same state the concept
// note's authoring pass was in this morning, where the first live run found a
// 30-second timeout that meant it had never executed on any organisation.
//
// This drives the eight archetypes through the real E3 engine, projects them
// with the same synergyFactsFrom() the coordinator's button uses, and calls
// buildSynergyReport with a provider configured.
//
//   W3_SIM_AUTHOR=1 npx tsx scripts/w3-synergy-live.ts
// ============================================================================
import * as fs from 'fs';
for (const line of (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const { analyseSynergies, synergyFactsFrom } = await import('../shared/w3-synergies');
  const { buildSynergyReport } = await import('../server/services/synergyReport');
  const { structuredProvider } = await import('../server/services/structuredModel');
  const { PERSONAS, driveForSynergy } = await import('./w3-fullsim');

  const members: any[] = [];
  for (const p of PERSONAS) {
    const state = await driveForSynergy(p);
    const facts = synergyFactsFrom(state.sections);
    const site: any = state.sections.intervention_site.fields;
    const org: any = state.sections.org_profile.fields;
    const v = (f: any, k: string) => String(f?.[k]?.value ?? '').trim() || null;
    members.push({
      id: p.id, orgName: p.name,
      bairro: v(site, 'bairro'), worry: v(site, 'site_worry'),
      priorCollaboration: null, maturityScore: 6, docCount: 0, started: true,
      verdict: null, docs: [], ...facts,
    });
  }

  const a = analyseSynergies(members as any);
  console.log(`\n${'═'.repeat(78)}\n${members.length} organizações · análise determinística\n${'═'.repeat(78)}`);
  for (const g of a.groups) console.log(`  [${g.axis}] ${g.key}: ${g.memberIds.length} org(s)`);
  console.log(`  estudos em comum      : ${a.pooledStudies.map(p => `${p.need} (${p.memberIds.length})`).join(' · ') || '—'}`);
  console.log(`  instrumentos em comum : ${a.pooledInstruments.map(p => `${p.instrument} (${p.memberIds.length})`).join(' · ') || '—'}`);
  console.log(`  mesma barreira        : ${a.sharedFundingBarriers.map(p => `${p.path} (${p.memberIds.length})`).join(' · ') || '—'}`);

  if (!structuredProvider()) { console.log('\n(sem provider — a narrativa não roda)'); return; }
  console.log(`\n${'─'.repeat(78)}\nchamando o modelo…`);
  const t0 = Date.now();
  const report = await buildSynergyReport(members as any);
  console.log(`${Date.now() - t0}ms\n`);
  if (!report.narrative) {
    console.log(`⚠️ SEM NARRATIVA — motivo: ${(report as any).narrativeReason ?? '(nenhum)'}`);
    return;
  }
  const n: any = report.narrative;
  for (const [k, v] of Object.entries(n)) {
    console.log(`\n## ${k}`);
    if (Array.isArray(v)) for (const item of v) console.log(typeof item === 'string' ? `  · ${item}` : `  · ${JSON.stringify(item)}`);
    else console.log(`  ${v}`);
  }
}
main().catch(e => { console.error(e?.message || e); process.exitCode = 1; });
