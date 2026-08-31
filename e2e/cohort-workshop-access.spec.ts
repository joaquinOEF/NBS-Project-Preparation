import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// ⚠️ OPEN-BUT-LOCKED. The coordinator's rail said "Encontro 3 · AO VIVO ·
// Realizado em 31 de ago", and an organisation that opened its own link was
// told "o coordenador vai abrir o acesso ao Encontro 3 em breve".
//
// Two different records back those two sentences. The rail reads
// `cohorts.settings.workshops[].openedAt`; the gate reads
// `cohort_members.unlockedPhases`. They are written together by
// /open-workshop, so they should never disagree — but once they do, the card
// stops offering "Abrir para o grupo" (it shows "Fechar encontro" instead), so
// there is no way to repair it from the board at all.
//
// These pin both writes and both orders of events.

test.describe('opening an encontro gives every organisation access', () => {
  const setup = async (request: any) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');
    const cohort = (await api.createCohort(`Access ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({
      email: `access-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id,
    });
    return { api, cohort, slug: cohort.coordinatorSlug };
  };

  const unlockedFor = async (request: any, token: string) =>
    (await (await request.get(`/api/cbo-member/by-token/${token}`)).json()).unlockedPhases as number[];

  test('a member invited BEFORE the opening is unlocked by it', async ({ request }) => {
    const { api, cohort, slug } = await setup(request);
    const m = (await api.inviteMember(cohort.id, { orgName: 'Antes', neighborhood: 'Floresta' })).member;
    expect(await unlockedFor(request, m.capabilityToken)).toEqual([1]);

    const r = await request.patch(`/api/cohort/${slug}/open-workshop`, { data: { phase: 3 } });
    expect(r.ok()).toBe(true);
    expect(await unlockedFor(request, m.capabilityToken)).toContain(3);
  });

  test('a member invited AFTER the opening inherits it', async ({ request }) => {
    // Through the REAL invite route, not the test helper — the helper always
    // seeds [1], and asserting against it proves nothing about what a
    // coordinator pressing "Convidar CBO" actually gets.
    const { slug } = await setup(request);
    await request.patch(`/api/cohort/${slug}/open-workshop`, { data: { phase: 2 } });
    await request.patch(`/api/cohort/${slug}/open-workshop`, { data: { phase: 3 } });
    const invited = await (await request.post(`/api/cohort/${slug}/invite`, {
      data: { orgName: 'Depois', neighborhood: 'Floresta' },
    })).json();
    // Otherwise the org joins a live cohort and is told to wait for a workshop
    // that is already running.
    expect(await unlockedFor(request, invited.member.capabilityToken)).toEqual([1, 2, 3]);
  });

  test('re-opening an already-open encontro repairs a member that missed it', async ({ request }) => {
    // The repair path. Whatever caused the drift — an interrupted write, a
    // member created by another route, a restore from before the opening —
    // running the opening again has to fix it without moving the recorded date.
    const { api, cohort, slug } = await setup(request);
    await request.patch(`/api/cohort/${slug}/open-workshop`, { data: { phase: 3, openedAt: '2026-08-31' } });
    const late = (await api.inviteMember(cohort.id, { orgName: 'Atrasada', neighborhood: 'Floresta' })).member;
    await request.patch(`/api/cohort/${slug}/unlock`, { data: { memberIds: [late.id], phase: 1 } });

    const again = await request.patch(`/api/cohort/${slug}/open-workshop`, { data: { phase: 3, openedAt: '2026-09-09' } });
    expect(again.ok()).toBe(true);
    expect(await unlockedFor(request, late.capabilityToken)).toContain(3);
    // The date is a record of when the encontro was held, not of the last time
    // someone pressed the button.
    const settings = (await (await request.get(`/api/cohort/${slug}`)).json()).cohort?.settings;
    const w3 = (settings?.workshops ?? []).find((w: any) => Number(w.unlocksPhase) === 3);
    expect(w3?.openedAt).toBe('2026-08-31');
  });
});

// The repair, without anybody pressing anything. A member row that missed the
// opening — created by another route, restored from before it, written by a
// build that predates the inherit-on-invite fix — is not a state a coordinator
// should have to notice, diagnose and fix in front of a room.

test.describe('an open encontro cannot leave an organisation locked out', () => {
  test('a member left behind is healed the moment it is read', async ({ request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');
    const cohort = (await api.createCohort(`Heal ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({
      email: `heal-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id,
    });

    // The test invite route seeds [1] and never inherits — which is exactly the
    // shape of the row that caused this, so it makes an honest fixture.
    const left = (await api.inviteMember(cohort.id, {
      orgName: 'Esquecida', neighborhood: 'Floresta', withSession: true,
    })).member;
    await request.patch(`/api/cohort/${cohort.coordinatorSlug}/open-workshop`, { data: { phase: 3 } });

    const payload = await (await request.get(`/api/cbo-member/by-token/${left.capabilityToken}`)).json();
    expect(payload.unlockedPhases, 'the org sees the encontro its board calls AO VIVO').toContain(3);
  });
});
