import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// THE COORDINATOR SIDE, OFF THE HAPPY PATH — the visit, the pre-note and the
// pre-portfolio routes under bad input, empty cohorts, records that do not
// exist yet, removed members and concurrent saves. What has to hold: never a
// 5xx, never a foreign id kept, never a lost answer, and the printed pages
// always print.

const seedOrg = (name: string, lat: string, solution = 'jardins-de-chuva') => [
  { sectionId: 'org_profile', field: 'org_name', value: name },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' },
  { sectionId: 'intervention_site', field: '_site_lat', value: lat },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.2032' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  { sectionId: 'intervention_site', field: 'land_tenure', value: 'private-owned' },
  { sectionId: 'intervention_type', field: 'solution_tests_json', value: JSON.stringify([{ solutionId: solution, reaction: 'faz-sentido', areaM2: 120, testedAt: 'x' }]) },
];

async function setup(page: any, tag: string) {
  const api = new TestApi(page.request);
  const cohort = (await api.createCohort(`Abuse ${tag}`)).cohort;
  await api.createCoordinator({ email: `abuse-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
  return { api, cohort, base: `/api/cohort/${cohort.coordinatorSlug}` };
}

test.describe('off the happy path — the coordinator side', () => {
  test('an empty cohort: the board, the suggestion, the print, confirm', async ({ page }) => {
    const { base } = await setup(page, randomUUID().slice(0, 6));
    const b = await page.request.get(`${base}/preportfolio`);
    expect(b.status()).toBe(200);
    expect((await b.json()).groups).toEqual([]);
    expect((await page.request.post(`${base}/preportfolio/suggest`, { data: {} })).status()).toBe(200);
    expect((await page.request.get(`${base}/preportfolio/print`)).status()).toBe(200);
    expect((await page.request.post(`${base}/preportfolio/confirm`)).status()).toBe(409);
    expect((await page.request.post(`${base}/preportfolio/narrative`, { data: { memberIds: [] } })).status()).toBe(400);
    expect((await page.request.post(`${base}/preportfolio/narrative`, { data: { memberIds: ['nope'] } })).status()).toBe(400);
  });

  test('a saved board keeps only this cohort\'s members, each once, whatever is sent', async ({ page }) => {
    const tag = randomUUID().slice(0, 6);
    const { api, cohort, base } = await setup(page, tag);
    const a = (await api.inviteMember(cohort.id, { orgName: 'A', withSession: true })).member;
    const b = (await api.inviteMember(cohort.id, { orgName: 'B', withSession: true })).member;
    await api.seedState(a.cboStateId, { phase: 4, language: 'pt', sections: seedOrg('A', '-30.0198') });
    await api.seedState(b.cboStateId, { phase: 4, language: 'pt', sections: seedOrg('B', '-30.0201') });
    const other = await setup(page, `${tag}x`);
    const foreign = (await other.api.inviteMember(other.cohort.id, { orgName: 'Foreign', withSession: true })).member;
    // The second setup logged in as the other coordinator; log back in as ours.
    await api.createCoordinator({ email: `abuse-${tag}-2@e2e.test`, password: 'pw-123456', cohortId: cohort.id });

    for (const body of [
      { groups: 'not an array' },
      { groups: [{ memberIds: 'x' }, null, 7] },
      { groups: [{ id: 'g1', title: 'x'.repeat(5000), memberIds: [a.id, a.id, foreign.id, b.id], story: 'y'.repeat(9000) }, { id: 'g2', memberIds: [a.id] }] },
      { prefs: { geoWeight: 'abc', theme: 'tornado', allowSingle: 'yes' }, groups: Array.from({ length: 200 }, (_, i) => ({ id: `g${i}`, memberIds: [b.id] })) },
    ]) {
      const r = await page.request.put(`${base}/preportfolio`, { data: body });
      expect(r.status(), JSON.stringify(body).slice(0, 80)).toBe(200);
    }
    const r = await page.request.put(`${base}/preportfolio`, { data: { groups: [{ id: 'g1', title: 'x'.repeat(5000), memberIds: [a.id, a.id, foreign.id, b.id], story: 'y'.repeat(9000) }, { id: 'g2', memberIds: [a.id] }] } });
    const saved = (await r.json()).groups;
    expect(saved).toHaveLength(1);
    expect(saved[0].memberIds).toEqual([a.id, b.id]);
    expect(saved[0].title.length).toBe(140);
    expect(saved[0].story.length).toBe(2000);
    const board = await (await page.request.get(`${base}/preportfolio`)).json();
    expect(board.prefs).toEqual({ geoWeight: 0.5, theme: null, allowSingle: false });

    // Concurrent saves: one of them wins, nothing breaks.
    const results = await Promise.all([1, 2, 3, 4].map(n => page.request.put(`${base}/preportfolio`, { data: { groups: [{ id: `c${n}`, memberIds: [a.id, b.id] }] } })));
    expect(results.every(x => x.status() === 200)).toBe(true);
    expect((await (await page.request.get(`${base}/preportfolio`)).json()).groups).toHaveLength(1);
  });

  test('a removed or excluded member drops off the board; an empty record still prints', async ({ page }) => {
    const { api, cohort, base } = await setup(page, randomUUID().slice(0, 6));
    const a = (await api.inviteMember(cohort.id, { orgName: 'A', withSession: true })).member;
    const b = (await api.inviteMember(cohort.id, { orgName: 'B', withSession: true })).member;
    const empty = (await api.inviteMember(cohort.id, { orgName: 'Ainda nada', withSession: true })).member;
    await api.seedState(a.cboStateId, { phase: 4, language: 'pt', sections: seedOrg('A', '-30.0198') });
    await api.seedState(b.cboStateId, { phase: 4, language: 'pt', sections: seedOrg('B', '-30.0201') });
    await page.request.put(`${base}/preportfolio`, { data: { groups: [{ id: 'g1', memberIds: [a.id, b.id, empty.id] }] } });

    // The empty record: on the board with no solution, its pre-note prints the "no solution" page.
    const board = await (await page.request.get(`${base}/preportfolio`)).json();
    const e = board.orgs.find((o: any) => o.memberId === empty.id);
    expect(e).toMatchObject({ solutionId: null, horizon: '1-ano' });
    const html = await (await page.request.get(`${base}/member/${empty.id}/document/prenota`)).text();
    expect(html).toContain('Ainda não há uma solução para esta pré-nota');
    expect((await page.request.post(`${base}/preportfolio/narrative`, { data: { memberIds: [a.id, empty.id] } })).status()).toBe(200);

    await page.request.patch(`${base}/member/${b.id}/portfolio`, { data: { exclude: true } });
    await page.request.delete(`${base}/member/${a.id}`);
    const after = await (await page.request.get(`${base}/preportfolio`)).json();
    expect(after.groups.flatMap((g: any) => g.memberIds)).toEqual([empty.id]);
    expect((await page.request.get(`${base}/preportfolio/print`)).status()).toBe(200);
    const c = await page.request.post(`${base}/preportfolio/confirm`);
    expect(c.status()).toBe(200);
  });

  test('the visit and the pre-note routes refuse nonsense without breaking', async ({ page }) => {
    const { api, cohort, base } = await setup(page, randomUUID().slice(0, 6));
    const a = (await api.inviteMember(cohort.id, { orgName: 'A', withSession: true })).member;
    const noSession = (await api.inviteMember(cohort.id, { orgName: 'Sem sessão' })).member;
    await api.seedState(a.cboStateId, { phase: 4, language: 'pt', sections: seedOrg('A', '-30.0198') });
    const visit = `${base}/member/${a.id}/visit`;
    expect((await page.request.patch(visit, { data: { solutionId: '' } })).status()).toBe(400);
    expect((await page.request.patch(visit, { data: {} })).status()).toBe(400);
    const odd = await (await page.request.patch(visit, { data: { solutionId: 'jardins-de-chuva', areaM2: '-50', date: '' } })).json();
    expect(odd.visit.areaM2, 'a negative size is not a size').toBeUndefined();
    const text = await (await page.request.patch(visit, { data: { solutionId: 'corredores-verdes', units: 'muitas' } })).json();
    expect(text.visit.units).toBeUndefined();
    expect((await page.request.patch(`${base}/member/${noSession.id}/visit`, { data: { solutionId: 'jardins-de-chuva' } })).status()).toBe(409);
    expect((await page.request.patch(`${base}/member/does-not-exist/visit`, { data: { solutionId: 'jardins-de-chuva' } })).status()).toBe(404);

    const rev = `${base}/member/${a.id}/prenote/review`;
    expect((await page.request.patch(rev, { data: { status: null } })).status(), 'taking off a stamp that is not there').toBe(200);
    expect((await page.request.patch(rev, { data: {} })).status()).toBe(400);
    const edit = `${base}/member/${a.id}/prenote/edit`;
    expect((await page.request.patch(edit, { data: { section: 'problema', text: 'z'.repeat(20000) } })).status()).toBe(200);
    const pn = await (await page.request.get(`${base}/member/${a.id}/prenote`)).json();
    expect(pn.prenote.sections.find((s: any) => s.id === 'problema').lines[0].text.length).toBe(4000);
    expect((await page.request.patch(edit, { data: { section: 'problema', text: '' } })).status(), 'an empty edit removes it').toBe(200);
    expect((await (await page.request.get(`${base}/member/${a.id}/prenote`)).json()).prenote.sections.find((s: any) => s.id === 'problema').edited).toBeUndefined();
    expect((await page.request.get(`${base}/member/${noSession.id}/prenote`)).status()).toBe(200);
    expect((await page.request.get(`/api/cbo/does-not-exist/prenote`)).status()).toBe(404);
  });
});
