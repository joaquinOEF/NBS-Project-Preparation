import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// ⚠️ CBO-CONCURRENT-TURNS (JVP, 2026-08-03: "there were like two flows running…
// two agents. One had opened the map and it was going through the map but then
// it started responding again like 'Oh I will show you the examples'").
//
// Nothing stopped a second /chat starting while the first was still streaming.
// His server log showed two `Turn for <same cboId>` beginning 17s apart, and
// because pushEventRegistry holds a SINGLE pusher per session, the later turn
// silently hijacked the earlier one's event stream — one agent's map opened
// while the other's prose kept arriving into the same transcript.
//
// The window is easy to hit: the UI disables its input while streaming, but a
// persisted composer's chips re-render on load and any reload or second tab
// re-arms them. So the guard has to be server-side, which is what this asserts.

test.describe('CBO — one turn at a time per session', () => {
  test('a second turn while one is streaming is refused, not run', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // A turn slow enough to overlap — the real one that let JVP in ran 76s.
    await api.scriptCbo(cboId, [
      [{ op: 'wait', ms: 3_000 } as any, { op: 'say', text: 'Primeira resposta.' }],
      [{ op: 'say', text: 'Segunda resposta.' }],
    ]);

    // Fire both without awaiting the first — exactly the impatient re-tap.
    const first = request.post(`/api/cbo/${cboId}/chat`, {
      data: { message: 'oi', lang: 'pt' },
    });
    await new Promise(r => setTimeout(r, 600));
    const second = await request.post(`/api/cbo/${cboId}/chat`, {
      data: { message: 'oi de novo', lang: 'pt' },
    });

    // The second is refused cleanly — a JSON 409, not a half-open SSE stream.
    expect(second.status(), 'a concurrent turn must be refused').toBe(409);
    expect((await second.json()).error).toBe('turn_in_flight');

    // …and the first is unharmed.
    const firstRes = await first;
    expect(firstRes.status()).toBe(200);
    expect(await firstRes.text()).toContain('Primeira resposta');

    // The refused turn left NOTHING behind: no orphan user message, no second
    // agent reply. A double-answered question is the whole failure mode.
    const body = await (await request.get(`/api/cbo/${cboId}`)).json();
    const texts = (body.messages ?? []).map((m: any) => String(m.content ?? ''));
    expect(texts.filter((c: string) => c.includes('oi de novo'))).toHaveLength(0);
    expect(texts.filter((c: string) => c.includes('Segunda resposta'))).toHaveLength(0);
  });

  test('the lock releases — the next turn runs normally', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [
      [{ op: 'say', text: 'Um.' }],
      [{ op: 'say', text: 'Dois.' }],
    ]);

    // A lock that never released would be far worse than the bug it fixes:
    // the session would be permanently unable to answer.
    const a = await request.post(`/api/cbo/${cboId}/chat`, { data: { message: 'a', lang: 'pt' } });
    expect(a.status()).toBe(200);
    const b = await request.post(`/api/cbo/${cboId}/chat`, { data: { message: 'b', lang: 'pt' } });
    expect(b.status(), 'the lock must release after a turn completes').toBe(200);
    expect(await b.text()).toContain('Dois');
  });
});
