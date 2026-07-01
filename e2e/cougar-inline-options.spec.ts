import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// CBO-INLINE-OPTIONS (safe subset): when the agent writes a selectable question
// as a trailing markdown list instead of calling ask_user, the server converts
// it to a real ask_user event (buttons) before it reaches the client. Guarded by
// a select/choose cue so it never hijacks a plain bulleted prose block.
// Both paths (live SDK + fake model) share emitAssistantText, so the fake model
// exercises the exact same conversion.

test.describe('COUGAR — inline options become buttons', () => {
  test('a trailing option list with a cue renders as a question card, not inert bullets', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled on the target — skipping deterministic spec.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // The agent inlines a multi-option question as a markdown list (the bug).
    await api.scriptCbo(cboId, [
      [
        {
          op: 'say',
          text: 'Qual é o foco principal de vocês? Selecione uma:\n- Segurança alimentar\n- Resiliência climática\n- Educação ambiental',
        },
      ],
    ]);

    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Oi');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    // Converted: the preamble is the card question, the bullets are real options.
    await expect(page.getByTestId('cbo-question-card')).toBeVisible();
    await expect(page.getByTestId('cbo-option-0')).toHaveAttribute('data-option-label', 'Segurança alimentar');
    await expect(page.getByTestId('cbo-option-1')).toHaveAttribute('data-option-label', 'Resiliência climática');
    await expect(page.getByTestId('cbo-option-2')).toHaveAttribute('data-option-label', 'Educação ambiental');
  });

  test('a bulleted prose block WITHOUT a choose-cue stays chat; a real ask_user wins the card', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled on the target — skipping deterministic spec.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Bullets but no select/choose cue → must NOT convert; the real ask_user that
    // follows is the one that becomes the question card.
    await api.scriptCbo(cboId, [
      [
        { op: 'say', text: 'Beleza. Vou anotar isso:\n- primeiro ponto\n- segundo ponto' },
        { op: 'ask_user', question: 'Seguimos?', options: [{ label: 'Sim' }, { label: 'Não' }] },
      ],
    ]);

    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Oi');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    // The bulleted block rendered as chat text (not hijacked into options).
    await expect(page.getByText('primeiro ponto', { exact: false })).toBeVisible();
    // The real ask_user is the card — options are Sim/Não, not the bullets.
    await expect(page.getByTestId('cbo-option-0')).toHaveAttribute('data-option-label', 'Sim');
    await expect(page.getByTestId('cbo-option-1')).toHaveAttribute('data-option-label', 'Não');
  });
});
