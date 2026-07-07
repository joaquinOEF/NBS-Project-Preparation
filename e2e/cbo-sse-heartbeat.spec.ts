import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// SSE trust hardening (field report 2026-07-07): the SDK can think 10-20s
// between events; proxies idle-kill silent sockets and the client's 60s
// watchdog needs bytes to know the stream is alive. The server now emits a
// `: ping` comment every 15s. This spec opens a raw chat stream against a
// scripted 17s thinking gap and asserts (a) heartbeat bytes arrive mid-gap,
// (b) the turn still completes with its done event, (c) the UI never shows
// the connection-drop card for a healthy-but-slow turn.

test.describe('CBO — SSE heartbeat keeps slow turns alive', () => {
  test.use({ locale: 'pt-BR' });

  test('a 17s silent turn carries pings and completes without the drop card', async ({ page, request }) => {
    test.setTimeout(90_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'wait', ms: 17_000 } as any,
      { op: 'say', text: 'Demorei mas cheguei.' },
      { op: 'ask_user', question: 'Seguimos?', options: [{ label: 'Sim' }] },
    ]]);

    // Raw fetch from the page context so we can inspect the actual bytes the
    // browser receives (Playwright's request API buffers whole bodies).
    const result = await page.evaluate(async (id) => {
      const res = await fetch(`/api/cbo/${id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'oi', lang: 'pt' }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let raw = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
      }
      return {
        pings: (raw.match(/: ping/g) || []).length,
        sawDone: raw.includes('"type":"done"'),
        sawSay: raw.includes('Demorei mas cheguei'),
      };
    }, cboId);

    // 17s gap at a 15s cadence → at least one ping, plus the full turn.
    expect(result.pings).toBeGreaterThanOrEqual(1);
    expect(result.sawDone).toBe(true);
    expect(result.sawSay).toBe(true);
  });

  test('the UI rides out a slow turn — no drop card, question arrives', async ({ page, request }) => {
    test.setTimeout(90_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'wait', ms: 16_000 } as any,
      { op: 'say', text: 'Pensei bastante nessa.' },
      { op: 'ask_user', question: 'Tudo certo?', options: [{ label: 'Sim' }] },
    ]]);

    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Oi');
    await input.press('Enter');

    // The slow turn completes into a question card…
    await expect(page.getByTestId('cbo-question-card')).toBeVisible({ timeout: 40_000 });
    // …and the drop card never appeared.
    await expect(page.getByText('A conexão caiu', { exact: false })).toHaveCount(0);
    await expect(page.getByTestId('cbo-stream-retry')).toHaveCount(0);
  });
});
