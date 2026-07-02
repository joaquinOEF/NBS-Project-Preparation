import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Data-literacy: the "Where this data comes from" dialog on the CBO map. Opens
// from the map header, lists each layer with a plain-language description +
// real vintage (Ana's ask). The same shared dialog also renders on the
// orchestrator map (not reachable in this deterministic harness without the
// demo cohort, so it's covered by the shared component + TS types).

test.describe('COUGAR — data provenance dialog (CBO map)', () => {
  test('the map header exposes "About this data" with sourced vintages', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Vamos ao mapa.' },
      {
        op: 'open_map',
        params: {
          selectionMode: 'composite',
          zoneSource: 'neighborhood_zones',
          tileLayers: ['risk_flood_250m', 'risk_heat_250m', 'risk_landslide_250m'],
          showLegendSimple: true,
          hazardTour: false,
          allowDeferSite: true,
          prompt: 'Marque o bairro e o lugar onde vocês atuam.',
        },
      },
    ]]);

    await page.getByTestId('cbo-chat-input').fill('mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');

    // The map mounted → its header carries the provenance trigger.
    const trigger = page.getByTestId('data-provenance-trigger');
    await expect(trigger).toBeVisible({ timeout: 30_000 });
    await trigger.click();

    // Dialog lists layers with real sources + vintages (en for a standalone session).
    const dialog = page.getByTestId('data-provenance-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Where this data comes from')).toBeVisible();
    await expect(page.getByTestId('provenance-entry-flood')).toBeVisible();
    await expect(page.getByTestId('provenance-entry-landslide')).toBeVisible();
    // The landslide caveat closes the "it's just old 2016 data" gap.
    await expect(dialog.getByText(/susceptibility index/i)).toBeVisible();
    // A real vintage is shown (2022 Census feeds every risk layer).
    await expect(dialog.getByText(/2022 Census/i).first()).toBeVisible();
  });
});
