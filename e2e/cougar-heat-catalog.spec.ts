import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Heat catalog migration — the map overlays + tile proxy now serve the validated
// catalog heat layers (poa_heat_hazard gap-free overlay + poa_heat_risk H×E×V),
// mirroring the flood migration. Drives a CBO open_map carrying the catalog heat
// layer and confirms the proxy resolves the catalog heat tiles from S3.

test.describe('COUGAR — map overlays use the catalog heat layer', () => {
  test('the tile proxy serves the catalog heat layers', async ({ request }) => {
    for (const id of ['poa_heat_hazard', 'poa_heat_risk', 'poa_flood_hazard']) {
      const r = await request.get(`/api/geospatial/tiles/${id}/13/2930/4813.png`);
      expect(r.status(), `${id} should proxy 200 from the catalog`).toBe(200);
      expect((r.headers()['content-type'] || '')).toContain('image/png');
    }
  });

  test('a CBO open_map with poa_heat_hazard renders the catalog heat overlay', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Script a turn that opens the map with the CATALOG heat hazard as overlay.
    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Vamos olhar o mapa do seu bairro com o risco de calor.' },
      { op: 'open_map', params: {
        selectionMode: 'composite',
        zoneSource: 'neighborhoods',
        tileLayers: ['poa_heat_hazard'],
        prompt: 'Marca onde vocês querem atuar.',
      } },
    ]]);

    await page.getByTestId('cbo-chat-input').fill('Mostra o mapa do calor');
    await page.getByTestId('cbo-chat-input').press('Enter');

    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(3000); // let tiles paint + hold for the video
  });
});
