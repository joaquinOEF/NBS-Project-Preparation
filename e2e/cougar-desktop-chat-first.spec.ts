import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Desktop chat-first (Perfect Demo decision, 2026-07-14): on md+ the right
// panel (Documento/Mapa/…) starts COLLAPSED so the conversation is the whole
// screen — the mobile pattern applied to desktop. A slim edge strip re-opens
// it; the agent's microapps (open_map, …) auto-open it; a collapse control
// closes it again.

test.describe('COUGAR — desktop is chat-first (right panel collapsed)', () => {
  test.use({ locale: 'pt-BR', viewport: { width: 1280, height: 800 } });

  test('collapsed by default; strip opens; collapse closes; open_map auto-opens', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled on the target — skipping deterministic spec.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Default: chat full-width, panel closed, edge strip present.
    await expect(page.getByTestId('cbo-panel-strip')).toBeVisible();
    await expect(page.getByTestId('cbo-tab-document')).not.toBeVisible();
    await expect(page.getByTestId('cbo-chat-input')).toBeVisible();

    // The strip opens the panel on the chosen tab; the strip goes away.
    await page.getByTestId('cbo-strip-document').click();
    await expect(page.getByTestId('cbo-tab-document')).toBeVisible();
    await expect(page.getByTestId('cbo-panel-strip')).not.toBeVisible();
    // Chat stays visible next to it (split view, not a swap).
    await expect(page.getByTestId('cbo-chat-input')).toBeVisible();

    // The collapse control closes it again.
    await page.getByTestId('cbo-panel-collapse').click();
    await expect(page.getByTestId('cbo-panel-strip')).toBeVisible();
    await expect(page.getByTestId('cbo-tab-document')).not.toBeVisible();

    // An agent microapp auto-opens the panel (the user must never have to
    // find the map themselves).
    await api.scriptCbo(cboId, [
      [
        { op: 'say', text: 'Vamos olhar o mapa.' },
        { op: 'open_map' },
      ],
    ]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('bora');
    await input.press('Enter');
    await expect(page.getByTestId('cbo-tab-map')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('cbo-panel-strip')).not.toBeVisible();
  });
});
