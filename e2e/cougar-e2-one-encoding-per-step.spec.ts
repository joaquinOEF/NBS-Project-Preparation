import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// E2 map: one color encoding per step (JVP, 2026-07-07). During the hazard
// tour the zones choropleth used to render fully colored UNDER the hazard
// raster — two encodings at once. Contract now:
//   tour  → raster only, bairros as thin inert outlines (fill 0, no taps)
//   zone  → choropleth only (rasters already off), interactive
//   site  → selected bairro as a bold outline with NO fill; other bairros
//           hidden and inert (taps go to point-dropping, not zone-select)

const OPEN_MAP = {
  op: 'open_map' as const,
  params: {
    selectionMode: 'composite', zoneSource: 'neighborhood_zones',
    layers: ['osm_parks'],
    tileLayers: ['risk_flood_250m', 'risk_heat_250m', 'risk_landslide_250m'],
    showLegendSimple: true, hazardTour: true, allowDeferSite: true,
    prompt: 'Conheça os riscos e marque onde vocês atuam.',
  },
};

// All zone paths live in the overlay pane as SVG paths. Read their effective
// fill-opacity (attribute set by Leaflet setStyle).
async function zoneFillOpacities(page: import('@playwright/test').Page): Promise<number[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.leaflet-overlay-pane path'))
      .map(p => parseFloat(p.getAttribute('fill-opacity') ?? '0')),
  );
}

test.describe('COUGAR — E2 map shows one encoding per step', () => {
  test.use({ locale: 'pt-BR' });

  test('tour: outlines only; zone step: choropleth; site step: selected outline, rest hidden', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[{ op: 'say', text: 'Vamos pro mapa.' }, OPEN_MAP as any]]);
    await page.getByTestId('cbo-chat-input').fill('Abrir o mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
    const tourNext = page.getByTestId('map-tour-next');
    await expect(tourNext).toBeVisible({ timeout: 15_000 });

    // Wait for the zones GeoJSON (94 bairros → >50 paths).
    await expect
      .poll(async () => (await zoneFillOpacities(page)).length, { timeout: 20_000 })
      .toBeGreaterThan(50);

    // TOUR: every zone is outline-only — no fill competes with the raster.
    const tourFills = await zoneFillOpacities(page);
    expect(Math.max(...tourFills)).toBeLessThanOrEqual(0.1);

    // A tap on a bairro mid-tour selects nothing (zones are inert).
    const tourBox = (await page.locator('.leaflet-container').first().boundingBox())!;
    await page.mouse.click(tourBox.x + tourBox.width / 2, tourBox.y + tourBox.height / 2);
    await expect(page.getByRole('button', { name: /próximo: selecionar/i })).toHaveCount(0);

    // Finish the tour → ZONE step: the choropleth is back and colored.
    await tourNext.click();
    await tourNext.click();
    await tourNext.click();
    await expect(tourNext).toHaveCount(0, { timeout: 10_000 });
    await expect
      .poll(async () => Math.max(...(await zoneFillOpacities(page))), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(0.3);

    // Select a bairro and advance to the SITE step. Re-measure the map: the
    // stepper + risk-chip rows appear when the tour ends and shift it down;
    // give the layout/animation a beat to settle before clicking.
    await page.waitForTimeout(1000);
    const mapBox = (await page.locator('.leaflet-container').first().boundingBox())!;
    await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    const nextBtn = page.getByRole('button', { name: /próximo: selecionar/i }).first();
    await expect(nextBtn).toBeVisible({ timeout: 10_000 });
    await nextBtn.click();
    await expect(page.getByTestId('map-draw-point')).toBeVisible({ timeout: 15_000 });

    // SITE step: no zone fill at all (selected = outline only; satellite must
    // show through). OSM park polygons may carry fill — exclude them by
    // checking strokes: exactly the zone paths with visible stroke should be
    // few (the selected bairro), and every zone fill is 0.
    await expect
      .poll(async () => page.evaluate(() => {
        const paths = Array.from(document.querySelectorAll('.leaflet-overlay-pane path'));
        // Zone paths are the ones Leaflet styled with our dark slate or blue
        // strokes; OSM layers use their own colors but ALSO fill. The contract
        // we assert: no path has BOTH stroke #1d4ed8-blue fill... keep simple:
        // count paths with fill-opacity > 0.1 that are NOT osm (osm paths have
        // stroke-width 2 and stroke != #1d4ed8/#64748b/#334155/rgba slate).
        const zoneStrokes = new Set(['#334155', '#1d4ed8', '#64748b', '#1e293b']);
        return paths.filter(p => {
          const fo = parseFloat(p.getAttribute('fill-opacity') ?? '0');
          const stroke = (p.getAttribute('stroke') || '').toLowerCase();
          return zoneStrokes.has(stroke) && fo > 0.05;
        }).length;
      }), { timeout: 15_000 })
      .toBe(0);

    // And the selected bairro's bold blue outline IS present.
    const blueOutlines = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.leaflet-overlay-pane path'))
        .filter(p => (p.getAttribute('stroke') || '').toLowerCase() === '#1d4ed8'
          && parseFloat(p.getAttribute('stroke-opacity') ?? '1') > 0.5).length,
    );
    expect(blueOutlines).toBeGreaterThanOrEqual(1);
  });
});
