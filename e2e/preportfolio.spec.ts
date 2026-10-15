import { test, expect } from '@playwright/test';
import { portfolioOrg, suggestGroups, projectCard, distance, memberSetKey, DEFAULT_PREFS, type PortfolioOrg } from '../shared/preportfolio';
import { createEmptyCboState } from '../shared/cbo-schema';

// THE PRE-PORTFOLIO — layers 1 and 2 (shared/preportfolio.ts).
//
// What has to hold: an organisation's readiness says WHY; the suggestion is
// deterministic and follows the coordination's weighting; a framing theme
// groups the organisations that answer it first; projects are collective by
// default; a project card is pure arithmetic over its members, so a drag
// never waits.

const org = (id: string, over: Partial<PortfolioOrg>): PortfolioOrg => ({
  memberId: id, orgName: id.toUpperCase(), bairro: 'Floresta', lat: -30.02, lng: -51.20, families: ['flood'],
  solutionId: 'jardins-de-chuva', solutionLabel: 'Jardins de chuva', familiaId: 'aguas-pluviais',
  budget: { low: 40000, high: 70000 }, horizon: 'agora', horizonWhy: [], gaps: 0, visited: true, ...over,
});
// Two places in Floresta (water), two on the Morro da Cruz slope (~6 km away), one heat org near the first two.
const ORGS = [
  org('a', {}),
  org('b', { lat: -30.021, lng: -51.201 }),
  org('c', { bairro: 'Morro da Cruz', lat: -30.07, lng: -51.17, families: ['landslide'], familiaId: 'encostas-e-solo', solutionId: 'grade-viva', solutionLabel: 'Grade viva' }),
  org('d', { bairro: 'Morro da Cruz', lat: -30.071, lng: -51.171, families: ['landslide'], familiaId: 'encostas-e-solo', solutionId: 'muro-de-arrimo-verde', solutionLabel: 'Muro de arrimo verde', horizon: '1-ano', horizonWhy: ['estudo técnico e autorização'], budget: null }),
  org('e', { bairro: 'São Geraldo', lat: -30.015, lng: -51.205, families: ['heat'], familiaId: 'verde-urbano', solutionId: 'corredores-verdes', solutionLabel: 'Corredores verdes' }),
];

test.describe('the pre-portfolio — suggestion and cards', () => {
  test('readiness says why, from the record', () => {
    const s = createEmptyCboState('porto-alegre');
    const set = (sec: string, k: string, v: string) => { (s.sections as any)[sec].fields[k] = { value: v, confidence: 'high', source: 'user', userEdited: false }; };
    set('intervention_site', 'bairro', 'Floresta'); set('intervention_site', 'site_worry', 'alagamento'); set('intervention_site', 'land_tenure', 'private-owned');
    set('intervention_type', 'solution_tests_json', JSON.stringify([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 120, testedAt: 'x' }]));
    const o = portfolioOrg('m1', 'Ksa Rosa', s.sections);
    expect(o.solutionId).toBe('jardins-de-chuva');
    expect(o.horizon).toBe('1-ano');
    expect(o.horizonWhy).toContain('sem lugar marcado');
    set('intervention_site', '_site_lat', '-30.02'); set('intervention_site', '_site_lng', '-51.2');
    const placed = portfolioOrg('m1', 'Ksa Rosa', s.sections);
    expect(placed.horizon, 'a study and an approval run side by side: months, not a year').toBe('2-6-meses');
    expect(placed.horizonWhy.join(' ')).toMatch(/estudo técnico e autorização/);
    expect(placed.budget?.low).toBe(48000);
  });

  test('the weighting decides: geography groups neighbours, theme groups problems', () => {
    const geo = suggestGroups(ORGS, { ...DEFAULT_PREFS, geoWeight: 1, allowSingle: true });
    const withA = geo.find(g => g.memberIds.includes('a'))!;
    expect(withA.memberIds.sort(), 'the heat org next door joins on geography').toEqual(['a', 'b', 'e']);
    const theme = suggestGroups(ORGS, { ...DEFAULT_PREFS, geoWeight: 0, allowSingle: true });
    expect(theme.find(g => g.memberIds.includes('a'))!.memberIds.sort(), 'on theme, heat is its own').toEqual(['a', 'b']);
    expect(theme.find(g => g.memberIds.includes('c'))!.memberIds.sort()).toEqual(['c', 'd']);
  });

  test('deterministic, collective by default, with a reason per group', () => {
    const one = suggestGroups(ORGS, { ...DEFAULT_PREFS, geoWeight: 0 });
    const two = suggestGroups([...ORGS].reverse(), { ...DEFAULT_PREFS, geoWeight: 0 });
    expect(one.map(g => [...g.memberIds].sort().join())).toEqual(two.map(g => [...g.memberIds].sort().join()));
    expect(one.every(g => g.memberIds.length > 1), 'no single-org project unless allowed').toBe(true);
    expect(one.flatMap(g => g.memberIds).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    for (const g of one) expect(g.reason.length).toBeGreaterThan(5);
    expect(suggestGroups(ORGS, { ...DEFAULT_PREFS, geoWeight: 0, allowSingle: true }).some(g => g.memberIds.length === 1)).toBe(true);
  });

  test('a framing theme groups the organisations that answer it first', () => {
    const heat = suggestGroups(ORGS, { geoWeight: 1, theme: 'heat', allowSingle: true });
    expect(heat.find(g => g.memberIds.includes('e'))!.memberIds).toEqual(['e']);
  });

  test('a card is arithmetic: budget sum, the slowest sets the horizon, who is unpriced', () => {
    const card = projectCard(['c', 'd'], ORGS);
    expect(card.budget).toEqual({ low: 40000, high: 70000 });
    expect(card.unpriced).toEqual(['D']);
    expect(card.horizon).toBe('1-ano');
    expect(card.slowest).toEqual({ orgName: 'D', why: ['estudo técnico e autorização'] });
    expect(card.riskLabels).toEqual(['encosta']);
    expect(card.reason).toBe('Mesmo bairro (Morro da Cruz), o mesmo problema (encosta) e o mesmo tipo de solução');
    // Moving a card is just a different member list.
    const moved = projectCard(['a', 'b', 'd'], ORGS);
    expect(moved.riskLabels).toEqual(['água', 'encosta']);
    expect(memberSetKey(['b', 'a'])).toBe(memberSetKey(['a', 'b']));
  });

  test('distance stays within 0–1 whatever the weighting', () => {
    for (const w of [0, 0.3, 0.5, 1]) for (const a of ORGS) for (const b of ORGS) {
      const d = distance(a, b, { ...DEFAULT_PREFS, geoWeight: w });
      expect(d).toBeGreaterThanOrEqual(0); expect(d).toBeLessThanOrEqual(1);
    }
  });
});

import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

const seedOrg = (name: string, bairro: string, lat: string, lng: string, worry: string, solution: string, extra: Array<{ sectionId: string; field: string; value: string }> = []) => [
  { sectionId: 'org_profile', field: 'org_name', value: name },
  { sectionId: 'intervention_site', field: 'bairro', value: bairro },
  { sectionId: 'intervention_site', field: '_site_lat', value: lat },
  { sectionId: 'intervention_site', field: '_site_lng', value: lng },
  { sectionId: 'intervention_site', field: 'site_worry', value: worry },
  { sectionId: 'intervention_site', field: 'land_tenure', value: 'private-owned' },
  { sectionId: 'intervention_site', field: 'site_area_m2', value: '300' },
  { sectionId: 'intervention_type', field: 'solution_tests_json', value: JSON.stringify([{ solutionId: solution, reaction: 'faz-sentido', testedAt: 'x', ...(solution === 'corredores-verdes' ? { units: 20 } : {}) }]) },
  ...extra,
];

test.describe('the pre-portfolio — the board', () => {
  test.use({ locale: 'pt-BR' });

  test('a suggestion with reasons; a move recomputes the cards; the draft survives a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Portfolio ${tag}`)).cohort;
    await api.createCoordinator({ email: `pf-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const mk = async (name: string, bairro: string, sections: any[]) => {
      const m = (await api.inviteMember(cohort.id, { orgName: name, neighborhood: bairro, withSession: true })).member;
      await api.seedState(m.cboStateId, { phase: 4, language: 'pt', sections });
      return m;
    };
    const a = await mk('Ksa Rosa', 'Floresta', seedOrg('Ksa Rosa', 'Floresta', '-30.0198', '-51.2032', 'alagamento', 'jardins-de-chuva'));
    const b = await mk('COOP20', 'Floresta', seedOrg('COOP20', 'Floresta', '-30.0201', '-51.2040', 'alagamento', 'jardins-de-chuva'));
    const c = await mk('Morro Vivo', 'Morro da Cruz', seedOrg('Morro Vivo', 'Morro da Cruz', '-30.0700', '-51.1700', 'landslide', 'grade-viva'));
    const d = await mk('Encosta Verde', 'Morro da Cruz', seedOrg('Encosta Verde', 'Morro da Cruz', '-30.0710', '-51.1710', 'landslide', 'grade-viva'));

    const api0 = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/preportfolio`)).json();
    expect(api0.orgs.length).toBe(4);
    expect(api0.saved).toBe(false);
    const sets = api0.groups.map((g: any) => [...g.memberIds].sort().join('|')).sort();
    expect(sets).toEqual([[a.id, b.id].sort().join('|'), [c.id, d.id].sort().join('|')].sort());

    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    await page.getByTestId('view-projects').click();
    const board = page.getByTestId('preportfolio-board');
    await expect(board).toBeVisible({ timeout: 30_000 });
    await expect(board).toContainText('Mesmo bairro (Floresta)');
    await expect(page.getByTestId('preportfolio-totals')).toContainText('2 projetos');

    // Move COOP20 to the Morro da Cruz project: both cards recompute at once.
    const target = api0.groups.findIndex((g: any) => g.memberIds.includes(c.id));
    await page.getByTestId(`preportfolio-move-${b.id}`).selectOption(api0.groups[target].id);
    const moved = page.getByTestId(`preportfolio-group-${target}`);
    await expect(moved.getByTestId(`preportfolio-org-${b.id}`)).toBeVisible();
    await expect(moved).toContainText('água · encosta');
    await expect(page.getByTestId('preportfolio-saving')).toHaveText('rascunho salvo', { timeout: 10_000 });
    if (process.env.DRAWER_SHOTS) await board.screenshot({ path: `${process.env.DRAWER_SHOTS}/preportfolio-board.png` });

    await page.reload();
    await page.getByTestId('view-projects').click();
    const after = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/preportfolio`)).json();
    expect(after.saved).toBe(true);
    expect(after.groups.find((g: any) => g.memberIds.includes(b.id)).memberIds).toContain(c.id);
  });
});
