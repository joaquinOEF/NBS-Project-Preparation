import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { openAdvanced, showMap } from './helpers/orchestrator';
import { buildBundle, parseBundle, isBundle } from '../shared/cohort-bundle';
import type { StateSnapshot } from '../shared/state-snapshot';

// A WHOLE COHORT, COPIED — AND ENCONTRO 3 WALKED FOR IT (docs/test-orgs.md).
//
// The pre-portfolio and the projects read what Encontro 3 produced, across a
// cohort. Trying them on real records means carrying the whole cohort from
// production to staging (one file), and then giving the organisations that
// stopped at Encontro 2 the Encontro 3 they never had — walked through the
// real workshop, over the real chat route, and marked as simulated.

const snap = (orgName: string, over: Partial<StateSnapshot> = {}): StateSnapshot => ({
  version: 1, exportedAt: '2026-10-16T00:00:00Z', orgName, neighborhood: 'Floresta', phase: 2, language: 'pt',
  sections: {
    org_profile: { org_name: { value: orgName }, contact_email: { value: 'x@y.org' }, contact_phone: { value: '51 9999' } },
    intervention_site: { site_story: { value: 'A água entra pelo portão.' } },
  },
  maturityScores: [], priorityFlags: [],
  ...over,
});

/** An organisation as Encontro 2 left it: a place, a worry, a story — and the close marker. */
const END_OF_E2 = [
  { sectionId: 'org_profile', field: 'org_name', value: 'Horta da Vila' },
  { sectionId: 'org_profile', field: 'contact_email', value: 'ana@horta.org' },
  { sectionId: 'org_profile', field: 'mission_summary', value: 'Horta comunitária e oficinas para as famílias da vila.' },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Pátio da associação' },
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0198' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.2032' },
  { sectionId: 'intervention_site', field: 'site_area_m2', value: '320' },
  { sectionId: 'intervention_site', field: 'current_use', value: 'paved' },
  { sectionId: 'intervention_site', field: 'land_tenure', value: 'private-owned' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  { sectionId: 'intervention_site', field: 'site_story', value: 'Quando chove forte a água entra pelo portão e fica dois dias no pátio.' },
  { sectionId: 'intervention_site', field: 'site_knowledge_depth', value: 'strong' },
  { sectionId: 'intervention_site', field: 'nbs_interest', value: 'aguas-pluviais' },
  { sectionId: 'intervention_site', field: '_role_done', value: 'yes' },
  // The deliberation beats are covered elsewhere (cougar-e3-deliberation); this walk is about getting through.
  { sectionId: 'intervention_type', field: '_quick_tests', value: 'yes' },
];

test.describe('the cohort file', () => {
  test('contacts and photographs never travel; a bad file says why', () => {
    const b = buildBundle({
      cohortName: 'POA', settings: { workshops: [], language: 'pt' },
      members: [{
        snapshot: snap('Ksa Rosa'), role: 'priority', path: 'has-idea', inspirationPicks: ['a'], unlockedPhases: [1, 2, 3], excludeFromPortfolio: false,
        site: { name: 'Pátio', kind: 'custom', coordinates: [-30, -51], geometry: null, photos: ['/uploads/x.jpg'], savedAt: 'now' } as any,
      }],
    });
    expect(isBundle(b)).toBe(true);
    expect(b.language).toBe('pt');
    expect(b.members[0].snapshot.sections.org_profile.contact_email).toBeUndefined();
    expect(b.members[0].snapshot.sections.org_profile.contact_phone).toBeUndefined();
    expect(b.members[0].snapshot.sections.org_profile.org_name.value).toBe('Ksa Rosa');
    expect(b.members[0].site?.photos).toEqual([]);
    expect(parseBundle(JSON.parse(JSON.stringify(b))).members[0].path).toBe('has-idea');
    expect(() => parseBundle({ version: 1 })).toThrow(/not a cohort file/);
    expect(() => parseBundle({ kind: 'cougar-cohort', version: 1, members: [{ snapshot: { hello: 1 } }] })).toThrow(/member 1/);
  });
});

test.describe('production → staging: a whole cohort, then Encontro 3 for those who never had it', () => {
  test.use({ locale: 'pt-BR' });

  test('export, import as a NEW cohort (names kept, in the analysis), then simulate Encontro 3 on the real chat route', async ({ page }) => {
    test.setTimeout(180_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const prod = (await api.createCohort(`Prod ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `admin-${randomUUID()}@e2e.test`, password: 'pw-123456' });

    const ready = (await api.inviteMember(prod.id, { orgName: 'Horta da Vila', neighborhood: 'Floresta', withSession: true, unlockedPhases: [1, 2] })).member;
    await api.seedState(ready.cboStateId, { phase: 2, language: 'pt', sections: END_OF_E2, maturity: [{ metric: 'site_control', score: 2 }] });
    const early = (await api.inviteMember(prod.id, { orgName: 'Coletivo Cedo', neighborhood: 'Partenon', withSession: true })).member;
    await api.seedState(early.cboStateId, { phase: 1, language: 'pt', sections: [{ sectionId: 'org_profile', field: 'org_name', value: 'Coletivo Cedo' }] });
    await api.inviteMember(prod.id, { orgName: 'Nunca Abriu', neighborhood: 'Centro' }); // no session — nothing to carry

    // ── Export ────────────────────────────────────────────────────────────
    const ex = await page.request.get(`/api/cohort/${prod.coordinatorSlug}/export`);
    expect(ex.ok()).toBe(true);
    expect(ex.headers()['content-disposition']).toContain('.coorte.json');
    const bundle = await ex.json();
    expect(bundle.kind).toBe('cougar-cohort');
    expect(bundle.members.map((m: any) => m.snapshot.orgName).sort()).toEqual(['Coletivo Cedo', 'Horta da Vila']);
    expect(JSON.stringify(bundle), 'contacts never leave').not.toContain('ana@horta.org');

    // ── Import, through the dialog an admin already uses ──────────────────
    await page.goto(`/orchestrator?cohort=${prod.coordinatorSlug}`);
    await openAdvanced(page);
    await page.getByTestId('button-import-org').click();
    await page.getByTestId('input-snapshot-json').fill(JSON.stringify(bundle));
    await expect(page.getByTestId('snapshot-preview')).toContainText('2 organizações');
    await page.getByTestId('button-import-org-submit').click();
    await expect(page.getByTestId('import-org-dialog')).toBeHidden({ timeout: 20_000 });
    await expect(page).toHaveURL(/cohort=/);
    const stagingSlug = new URL(page.url()).searchParams.get('cohort')!;
    expect(stagingSlug).not.toBe(prod.coordinatorSlug);

    const staged = await (await page.request.get(`/api/cohort/${stagingSlug}`)).json();
    expect(staged.cohort.name).toMatch(/· cópia/);
    const copy = staged.members.find((m: any) => m.orgName === 'Horta da Vila');
    expect(copy, 'the name is kept — the cohort says it is a copy').toBeTruthy();
    expect(copy.excludeFromPortfolio, 'a cohort copy is in the analysis').toBe(false);
    expect(copy.cboStateId).not.toBe(ready.cboStateId);

    // ── Simulate Encontro 3 ──────────────────────────────────────────────
    await openAdvanced(page);
    const strip = page.getByTestId('simulation-strip');
    await expect(strip).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('simulation-counts')).toContainText('1 prontas para simular');
    await page.getByTestId('button-simulate-e3-all').click();

    await expect.poll(async () => {
      const s = await (await page.request.get(`/api/cohort/${stagingSlug}/simulations`)).json();
      const run = s.runs.find((r: any) => r.memberId === copy.id);
      if (run?.status === 'failed') throw new Error(`simulation failed: ${run.error}`);
      return run?.status;
    }, { timeout: 150_000, intervals: [2000] }).toBe('done');

    const st = (await (await page.request.get(`/api/cbo/${copy.cboStateId}`)).json()).state;
    expect(st.phase).toBe(3);
    expect(st.sections.intervention_type.fields._e3_closed?.value).toBe('yes');
    expect(JSON.parse(st.sections.intervention_type.fields.solution_tests_json.value).length).toBeGreaterThanOrEqual(1);
    expect(st.metadata.simulated?.e3?.player).toBe('policy');
    // The original in "production" was never touched.
    const o = (await (await page.request.get(`/api/cbo/${ready.cboStateId}`)).json()).state;
    expect(o.phase).toBe(2);

    // The roster says it, so nobody reads the result as the organisation's own words.
    await expect(page.getByTestId(`badge-simulated-${copy.id}`)).toBeVisible({ timeout: 15_000 });

    await page.request.delete(`/api/cohort/${stagingSlug}`);
  });

  test('a scoped coordinator cannot import a whole cohort', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Scoped ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `scoped-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const b = buildBundle({ cohortName: 'X', settings: null, members: [] });
    const r = await page.request.post('/api/cohort/import', { data: { bundle: b } });
    expect(r.status()).toBe(403);
  });
});
