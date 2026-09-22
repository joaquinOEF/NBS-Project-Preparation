// ============================================================================
// WHAT ONE REAL RECORD ACTUALLY SAW — the four cards, the comparison, the score
// ============================================================================
// The sweep walks every solution on invented sites; the fullsim walks personas
// somebody wrote. Neither answers the question a technical adviser asks when
// they read a real session over the organisation's shoulder: "these numbers —
// where do they come from, and are they right for THIS place?"
//
// This prints, for a record exported from staging (the `contexto completo`
// zip, or any state JSON), exactly what the organisation was shown: each test
// card row by row, the comparison, and the maturity lines with their
// justifications. Run it against a real session before believing a change.
//
//   npx tsx scripts/w3-record-audit.ts <perfil.json|state.json> [--lang pt]
//
// Accepts either the drawer JSON (`sections.<id>.fields.<name>.value`) or a
// plain `{ sectionId: { field: value } }` object.
import fs from 'node:fs';
import { buildSolutionTest } from '../shared/w3-solution-test';
import { buildComparison } from '../shared/w3-comparison';
import { parseTests } from '../shared/w3-tests';
import { scoreW3Maturity } from '../shared/w3-maturity';
import type { W3Input } from '../shared/w3-dossier';
import type { Lang } from '../shared/nbs-type-content';

const file = process.argv[2];
const lang = (process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'pt') as Lang;
if (!file) { console.error('usage: tsx scripts/w3-record-audit.ts <state.json> [--lang pt]'); process.exit(1); }

const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const sectionsRaw = raw.sections ?? raw.state?.sections ?? raw;
const flat = (sid: string): Record<string, string | undefined> => {
  const s = sectionsRaw?.[sid];
  const fields = s?.fields ?? s ?? {};
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
    out[k] = (v && typeof v === 'object' && 'value' in (v as any)) ? String((v as any).value ?? '') : (v == null ? undefined : String(v));
  }
  return out;
};

const site = flat('intervention_site');
const type = flat('intervention_type');
const tests = parseTests(type.solution_tests_json);
const input: W3Input = {
  org: flat('org_profile'),
  site,
  solutions: (type.chosen_solutions ?? '').split(',').map(s => s.trim()).filter(Boolean),
  areaM2: site.site_area_m2 ? Number(site.site_area_m2) : undefined,
  w3: { ...type, ...flat('impact_monitoring'), ...flat('operations_sustain') },
};

const rule = (t: string) => `\n${'═'.repeat(78)}\n${t}\n${'═'.repeat(78)}`;
console.log(rule(`RECORD · ${input.org?.org_name ?? '—'} · ${site.site_name ?? '—'} (${site.bairro ?? '—'})`));
console.log(`lugar: ${site.current_use} · posse: ${site.land_tenure} · preocupa: ${site.site_worry} · foco: ${site._worry_focus ?? type._worry_focus ?? '—'}`);
console.log(`área do lugar: ${site.site_area_m2 ?? '—'} m² · critérios: ${type._choice_criteria ?? '—'}`);
console.log(`testes: ${tests.length} · mantidas: ${type.chosen_solutions ?? '—'}`);

for (const t of tests) {
  const card = buildSolutionTest(t.solutionId, input, t, lang);
  console.log(rule(`CARTÃO · ${card?.label ?? t.solutionId}  [${t.reaction ?? 'sem reação'}]`));
  if (!card) { console.log('⚠️ nenhum cartão — solução ou ficha ausente'); continue; }
  console.log(`dimensionado por: ${JSON.stringify(card.sizedBy)}   (teste: areaM2=${t.areaM2 ?? '—'} units=${t.units ?? '—'})`);
  console.log(`complexidade: ${card.complexity.level} — ${card.complexity.detail}`);
  if (card.supportingMeasure) console.log(`tipo: ${card.supportingMeasure}`);
  console.log(`o que precisa:\n  - ${card.needs.join('\n  - ')}`);
  console.log(`o que trava: [${card.verdict.state}] ${card.verdict.why} → destrava com: ${card.verdict.unblockedBy}\n   fonte do veredito: ${card.verdictSource}${card.verdict.studyDone ? ` · estudo já feito: ${card.verdict.studyDone.label}` : ''}`);
  console.log(`efeito: ${card.effect.headline ?? '(sem número)'} · ${card.effect.claim}`);
  console.log(`   site-específico: ${card.effect.siteSpecific} · nota: ${card.effect.nota ?? '—'} · fonte: ${card.effect.source}`);
  if (card.scaleLines.length) console.log(`   escala: ${card.scaleLines.join(' | ')}`);
  console.log(`custo: ${card.cost ? `${card.cost.note}  [${card.cost.basis}${card.cost.estimado ? ', estimado' : ''}] ${card.cost.source}` : '(sem preço)'}`);
  console.log(`cuidar: ${card.upkeep}`);
  console.log(`condição do lugar: ${card.caveat ?? '—'}`);
  console.log(`a favor: ${card.answersWorry ?? '—'}`);
  const notes = (card as any).fileNotes ?? (card as any).documentNotes ?? [];
  console.log(`arquivos: ${notes.length ? notes.map((n: any) => `${n.stance ?? ''} ${n.textPt ?? n.text ?? ''}`).join(' | ') : '(nenhuma nota de arquivo)'}`);
}

const comparison = buildComparison(input, tests, lang, type.technical_note);
console.log(rule('COMPARAÇÃO'));
for (const col of comparison.columns) {
  console.log(`\n■ ${col.label}${col.reaction ? `  [${col.reaction}]` : ''}`);
  for (const [k, v] of Object.entries(col as any)) {
    if (['label', 'solutionId', 'reaction'].includes(k)) continue;
    const text = Array.isArray(v) ? v.map((x: any) => (typeof x === 'string' ? x : x?.text ?? JSON.stringify(x))).join(' · ') : String(v ?? '');
    if (text && text !== 'null' && text !== 'undefined') console.log(`   ${k}: ${text}`);
  }
}

console.log(rule('PLACAR'));
console.log('  (o placar é recalculado aqui a partir do registro — o valor gravado pode ser anterior a uma correção)');
for (const s of scoreW3Maturity({
  site, w3: input.w3 ?? {}, solutions: input.solutions ?? [],
  ...(input.areaM2 ? { areaM2: input.areaM2 } : {}),
  ...(type.intervention_units ? { units: Number(type.intervention_units) } : {}),
  hasCostBand: true,
  who: tests.map(t => String((t as any).who ?? '')).filter(Boolean),
})) console.log(`  ${s.metric}: ${s.score}/3 — ${s.justification}`);
