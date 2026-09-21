import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { buildOrgProfile, staticMapTiles } from '../shared/org-profile';
import { cboFieldLabel } from '../shared/cbo-field-catalog';
import { createEmptyCboState } from '../shared/cbo-schema';

// THE ORGANISATION'S PROFILE — everything it has shared so far, for a person.
//
// Vila Flores prints one per organisation for the 30 Sept convening and
// carries it on the technical visits. What has to hold: it is right at ANY
// stage (a section with nothing in it is absent, never an empty heading);
// every label is a person's word, never a field id; nothing an organisation
// answered is silently missing; the coordination's scores never print; the
// contact's email and phone never print; and it reads as a document.

const state = (fields: Array<[string, string, string]>) => {
  const s = createEmptyCboState('porto-alegre');
  for (const [sec, k, v] of fields) (s.sections as any)[sec].fields[k] = { value: v, confidence: 'high', source: 'user', userEdited: false };
  return s;
};
const E1: Array<[string, string, string]> = [
  ['org_profile', 'org_name', 'Ksa Rosa'], ['org_profile', 'contact_name', 'Marlene Souza'], ['org_profile', 'contact_email', 'marlene@ksarosa.org'],
  ['org_profile', 'mission_summary', 'Casa de cultura e horta comunitária no 4º Distrito.'], ['org_profile', 'main_activities', 'Oficinas, mutirões, horta'],
  ['org_profile', 'year_founded', '2016'], ['org_profile', 'legal_form', 'ngo'], ['org_profile', 'has_cnpj', 'yes'], ['org_profile', 'team_size', '6-15'],
  ['org_profile', 'groups_served', 'jovens, mulheres'], ['org_profile', 'nbs_experience', 'yes'],
];
const E2: Array<[string, string, string]> = [
  ['intervention_site', 'bairro', 'Floresta'], ['intervention_site', 'site_name', 'Voluntários da Pátria 1039'],
  ['intervention_site', '_site_lat', '-30.0198'], ['intervention_site', '_site_lng', '-51.2032'],
  ['intervention_site', 'current_use', 'paved'], ['intervention_site', 'land_tenure', 'private-owned'], ['intervention_site', 'site_worry', 'alagamento'],
  ['intervention_site', 'site_story', 'Quando chove forte a água entra pelo portão e fica dois dias no pátio.'],
  ['intervention_site', 'site_knowledge_depth', 'strong'], ['intervention_site', 'prior_collaboration', 'sim'],
  ['intervention_site', 'site_area_m2', '600'], ['intervention_site', '_bairro_flood_pct', '78'], ['intervention_site', '_bairro_heat_pct', '64'], ['intervention_site', '_bairro_landslide_pct', '6'],
];
const E3: Array<[string, string, string]> = [
  ['intervention_type', 'solution_tests_json', JSON.stringify([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', testedAt: '2026-09-15T12:00:00Z' }])],
  ['intervention_type', 'chosen_solutions', 'jardins-de-chuva'],
  ['intervention_type', 'technical_note', 'O pátio drena para a Rua Dona Alzira.'],
  ['intervention_type', 'justification_why_here', 'É o ponto mais baixo da quadra.'],
];

test.describe('the profile is right at any stage', () => {
  test('after Encontro 1: who they are, and nothing pretending to be a place', () => {
    const p = buildOrgProfile({ orgName: 'Ksa Rosa', neighborhood: 'Floresta', state: state(E1) });
    expect(p.stages).toEqual({ e1: true, e2: false, e3: false });
    expect(p.place).toBeNull();
    expect(p.tested).toEqual([]);
    expect(p.mission).toContain('Casa de cultura');
    expect(p.facts.map(f => f.label)).toContain('Fundação');
    expect(p.facts.find(f => f.field === 'legal_form')!.value).toBe('ONG / Associação');
  });

  test('after Encontro 2: the place, their words, the bairro risk — and our own reading of the record stays off', () => {
    const p = buildOrgProfile({ orgName: 'Ksa Rosa', state: state([...E1, ...E2]) });
    expect(p.stages).toEqual({ e1: true, e2: true, e3: false });
    expect(p.place!.name).toBe('Voluntários da Pátria 1039');
    expect(p.place!.story).toContain('entra pelo portão');
    expect(p.place!.risks).toEqual({ flood: 78, heat: 64, landslide: 6 });
    expect(p.place!.areaM2).toBe(600);
    expect(p.place!.facts.find(f => f.field === 'prior_collaboration')!.value).toBe('Sim');
    const everything = JSON.stringify(p);
    expect(everything, 'site_knowledge_depth is OUR reading, not something they said').not.toContain('Bem detalhado');
  });

  test('after Encontro 3: what they tested and the technical reading; an empty record says so', () => {
    const p = buildOrgProfile({ orgName: 'Ksa Rosa', state: state([...E1, ...E2, ...E3]) });
    expect(p.stages.e3).toBe(true);
    expect(p.tested.map(t => t.label)).toEqual(['Jardins de chuva']);
    expect(p.tested[0].cost, 'the band, not the paragraph of caveats').toMatch(/^Cerca de R\$ [\d.]+–R\$ [\d.]+ para 600 m²/);
    expect(p.tested[0].cost!.length).toBeLessThan(90);
    expect(p.technicalNote).toContain('Rua Dona Alzira');
    const empty = buildOrgProfile({ orgName: 'Coletivo Novo', state: null });
    expect(empty.stages).toEqual({ e1: false, e2: false, e3: false });
  });
});

test.describe('nothing silently missing, nothing that should not travel', () => {
  test('an answer the layout does not place still prints, under a person\'s label', () => {
    const p = buildOrgProfile({ orgName: 'Ksa Rosa', state: state([...E1, ...E2, ...E3, ['org_profile', 'online_presence', '@ksarosa no Instagram']]) });
    const also = p.alsoRecorded.flatMap(g => g.rows);
    expect(also.find(r => r.field === 'justification_why_here')!.label).toBe('Por que aqui');
    expect(also.find(r => r.field === 'online_presence')!.value).toBe('@ksarosa no Instagram');
    // …and what IS placed is not printed twice.
    expect(also.find(r => r.field === 'year_founded')).toBeUndefined();
    expect(also.find(r => r.field === 'site_story')).toBeUndefined();
  });

  test('contact details, private flags, machine JSON and the scores never reach the page', () => {
    const s = state([...E1, ...E2, ...E3]);
    s.maturityScores = [{ metric: 'site_control' as any, score: 2, justification: 'x' }];
    const text = JSON.stringify(buildOrgProfile({ orgName: 'Ksa Rosa', state: s }));
    expect(text).not.toContain('marlene@ksarosa.org');
    expect(text).not.toContain('_bairro_flood_pct');
    expect(text).not.toContain('solutionId\\"');
    expect(text).not.toMatch(/site_control|maturity/i);
  });

  test('every field the design places has a real label in both languages', () => {
    const placed = ['year_founded', 'legal_form', 'has_cnpj', 'team_size', 'paid_vs_volunteer', 'nbs_experience', 'funding_history', 'funded_project_count',
      'biggest_project_budget', 'prior_project_scale', 'groups_served', 'nbs_experience_detail', 'current_use', 'land_tenure', 'site_worry', 'nbs_interest',
      'role_preference', 'prior_collaboration', 'prior_collaboration_detail'];
    for (const k of placed) for (const lang of ['pt', 'en'] as const) {
      expect(cboFieldLabel(k, lang), `${k} (${lang}) prints as a humanised key`).not.toBe(k.replace(/_/g, ' '));
    }
  });

  test('the static map puts the pin inside the middle tile', () => {
    const m = staticMapTiles(-30.0198, -51.2032, 17);
    expect(m.tiles).toHaveLength(9);
    expect(m.pin.left).toBeGreaterThan(1 / 3); expect(m.pin.left).toBeLessThan(2 / 3);
    expect(m.pin.top).toBeGreaterThan(1 / 3); expect(m.pin.top).toBeLessThan(2 / 3);
  });
});

test.describe('the printed page', () => {
  test.use({ locale: 'pt-BR' });

  test('one organisation, the whole cohort, English on request — and only for the coordinator', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Perfis ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `perfil-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const seed = (rows: Array<[string, string, string]>) => rows.map(([sectionId, field, value]) => ({ sectionId, field, value }));
    const ksa = (await api.inviteMember(cohort.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true })).member;
    await api.seedState(ksa.cboStateId, { phase: 3, language: 'pt', sections: seed([...E1, ...E2, ...E3]) });
    const vit = (await api.inviteMember(cohort.id, { orgName: 'Associação Vitória', neighborhood: 'Ilha do Pavão', withSession: true })).member;
    await api.seedState(vit.cboStateId, { phase: 1, language: 'pt', sections: seed(E1.map(([s, k, v]) => [s, k, k === 'org_name' ? 'Associação Vitória' : v])) });

    const strip = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const one = await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/member/${ksa.id}/profile/print`);
    expect(one.ok()).toBe(true);
    const text = strip(await one.text());
    for (const s of ['Perfil da organização', 'Ksa Rosa', 'Quem somos', 'O lugar', 'Voluntários da Pátria 1039', 'Nas palavras da organização',
      'Risco climático no bairro', 'não são medições deste lugar', 'Soluções testadas no Encontro 3', 'Jardins de chuva', 'Leitura técnica da coordenação',
      'Anotações da visita', 'Fonte:', 'nos Encontros 1, 2, 3']) expect(text, s).toContain(s);
    // Written register; no ids; no contact details; no scores.
    expect(text).not.toMatch(/\bvocês\b/i);
    expect(text).not.toMatch(/jardins-de-chuva|private-owned|year founded|has cnpj|shared\/|server\//i);
    expect(text).not.toContain('marlene@ksarosa.org');

    // A record that stops at Encontro 1 has no place section and says which encontro it draws on.
    const e1 = strip(await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/member/${vit.id}/profile/print`)).text());
    expect(e1).toContain('no Encontro 1');
    expect(e1).not.toContain('O lugar');
    expect(e1).not.toContain('fichas técnicas');

    const en = strip(await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/member/${ksa.id}/profile/print?lang=en`)).text());
    expect(en).toContain('Organisation profile');
    expect(en).toContain('Visit notes');
    expect(en).toContain('Founded');

    // The batch: every organisation, alphabetical, one article each.
    const all = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/profiles`)).text();
    expect(all.match(/<article class="org">/g)).toHaveLength(2);
    expect(all.indexOf('Associação Vitória')).toBeLessThan(all.indexOf('Ksa Rosa'));

    // The drawer button and the batch link point at them.
    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    await expect(page.getByTestId('link-all-profiles')).toHaveAttribute('href', `/api/cohort/${cohort.coordinatorSlug}/profiles`, { timeout: 30_000 });
    await page.getByTestId(`card-orchestrator-project-${ksa.id}`).click();
    await expect(page.getByTestId('cbo-drawer-profile')).toHaveAttribute('href', `/api/cohort/${cohort.coordinatorSlug}/member/${ksa.id}/profile/print`);

    // Coordinator-only: no cookie, no page.
    const anon = await page.context().browser()!.newContext();
    const denied = await anon.request.get(`/api/cohort/${cohort.coordinatorSlug}/member/${ksa.id}/profile/print`);
    expect([401, 403]).toContain(denied.status());
    await anon.close();
  });
});
