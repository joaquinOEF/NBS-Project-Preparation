import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// "SAIU DA REDE" — 22 Oct call (Aline): "Could we delete or hide SDV Reciclando
// (SAMA Center) and the Instituto de Estudos Culturais e Ambientais, given that
// they are no longer part of the network?" Hidden, not deleted: off the board,
// the counts and every analysis while the data terms are still being settled,
// and restorable as it was.

test.describe('Saiu da rede', () => {
  test.use({ locale: 'pt-BR' });

  test('leaves the board and every analysis, is listed apart, and comes back as it was', async ({ page }) => {
    test.setTimeout(120_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Rede ${tag}`)).cohort;
    await api.createCoordinator({ email: `rede-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const stays = (await api.inviteMember(cohort.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true })).member;
    const leaves = (await api.inviteMember(cohort.id, { orgName: 'SDV Reciclando (Centro SAMA)', neighborhood: 'Agronomia', withSession: true })).member;

    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    const card = page.getByTestId(`card-orchestrator-project-${leaves.id}`);
    await card.click({ timeout: 30_000 });
    await page.getByTestId(`button-left-network-${leaves.id}`).click();

    await expect(card).toHaveCount(0);
    await expect(page.getByTestId(`card-orchestrator-project-${stays.id}`)).toBeVisible();
    const apart = page.getByTestId('roster-left-network');
    await expect(apart).toContainText('Saíram da rede (1)');

    // Out of every analysis through the portfolio flag; the record is untouched.
    let mine: any = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}`)).json();
    expect(mine.members.map((m: any) => m.id)).toEqual([stays.id]);
    expect(mine.leftMembers.map((m: any) => m.id)).toEqual([leaves.id]);
    const raw: any = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/member/${leaves.id}/profile`)).json();
    expect(raw.profile, 'the record is kept').toBeTruthy();

    // Restored: back on the board, the portfolio flag as it was before (in).
    await apart.locator('summary').click();
    await page.getByTestId(`button-restore-network-${leaves.id}`).click();
    await expect(page.getByTestId(`card-orchestrator-project-${leaves.id}`)).toBeVisible();
    await expect(page.getByTestId('roster-left-network')).toHaveCount(0);
    mine = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}`)).json();
    expect(mine.members.find((m: any) => m.id === leaves.id).excludeFromPortfolio).toBe(false);
  });
});
