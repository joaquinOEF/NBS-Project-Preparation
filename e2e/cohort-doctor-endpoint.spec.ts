import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// ⚠️ THE PROD CHECK. `npm run cohort:doctor` reads whatever database the shell
// is pointed at — on Replit the workspace one, never the Deployment's. The one
// environment whose answer matters is the one the script cannot reach, so the
// same verdicts have to be answerable over HTTP, behind the coordinator login.

test.describe('the doctor, from inside the deployment', () => {
  const setup = async (request: any) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Doc ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `doc-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    return { api, cohort };
  };

  test('an org that finished before `_e2_closed` existed reads as finished — and gets it recorded', async ({ request }) => {
    const { api, cohort } = await setup(request);
    // Exactly the August shape: `_role_done` and nothing newer. The teia/collab
    // beats shipped after this organisation had already closed Encontro 2.
    const legacy = (await api.inviteMember(cohort.id, { orgName: 'Fechou em agosto', withSession: true })).member;
    await api.seedState(legacy.cboStateId, {
      phase: 2, language: 'pt',
      sections: [
        { sectionId: 'intervention_site', field: 'bairro', value: 'Azenha' },
        { sectionId: 'intervention_site', field: '_site_lat', value: '-30.06' },
        { sectionId: 'intervention_site', field: '_role_done', value: 'yes' },
      ],
    });
    // And one still mid-encontro, which must not be swept along with it.
    const mid = (await api.inviteMember(cohort.id, { orgName: 'No meio', withSession: true })).member;
    await api.seedState(mid.cboStateId, {
      phase: 2, language: 'pt',
      sections: [{ sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' }],
    });

    const first = await (await request.get(`/api/cohort/${cohort.coordinatorSlug}/doctor`)).json();
    const byName = (n: string) => first.orgs.find((o: any) => o.orgName === n);
    expect(byName('Fechou em agosto').closed, 'August markers still mean finished').toBe(true);
    expect(byName('Fechou em agosto').verdict).toBe('ready-waiting');
    expect(byName('No meio').closed, 'one answer is not a finished encontro').toBe(false);
    expect(byName('No meio').verdict).toBe('in-progress');
    expect(first.waiting).toBe(1);
    expect(first.backfilled, 'the inferred close is recorded once').toBe(1);

    // Idempotent: the second read has nothing left to record.
    const second = await (await request.get(`/api/cohort/${cohort.coordinatorSlug}/doctor`)).json();
    expect(second.backfilled).toBe(0);
    expect(second.orgs.find((o: any) => o.orgName === 'Fechou em agosto').closed).toBe(true);
  });

  test('opening the encontro moves it from waiting to ready', async ({ request }) => {
    const { api, cohort } = await setup(request);
    const m = (await api.inviteMember(cohort.id, { orgName: 'Pronta', withSession: true })).member;
    await api.seedState(m.cboStateId, {
      phase: 2, language: 'pt',
      sections: [
        { sectionId: 'intervention_site', field: 'bairro', value: 'Azenha' },
        { sectionId: 'intervention_site', field: '_e2_closed', value: 'yes' },
      ],
    });
    expect((await (await request.get(`/api/cohort/${cohort.coordinatorSlug}/doctor`)).json()).waiting).toBe(1);

    await request.patch(`/api/cohort/${cohort.coordinatorSlug}/open-workshop`, { data: { phase: 3 } });
    const after = await (await request.get(`/api/cohort/${cohort.coordinatorSlug}/doctor`)).json();
    expect(after.waiting).toBe(0);
    expect(after.orgs[0].verdict).toBe('ready-to-enter');
    expect(after.orgs[0].nextOpen).toBe(3);
    // It reports what the ORG will get, not the raw column — the member row was
    // never touched by the opening in this test's ordering.
    expect(after.orgs[0].unlockedPhases).toContain(3);
  });

});
