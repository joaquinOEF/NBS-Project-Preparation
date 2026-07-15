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

    // → Soluções: the five família sections with all 27 deck solutions render;
    // the map is hidden underneath.
    await page.getByTestId('region-tab-solutions').click();
    await expect(
      page.locator('[data-testid^="familia-section-"]').first()
    ).toBeVisible();
    expect(await page.locator('[data-testid^="familia-section-"]').count()).toBe(5);
    expect(await page.locator('[data-testid^="solution-card-"]').count()).toBe(27);

    // Each família shows its croqui BESIDE the variants; clicking enlarges it
    // in the lightbox (with the ilustração-esquemática disclosure).
    expect(await page.locator('[data-testid^="familia-croqui-"]').count()).toBe(5);
    await page.getByTestId('familia-croqui-encostas-e-solo').click();
    const lightbox = page.getByTestId('croqui-lightbox');
    await expect(lightbox).toBeVisible();
    await expect(lightbox.getByText(/Ilustração esquemática|Schematic illustration/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();
    await expect(
      participant,
      'participant list stays visible on Soluções'
    ).toBeVisible();

    // Every solution opens its own ficha técnica dialog first; a mapped one
    // links onward to the type croqui/cost dialog (complement, not substitute —
    // this is the bacia→flood-parks mismatch fix). bacia-de-retencao → flood-parks (2nd).
    await page.getByTestId('solution-ficha-bacia-de-retencao').click();
    const fichaDialog = page.getByTestId('nbs-solution-dialog');
    await expect(fichaDialog).toBeVisible();
    await expect(fichaDialog.getByText(/Quem precisa dizer sim|Who has to say yes/)).toBeVisible();
    await page.getByTestId('solution-type-content-bacia-de-retencao').click();
    await expect(fichaDialog).toBeHidden();
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
