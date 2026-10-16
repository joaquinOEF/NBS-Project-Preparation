import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// THE COORDINATOR'S PAGE, CALM (refine 2026-10-16).
//
// One dashboard, not features stacked as they shipped: the header is the
// cohort, its language and "Convidar CBO"; whatever wipes, deletes, copies or
// simulates is behind "Ferramentas avançadas"; the map is reference and folds
// away; of the encontros, only the one that is open is expanded.

test.use({ locale: 'pt-BR' });

test('nothing destructive on the surface; the panel and the map remember being opened; the live encontro is the one expanded', async ({ page }) => {
  const api = new TestApi(page.request);
  test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
  const cohort = (await api.createCohort(`Calm ${randomUUID().slice(0, 6)}`)).cohort;
  await api.createCoordinator({ email: `calm-${randomUUID()}@e2e.test`, password: 'pw-123456' });
  const m = (await api.inviteMember(cohort.id, { orgName: 'Horta Calma', withSession: true })).member;

  await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
  await expect(page.getByTestId(`card-orchestrator-project-${m.id}`)).toBeVisible({ timeout: 20_000 });

  // The surface: no reset, delete, import, and no per-card admin pills.
  for (const id of ['button-reset-cohort', 'button-delete-cohort', 'button-import-org', 'button-export-cohort', `button-cbo-reset-${m.id}`, `button-cbo-remove-${m.id}`]) {
    await expect(page.getByTestId(id), id).toHaveCount(0);
  }
  await expect(page.getByTestId('button-invite-cbo')).toBeVisible();
  // The overview: the numbers, and the map as a thumbnail (no tabs until expanded).
  await expect(page.getByTestId('overview-hero')).toBeVisible();
  await expect(page.getByTestId('cohort-counts')).toContainText('organizações');
  await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('region-tab-solutions')).toHaveCount(0);

  // Before any encontro is open, the first is the one expanded.
  await expect(page.getByTestId('workshop-toggle-0')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('workshop-toggle-1')).toHaveAttribute('aria-expanded', 'false');

  // Open the panel and the map; both are remembered across a reload.
  await page.getByTestId('button-advanced-tools').click();
  await expect(page.getByTestId('button-reset-cohort')).toBeVisible();
  await page.getByTestId('button-toggle-map').click();
  await expect(page.getByTestId('region-tab-solutions')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('advanced-tools')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('region-tab-solutions')).toBeVisible({ timeout: 20_000 });

  // The organisation's own rare actions are in its drawer.
  await page.getByTestId(`card-orchestrator-project-${m.id}`).click({ position: { x: 24, y: 24 } });
  await expect(page.getByTestId(`button-cbo-reset-${m.id}`)).toBeVisible();
  await expect(page.getByTestId(`button-portfolio-exclude-${m.id}`)).toBeVisible();
});
