import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Coverage for the merged Phase-3c auth gate (#234): coordinator routes require
// a session, CBO routes stay open (CBOs never log in), the login page rejects a
// bad password and redirects on success, and the orchestrator bounces anonymous
// visitors to login.
//
// NOTE: per-account multi-cohort *isolation* (an owner guard so a scoped
// coordinator can't read another cohort) is NOT on main yet, so it is not tested
// here. See the PR description.
//
// Cleanup is global (e2e/global-teardown.ts), not per-test: a per-describe
// afterAll that purges all e2e data races parallel tests and deletes their
// coordinators mid-flight. Each test uses a unique email so runs never collide.

test.describe('Coordinator auth gate', () => {
  test('API boundary: /api/cohort is gated, /api/cbo is open', async ({ request }) => {
    // The per-test `request` fixture starts with no cookies → unauthenticated.
    const gated = await request.get('/api/cohort/default');
    expect(gated.status()).toBe(401);

    // The CBO-facing surface must stay reachable without any login.
    const cbo = await request.post('/api/cbo', { data: { city: 'porto-alegre' } });
    expect(cbo.ok()).toBeTruthy();
    expect((await cbo.json()).cboId).toBeTruthy();
  });

  test('a coordinator session opens the gate', async ({ request }) => {
    const api = new TestApi(request);
    const email = `gate-${randomUUID()}@e2e.test`;
    // /__test/coordinator creates + logs in, setting the coord cookie on this
    // request context's jar.
    await api.createCoordinator({ email, password: 'correct-horse-battery', name: 'Gate' });

    const r = await request.get('/api/cohort/default');
    expect(r.ok()).toBeTruthy();
    expect((await r.json()).cohort).toBeTruthy();
  });

  test('login page: wrong password errors, correct password redirects', async ({ page, request }) => {
    const email = `ui-${randomUUID()}@e2e.test`;
    const password = 'right-pass-12345';
    // Create the account (the cookie lands on `request`, not on `page`, so the
    // page is genuinely anonymous until it logs in through the form).
    await new TestApi(request).createCoordinator({ email, password, name: 'UI' });

    await page.goto('/coordinator-login');
    await page.locator('#coord-email').fill(email);
    await page.locator('#coord-password').fill('totally-wrong');
    await expect(page.locator('#coord-password')).toHaveValue('totally-wrong');
    const [wrongResp] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/coordinator/login') && r.request().method() === 'POST'),
      page.locator('button[type="submit"]').click(),
    ]);
    expect(wrongResp.status()).toBe(401);

    // Error surfaces; we stay on the login page.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/coordinator-login/);

    // Correct password → bounce to the orchestrator. Two state-settled checks
    // before submitting: the DOM value committed AND the error alert cleared (it
    // clears on the corrective keystroke). Together they guarantee React
    // re-rendered with the new password, so the handler can't capture the stale
    // one (a controlled-input race).
    await page.locator('#coord-password').fill(password);
    await expect(page.locator('#coord-password')).toHaveValue(password);
    await expect(page.getByRole('alert')).toBeHidden();
    const [okResp] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/coordinator/login') && r.request().method() === 'POST'),
      page.locator('button[type="submit"]').click(),
    ]);
    expect(okResp.status()).toBe(200);
    await expect(page).toHaveURL(/\/orchestrator/);
  });

  test('orchestrator requires auth: anonymous visit bounces to login', async ({ page }) => {
    await page.goto('/orchestrator');
    await expect(page).toHaveURL(/coordinator-login/);
  });
});
