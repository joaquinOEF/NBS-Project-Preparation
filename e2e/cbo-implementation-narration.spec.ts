import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// W2, four of seven transcripts. In Ksa Rosa's session the "vou persistir" line
// appears FIVE times between questions — not an error state, the normal path:
//
//   Vou persistir as respostas do Batch A e continuar com o Batch B.
//   Agora vou chamar as ferramentas corretas para finalizar:
//
// Ana logged it as internal assessment text appearing mid-flow. It is not a
// missing translation — the app ships pt-BR only. It is the model narrating its
// own implementation, and the skill has asked it not to for months.
test.describe('CBO — implementation narration never reaches the org', () => {
  const boot = async (page: any) => {
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 30_000 });
    return { cboId: (await marker.getAttribute('data-cbo-id'))!, marker };
  };

  test('machinery lines are dropped; the real message still arrives', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cboId, marker } = await boot(page);

    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Vou persistir as respostas do Batch A e continuar com o Batch B.' },
      { op: 'say', text: 'Agora vou chamar as ferramentas corretas para finalizar:' },
      { op: 'say', text: 'Que trabalho lindo o de vocês! Me conta: qual é a missão?' },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('oi');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    const body = await page.locator('body').innerText();
    expect(body, 'the org never sees "persistir"').not.toContain('persistir');
    expect(body, 'nor Batch A').not.toContain('Batch A');
    expect(body, 'nor our tool-calling').not.toContain('chamar as ferramentas');
    expect(body, 'and the real message still arrives').toContain('qual é a missão');
  });

  test('a friendly progress line is NOT dropped', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const { cboId, marker } = await boot(page);

    // COOP20 got this one. It tells the org their answers are being saved —
    // which they should hear — and contains none of our vocabulary.
    await api.scriptCbo(cboId, [[
      { op: 'say', text: 'Entendi! Vou atualizar tudo isso no perfil de vocês.' },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('oi');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    await expect(page.getByText('Vou atualizar tudo isso no perfil', { exact: false }))
      .toBeVisible({ timeout: 10_000 });
  });
});
