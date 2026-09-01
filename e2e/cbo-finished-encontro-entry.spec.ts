import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// ⚠️ EVERY ORG THAT FINISHES ENCONTRO 2 LANDS ON THE ENCONTRO 2 DOOR.
//
// This state is not invented: it is lifted field-for-field from a coordinator's
// context export (`test aug 4 456`, Azenha, 1 Sept) — phase 2, unlockedPhases
// [1,2,3], Encontro 2 fully closed with every _done flag set. Access was never
// the problem for this organisation. The problem is that the entry screen picks
// its preamble from `state.phase`, and finishing an encontro does not move the
// phase, so it was shown "Encontro 2 — Seu território · Começar" and the only
// thing that offers Encontro 3 sits in the chat BEHIND that screen.
//
// Run against main before the fix this reports `banner=0 preambleE2=1`. That is
// systemic: it is true of every organisation that finishes an encontro, not of
// one unlucky row.
test.describe('an org that finished Encontro 2, from a real export', () => {
  test.use({ locale: 'pt-BR' });

  test('what an org in this exact state is offered', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env');
    const cohort = (await api.createCohort(`Real ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `real-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'test aug 4 456', neighborhood: 'Azenha', withSession: true })).member;

    await api.seedState(m.cboStateId, {
      phase: 2, language: 'pt',
      sections: [
        { sectionId: 'intervention_site', field: 'bairro', value: 'Azenha' },
        { sectionId: 'intervention_site', field: 'site_name', value: 'Praça Paulo Coelho' },
        { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0611' },
        { sectionId: 'intervention_site', field: '_site_lng', value: '-51.2113' },
        { sectionId: 'intervention_site', field: 'site_worry', value: 'heat, flood' },
        { sectionId: 'intervention_site', field: 'site_story', value: 'El problema en esta plaza es que no solo hace mucho calor porque no hay árboles, sino que pega el sol directo y hay bast' },
        { sectionId: 'intervention_site', field: 'land_tenure', value: 'public-informal' },
        { sectionId: 'intervention_site', field: 'current_use', value: 'vegetated' },
        { sectionId: 'intervention_site', field: 'nbs_interest', value: 'verde-urbano, aguas-pluviais' },
        { sectionId: 'intervention_site', field: 'role_preference', value: 'receber-administrar, executar' },
        { sectionId: 'intervention_site', field: 'site_knowledge_depth', value: 'strong' },
        { sectionId: 'intervention_site', field: '_site_confirmed', value: 'yes' },
        { sectionId: 'intervention_site', field: '_worry_done', value: 'yes' },
        { sectionId: 'intervention_site', field: '_story_done', value: 'yes' },
        { sectionId: 'intervention_site', field: '_photos_done', value: 'yes' },
        { sectionId: 'intervention_site', field: '_interest_done', value: 'yes' },
        { sectionId: 'intervention_site', field: '_role_done', value: 'yes' },
        { sectionId: 'intervention_site', field: '_check_done', value: 'yes' },      ],
      maturity: [{ metric: 'site_control', score: 2 }],
    });
    // The coordination opened Encontro 3, exactly as the export shows.
    await request.patch(`/api/cohort/${cohort.coordinatorSlug}/open-workshop`, { data: { phase: 3 } });
    // A closed W2 turn in the thread, so messages.length > 0.
    await request.post(`/__test/cbo/${m.cboStateId}/script`, {
      data: { turns: [[{ op: 'say', text: '✓ Pronto, Maria! Marcamos Praça Paulo Coelho. Até lá! 🌱' }]] },
    });

    await page.goto(`/cbo-profile?t=${m.capabilityToken}`);
    const cta = page.getByTestId('button-cbo-welcome-cta');
    await expect(cta).toBeVisible({ timeout: 30_000 });
    await cta.click();

    // The door it must NOT be: the encontro it just finished.
    await expect(page.getByTestId('button-encontro-2-start')).toHaveCount(0);
    // The door it must be — either the E3 preamble (once E3 has one) or the
    // in-chat banner. The guarantee is a way forward, not a given widget.
    await expect(
      page.getByTestId('button-encontro-3-start').or(page.getByTestId('button-start-encontro-3')),
    ).toBeVisible({ timeout: 30_000 });
  });
});
