import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { readsAsStartNext } from '../server/services/cboNextEncontroGate';

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

// The whole point, from the organisation's side. Everything above is about two
// records agreeing; this is the only thing that matters to Maria: the encontro
// is open, her Encontro 2 is done, so the button is THERE. No coordinator
// action, nothing manual, nothing to press on the board first.

test.describe('the button appears on its own', () => {
  test.use({ locale: 'pt-BR' });

  test('W2 done + the encontro open = "Começar Encontro 3", with nobody doing anything', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');
    const cohort = (await api.createCohort(`Auto ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({
      email: `auto-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id,
    });

    // A row that missed the opening — the test invite route seeds [1] and never
    // inherits, which is exactly the shape that caused this.
    const m = (await api.inviteMember(cohort.id, {
      orgName: 'Maria', neighborhood: 'Sarandi', withSession: true,
    })).member;

    // Encontro 2 finished: intervention_site is phase 2's only section, so a
    // marked place is what makes phaseComplete(state, 2) true.
    await api.seedState(m.cboStateId, {
      phase: 2, language: 'pt',
      sections: [
        { sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' },
        { sectionId: 'intervention_site', field: 'site_name', value: 'Terreno ao lado da horta' },
        { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0906' },
        { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1726' },
        { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
      ],
    });

    // The coordination opens Encontro 3 for the cohort. That is the ONLY action.
    await request.patch(`/api/cohort/${cohort.coordinatorSlug}/open-workshop`, { data: { phase: 3 } });

    // Her own link, exactly as she opens it. Nothing is pressed on the board.
    await page.goto(`/cbo-profile?t=${m.capabilityToken}`);
    const enter = page.getByTestId('button-cbo-welcome-cta');
    await expect(enter).toBeVisible({ timeout: 30_000 });
    await enter.click();

    // ⚠️ The door has to be the NEXT encontro. Keyed off `state.phase` it was
    // the Encontro 2 preamble — the encontro she had just finished — and
    // pressing Começar reopened it. That was the whole "I say start and it
    // restarts W2".
    //
    // Asserted as "a way in", not as a particular widget: only E1 and E2 have
    // preambles today, so entering E3 lands in the chat with the unlocked
    // banner instead. Either is the guarantee; neither being there is the bug.
    await expect(page.getByTestId('button-encontro-2-start')).toHaveCount(0);
    const door = page.getByTestId('button-encontro-3-start')
      .or(page.getByTestId('button-start-encontro-3'));
    await expect(door).toBeVisible({ timeout: 30_000 });
    await door.click();

    // And she is in Encontro 3 — the phase moved server-side, so the agent's
    // next turn loads the E3 skill instead of walking her back through E2.
    await expect
      .poll(async () => (await (await request.get(`/api/cbo/${m.cboStateId}`)).json()).state?.phase, { timeout: 30_000 })
      .toBe(3);
  });
});

// Plan B, and the one that has to hold when the UI does not. The in-chat banner
// is suppressed while a question is open; the entry screen can be behind a
// stale render. Saying it must still work.

test.describe('saying it moves them on', () => {
  test('an explicit request to move on is recognised, in both languages', () => {
    for (const m of [
      'vamos começar o Encontro 3',
      'quero ir para o encontro 3',
      'podemos começar o proximo encontro?',
      "let's start Encontro 3",
      'can we move on',
    ]) {
      expect(readsAsStartNext(m, 2), m).toBe(true);
    }
  });

  test('talking ABOUT the next encontro is not asking to go there', () => {
    // The org describing what comes later, mid-Encontro-2, must not be yanked
    // out of the encontro it is in.
    for (const m of [
      'no encontro 3 a gente escolhe a solução, né?',
      'a coordenadora falou que o encontro 3 é em setembro',
      'ainda não terminamos aqui',
    ]) {
      expect(readsAsStartNext(m, 2), m).toBe(false);
    }
  });
});

// ⚠️ FINISHED, AND NOTHING ON SCREEN. An org that had done everything asked of
// it, with the next encontro not yet open, saw NOTHING — the banner returned
// null and the only thing left to talk to was a chat that walks back into the
// encontro it just closed. An honest wait is a state; a blank screen is an
// accident.

test.describe('a finished org that must wait is told so', () => {
  test.use({ locale: 'pt-BR' });

  test('the card says where they are, and one tap tells the coordination', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');
    const cohort = (await api.createCohort(`Wait ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({
      email: `wait-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id,
    });
    const m = (await api.inviteMember(cohort.id, {
      orgName: 'Prontas', neighborhood: 'Sarandi', withSession: true,
    })).member;
    // Encontro 2 done. Encontro 3 deliberately NOT opened.
    await api.seedState(m.cboStateId, {
      phase: 2, language: 'pt',
      sections: [
        { sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' },
        { sectionId: 'intervention_site', field: '_site_lat', value: '-30.09' },
        { sectionId: 'intervention_site', field: '_site_lng', value: '-51.17' },
      ],
    });

    await page.goto(`/cbo-profile?t=${m.capabilityToken}`);
    const enter = page.getByTestId('button-cbo-welcome-cta');
    await expect(enter).toBeVisible({ timeout: 30_000 });
    await enter.click();

    const card = page.getByTestId('cbo-waiting-for-coordination');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('Encontro 2 concluído');
    await expect(card).toContainText('ainda não foi aberto');

    await page.getByTestId('button-tell-coordination-ready').click();
    await expect(page.getByTestId('button-tell-coordination-ready')).toContainText('Avisamos');

    // And it lands where the coordination already looks, rather than in a place
    // only this card knows about.
    await expect.poll(async () => {
      // `request`, not `page.request` — the coordinator cookie lives on the
      // fixture context that created the coordinator.
      const r = await (await request.get(`/api/cohort/${cohort.coordinatorSlug}/support-requests?status=pending`)).json();
      return JSON.stringify(r).includes('prontas para o 3');
    }, { timeout: 20_000 }).toBe(true);
  });
});
