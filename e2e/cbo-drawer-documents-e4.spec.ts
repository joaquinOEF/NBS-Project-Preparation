import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// WHAT THE DOCUMENTOS TAB OFFERS AS AN ENCONTRO 3 RESULT (22 Sept audit).
//
// Encontro 3 ends at the comparison (#553). The Resumo do projeto and the hoja
// de ruta are built from project detailing — who builds, why here, how the place
// is today — so for an organisation that closed at the comparison they printed
// eleven blocks of "ainda não definido" while sitting beside the comparison as
// equals. They stay reachable, under "Para o Encontro 4"; a record that ran the
// old detailing tail keeps them where they were.

const TESTS = JSON.stringify([
  { solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 96, who: 'nos-com-parceiro', hardest: 'estudo', testedAt: '2026-09-22T12:00:00.000Z' },
  { solutionId: 'captacao-agua-da-chuva', reaction: 'faz-sentido', units: 5, who: 'nos', hardest: 'cuidar', testedAt: '2026-09-22T12:01:00.000Z' },
]);
const BASE = [
  { sectionId: 'intervention_site', field: 'bairro', value: 'Partenon' },
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0582' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1598' },
  { sectionId: 'intervention_type', field: 'solution_tests_json', value: TESTS },
  { sectionId: 'intervention_type', field: 'chosen_solutions', value: 'jardins-de-chuva,captacao-agua-da-chuva' },
  { sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' },
];

test.describe('the Documentos tab — the comparison is the Encontro 3 result', () => {
  test.use({ locale: 'pt-BR' });

  test('closed at the comparison: Resumo and hoja de ruta sit under "Para o Encontro 4"; after the old tail they do not', async ({ page }) => {
    test.setTimeout(120_000);
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Docs ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `docs-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });

    const compared = (await api.inviteMember(cohort.id, { orgName: 'Fechou na comparação', neighborhood: 'Partenon', withSession: true })).member;
    await api.seedState(compared.cboStateId, { phase: 3, language: 'pt', sections: BASE as any });
    const detailed = (await api.inviteMember(cohort.id, { orgName: 'Detalhou no rabo antigo', neighborhood: 'Partenon', withSession: true })).member;
    await api.seedState(detailed.cboStateId, {
      phase: 3, language: 'pt',
      sections: [...BASE, { sectionId: 'intervention_type', field: 'construction_model', value: 'mutirao' }, { sectionId: 'intervention_type', field: 'justification_why_here', value: 'O recreio foi suspenso seis dias em junho.' }] as any,
    });

    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);

    await page.getByTestId(`card-orchestrator-project-${compared.id}`).click({ timeout: 30_000 });
    await page.getByTestId('cbo-tab-documentos').click();
    await expect(page.getByTestId('cbo-doc-comparacao')).toBeVisible();
    await expect(page.getByTestId('cbo-doc-cenario?solution=jardins-de-chuva')).toBeVisible();
    const e4 = page.getByTestId('cbo-docs-e4');
    await expect(e4).toContainText('Para o Encontro 4');
    await expect(e4.getByTestId('cbo-doc-nota')).toBeVisible();
    await expect(e4.getByTestId('cbo-doc-rota')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByTestId(`card-orchestrator-project-${detailed.id}`).click({ timeout: 30_000 });
    await page.getByTestId('cbo-tab-documentos').click();
    await expect(page.getByTestId('cbo-doc-nota')).toBeVisible();
    await expect(page.getByTestId('cbo-docs-e4')).toHaveCount(0);
  });
});
