import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Live test 2026-07-13: the model asked the proud-moment question, ran tools,
// then re-emitted the same question slightly extended in its final round —
// the client concatenates consecutive assistant blocks, so the user read the
// question twice in one bubble. The stream layer now drops a chat block that
// is a repeat or prefix-extension of one already emitted THIS turn (≥40 chars
// normalized). A later TURN may still legitimately re-ask.

const QUESTION = 'Algum momento que vocês se sentiram orgulhosos com esse trabalho? Pode ser uma história rápida.';

test('a near-duplicate chat block in the same turn is dropped', async ({ page, request }) => {
  const api = new TestApi(request);
  test.skip(!(await api.ping()).fakeModel, 'CBO_FAKE_MODEL not enabled on target.');

  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
  const cboId = (await marker.getAttribute('data-cbo-id'))!;

  await api.scriptCbo(cboId, [
    [
      { op: 'say', text: 'Anotado.' },
      { op: 'say', text: QUESTION },
      { op: 'say', text: `${QUESTION.slice(0, -1)} — dessa arborização ou de outro projeto.` },
    ],
    // A later turn may re-ask the same thing — per-turn scope, not per-session.
    [
      { op: 'say', text: QUESTION },
    ],
  ]);

  const input = page.getByTestId('cbo-chat-input');
  await input.fill('plantamos 200 árvores');
  await input.press('Enter');
  await expect(marker).toHaveAttribute('data-turns', '1');

  const countQuestion = async () => {
    const msgs = await (await page.request.get(`/api/cbo/${cboId}/messages`)).json();
    return msgs.filter((m: any) => m.role === 'assistant' && m.messageType === 'content' && m.content.includes('orgulhosos')).length;
  };
  expect(await countQuestion(), 'the extended re-emission must be dropped').toBe(1);
  // The short ack ("Anotado.") is under the 40-char floor and untouched.
  await expect(page.getByText('Anotado.')).toBeVisible();

  // Next turn: asking the same question again is allowed.
  await input.fill('foi ótimo');
  await input.press('Enter');
  await expect(marker).toHaveAttribute('data-turns', '2');
  expect(await countQuestion(), 'a later turn may legitimately repeat').toBe(2);
});
