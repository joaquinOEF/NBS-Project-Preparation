import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Task #4 — a coordinator can FORCE the UI language (PT/EN) for every org in a
// cohort, overriding the org's browser detection. The browser here is pt-BR, so
// detection would pick Portuguese; the cohort setting overrides it.

test.use({ locale: 'pt-BR' });

test.describe('COUGAR #4 — cohort-level forced language', () => {
  test('coordinator sets EN/PT; the invited org gets it despite a pt-BR browser', async ({ page, request }) => {
    const ext = new TestApi(request);
    const { cohort } = await ext.createCohort('e2e language');
    const invite = (await ext.inviteMember(cohort.id, { orgName: 'Org Idioma' })).inviteUrl as string;

    // Auth the page as a coordinator that owns this cohort.
    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `lang-${randomUUID()}@e2e.test`, password: 'lang-pass-12', name: 'Lang', cohortId: cohort.id });

    // Force ENGLISH.
    await page.goto('/orchestrator');
    await expect(page.getByTestId('button-cohort-lang-en')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('button-cohort-lang-en').click();
    await expect(page.getByTestId('button-cohort-lang-en')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(800);

    // Open the org's invite (pt-BR browser) → forced to English.
    await page.goto(invite);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en', { timeout: 20_000 });
    await page.waitForTimeout(1500);

    // Switch the cohort to PORTUGUESE.
    await page.goto('/orchestrator');
    await page.getByTestId('button-cohort-lang-pt').click();
    await expect(page.getByTestId('button-cohort-lang-pt')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(800);

    // Re-open the invite → now forced to Portuguese.
    await page.goto(invite);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt', { timeout: 20_000 });
    await page.waitForTimeout(1500);
  });
});
