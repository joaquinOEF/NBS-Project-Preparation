import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// E2 site capture (gap) — the CBO map lets you add an intervention site the OSM
// suggestions miss: by name (Nominatim search, biased to the neighborhood) or by
// pasting a coordinate. Drives the coordinate path deterministically (no external
// call) and confirms the site enters the selection. Also asserts the name-search
// UI renders.

test.describe('COUGAR — E2 add-your-own-site on the CBO map', () => {
  test('paste a coordinate to add an intervention site the OSM pins miss', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Open the map in assets mode (no zone step) so the add-site panel is reachable
    // immediately, with the catalog heat overlay active.
    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Escolha o local da intervenção.' },
      { op: 'open_map', params: {
        selectionMode: 'assets',
        layers: ['osm_parks'],
        tileLayers: ['poa_heat_hazard'],
        prompt: 'Adicione o local onde vocês vão atuar.',
      } },
    ]]);

    await page.getByTestId('cbo-chat-input').fill('Mostra o mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // Open the add-site panel — both the name search and the coordinate input render.
    await page.getByTestId('map-add-site-toggle').click();
    await expect(page.getByTestId('map-site-search-input')).toBeVisible();
    const coord = page.getByTestId('map-site-coord-input');
    await expect(coord).toBeVisible();

    // Add a site by coordinate.
    await coord.fill('-30.0331, -51.2300');
    await page.getByTestId('map-site-coord-btn').click();

    // It lands in the selection list (custom site, named from the coordinate).
    await expect(page.getByText('Site (-30.0331', { exact: false })).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1200); // hold for the video

    // Confirm sends it back to chat.
    await page.getByRole('button', { name: /confirm|confirmar/i }).first().click();
    await page.waitForTimeout(1500);
  });

  test('invalid coordinate shows an error and adds nothing', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Escolha o local.' },
      { op: 'open_map', params: { selectionMode: 'assets', layers: ['osm_parks'], prompt: 'Local.' } },
    ]]);
    await page.getByTestId('cbo-chat-input').fill('mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('map-add-site-toggle').click();
    await page.getByTestId('map-site-coord-input').fill('not a coord');
    await page.getByTestId('map-site-coord-btn').click();
    await expect(page.getByText(/latitude, longitude/i)).toBeVisible();
  });
});
