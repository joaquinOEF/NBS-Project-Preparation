import { test, expect } from '@playwright/test';

// An invalid/expired invite token must show a clear, human error — not the
// bare infinite spinner (the field case: a WhatsApp link mangled by copy/paste
// or an org whose invite was reissued).

test.describe('CBO invite-link failure states', () => {
  test('a bogus ?t= token shows the "invite not found" card, not a spinner', async ({ page }) => {
    await page.goto('/cbo-profile?t=BOGUS-TOKEN-THAT-DOES-NOT-EXIST');
    const card = page.getByTestId('cbo-invite-error');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText(/não foi encontrado|was not found/i)).toBeVisible();
    // No retry button for a permanently-bad token (retry won't help).
    await expect(page.getByTestId('cbo-invite-retry')).toHaveCount(0);
  });
});
