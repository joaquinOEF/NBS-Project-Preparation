import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Intake opening redesign (field report 2026-07): the docs/site offer is no
// longer a prose line in the greeting — it's a Step-0.5 choice whose upload
// option renders as a prominent attach banner (action: 'upload') and opens
// the file picker directly. This spec proves the banner renders, opens the
// chooser, and a picked file flows through the existing upload path into a
// user message + the next agent turn.

test('the upload-action option renders as a banner and drives a real upload', async ({ page, request }) => {
  const api = new TestApi(request);
  test.skip(!(await api.ping()).fakeModel, 'CBO_FAKE_MODEL not enabled on target.');

  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
  const cboId = (await marker.getAttribute('data-cbo-id'))!;

  await api.scriptCbo(cboId, [
    // Turn 1 — the Step-0.5 choice: a normal chip + the upload banner.
    [
      { op: 'say', text: 'Prazer, Marina! Agora vou fazer umas perguntas sobre a organização.' },
      {
        op: 'ask_user',
        question: 'Como você prefere?',
        options: [
          { label: 'Responder às perguntas', description: 'A gente conversa rapidinho' },
          { label: 'Enviar site ou documentos', description: 'Toca pra anexar proposta, relatório…', action: 'upload' },
        ],
      },
    ],
    // Turn 2 — the agent's reaction to the uploaded document.
    [
      { op: 'say', text: 'Li o documento, obrigado!' },
      { op: 'ask_user', question: 'Seguimos?', options: [{ label: 'Sim' }, { label: 'Quero ajustar' }] },
    ],
  ]);

  const input = page.getByTestId('cbo-chat-input');
  await input.fill('sou a Marina, coordenadora');
  await input.press('Enter');
  await expect(marker).toHaveAttribute('data-streaming', 'false');

  // The banner renders distinctly (its own testid, not a lettered chip)…
  const banner = page.getByTestId('cbo-option-upload');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Enviar site ou documentos');
  // …and the normal chip is still a normal chip.
  await expect(page.getByTestId('cbo-option-0')).toContainText('Responder às perguntas');

  // Clicking the banner opens the file picker (NOT sending a chip answer).
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    banner.click(),
  ]);
  await chooser.setFiles({
    name: 'proposta.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Nossa horta comunitária na Rua Cascata reduziu alagamentos.'),
  });

  // The upload flows through the existing path: a file bubble appears and the
  // scripted next turn answers it.
  await expect(page.getByText('proposta.txt')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Li o documento, obrigado!')).toBeVisible({ timeout: 20_000 });
});
