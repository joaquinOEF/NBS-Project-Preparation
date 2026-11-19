import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { TestApi } from './helpers/testApi';
import { buildCrossWorkbook } from '../server/services/synergyCrossXlsx';
import { proposeSolutionsTable, crossAnalysis, type PlatformSide } from '../shared/network-solutions';

// THE CROSS AS A SPREADSHEET (server/services/synergyCrossXlsx.ts).
// Invented organisations throughout: this repository is public.

const MEMBERS = [{ id: 'a', orgName: 'Associação Aurora' }, { id: 'b', orgName: 'Coletivo Beira-Rio' }, { id: 'c', orgName: 'CEA Morro Alto' }];
const GRIDS = [
  { name: 'Organizações', rows: [
    ['Organização', 'O que já tem', 'O que quer implementar'],
    ['Associação Aurora', 'Horta Urbana', 'Horta Urbana\nTeto verde\nBiodigestor'],
    ['Coletivo Beira-Rio', 'Cisterna', 'Jardim de chuva'],
  ] },
  { name: 'Técnicas', rows: [
    ['Grupo', 'Técnica', 'Alagamento', 'Calor', 'Deslizamento'],
    ['Agricultura Urbana', 'Hortas Urbanas', 'Fraca', 'Fraca', '—'],
    ['Infraestrutura Verde Urbana', 'Teto Verde', 'Média', 'Forte', '—'],
    ['Gestão de Águas pluviais', 'Jardins de Chuva', 'Forte', 'Fraca', 'Fraca'],
  ] },
];
const side = (memberId: string, orgName: string, over: Partial<PlatformSide> = {}): PlatformSide =>
  ({ memberId, orgName, bairro: 'Centro', kept: [], considering: [], discarded: [], visit: null, hazard: {}, guaibaCotaM: null, started: true, ...over });

async function read(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const sheets: Record<string, string[][]> = {};
  wb.eachSheet(ws => { const rows: string[][] = []; ws.eachRow(r => rows.push((r.values as any[]).slice(1).map(v => String(v ?? '')))); sheets[ws.name] = rows; });
  return sheets;
}

test('the workbook carries the same counts as the page, one tab per question', async () => {
  const cross = crossAnalysis(proposeSolutionsTable(GRIDS, MEMBERS)!, [
    side('a', 'Associação Aurora', { kept: ['hortas-urbanas'], hazard: { heat: { level: 4, pt: 'muito alta' } } }),
    side('b', 'Coletivo Beira-Rio'), side('c', 'CEA Morro Alto'),
  ], { name: 'planilha.xlsx' });
  const s = await read(await buildCrossWorkbook(cross));
  expect(Object.keys(s)).toEqual(['Org x solução', 'Org x família', 'Por solução', 'Arquivo x plataforma', 'Risco', 'Leitura', 'Leitura dos nomes']);

  const head = s['Org x solução'][0];
  expect(head.slice(0, 4)).toEqual(['Família', 'Solução', 'Associação Aurora', 'Coletivo Beira-Rio']);
  const horta = s['Org x solução'].find(r => r[1] === 'Hortas urbanas')!;
  expect(horta.slice(2)).toEqual(['tem e quer mais', '', '1', '1']);
  // An item outside the catalogue keeps its asterisk and is unrated.
  const bio = s['Por solução'].find(r => r[0] === 'Biodigestor*')!;
  expect(bio[2]).toBe('não');
  expect(bio.slice(-3)).toEqual(['sem avaliação', 'sem avaliação', 'sem avaliação']);
  expect(s['Risco'].find(r => r[0] === 'Associação Aurora')![4]).toBe('muito alta');
  // The organisation with no row is accounted for, not dropped.
  expect(s['Leitura dos nomes'].some(r => r[0] === 'CEA Morro Alto')).toBe(true);
  // Names, never ids.
  expect(JSON.stringify(s)).not.toMatch(/hortas-urbanas|x:biodigestor/);
});

test('without ratings there is no risk tab and no reading tab', async () => {
  const cross = crossAnalysis(proposeSolutionsTable([GRIDS[0]], MEMBERS)!, [side('a', 'Associação Aurora'), side('b', 'Coletivo Beira-Rio')], { name: 'planilha.xlsx' });
  expect(Object.keys(await read(await buildCrossWorkbook(cross)))).toEqual(['Org x solução', 'Org x família', 'Por solução', 'Arquivo x plataforma', 'Leitura dos nomes']);
});

test.describe('the download', () => {
  test.use({ locale: 'pt-BR' });

  test('is offered only for a report that counted a table, and only to its own network', async ({ page, browser }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Xlsx ${randomUUID().slice(0, 6)}`)).cohort;
    const other = (await api.createCohort(`Outra ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `x-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    for (const m of MEMBERS) {
      const member = (await api.inviteMember(cohort.id, { orgName: m.orgName, neighborhood: 'Centro', withSession: true })).member;
      await api.seedState(member.cboStateId, { phase: 3, language: 'pt', sections: [{ sectionId: 'intervention_site', field: 'bairro', value: 'Centro' }] });
    }
    const run = async () => {
      const id = (await (await page.request.post(`/api/cohort/${cohort.id}/synergies`, { data: {} })).json()).id;
      await expect.poll(async () => { const r = await (await page.request.get(`/api/cohort/${cohort.id}/synergies`)).json(); return r.id === id ? r.status : 'waiting'; }, { timeout: 60_000 }).toBe('done');
    };

    await run();
    expect((await page.request.get(`/api/cohort/${cohort.id}/synergies/cross.xlsx`)).status()).toBe(404);

    const wb = new ExcelJS.Workbook();
    for (const g of GRIDS) { const ws = wb.addWorksheet(g.name); for (const r of g.rows) ws.addRow(r); }
    const up = await (await page.request.post(`/api/cohort/${cohort.coordinatorSlug}/network-files`, {
      multipart: { file: { name: 'planilha.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await wb.xlsx.writeBuffer()) } },
    })).json();
    await page.request.put(`/api/cohort/${cohort.coordinatorSlug}/network-files/${up.file.id}/table`, { data: {} });
    await run();

    const res = await page.request.get(`/api/cohort/${cohort.id}/synergies/cross.xlsx`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toMatch(/attachment; filename="cruzamento-de-solucoes-\d{4}-\d{2}-\d{2}\.xlsx"/);
    const s = await read(await res.body());
    expect(s['Org x solução'][0]).toContain('Associação Aurora');

    expect((await page.request.get(`/api/cohort/${other.id}/synergies/cross.xlsx`)).status()).toBe(403);
    const anon = await browser.newContext();
    expect((await anon.request.get(`/api/cohort/${cohort.id}/synergies/cross.xlsx`)).status()).toBe(401);
    await anon.close();

    await page.goto('/orchestrator');
    await page.getByTestId('view-projects').click();
    await expect(page.getByTestId('synergy-cross-xlsx')).toHaveAttribute('href', `/api/cohort/${cohort.id}/synergies/cross.xlsx`);
  });
});
