import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// The ⓘ "De onde vêm estes dados" dialog opened UNDERNEATH the hazard legend.
//
// Every portalled Radix overlay in this app is z-50 (dialog, popover, select,
// tooltip, dropdown-menu, sheet, alert-dialog). MapMicroapp's own overlays are
// z-900 (tour caption, narration banner, zone explainer, basemap toggle) and
// z-1000/1001 (loading veil, HazardLegendSheet), and they live OUTSIDE
// .leaflet-container. With no stacking context between them and <html>, those
// z-indices compete in the root stacking context and win.
//
// Leaflet already solves this for its own panes (z-400/800/999) by giving
// .leaflet-container `z-index: 0`. MapMicroapp's root now does the same via
// Tailwind's `isolate`.
//
// This CANNOT be asserted with elementFromPoint: the tour caption is
// pointer-events-none, so hit-testing happily reports the dialog on top while
// the caption paints over it. Assert the structural invariant instead.

const OPEN_TOUR = {
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

/**
 * Walk el → body. Report the first ancestor that creates a stacking context,
 * or null if the element's z-index escapes into the root context.
 */
const STACKING_ANCESTOR = (selector: string) => {
  const start = document.querySelector(selector) as HTMLElement | null;
  if (!start) return 'ELEMENT_MISSING';
  for (let el = start.parentElement; el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el);
    if (s.isolation === 'isolate') return `isolation:isolate on .${el.className.toString().slice(0, 40)}`;
    if (s.zIndex !== 'auto' && s.position !== 'static') return `z-index:${s.zIndex} on .${el.className.toString().slice(0, 40)}`;
    if (s.transform !== 'none' || s.filter !== 'none' || s.opacity !== '1') return `transform/filter/opacity on .${el.className.toString().slice(0, 40)}`;
    if (s.contain !== 'none' || s.willChange !== 'auto') return `contain/will-change on .${el.className.toString().slice(0, 40)}`;
  }
  return null; // escapes to the root stacking context — the bug
};

test.describe('COUGAR — map overlays never paint over a dialog', () => {
  test('MapMicroapp overlays are trapped in a local stacking context', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[{ op: 'say', text: 'riscos' }, OPEN_TOUR]]);
    await page.getByTestId('cbo-chat-input').fill('Mostra o mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    // The tour caption (z-900) must not reach the root stacking context.
    const caption = await page.evaluate(STACKING_ANCESTOR, '.z-\\[900\\]');
    expect(caption, 'tour caption z-900 escapes to the root stacking context').not.toBeNull();
    expect(caption).toContain('isolation:isolate');

    // Same for the legend sheet (z-1001), which is rendered at the microapp root.
    await page.getByTestId('map-tour-howto').click();
    await expect(page.getByTestId('map-help-sheet')).toBeVisible();
    const sheet = await page.evaluate(STACKING_ANCESTOR, '[data-testid="map-help-sheet"]');
    expect(sheet, 'legend sheet z-1001 escapes to the root stacking context').not.toBeNull();
    expect(sheet).toContain('isolation:isolate');
    await page.getByTestId('map-help-understood').click();

    // And the invariant that makes all of the above matter: every portalled
    // Radix overlay is z-50, so anything outside a stacking context with a
    // bigger z-index wins. Open the ⓘ dialog and pin its z-index.
    await page.getByRole('button', { name: /about this data|sobre estes dados/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('z-index', '50');

    // The dialog's own stacking ancestor is the body-level portal, i.e. none.
    // If someone "fixes" a future occlusion by bumping a map overlay past 50
    // again, the two assertions above fail first.
  });
});
