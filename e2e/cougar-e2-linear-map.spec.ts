import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// E2 linear flow — the map opens twice, each session doing ONE job:
//   Map 1 (e2_bairro):       hazard tour → pick the bairro → "Confirmar bairro"
//                            ends the session (no site step, no deferred marker).
//   Map 2 (e2_site_focused): opens already INSIDE the confirmed bairro
//                            (focusZone) — assets step, satellite, no zone step
//                            to go back to, and NO "usar o bairro todo" escape
//                            (the no-site paths live in the chat fork).

test.describe('COUGAR — E2 linear map sessions', () => {
  test.use({ locale: 'pt-BR' });

  test('e2_bairro: tour → zone pick → Confirmar bairro ends the session', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Vamos pro mapa.' },
      { op: 'open_map', params: { preset: 'e2_bairro' } },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Abrir o mapa');
    await input.press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // Walk the tour to the neighborhood step.
    const tourNext = page.getByTestId('map-tour-next');
    await expect(tourNext).toBeVisible({ timeout: 15_000 });
    await tourNext.click();
    await tourNext.click();
    await tourNext.click();
    await expect(tourNext).toHaveCount(0, { timeout: 10_000 });

    // The session ender is "Confirmar bairro" — the old "Próximo (sites)" step
    // must not exist in this preset. Disabled until a zone is picked.
    const confirmBairro = page.getByTestId('map-confirm-bairro');
    await expect(confirmBairro).toBeVisible();
    await expect(confirmBairro).toBeDisabled();

    // Pick the bairro under the map center (zones GeoJSON is loaded by now).
    await page.waitForTimeout(600);
    const mapBox = (await page.locator('.leaflet-container').first().boundingBox())!;
    await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await expect(confirmBairro).toBeEnabled({ timeout: 10_000 });
    await confirmBairro.click();

    // Back in the chat: the zone-only summary — bairro + risks, and neither a
    // site line nor the deferred "bairro todo" line (this was NOT a deferral).
    await expect(page.getByText('Selecionei no mapa:', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/🔵 inundação/).first()).toBeVisible();
    await expect(page.getByText('Sem local específico ainda', { exact: false })).toHaveCount(0);
  });

  test('e2_site_focused + focusZone: chooser overlay, one affordance at a time, pin confirms', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    // Deterministic name search (no live Nominatim in tests).
    await page.route('**/api/geospatial/osm-search', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ assets: [{ name: 'Praça Teste', centroid: [-30.045, -51.19] }] }),
      })
    );
    // Deterministic known-places (no live Overpass): one park INSIDE Bela
    // Vista (its centroid), one outside — only the inside one may list.
    await page.route('**/api/osm/parks', route =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { name: 'Praça da Bela Vista' }, geometry: { type: 'Point', coordinates: [-51.18983, -30.03273] } },
            { type: 'Feature', properties: { name: 'Praça Longe' }, geometry: { type: 'Point', coordinates: [-51.4, -30.2] } },
          ],
        }),
      })
    );
    await page.route(/\/api\/osm\/(schools|wetlands)/, route =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) })
    );

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Agora o lugar.' },
      { op: 'open_map', params: { preset: 'e2_site_focused', focusZone: 'Bela Vista' } },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Tenho um lugar');
    await input.press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // Straight to the site step, framed by the chooser overlay — no zone step
    // behind (back button = plain Cancel), and none of the old furniture:
    // mode picker, stepper, lat/lng panel, whole-bairro escape (decision A2).
    const chooser = page.getByTestId('map-simple-chooser');
    await expect(chooser).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('map-cancel')).toBeVisible();
    await expect(page.getByTestId('map-back-to-zones')).toHaveCount(0);
    await expect(page.getByTestId('map-draw-point')).toHaveCount(0);
    await expect(page.getByTestId('map-draw-area')).toHaveCount(0);
    await expect(page.getByTestId('map-add-site-toggle')).toHaveCount(0);
    await expect(page.getByTestId('map-use-whole-bairro')).toHaveCount(0);
    await expect(page.getByTestId('map-confirm-site')).toBeDisabled();

    // Known places of the bairro list as one-tap picks — clipped to the zone
    // polygon, so the far-away park must NOT appear.
    const places = page.getByTestId('map-simple-places');
    await expect(places).toBeVisible({ timeout: 10_000 });
    await expect(places.getByText('Praça da Bela Vista')).toBeVisible();
    await expect(places.getByText('Praça Longe')).toHaveCount(0);

    // Search path: type a name, pick the result — the pin is placed and the
    // overlay closes (a site now exists).
    await page.getByTestId('map-simple-search').click();
    await page.getByTestId('map-simple-search-input').fill('praça');
    await page.getByTestId('map-simple-search-btn').click();
    await page.getByTestId('map-simple-result-0').click();
    await expect(chooser).toHaveCount(0);
    const confirm = page.getByTestId('map-confirm-site');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    // Back in the chat: the summary names the place.
    await expect(page.getByText('Selecionei no mapa:', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Praça Teste', { exact: false }).first()).toBeVisible();
  });

  test('e2_site_focused: "marcar no mapa" path — tap drops the pin, second tap moves it', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Agora o lugar.' },
      { op: 'open_map', params: { preset: 'e2_site_focused', focusZone: 'Bela Vista' } },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Tenho um lugar');
    await input.press('Enter');
    await expect(page.getByTestId('map-simple-chooser')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('map-simple-pin').click();
    await expect(page.getByTestId('map-simple-chooser')).toHaveCount(0);
    await expect(page.getByText('Toque no lugar exato', { exact: false })).toBeVisible();

    // First tap drops the pin; confirm becomes available.
    await page.waitForTimeout(400);
    const mapBox = (await page.locator('.leaflet-container').first().boundingBox())!;
    await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await expect(page.getByTestId('map-confirm-site')).toBeEnabled({ timeout: 10_000 });

    // Second tap MOVES the pin (single-pin mode) — still exactly one site chip.
    await page.mouse.click(mapBox.x + mapBox.width / 2 + 40, mapBox.y + mapBox.height / 2 + 20);
    await page.waitForTimeout(300);
    expect(await page.locator('[data-testid="map-confirm-site"]').count()).toBe(1);
    await expect(page.getByTestId('map-confirm-site')).toBeEnabled();
    await page.getByTestId('map-confirm-site').click();
    await expect(page.getByText('Selecionei no mapa:', { exact: false })).toBeVisible({ timeout: 15_000 });
    // One site only in the summary (the moved pin, not two).
    await expect(page.getByText(/📍 1 local/)).toBeVisible();
  });
});
