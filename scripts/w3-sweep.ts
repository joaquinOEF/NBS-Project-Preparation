// ============================================================================
// EVERY SOLUTION THROUGH THE ENGINE — the sweep, not a scenario
// ============================================================================
// w3-sim-run and w3-cohort-sim drive organisations a person thought to write.
// That is how the copy defects were found, and it is also why the size hole
// survived: nobody happened to script an organisation that picked one of the
// nine solutions priced per unit or per project.
//
// This walks ALL of them — every solution in the catalogue, on a site and
// without one — and asserts what must be true of any path, whatever an
// organisation chose:
//
//   1 · every turn is SERVED by the engine (a turn that falls through reaches
//       a model, and in a deployment with no key that is silence);
//   2 · the size question is ASKED in some form — a footprint, a count, or an
//       explicit "we cannot price this";
//   3 · nothing shown to the organisation contains a machine id;
//   4 · the closing produces a dossier and a roadmap, never neither;
//   5 · every unpriced or unsized solution leaves a NAMED gap, so "we don't
//       know" is on the page instead of missing from it.
//
//   npx tsx scripts/w3-sweep.ts        # exits non-zero on any violation
// ============================================================================
import { serveE3Checkpoint } from '../server/services/cboE3Checkpoint';
import { mkState } from './w3-sim';
import { NBS_SOLUTIONS } from '../shared/nbs-catalog';
import { SOLUTION_COSTS } from '../shared/w3-sizing';
import { buildDossier, portfolioState } from '../shared/w3-dossier';

const normChip = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Machine ids leaking into copy an organisation reads. */
const MACHINE_ID = /\b[a-z]+(?:-[a-z]+){2,}\b/g;
const ALLOWED_IN_COPY = new Set(['e-mail', 'passo-a-passo', 'dia-a-dia', 'pé-de-moleque']);

type Violation = { solutionId: string; rule: string; detail: string };

async function walk(solutionId: string, withSite: boolean): Promise<Violation[]> {
  const v: Violation[] = [];
  const sol = NBS_SOLUTIONS.find(s => s.id === solutionId)!;
  const cost = SOLUTION_COSTS[solutionId];
  const state = mkState({
    org_profile: { org_name: 'Associação Teste', contact_name: 'Ana Teste' },
    intervention_site: {
      bairro: 'Sarandi', site_worry: 'alagamento', site_knowledge_depth: 'strong',
      ...(withSite
        ? {
            site_name: 'Terreno da associação', _site_lat: '-30.0906', _site_lng: '-51.1726',
            current_use: 'abandoned', land_tenure: 'private-owned',
            site_story: 'A água fica parada dias depois da chuva.',
          }
        : {}),
    },
  });

  const said: string[] = [];
  const asked: string[] = [];
  const events: any[] = [];
  const deps = {
    writeFields: (sectionId: string, fields: Record<string, string>) => {
      for (const [k, val] of Object.entries(fields)) {
        state.sections[sectionId].fields[k] = { value: val, confidence: 'high', source: 'user' };
      }
    },
    recordCheckpoint: () => {},
    normChip,
  };
  const push = (e: any) => {
    events.push(e);
    if (e.type === 'chat') said.push(String(e.content));
    if (e.type === 'ask_user') { said.push(e.question); asked.push(e.question); }
  };

  // Drive it by REPLYING TO WHAT IT ASKS rather than by a script: take the
  // first offered chip every time. A scripted answer list only ever walks the
  // path its author imagined, which is the blind spot this file exists for.
  const reply = async (msg: string, kind = 'chip') => {
    const before = events.length;
    const served = await serveE3Checkpoint('sweep', msg, state, push, 'pt', kind, deps as any);
    if (!served) v.push({ solutionId, rule: 'turn-not-served', detail: `"${msg}"` });
    return events.slice(before);
  };

  await reply('Vamos começar o Encontro 3.', 'text');
  // Opening chip: confirm the place, or carry on without one.
  await reply(withSite ? 'É isso ✓' : 'Seguir sem o lugar');
  await reply('Ver todas as soluções');
  await reply(sol.pt.label);

  // From here, always take the first chip offered, up to a bounded number of
  // beats. Free-text beats get a sentence.
  //
  // Two rules keep it honest. Anything that opens a MAP is skipped — the draw
  // session needs a browser, and taking it here would stall the walk on a beat
  // that is fine in the product. And a question asked twice in a row means the
  // last answer did not move anything, so the next option is tried instead of
  // the same one forever.
  const opensAMap = (o: any) => /mapa|map\b|desenh|marcar o lugar/i.test(`${o.label} ${o.description ?? ''}`);
  // Progress is measured by what got WRITTEN, not by the question text — two
  // different beats legitimately share the words "Quando quiser:", and counting
  // those as a repeat is how a walker invents a stall that is not there.
  const filled = () =>
    Object.values(state.sections).reduce((n: number, sec: any) => n + Object.keys(sec.fields).length, 0);
  let stalled = 0;
  for (let i = 0; i < 40; i++) {
    if (events.some(e => e.type === 'show_dossier' || e.type === 'show_roadmap')) break;
    const last = [...events].reverse().find(e => e.type === 'ask_user');
    const opts = (last?.options ?? []).filter((o: any) => !opensAMap(o));
    const before = filled();
    // A beat whose only way out is "Prefiro pular" is a FREE-TEXT beat. Answer
    // it the way an organisation would; skipping every one of them walks the
    // thinnest possible path and proves the least.
    const freeText = !opts.length || (opts.length === 1 && /pular|skip/i.test(opts[0].label));
    if (freeText) await reply('É um terreno de terra batida, sem drenagem, e a água fica dias parada.', 'text');
    else await reply(opts[Math.min(stalled, opts.length - 1)].label);
    stalled = filled() === before ? stalled + 1 : 0;
    if (stalled >= 3) {
      v.push({
        solutionId, rule: 'beat-does-not-advance',
        detail: `“${(last?.question ?? '').slice(0, 70)}” — three answers, nothing written`,
      });
      break;
    }
  }

  const asRecord = (id: string) =>
    Object.fromEntries(Object.entries(state.sections[id].fields).map(([k, val]: any) => [k, String(val.value ?? '')]));
  const site = asRecord('intervention_site');
  const type = asRecord('intervention_type');
  const chosen = (type.chosen_solutions ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const areaM2 = Number(site.site_area_m2) || 0;
  const units = Number(type.intervention_units) || 0;

  // 4 · it has to end somewhere.
  if (!events.some(e => e.type === 'show_dossier' || e.type === 'show_roadmap')) {
    v.push({ solutionId, rule: 'no-closing', detail: `${asked.length} beats, no dossier and no roadmap` });
  }
  if (!chosen.includes(solutionId)) {
    v.push({ solutionId, rule: 'choice-not-recorded', detail: `chosen_solutions = ${JSON.stringify(type.chosen_solutions ?? '')}` });
  }

  // 2 · the size, in whichever form applies to this solution.
  const sizeAsked =
    site._area_asked === 'yes' || site._area_asked === 'not-applicable' ||
    areaM2 > 0 || units > 0 || type._units_pending || type._units_deferred;
  if (!sizeAsked) {
    v.push({ solutionId, rule: 'size-never-asked', detail: `basis=${cost?.basis ?? 'none'} — no footprint, no count, no note` });
  }
  // A solution counted per unit must have been offered the count, not skipped.
  if (cost?.unitChips?.length && !(units || type._units_deferred)) {
    v.push({ solutionId, rule: 'count-never-collected', detail: `basis=${cost.basis} but intervention_units is empty` });
  }

  // 3 · nothing an organisation reads contains a machine id.
  for (const line of said) {
    for (const hit of line.match(MACHINE_ID) ?? []) {
      if (ALLOWED_IN_COPY.has(hit)) continue;
      v.push({ solutionId, rule: 'machine-id-in-copy', detail: `"${hit}" in “${line.slice(0, 80)}…”` });
    }
  }

  // 5 · what it cannot price or size has to SAY so.
  const dossier = buildDossier({
    site, org: asRecord('org_profile'), solutions: chosen,
    ...(areaM2 ? { areaM2 } : {}),
    w3: { ...type, ...asRecord('impact_monitoring'), ...asRecord('operations_sustain') },
  }, 'pt');
  const priced = dossier.budget.some(b => b.lowBrl != null);
  const state4 = portfolioState(dossier.verdicts);
  if (withSite && !priced && !dossier.gaps.length) {
    v.push({ solutionId, rule: 'silent-about-money', detail: 'no total, and no gap saying why' });
  }
  return v;
}

async function main() {
  const all: Violation[] = [];
  for (const sol of NBS_SOLUTIONS) {
    for (const withSite of [true, false]) {
      const v = await walk(sol.id, withSite);
      all.push(...v.map(x => ({ ...x, solutionId: `${x.solutionId}${withSite ? '' : ' (sem lugar)'}` })));
    }
  }
  const byRule = new Map<string, Violation[]>();
  for (const v of all) byRule.set(v.rule, [...(byRule.get(v.rule) ?? []), v]);

  console.log(`\n${'═'.repeat(78)}`);
  console.log(`VARREDURA — ${NBS_SOLUTIONS.length} soluções × 2 caminhos (com e sem lugar marcado)`);
  console.log('═'.repeat(78));
  if (!all.length) { console.log('\n✅ nenhuma violação\n'); return; }
  for (const [rule, vs] of byRule) {
    console.log(`\n❌ ${rule} — ${vs.length}`);
    for (const x of vs.slice(0, 12)) console.log(`   · ${x.solutionId}: ${x.detail}`);
    if (vs.length > 12) console.log(`   … e mais ${vs.length - 12}`);
  }
  console.log('');
  process.exitCode = 1;
}
main();
