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
          tileLayers: ['poa_flood_hazard', 'poa_heat_hazard', 'poa_landslide_hazard'],
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
    // The tiles on screen are the Prefeitura's PLAC/ARVC ameaça, so that is
    // what the dialog describes — not OEF's H×E×V rasters (10 Nov 2026).
    await expect(dialog.getByText(/Climate Action Plan \(PLAC\)/i).first()).toBeVisible();
    await expect(dialog.getByText(/2050 scenario/i).first()).toBeVisible();
    await expect(dialog.getByText(/JRC|Aqueduct|GFPLAIN/)).toHaveCount(0);
    // Flood ameaça is fluvial only — the Guaíba is its own entry.
    await expect(dialog.getByText(/Fluvial only/i)).toBeVisible();
    await expect(page.getByTestId('provenance-entry-flood2024')).toBeVisible();
    // The org's map draws plain bairro outlines: no "OEF estimate" shading here.
    await expect(page.getByTestId('provenance-entry-bairros')).toBeVisible();
    await expect(page.getByTestId('provenance-entry-neighborhoods')).toHaveCount(0);
  });
});
