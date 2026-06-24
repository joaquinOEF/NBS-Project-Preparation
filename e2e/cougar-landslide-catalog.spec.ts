import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Landslide catalog migration — the final hazard. The map overlays + tile proxy
// now serve the catalog landslide layers (poa_landslide_hazard overlay +
// poa_landslide_risk H×E×V), so all three hazards are catalog-backed and the
// local landslide tiles are gone.

test.describe('COUGAR — map overlays use the catalog landslide layer', () => {
  test('the tile proxy serves the catalog landslide hazard + risk layers', async ({ request }) => {
    for (const id of ['poa_landslide_hazard', 'poa_landslide_risk']) {
      const r = await request.get(`/api/geospatial/tiles/${id}/13/2930/4813.png`);
      expect(r.status(), `${id} should proxy 200 from the catalog`).toBe(200);
      expect((r.headers()['content-type'] || '')).toContain('image/png');
    }
  });

  test('a CBO open_map with poa_landslide_hazard renders the catalog overlay', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Open the map with all three catalog hazard overlays + the simple legend.
    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Olha os riscos do seu bairro.' },
      { op: 'open_map', params: {
        selectionMode: 'browse-only',
        tileLayers: ['poa_flood_hazard', 'poa_heat_hazard', 'poa_landslide_hazard'],
        showLegendSimple: true,
        prompt: 'As cores mostram os riscos.',
      } },
    ]]);

    await page.getByTestId('cbo-chat-input').fill('Mostra o mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // The 3-risk legend shows the landslide chip (now catalog-backed).
    await expect(page.getByTestId('map-hazard-chip-landslide')).toBeVisible();
    await page.waitForTimeout(2500); // let tiles paint + hold for the video
  });
});
