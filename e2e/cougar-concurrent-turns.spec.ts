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
//
// The guard SERIALIZES rather than rejects — see CBO-TURN-QUEUE. Rejecting is
// what froze JVP's session a day later (cougar-answer-during-turn-tail.spec.ts):
// the most normal action in the app, answering the question the in-flight turn
// just asked, was refused. Queueing fixes the hijack just as completely — two
// turns still never run at once — without discarding the user's message.

test.describe('CBO — one turn at a time per session', () => {
  test('a second turn waits for the first instead of running alongside it', async ({ page, request }) => {
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
    const startedSecond = Date.now();
    const second = await request.post(`/api/cbo/${cboId}/chat`, {
      data: { message: 'oi de novo', lang: 'pt' },
    });
    const secondTook = Date.now() - startedSecond;

    const firstRes = await first;
    expect(firstRes.status()).toBe(200);
    expect(await firstRes.text()).toContain('Primeira resposta');

    // Both turns run — the second is queued, not discarded…
    expect(second.status()).toBe(200);
    expect(await second.text()).toContain('Segunda resposta');

    // …and it ran AFTER, not alongside. Turn 1 had ~2.4s left when turn 2 was
    // posted; a turn 2 that returns faster than that is executing concurrently,
    // which is the bug (one pushEvent registry per session, so the later turn
    // hijacks the earlier one's stream).
    expect(secondTook, 'the second turn must wait for the first').toBeGreaterThan(2_000);

    // The transcript reads in the order it happened. This is why the lock is
    // taken BEFORE the user row is appended: a queued turn that wrote its user
    // message on arrival would slot it ahead of the reply to the message before
    // it, and the model reads this log back as the conversation.
    const msgs = await (await request.get(`/api/cbo/${cboId}/messages`)).json();
    const at = (needle: string) =>
      msgs.findIndex((m: any) => String(m.content ?? '').includes(needle));
    expect(at('oi de novo'), 'the queued answer must be in the transcript').toBeGreaterThan(-1);
    expect(at('Primeira resposta')).toBeLessThan(at('oi de novo'));
    expect(at('oi de novo')).toBeLessThan(at('Segunda resposta'));
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
