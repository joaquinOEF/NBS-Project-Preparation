import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

/** The `request` fixture and the browser have separate cookie jars — carry the
 *  coordinator session created via the API over to the page. */
async function shareSession(page: any, request: any) {
  const { cookies } = await request.storageState();
  await page.context().addCookies(cookies);
}

// COHORT-SELECTION-LOST-ON-RELOAD — the actual cause of JVP's 2026-08-03 report
// ("I restarted server for the staging version and the W2 was closed, when I
// had opened it before").
//
// The cadence rail is PER COHORT. `switchCohort` lived only in React state, so
// every reload re-resolved through /api/cohort/mine — the coordinator's own
// cohort. An admin who switched to another cohort, opened a workshop there and
// then reloaded came back to a DIFFERENT cohort whose rail showed that workshop
// as never opened. Nothing was lost; they were looking at the wrong thing,
// which is worse than a plain bug: it reads as data loss, and invites reopening
// a workshop that is already open.

test.describe('COUGAR — the selected cohort survives a reload', () => {
  test('an admin who switches cohorts and reloads stays on that cohort', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);

    // Two cohorts, and an ADMIN (no cohortId) who can move between them.
    const home = (await api.createCohort(`Home ${randomUUID().slice(0, 8)}`)).cohort;
    const other = (await api.createCohort(`Other ${randomUUID().slice(0, 8)}`)).cohort;
    await api.createCoordinator({ email: `admin-${randomUUID()}@e2e.test`, password: 'pw-123456' });
    await request.post(`/__test/cohort/${other.id}/member`, { data: { orgName: 'Org In Other' } });

    // Open W2 in the OTHER cohort — the write the report thought had been lost.
    const res = await request.patch(`/api/cohort/${other.coordinatorSlug}/open-workshop`, {
      data: { phase: 2, openedAt: '2026-08-03' },
    });
    expect(res.ok()).toBeTruthy();

    // Land on that cohort the way the switcher now does, then reload.
    await shareSession(page, request);
    await page.goto(`/orchestrator?cohort=${other.coordinatorSlug}`);
    await expect(page.getByText(other.name).first()).toBeVisible({ timeout: 30_000 });

    await page.reload();

    // The reload must NOT drop back to the admin's default cohort.
    await expect(
      page.getByText(other.name).first(),
      'a reload must keep the cohort that was on screen',
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(home.name)).toHaveCount(0);
  });

  test('the URL keeps a cohort the caller may not read out of the dashboard', async ({ page, request }) => {
    test.setTimeout(120_000);
    const api = new TestApi(request);
    const mine = (await api.createCohort(`Mine ${randomUUID().slice(0, 8)}`)).cohort;
    const foreign = (await api.createCohort(`Foreign ${randomUUID().slice(0, 8)}`)).cohort;
    // SCOPED coordinator — may act only on `mine`.
    await api.createCoordinator({
      email: `scoped-${randomUUID()}@e2e.test`,
      password: 'pw-123456',
      cohortId: mine.id,
    });

    // A hand-edited or shared URL pointing at someone else's cohort must not
    // load it. The server 403s at the app.param guard and the dashboard keeps
    // the cohort the account actually owns.
    await shareSession(page, request);
    await page.goto(`/orchestrator?cohort=${foreign.coordinatorSlug}`);
    await expect(page.getByText(mine.name).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(foreign.name)).toHaveCount(0);
  });
});
