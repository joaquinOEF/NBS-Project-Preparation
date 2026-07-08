import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Field report 2026-07-08 — restarting ("recomeçar do zero") on an invite
// link left the new session in a broken half-state: the org lost its invited
// name/neighborhood (the prefill effect is one-shot and had already fired for
// the OLD session), the chat sat silent (no kickoff greeting was re-posted),
// and the E1 path answer SURVIVED (it lives on cohort_members, which DELETE
// /api/cbo/:id didn't touch). This spec drives the full restart cycle on an
// invite session and pins all three fixes.
//
// No fake model needed: the kickoff greeting is a server template, and the
// spec never sends a chat turn.

test.describe('CBO restart on an invite link resets cleanly', () => {
  test('restart re-seeds prefill, re-greets, and clears member progress', async ({ page, request }) => {
    const api = new TestApi(request);
    const { cohort } = await api.createCohort('e2e restart-reset');
    const invite = await api.inviteMember(cohort.id, {
      orgName: 'Org Rewind',
      neighborhood: 'Sarandi',
      path: 'has-idea', // the run-derived answer that must NOT survive a restart
    });
    const token = new URLSearchParams(invite.inviteUrl.split('?')[1] ?? '').get('t')!;

    // Open the invite and land in the chat.
    await page.goto(invite.inviteUrl);
    await page.getByTestId('button-cbo-welcome-cta').click({ timeout: 30_000 });
    const pre = page.getByTestId('button-encontro-1-start');
    if (await pre.isVisible({ timeout: 8_000 }).catch(() => false)) await pre.click();
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const firstId = (await marker.getAttribute('data-cbo-id'))!;

    // The invite prefill landed: greeting confirms the org by name.
    await expect(marker).toHaveAttribute('data-org-name', 'Org Rewind', { timeout: 15_000 });
    await expect(page.getByText(/Conferindo|Checking/).first()).toBeVisible({ timeout: 15_000 });

    // Restart from scratch.
    await page.getByTestId('cbo-restart-trigger').click();
    await page.getByTestId('cbo-restart-confirm').click();
    await expect(marker).not.toHaveAttribute('data-cbo-id', firstId, { timeout: 15_000 });
    const secondId = (await marker.getAttribute('data-cbo-id'))!;

    // (1) Prefill re-seeded: the NEW session knows the org again.
    await expect(marker).toHaveAttribute('data-org-name', 'Org Rewind', { timeout: 15_000 });

    // (2) Kickoff re-posted: the fresh chat opens with the Step-0 greeting,
    // confirming the invited identity instead of sitting silent.
    await expect(page.getByText(/Conferindo|Checking/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Org Rewind').first()).toBeVisible();

    // (3) Member progress cleared server-side: path gone, binding moved to
    // the new session. Poll — the client PATCHes the new binding async.
    await expect
      .poll(async () => (await (await request.get(`/api/cbo-member/by-token/${token}`)).json()).cboStateId, {
        timeout: 15_000,
      })
      .toBe(secondId);
    const member = await (await request.get(`/api/cbo-member/by-token/${token}`)).json();
    expect(member.path, 'the E1 path answer must not survive a restart').toBeNull();
  });
});
