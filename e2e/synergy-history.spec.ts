import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// PAST SYNERGY REPORTS — and whose they are.
//
// Every run was always stored; only the newest could be opened, so running the
// report again after a meeting lost the page the meeting was planned from.
//
// ⚠️ And the three synergy routes are keyed by the cohort's ID, not its slug,
// so the per-network guard never ran for them: a coordinator of one network who
// held another's id could read its report. Both halves are pinned here.

async function network(api: TestApi, name: string, orgs: string[]) {
  const cohort = (await api.createCohort(`${name} ${randomUUID().slice(0, 6)}`)).cohort;
  for (const orgName of orgs) {
    const m = (await api.inviteMember(cohort.id, { orgName, neighborhood: 'Centro', withSession: true })).member;
    await api.seedState(m.cboStateId, { phase: 3, language: 'pt', sections: [
      { sectionId: 'intervention_site', field: 'bairro', value: 'Centro' },
      { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
    ] });
  }
  return cohort;
}

test.describe('earlier reports stay openable', () => {
  test.use({ locale: 'pt-BR' });

  test('each run is listed, and an earlier one opens as it was', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = await network(api, 'Hist', ['Associação Aurora', 'Coletivo Beira-Rio']);
    await api.createCoordinator({ email: `hist-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });

    const run = async () => {
      const id = (await (await page.request.post(`/api/cohort/${cohort.id}/synergies`)).json()).id;
      await expect.poll(async () => {
        const r = await (await page.request.get(`/api/cohort/${cohort.id}/synergies`)).json();
        return r.id === id ? r.status : 'waiting';
      }, { timeout: 60_000 }).toBe('done');
      return id as string;
    };

    const first = await run();
    // A third organisation joins between the two runs.
    const late = (await api.inviteMember(cohort.id, { orgName: 'Instituto Quatro Ventos', neighborhood: 'Centro', withSession: true })).member;
    await api.seedState(late.cboStateId, { phase: 3, language: 'pt', sections: [{ sectionId: 'intervention_site', field: 'bairro', value: 'Centro' }] });
    const second = await run();

    const { reports } = await (await page.request.get(`/api/cohort/${cohort.id}/synergies/history`)).json();
    expect(reports.map((r: any) => r.id)).toEqual([second, first]);
    expect(reports.map((r: any) => r.organisations)).toEqual([3, 2]);

    const latest = await (await page.request.get(`/api/cohort/${cohort.id}/synergies/print`)).text();
    const earlier = await (await page.request.get(`/api/cohort/${cohort.id}/synergies/print?id=${first}`)).text();
    expect(latest).toContain('Instituto Quatro Ventos');
    expect(earlier).not.toContain('Instituto Quatro Ventos');
    expect(earlier).toContain('Associação Aurora');

    await page.goto('/orchestrator');
    await page.getByTestId('view-projects').click();
    await page.getByTestId('synergy-history').locator('summary').click();
    await expect(page.getByTestId('synergy-history-item')).toHaveCount(1);
    await expect(page.getByTestId('synergy-history-item').locator('a')).toHaveAttribute('href', new RegExp(`id=${first}$`));
  });

  test("another network's report cannot be read, listed, opened or started", async ({ page, browser }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const mine = await network(api, 'Minha', ['Associação Aurora']);
    const theirs = await network(api, 'Deles', ['Coletivo Beira-Rio']);

    // Their coordinator runs their report…
    const other = await browser.newContext();
    const otherApi = new TestApi(other.request);
    await otherApi.createCoordinator({ email: `b-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: theirs.id });
    const theirRun = (await (await other.request.post(`/api/cohort/${theirs.id}/synergies`)).json()).id;
    await expect.poll(async () => (await (await other.request.get(`/api/cohort/${theirs.id}/synergies`)).json()).status, { timeout: 60_000 }).toBe('done');

    // …and mine, signed in, gets nothing of it.
    await api.createCoordinator({ email: `a-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: mine.id });
    for (const path of ['synergies', 'synergies/history', 'synergies/print', `synergies/print?id=${theirRun}`]) {
      expect((await page.request.get(`/api/cohort/${theirs.id}/${path}`)).status(), path).toBe(403);
    }
    expect((await page.request.post(`/api/cohort/${theirs.id}/synergies`)).status()).toBe(403);
    // Their run id under MY cohort opens nothing either.
    expect((await page.request.get(`/api/cohort/${mine.id}/synergies/print?id=${theirRun}`)).status()).toBe(404);
    expect((await page.request.get(`/api/cohort/${mine.id}/synergies/history`)).status()).toBe(200);
    await other.close();
  });
});
