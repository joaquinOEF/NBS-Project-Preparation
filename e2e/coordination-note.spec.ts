import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { TestApi } from './helpers/testApi';
import { proposeSolutionsTable, coordinationNoteFor } from '../shared/network-solutions';

// THE COORDINATION'S NOTE ON ONE ORGANISATION — read off its confirmed table
// every time it is shown, never written into the organisation's record.
// Invented organisations throughout: this repository is public.

const MEMBERS = [{ id: 'a', orgName: 'Associação Aurora' }, { id: 'b', orgName: 'Coletivo Beira-Rio' }];
const ROWS = [
  ['Organização', 'O que já tem', 'O que quer implementar'],
  ['Associação Aurora', 'Horta Urbana\nCisterna', 'Teto verde\nBiodigestor'],
  ['Coletivo Beira-Rio', '', ''],
  ['Instituto Quatro Ventos', 'Compostagem', 'Jardim de chuva'],
];

test.describe('the note', () => {
  const t = proposeSolutionsTable([{ name: 'Organizações', rows: ROWS }], MEMBERS)!;
  const file = { name: 'planilha.xlsx', date: '2026-11-19' };

  test('says nothing before the table is confirmed', () => {
    expect(coordinationNoteFor(t, 'a', file)).toBeNull();
  });

  test('uses the platform’s names for what it knows, the file’s for what it does not', () => {
    const note = coordinationNoteFor({ ...t, confirmedAt: '2026-11-19T12:00:00Z' }, 'a', file)!;
    expect(note).toEqual({ fileName: 'planilha.xlsx', fileDate: '2026-11-19', has: ['Hortas urbanas', 'Captação de água da chuva'], wants: ['Teto verde', 'Biodigestor'] });
  });

  test('an empty row, or no row, is no note', () => {
    const c = { ...t, confirmedAt: 'x' };
    expect(coordinationNoteFor(c, 'b', file)).toBeNull();
    expect(coordinationNoteFor(c, 'nobody', file)).toBeNull();
  });
});

test.describe('in the organisation drawer', () => {
  test.use({ locale: 'pt-BR' });

  test('shown as the coordination’s, gone with the file, and never on the record', async ({ page }) => {
    const api = new TestApi(page.request);
    const cohort = (await api.createCohort(`Nota ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `nota-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const slug = cohort.coordinatorSlug;
    const aurora = (await api.inviteMember(cohort.id, { orgName: 'Associação Aurora', neighborhood: 'Centro', withSession: true })).member;
    const beira = (await api.inviteMember(cohort.id, { orgName: 'Coletivo Beira-Rio', neighborhood: 'Centro', withSession: true })).member;
    await api.seedState(aurora.cboStateId, { phase: 2, language: 'pt', sections: [{ sectionId: 'intervention_site', field: 'bairro', value: 'Centro' }] });
    const profile = async (id: string) => (await (await page.request.get(`/api/cohort/${slug}/member/${id}/profile`)).json());

    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Organizações'); for (const r of ROWS) ws.addRow(r);
    const up = await (await page.request.post(`/api/cohort/${slug}/network-files`, {
      multipart: { file: { name: 'planilha.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await wb.xlsx.writeBuffer()) } },
    })).json();

    // Uploaded, not confirmed: nothing is said about anyone.
    expect((await profile(aurora.id)).coordination).toBeNull();
    await page.request.put(`/api/cohort/${slug}/network-files/${up.file.id}/table`, { data: {} });

    const p = await profile(aurora.id);
    expect(p.coordination).toMatchObject({ fileName: 'planilha.xlsx', has: ['Hortas urbanas', 'Captação de água da chuva'], wants: ['Teto verde', 'Biodigestor'] });
    // The organisation's own record is untouched by it.
    expect(JSON.stringify(p.profile.sections)).not.toMatch(/Teto verde|teto-verde|Biodigestor/);
    expect((await profile(beira.id)).coordination).toBeNull();

    await page.goto('/orchestrator');
    await page.getByTestId(`card-orchestrator-project-${aurora.id}`).click({ timeout: 30_000 });
    await page.getByTestId('cbo-tab-perfil').click();
    const note = page.getByTestId('cbo-coordination-note');
    await expect(note).toContainText('Segundo a planilha da coordenação');
    await expect(note).toContainText('Quer: Teto verde, Biodigestor');
    await expect(note).toContainText('não pela organização na plataforma');

    // Remove the file and the note goes with it — there was never a copy.
    await page.request.delete(`/api/cohort/${slug}/network-files/${up.file.id}`);
    expect((await profile(aurora.id)).coordination).toBeNull();
  });
});
