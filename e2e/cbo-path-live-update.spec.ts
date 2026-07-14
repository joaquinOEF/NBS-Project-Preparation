import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Perfect Demo (2026-07-14): after the E1 closing set_path, the panel's Path
// section kept saying "Caminho ainda não escolhido" until a full page refresh
// — the value lands on cohort_members.path, which the client only refetches
// on load. set_path now emits a path_set event so the panel flips live.

test.describe('COUGAR — the Path section updates live on set_path', () => {
  test.use({ locale: 'pt-BR', viewport: { width: 1280, height: 800 } });

  test('the panel flips from "not chosen" to the chosen path without a reload', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled on the target — skipping deterministic spec.');

    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);
    const cboId = (await marker.getAttribute('data-cbo-id'))!;

    // Chat-first desktop: open the document panel to watch the Path section.
    await page.getByTestId('cbo-strip-document').click();
    await expect(page.getByText('Caminho ainda não escolhido')).toBeVisible({ timeout: 10_000 });

    await api.scriptCbo(cboId, [
      [
        { op: 'say', text: 'Fechando o diagnóstico.' },
        { op: 'set_path', path: 'has-project' },
      ],
    ]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('já temos um projeto definido');
    await input.press('Enter');
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    // No reload — the chip appears and the placeholder goes away.
    await expect(page.getByText('Já tem um projeto NBS definido')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Caminho ainda não escolhido')).toHaveCount(0);
  });
});
