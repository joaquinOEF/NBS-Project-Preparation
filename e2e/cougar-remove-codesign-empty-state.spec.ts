import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// The dashed "O que você gostaria de ver aqui? / What would you want to see
// here?" co-design empty-state is removed from the orchestrator (a separate
// block from the "Early prototype" banner already dropped in round 2). The
// dashboard should end at the participants grid — no feedback prompt below it.

test.describe('COUGAR — remove co-design empty-state', () => {
  test('the orchestrator has no "what would you want to see here" feedback block', async ({ page }) => {
    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `nofeedback-${randomUUID()}@e2e.test`, password: 'pw-123456', name: 'NoFeedback' }); // admin

    await page.goto('/orchestrator');
    // Wait for the dashboard to actually render (cohort header present).
    await expect(page.getByTestId('button-invite-cbo')).toBeVisible({ timeout: 20_000 });

    const body = await page.locator('main').innerText();
    expect(body).not.toContain('gostaria de ver aqui');
    expect(body).not.toContain('deliberately sparse');
    expect(body).not.toContain('What would you want to see here');
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'test-results/no-feedback-block.png' });
  });
});
