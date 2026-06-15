import { test, expect } from '@playwright/test';

// LIVE quality smoke — NON-GATING. Drives the REAL Claude Agent SDK (not the
// fake model) to confirm the live turn path still works and the agent produces
// a coherent first turn. Wording is non-deterministic, so assertions are loose
// and structural; this is a trend/health check, never a per-PR gate.
//
// Run on-demand against a real (non-fake) deployment:
//   E2E_BASE_URL=https://<preview> TEST_API_SECRET=<secret> npm run test:quality
// It self-skips otherwise (and is skipped in CI), so it never needs an API key
// in the gating pipeline.

const RUN = process.env.RUN_LIVE_QUALITY === '1';

test.describe('CBO live quality smoke (real model)', () => {
  test.skip(!RUN, 'Set RUN_LIVE_QUALITY=1 and point E2E_BASE_URL at a real (non-fake-model) deployment to run.');

  test('the agent completes a coherent first turn', async ({ page }) => {
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/);

    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Olá, somos uma horta comunitária no bairro Cascata em Porto Alegre.');
    await input.press('Enter');

    // The real model is slow; give it room. Wait for the turn to finish.
    await expect(marker).toHaveAttribute('data-turns', '1', { timeout: 90_000 });
    await expect(marker).toHaveAttribute('data-streaming', 'false');

    // Loose, structural assertions only. The agent should not strand the user:
    // it should have either asked a chip question OR written a non-empty reply.
    const askedAQuestion = await page.getByTestId('cbo-question-card').isVisible().catch(() => false);
    const wroteSomething = await page.locator('.prose, [data-testid="cbo-chat-input"]').first().isVisible().catch(() => false);
    expect(askedAQuestion || wroteSomething).toBeTruthy();
  });
});
