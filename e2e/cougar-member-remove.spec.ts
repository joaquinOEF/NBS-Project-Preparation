import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Per-org REMOVAL (vs reset, which keeps the member): card chip → confirm
// dialog → the member row is deleted, so the invite link dies and the card
// leaves the board. The organization row survives on purpose — re-inviting
// the same org name must relink to it (documents come back) instead of
// minting a duplicate organizations row.

test.describe('COUGAR — remove an organization from the cohort', () => {
  test('remove chip deletes the member; re-inviting the same name reuses the org', async ({ page }) => {
    const api = new TestApi(page.request);
    const { cohort } = await api.createCohort('e2e member-remove');
    await api.createCoordinator({ email: `coord-${randomUUID()}@e2e.test`, password: 'coord-pass-1', cohortId: cohort.id });

    const invited = await api.inviteMember(cohort.id, { orgName: 'Org RemoveMe', neighborhood: 'Sarandi', withSession: true });
    const stateId: string = invited.member.cboStateId;
    const orgId: string = invited.member.orgId;
    const token: string = invited.member.capabilityToken;
    expect(stateId).toBeTruthy();
    expect(orgId).toBeTruthy();

    await page.goto('/orchestrator');
    const card = page.getByTestId(`card-orchestrator-project-${invited.member.id}`);
    await expect(card).toBeVisible({ timeout: 20_000 });

    // Remove chip → confirm dialog names the org → confirm.
    await card.getByTestId(`button-cbo-remove-${invited.member.id}`).click();
    await expect(page.getByText('Remove Org RemoveMe from the cohort?')).toBeVisible();
    await page.getByTestId('button-confirm-member-remove').click();

    // The member row is gone: card off the board, roster empty of it.
    await expect(card).not.toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => {
      const mine = await (await page.request.get('/api/cohort/mine')).json();
      return (mine.members ?? []).some((x: any) => x.id === invited.member.id);
    }, { timeout: 15_000 }).toBe(false);

    // The invite link is dead and the working session deleted.
    expect((await page.request.get(`/api/cbo-member/by-token/${token}`)).status()).toBe(404);
    expect((await page.request.get(`/api/cbo/${stateId}`)).status()).toBe(404);

    // Re-invite the SAME org name through the real coordinator invite: the
    // kept organizations row is reused, not duplicated.
    const reinvite = await (await page.request.post(`/api/cohort/${cohort.coordinatorSlug}/invite`, {
      data: { orgName: 'Org RemoveMe', neighborhood: 'Sarandi' },
    })).json();
    expect(reinvite.member.id).not.toBe(invited.member.id);
    expect(reinvite.member.orgId, 'same-name re-invite must relink the kept org').toBe(orgId);
  });

  test('cohort rename changes only the display name; invites keep working', async ({ page }) => {
    const api = new TestApi(page.request);
    const { cohort } = await api.createCohort('e2e rename-before');
    await api.createCoordinator({ email: `coord-${randomUUID()}@e2e.test`, password: 'coord-pass-1', cohortId: cohort.id });
    const invited = await api.inviteMember(cohort.id, { orgName: 'Org SurvivesRename' });

    const r = await page.request.patch(`/api/cohort/${cohort.coordinatorSlug}/name`, {
      data: { name: 'e2e rename-after' },
    });
    expect(r.ok()).toBe(true);

    const mine = await (await page.request.get('/api/cohort/mine')).json();
    expect(mine.cohort.name).toBe('e2e rename-after');
    expect(mine.cohort.coordinatorSlug).toBe(cohort.coordinatorSlug);
    // The member's invite token still resolves to the (renamed) cohort.
    const byToken = await (await page.request.get(`/api/cbo-member/by-token/${invited.member.capabilityToken}`)).json();
    expect(byToken.cohort?.name).toBe('e2e rename-after');
  });
});
