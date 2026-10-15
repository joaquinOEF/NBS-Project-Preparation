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
    // The map: every place, numbered by its project.
    await expect(page.getByTestId('pf-map-pin')).toHaveCount(4);
    const mapBox = await page.getByTestId('preportfolio-map').boundingBox();
    expect(mapBox?.height, 'the map has room to be seen').toBeGreaterThan(200);
    if (process.env.DRAWER_SHOTS) await page.getByTestId('preportfolio-map').screenshot({ path: `${process.env.DRAWER_SHOTS}/preportfolio-map.png` });

    // Move COOP20 to the Morro da Cruz project: both cards recompute at once.
    const target = api0.groups.findIndex((g: any) => g.memberIds.includes(c.id));
    await page.getByTestId(`preportfolio-move-${b.id}`).selectOption(api0.groups[target].id);
    const moved = page.getByTestId(`preportfolio-group-${target}`);
    await expect(moved.getByTestId(`preportfolio-org-${b.id}`)).toBeVisible();
    await expect(moved).toContainText('água · encosta');
    await expect(page.getByTestId('preportfolio-saving')).toHaveText('rascunho salvo', { timeout: 10_000 });
    // Layer 3 lands once the board is still — keyed by the new member set.
    await expect(moved.getByTestId(`preportfolio-narrative-${target}`)).toBeVisible({ timeout: 15_000 });
    await expect(moved.getByTestId(`preportfolio-narrative-${target}`)).toContainText('Sem visita técnica registrada');
    if (process.env.DRAWER_SHOTS) await board.screenshot({ path: `${process.env.DRAWER_SHOTS}/preportfolio-board.png` });

    await page.reload();
    await page.getByTestId('view-projects').click();
    const after = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/preportfolio`)).json();
    expect(after.saved).toBe(true);
    expect(after.groups.find((g: any) => g.memberIds.includes(b.id)).memberIds).toContain(c.id);

    // Vila Flores's part, then "Confirmar arranjo": every group becomes a project.
    const gi = after.groups.findIndex((g: any) => g.memberIds.includes(c.id));
    await page.getByTestId(`preportfolio-title-${gi}`).fill('Encostas e quintais que seguram a chuva');
    await page.getByTestId(`preportfolio-story-${gi}`).locator('summary').click();
    await page.getByTestId(`preportfolio-story-${gi}`).locator('textarea').first().fill('As três organizações se conheceram no Encontro 2 e decidiram juntar as obras.');
    await page.getByTestId('preportfolio-confirm').click();
    await expect(page.getByTestId('preportfolio-confirm-msg')).toContainText('2 projetos criados, 0 atualizados');
    // A new suggestion after hand moves asks first — and what was written follows the members.
    page.once('dialog', d => d.accept());
    await page.getByTestId('pref-geo-0').click();
    await expect.poll(async () => page.locator('input[data-testid^="preportfolio-title-"]').evaluateAll(els => els.map(e => (e as HTMLInputElement).value)))
      .toContain('Encostas e quintais que seguram a chuva');
    const after2 = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/preportfolio`)).json();
    await expect.poll(async () => (await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/preportfolio`)).json()).groups.some((g: any) => g.story?.startsWith('As três organizações') && g.projectId), { timeout: 5000 }).toBe(true);
    void after2;
    for (let i = 0; i < 2; i++) await expect(page.locator(`[data-testid="preportfolio-card-${i}"]`)).toHaveCount(1);
    await page.getByTestId('pref-geo-0.5').click();
    const projects = (await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/projects`)).json()).projects;
    expect(projects.map((p: any) => p.title)).toContain('Encostas e quintais que seguram a chuva');
    // Confirming again updates, never duplicates.
    await page.getByTestId('preportfolio-confirm').click();
    await expect(page.getByTestId('preportfolio-confirm-msg')).toContainText('0 projetos criados, 2 atualizados');
    expect((await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/projects`)).json()).projects.length).toBe(2);

    // The plan readings ran in the background since the first load.
    await expect.poll(async () => {
      const b = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/preportfolio`)).json();
      return b.orgs.filter((o: any) => o.planLinks?.length).length;
    }, { timeout: 20_000 }).toBe(4);
    const html = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/preportfolio/print`)).text();
    expect(html).toContain('Conexões com os planos da cidade');
    // …and the board shows them once they have landed.
    await expect(page.getByTestId('preportfolio-plans-0')).toBeVisible({ timeout: 25_000 });
    // …and opens to the passages themselves, not a hover tooltip.
    await page.getByTestId('preportfolio-plans-0').click();
    const list = page.getByTestId('preportfolio-plans-list-0');
    await expect(list).toBeVisible();
    await expect(list.getByTestId('preportfolio-plan-link').first()).toContainText('“');
    expect(html).toContain('Pré-portfólio de projetos');
    expect(html).toContain('Encostas e quintais que seguram a chuva');
    expect(html, 'a map with numbered pins, on the cover and per project').toMatch(/class="ppin"/);
    expect(html).toContain('As três organizações se conheceram');
    expect(html).toMatch(/2<\/strong><span>projetos coletivos/);
    // The narratives for the arrangement now on screen land once the board settles.
    await expect.poll(async () => (await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/preportfolio/print`)).text()).includes('Por que juntas'), { timeout: 15_000 }).toBe(true);
    if (process.env.DRAWER_SHOTS) {
      await page.goto(`/api/cohort/${cohort.coordinatorSlug}/preportfolio/print`);
      await page.setViewportSize({ width: 820, height: 1160 });
      await page.screenshot({ path: `${process.env.DRAWER_SHOTS}/preportfolio-print.png`, fullPage: true });
    }
  });
});

test.describe('the pre-portfolio — narratives on an untouched board', () => {
  test('a narrative written before anyone saved the board still reaches the page', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Untouched ${tag}`)).cohort;
    await api.createCoordinator({ email: `pf-u-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    for (const [name, lat] of [['Ksa Rosa', '-30.0198'], ['COOP20', '-30.0201']] as const) {
      const m = (await api.inviteMember(cohort.id, { orgName: name, neighborhood: 'Floresta', withSession: true })).member;
      await api.seedState(m.cboStateId, { phase: 4, language: 'pt', sections: seedOrg(name, 'Floresta', lat, '-51.2032', 'alagamento', 'jardins-de-chuva') });
    }
    const board = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/preportfolio`)).json();
    expect(board.saved).toBe(false);
    const n = await (await page.request.post(`/api/cohort/${cohort.coordinatorSlug}/preportfolio/narrative`, { data: { memberIds: board.groups[0].memberIds } })).json();
    expect(n.narrative).toBeTruthy();
    const again = await (await page.request.post(`/api/cohort/${cohort.coordinatorSlug}/preportfolio/narrative`, { data: { memberIds: [...board.groups[0].memberIds].reverse() } })).json();
    expect(again.cached, 'same members, any order: the cache').toBe(true);
    expect(await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/preportfolio/print`)).text()).toContain('Por que juntas');
  });
});
