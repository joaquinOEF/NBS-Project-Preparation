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

  test('e2_site_focused + focusZone: opens inside the bairro, no zone step, no bairro-todo escape', async ({ page, request }) => {
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
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // Straight to the assets (site) step: the add-a-site affordance renders and
    // the back button is a plain Cancel — there is no zone step to return to.
    await expect(page.getByTestId('map-add-site-toggle')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('map-cancel')).toBeVisible();
    await expect(page.getByTestId('map-back-to-zones')).toHaveCount(0);

    // Decision A2: the user already said they HAVE a place — no whole-bairro
    // confirm here; the Confirm stays disabled until a real site is marked.
    await expect(page.getByTestId('map-use-whole-bairro')).toHaveCount(0);
    await expect(page.getByTestId('map-confirm-site')).toBeDisabled();

    // The name search (biased to the bairro) is reachable.
    await page.getByTestId('map-add-site-toggle').click();
    await expect(page.getByTestId('map-site-search-input')).toBeVisible();
  });
});
