import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// SSE trust hardening (field report 2026-07-07): the SDK can think 10-20s
// between events; proxies idle-kill silent sockets and the client's 60s
// watchdog needs bytes to know the stream is alive. The server emits a
// `: ping` comment on an interval. This spec asserts (a) heartbeat bytes
// arrive mid-gap, (b) the turn still completes with its done event, (c) the UI
// never shows the connection-drop card for a healthy-but-slow turn.
//
// TIMING: the interval is scaled to 400ms here (CBO_SSE_PING_MS in
// playwright.config.ts) so a "silent gap several pings long" costs ~1.2s
// instead of 17. The ratio is what matters — the gap is still many multiples
// of the cadence, which is the only thing these assertions depend on. Before
// this, the two tests spent 35s sleeping: 7% of the entire suite.

test.describe('CBO — SSE heartbeat keeps slow turns alive', () => {
  test.use({ locale: 'pt-BR' });

  test('a silent turn carries pings and completes without the drop card', async ({ page, request }) => {
    test.setTimeout(30_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'wait', ms: 1_400 } as any,
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

    // A gap 3× the cadence → at least one ping, plus the full turn.
    expect(result.pings).toBeGreaterThanOrEqual(1);
    expect(result.sawDone).toBe(true);
    expect(result.sawSay).toBe(true);
  });

  test('the UI rides out a slow turn — no drop card, question arrives', async ({ page, request }) => {
    test.setTimeout(30_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'wait', ms: 1_400 } as any,
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
