import { test, expect, type Page } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// The E2 map was described in five places, three of which disagreed. The two
// copies the model was most likely to retype (the open_map tool description and
// the phase map in the system prompt) said `zoneSource: "neighborhoods"` and
// omitted `hazardTour` and `allowDeferSite`.
//
// That is not cosmetic. `neighborhoods` loads raw IBGE polygons, which carry no
// `priorityScore`; without `allowDeferSite`, getDefaultStyle takes the branch
//   fillOpacity = priorityScore != null ? … : 0
// so every bairro renders with ZERO fill — an invisible map, and no hazard tour.
//
// Params now live once, in shared/cbo-map-presets.ts. The agent names a preset.
// This spec pins what each preset actually renders.

/** Fill opacity of the neighborhood choropleth, read off the SVG. */
async function zoneFillOpacities(page: Page): Promise<number[]> {
  return page.$$eval('.leaflet-overlay-pane path', paths =>
    paths.map(p => Number((p as SVGPathElement).getAttribute('fill-opacity') ?? '0')),
  );
}

async function boot(page: Page, api: TestApi): Promise<string> {
  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
  return (await marker.getAttribute('data-cbo-id'))!;
}

test.describe('COUGAR — E2 map presets are the single definition', () => {
  test('e2_risk_tour opens the guided tour, with nothing but a preset name', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cboId = await boot(page, api);

    // The whole call. No selectionMode, no zoneSource, no prompt.
    await api.scriptCbo(cboId, [[
      { op: 'set_phase', phase: 2 },
      { op: 'say', text: 'Vamos ver os riscos.' },
      { op: 'open_map', params: { preset: 'e2_risk_tour' } },
    ]]);
    await page.getByTestId('cbo-chat-input').fill('mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');

    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
    // hazardTour: true
    await expect(page.getByText('1/3')).toBeVisible();
    await expect(page.getByTestId('map-tour-next')).toBeVisible();
    // prompt came from the preset, localized
    await expect(page.getByText(/Conheça os riscos|Get to know the risks/)).toBeVisible();
  });

  test('e2_site skips the tour and renders VISIBLE risk-coloured bairros', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cboId = await boot(page, api);

    await api.scriptCbo(cboId, [[
      { op: 'set_phase', phase: 2 },
      { op: 'say', text: 'Marca teu bairro.' },
      { op: 'open_map', params: { preset: 'e2_site' } },
    ]]);
    await page.getByTestId('cbo-chat-input').fill('mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');

    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('map-tour-next')).toHaveCount(0);

    // The regression that mattered: zoneSource 'neighborhoods' + no
    // allowDeferSite gave every zone fill-opacity 0. Require real fill.
    await expect
      .poll(async () => (await zoneFillOpacities(page)).filter(o => o > 0.1).length, { timeout: 20_000 })
      .toBeGreaterThan(10);
  });

  test('e2_browse opens exploration mode with the narration banner', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cboId = await boot(page, api);

    await api.scriptCbo(cboId, [[
      { op: 'set_phase', phase: 2 },
      { op: 'say', text: 'Dá uma olhada.' },
      { op: 'open_map', params: { preset: 'e2_browse' } },
    ]]);
    await page.getByTestId('cbo-chat-input').fill('mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');

    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
    // browse-only → the single "back to chat" CTA, no commitment
    await expect(page.getByTestId('map-back-to-chat')).toBeVisible();
    await expect(page.getByText(/Azul = enchente|Blue = flood/)).toBeVisible();
  });

  test('an explicit arg narrows a preset instead of replacing it', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cboId = await boot(page, api);

    await api.scriptCbo(cboId, [[
      { op: 'set_phase', phase: 2 },
      { op: 'say', text: 'Sem tour.' },
      // "Já conheço os riscos" — the tour off, everything else from the preset.
      { op: 'open_map', params: { preset: 'e2_risk_tour', hazardTour: false, prompt: 'Marque o terreno da proposta.' } },
    ]]);
    await page.getByTestId('cbo-chat-input').fill('mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');

    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('map-tour-next')).toHaveCount(0);       // override won
    await expect(page.getByText('Marque o terreno da proposta.')).toBeVisible();
    // …and the preset's allowDeferSite survived, so the zones are still visible.
    await expect
      .poll(async () => (await zoneFillOpacities(page)).filter(o => o > 0.1).length, { timeout: 20_000 })
      .toBeGreaterThan(10);
  });
});
