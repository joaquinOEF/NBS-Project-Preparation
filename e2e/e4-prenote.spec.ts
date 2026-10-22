import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { buildPrenote, prenoteGaps, prenoteSolution, householdsFrom, editBasis, type PrenoteInput } from '../shared/e4-prenote';

// THE PRE-NOTE — Encontro 4's one page, mostly computed.
//
// What has to hold: the note is about ONE solution and says where the choice
// came from (the visit outranks the organisation's own pick, which outranks
// "the first that made sense"); every gap is one of the five questions and
// closes when answered; the budget's figures come from the fichas and are
// summed only where a figure exists; the page is written in the third person;
// the review is one optional stamp; a coordinator's rewrite holds until the
// answers under it change.

const TESTS = JSON.stringify([
  { solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 120, who: 'nos', hardest: 'custo', testedAt: '2026-09-15T12:00:00Z' },
  { solutionId: 'corredores-verdes', reaction: 'faz-sentido', units: 25, testedAt: '2026-09-15T12:05:00Z' },
]);
const BASE: PrenoteInput = {
  org: { org_name: 'Ksa Rosa' },
  site: { bairro: 'Floresta', site_name: 'Voluntários da Pátria 1039', site_worry: 'alagamento', site_story: 'Quando chove forte a água entra pelo portão.', land_tenure: 'private-owned', site_area_m2: '600' },
  type: { solution_tests_json: TESTS },
  ops: {},
};
const ANSWERED: PrenoteInput = {
  ...BASE,
  site: { ...BASE.site, beneficiaries_note: 'umas 40 famílias da rua de baixo' },
  type: { ...BASE.type, _e4_changes: 'alagamentos', construction_model: 'mutirao', e4_contribution: 'mutirão de 20 pessoas', e4_partners: 'a escola estadual' },
  ops: { who_maintains: 'nos' },
};

test.describe('the pre-note — pure', () => {
  test('one solution, and where the choice came from', () => {
    expect(prenoteSolution(BASE)).toMatchObject({ id: 'jardins-de-chuva', source: 'teste', areaM2: 120 });
    const visited = { ...BASE, type: { ...BASE.type, _visit_json: JSON.stringify({ solutionId: 'corredores-verdes', units: 30, recordedAt: 'x' }) } };
    expect(prenoteSolution(visited)).toMatchObject({ id: 'corredores-verdes', source: 'visita', units: 30 });
    // The visit with no size keeps the size it was tested at.
    const noSize = { ...BASE, type: { ...BASE.type, _visit_json: JSON.stringify({ solutionId: 'corredores-verdes', recordedAt: 'x' }) } };
    expect(prenoteSolution(noSize)).toMatchObject({ units: 25 });
    // What Encontro 4 confirmed outranks both.
    const confirmed = { ...visited, type: { ...visited.type, _e4_solution_json: JSON.stringify({ solutionId: 'jardins-de-chuva', source: 'organizacao', areaM2: 90 }) } };
    expect(prenoteSolution(confirmed)).toMatchObject({ id: 'jardins-de-chuva', source: 'organizacao', areaM2: 90 });
    // Nothing liked and no visit: no solution, and the page says so.
    const none = buildPrenote({ ...BASE, type: { solution_tests_json: JSON.stringify([{ solutionId: 'jardins-de-chuva', reaction: 'nao-e-pra-gente', testedAt: 'x' }]) } });
    expect(none.solution).toBeNull();
    expect(none.sections).toEqual([]);
  });

  test('the gaps are the five questions, and they close when answered', () => {
    expect(prenoteGaps(BASE)).toEqual(['beneficiarios', 'mudancas', 'quem-faz', 'contrapartida', 'parceiros']);
    expect(prenoteGaps(ANSWERED)).toEqual([]);
    // Who builds without who maintains is still the same open question.
    expect(prenoteGaps({ ...ANSWERED, ops: {} })).toEqual(['quem-faz']);
    const draft = buildPrenote(BASE);
    expect(draft.sections.find(s => s.id === 'problema')!.missing).toMatch(/quantas famílias/);
    expect(buildPrenote(ANSWERED).sections.every(s => !s.missing)).toBe(true);
  });

  test('the budget: four rows, figures from the fichas, a total only of what has one', () => {
    const p = buildPrenote(ANSWERED);
    expect(p.budget.map(b => b.label)).toEqual(['Implantação (120 m²)', 'Estudos e licenças', 'Manutenção no 1º ano', 'Contrapartida da organização']);
    expect(p.budget[0].value).toBe('R$ 48.000–R$ 84.000');
    expect(p.budget[3].value).toBe('mutirão de 20 pessoas');
    expect(p.total).toEqual({ low: 48000, high: 84000 });
    for (const b of p.budget) expect(b.source.length, b.label).toBeGreaterThan(3);
  });

  test('the household count becomes the people indicator\'s target', () => {
    expect(householdsFrom('umas 40 famílias da rua de baixo')).toBe(40);
    expect(householdsFrom('1.200 pessoas')).toBe(1200);
    expect(householdsFrom('não sei')).toBeNull();
    const ind = buildPrenote(ANSWERED).sections.find(s => s.id === 'indicadores')!;
    expect(ind.lines[0].text).toMatch(/Famílias atendidas\*\* — meta: 40 famílias/);
    expect(ind.lines.length).toBeGreaterThanOrEqual(2);
    expect(ind.lines.length).toBeLessThanOrEqual(4);
  });

  test('written in the third person; their words only inside quotation marks', () => {
    for (const input of [BASE, ANSWERED]) {
      for (const s of buildPrenote(input).sections) {
        for (const l of s.lines.filter(x => x.kind !== 'quote')) {
          expect(l.text, `${s.id}: ${l.text}`).not.toMatch(/\bvocês\b|\ba gente\b|\bseu\b|\bsua\b/i);
          expect(l.source.length, `${s.id} has a source`).toBeGreaterThan(2);
        }
      }
    }
  });

  test('open items carry what was hardest and what is still undecided', () => {
    const open = buildPrenote(BASE).sections.find(s => s.id === 'pendencias')!.lines.map(l => l.text).join(' ');
    expect(open).toMatch(/O que mais pega, segundo a organização: o custo/);
    expect(open).toMatch(/não passou pela visita técnica/);
  });

  test('a coordinator rewrite holds until the answers under it change', () => {
    const basis = editBasis(ANSWERED, 'problema');
    const edits = JSON.stringify({ problema: { text: 'Texto ajustado pela Vila Flores.', at: '2026-10-20T10:00:00Z', basis } });
    const edited = buildPrenote({ ...ANSWERED, type: { ...ANSWERED.type, _prenote_edits_json: edits } });
    const sec = edited.sections.find(s => s.id === 'problema')!;
    expect(sec.lines.map(l => l.text)).toEqual(['Texto ajustado pela Vila Flores.']);
    expect(sec.edited).toBeTruthy();
    // A new answer underneath: the computed text comes back.
    const changed = buildPrenote({ ...ANSWERED, site: { ...ANSWERED.site, beneficiaries_note: 'umas 60 famílias' }, type: { ...ANSWERED.type, _prenote_edits_json: edits } });
    expect(changed.sections.find(s => s.id === 'problema')!.edited).toBeUndefined();
  });

  test('the review is one optional stamp; until then the page says estimate', () => {
    expect(buildPrenote(ANSWERED).status).toBe('estimativa técnica');
    const r = buildPrenote({ ...ANSWERED, type: { ...ANSWERED.type, _prenote_review_json: JSON.stringify({ status: 'revisada', by: 'Robson', at: '2026-11-03T12:00:00Z' }) } });
    expect(r.status).toBe('revisada por Robson em 03/11/2026');
    const w = buildPrenote({ ...ANSWERED, type: { ...ANSWERED.type, _prenote_review_json: JSON.stringify({ status: 'dispensada', at: 'x' }) } });
    expect(w.status).toMatch(/dispensada/);
  });
});

test.describe('the pre-note — the coordinator side', () => {
  test.use({ locale: 'pt-BR' });

  test('print, review, edit — and the drawer shows it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Pre-nota ${tag}`)).cohort;
    await api.createCoordinator({ email: `prenote-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true })).member;
    const fields = [
      ...Object.entries(BASE.org!).map(([field, value]) => ({ sectionId: 'org_profile', field, value })),
      ...Object.entries(BASE.site).map(([field, value]) => ({ sectionId: 'intervention_site', field, value })),
      { sectionId: 'intervention_type', field: 'solution_tests_json', value: TESTS },
    ];
    await api.seedState(m.cboStateId, { phase: 3, language: 'pt', sections: fields });
    const base = `/api/cohort/${cohort.coordinatorSlug}/member/${m.id}`;

    const html = await (await page.request.get(`${base}/document/prenota`)).text();
    expect(html).toContain('Proposta inicial de projeto');
    expect(html).toContain('Jardins de chuva · Voluntários da Pátria 1039');
    expect(html).toContain('estimativa técnica');
    expect(html).toMatch(/Falta:<\/strong> dizer quem é atingido/);
    expect(html).toContain('R$ 48.000–R$ 84.000');

    expect((await page.request.patch(`${base}/prenote/review`, { data: { status: 'aprovada' } })).status()).toBe(400);
    const rv = await (await page.request.patch(`${base}/prenote/review`, { data: { status: 'revisada', by: 'Robson' } })).json();
    expect(rv.review).toMatchObject({ status: 'revisada', by: 'Robson' });
    expect((await (await page.request.get(`${base}/prenote`)).json()).prenote.status).toMatch(/^revisada por Robson/);

    expect((await page.request.patch(`${base}/prenote/edit`, { data: { section: 'resumo', text: 'x' } })).status()).toBe(400);
    const ed = await (await page.request.patch(`${base}/prenote/edit`, { data: { section: 'problema', text: 'Na rua de baixo, a água entra nas casas.' } })).json();
    expect(ed.prenote.sections.find((s: any) => s.id === 'problema').edited).toBeTruthy();
    expect(await (await page.request.get(`${base}/document/prenota`)).text()).toContain('ajustado pela coordenação');

    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    await page.getByTestId(`card-orchestrator-project-${m.id}`).click({ timeout: 30_000 });
    await page.getByTestId('cbo-tab-documentos').click();
    const panel = page.getByTestId('prenote-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('prenote-summary')).toContainText('faltam 5 respostas do Encontro 4');
    await expect(page.getByTestId('prenote-status')).toHaveText(/revisada por Robson/);
    await page.getByTestId('prenote-unreview').click();
    await expect(page.getByTestId('prenote-status')).toHaveText('estimativa técnica');
    if (process.env.DRAWER_SHOTS) await panel.screenshot({ path: `${process.env.DRAWER_SHOTS}/prenote-panel.png` });
    if (process.env.DRAWER_SHOTS) {
      await page.goto(`${base}/document/prenota`);
      await page.setViewportSize({ width: 820, height: 1160 });
      await page.screenshot({ path: `${process.env.DRAWER_SHOTS}/prenote-page.png`, fullPage: true });
    }
  });
});

// THE WHOLE RECORD (JVP, 15 Oct: "use as much context as possible"). The first
// pre-note printed what Encontro 4 asked and a few E2/E3 fields, and left out
// the visit reading, who the organisation is, the closing observations, what
// was written in the room, the bairro's data and the funding paths — all on
// the record. These pin that every one of them reaches the page, once, and
// attributed to whoever said it.
const RICH: PrenoteInput = {
  ...ANSWERED,
  org: { org_name: 'Ksa Rosa', mission_summary: 'Casa de cultura e horta comunitária no 4º Distrito.', team_size: '6-15', has_cnpj: 'yes', legal_form: 'ngo', year_founded: '2016', groups_served: 'jovens, mulheres', funding_history: 'yes' },
  site: { ...ANSWERED.site, bairro_population: '9500', bairro_poverty_pct: '12.4', _bairro_flood_pct: '88', site_notes: 'O vizinho de baixo também alaga.', contributing_area_note: 'Vem da rua de cima.', prior_collaboration_detail: 'COOP20' },
  type: { ...ANSWERED.type, technical_note: 'Solo argiloso; dreno de fundo obrigatório.', _visit_json: JSON.stringify({ solutionId: 'jardins-de-chuva', areaM2: 140, recordedAt: 'x' }), closing_observations: 'A direção só autoriza obra em janeiro.', project_notes: 'As mudas vêm do viveiro da associação.' },
  cohort: ['Três outras organizações do grupo precisam do mesmo teste de infiltração.'],
  photos: [{ src: '/api/documents/abc/original', caption: 'O pátio alagado depois da chuva de setembro.' }],
};

test.describe('the pre-note reads the whole record', () => {
  const p = buildPrenote(RICH);
  const text = (id: string) => p.sections.find(s => s.id === id)?.lines.map(l => `${l.text} [${l.source}]`).join('\n') ?? '';
  const all = p.sections.flatMap(s => s.lines.map(l => l.text)).join('\n');

  test('who the organisation is, and the territory, from Encontro 1 and the city data', () => {
    expect(p.sections[0].id).toBe('organizacao');
    expect(text('organizacao')).toMatch(/com CNPJ/);
    expect(text('organizacao')).toMatch(/Casa de cultura/);
    expect(text('organizacao')).toMatch(/9\.500 moradores/);
  });

  test("Robson's reading is the coordination's, never the organisation's", () => {
    expect(text('solucao')).toMatch(/Leitura técnica da coordenação:\*\* Solo argiloso.*\[visita técnica da coordenação\]/);
    expect(text('solucao')).not.toMatch(/Solo argiloso[^\n]*\[a organização/);
  });

  test('what was said in the room and at the close, and the notes, are on the page', () => {
    expect(all).toContain('A direção só autoriza obra em janeiro.');
    expect(all).toContain('As mudas vêm do viveiro da associação.');
    expect(all).toContain('O vizinho de baixo também alaga.');
    expect(all).toContain('Vem da rua de cima.');
    expect(text('parceiros')).toContain('Já trabalhou com: COOP20.');
  });

  test('the cohort counts and the funding paths — the specific ones, capped', () => {
    expect(text('financiamento')).toContain('Três outras organizações do grupo precisam do mesmo teste de infiltração.');
    const paths = p.sections.find(s => s.id === 'financiamento')!.lines.filter(l => l.text.startsWith('**'));
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.length).toBeLessThanOrEqual(4);
  });

  test('nothing printed twice', () => {
    const keys = p.sections.flatMap(s => s.lines.map(l => l.text.toLowerCase().replace(/[^a-z0-9à-ú]+/g, ' ').trim()));
    expect(keys.length).toBe(new Set(keys).size);
    expect(all.match(/40 famílias/g)?.length, 'the households once in the problem (and the indicator target)').toBeLessThanOrEqual(2);
  });

  test('the photo travels with its caption; the contribution is prefilled from the record until Encontro 4 answers', () => {
    expect(p.photo).toEqual(RICH.photos![0]);
    const bare = buildPrenote({ ...RICH, type: { ...RICH.type, e4_contribution: undefined } });
    const row = bare.budget.find(b => b.label === 'Contrapartida da organização')!;
    expect(row.value).toMatch(/terreno já em uso pela organização/);
    expect(row.source).toMatch(/a confirmar/);
  });

  test('a stored summary prints only if it survives the guards against these facts', () => {
    const good = JSON.stringify([{ section: 'resumo', paragraphs: [{ text: 'A Ksa Rosa propõe jardins de chuva no pátio da Voluntários da Pátria, no bairro Floresta, para segurar a água que hoje alaga o pátio.', sources: ['Encontros 2 e 3'] }] }]);
    expect(buildPrenote({ ...RICH, type: { ...RICH.type, _prenote_authored_json: good } }).summary.length).toBe(1);
    const invented = JSON.stringify([{ section: 'resumo', paragraphs: [{ text: 'O projeto atende 900 famílias e custa R$ 2 milhões.', sources: ['Encontros 2 e 3'] }] }]);
    expect(buildPrenote({ ...RICH, type: { ...RICH.type, _prenote_authored_json: invented } }).summary).toEqual([]);
  });
});
