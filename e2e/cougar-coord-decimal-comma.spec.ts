import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Brazilian decimal-comma coordinates. The PT placeholder itself teaches
// "-30,03, -51,22" — the old parser split on commas and turned that into
// lat -30 / lng 3: a point in the South Atlantic, silently persisted as the
// org's site. Now the Brazilian format parses correctly, and any point outside
// the Porto Alegre region is rejected with a distinct message.

async function openSitesMap(page: Page, request: APIRequestContext) {
  const api = new TestApi(request);
  test.skip(!(await api.ping()).fakeModel, 'needs fake model');
  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
  const cboId = (await marker.getAttribute('data-cbo-id'))!;
  await api.scriptCbo(cboId, [[
    { op: 'open_map', params: { selectionMode: 'assets', layers: ['osm_parks'], tileLayers: ['poa_heat_hazard'], prompt: 'Adicione o local.' } },
  ]]);
  await page.getByTestId('cbo-chat-input').fill('mapa');
  await page.getByTestId('cbo-chat-input').press('Enter');
  await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('map-add-site-toggle').click();
}

test.describe('COUGAR — coordinate input accepts Brazilian decimal commas', () => {
  test('the PT placeholder example "-30,03, -51,22" adds the right site', async ({ page, request }) => {
    await openSitesMap(page, request);
    await page.getByTestId('map-site-coord-input').fill('-30,03, -51,22');
    await page.getByTestId('map-site-coord-btn').click();
    // Parsed as -30.03 / -51.22 (Porto Alegre), NOT -30 / 3 (the ocean).
    await expect(page.getByText('Site (-30.0300', { exact: false })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('map-coord-error')).toHaveCount(0);
  });

  test('a point outside the Porto Alegre region is rejected with a clear message', async ({ page, request }) => {
    await openSitesMap(page, request);
    await page.getByTestId('map-site-coord-input').fill('-23.55, -46.63'); // São Paulo
    await page.getByTestId('map-site-coord-btn').click();
    await expect(page.getByTestId('map-coord-error')).toBeVisible();
    await expect(page.getByTestId('map-coord-error')).toContainText(/Porto Alegre/);
    await expect(page.getByText('Site (-23.55', { exact: false })).toHaveCount(0);
  });
});
