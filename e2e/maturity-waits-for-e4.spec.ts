import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { shownMaturity, METRICS_HELD_UNTIL_E4 } from '../shared/cbo-schema';

// THE PHASE-3 MATURITY METRICS WAIT FOR ENCONTRO 4 (22 Sept audit, JVP's call).
//
// problem_clarity reads why-here and the baseline; financial_thinking the
// recurring money — questions only the old detailing tail asked. A record from
// before #553 scored 15/15; one after scored 1/3 on problem clarity with three
// files about the problem in its Resumo. On a roster the room compares, that
// reads as a weak organisation. Until phase 4 the total leaves them out, and
// the drawer says so.

const S = (metric: string, score: 0 | 1 | 2 | 3) => ({ metric, score, justification: 'x' }) as any;

test.describe('phase-3 maturity waits for Encontro 4', () => {
  test('the rule: the four phase-3 metrics, held below phase 4 and counted from it', () => {
    expect([...METRICS_HELD_UNTIL_E4].sort()).toEqual(['climate_nbs_impact', 'financial_thinking', 'problem_clarity', 'solution_clarity']);
    const scores = [S('site_control', 3), S('community_anchoring', 2), S('problem_clarity', 1), S('financial_thinking', 3)];
    expect(shownMaturity({ phase: 3, maturityScores: scores })).toEqual({ scores: scores.slice(0, 2), total: 5, held: ['problem_clarity', 'financial_thinking'] });
    expect(shownMaturity({ phase: 4, maturityScores: scores })).toMatchObject({ total: 9, held: [] });
    expect(shownMaturity({ phase: 2, maturityScores: scores.slice(0, 2) })).toMatchObject({ total: 5, held: [] });
  });

  test('roster and drawer: an Encontro 3 org is compared without them, and the drawer says why', async ({ page }) => {
    test.setTimeout(120_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Mat ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `mat-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'No Encontro 3', neighborhood: 'Partenon', withSession: true })).member;
    await api.seedState(m.cboStateId, {
      phase: 3, language: 'pt',
      sections: [{ sectionId: 'intervention_site', field: 'bairro', value: 'Partenon' }],
      maturity: [{ metric: 'site_control', score: 3 }, { metric: 'community_anchoring', score: 2 }, { metric: 'problem_clarity', score: 1 }, { metric: 'financial_thinking', score: 3 }],
    });

    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    const card = page.getByTestId(`card-orchestrator-project-${m.id}`);
    await expect(card).toContainText('5/27', { timeout: 30_000 });
    await card.click();
    await page.getByTestId('cbo-tab-perfil').click();
    const held = page.getByTestId('cbo-maturity-held');
    await expect(held).toContainText('Encontro 4');
    await expect(page.getByTestId('cbo-files-drawer')).toContainText('5/27');
  });
});
