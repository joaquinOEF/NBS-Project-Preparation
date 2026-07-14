import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Perfect Demo (2026-07-14): the model put a ⭐ "recomendado" badge on "Sim"
// for the NBS-experience question — E1 asks facts about the org, and a
// recommended answer reads as pressure to self-inflate ("por que dice
// recomendado?"). The server strips the flag on every phase-1 ask_user; the
// fake model mirrors it.

test.describe('COUGAR — E1 chips never carry a "recommended" badge', () => {
  test.use({ locale: 'pt-BR' });

  test('a phase-1 ask_user with recommended:true renders without the badge', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled on the target — skipping deterministic spec.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    await api.scriptCbo(cboId, [
      [
        { op: 'say', text: 'Vamos lá.' },
        {
          op: 'ask_user',
          question: 'Vocês já trabalharam com soluções baseadas na natureza?',
          options: [
            { label: 'Sim', recommended: true },
            { label: 'Ainda não' },
            { label: 'Não temos certeza' },
          ],
        },
      ],
    ]);

    const input = page.getByTestId('cbo-chat-input');
    await input.fill('oi');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    await expect(page.getByText('Ainda não').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/recomendado|recommended/i)).toHaveCount(0);
  });
});
