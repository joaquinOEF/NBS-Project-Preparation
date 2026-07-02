import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// When the chat stream drops (patchy mobile data), the user must get a human,
// localized message + a self-service "Try again" — not a frozen "Processando…"
// or a raw "Error: Failed to fetch". Simulated by aborting the /chat request.

test.describe('CBO chat stream drop → retry', () => {
  test('a dropped stream shows the retry chip; tapping it completes the turn', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Script the NEXT fake-model turn (it will only be consumed by the retry,
    // since the first attempt is aborted at the network layer).
    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Retomando daqui — anotado!' },
      { op: 'ask_user', question: 'Seguimos?', options: [{ label: 'Sim' }] },
    ]]);

    // Kill the first /chat request mid-flight.
    let aborted = 0;
    await page.route('**/api/cbo/*/chat', route => { aborted += 1; return route.abort('connectionreset'); });
    await page.getByTestId('cbo-chat-input').fill('oi, tudo bem?');
    await page.getByTestId('cbo-chat-input').press('Enter');

    // Human message + retry chip, no raw "Error:" text, input re-enabled.
    await expect(page.getByText(/conexão caiu|connection dropped/i)).toBeVisible({ timeout: 15_000 });
    const retry = page.getByTestId('cbo-stream-retry');
    await expect(retry).toBeVisible();
    await expect(page.getByText(/^Error:/)).toHaveCount(0);
    expect(aborted).toBeGreaterThan(0);

    // Restore the network and retry → the scripted turn completes normally,
    // with NO duplicate user bubble (retry resends hidden).
    await page.unroute('**/api/cbo/*/chat');
    await retry.click();
    await expect(page.getByText('Retomando daqui', { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('cbo-stream-retry')).toHaveCount(0);
    await expect(page.getByText('oi, tudo bem?', { exact: true })).toHaveCount(1);
  });
});
