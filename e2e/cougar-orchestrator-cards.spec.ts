import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// Backlog #25, from the COUGAR convening: "progress per city… we can add
// pictures of the site if they shared directly on the cards, file names if they
// shared, hazard they choose as priority".
//
// Refined with JVP: NOT a new cross-city screen — the existing per-cohort board
// with far richer cards, "compact but inline", so a coordinator reads an org
// without clicking. Plus stuck orgs rising to the top, which is what turns a
// roster into the thing that says who to call before the next convening.

test.describe('COUGAR — the coordinator reads an org without clicking', () => {
  test.use({ locale: 'pt-BR' });

  test('the W2 read is on the card: hazard, depth, Teia, collaboration', async ({ page }) => {
    test.setTimeout(120_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    const cohort = (await api.createCohort(`Cards ${randomUUID().slice(0, 8)}`)).cohort;
    await api.createCoordinator({
      email: `cards-${randomUUID()}@e2e.test`,
      password: 'pw-123456',
      cohortId: cohort.id,
    });
    const member = (await api.inviteMember(cohort.id, {
      orgName: 'Horta Raízes', neighborhood: 'Sarandi', withSession: true,
    })).member;

    await api.seedState(member.cboStateId, {
      phase: 2,
      language: 'pt',
      sections: [
        { sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' },
        // The mechanism they named, not the layer it scores against (#24).
        { sectionId: 'intervention_site', field: 'site_worry', value: 'inundacao,heat' },
        { sectionId: 'intervention_site', field: 'site_knowledge_depth', value: 'strong' },
        { sectionId: 'intervention_site', field: 'prior_collaboration', value: 'sim' },
      ],
    });

    await page.goto('/orchestrator');
    const card = page.locator(`[data-testid="card-orchestrator-project-${member.id}"]`);
    await expect(card).toBeVisible({ timeout: 30_000 });

    // Their word, in the coordinator's view — the same chip the org tapped, so
    // the roster and the org's own screen cannot say different things.
    const worry = page.getByTestId(`w2-worry-${member.id}`);
    await expect(worry).toBeVisible();
    await expect(worry).toContainText('Inundação');
    await expect(worry, 'a second worry is counted, not hidden').toContainText('+1');

    await expect(page.getByTestId(`w2-depth-${member.id}`)).toContainText('bem detalhado');
    await expect(page.getByTestId(`w2-collab-${member.id}`)).toBeVisible();
    // No Teia application uploaded → no chip. A card for an org that hasn't got
    // there must not sprout empty badges.
    await expect(page.getByTestId(`w2-teia-${member.id}`)).toHaveCount(0);

    await page.locator(`[data-testid="card-orchestrator-project-${member.id}"]`)
      .screenshot({ path: 'test-results/orchestrator-card.png' });
  });

  test('an org that has not started W2 shows no empty badges', async ({ page }) => {
    test.setTimeout(120_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    const cohort = (await api.createCohort(`Cards ${randomUUID().slice(0, 8)}`)).cohort;
    await api.createCoordinator({
      email: `cards-${randomUUID()}@e2e.test`,
      password: 'pw-123456',
      cohortId: cohort.id,
    });
    const member = (await api.inviteMember(cohort.id, {
      orgName: 'Sem Começar', neighborhood: 'Restinga', withSession: true,
    })).member;

    await page.goto('/orchestrator');
    await expect(page.locator(`[data-testid="card-orchestrator-project-${member.id}"]`))
      .toBeVisible({ timeout: 30_000 });

    for (const kind of ['worry', 'depth', 'teia', 'collab']) {
      await expect(page.getByTestId(`w2-${kind}-${member.id}`), `${kind} must stay absent`)
        .toHaveCount(0);
    }
    await expect(page.getByTestId(`doc-preview-${member.id}`)).toHaveCount(0);
  });
});
