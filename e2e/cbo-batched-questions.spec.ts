import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Validates the mechanic the batched-capture redesign depends on: when a turn
// emits SEVERAL ask_user questions (a batch), the UI shows them as a tap-through
// ("Pergunta 1 de 4"), and answering all of them sends ONE message → ONE model
// turn. That's the whole point — N questions, 1 round-trip, no waiting between
// taps. (The agent skill decides WHAT to batch; this proves the plumbing.)

test('a batch of questions is one tap-through and one turn, not N turns', async ({ page, request }) => {
  const api = new TestApi(request);
  test.skip(!(await api.ping()).fakeModel, 'CBO_FAKE_MODEL not enabled on target.');

  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
  const cboId = (await marker.getAttribute('data-cbo-id'))!;

  // Script ONE turn that asks four questions at once (a batch = four ask_user
  // ops in a single turn → four ask_user events → the multi-question UI).
  await api.scriptCbo(cboId, [
    [
      { op: 'say', text: 'Umas perguntas rápidas:' },
      { op: 'ask_user', question: 'O que vocês fazem?', options: [{ label: 'Hortas e segurança alimentar' }, { label: 'Arborização' }] },
      { op: 'ask_user', question: 'Que tipo de organização?', options: [{ label: 'ONG / Associação' }, { label: 'Empresa' }] },
      { op: 'ask_user', question: 'Há quanto tempo existem?', options: [{ label: '5 a 10 anos' }, { label: 'Mais de 10 anos' }] },
      { op: 'ask_user', question: 'Quantas pessoas na equipe?', options: [{ label: '6–15' }, { label: '16+' }] },
    ],
  ]);

  // Open the turn.
  const input = page.getByTestId('cbo-chat-input');
  await input.fill('oi');
  await input.press('Enter');
  await expect(marker).toHaveAttribute('data-turns', '1');

  // The batch rendered as a multi-question card.
  await expect(page.getByTestId('cbo-question-card')).toBeVisible();
  await expect(page.getByText(/de\s*4|of\s*4/i)).toBeVisible(); // "Pergunta 1 de 4"

  // Tap the first option of each of the four questions; the card auto-advances.
  for (let i = 0; i < 4; i++) {
    await page.getByTestId('cbo-option-0').click();
  }

  // The crux: four questions answered = exactly ONE more turn (one combined
  // send), NOT four. data-turns goes 1 → 2, not 1 → 5.
  await expect(marker).toHaveAttribute('data-turns', '2');
  // And the single user message carries all four answers.
  await expect(page.getByText(/Hortas e segurança alimentar.*ONG \/ Associação.*5 a 10 anos.*6–15/s)).toBeVisible();
});
