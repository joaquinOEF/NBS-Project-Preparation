import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Cross-cohort isolation — the multi-tenant ownership guard. A scoped
// coordinator may act only on their own cohort; an admin (no cohortId) may act
// on any and may create cohorts. Each test creates its own throwaway cohorts
// (e2e-* slugs) and a uniquely-named coordinator; cleanup is the global
// teardown. The per-test `request` fixture starts cookie-less, so creating the
// coordinator (which logs in) sets exactly that role for the assertions.

test.describe('Cross-cohort isolation', () => {
  test('a scoped coordinator can read only their own cohort', async ({ request }) => {
    const api = new TestApi(request);
    const a = (await api.createCohort('Iso A')).cohort;
    const b = (await api.createCohort('Iso B')).cohort;
    // Scope a coordinator to cohort A — sets the coord session cookie on `request`.
    await api.createCoordinator({ email: `scoped-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: a.id });

    // /mine resolves to their OWN cohort, flagged non-admin.
    const mine = await request.get('/api/cohort/mine');
    expect(mine.ok()).toBeTruthy();
    const mineBody = await mine.json();
    expect(mineBody.cohort.id).toBe(a.id);
    expect(mineBody.isAdmin).toBe(false);

    // Own cohort → 200, someone else's → 403, unknown slug → 404.
    expect((await request.get(`/api/cohort/${a.coordinatorSlug}`)).status()).toBe(200);
    expect((await request.get(`/api/cohort/${b.coordinatorSlug}`)).status()).toBe(403);
    expect((await request.get('/api/cohort/no-such-slug-xyz')).status()).toBe(404);

    // Mutations on another cohort are blocked too (not just reads).
    expect((await request.post(`/api/cohort/${b.coordinatorSlug}/invite`, { data: { orgName: 'X' } })).status()).toBe(403);

    // Scoped coordinators can't create cohorts.
    expect((await request.post('/api/cohort', { data: { name: 'nope' } })).status()).toBe(403);
  });

  test('an admin can read any cohort and create cohorts', async ({ request }) => {
    const api = new TestApi(request);
    const a = (await api.createCohort('Admin A')).cohort;
    const b = (await api.createCohort('Admin B')).cohort;
    // Admin = no cohortId.
    await api.createCoordinator({ email: `admin-${randomUUID()}@e2e.test`, password: 'pw-123456' });

    const mine = await request.get('/api/cohort/mine');
    expect(mine.ok()).toBeTruthy();
    expect((await mine.json()).isAdmin).toBe(true);

    // Reaches both cohorts.
    expect((await request.get(`/api/cohort/${a.coordinatorSlug}`)).status()).toBe(200);
    expect((await request.get(`/api/cohort/${b.coordinatorSlug}`)).status()).toBe(200);

    // And can create a new one.
    expect((await request.post('/api/cohort', { data: { name: 'Admin can create' } })).ok()).toBeTruthy();
  });
});
