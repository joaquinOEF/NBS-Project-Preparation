import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// The place lives in the record; the board's map reads the record.
//
// Vila Flores, prod 9–10 Nov 2026 (the REAL shape): the Encontro 2 map saved
// the member's site at (-30.0175, -51.2139), "Ponto marcado", reverse-geocoded
// as Rua Garça-Moura. In Encontro 4 the coordination typed "Rua São Carlos,
// 759", the chat geocoded it and wrote the record's pin (-30.0222, -51.2113)
// — the proposal moved, the coordinator's map did not, and nothing on the
// board could move it.
test.describe('the board reads the place from the record', () => {
  test('a pin corrected in Encontro 4 moves the board site; a record without a pin keeps the map one', async ({ page }) => {
    test.setTimeout(120_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Site ${randomUUID().slice(0, 8)}`)).cohort;
    await api.createCoordinator({ email: `site-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });

    const moved = (await api.inviteMember(cohort.id, { orgName: 'Vila Flores (cópia)', neighborhood: 'Floresta', withSession: true, unlockedPhases: [1, 2, 3, 4] })).member;
    const kept = (await api.inviteMember(cohort.id, { orgName: 'Só o mapa', neighborhood: 'Floresta', withSession: true, unlockedPhases: [1, 2] })).member;
    for (const m of [moved, kept]) {
      const put = await page.request.put(`/api/cbo-member/${m.memberSlug}/site`, { data: { name: 'Ponto marcado (-30.0175, -51.2139)', coordinates: [-30.017518846462046, -51.21393768715973] } });
      expect(put.ok()).toBe(true);
    }
    await api.seedState(moved.cboStateId, {
      phase: 4,
      language: 'pt',
      sections: [
        { sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' },
        { sectionId: 'intervention_site', field: 'site_name', value: 'Rua São Carlos, 759, bairro Floresta, Porto Alegre' },
        { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0222082' },
        { sectionId: 'intervention_site', field: '_site_lng', value: '-51.2112536' },
        { sectionId: 'intervention_site', field: '_site_from_address', value: 'yes' },
      ],
    });
    await api.seedState(kept.cboStateId, { phase: 2, language: 'pt', sections: [{ sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' }] });

    const slug = (await (await page.request.get('/api/cohort/mine')).json()).cohort.coordinatorSlug;
    const board = await (await page.request.get(`/api/cohort/${slug}`)).json();
    const site = (id: string) => board.members.find((m: any) => m.id === id)?.site;

    expect(site(moved.id).coordinates[0]).toBeCloseTo(-30.0222, 3);
    expect(site(moved.id).coordinates[1]).toBeCloseTo(-51.2113, 3);
    expect(site(moved.id).name).toBe('Rua São Carlos, 759, bairro Floresta, Porto Alegre');

    expect(site(kept.id).coordinates[0]).toBeCloseTo(-30.0175, 3);
    expect(site(kept.id).name).toBe('Ponto marcado (-30.0175, -51.2139)');

    // The organisation's own page reads the same place.
    const own = await (await page.request.get(`/api/cbo-member/${moved.memberSlug}`)).json();
    expect((own.site ?? own.member?.site).coordinates[0]).toBeCloseTo(-30.0222, 3);
  });
});

