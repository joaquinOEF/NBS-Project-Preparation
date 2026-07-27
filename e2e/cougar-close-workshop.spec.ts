import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Close workshop (field ask 2026-07-16: Rede SCbN POA opened W2 by mistake).
// Closing must undo all three things opening did: the cadence rail state
// (openedAt), every member's unlockedPhases, AND any session already sitting
// in the closed phase — gating only clamps entry, so without the rollback an
// org that had tapped the banner would keep running the closed encontro.

test.describe('COUGAR — close workshop', () => {
  test('W2 opened by mistake closes: re-locked cohort-wide, session rolled back', async ({ page, request }) => {
    const api = new TestApi(page.request);
    // A dedicated e2e cohort, NOT the admin fallback: an admin coordinator's
    // /mine resolves to the shared "default" cohort, and this spec MUTATES
    // workshop state — running it there once left W1 permanently "opened" and
    // broke every later default-cohort spec (2026-07-16).
    const { cohort } = await api.createCohort('Close Workshop Cohort');
    await api.createCoordinator({
      email: `close-${randomUUID()}@e2e.test`,
      password: 'close-pass-123',
      name: 'Close',
      cohortId: cohort.id,
    });
    const member = (
      await new TestApi(request).inviteMember(cohort.id, {
        orgName: 'Org Close',
        withSession: true,
      })
    ).member;

    await page.goto('/orchestrator');

    // Open W1 ("Mark as started") then W2 — the mistake being simulated.
    await page.getByTestId('button-open-workshop-0').click();
    const openW2 = page.getByTestId('button-open-workshop-1');
    await expect(openW2).toBeVisible({ timeout: 10_000 });
    await openW2.click();
    await expect
      .poll(async () => {
        const body = await (await page.request.get('/api/cohort/mine')).json();
        return body.members?.find((m: any) => m.id === member.id)?.unlockedPhases ?? [];
      }, { timeout: 10_000 })
      .toContain(2);

    // The org already tapped the banner: its session sits in phase 2.
    await new TestApi(request).seedState(member.cboStateId, { phase: 2 });

    // Close W2 — the button lives on the expanded Open row; two-step confirm.
    await page.getByTestId('workshop-toggle-1').click();
    const closeBtn = page.getByTestId('button-close-workshop-1');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click(); // arm
    await expect(closeBtn).toContainText(/again|de novo/i);
    await closeBtn.click(); // confirm

    // Phase 2 leaves the member's unlockedPhases…
    await expect
      .poll(async () => {
        const body = await (await page.request.get('/api/cohort/mine')).json();
        return body.members?.find((m: any) => m.id === member.id)?.unlockedPhases ?? [];
      }, { timeout: 10_000 })
      .not.toContain(2);

    // …the cadence rail shows W2 as next-up again…
    await expect(page.getByTestId('workshop-row-1-nextUp')).toBeVisible({ timeout: 10_000 });

    // …and the live session rolled back out of the closed phase (answers stay:
    // the rollback touches state.phase only, never sections/fields).
    await expect
      .poll(async () => {
        const body = await (await request.get(`/api/cbo/${member.cboStateId}`)).json();
        return body.state?.phase;
      }, { timeout: 10_000 })
      .toBe(1);
  });
});
