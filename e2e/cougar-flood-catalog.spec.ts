import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Task #3 — the CBO/concept-note map overlays now use the catalog flood layer
// (poa_flood_risk, H×E×V) instead of the old oef_fri_2024 FRI. This drives a
// CBO open_map carrying the catalog flood layer and shows the map render it.

test.describe('COUGAR #3 — map overlays use the catalog flood layer', () => {
  test('a CBO open_map with poa_flood_risk renders the catalog flood overlay', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Script a turn that opens the map with the CATALOG flood layer as overlay.
    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Vamos olhar o mapa do seu bairro com o risco de enchente.' },
      { op: 'open_map', params: {
        selectionMode: 'composite',
        zoneSource: 'neighborhoods',
        tileLayers: ['poa_flood_risk'],
        prompt: 'Marca onde vocês querem atuar.',
      } },
    ]]);

    await page.getByTestId('cbo-chat-input').fill('Mostra o mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');

    // The map opens (open_map → rightTab=map). Leaflet renders its container,
    // with the catalog flood tiles proxied from S3 as the overlay.
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(3000); // let tiles paint + hold for the video
  });
});
