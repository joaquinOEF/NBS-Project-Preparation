import { test, expect } from '@playwright/test';

// "Seus dados" notice (biweekly 2026-07-16): the standing plain-language
// answer to the cohort's extraction fear — always reachable from the chat
// header, before anyone has to ask.

test.describe('COUGAR — data notice', () => {
  test.use({ locale: 'pt-BR' });

  test('the shield button opens the plain-language data answer', async ({ page }) => {
    await page.goto('/cbo-profile');
    await expect(page.getByTestId('cbo-stream-status')).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });

    await page.getByTestId('button-data-notice').click();
    const dialog = page.getByTestId('cbo-data-notice-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Seus dados são seus')).toBeVisible();
    await expect(dialog.getByText('não termina em dezembro', { exact: false })).toBeVisible();
    await expect(dialog.getByText('corrigir ou apagar', { exact: false })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
