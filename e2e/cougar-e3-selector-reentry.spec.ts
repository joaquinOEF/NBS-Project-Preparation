import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// The NBS-type selector had the map's re-entry bug, without the map's safety net.
//
// `onCancel` nulled `interventionSelectorParams`, and unlike the map there is no
// `defaultParams` to fall through to (the registry returns null). So Cancelar
// left the chat still nudging "Escolher o tipo de SbN" while the tab it opens
// showed the "will open here" placeholder — and on a phone the Intervenções tab
// disappeared from the bottom nav entirely, because it was gated on the same
// ephemeral params. A reload was the only way back.

const OPEN_SELECTOR = {
  op: 'open_intervention_selector' as const,
  params: { multiSelect: true, maxRecommendations: 2 },
};

test.describe('COUGAR — E3 NBS-type selector re-entry', () => {
  test('Cancelar keeps the selector re-enterable via the nudge chip', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Phase 3 is the selector's minPhase — below it, pendingTool refuses to fire.
    await api.scriptCbo(cboId, [[
      { op: 'set_phase', phase: 3 },
      { op: 'say', text: 'Escolhe o tipo de SbN.' },
      OPEN_SELECTOR,
    ]]);
    await page.getByTestId('cbo-chat-input').fill('tipos');
    await page.getByTestId('cbo-chat-input').press('Enter');

    const cancel = page.getByTestId('intervention-cancel');
    await expect(cancel).toBeVisible({ timeout: 30_000 });

    // Leave via the selector's own Cancelar.
    await cancel.click();

    // The chat still says the step is pending…
    const chip = page.getByTestId('cbo-open-tool-interventions');
    await expect(chip).toBeVisible({ timeout: 10_000 });

    // …and tapping it must land on the SELECTOR, not the "not yet" placeholder.
    await chip.click();
    await expect(page.getByTestId('intervention-cancel')).toBeVisible();
    await expect(page.getByText(/will open here|abre aqui/i)).toHaveCount(0);
  });

  test('the mobile Intervenções tab survives Cancelar', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'set_phase', phase: 3 },
      { op: 'say', text: 'Escolhe o tipo de SbN.' },
      OPEN_SELECTOR,
    ]]);
    await page.getByTestId('cbo-chat-input').fill('tipos');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.getByTestId('intervention-cancel')).toBeVisible({ timeout: 30_000 });

    const tab = page.getByRole('button', { name: /Intervenções|Interventions/i });
    await expect(tab).toBeVisible();

    await page.getByTestId('intervention-cancel').click();

    // The tab is the phone's only route back into the panel. It used to vanish.
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(page.getByTestId('intervention-cancel')).toBeVisible();
  });
});
