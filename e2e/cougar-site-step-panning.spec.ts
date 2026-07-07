import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// The CBO site step must never fight the thumb: draw mode starts OFF (panning
// works, stray taps drop nothing), arming "Um ponto" is explicit, and re-tapping
// disarms. Regression for the P0 where drawMode auto-armed to 'point' and
// dragging was disabled — the first pan attempt dropped a wrong pin instead.

test.describe('COUGAR — site step: pan by default, arm to drop', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('assets step starts disarmed; tap adds nothing; arm→tap adds; re-tap disarms', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'open_map', params: {
        selectionMode: 'composite', zoneSource: 'neighborhood_zones',
        tileLayers: ['poa_flood_hazard'], showLegendSimple: true,
        hazardTour: false, allowDeferSite: true, prompt: 'Marque onde vocês atuam.',
      } },
    ]]);
    await page.getByTestId('cbo-chat-input').fill('mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // Select a zone (paths appear once the zones GeoJSON loads) and advance.
    const paths = page.locator('.leaflet-overlay-pane svg path');
    await expect.poll(async () => paths.count(), { timeout: 30_000 }).toBeGreaterThan(10);
    const box = (await paths.nth(45).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.getByRole('button', { name: /next: select sites|próximo: selecionar/i }).first().click();
    await page.waitForTimeout(2500); // satellite basemap + OSM load

    // 1) Disarmed by default: navigate hint shows, neither arm button is active.
    const help = page.getByTestId('map-draw-help');
    await expect(help).toContainText(/arraste|drag|navegar|navigate|escolha|choose/i);

    // 2) A stray tap on the map adds NO custom point.
    const mapBox = (await page.locator('.leaflet-container').first().boundingBox())!;
    await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await page.waitForTimeout(800);
    await expect(page.getByText('Custom point', { exact: false })).toHaveCount(0);

    // 3) Arm "Um ponto" → the tap now drops the pin.
    await page.getByTestId('map-draw-point').click();
    await expect(help).toContainText(/toque no mapa|tap the map|marcar o lugar/i);
    await page.mouse.click(mapBox.x + mapBox.width / 2 + 20, mapBox.y + mapBox.height / 2 + 10);
    await expect(page.getByText('Custom point', { exact: false }).first()).toBeVisible({ timeout: 10_000 });

    // 4) Point mode auto-disarms after the drop (back to pan).
    await expect(help).toContainText(/arraste|escolha uma opção/i);

    // 5) Arm then re-tap the same button → disarms without dropping anything.
    await page.getByTestId('map-draw-area').click();
    await page.getByTestId('map-draw-area').click();
    await expect(help).toContainText(/arraste|escolha uma opção/i);
  });
});
