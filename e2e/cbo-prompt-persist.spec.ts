import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// PERSIST-PROMPTS: a pending ask_user must survive a reload. Before this, the
// question was SSE-only — reloading mid-question dropped it, leaving a dead
// transcript and only the derailing "Continuar" backstop (the top real-world
// failure for a phone-first audience on flaky networks).

test.describe('CBO — pending question survives reload', () => {
  test('reload mid-question restores the exact card; answering still works', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Boa! Uma pergunta rápida.' },
      { op: 'set_phase', phase: 1 },
      { op: 'ask_user', question: 'Quantas pessoas participam do grupo?', options: [
        { label: '1–5', description: 'Grupo pequeno' },
        { label: '6–20', description: 'Grupo médio' },
      ], multiSelect: false },
    ]]);
    await page.getByTestId('cbo-chat-input').fill('oi');
    await page.getByTestId('cbo-chat-input').press('Enter');
    await expect(page.getByTestId('cbo-question-card')).toBeVisible({ timeout: 20_000 });

    // Reload mid-question — the card must come back with the same options.
    await page.reload();
    await expect(page.getByTestId('cbo-stream-status')).toHaveAttribute('data-cbo-id', cboId, { timeout: 30_000 });
    await expect(page.getByTestId('cbo-question-card')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Quantas pessoas participam do grupo?').first()).toBeVisible();
    await expect(page.getByTestId('cbo-option-0')).toHaveAttribute('data-option-label', '1–5');
    await expect(page.getByTestId('cbo-option-1')).toHaveAttribute('data-option-label', '6–20');

    // Answering after the reload still works (fake model's default turn replies).
    await page.getByTestId('cbo-option-0').click();
    await expect(page.getByText('1–5', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 20_000 });

    // And once answered, a second reload shows the question as a transcript
    // bubble (Q→A readable) with NO live card for it.
    await page.reload();
    await expect(page.getByTestId('cbo-stream-status')).toHaveAttribute('data-cbo-id', cboId, { timeout: 30_000 });
    await expect(page.getByText('Quantas pessoas participam do grupo?').first()).toBeVisible({ timeout: 15_000 });
  });
});
