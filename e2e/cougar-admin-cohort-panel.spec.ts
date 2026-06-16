import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Admin cohort management — the simpler model (no shell, no UUID dance):
//  • admin sees a cohort SWITCHER over every cohort
//  • "New cohort" provisions a coordinator + their cohort in one form, then the
//    board switches to it
//  • the new coordinator is SCOPED: logs in with the email/password set here,
//    sees only their cohort, and is 403'd on the admin directory
//  • switching between cohorts works; deleting the new one cleans up

test.describe('COUGAR — admin cohort panel', () => {
  test('admin provisions a coordinator+cohort, switches into it, scoped login is isolated', async ({ page, request }) => {
    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `admin-${randomUUID()}@e2e.test`, password: 'admin-pass-1', name: 'Joaquin' }); // null cohortId = admin

    await page.goto('/orchestrator');

    // Admin gets a switcher (the default cohort is always present).
    const switcher = page.getByTestId('select-cohort-switcher');
    await expect(switcher).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'test-results/admin-01-switcher.png' });

    // ── Provision a new coordinator + cohort from the panel ──
    const coordEmail = `julia-${randomUUID()}@e2e.test`;
    const cohortName = `QA Cohort ${randomUUID().slice(0, 6)}`;
    await page.getByTestId('button-new-cohort').click();
    await page.getByTestId('input-provision-cohort-name').fill(cohortName);
    await page.getByTestId('input-provision-coordinator-name').fill('Julia');
    await page.getByTestId('input-provision-email').fill(coordEmail);
    await page.getByTestId('input-provision-password').fill('julia-pass-1');
    await page.getByTestId('button-provision-lang-pt').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'test-results/admin-02-provision-form.png' });
    await page.getByTestId('button-confirm-provision-cohort').click();

    // Board switched to the freshly-created cohort; it shows in the switcher.
    await expect(switcher).toContainText(cohortName, { timeout: 15_000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'test-results/admin-03-after-provision.png' });

    // The directory records the linked coordinator + chosen language.
    const all = await (await page.request.get('/api/cohort/all')).json();
    const created = all.cohorts.find((c: any) => c.name === cohortName);
    expect(created).toBeTruthy();
    expect(created.coordinatorName).toBe('Julia');
    expect(created.coordinatorEmail).toBe(coordEmail);
    expect(created.language).toBe('pt');
    const newSlug: string = created.coordinatorSlug;

    // ── The new coordinator is scoped (separate request context, NOT admin) ──
    const loginRes = await request.post('/api/coordinator/login', {
      data: { email: coordEmail, password: 'julia-pass-1' },
    });
    expect(loginRes.ok()).toBeTruthy();
    const mine = await (await request.get('/api/cohort/mine')).json();
    expect(mine.isAdmin).toBe(false);
    expect(mine.cohort.name).toBe(cohortName);
    // A scoped coordinator cannot read the admin directory.
    const forbidden = await request.get('/api/cohort/all');
    expect(forbidden.status()).toBe(403);

    // ── Switch cohorts in the admin UI: → default → back to the new one ──
    await switcher.click();
    await page.getByTestId('option-cohort-default').click();
    await expect(switcher).toContainText('Vila Flores', { timeout: 15_000 }); // default cohort
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'test-results/admin-04-switched-default.png' });

    await switcher.click();
    await page.getByTestId(`option-cohort-${newSlug}`).click();
    await expect(switcher).toContainText(cohortName, { timeout: 15_000 });
    await page.waitForTimeout(700);

    // ── Delete the new cohort (admin-only) — also cleans up the test row ──
    await page.getByTestId('button-delete-cohort').click();
    await page.getByTestId('button-confirm-delete-cohort').click();
    // After delete the board falls back to a cohort and the QA one is gone from
    // the directory.
    await expect.poll(async () => {
      const after = await (await page.request.get('/api/cohort/all')).json();
      return after.cohorts.some((c: any) => c.name === cohortName);
    }, { timeout: 15_000 }).toBe(false);
    await page.waitForTimeout(800);
  });
});
