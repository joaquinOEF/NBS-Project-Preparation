import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// E2 "see the risks" (gap) — the CBO map now actually renders the flood / heat /
// landslide hazard overlays (previously the catalog + local risk layers were
// silently dropped because the microapp only resolved TILE_LAYERS). With
// showLegendSimple the full toolkit collapses to a 3-chip hazard legend, each
// chip toggling its overlay. The three chips only appear if the combined layer
// registry resolves poa_flood_hazard / poa_heat_hazard / risk_landslide_250m.

test.describe('COUGAR — E2 simplified flood/heat/landslide risk legend', () => {
  test('the 3-risk legend renders, overlays auto-enable, and the landslide tile loads', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'needs the fake model');

    // Catch the local landslide visual tile request — proves the non-proxy
    // (visualUrlTemplate) render path works.
    let landslideTileRequested = false;
    page.on('request', (r) => {
      if (r.url().includes('/tiles/landslide_risk/')) landslideTileRequested = true;
    });

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Olha os riscos do seu bairro.' },
      { op: 'open_map', params: {
        selectionMode: 'browse-only',
        tileLayers: ['poa_flood_hazard', 'poa_heat_hazard', 'risk_landslide_250m'],
        showLegendSimple: true,
        prompt: 'As cores mostram os riscos.',
        narrationOverlay: 'Azul = enchente · Vermelho = calor · Marrom = deslizamento.',
      } },
    ]]);

    await page.getByTestId('cbo-chat-input').fill('Mostra o mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // The simplified legend + all three hazard chips render (only possible if the
    // combined registry resolves the catalog + local risk layer ids).
    await expect(page.getByTestId('map-simple-legend')).toBeVisible();
    const flood = page.getByTestId('map-hazard-chip-flood');
    const heat = page.getByTestId('map-hazard-chip-heat');
    const landslide = page.getByTestId('map-hazard-chip-landslide');
    await expect(flood).toBeVisible();
    await expect(heat).toBeVisible();
    await expect(landslide).toBeVisible();

    // Overlays auto-enable in this mode (chips are "on").
    await expect(landslide).toHaveAttribute('aria-pressed', 'true');

    // The landslide overlay actually fetched its (local, static) tiles.
    await expect.poll(() => landslideTileRequested, { timeout: 15_000 }).toBe(true);

    // Toggling a chip turns the overlay off.
    await landslide.click();
    await expect(landslide).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(1500); // hold for the video
  });
});
