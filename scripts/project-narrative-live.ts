// Live runs of the pre-portfolio narrative pass on a realistic three-org
// project (Floresta: rain gardens, a green roof, bioswales). Measures the call
// for shared/model-pass-budgets.ts and prints what the guards kept.
//   set -a; . ./.env; set +a; npx tsx scripts/project-narrative-live.ts 5 [facts]
import { narrativeFacts, buildProjectNarrative } from '../server/services/projectNarrative';
import { buildPrenote } from '../shared/e4-prenote';
import { portfolioOrg, projectCard } from '../shared/preportfolio';
import { createEmptyCboState } from '../shared/cbo-schema';

const mk = (o: Record<string, Record<string, string>>) => { const s = createEmptyCboState('porto-alegre'); for (const [sec, f] of Object.entries(o)) for (const [k, v] of Object.entries(f)) (s.sections as any)[sec].fields[k] = { value: v, confidence: 'high', source: 'user', userEdited: false }; return s.sections; };
const orgs = [
  ['m1', 'Associação Ksa Rosa', mk({ org_profile: { org_name: 'Associação Ksa Rosa' }, intervention_site: { bairro: 'Floresta', site_name: 'Pátio da Voluntários da Pátria 1039', _site_lat: '-30.0198', _site_lng: '-51.2032', site_worry: 'alagamento', site_story: 'Quando chove forte a água entra pelo portão e fica dois dias no pátio.', land_tenure: 'private-owned', beneficiaries_note: 'umas 40 famílias da rua de baixo' }, intervention_type: { solution_tests_json: JSON.stringify([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 140, who: 'nos', hardest: 'custo', testedAt: 'x' }]), _visit_json: JSON.stringify({ solutionId: 'jardins-de-chuva', areaM2: 140, recordedAt: 'x' }), _e4_changes: 'alagamentos', construction_model: 'mutirao', e4_contribution: 'mutirão de 20 pessoas e as mudas do viveiro', e4_partners: 'a escola estadual' }, operations_sustain: { who_maintains: 'voluntarios' } })],
  ['m2', 'COOP20', mk({ org_profile: { org_name: 'COOP20' }, intervention_site: { bairro: 'Floresta', site_name: 'Galpão da Rua Câncio Gomes', _site_lat: '-30.0215', _site_lng: '-51.2050', site_worry: 'alagamento,heat', site_story: 'O galpão alaga e no verão ninguém aguenta trabalhar lá dentro.', land_tenure: 'formal-agreement', beneficiaries_note: '35 cooperados e as famílias deles' }, intervention_type: { solution_tests_json: JSON.stringify([{ solutionId: 'teto-verde', reaction: 'faz-sentido', areaM2: 300, who: 'contratar', testedAt: 'x' }]), _e4_changes: 'temperatura', construction_model: 'contratada', e4_contribution: 'o espaço e dois cooperados de manutenção' }, operations_sustain: { who_maintains: 'nos' } })],
  ['m3', 'Coletivo Rio Vivo', mk({ org_profile: { org_name: 'Coletivo Rio Vivo' }, intervention_site: { bairro: 'Floresta', site_name: 'Praça Florida', _site_lat: '-30.0230', _site_lng: '-51.2010', site_worry: 'alagamento', site_story: 'A praça vira lagoa e a água desce pra Voluntários.', land_tenure: 'public-informal', beneficiaries_note: 'o quarteirão inteiro, umas 120 pessoas' }, intervention_type: { solution_tests_json: JSON.stringify([{ solutionId: 'biovaletas', reaction: 'faz-sentido', areaM2: 200, who: 'nos-com-parceiro', testedAt: 'x' }]), _e4_changes: 'alagamentos', construction_model: 'mista', e4_contribution: 'Nada por enquanto', e4_partners: 'a prefeitura ou uma secretaria' }, operations_sustain: { who_maintains: 'parceria-prefeitura' } })],
] as const;
const pos = orgs.map(([id, name, sec]) => portfolioOrg(id, name, sec));
const card = projectCard(pos.map(p => p.memberId), pos);
const members = orgs.map(([, name, sec]) => ({ orgName: name, prenote: buildPrenote({ org: {}, site: Object.fromEntries(Object.entries((sec as any).intervention_site.fields).map(([k, v]: any) => [k, v.value])), type: Object.fromEntries(Object.entries((sec as any).intervention_type.fields).map(([k, v]: any) => [k, v.value])), ops: Object.fromEntries(Object.entries((sec as any).operations_sustain.fields).map(([k, v]: any) => [k, v.value])) } as any) }));
const facts = narrativeFacts(members, card);
async function main() {
const n = Number(process.argv[2] ?? 1);
for (let i = 0; i < n; i++) {
  const t0 = Date.now();
  const out = await buildProjectNarrative(members, card);
  console.log(`RUN ${i + 1} ${Date.now() - t0}ms`, JSON.stringify(out, null, 1));
}
if (process.argv[3] === 'facts') console.log(facts);
}
main().then(() => process.exit(0));
