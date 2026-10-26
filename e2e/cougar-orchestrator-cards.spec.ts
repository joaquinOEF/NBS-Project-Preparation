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

  test('the W2 read on the card is the worry; the rest is in the drawer', async ({ page }) => {
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

    // The journey card (refine 17 Oct, C2): of Encontro 1–2's signals only the
    // worry stays on the face. Detail level, collaboration and Teia live in
    // the drawer's Perfil — not on the card.
    for (const id of [`w2-depth-${member.id}`, `w2-collab-${member.id}`, `w2-teia-${member.id}`]) {
      await expect(page.getByTestId(id), id).toHaveCount(0);
    }
    // Where it stands, and who acts next.
    await expect(page.getByTestId(`journey-next-${member.id}`)).toContainText('Encontro 2');

    await page.locator(`[data-testid="card-orchestrator-project-${member.id}"]`)
      .screenshot({ path: 'test-results/orchestrator-card.png' });
  });

  test('tested solutions are Encontro 3, even when the close never ran and no place is marked', async ({ page }) => {
    // Ksa Rosa, prod 22 Oct 2026: four solutions tested on 30 Sep, "Pode
    // fechar" pressed three times, but the chat model ran the close itself —
    // no `_e3_closed`, no `_e2_closed` (no site). The board filed it under
    // "Ainda nos Encontros 1–2" with "Terminar o Encontro 2".
    test.setTimeout(120_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Cards ${randomUUID().slice(0, 8)}`)).cohort;
    await api.createCoordinator({ email: `cards-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const member = (await api.inviteMember(cohort.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true, unlockedPhases: [1, 2, 3, 4] })).member;
    await api.seedState(member.cboStateId, {
      phase: 3,
      language: 'pt',
      sections: [
        { sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' },
        { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
        { sectionId: 'intervention_type', field: 'solution_tests_json', value: JSON.stringify([
          { solutionId: 'captacao-agua-da-chuva', reaction: 'faz-sentido', testedAt: '2026-09-30T13:39:00Z' },
          { solutionId: 'compostagem', reaction: 'faz-sentido', testedAt: '2026-09-30T13:41:00Z' },
        ]) },
      ],
    });

    await page.goto('/orchestrator');
    await expect(page.getByTestId(`card-orchestrator-project-${member.id}`)).toBeVisible({ timeout: 30_000 });
    // The coordination acts next — the visit — not the organisation.
    await expect(page.getByTestId(`button-visit-${member.id}`)).toContainText('visita técnica');
    await expect(page.getByTestId(`journey-next-${member.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`journey-dots-${member.id}`)).toHaveAttribute('aria-label', /2/);
    await expect(page.getByTestId('roster-group-early').getByTestId(`card-orchestrator-project-${member.id}`)).toHaveCount(0);
  });

  test("⚠️ the REAL Ksa Rosa shape: first-era chosen_solutions, no tests list — past Encontro 2 from phase 3, not before", async ({ page }) => {
    // The spec above modelled Ksa Rosa with `solution_tests_json`; the prod
    // record (copy of 23 Oct) has none — only `chosen_solutions`, written by the
    // chat model on 30 Sep, one of them not in the catalogue. #600 therefore
    // never moved it (prod, 26 Oct 2026).
    test.setTimeout(120_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Cards ${randomUUID().slice(0, 8)}`)).cohort;
    await api.createCoordinator({ email: `cards-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const seed = async (orgName: string, phase: number) => {
      const m = (await api.inviteMember(cohort.id, { orgName, neighborhood: 'Floresta', withSession: true, unlockedPhases: [1, 2, 3, 4] })).member;
      await api.seedState(m.cboStateId, {
        phase,
        language: 'pt',
        sections: [
          { sectionId: 'intervention_site', field: 'bairro', value: 'Floresta' },
          { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'captacao-agua-da-chuva, compostagem, cozinha-comunitaria-biodigestor, aquecedor-solar' },
        ],
      });
      return m;
    };
    const ksa = await seed('Ksa Rosa', 3);
    const early = await seed('Ainda no Encontro 2', 2);

    await page.goto('/orchestrator');
    await expect(page.getByTestId(`card-orchestrator-project-${ksa.id}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`button-visit-${ksa.id}`)).toContainText('visita técnica');
    await expect(page.getByTestId('roster-group-early').getByTestId(`card-orchestrator-project-${ksa.id}`)).toHaveCount(0);
    // The same list at phase 2 does not move an organisation on.
    await expect(page.getByTestId('roster-group-early').getByTestId(`card-orchestrator-project-${early.id}`)).toBeVisible();
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
