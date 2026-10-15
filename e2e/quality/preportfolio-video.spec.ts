import { test, expect } from '@playwright/test';
import { TestApi } from '../helpers/testApi';

// A filmed walk through the pre-portfolio board, with the REAL narrative and
// plan passes (Opus) — for showing Vila Flores (22 Oct 2026). Needs a dev
// server started by hand with ANTHROPIC_API_KEY and PREPORTFOLIO_LIVE=1, e.g.
// on :5051, then:
//   PF_VIDEO=1 E2E_PORT=5051 npx playwright test e2e/quality/preportfolio-video.spec.ts --project=chromium
// The .webm and a PDF of the printed pre-portfolio land in test-results/.

test.use({ locale: 'pt-BR', viewport: { width: 1280, height: 800 }, video: { mode: 'on', size: { width: 1280, height: 800 } } });

const org = (name: string, bairro: string, lat: string, lng: string, worry: string, story: string, sol: string, size: Record<string, number>, e4: Record<string, string>, ops: Record<string, string>, visit = true) => [
  { sectionId: 'org_profile', field: 'org_name', value: name },
  { sectionId: 'intervention_site', field: 'bairro', value: bairro },
  { sectionId: 'intervention_site', field: 'site_name', value: e4.site_name },
  { sectionId: 'intervention_site', field: '_site_lat', value: lat },
  { sectionId: 'intervention_site', field: '_site_lng', value: lng },
  { sectionId: 'intervention_site', field: 'site_worry', value: worry },
  { sectionId: 'intervention_site', field: 'site_story', value: story },
  { sectionId: 'intervention_site', field: 'land_tenure', value: e4.tenure },
  { sectionId: 'intervention_site', field: 'beneficiaries_note', value: e4.who },
  { sectionId: 'intervention_type', field: 'solution_tests_json', value: JSON.stringify([{ solutionId: sol, reaction: 'faz-sentido', testedAt: '2026-09-30T12:00:00Z', ...size }]) },
  ...(visit ? [{ sectionId: 'intervention_type', field: '_visit_json', value: JSON.stringify({ solutionId: sol, ...size, date: '2026-10-23', recordedAt: 'x' }) }] : []),
  { sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' },
  { sectionId: 'intervention_type', field: '_e4_changes', value: e4.changes },
  { sectionId: 'intervention_type', field: 'construction_model', value: e4.build },
  { sectionId: 'intervention_type', field: 'e4_contribution', value: e4.contribution },
  { sectionId: 'intervention_type', field: 'e4_partners', value: e4.partners },
  { sectionId: 'intervention_type', field: '_e4_closed', value: 'yes' },
  ...Object.entries(ops).map(([field, value]) => ({ sectionId: 'operations_sustain', field, value })),
];

test('the pre-portfolio board, live', async ({ page }) => {
  const request = page.request;
  test.skip(!process.env.PF_VIDEO, 'film only on request');
  test.setTimeout(420_000);
  const api = new TestApi(request);
  const cohort = (await api.createCohort('Rede SCBN — demonstração')).cohort;
  await api.createCoordinator({ email: `pf-film-${Date.now()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
  const seed = async (name: string, bairro: string, sections: any[]) => {
    const m = (await api.inviteMember(cohort.id, { orgName: name, neighborhood: bairro, withSession: true })).member;
    await api.seedState(m.cboStateId, { phase: 4, language: 'pt', sections });
    return m;
  };
  await seed('Associação Ksa Rosa', 'Floresta', org('Associação Ksa Rosa', 'Floresta', '-30.0198', '-51.2032', 'alagamento', 'Quando chove forte a água entra pelo portão e fica dois dias no pátio.', 'jardins-de-chuva', { areaM2: 140 },
    { site_name: 'Pátio da Voluntários da Pátria 1039', tenure: 'private-owned', who: 'umas 40 famílias da rua de baixo', changes: 'alagamentos', build: 'mutirao', contribution: 'mutirão de 20 pessoas e as mudas do viveiro', partners: 'a escola estadual da rua' }, { who_maintains: 'voluntarios' }));
  await seed('COOP20', 'Floresta', org('COOP20', 'Floresta', '-30.0215', '-51.2050', 'alagamento,heat', 'O galpão alaga e no verão ninguém aguenta trabalhar lá dentro.', 'teto-verde', { areaM2: 300 },
    { site_name: 'Galpão da Rua Câncio Gomes', tenure: 'formal-agreement', who: '35 cooperados e as famílias deles', changes: 'temperatura', build: 'contratada', contribution: 'o espaço e dois cooperados para a manutenção', partners: 'a associação de moradores' }, { who_maintains: 'nos' }, false));
  await seed('Coletivo Rio Vivo', 'Floresta', org('Coletivo Rio Vivo', 'Floresta', '-30.0230', '-51.2010', 'alagamento', 'A praça vira lagoa e a água desce pra Voluntários.', 'biovaletas', { areaM2: 200 },
    { site_name: 'Praça Florida', tenure: 'public-informal', who: 'o quarteirão inteiro, umas 120 pessoas', changes: 'alagamentos', build: 'mista', contribution: 'mão de obra nos fins de semana', partners: 'a prefeitura ou uma secretaria' }, { who_maintains: 'parceria-prefeitura' }));
  await seed('Morro Vivo', 'Morro da Cruz', org('Morro Vivo', 'Morro da Cruz', '-30.0700', '-51.1700', 'landslide', 'Toda chuva grande desce terra do barranco atrás das casas.', 'grade-viva', { areaM2: 250 },
    { site_name: 'Barranco da Rua 4', tenure: 'public-informal', who: '18 famílias que moram embaixo do barranco', changes: 'erosao', build: 'mista', contribution: 'mutirão e mudas nativas', partners: 'a Defesa Civil' }, { who_maintains: 'voluntarios' }));
  await seed('Encosta Verde', 'Morro da Cruz', org('Encosta Verde', 'Morro da Cruz', '-30.0712', '-51.1688', 'landslide', 'A trilha da escola vira um rio de lama no inverno.', 'reflorestamento', { areaM2: 1200 },
    { site_name: 'Encosta atrás da EMEF', tenure: 'public-informal', who: 'os 300 alunos da escola e as famílias da trilha', changes: 'erosao', build: 'mutirao', contribution: 'os alunos e os professores no plantio', partners: 'a escola' }, { who_maintains: 'voluntarios' }, false));

  const pause = (ms = 1800) => page.waitForTimeout(ms);
  // Let the plan readings start in the background before the camera rolls.
  await request.get(`/api/cohort/${cohort.coordinatorSlug}/preportfolio`);
  await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
  await page.getByTestId('view-projects').click();
  const board = page.getByTestId('preportfolio-board');
  await expect(board).toBeVisible({ timeout: 30_000 });
  await pause(2500);
  // The narratives arrive (Opus, ~17 s each, in parallel).
  await expect(page.getByTestId('preportfolio-narrative-0')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('preportfolio-narrative-1')).toBeVisible({ timeout: 120_000 });
  await pause(3000);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 300); await pause(1500); }
  await page.mouse.wheel(0, -1200); await pause(1500);
  // The plan connections land as each reading finishes (polled every 15 s).
  await expect(page.getByTestId('preportfolio-plans-0')).toBeVisible({ timeout: 120_000 });
  await pause(2000);
  // Name a project from the suggestion.
  const use = page.getByTestId('preportfolio-use-title-0');
  if (await use.isVisible().catch(() => false)) { await use.click(); await pause(2000); }
  // Change the grouping preference: more theme.
  await page.getByTestId('pref-geo-0').click();
  await pause(4000);
  await page.getByTestId('pref-geo-0.5').click();
  await pause(3000);
  // Print.
  const pdfUrl = `/api/cohort/${cohort.coordinatorSlug}/preportfolio/print`;
  await expect.poll(async () => (await (await request.get(pdfUrl)).text()).includes('Por que juntas'), { timeout: 120_000 }).toBe(true);
  await page.goto(pdfUrl);
  await pause(2500);
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 350); await pause(1200); }
  await page.pdf({ path: 'test-results/pre-portfolio-demonstracao.pdf', format: 'A4', printBackground: true });
});
