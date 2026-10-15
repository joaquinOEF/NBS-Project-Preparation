import { test, expect } from '@playwright/test';
import { TestApi } from '../helpers/testApi';

// A recorded walk through Encontro 4 on a phone, for showing Vila Flores the
// flow (22 Oct 2026). Not a check — a film. Runs only when asked:
//   E4_VIDEO=1 npx playwright test e2e/quality/e4-walkthrough-video.spec.ts --project=chromium
// The .webm lands in test-results/.

test.use({ locale: 'pt-BR', viewport: { width: 390, height: 844 }, video: { mode: 'on', size: { width: 390, height: 844 } } });

test('Encontro 4, start to finish', async ({ page, request }) => {
  test.skip(!process.env.E4_VIDEO, 'film only on request');
  test.setTimeout(180_000);
  const api = new TestApi(request);
  test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
  const cohort = (await api.createCohort(`E4 film ${Date.now()}`)).cohort;
  await api.createCoordinator({ email: `e4film-${Date.now()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
  const m = (await api.inviteMember(cohort.id, { orgName: 'Associação Ksa Rosa', neighborhood: 'Floresta', withSession: true })).member;
  await api.seedState(m.cboStateId, { phase: 3, language: 'pt', sections: [
    { sectionId: 'org_profile', field: 'org_name', value: 'Associação Ksa Rosa' },
    { sectionId: 'org_profile', field: 'contact_name', value: 'Marlene' },
    { sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' },
    { sectionId: 'intervention_site', field: 'site_name', value: 'Pátio da Voluntários da Pátria 1039' },
    { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0198' },
    { sectionId: 'intervention_site', field: '_site_lng', value: '-51.2032' },
    { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
    { sectionId: 'intervention_site', field: 'site_story', value: 'Quando chove forte a água entra pelo portão e fica dois dias no pátio.' },
    { sectionId: 'intervention_site', field: 'land_tenure', value: 'private-owned' },
    { sectionId: 'intervention_site', field: 'site_area_m2', value: '600' },
    { sectionId: 'intervention_type', field: 'solution_tests_json', value: JSON.stringify([
      { solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 120, who: 'nos', hardest: 'custo', testedAt: '2026-09-30T12:00:00Z' },
      { solutionId: 'corredores-verdes', reaction: 'ainda-nao-sabemos', units: 20, testedAt: '2026-09-30T12:10:00Z' },
    ]) },
    { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'jardins-de-chuva' },
    { sectionId: 'intervention_type', field: '_e3_opened', value: 'yes' },
    { sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' },
    { sectionId: 'intervention_type', field: '_visit_json', value: JSON.stringify({ solutionId: 'jardins-de-chuva', areaM2: 140, date: '2026-10-23', recordedAt: 'x' }) },
  ] });
  await request.patch(`/api/cohort/${cohort.coordinatorSlug}/open-workshop`, { data: { phase: 4 } });

  const pause = (ms = 1600) => page.waitForTimeout(ms);
  await page.goto(`/cbo-profile?t=${m.capabilityToken}`);
  const cta = page.getByTestId('button-cbo-welcome-cta');
  await cta.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
  await pause();
  if (await cta.isVisible().catch(() => false)) await cta.click();
  const door = page.getByTestId('button-encontro-4-start').or(page.getByTestId('button-start-encontro-4'));
  await expect(door).toBeVisible({ timeout: 30_000 });
  await pause(2500);
  await door.click();

  const opt = (label: string) => page.locator('[data-testid^="cbo-option-"]').filter({ hasText: label }).last();
  const tap = async (label: string) => { await expect(opt(label)).toBeVisible({ timeout: 30_000 }); await pause(2200); await opt(label).click(); };
  const type = async (text: string) => {
    const input = page.getByTestId('cbo-chat-input');
    await pause(1800);
    await input.pressSequentially(text, { delay: 45 });
    await input.press('Enter');
  };
  await tap('É essa ✓');
  await tap('Isso ✓');
  await tap('Isso ✓');
  await expect(page.getByTestId('cbo-prenote').last()).toBeVisible({ timeout: 30_000 });
  await pause(1200);
  // Let the viewer see the draft with its gaps.
  await page.getByTestId('cbo-prenote').last().scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, -1400); await pause(1500);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 260); await pause(700); }
  await expect(page.getByText(/quem sofre mais/).last()).toBeVisible({ timeout: 30_000 });
  await type('Umas 40 famílias da rua de baixo, que alagam junto com o pátio');
  await tap('Menos água parada / menos alagamento');
  await tap('Isso ✓');
  await tap('Voluntários da comunidade');
  await type('Mutirão de 20 pessoas e as mudas do viveiro da associação');
  await type('A escola estadual da rua e a associação de moradores');
  await expect(page.getByText('Está bom assim?').last()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('cbo-prenote').last().scrollIntoViewIfNeeded();
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 260); await pause(700); }
  await tap('Pode fechar ✓');
  await pause(4000);
});
