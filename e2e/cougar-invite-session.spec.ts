import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// Task #7 — a NEW invite opened on a device that already has another org's
// session cached must NOT resume that prior conversation. The fix scopes the
// cached-session localStorage key by invite token, so each invited org keeps a
// separate session; re-opening the same invite still resumes its own.

test.describe('COUGAR #7 — new invite never resumes a prior org session', () => {
  test('two invites on the same browser get separate sessions; re-opening resumes', async ({ page, request }) => {
    const api = new TestApi(request);
    const { cohort } = await api.createCohort('e2e invite-isolation');
    const a = await api.inviteMember(cohort.id, { orgName: 'Org Alpha' });
    const b = await api.inviteMember(cohort.id, { orgName: 'Org Beta' });

    // Open an invite, click through welcome (+ preamble), return its chat session id.
    const openInvite = async (inviteUrl: string): Promise<string> => {
      await page.goto(inviteUrl);
      await page.getByTestId('button-cbo-welcome-cta').click({ timeout: 30_000 });
      const pre = page.getByTestId('button-encontro-1-start');
      if (await pre.isVisible({ timeout: 8_000 }).catch(() => false)) await pre.click();
      const marker = page.getByTestId('cbo-stream-status');
      await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
      await page.waitForTimeout(900); // hold for the video
      return (await marker.getAttribute('data-cbo-id'))!;
    };

    const idA = await openInvite(a.inviteUrl);
    const idB = await openInvite(b.inviteUrl);
    // The core fix: invite B starts its OWN session, not org A's.
    expect(idB, 'a new invite must NOT resume the previous org session').not.toBe(idA);

    // And re-opening invite A still resumes A's own session.
    const idA2 = await openInvite(a.inviteUrl);
    expect(idA2, 're-opening the same invite resumes its own session').toBe(idA);

    // Sessions are cached under per-token keys, not the single global key.
    const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('cbo-session-id')));
    expect(keys.filter(k => k.includes(':')).length, 'per-token session keys exist').toBeGreaterThanOrEqual(2);
  });
});

// The token link is a credential to the ORG's working session — opening it on a
// fresh device (empty localStorage) must resume the SAME conversation, not mint
// a new empty session. Regression guard: server binding (member.cboStateId) is
// read back on load (resolveSession), not just written.
test.describe('COUGAR — token link resumes on a fresh device', () => {
  test('clean localStorage resolves the same session from the server binding', async ({ page, browser, request }) => {
    const api = new TestApi(request);
    const { cohort } = await api.createCohort('e2e cross-device');
    const a = await api.inviteMember(cohort.id, { orgName: 'Org Cross' });

    const openInvite = async (p: typeof page): Promise<string> => {
      await p.goto(a.inviteUrl);
      await p.getByTestId('button-cbo-welcome-cta').click({ timeout: 30_000 });
      const pre = p.getByTestId('button-encontro-1-start');
      if (await pre.isVisible({ timeout: 8_000 }).catch(() => false)) await pre.click();
      const marker = p.getByTestId('cbo-stream-status');
      await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
      return (await marker.getAttribute('data-cbo-id'))!;
    };

    // First device establishes the session and the server binding.
    const idA = await openInvite(page);
    const token = new URL(a.inviteUrl).searchParams.get('t')!;
    await expect
      .poll(async () => (await (await request.get(`/api/cbo-member/by-token/${token}`)).json()).cboStateId, {
        timeout: 15_000,
      })
      .toBe(idA);

    // Second "device": a brand-new context has no localStorage — exactly the
    // case that used to mint a fresh empty session and orphan the real one.
    const ctx = await browser.newContext();
    try {
      const idA2 = await openInvite(await ctx.newPage());
      expect(idA2, 'a clean device must resume the same session, not create a new one').toBe(idA);
    } finally {
      await ctx.close();
    }
  });
});
