import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// SSE trust hardening (field report 2026-07-07): restarting while a turn was
// streaming left a zombie stream whose 60s watchdog later detonated a
// spurious "A conexão caiu" bubble INTO THE NEW SESSION. Restart now aborts
// the in-flight stream as deliberate, and the error path also ignores aborts
// whose session is no longer current.

test.describe('CBO — restart mid-stream leaves no zombie error', () => {
  test.use({ locale: 'pt-BR' });

  test('restarting during a slow turn: new session stays clean', async ({ page, request }) => {
    test.setTimeout(90_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const oldCboId = (await marker.getAttribute('data-cbo-id'))!;

    // A turn that will still be "thinking" when we restart.
    await api.scriptCbo(oldCboId, [[
      { op: 'wait', ms: 12_000 } as any,
      { op: 'say', text: 'Nunca deve aparecer.' },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Oi');
    await input.press('Enter');
    await page.waitForTimeout(1500); // the stream is now open and silent

    // Restart while it streams.
    await page.getByTestId('cbo-restart-trigger').click();
    await page.getByTestId('cbo-restart-confirm').click();

    // New session created…
    await expect
      .poll(async () => marker.getAttribute('data-cbo-id'), { timeout: 20_000 })
      .not.toBe(oldCboId);

    // …and across the window where the zombie's turn (and its old watchdog)
    // would have fired, no drop card and none of the old turn's text appears.
    await page.waitForTimeout(13_000);
    await expect(page.getByText('A conexão caiu', { exact: false })).toHaveCount(0);
    await expect(page.getByTestId('cbo-stream-retry')).toHaveCount(0);
    await expect(page.getByText('Nunca deve aparecer', { exact: false })).toHaveCount(0);
  });
});
