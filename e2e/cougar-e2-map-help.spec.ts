import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// E2 "Como ler este mapa" — the per-hazard legend explainer on the risk tour.
//
// The three POA hazard ramps disagree about which end is dangerous:
//   poa_flood_hazard      dark purple (low) → GREEN (high)
//   poa_heat_hazard       green (low)       → orange (high)
//   poa_landslide_hazard  green (low)       → pale green (high)
//
// HazardLegendSheet derives its swatches and its warning from each layer's own
// LegendSpec, so this spec is really asserting that the derivation still reads
// the shipped layer-legends.json correctly: flood must warn "inverted", heat
// must warn nothing, landslide must warn "lowContrast". If the tiles are ever
// re-baked onto a shared ramp, these assertions fail loudly — that is the
// signal to delete the warning copy, not to relax the test.

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

test.describe('COUGAR — E2 hazard legend explainer', () => {
  test('the sheet reads each hazard ramp, and the tour survives a tab detour', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [
      [{ op: 'say', text: 'Vamos ver os riscos.' }, OPEN_TOUR],
      // Turn 2 is what the "Tenho outra dúvida" tap consumes.
      [
        { op: 'say', text: 'Nesse mapa o roxo escuro é o menor risco e o verde é o maior.' },
        { op: 'ask_user', question: 'Voltamos pro mapa?', options: [{ label: 'Voltar pro mapa' }], showMap: true },
      ],
    ]);

    await page.getByTestId('cbo-chat-input').fill('Mostra o mapa');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.locator('.leaflet-container').first()).toBeVisible({ timeout: 30_000 });

    const howTo = page.getByTestId('map-tour-howto');
    const sheet = page.getByTestId('map-help-sheet');
    const next = page.getByTestId('map-tour-next');

    // ---- Hazard 1: enchente. Green is the DANGEROUS end here. ----
    await expect(howTo).toBeVisible();
    await howTo.click();
    await expect(sheet).toBeVisible();
    // Five bands, one per riskBands.* label — sampled from the layer's stops.
    await expect(page.getByTestId('map-help-bands').locator('> div')).toHaveCount(5);
    await expect(page.getByTestId('map-help-warn-inverted')).toBeVisible();
    await expect(page.getByTestId('map-help-warn-lowContrast')).toHaveCount(0);

    // Both buttons are pinned inside the sheet, not below the fold — they were,
    // until the sheet grew a sticky footer. Playwright auto-scrolls into view
    // before clicking, so only an explicit in-viewport check catches this.
    for (const id of ['map-help-understood', 'map-help-ask']) {
      const box = await page.getByTestId(id).boundingBox();
      const vh = page.viewportSize()!.height;
      expect(box, `${id} has no box`).not.toBeNull();
      expect(box!.y + box!.height, `${id} is below the fold`).toBeLessThanOrEqual(vh);
    }
    // The sheet + scrim cover the action bar, so a tap where "Próximo risco"
    // sits cannot advance the tour behind the open sheet. The button is still
    // *in* the viewport, just occluded — so probe the hit target rather than
    // the geometry, and don't actually click (that would hit the sheet footer).
    const cta = (await page.getByTestId('map-tour-next').boundingBox())!;
    const hitTarget = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid') ?? null,
      { x: cta.x + cta.width / 2, y: cta.y + cta.height / 2 }
    );
    expect(hitTarget).not.toBe('map-tour-next');

    // "Entendi" closes the sheet and changes nothing else — the map is still
    // on hazard 1, and no chat turn was spent.
    await page.getByTestId('map-help-understood').click();
    await expect(sheet).toHaveCount(0);
    await expect(next).toBeVisible();

    // ---- Hazard 2: calor. Conventional ramp, so no warning at all. ----
    await next.click();
    await howTo.click();
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('map-help-warn-inverted')).toHaveCount(0);
    await expect(page.getByTestId('map-help-warn-lowContrast')).toHaveCount(0);
    await page.getByTestId('map-help-understood').click();

    // ---- Hazard 3: deslizamento. Both ends green → low-contrast warning. ----
    await next.click();
    await howTo.click();
    await expect(page.getByTestId('map-help-warn-lowContrast')).toBeVisible();
    await expect(page.getByTestId('map-help-warn-inverted')).toHaveCount(0);
    await page.getByTestId('map-help-understood').click();

    // ---- The tour position survives leaving the map tab. ----
    // rightTab='document' unmounts MapMicroapp. Before tourIdx was lifted into
    // cbo-profile, coming back restarted the tour at Enchente 1/3.
    await expect(page.getByText('3/3')).toBeVisible();
    await page.getByTestId('cbo-tab-document').click();
    await expect(page.getByTestId('map-tour-next')).toHaveCount(0);
    await page.getByTestId('cbo-tab-map').click();
    await expect(page.getByTestId('map-tour-next')).toBeVisible();
    // Still on hazard 3 of 3 — the counter, not the CTA label, because the
    // e2e session runs in English and a pt-only string would pass vacuously.
    await expect(page.getByText('3/3')).toBeVisible();
    await howTo.click();
    await expect(page.getByTestId('map-help-warn-lowContrast')).toBeVisible();

    // ---- Escalation posts a map_help turn and keeps the map mounted. ----
    await page.getByTestId('map-help-ask').click();
    await expect(sheet).toHaveCount(0);
    // The user's bubble is the natural question, not the [MAP HELP] payload the
    // agent receives. (The e2e session runs in English; the cohort runs in pt.)
    await expect(
      page.getByText(/question about the landslide map|dúvida sobre o mapa de deslizamento/i)
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/\[MAP HELP\]/)).toHaveCount(0);
    await expect(page.getByText(/roxo escuro é o menor risco/i)).toBeVisible({ timeout: 30_000 });
    // rightTab never left 'map', so the tour is still mounted behind the chat.
    await expect(page.getByTestId('map-tour-next')).toBeVisible();

    // …and the transcript still reads as a question after a reload. The server
    // persists displayText for map_help, not the hex-dump payload the agent got.
    await page.reload();
    await expect(page.getByTestId('cbo-chat-thread')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/\[MAP HELP\]/)).toHaveCount(0);
    await expect(page.getByTestId('cbo-chat-thread')).not.toContainText('#3c2c6c');
    await expect(
      page.getByText(/question about the landslide map|dúvida sobre o mapa de deslizamento/i)
    ).toBeVisible();
  });
});
