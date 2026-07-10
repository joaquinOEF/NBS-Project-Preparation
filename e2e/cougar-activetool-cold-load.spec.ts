import { test, expect, type Page } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// activeTool (the open right-panel tool + the E2 tour position) lived ONLY in
// the in-memory Map — it had no DB column, and rowToState / flushCbo never
// touched it. So it survived a warm page reload (the Map is still there) but NOT
// a cold load: a Replit autoscale recycle drops the process, the next request
// hydrates from DB, and activeTool came back null — the nudge chip vanished and
// the hazard tour restarted at Enchente.
//
// The existing "reload mid-tour resumes" test passed only because a page reload
// keeps the server process warm. This one evicts from the Map (flush → drop) to
// force a genuine DB round-trip.

// Explicit params (not the e2_risk_tour preset — that lands in a separate PR)
// so this spec stands alone on main.
const E2_TOUR_PARAMS = {
  selectionMode: 'composite',
  zoneSource: 'neighborhood_zones',
  layers: ['osm_parks'],
  tileLayers: ['poa_flood_hazard', 'poa_heat_hazard', 'poa_landslide_hazard'],
  showLegendSimple: true,
  hazardTour: true,
  allowDeferSite: true,
  prompt: 'Conheça os riscos e marque onde vocês atuam.',
};

const step = (page: Page, n: number) => page.getByText(`${n}/3`);

test.describe('COUGAR — activeTool survives a cold load', () => {
  test('the hazard tour resumes on its hazard after a process recycle', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'set_phase', phase: 2 },
      { op: 'say', text: 'Vamos ver os riscos.' },
      { op: 'open_map', params: E2_TOUR_PARAMS },
    ]]);
    await page.getByTestId('cbo-chat-input').fill('mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // Advance to Calor (2/3), and let the tour-progress write + flush settle.
    await page.getByTestId('map-tour-next').click();
    await expect(step(page, 2)).toBeVisible();
    await page.waitForTimeout(1200);

    // Cold load: flush to DB, drop the in-memory maps. Only the DB row survives.
    await api.evictCbo(cboId);

    await page.reload();
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    await page.getByTestId('cbo-open-tool-map').click();
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // Resumed on Calor from the DB, not restarted at Enchente.
    await expect(step(page, 2)).toBeVisible();
  });

  test('the pending-tool nudge chip is present after a cold load', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'set_phase', phase: 2 },
      { op: 'say', text: 'Abrindo o mapa.' },
      { op: 'open_map', params: { ...E2_TOUR_PARAMS, hazardTour: false, prompt: 'Marque o bairro.' } },
    ]]);
    await page.getByTestId('cbo-chat-input').fill('mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1200);

    await api.evictCbo(cboId);
    await page.reload();
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });

    // Leave to the document tab: the nudge chip (pendingTool → activeTool.kind)
    // must still be there. Before the column, activeTool was null cold → no chip.
    await page.getByTestId('cbo-tab-document').click();
    await expect(page.getByTestId('cbo-open-tool-map')).toBeVisible({ timeout: 10_000 });
  });
});
