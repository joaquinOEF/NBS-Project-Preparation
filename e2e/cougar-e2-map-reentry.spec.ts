import { test, expect, type Page } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// "Abrir o mapa" used to open a DIFFERENT map than the one the agent opened.
//
// Cancelar nulled `openMapParams`, so re-entry fell through to
// RIGHT_PANEL_TOOLS.map.defaultParams — a second, hardcoded definition of the
// E2 map with `hazardTour: false` and its own prompt. The user lost the guided
// flood → heat → landslide walk and landed straight on bairro selection.
//
// The same fallback fired on reload once ANY chat turn followed the map opening
// (a "how do I read this?" question), because hydrateMessages only scanned the
// trailing assistant run for the `open_map` composer row.
//
// Now: re-entry restores the agent's real params, and the tour position lives on
// cbo_state.activeTool.tourIdx. The rules this pins:
//   cancel mid-tour  → resume on that hazard
//   cancel post-tour → no tour, straight to selection
//   reload mid-tour  → resume on that hazard
//   reload after a chat turn → still the agent's map, not the defaults

const E2_TOUR = {
  op: 'open_map' as const,
  params: {
    selectionMode: 'composite',
    zoneSource: 'neighborhood_zones',
    layers: ['osm_parks'],
    tileLayers: ['poa_flood_hazard', 'poa_heat_hazard', 'poa_landslide_hazard'],
    showLegendSimple: true,
    hazardTour: true,
    allowDeferSite: true,
    prompt: 'Conheça os riscos e marque onde vocês atuam.',
  },
};

/** The tour caption's "n/3" counter — language-agnostic, unlike the CTA label. */
const step = (page: Page, n: number) => page.getByText(`${n}/3`);

async function openTourMap(page: Page, api: TestApi): Promise<string> {
  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
  const cboId = (await marker.getAttribute('data-cbo-id'))!;

  await api.scriptCbo(cboId, [[{ op: 'set_phase', phase: 2 }, { op: 'say', text: 'Mapa.' }, E2_TOUR]]);
  await page.getByTestId('cbo-chat-input').fill('mapa');
  await page.getByTestId('cbo-chat-input').press('Enter');
  await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
  await expect(step(page, 1)).toBeVisible();
  return cboId;
}

test.describe('COUGAR — E2 map re-entry resumes the agent’s map', () => {
  // There is no Cancelar while the tour is running — the action bar shows only
  // the tour controls — so leaving mid-tour means switching right-panel tab.
  test('leave mid-tour via the tab → "Abrir o mapa" resumes on the same hazard', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    await openTourMap(page, api);

    // Walk to hazard 2 of 3 (Calor), then leave the map.
    await page.getByTestId('map-tour-next').click();
    await expect(step(page, 2)).toBeVisible();
    await page.getByTestId('cbo-tab-document').click();

    const chip = page.getByTestId('cbo-open-tool-map');
    await expect(chip).toBeVisible({ timeout: 10_000 });
    await chip.click();

    // Resumed on Calor, still inside the guided tour — not the selection view.
    await expect(step(page, 2)).toBeVisible();
    await expect(page.getByTestId('map-tour-howto')).toBeVisible();
  });

  // The reported bug. Cancelar exists on the zone step (post-tour), and it used
  // to null openMapParams, so re-entry rebuilt the map from defaultParams — a
  // different prompt, and hazardTour off. The screenshot that reported this
  // showed defaultParams' prompt verbatim.
  test('Cancelar → "Abrir o mapa" re-enters the agent’s map, not the phase defaults', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    await openTourMap(page, api);

    // Finish all three hazards → zone step, where Cancelar lives.
    for (let i = 0; i < 3; i++) await page.getByTestId('map-tour-next').click();
    await expect(page.getByTestId('map-tour-next')).toHaveCount(0);
    await page.getByTestId('map-cancel').click();

    await page.getByTestId('cbo-open-tool-map').click();
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // The agent's prompt survived; the fallback map's did not appear.
    await expect(page.getByText('Conheça os riscos e marque onde vocês atuam.')).toBeVisible();
    await expect(page.getByText('Marque o bairro e o lugar onde vocês atuam.')).toHaveCount(0);
    // A finished tour must not replay.
    await expect(page.getByTestId('map-tour-next')).toHaveCount(0);
    await expect(step(page, 1)).toHaveCount(0);
  });

  test('reload mid-tour resumes on the same hazard', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    await openTourMap(page, api);

    await page.getByTestId('map-tour-next').click();
    await expect(step(page, 2)).toBeVisible();

    // tourIdx is written to cbo_state.activeTool; debouncedPersist needs a beat.
    await page.waitForTimeout(1200);
    await page.reload();

    // Reload deliberately does NOT force the map tab open — the chip and the tab
    // pulse are the affordance (hydrateMessages). Take the chip, as a user would.
    await page.getByTestId('cbo-open-tool-map').click();
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
    await expect(step(page, 2)).toBeVisible();
  });

  test('a chat turn after the map opened does not lose the agent’s params on reload', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cboId = await openTourMap(page, api);

    // One ordinary chat turn, so the open_map composer row is no longer in the
    // trailing assistant run. This is what used to strand re-entry on the
    // phase defaults.
    await api.scriptCbo(cboId, [[{ op: 'say', text: 'Claro, pode perguntar.' }]]);
    await page.getByTestId('cbo-chat-input').fill('tenho uma dúvida');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.getByText('Claro, pode perguntar.')).toBeVisible({ timeout: 30_000 });

    await page.waitForTimeout(1200);
    await page.reload();
    await page.getByTestId('cbo-open-tool-map').click();
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // Still the agent's map: the tour is live, and the header is the agent's
    // prompt — not defaultParams' "Marque o bairro e o lugar onde vocês atuam."
    await expect(step(page, 1)).toBeVisible();
    await expect(page.getByText('Conheça os riscos e marque onde vocês atuam.')).toBeVisible();
  });

  test('tour-progress rejects a bogus index and a non-map tool', async ({ request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cboId } = await api.newSession();

    const bad = await request.post(`/api/cbo/${cboId}/tour-progress`, { data: { tourIdx: 9 } });
    expect(bad.status()).toBe(400);

    // No map opened yet → activeTool isn't 'map'.
    const wrongTool = await request.post(`/api/cbo/${cboId}/tour-progress`, { data: { tourIdx: 1 } });
    expect(wrongTool.status()).toBe(409);
  });
});
