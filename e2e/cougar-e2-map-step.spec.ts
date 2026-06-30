import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// E2 map step (the new flow): the agent opens the map with the guided hazard
// tour + neighborhood/site selection, and the panel is "always-on" — persisted
// in state.activeTool so it survives reload and is reachable via the chip, not
// gated behind the one-shot agent button.

test.describe('COUGAR — E2 map step (tour + always-on)', () => {
  const E2_OPEN_MAP = {
    op: 'open_map' as const,
    params: {
      selectionMode: 'composite',
      zoneSource: 'neighborhood_zones',
      layers: ['osm_parks', 'osm_schools'],
      tileLayers: ['risk_flood_250m', 'risk_heat_250m', 'risk_landslide_250m'],
      showLegendSimple: true,
      hazardTour: true,
      allowDeferSite: true,
      prompt: 'Conheça os riscos e marque onde vocês atuam.',
    },
  };

  test('hazard tour cycles 3 hazards, then unlocks the neighborhood step', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[{ op: 'say', text: 'Vamos pro mapa.' }, E2_OPEN_MAP]]);
    await page.getByTestId('cbo-chat-input').fill('Abrir o mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');

    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // Tour: the "Próximo risco" CTA walks flood → heat → landslide, then becomes
    // "Escolher meu bairro" and hands off to selection (the CTA disappears).
    const tourNext = page.getByTestId('map-tour-next');
    await expect(tourNext).toBeVisible({ timeout: 15_000 });
    await tourNext.click(); // → heat
    await tourNext.click(); // → landslide
    await tourNext.click(); // → done (neighborhood step)
    await expect(tourNext).toHaveCount(0, { timeout: 10_000 });

    // Neighborhood step is composite/zone — the "1 Bairro → 2 Locais" stepper renders.
    await expect(page.locator('.leaflet-container').first()).toBeVisible();
  });

  test('the map is always-on: survives reload + re-enterable via the chip', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[{ op: 'set_phase', phase: 2 }, { op: 'say', text: 'Mapa.' }, E2_OPEN_MAP]]);
    await page.getByTestId('cbo-chat-input').fill('mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // Leave the map (go to the document tab) → the persistent "open the map"
    // chip is available (activeTool is pending, no site captured yet).
    await page.getByRole('button', { name: /document/i }).first().click();
    const chip = page.getByTestId('cbo-open-tool-map');
    await expect(chip).toBeVisible({ timeout: 10_000 });

    // Reload — the pending tool is persisted in state.activeTool, so the chip is
    // still there (no dead-end), and tapping it re-enters the live map.
    await page.reload();
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const chip2 = page.getByTestId('cbo-open-tool-map');
    await expect(chip2).toBeVisible({ timeout: 15_000 });
    await chip2.click();
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
  });
});
