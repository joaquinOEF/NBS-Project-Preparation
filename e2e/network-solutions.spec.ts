import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { TestApi } from './helpers/testApi';
import {
  proposeSolutionsTable, applyReview, crossAnalysis, crossForModel, matchSolutionName, matchOrgName, nameKey, splitItems, doubtsIn,
  type Grid, type PlatformSide,
} from '../shared/network-solutions';

// THE COORDINATION'S TABLE — read, confirmed, counted (shared/network-solutions.ts).
//
// Every organisation here is invented. This repository is public and the
// coordination's real spreadsheet is not ours to publish.

const MEMBERS = [
  { id: 'a', orgName: 'Associação Aurora' },
  { id: 'b', orgName: 'Coletivo Beira-Rio' },
  { id: 'c', orgName: 'CEA Morro Alto' },
  { id: 'd', orgName: 'Instituto Quatro Ventos' },
];

const ORGS: Grid = { name: 'Organizações', rows: [
  ['ORGANIZAÇÃO', 'O que a organização já tem', 'O que a organização quer implementar'],
  ['Associação Aurora', 'Cozinha Comunitária', 'Horta Urbana\nCaptação de água da chuva\nPavimento permeável'],
  ['Coletivo Beira Rio - Cultura e Território', 'Horta Urbana\nCisterna', 'Horta Urbana\n\u2060Composteira \nTeto verde \nBiodigestor '],
  ['Centro de Educação Ambiental do Bairro Morro Alto', '', ''],
  ['Instituto Quatro Ventos', 'Jardim de chuva', 'Canteiros pluviais\nSolo grampeado \nFossa ecológica\nCaptação água da chuva'],
] };
const RATINGS: Grid = { name: 'Técnicas', rows: [
  ['Grupo', 'SbN/Técnica', 'Redução do Risco', '', ''],
  ['', '', 'Alagamento', 'Calor', 'Deslizamento'],
  ['Agricultura Urbana', 'Hortas Urbanas', 'Fraca', 'Fraca', '—'],
  ['Agricultura Urbana', 'Compostagem', 'Fraca', '—', '—'],
  ['Gestão de Águas pluviais', 'Captação de Água da Chuva', 'Fraca', 'Fraca', '—'],
  ['Gestão de Águas pluviais', 'Jardins de Chuva', 'Forte', 'Fraca', 'Fraca'],
  ['Gestão de Águas pluviais', 'Canteiro Pluvial', 'Média', 'Fraca', '—'],
  ['Gestão de Águas pluviais', 'Pavimentos Permeáveis', 'Média', 'Fraca', '—'],
  ['Gestão de Águas pluviais', 'Biovaletas', 'Forte', 'Fraca', 'Fraca'],
  ['Infraestrutura Verde Urbana', 'Teto Verde', 'Média', 'Forte', '—'],
  ['Estabilização de encostas', 'Solo grampeado verde', 'Fraca', '—', 'Forte'],
] };

const side = (over: Partial<PlatformSide> & { memberId: string; orgName: string }): PlatformSide => ({
  bairro: null, kept: [], considering: [], discarded: [], visit: null, hazard: {}, guaibaCotaM: null, started: true, ...over,
});
const PLATFORM: PlatformSide[] = [
  side({ memberId: 'a', orgName: 'Associação Aurora', kept: ['hortas-urbanas', 'compostagem'], discarded: ['biovaletas'], visit: 'canteiro-pluvial',
         hazard: { heat: { level: 4, pt: 'muito alta' } }, guaibaCotaM: 2.9 }),
  side({ memberId: 'b', orgName: 'Coletivo Beira-Rio', discarded: ['teto-verde'], hazard: { heat: { level: 3, pt: 'alta' }, flood: { level: 1, pt: 'baixa' } }, guaibaCotaM: 5.8 }),
  side({ memberId: 'c', orgName: 'CEA Morro Alto', started: true }),
  side({ memberId: 'd', orgName: 'Instituto Quatro Ventos', hazard: { landslide: { level: 3, pt: 'alta' } } }),
];

test.describe('reading names', () => {
  test('plural, accents and filler words do not make a different solution', () => {
    expect(nameKey('Canteiros pluviais')).toBe(nameKey('Canteiro Pluvial'));
    expect(nameKey('Captação da água da chuva')).toBe(nameKey('Captação água da chuva'));
    expect(matchSolutionName('Horta Urbana')).toEqual({ solutionId: 'hortas-urbanas', how: 'spelling' });
    expect(matchSolutionName('Pavimento permeável').solutionId).toBe('pavimentos-permeaveis');
    expect(matchSolutionName('Jardim de chuva').solutionId).toBe('jardins-de-chuva');
    expect(matchSolutionName('Teto Verde')).toEqual({ solutionId: 'teto-verde', how: 'exact' });
  });

  test('a known other name is a synonym, and says so', () => {
    expect(matchSolutionName('Cisterna')).toEqual({ solutionId: 'captacao-agua-da-chuva', how: 'synonym' });
    expect(matchSolutionName('Composteira').how).toBe('synonym');
  });

  test('one name inside another is a doubt for a person, never a silent match', () => {
    expect(matchSolutionName('Solo grampeado')).toEqual({ solutionId: 'solo-grampeado-verde', how: 'similar' });
    // …and a single word is not enough to be even that.
    expect(matchSolutionName('Biodigestor')).toEqual({ solutionId: null, how: 'outside' });
    expect(matchSolutionName('Fossa ecológica').solutionId).toBeNull();
  });

  test('an organisation is found under a longer or shorter name, and never guessed between two', () => {
    expect(matchOrgName('Centro de Educação Ambiental do Bairro Morro Alto', MEMBERS)).toBe('c');
    expect(matchOrgName('Coletivo Beira Rio - Cultura e Território', MEMBERS)).toBe('b');
    expect(matchOrgName('Uma organização que não existe', MEMBERS)).toBeNull();
    expect(matchOrgName('Aurora', [...MEMBERS, { id: 'z', orgName: 'Aurora' }])).toBeNull();
  });

  test('a cell lists one thing per line, or separated by ; and ,', () => {
    expect(splitItems('Horta Urbana\n\u2060Composteira \nCaptação de água da chuva:')).toEqual(['Horta Urbana', 'Composteira', 'Captação de água da chuva']);
    expect(splitItems('Teto verde; Biovaleta, Horta')).toEqual(['Teto verde', 'Biovaleta', 'Horta']);
  });
});

test.describe('the proposal', () => {
  const t = proposeSolutionsTable([ORGS, RATINGS], MEMBERS)!;

  test('finds the organisations, what each has and wants, and the ratings', () => {
    expect(t.orgs.map(o => o.memberId)).toEqual(['a', 'b', 'c', 'd']);
    expect(t.orgs[1].has).toEqual([nameKey('Horta Urbana'), nameKey('Cisterna')]);
    expect(t.orgs[0].wants).toHaveLength(3);
    expect(t.ratings.find(r => r.key === nameKey('Teto Verde'))).toMatchObject({ flood: 2, heat: 3, landslide: 0 });
    expect(t.confirmedAt).toBeNull();
  });

  test('counts what a person should look at before confirming', () => {
    // similar: Solo grampeado · outside: Cozinha comunitária, Biodigestor, Fossa ecológica
    expect(doubtsIn(t)).toBe(4);
  });

  test('a file that is not such a table is not forced into one', () => {
    expect(proposeSolutionsTable([{ name: 'Ata', rows: [['Reunião de 12/11'], ['Presentes: todos'], ['Pauta: orçamento']] }], MEMBERS)).toBeNull();
  });

  test('the review changes the mapping and nothing else', () => {
    const r = applyReview(t, {
      orgs: [{ sheetName: 'Instituto Quatro Ventos', memberId: 'nope' }],
      names: [{ key: nameKey('Biodigestor'), familiaId: 'agricultura-urbana' }, { key: nameKey('Fossa ecológica'), ignore: true }, { key: nameKey('Solo grampeado'), solutionId: null }],
    }, new Set(MEMBERS.map(m => m.id)));
    expect(r.orgs[3].memberId).toBeNull();
    expect(r.orgs[3].wants).toEqual(t.orgs[3].wants);
    expect(r.names.find(n => n.typed === 'Biodigestor')!.familiaId).toBe('agricultura-urbana');
    expect(r.names.find(n => n.typed === 'Fossa ecológica')!.ignore).toBe(true);
    expect(r.names.find(n => n.typed.startsWith('Solo'))).toMatchObject({ solutionId: null, how: 'outside' });
  });
});

test.describe('the cross', () => {
  const t = proposeSolutionsTable([ORGS, RATINGS], MEMBERS)!;
  const c = crossAnalysis(t, PLATFORM, { name: 'Orgs e técnicas.xlsx', date: '2026-11-19' });
  const item = (name: string) => c.items.find(i => i.name === name)!;

  test('two spellings of one solution are one item, counted once per organisation', () => {
    const cap = c.bySolution.find(s => s.id === 'captacao-agua-da-chuva')!;
    expect(cap.hasBy).toEqual(['b']);          // "Cisterna"
    expect(cap.wantBy).toEqual(['a', 'd']);    // two spellings
    expect(c.items.filter(i => i.id === 'captacao-agua-da-chuva')).toHaveLength(1);
  });

  test('an item outside the catalogue is kept, marked, and unrated', () => {
    expect(item('Biodigestor')).toMatchObject({ outside: true, rating: null });
    expect(item('Fossa ecológica').familiaId).toBeNull();
    expect(c.families.at(-1)).toMatchObject({ id: null, labelPt: 'Fora das famílias' });
  });

  test('an organisation with an empty row is named as absent, not dropped', () => {
    expect(c.orgs.map(o => o.memberId)).toEqual(['a', 'b', 'd']);
    expect(c.absent.map(a => a.name)).toEqual(['CEA Morro Alto']);
  });

  test('family totals count organisations, not items', () => {
    const agri = c.families.find(f => f.id === 'agricultura-urbana')!;
    expect(agri).toMatchObject({ have: 2, want: 2 });
  });

  test('the file and the platform are shown side by side, with what is worth a look', () => {
    const a = c.versus.find(v => v.memberId === 'a')!;
    expect(a.both).toEqual(['hortas-urbanas']);
    expect(a.platformOnly.sort()).toEqual(['canteiro-pluvial', 'compostagem']);
    expect(a.lookPt.join(' ')).toContain('não consta na lista do que a organização quer');
    const b = c.versus.find(v => v.memberId === 'b')!;
    expect(b.lookPt[0]).toContain('“não é pra gente”');
  });

  test('risk: a high hazard with nothing above weak on the list is a gap', () => {
    const cell = (m: string, h: string) => c.risk.find(r => r.memberId === m)!.cells.find(x => x.hazard === h)!;
    expect(cell('a', 'heat')).toMatchObject({ state: 'gap', best: 1 });
    // No official flood reading, inside a Guaíba mark below the 2024 level: exposed.
    expect(cell('a', 'flood')).toMatchObject({ state: 'part', best: 2, sitePt: null });
    // An official reading wins over the mark; a mark above the 2024 level is not exposure.
    expect(cell('b', 'flood').state).toBe('na');
    expect(cell('b', 'heat')).toMatchObject({ state: 'ok', best: 3 });
    expect(cell('d', 'landslide')).toMatchObject({ state: 'ok', by: ['solo-grampeado-verde'] });
  });

  test('the reading is computed from the counts', () => {
    const wishes = c.orgs.reduce((n, o) => n + o.wants.length, 0);
    expect(c.readingPt[0]).toContain(`Dos ${wishes} desejos`);
    expect(c.readingPt.join(' ')).toContain('Associação Aurora');
  });

  test('the suggestion never offers what an organisation already rejected', () => {
    const forA = c.suggestion!.perOrgPt.filter(l => l.startsWith('Associação Aurora'));
    expect(forA.join(' ')).toContain('jardins de chuva');
    expect(forA.join(' ')).not.toContain('biovaletas');
  });

  test('without a ratings sheet there is no risk table and no reading', () => {
    const plain = crossAnalysis(proposeSolutionsTable([ORGS], MEMBERS)!, PLATFORM, { name: 'x.xlsx' });
    expect(plain.hasRatings).toBe(false);
    expect(plain.risk).toEqual([]);
    expect(plain.readingPt).toEqual([]);
    expect(plain.suggestion).toBeNull();
    expect(plain.orgs).toHaveLength(3);
  });

  test('a row the review left without an organisation is reported, not counted', () => {
    const r = applyReview(t, { orgs: [{ sheetName: 'Instituto Quatro Ventos', memberId: null }] }, new Set(MEMBERS.map(m => m.id)));
    const x = crossAnalysis(r, PLATFORM, { name: 'x.xlsx' });
    expect(x.unmatchedRows).toEqual(['Instituto Quatro Ventos']);
    expect(x.orgs.map(o => o.memberId)).toEqual(['a', 'b']);
  });

  test('the narrative pass is handed counted facts that carry their source', () => {
    const lines = crossForModel(c, id => PLATFORM.find(p => p.memberId === id)!.orgName).join('\n');
    expect(lines).toContain('ARQUIVO DA COORDENAÇÃO — Orgs e técnicas.xlsx');
    expect(lines).toContain('segundo a planilha da coordenação');
    expect(lines).toContain('Associação Aurora: já tem');
    expect(lines).not.toMatch(/captacao-agua-da-chuva|x:/);
  });
});

// ── through the product: upload → confirm → report ───────────────────────────


async function workbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const g of [ORGS, RATINGS]) { const ws = wb.addWorksheet(g.name); for (const r of g.rows) ws.addRow(r); }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test.describe("the coordination's file reaches the report only once confirmed", () => {
  test.use({ locale: 'pt-BR' });

  test('upload, check, confirm, run, print', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    const cohort = (await api.createCohort(`Rede ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `rede-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const slug = cohort.coordinatorSlug;
    for (const m of MEMBERS) {
      const member = (await api.inviteMember(cohort.id, { orgName: m.orgName, neighborhood: 'Centro', withSession: true })).member;
      await api.seedState(member.cboStateId, { phase: 3, language: 'pt', sections: [
        { sectionId: 'intervention_site', field: 'bairro', value: 'Centro' },
        { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
      ] });
    }
    const run = async () => {
      const started = (await (await page.request.post(`/api/cohort/${cohort.id}/synergies`, { data: {} })).json()).id;
      await expect.poll(async () => {
        const r = await (await page.request.get(`/api/cohort/${cohort.id}/synergies`)).json();
        return r.id === started ? r.status : 'waiting';
      }, { timeout: 60_000 }).toBe('done');
      return (await (await page.request.get(`/api/cohort/${cohort.id}/synergies`)).json()).report;
    };

    // A file with no table is context, and says so.
    const note = await page.request.post(`/api/cohort/${slug}/network-files`, {
      multipart: { file: { name: 'ata-do-encontro.txt', mimeType: 'text/plain', buffer: Buffer.from('Ata do encontro presencial. As organizações pediram uma formação sobre captação de água.') } },
    });
    expect((await note.json()).file.table).toBeNull();

    // The spreadsheet is proposed, never counted on upload.
    const up = await page.request.post(`/api/cohort/${slug}/network-files`, {
      multipart: { file: { name: 'orgs-e-tecnicas.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await workbook() } },
    });
    expect(up.ok()).toBe(true);
    const file = (await up.json()).file;
    expect(file.table).toMatchObject({ orgs: 3, hasRatings: true, doubts: 4, confirmedAt: null });

    const unconfirmed = await run();
    expect(unconfirmed.outside).toBeNull();
    expect(unconfirmed.inputs.files.map((f: any) => f.use).sort()).toEqual(['context', 'unconfirmed']);

    // The review: one doubtful name answered, then confirmed.
    const review = await (await page.request.get(`/api/cohort/${slug}/network-files/${file.id}/table`)).json();
    expect(review.members).toHaveLength(MEMBERS.length);
    expect(review.solutions.length).toBeGreaterThan(20);
    const put = await page.request.put(`/api/cohort/${slug}/network-files/${file.id}/table`, {
      data: { names: [{ key: nameKey('Biodigestor'), solutionId: null, familiaId: 'agricultura-urbana' }] },
    });
    expect((await put.json()).file.table.confirmedAt).toBeTruthy();

    const report = await run();
    expect(report.inputs.files.find((f: any) => f.name === 'orgs-e-tecnicas.xlsx').use).toBe('table');
    expect(report.outside.orgs.map((o: any) => o.name).sort()).toEqual(['Associação Aurora', 'Coletivo Beira-Rio', 'Instituto Quatro Ventos']);
    expect(report.outside.absent.map((a: any) => a.name)).toEqual(['CEA Morro Alto']);
    expect(report.outside.items.find((i: any) => i.name === 'Biodigestor').familiaId).toBe('agricultura-urbana');
    // What the report already was is still there.
    expect(report.analysis.members).toHaveLength(MEMBERS.length);

    const html = await (await page.request.get(`/api/cohort/${cohort.id}/synergies/print`)).text();
    for (const s of ['Acrescentado pela coordenação', 'Organizações por família de solução', 'Quer mais', 'Solução por solução', 'lado a lado', 'Como o arquivo foi lido', 'A Rede num relance', 'Lacunas e cuidados com os dados']) {
      expect(html, s).toContain(s);
    }

    // A file named in the request is the only one used; none named means none.
    const none = (await (await page.request.post(`/api/cohort/${cohort.id}/synergies`, { data: { fileIds: [] } })).json()).id;
    await expect.poll(async () => { const r = await (await page.request.get(`/api/cohort/${cohort.id}/synergies`)).json(); return r.id === none ? r.status : 'waiting'; }, { timeout: 60_000 }).toBe('done');
    expect((await (await page.request.get(`/api/cohort/${cohort.id}/synergies`)).json()).report.outside ?? null).toBeNull();

    // On the coordinator's screen, with the projects.
    await page.goto('/orchestrator');
    await page.getByTestId('view-projects').click();
    await expect(page.getByTestId('network-file').filter({ hasText: 'orgs-e-tecnicas.xlsx' })).toHaveAttribute('data-state', 'confirmed');
    await page.getByTestId('network-file-review-open').click();
    await expect(page.getByTestId('review-name').filter({ hasText: 'Fossa ecológica' })).toHaveAttribute('data-how', 'outside');

    // A newer version of the same file replaces it and must be confirmed again.
    const again = await (await page.request.post(`/api/cohort/${slug}/network-files`, {
      multipart: { file: { name: 'orgs-e-tecnicas.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await workbook() } },
    })).json();
    expect(again.replaced).toBe(1);
    expect(again.file.table.confirmedAt).toBeNull();
    // …keeping what was already decided about its names.
    const kept = await (await page.request.get(`/api/cohort/${slug}/network-files/${again.file.id}/table`)).json();
    expect(kept.table.names.find((n: any) => n.typed === 'Biodigestor').familiaId).toBe('agricultura-urbana');
    const list = await (await page.request.get(`/api/cohort/${slug}/network-files`)).json();
    expect(list.files.filter((f: any) => f.filename === 'orgs-e-tecnicas.xlsx')).toHaveLength(1);
  });

  test("another network's coordinator cannot reach the files", async ({ page, browser }) => {
    const api = new TestApi(page.request);
    const mine = (await api.createCohort(`Rede A ${randomUUID().slice(0, 6)}`)).cohort;
    const theirs = (await api.createCohort(`Rede B ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `a-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: mine.id });
    expect((await page.request.get(`/api/cohort/${mine.coordinatorSlug}/network-files`)).status()).toBe(200);
    expect((await page.request.get(`/api/cohort/${theirs.coordinatorSlug}/network-files`)).status()).toBe(403);
    const anon = await browser.newContext();
    expect((await anon.request.get(`/api/cohort/${mine.coordinatorSlug}/network-files`)).status()).toBe(401);
    await anon.close();
  });
});
