import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// ⚠️ CBO-TURN-TAIL-FREEZE (JVP, 2026-08-04: "the same thing happened as before
// … i get stuck here", on the família recommendation question).
//
// His server log is the whole bug in three lines:
//
//   [cbo] timing … rounds=3 first_event=8630ms total=14822ms
//                  detail=show_nbs_familias | text | ask_user
//   POST /api/cbo/04bc7f17…/chat 409 in 12ms   ← his answer
//   POST /api/cbo/04bc7f17…/chat 200 in 14856ms ← the turn that asked
//
// The turn emits `ask_user` and the client immediately sets isStreaming=false —
// by design, the question is answerable the moment it renders. But the turn
// itself keeps running (more rounds, persistence) and keeps holding the
// per-session turn lock added in #442. So the user answers a question the agent
// has already asked, and the lock refuses it.
//
// Then the client made it terminal: the 409 branch returned early, skipping the
// `setIsStreaming(false)` at the bottom of sendMessage. `setActiveQuestions([])`
// had already removed the question. Net result — the answered chip on screen,
// the input disabled forever, and no way out but a reload. A dead session.
//
// The fix is that answering the question you were just asked is NORMAL, so the
// second turn waits for the lock and then runs, rather than being rejected.
// These specs pin the user-visible property: the answer lands, and the UI is
// never left frozen.

test.describe('CBO — answering while the asking turn is still winding down', () => {
  test('the answer is accepted, not refused', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Turn 1 asks, then keeps working — exactly the shape of his log, where
    // `ask_user` landed and ~6s of turn remained. 1.5s is enough: the property
    // is "an answer arriving while the lock is held is served", and the suite
    // pays for every second a spec sleeps (4 workers, one box).
    await api.scriptCbo(cboId, [
      [
        { op: 'ask_user', question: 'Como vocês querem continuar?', options: [
          { label: 'Ver exemplos reais', description: 'Mostro casos de SbN' },
          { label: 'Já conheço SbN — pular', description: 'Vamos direto pro mapa' },
        ] } as any,
        { op: 'wait', ms: 1_500 } as any,
      ],
      [{ op: 'say', text: 'Beleza, aqui vão os exemplos.' } as any],
    ]);

    const chat = page.getByTestId('cbo-chat-input');
    await chat.fill('oi');
    await chat.press('Enter');

    // The question renders while turn 1 is still running — that is the design,
    // and it is what opens the window.
    const option = page.getByText('Ver exemplos reais').first();
    await expect(option).toBeVisible({ timeout: 30_000 });
    await option.click();

    // The answer must be answered. Before the fix this never arrived: the POST
    // came back 409 and the turn was silently dropped on the floor.
    await expect(page.getByText(/aqui vão os exemplos/i)).toBeVisible({ timeout: 60_000 });
  });

  test('the session is never left frozen, even if the lock never frees', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // A turn that outlasts the queue wait (CBO_TURN_QUEUE_WAIT_MS is 3s under
    // test, 20s in prod), so the second turn really does get a 409. Waiting is
    // the fix for the common case; this pins the fallback — and the fallback is
    // the part that actually killed his session.
    await api.scriptCbo(cboId, [[
      { op: 'ask_user', question: 'Continuar?', options: [
        { label: 'Sim', description: 'segue' },
        { label: 'Não', description: 'para' },
      ] } as any,
      { op: 'wait', ms: 6_000 } as any,
    ]]);

    const chat = page.getByTestId('cbo-chat-input');
    await chat.fill('oi');
    await chat.press('Enter');

    await expect(page.getByText('Sim').first()).toBeVisible({ timeout: 30_000 });
    await page.getByText('Sim').first().click();

    // Whatever happens to the turn, the UI must come back to the user. A
    // permanently-true isStreaming is the freeze: input disabled, no question,
    // no retry, reload the only escape.
    await expect(
      page.getByTestId('cbo-stream-status'),
      'a refused turn must not leave the session streaming forever',
    ).toHaveAttribute('data-streaming', 'false', { timeout: 30_000 });

    // …and there is a way forward that is not a reload.
    await expect(page.getByTestId('cbo-stream-retry')).toBeVisible({ timeout: 10_000 });
  });
});
