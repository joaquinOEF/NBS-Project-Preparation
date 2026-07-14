import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// COUGAR Perfect Demo (2026-07-14): a member session ran entirely in English —
// questions, chips, "Question 1 of 2 · Tab to cycle" — because the browser was
// English and the cohort had no forced language, so detection won. The platform
// serves Porto Alegre community orgs: a member arriving via invite link must
// default to Portuguese unless the coordinator explicitly forces English
// (cougar-cohort-language.spec.ts covers the forced cases).

test.use({ locale: 'en-US' });

test.describe('COUGAR — members default to Portuguese', () => {
  test('an en-US browser on an invite from a language-less cohort gets PT', async ({ page, request }) => {
    const ext = new TestApi(request);
    const { cohort } = await ext.createCohort('e2e default lang');
    const invite = (await ext.inviteMember(cohort.id, { orgName: 'Org Padrão' })).inviteUrl as string;

    await page.goto(invite);
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt', { timeout: 20_000 });
    // The focus-workshop card renders the localized (PT) workshop name.
    await expect(page.getByText('Encontro 1 — Quem somos')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Workshop 1 — Who We Are')).toHaveCount(0);
  });
});
