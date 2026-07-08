import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Field report 2026-07-08 — "it is impossible to erase the profile of a
// selected organization, just all at the same time." The console only had the
// cohort-wide Reset. This spec covers the new per-org reset: card chip →
// confirm dialog → the member's working session is deleted and every
// run-derived column cleared, while the member row (identity, invite link)
// survives.

test.describe('COUGAR — per-organization profile reset', () => {
  test('reset chip erases one org’s session + progress, keeps the member', async ({ page }) => {
    const api = new TestApi(page.request);
    const { cohort } = await api.createCohort('e2e member-reset');
    // Scoped coordinator for this cohort — cookie lands on the page context.
    await api.createCoordinator({ email: `coord-${randomUUID()}@e2e.test`, password: 'coord-pass-1', cohortId: cohort.id });

    const invited = await api.inviteMember(cohort.id, { orgName: 'Org ResetMe', neighborhood: 'Sarandi', withSession: true });
    const stateId: string = invited.member.cboStateId;
    expect(stateId).toBeTruthy();

    // Give the member visible progress so the reset has something to erase.
    await page.request.patch(`/api/cbo-member/${invited.member.memberSlug}/snapshot`, {
      data: { cboStateId: stateId, phase: 1, sectionsComplete: 3, maturityScore: 4, flagsMet: 1 },
    });

    await page.goto('/orchestrator');
    const card = page.getByTestId(`card-orchestrator-project-${invited.member.id}`);
    await expect(card).toBeVisible({ timeout: 20_000 });

    // Reset chip → confirm dialog names the org → confirm.
    await card.getByTestId(`button-cbo-reset-${invited.member.id}`).click();
    await expect(page.getByText('Org ResetMe?')).toBeVisible();
    await page.getByTestId('button-confirm-member-reset').click();

    // The member row survives (card still on the board) with progress cleared.
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => {
      const mine = await (await page.request.get('/api/cohort/mine')).json();
      const m = (mine.members ?? []).find((x: any) => x.id === invited.member.id);
      return m ? { cboStateId: m.cboStateId, path: m.path, snapshotPhase: m.snapshotPhase, sections: m.snapshotSectionsComplete } : null;
    }, { timeout: 15_000 }).toEqual({ cboStateId: null, path: null, snapshotPhase: null, sections: null });

    // The working session itself is gone.
    const gone = await page.request.get(`/api/cbo/${stateId}`);
    expect(gone.status(), 'the old session must be deleted').toBe(404);
  });
});
