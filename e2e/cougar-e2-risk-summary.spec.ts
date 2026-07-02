import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// After a map selection, the chat bubble shows a CLEAN human summary (Ana's
// "risk summary in chat, not just color") — not the raw "Map selection
// (composite mode)… H×E×V… coordinates" dump (CBO-MAP-PAYLOAD). The raw payload
// still goes to the agent as the (hidden) message body.

test.describe('COUGAR — map selection posts a clean summary, not a raw payload', () => {
  test('confirming a site shows "Selected on the map" + the site, and hides the raw dump', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Escolha o local.' },
      { op: 'open_map', params: { selectionMode: 'assets', layers: ['osm_parks'], tileLayers: ['poa_heat_hazard'], prompt: 'Adicione o local.' } },
    ]]);

    await page.getByTestId('cbo-chat-input').fill('Mostra o mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('map-add-site-toggle').click();
    await page.getByTestId('map-site-coord-input').fill('-30.0331, -51.2300');
    await page.getByTestId('map-site-coord-btn').click();
    await expect(page.getByText('Site (-30.0331', { exact: false })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /confirm|confirmar/i }).first().click();

    // Clean summary bubble is shown to the user…
    await expect(page.getByText(/Selected on the map|Selecionei no mapa/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/📍\s*1\s*(site|local)/).first()).toBeVisible();
    // …and the raw technical dump is NOT rendered anywhere in the chat.
    await expect(page.getByText('Map selection (composite mode)')).toHaveCount(0);
    await expect(page.getByText(/H×E×V|sampled points/)).toHaveCount(0);
  });
});
