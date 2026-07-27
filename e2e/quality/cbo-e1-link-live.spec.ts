import { test, expect } from '@playwright/test';

// LIVE quality check — NON-GATING. Guards the 2026-07-16 field failure: on a
// pasted link the model (a) showed nothing for 65s (WebFetch runs before any
// visible event), and (b) ended the turn via the SDK's built-in
// AskUserQuestion — which renders nothing headless — leaving the user prose
// with no chips. Fixes under test: the immediate server-side "Lendo …" label
// and disallowedTools (Task/AskUserQuestion/… removed from the model's
// context, so the ask lands as mcp ask_user chips).
//
// Run on-demand against a real-model server (see cbo-e2-linear-live.spec.ts):
//   RUN_LIVE_QUALITY=1 E2E_BASE_URL=http://localhost:5100 npx playwright test e2e/quality/cbo-e1-link-live.spec.ts --project=chromium

const RUN = process.env.RUN_LIVE_QUALITY === '1';

test.describe('E1 link paste — live model @live', () => {
  test.use({ locale: 'pt-BR' });
  test.skip(!RUN, 'Set RUN_LIVE_QUALITY=1 and point E2E_BASE_URL at a real (non-fake-model) server to run.');

  test('immediate progress label; turn ends with real chips, never bare prose', async ({ page }) => {
    test.setTimeout(240_000); // one real link-paste turn ran 109s in the field
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });

    const input = page.getByTestId('cbo-chat-input');
    await input.fill('https://vilaflores.org/sobre/');
    await input.press('Enter');

    // The server-side label must appear BEFORE any model round could land —
    // it's pushed at routing time, so a few seconds is generous.
    await expect(page.getByText(/Lendo vilaflores\.org/i).first()).toBeVisible({ timeout: 6_000 });

    // REAL model turn: extraction + bulk-confirm. The confirm must arrive as
    // an ask_user (chips) — with the AskUserQuestion leak it arrived as prose.
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 180_000 });
    expect(await page.locator('[data-testid^="cbo-option-"]').count()).toBeGreaterThan(0);
  });
});
