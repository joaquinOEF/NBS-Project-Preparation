import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Desktop clipping regression (JVP, 2026-07-07): the app-shell page slot
// (App.tsx) had CSS's default min-width:auto, so a page whose intrinsic
// content width exceeded the window (CBO chat strip + map rail ≈ 1650px)
// inflated the shell past the viewport; the two w-1/2 columns split the
// inflated width and an outer overflow-hidden clipped the right rail with no
// scrollbar — the map tour card and controls simply lost their right edge.
// Fixed with min-w-0 on the shell slot and the right rail.

const DESKTOP_WIDTHS = [1512, 1280];

for (const width of DESKTOP_WIDTHS) {
  test.describe(`COUGAR — no horizontal clipping at ${width}px`, () => {
    test.use({ viewport: { width, height: 950 }, locale: 'pt-BR' });

    test(`examples strip + map rail fit the viewport at ${width}px`, async ({ page, request }) => {
      const api = new TestApi(request);
      test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

      await page.goto('/cbo-profile');
      const marker = page.getByTestId('cbo-stream-status');
      await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
      const cboId = (await marker.getAttribute('data-cbo-id'))!;

      // The worst-case intrinsic-width turn from the field screenshot: a
      // showcase strip in chat AND the hazard-tour map in the right rail.
      await api.scriptCbo(cboId, [[
        { op: 'show_examples', cardIds: ['barigui-park', 'goncalo-tunnel'], mode: 'browse', intro: 'Exemplos reais' } as any,
        { op: 'say', text: 'Esses são exemplos reais — em Porto Alegre e no Brasil.' },
        {
          op: 'open_map',
          params: {
            selectionMode: 'composite',
            zoneSource: 'neighborhood_zones',
            layers: ['osm_parks', 'osm_schools'],
            tileLayers: ['risk_flood_250m', 'risk_heat_250m', 'risk_landslide_250m'],
            showLegendSimple: true,
            hazardTour: true,
            allowDeferSite: true,
            prompt: 'Conheça os riscos e marque onde vocês atuam.',
          },
        } as any,
      ]]);
      await page.getByTestId('cbo-chat-input').fill('Abrir o mapa');
      await page.getByTestId('cbo-chat-input').press('Enter');
      await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('map-tour-next')).toBeVisible({ timeout: 15_000 });

      const m = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const cols = Array.from(document.querySelectorAll('div'))
          .filter(d => d.className && String(d.className).includes('md:w-1/2'))
          .slice(0, 2)
          .map(d => d.getBoundingClientRect());
        return {
          vw,
          docScrollW: document.documentElement.scrollWidth,
          colRights: cols.map(r => Math.round(r.right)),
          colWidths: cols.map(r => Math.round(r.width)),
        };
      });

      // No page-level horizontal overflow…
      expect(m.docScrollW).toBeLessThanOrEqual(m.vw + 1);
      // …and both columns end inside the viewport (the rail used to end ~140px past it).
      for (const right of m.colRights) expect(right).toBeLessThanOrEqual(m.vw + 1);
      // True 50/50 split, not an inflated row split.
      for (const w of m.colWidths) expect(w).toBeLessThanOrEqual(Math.ceil(m.vw / 2) + 1);

      // The tour card's scale labels — the exact pixels cut off in the field
      // screenshot — are fully visible.
      const label = page.getByText('mais risco');
      await expect(label).toBeVisible();
      const box = (await label.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(m.vw + 1);
    });
  });
}
