import { test, expect, type Page } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// E2 Map 1 (`e2_bairro`) — the real bairro step of the linear flow, and the only
// map preset the CBO cohort ever sees. Two things are pinned here:
//
//  1. A bairro can actually be selected by a HUMAN gesture. Reported by JVP
//     2026-08-03 ("I can't actually select any neighborhood, so no way to
//     select") and invisible to the suite until now, because every existing
//     click used `page.mouse.click()` — pixel-perfect, zero drift — while
//     Leaflet swallows any click whose pointer moved past `clickTolerance`.
//  2. The step carries one legend, not two, and no controls that lead nowhere.

async function zonePathCount(page: Page): Promise<number> {
  return page.$$eval('.leaflet-overlay-pane path', p => p.length);
}

/** Inline pointer-events on the zone paths — '' means taps reach Leaflet. */
async function pointerEventsValues(page: Page): Promise<string[]> {
  return page.$$eval('.leaflet-overlay-pane path', paths =>
    paths.map(p => (p as SVGPathElement).style.pointerEvents || ''),
  );
}

/** Open the e2_bairro map and wait for the zones GeoJSON (94 bairros). */
async function bootToBairroMap(
  page: Page,
  api: TestApi,
  params: Record<string, unknown> = {},
): Promise<void> {
  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
  const cboId = (await marker.getAttribute('data-cbo-id'))!;

  await api.scriptCbo(cboId, [[
    { op: 'set_phase', phase: 2 },
    { op: 'say', text: 'Vamos pro mapa.' },
    { op: 'open_map', params: { preset: 'e2_bairro', ...params } },
  ]]);
  await page.getByTestId('cbo-chat-input').fill('mapa');
  await page.getByTestId('cbo-chat-input').press('Enter');

  await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => zonePathCount(page), { timeout: 20_000 }).toBeGreaterThan(50);
}

/** Walk the three hazard steps to the end of the tour. */
async function finishTour(page: Page): Promise<void> {
  const tourNext = page.getByTestId('map-tour-next');
  await expect(tourNext).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 3; i++) await tourNext.click();
  await expect(tourNext).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(1200);
}

/** Centre of the largest bairro polygon currently on screen. */
async function biggestZoneCentre(page: Page) {
  return page.evaluate(() => {
    const paths = Array.from(
      document.querySelectorAll('.leaflet-overlay-pane path'),
    ) as SVGPathElement[];
    const big = paths
      .map(p => p.getBoundingClientRect())
      .filter(b => b.width > 15 && b.height > 15)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    return big ? { x: big.x + big.width / 2, y: big.y + big.height / 2 } : null;
  });
}

test.describe('COUGAR — E2 Map 1 (e2_bairro)', () => {
  test.use({ locale: 'pt-BR' });

  test('a tap WITH pointer drift still selects a bairro', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await bootToBairroMap(page, api);
    await finishTour(page);

    const confirm = page.getByTestId('map-confirm-bairro');
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeDisabled();

    // The tour sets pointer-events:none on every zone path (outline mode). If
    // the zone step didn't clear it, no tap could ever reach a bairro.
    const pe = await pointerEventsValues(page);
    expect(pe.filter(v => v === 'none'), 'zone paths still inert at the zone step').toHaveLength(0);

    // 4px right, 2px down between mousedown and mouseup — an ordinary trackpad
    // click, and past Leaflet's 3px default. See MAP-CLICK-EATEN-BY-DRIFT.
    const target = await biggestZoneCentre(page);
    expect(target, 'no bairro polygon big enough to tap').not.toBeNull();
    await page.mouse.move(target!.x, target!.y);
    await page.mouse.down();
    await page.mouse.move(target!.x + 4, target!.y + 2, { steps: 3 });
    await page.mouse.up();

    await expect(
      confirm,
      'a bairro tap with ordinary pointer drift must still select',
    ).toBeEnabled();
  });

  test('one legend, no dead stepper, no risk choropleth', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await bootToBairroMap(page, api);

    // The tour carries its OWN legend — the per-hazard caption naming the layer
    // on screen. That is the one legend this map should ever show.
    await expect(page.getByTestId('map-simple-legend')).toHaveCount(0);
    await expect(page.getByText(/Enchente|Flood/).first()).toBeVisible();

    await finishTour(page);

    // Zone step: still no chip row. The tour turns every raster off when it
    // ends, so the chips were three dead toggles masquerading as the key to the
    // polygon colours — tapping one stacked a raster back over the map.
    await expect(page.getByTestId('map-simple-legend')).toHaveCount(0);
    // …and so is the overlay that repeated the same three dots beneath them.
    await expect(page.getByText(/colorido pelo risco principal/i)).toHaveCount(0);
    // …and the "1 Bairro › 2 Locais" trail, pointing at a step this session
    // (confirmAtZone) never reaches.
    await expect(page.getByText(/2\s*Locais/i)).toHaveCount(0);
    // Hiding the 3 chips must not swap the full layer toolkit back in.
    await expect(page.getByText(/^Camadas:/)).toHaveCount(0);

    // ONE sequential ramp, and it must actually separate the city. Removing the
    // old two-encoding choropleth left the map blank, which cannot answer the
    // question the hazard tour just raised ("so which bairros are worst?").
    // Colouring by within-city percentile can — on the absolute means it was
    // arithmetically impossible for a POA bairro to clear the lowest band, so
    // the map could only ever have been flat (see CBO-RISK-SCALE).
    const fills = await page.$$eval('.leaflet-overlay-pane path', paths =>
      paths.map(p => p.getAttribute('fill') ?? ''),
    );
    const distinct = new Set(fills.filter(Boolean));
    expect(distinct.size, 'the ramp must separate the city, not paint it flat')
      .toBeGreaterThan(2);

    // One legend for one scale — and NOT the old two-encoding explainer.
    await expect(page.getByTestId('map-risk-ramp-legend')).toBeVisible();
    await expect(page.getByText(/colorido pelo risco principal/i)).toHaveCount(0);

    await page.screenshot({ path: 'test-results/e2-bairro-step.png' });
  });

  test('preselectZone confirms E1s bairro instead of asking them to find it', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    // Lower-cased and accent-free on purpose: bairro_of_operation is free text
    // an orchestrator typed at invite time, so the matcher has to casefold.
    await bootToBairroMap(page, api, { preselectZone: 'sarandi' });

    // The outline is drawn DURING the tour — the point is that the org watches
    // flood/heat/landslide sweep a city it can locate itself in.
    await expect(page.getByTestId('map-tour-next')).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => page.$$eval('.leaflet-overlay-pane path', paths =>
        paths.filter(p => p.getAttribute('stroke-dasharray') === '6 4').length,
      ), { timeout: 15_000 })
      .toBeGreaterThan(0);

    await finishTour(page);

    // Already selected, already named — confirmable without a single map tap.
    const confirm = page.getByTestId('map-confirm-bairro');
    await expect(confirm).toBeEnabled();
    await expect(confirm).toContainText(/Sarandi/i);
    await expect(page.getByText(/Já marcamos Sarandi/i)).toBeVisible();

    await page.screenshot({ path: 'test-results/e2-bairro-preselected.png' });
  });

  // A thumb on glass drifts far more than a trackpad — this is the surface the
  // cohort actually uses, and the one where the swallowed-click bug was a
  // certainty rather than a coin flip.
  test.describe('at an iPhone viewport', () => {
    test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });

    test('a touch tap with drift selects a bairro', async ({ page, request }) => {
      test.setTimeout(120_000);
      const api = new TestApi(request);
      test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

      await bootToBairroMap(page, api);
      // Mobile puts the map behind its own tab.
      const mapTab = page.getByRole('tab', { name: /Mapa|Map/i });
      if (await mapTab.count()) await mapTab.first().click();
      await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 20_000 });
      await finishTour(page);

      const confirm = page.getByTestId('map-confirm-bairro');
      await expect(confirm).toBeDisabled();

      const target = await biggestZoneCentre(page);
      expect(target, 'no bairro polygon big enough to tap').not.toBeNull();
      await page.touchscreen.tap(target!.x, target!.y);

      await expect(confirm, 'a touch tap must select a bairro').toBeEnabled();
      await page.screenshot({ path: 'test-results/e2-bairro-mobile.png' });
    });
  });

  test('reload at the zone step: the tour does not replay and the bairro is still selectable', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await bootToBairroMap(page, api, { preselectZone: 'sarandi' });
    await finishTour(page);
    await expect(page.getByTestId('map-confirm-bairro')).toBeEnabled();

    // tourIdx is written to cbo_state.activeTool; debouncedPersist needs a beat.
    await page.waitForTimeout(1200);
    await page.reload();

    // Reload deliberately does NOT force the map tab open — the chip and the
    // tab pulse are the affordance (hydrateMessages). Take the chip, as a user
    // would.
    await page.getByTestId('cbo-open-tool-map').click();
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => zonePathCount(page), { timeout: 20_000 }).toBeGreaterThan(50);

    // A finished tour must not replay…
    await expect(page.getByTestId('map-tour-next')).toHaveCount(0);
    // …the decluttering must survive rehydration…
    await expect(page.getByTestId('map-simple-legend')).toHaveCount(0);
    await expect(page.getByText(/2\s*Locais/i)).toHaveCount(0);
    // …and the pre-selection comes back with it, still named. `preselectZone`
    // rides in cbo_state.activeTool with the rest of the agent's map params, so
    // an org that loses its connection mid-step returns to a confirmable screen
    // rather than an empty map.
    const confirm = page.getByTestId('map-confirm-bairro');
    await expect(confirm).toBeVisible();
    await expect(confirm, 'the zone step must be answerable after a reload').toBeEnabled();
    await expect(confirm).toContainText(/Sarandi/i);
  });

  test('an unmatched bairro name degrades to the normal tap flow', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    // A typo, or an org outside the 94 POA zones. Guessing a near-match here
    // would commit them to the wrong territory, which then drives the risk
    // numbers, the família ranking and Workshop 3.
    await bootToBairroMap(page, api, { preselectZone: 'Bairro Que Nao Existe' });
    await finishTour(page);

    const confirm = page.getByTestId('map-confirm-bairro');
    await expect(confirm).toBeDisabled();
    await expect(confirm).toHaveText(/Confirmar bairro/i);
  });
});
