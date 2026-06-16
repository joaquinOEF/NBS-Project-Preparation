import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Task #6 — cleanup. An admin coordinator can DELETE a cohort entirely (members
// + the cohort row), beyond the existing Reset (which only wipes members). The
// default cohort is re-created empty afterward. (Runbook in docs/cougar-runbook.md.)

test.describe('COUGAR #6 — delete-cohort cleanup', () => {
  test('an admin deletes a cohort with a member; the member disappears', async ({ page, request }) => {
    const api = new TestApi(page.request);
    await api.createCoordinator({ email: `del-${randomUUID()}@e2e.test`, password: 'del-pass-123', name: 'Del' }); // admin

    // Resolve the admin's (default) cohort, then drop a member into it.
    const mine = await (await page.request.get('/api/cohort/mine')).json();
    const ext = new TestApi(request);
    const member = (await ext.inviteMember(mine.cohort.id, { orgName: 'Org ToDelete', withSession: true })).member;

    await page.goto('/orchestrator');
    const card = page.getByTestId(`card-orchestrator-project-${member.id}`);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1000);

    // Delete cohort (admin-only) → confirm.
    await page.getByTestId('button-delete-cohort').click();
    await expect(page.getByTestId('button-confirm-delete-cohort')).toBeVisible();
    await page.waitForTimeout(700);
    await page.getByTestId('button-confirm-delete-cohort').click();

    // The cohort (and its member) are gone — the default is re-created empty.
    await expect(card).toHaveCount(0, { timeout: 15_000 });
    await page.waitForTimeout(1200); // hold for the video
  });
});
