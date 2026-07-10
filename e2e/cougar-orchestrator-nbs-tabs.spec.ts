import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Orchestrator region tabs (Mapa / Soluções / Casos). The tabs govern the map
// region only; the participant list stays visible below on every tab. Guards the
// two things most likely to regress:
//   1. The map is never unmounted — switching to Soluções and back keeps the
//      SAME Leaflet instance (no re-init, no 2.5MB GeoJSON refetch, keeps view).
//   2. The desktop detail opens as a centered dialog with prev/next, not a
//      mobile bottom sheet, over the full viewport.

test.describe('COUGAR — orchestrator NBS tabs', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('tabs swap the map region; map persists; solutions dialog navigates', async ({
    page,
    request,
  }) => {
    const api = new TestApi(page.request);
    await api.createCoordinator({
      email: `tabs-${randomUUID()}@e2e.test`,
      password: 'tabs-pass-123',
      name: 'Tabs',
    });
    const mine = await (await page.request.get('/api/cohort/mine')).json();
    const member = (
      await new TestApi(request).inviteMember(mine.cohort.id, {
        orgName: 'Org Tabs',
        withSession: true,
      })
    ).member;

    await page.goto('/orchestrator');
    const mapBox = page.locator('.leaflet-container').first();
    await expect(mapBox).toBeVisible({ timeout: 20_000 });

    // Tag the live Leaflet container so we can prove it's the same node later.
    await mapBox.evaluate(el => el.setAttribute('data-persist-probe', 'v1'));

    const participant = page.getByTestId(
      `card-orchestrator-project-${member.id}`
    );
    await expect(participant, 'participant list visible on Mapa').toBeVisible();

    // → Soluções: the six type cards render; the map is hidden underneath.
    await page.getByTestId('region-tab-solutions').click();
    await expect(
      page.locator('[data-testid^="type-card-"]').first()
    ).toBeVisible();
    expect(await page.locator('[data-testid^="type-card-"]').count()).toBe(6);
    await expect(
      participant,
      'participant list stays visible on Soluções'
    ).toBeVisible();

    // Open the detail dialog on the 2nd type; it's a centered dialog, not a sheet.
    await page.getByTestId('type-expand-flood-parks').click();
    const dialog = page.getByTestId('nbs-type-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('nbs-type-sheet')).toHaveCount(0); // not the mobile drawer
    await expect(dialog.locator('.tabular-nums')).toHaveText('2 / 6');

    // prev/next walk the ordered six.
    await page.getByTestId('nbs-type-dialog-prev').click();
    await expect(dialog.locator('.tabular-nums')).toHaveText('1 / 6');
    await expect(page.getByTestId('nbs-type-dialog-prev')).toBeDisabled(); // at the first
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // → Casos: the case-study cards render.
    await page.getByTestId('region-tab-cases').click();
    await expect(
      page.locator('[data-testid^="showcase-card-"]').first()
    ).toBeVisible();

    // → back to Mapa: the SAME Leaflet instance is still there (our probe attr
    // survived), proving it was never unmounted/re-initialized.
    await page.getByTestId('region-tab-map').click();
    await expect(mapBox).toBeVisible();
    await expect(
      page.locator('.leaflet-container[data-persist-probe="v1"]')
    ).toHaveCount(1);
  });
});
