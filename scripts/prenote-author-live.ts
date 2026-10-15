// Live runs of the pre-note's written summary (server/services/prenoteContext.ts
// → the concept note's authoring pass on PRENOTE_AUTHOR_MODEL) over a rich
// record. Measures the call and prints what survived the guards.
//   set -a; . ./.env; set +a; npx tsx scripts/prenote-author-live.ts 5
import { authorPrenote } from '../server/services/prenoteContext';
import { buildPrenote, type PrenoteInput } from '../shared/e4-prenote';

const RICH: PrenoteInput = {
  org: { org_name: 'Associação Ksa Rosa', mission_summary: 'Casa de cultura e horta comunitária no 4º Distrito.', team_size: '6-15', paid_vs_volunteer: 'all-volunteer', has_cnpj: 'yes', legal_form: 'ngo', year_founded: '2016', groups_served: 'jovens, mulheres', funding_history: 'yes', biggest_project_budget: '50k-200k' },
  site: { bairro: 'Floresta', site_name: 'Pátio da Voluntários da Pátria 1039', site_worry: 'alagamento', site_story: 'Quando chove forte a água entra pelo portão e fica dois dias no pátio.', land_tenure: 'private-owned', _site_lat: '-30.0198', _site_lng: '-51.2032', bairro_population: '9500', bairro_poverty_pct: '12.4', _bairro_flood_pct: '88', beneficiaries_note: 'umas 40 famílias da rua de baixo', contributing_area_note: 'Vem da rua de cima, da Câncio Gomes.', prior_collaboration_detail: 'COOP20' },
  type: {
    solution_tests_json: JSON.stringify([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 140, who: 'nos', hardest: 'custo', testedAt: 'x' }, { solutionId: 'biovaletas', reaction: 'nao-e-pra-gente', testedAt: 'x' }]),
    _visit_json: JSON.stringify({ solutionId: 'jardins-de-chuva', areaM2: 140, date: '2026-10-23', recordedAt: 'x' }),
    technical_note: 'Solo argiloso; dreno de fundo obrigatório. O pátio drena para a Rua Dona Alzira.',
    closing_observations: 'A direção só autoriza obra em janeiro.',
    _e4_changes: 'alagamentos', construction_model: 'mutirao', e4_contribution: 'Mutirão de 20 pessoas e as mudas do viveiro', e4_partners: 'COOP20; a escola estadual',
  },
  ops: { who_maintains: 'voluntarios' },
  cohort: ['Três outras organizações do grupo precisam do mesmo teste de infiltração do solo.'],
};

async function main() {
  const n = Number(process.argv[2] ?? 1);
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    const out = await authorPrenote(RICH, 'pt');
    const ms = Date.now() - t0;
    console.log(`RUN ${i + 1} ${ms}ms · ${out ? `${out.accepted} aceitos, ${out.rejected} recusados` : 'nada'}`);
    if (out) {
      const page = buildPrenote({ ...RICH, type: { ...RICH.type, _prenote_authored_json: out.stored } });
      console.log('  RESUMO:', page.summary.join(' / '));
      for (const s of JSON.parse(out.stored)) if (s.section !== 'resumo') console.log(`  ${s.section}:`, s.paragraphs.map((p: any) => p.text).join(' / ').slice(0, 400));
    }
  }
}
main().then(() => process.exit(0));
