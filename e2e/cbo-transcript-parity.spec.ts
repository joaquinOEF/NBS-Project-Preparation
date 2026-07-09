import { test, expect, type Page } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// The bug this guards: `ask_user` was the one composer the client never appended
// to `messages`. It lived only in `activeQuestions`, so answering it (which calls
// setActiveQuestions([])) deleted the only copy on screen. The server persisted it
// all along, so a reload brought it back — the live transcript and the reloaded
// transcript disagreed.
//
// Asserting "the question is still visible" would not have caught that: it WAS
// visible, after a reload. The invariant worth pinning is the equality.

/** Visible transcript text, normalized so whitespace churn doesn't flake it. */
async function transcript(page: Page): Promise<string> {
  const thread = page.getByTestId('cbo-chat-thread');
  return (await thread.innerText()).replace(/\s+/g, ' ').trim();
}

test.describe('CBO transcript parity', () => {
  test('a batched chip turn renders identically live and after reload', async ({
    page,
    request,
  }) => {
    const api = new TestApi(request);
    test.skip(
      !(await api.ping()).fakeModel,
      'CBO_FAKE_MODEL not enabled on target.'
    );

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, {
      timeout: 30_000,
    });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [
      [
        { op: 'say', text: 'Duas perguntas rápidas.' },
        {
          op: 'ask_user',
          question: 'Que tipo de organização vocês são?',
          options: [{ label: 'Associação' }, { label: 'Coletivo' }],
        },
        {
          op: 'ask_user',
          question: 'Quantas pessoas fazem parte?',
          options: [{ label: '1–5' }, { label: '6–20' }],
        },
      ],
      [{ op: 'say', text: 'Combinado.' }],
    ]);

    await page.getByTestId('cbo-chat-input').fill('Olá!');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(marker).toHaveAttribute('data-turns', '1', {
      timeout: 30_000,
    });

    // Answer both: option A ("Associação"), then option B ("6–20").
    await page.getByTestId('cbo-option-0').click();
    await page.getByTestId('cbo-option-1').click();
    await expect(marker).toHaveAttribute('data-turns', '2', {
      timeout: 30_000,
    });
    await expect(marker).toHaveAttribute('data-streaming', 'false', {
      timeout: 30_000,
    });

    // Both questions survive answering, in place, each showing its own chip.
    await expect(page.getByTestId('cbo-answered-card')).toHaveCount(2);
    await expect(
      page.getByText('Que tipo de organização vocês são?')
    ).toBeVisible();
    await expect(page.getByText('Quantas pessoas fazem parte?')).toBeVisible();

    // The lossy joined answer bubble is gone.
    await expect(page.getByText('Associação; 6–20')).toHaveCount(0);

    const live = await transcript(page);

    await page.reload();
    await expect(page.getByTestId('cbo-stream-status')).toHaveAttribute(
      'data-cbo-id',
      cboId,
      { timeout: 30_000 }
    );
    await expect(page.getByTestId('cbo-answered-card')).toHaveCount(2, {
      timeout: 20_000,
    });
    const reloaded = await transcript(page);

    expect(reloaded).toBe(live);
  });

  test('a reload mid-batch restores every unanswered question, not just the last', async ({
    page,
    request,
  }) => {
    const api = new TestApi(request);
    test.skip(
      !(await api.ping()).fakeModel,
      'CBO_FAKE_MODEL not enabled on target.'
    );

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, {
      timeout: 30_000,
    });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [
      [
        { op: 'say', text: 'Três perguntas.' },
        {
          op: 'ask_user',
          question: 'Pergunta um?',
          options: [{ label: 'Um A' }, { label: 'Um B' }],
        },
        {
          op: 'ask_user',
          question: 'Pergunta dois?',
          options: [{ label: 'Dois A' }, { label: 'Dois B' }],
        },
        {
          op: 'ask_user',
          question: 'Pergunta três?',
          options: [{ label: 'Três A' }, { label: 'Três B' }],
        },
      ],
    ]);

    await page.getByTestId('cbo-chat-input').fill('Olá!');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(marker).toHaveAttribute('data-turns', '1', {
      timeout: 30_000,
    });
    await expect(page.getByText(/de\s*3|of\s*3/i)).toBeVisible();

    // Walk away mid-batch. hydrateMessages used to restore only the LAST ask_user
    // composer, silently dropping the two the user had not reached.
    await page.reload();
    await expect(page.getByTestId('cbo-stream-status')).toHaveAttribute(
      'data-cbo-id',
      cboId,
      { timeout: 30_000 }
    );
    await expect(page.getByTestId('cbo-question-card')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/de\s*3|of\s*3/i)).toBeVisible();
  });
});
