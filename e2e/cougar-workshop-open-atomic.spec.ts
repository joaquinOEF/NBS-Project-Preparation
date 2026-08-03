import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Workshop open/close reliability (JVP, 2026-08-03: "I restarted server for the
// staging version and the W2 was closed, when I had opened it before").
//
// The reported symptom turned out to be the cohort SELECTION not surviving a
// reload — covered in cougar-cohort-selection-persist.spec.ts. What this spec
// pins is the machinery underneath, which was independently able to produce the
// same appearance:
//
//   · opening a workshop was TWO client-driven writes to two different tables,
//     neither error-checked, with the success toast firing regardless;
//   · PATCH /workshops overwrote the array from the client's copy, so a stale
//     page could null `openedAt` while re-locking nobody — the rail says
//     "closed" and every org still has access.

async function cohortWithMembers(request: any, n = 2) {
  const api = new TestApi(request);
  const cohort = (await api.createCohort(`WS ${randomUUID().slice(0, 8)}`)).cohort;
  await api.createCoordinator({
    email: `ws-${randomUUID()}@e2e.test`,
    password: 'pw-123456',
    cohortId: cohort.id,
  });
  for (let i = 0; i < n; i++) {
    await request.post(`/__test/cohort/${cohort.id}/member`, {
      data: { orgName: `Org ${i}`, unlockedPhases: [1] },
    });
  }
  return { api, cohort };
}

const read = async (request: any, slug: string) =>
  (await request.get(`/api/cohort/${slug}`)).json();

test.describe('COUGAR — opening a workshop is one atomic act', () => {
  test('one call unlocks every member AND stamps openedAt', async ({ request }) => {
    const { cohort } = await cohortWithMembers(request);
    const slug = cohort.coordinatorSlug;

    const before = await read(request, slug);
    expect(before.members.every((m: any) => !m.unlockedPhases.includes(2))).toBe(true);

    const res = await request.patch(`/api/cohort/${slug}/open-workshop`, {
      data: { phase: 2, openedAt: '2026-08-03' },
    });
    expect(res.ok()).toBeTruthy();

    const after = await read(request, slug);
    // Both halves, from ONE request — the pair that used to be able to split.
    expect(after.members.every((m: any) => m.unlockedPhases.includes(2))).toBe(true);
    const w2 = after.cohort.settings.workshops.find((w: any) => w.unlocksPhase === 2);
    expect(w2.openedAt).toBe('2026-08-03');
  });

  test('re-opening keeps the original date, and never double-adds a phase', async ({ request }) => {
    const { cohort } = await cohortWithMembers(request);
    const slug = cohort.coordinatorSlug;

    await request.patch(`/api/cohort/${slug}/open-workshop`, { data: { phase: 2, openedAt: '2026-08-01' } });
    await request.patch(`/api/cohort/${slug}/open-workshop`, { data: { phase: 2, openedAt: '2026-08-09' } });

    const after = await read(request, slug);
    const w2 = after.cohort.settings.workshops.find((w: any) => w.unlocksPhase === 2);
    // The rail is a record of when the workshop was actually held.
    expect(w2.openedAt).toBe('2026-08-01');
    for (const m of after.members) {
      expect(m.unlockedPhases.filter((p: number) => p === 2)).toHaveLength(1);
    }
  });

  test('editing the cadence cannot clear openedAt', async ({ request }) => {
    const { cohort } = await cohortWithMembers(request);
    const slug = cohort.coordinatorSlug;

    await request.patch(`/api/cohort/${slug}/open-workshop`, { data: { phase: 2, openedAt: '2026-08-03' } });
    const opened = await read(request, slug);

    // Exactly the shape a stale page sends: the whole array, openedAt null. It
    // used to be written verbatim — closing the workshop on the rail while
    // re-locking nobody, so orgs kept access to a workshop shown as closed.
    const stale = opened.cohort.settings.workshops.map((w: any) => ({
      name: w.name, date: w.date, unlocksPhase: w.unlocksPhase, openedAt: null,
    }));
    const res = await request.patch(`/api/cohort/${slug}/workshops`, { data: { workshops: stale } });
    expect(res.ok()).toBeTruthy();

    const after = await read(request, slug);
    const w2 = after.cohort.settings.workshops.find((w: any) => w.unlocksPhase === 2);
    expect(w2.openedAt, 'a cadence edit must not silently close a workshop').toBe('2026-08-03');
    // …and the edit itself still applied.
    expect(after.cohort.settings.workshops).toHaveLength(stale.length);
  });

  test('close-workshop still reverses both halves together', async ({ request }) => {
    const { cohort } = await cohortWithMembers(request);
    const slug = cohort.coordinatorSlug;

    await request.patch(`/api/cohort/${slug}/open-workshop`, { data: { phase: 2, openedAt: '2026-08-03' } });
    await request.patch(`/api/cohort/${slug}/close-workshop`, { data: { phase: 2 } });

    const after = await read(request, slug);
    const w2 = after.cohort.settings.workshops.find((w: any) => w.unlocksPhase === 2);
    expect(w2.openedAt).toBeNull();
    expect(after.members.every((m: any) => !m.unlockedPhases.includes(2))).toBe(true);
    // Phase 1 is open-on-invite by design and can never be taken away.
    expect(after.members.every((m: any) => m.unlockedPhases.includes(1))).toBe(true);
  });

  test('an invalid phase changes nothing', async ({ request }) => {
    const { cohort } = await cohortWithMembers(request);
    const slug = cohort.coordinatorSlug;
    for (const phase of [0, 8, 'x', null]) {
      const res = await request.patch(`/api/cohort/${slug}/open-workshop`, { data: { phase } });
      expect(res.status()).toBe(400);
    }
    const after = await read(request, slug);
    expect(after.members.every((m: any) => m.unlockedPhases.join() === '1')).toBe(true);
  });
});
