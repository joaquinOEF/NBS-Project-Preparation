// Drives the REAL E3 checkpoint engine through six organisations, capturing
// every word it says and every event it emits. No UI, no model, no DB — the
// same function the server calls, so what comes out is what an org would see.
import { serveE3Checkpoint } from '../server/services/cboE3Checkpoint';

const normChip = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

type Field = { value: string };
function mkState(fields: Record<string, Record<string, string>>, lang = 'pt') {
  const sections: any = {};
  for (const id of ['org_profile', 'intervention_site', 'intervention_type', 'impact_monitoring', 'operations_sustain', 'needs_support', 'results_evidence']) {
    sections[id] = { fields: {} as Record<string, Field>, lastUpdatedBy: 'agent' };
  }
  for (const [sid, kv] of Object.entries(fields)) {
    for (const [k, v] of Object.entries(kv)) sections[sid].fields[k] = { value: v, confidence: 'high', source: 'user' };
  }
  return { phase: 3, sections, editLog: [], gaps: [], maturityScores: [], priorityFlags: [], metadata: { language: lang } } as any;
}

interface Turn { msg: string; kind?: string }

async function run(name: string, state: any, turns: Turn[], lang = 'pt') {
  const log: string[] = [];
  const events: any[] = [];
  const deps = {
    writeFields: (sectionId: string, fields: Record<string, string>) => {
      for (const [k, v] of Object.entries(fields)) state.sections[sectionId].fields[k] = { value: v, confidence: 'high', source: 'user' };
    },
    recordCheckpoint: (step: string) => log.push(`      · [beat: ${step}]`),
    normChip,
  };
  const push = (e: any) => {
    events.push(e);
    if (e.type === 'chat') log.push(`   🤖 ${String(e.content).replace(/\n+/g, '\n      ')}`);
    else if (e.type === 'ask_user') log.push(`   ❓ ${e.question}\n      ${e.options.map((o: any) => `[${o.label}]${o.description ? ' — ' + o.description : ''}`).join('\n      ')}`);
    else if (e.type === 'show_solution_options') log.push(`   📋 solution options (${e.items.length}${e.full ? ', FULL' : ''}):\n${e.items.slice(0, 5).map((i: any) => `      • ${i.solutionId}: ${i.reason}${i.caveat ? '\n        ⚠ ' + i.caveat : ''}`).join('\n')}`);
    else if (e.type === 'show_dossier') log.push('   📄 DOSSIER');
    else if (e.type === 'open_map') log.push(`   🗺  open_map preset=e3_footprint drawFootprint=${JSON.stringify(e.params.drawFootprint)}`);
    else if (e.type === 'done') { /* quiet */ }
    else if (e.type !== 'field_update') log.push(`   ⚙ ${e.type}`);
  };

  console.log(`\n${'═'.repeat(78)}\n${name}\n${'═'.repeat(78)}`);
  for (const t of turns) {
    console.log(`\n   👤 ${t.msg}${t.kind ? ` (${t.kind})` : ''}`);
    log.length = 0;
    const served = await serveE3Checkpoint('sim', t.msg, state, push, lang, t.kind ?? 'text', deps as any);
    if (!served) console.log('   ⚠️  NOT SERVED — falls through to the model');
    console.log(log.join('\n'));
  }
  const dossier = events.filter(e => e.type === 'show_dossier').pop()?.dossier;
  if (dossier) {
    console.log(`\n   ── DOSSIER ─────────────────────────────────────────────────`);
    console.log(`   capacity: ${dossier.capacity.grade} — ${dossier.capacity.because.join('; ') || '(nothing)'}`);
    for (const v of dossier.verdicts) console.log(`   verdict[${v.solutionId ?? '—'}] = ${v.state}\n      why: ${v.why}\n      unblocked by: ${v.unblockedBy}\n      source: ${v.source}`);
    for (const b of dossier.budget) console.log(`   💰 ${b.solutionId} [${b.basis}] ${b.notePt}`);
    for (const list of ['investigate', 'contact', 'gather', 'document']) {
      const items = dossier.items.filter((i: any) => i.list === list);
      if (items.length) console.log(`   ${list.toUpperCase()}:\n${items.map((i: any) => `      – (${i.owner}) ${i.text}${i.blockedBy ? `\n        blocked by: ${i.blockedBy}` : ''}\n        ← ${i.source}`).join('\n')}`);
    }
    if (dossier.gaps.length) console.log(`   GAPS:\n${dossier.gaps.map((g: string) => '      ! ' + g).join('\n')}`);
  } else {
    console.log('\n   ⚠️  NO DOSSIER PRODUCED');
  }
  return { state, dossier, events };
}

export { run, mkState };

// ── How to use ──────────────────────────────────────────────────────────────
// npx tsx scripts/w3-sim-run.ts
//
// Six organisations through the real E3 engine, no browser and no model. It is
// how the eight defects listed in docs/w3-flow.md were found — every one of
// them was invisible to a passing test suite, because a test asserts what you
// thought to assert and a transcript shows you what you actually said.
//
// Add a scenario by adding a mkState + run() to w3-sim-run.ts. The value is in
// READING the output, not in it exiting zero: watch for a beat that says
// NOT SERVED (the turn fell through to the model), a dossier that names a
// machine id, an item list with three rows for one door, and any sentence that
// claims something the record does not support.
