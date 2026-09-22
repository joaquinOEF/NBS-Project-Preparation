// ============================================================================
// ONE RECORD, EVERY SURFACE — do the pages a coordinator opens agree?
// ============================================================================
// `w3-record-audit.ts` prints what the ORGANISATION was shown: each card, the
// comparison, the score. This prints the same record the way the COORDINATION
// reads it — the board's pile and price (the dossier), the hoja de ruta, the
// Resumo, the synergy facts — and puts each solution's price side by side
// with its card's. The 22 Sept audit found the board pricing a rain garden at
// R$ 1,16–2,03 mi that the card priced at R$ 334–585 mil, and 25 trees as 2;
// every function did what it said, and nothing compared them. See
// docs/w3-audit-2026-09-22.md.
//
//   npx tsx scripts/w3-surfaces-audit.ts <perfil.json|state.json>
//
// Exit code 1 when any solution's price differs between card and board.
import fs from 'node:fs';
import { buildSolutionTest } from '../shared/w3-solution-test';
import { buildComparison } from '../shared/w3-comparison';
import { parseTests } from '../shared/w3-tests';
import { buildDossier, portfolioState, type W3Input } from '../shared/w3-dossier';
import { buildRoadmap } from '../shared/w3-roadmap';
import { buildConceptNote } from '../shared/concept-note';
import { synergyFactsFrom } from '../shared/w3-synergies';

const file = process.argv[2];
if (!file) { console.error('usage: tsx scripts/w3-surfaces-audit.ts <perfil.json|state.json>'); process.exit(1); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const S = raw.sections ?? raw.state?.sections ?? raw;
const flat = (sid: string): Record<string, string> => Object.fromEntries(
  Object.entries((S?.[sid]?.fields ?? {}) as Record<string, any>)
    .map(([k, v]) => [k, v && typeof v === 'object' && 'value' in v ? String(v.value ?? '') : String(v ?? '')]),
);
const site = flat('intervention_site');
const type = flat('intervention_type');
const w3 = { ...type, ...flat('impact_monitoring'), ...flat('operations_sustain') };
const tests = parseTests(type.solution_tests_json);
const chosen = (type.chosen_solutions ?? '').split(',').map(s => s.trim()).filter(Boolean);
const input: W3Input = { org: flat('org_profile'), site, solutions: chosen, ...(Number(site.site_area_m2) ? { areaM2: Number(site.site_area_m2) } : {}), w3 };

const rule = (t: string) => `\n${'═'.repeat(78)}\n${t}\n${'═'.repeat(78)}`;
console.log(rule(`RECORD · ${raw.cboStateId ?? '(no session id)'} · ${input.org?.org_name ?? '—'} · ${site.site_name ?? '—'}`));
console.log(`place: ${site.site_area_m2 || '—'} m² · intervention_units: ${w3.intervention_units || '—'} · e3 closed: ${type._e3_closed || 'no'} · detailed: ${!!(w3.construction_model || w3.justification_why_here || w3.baseline_condition)}`);

console.log(rule('PRICE PER SOLUTION — card (what the org and the comparison show) vs board / hoja de ruta / Resumo'));
const dossier = buildDossier(input, 'pt');
let disagree = 0;
for (const t of tests) {
  const card = buildSolutionTest(t.solutionId, input, t, 'pt');
  const board = dossier.budget.find(b => b.solutionId === t.solutionId);
  const cardNote = card?.cost?.note ?? '—';
  const boardNote = board?.notePt ?? '(not on the board: not kept)';
  const same = !board || boardNote === cardNote;
  if (!same) disagree++;
  console.log(`${same ? '  ' : '✘ '}${t.solutionId} [${t.reaction ?? 'sem reação'}]  test: ${JSON.stringify({ areaM2: t.areaM2, units: t.units })}`);
  console.log(`    card : ${cardNote.slice(0, 150)}`);
  if (!same) console.log(`    board: ${boardNote.slice(0, 150)}`);
}
console.log(`\nboard pile: ${portfolioState(dossier.verdicts)} · stored verdict: ${type.project_verdict || '—'} · gaps: ${dossier.gaps.length}`);

console.log(rule('COMPARISON — column order'));
console.log(buildComparison(input, tests, 'pt', type.technical_note).columns.map(c => c.solutionId).join(' → '));

console.log(rule('HOJA DE RUTA — blocks still open'));
const rm = buildRoadmap(input, 'pt');
for (const b of [...rm.what, ...rm.how]) if ((b as any).open) console.log(`  · ${b.title}: ${(b.lines ?? []).join(' / ').slice(0, 110)}`);

console.log(rule('RESUMO — sections, and any line in the spoken register'));
const note = buildConceptNote(input, 'pt');
for (const sec of note.sections) {
  const spoken = sec.paragraphs.filter(p => /\bvoc[eê]s\b|\ba gente\b/i.test(p.text.replace(/“[^”]*”/g, '')));
  console.log(`  ${spoken.length ? '✘' : ' '} ${sec.n}. ${sec.title}${spoken.length ? ` — ${spoken[0].text.slice(0, 100)}` : ''}`);
}

console.log(rule('SYNERGY FACTS — what the portfolio pass reads of this org'));
const syn = synergyFactsFrom(S as any) as any;
console.log(`own words: story=${!!syn.ownWords?.story} whyHere=${!!syn.ownWords?.whyHere} baseline=${!!syn.ownWords?.baseline} · tested=${(syn.tested ?? []).length} · study needs=${(syn.studyNeeds ?? []).join('; ') || '—'}`);

if (disagree) { console.log(`\n✘ ${disagree} solution(s) priced differently on the card and the board`); process.exit(1); }
console.log('\n✓ every tested solution carries one price across card and board');
