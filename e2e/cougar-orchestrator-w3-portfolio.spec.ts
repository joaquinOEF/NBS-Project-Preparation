import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// ⚠️ W3-FOUR-STATES.
//
// The 27 August meeting agreed a two-way split for the coordinator's view:
// known-feasible vs requires-expert-study. Four real W2 records broke it, and
// this spec is those four records on one board.
//
// Two columns cannot express them. Rounding "engineering-trivial but nobody
// wrote down that we may use the land" into "requires study" sends the
// coordination hunting for a técnico when what was needed was an email.
// Rounding it the other way tells an organisation to start building on land it
// has no claim to. And the org that chose two solutions has two answers.
//
// The four piles also route to four different people, which is the point of
// the board: needs_permission and needs_study are the COORDINATION's queue, and
// pooling the studies across a cohort is the one thing the programme can do
// that no single organisation can.

const ORGS = [
  {
    org: 'Horta Raízes', bairro: 'Sarandi', expect: 'needs_study',
    // Public land AND a rain garden. The rain garden's ficha names a soil
    // infiltration test, and a technical unknown outranks a paperwork one.
    sections: [
      { sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' },
      { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0906' },
      { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1726' },
      { sectionId: 'intervention_site', field: 'land_tenure', value: 'public-informal' },
      { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'jardins-de-chuva' },
    ],
  },
  {
    org: 'Cultural Vila Nova', bairro: 'Vila Nova', expect: 'needs_permission',
    // Planting needs no study. What is missing is a piece of paper.
    sections: [
      { sectionId: 'intervention_site', field: 'bairro', value: 'Vila Nova' },
      { sectionId: 'intervention_site', field: '_site_lat', value: '-30.1300' },
      { sectionId: 'intervention_site', field: '_site_lng', value: '-51.2200' },
      { sectionId: 'intervention_site', field: 'land_tenure', value: 'public-informal' },
      { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'hortas-urbanas' },
    ],
  },
  {
    org: 'Rede Partenon', bairro: 'Partenon', expect: 'ready',
    // Own land, a solution with no technical marker: nothing blocks it.
    sections: [
      { sectionId: 'intervention_site', field: 'bairro', value: 'Partenon' },
      { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0700' },
      { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1500' },
      { sectionId: 'intervention_site', field: 'land_tenure', value: 'private-owned' },
      { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'hortas-urbanas' },
    ],
  },
  {
    org: 'Encosta Viva', bairro: 'Glória', expect: 'needs_site',
    // Chose a solution and never marked a place. The board must say so rather
    // than filing it under whichever of the other three is nearest.
    sections: [
      { sectionId: 'intervention_site', field: 'bairro', value: 'Glória' },
      { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'grade-viva' },
    ],
  },
] as const;

test.describe('COUGAR — the W3 portfolio, in four piles', () => {
  test.use({ locale: 'pt-BR' });

  test('four real records land in four different piles', async ({ page }) => {
    test.setTimeout(120_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    const cohort = (await api.createCohort(`W3 ${randomUUID().slice(0, 8)}`)).cohort;
    await api.createCoordinator({
      email: `w3-${randomUUID()}@e2e.test`,
      password: 'pw-123456',
      cohortId: cohort.id,
    });

    const ids: Record<string, string> = {};
    for (const o of ORGS) {
      const member = (await api.inviteMember(cohort.id, {
        orgName: o.org, neighborhood: o.bairro, withSession: true,
      })).member;
      ids[o.expect] = member.id;
      await api.seedState(member.cboStateId, {
        phase: 3,
        language: 'pt',
        sections: o.sections as any,
      });
    }

    await page.goto('/orchestrator');
    const portfolio = page.getByTestId('w3-portfolio');
    await expect(portfolio).toBeVisible({ timeout: 30_000 });

    // One org in each pile — this is the assertion the two-state design cannot
    // satisfy, whichever two states it picks.
    for (const state of ['needs_site', 'needs_study', 'needs_permission', 'ready']) {
      const pile = page.getByTestId(`w3-pile-${state}`);
      await expect(pile, `${state} pile`).toBeVisible();
      await expect(pile).toContainText('1');
    }

    // And each org's own row carries its verdict, so the board and the card
    // cannot disagree.
    for (const o of ORGS) {
      const card = page.locator(`[data-testid="card-orchestrator-project-${ids[o.expect]}"]`);
      await expect(card.getByTestId(`w3-verdict-${ids[o.expect]}`)).toBeVisible();
    }
  });

  test('a cohort still in W2 shows no portfolio at all', async ({ page }) => {
    test.setTimeout(120_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    const cohort = (await api.createCohort(`W2only ${randomUUID().slice(0, 8)}`)).cohort;
    await api.createCoordinator({
      email: `w2only-${randomUUID()}@e2e.test`,
      password: 'pw-123456',
      cohortId: cohort.id,
    });
    const member = (await api.inviteMember(cohort.id, {
      orgName: 'Só no E2', neighborhood: 'Sarandi', withSession: true,
    })).member;
    await api.seedState(member.cboStateId, {
      phase: 2,
      language: 'pt',
      sections: [{ sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' }],
    });

    await page.goto('/orchestrator');
    await expect(
      page.locator(`[data-testid="card-orchestrator-project-${member.id}"]`),
    ).toBeVisible({ timeout: 30_000 });
    // An empty "0 pronto pra orçar" on a cohort that has not run W3 reads as a
    // failing programme rather than an unstarted workshop.
    await expect(page.getByTestId('w3-portfolio')).toHaveCount(0);
    await expect(page.getByTestId(`w3-verdict-${member.id}`)).toHaveCount(0);
  });
});
