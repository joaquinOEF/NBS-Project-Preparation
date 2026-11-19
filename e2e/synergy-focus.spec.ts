import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { TestApi } from './helpers/testApi';
import { synergyRequestFrom, settleRequest, printsFocus, ALL_FOCUS, MAX_FOCUS_NOTE } from '../shared/synergy-focus';
import { analysisForModel } from '../server/services/synergyReport';
import { analyseSynergies } from '../shared/w3-synergies';

// WHAT A REPORT IS ASKED TO FOCUS ON (shared/synergy-focus.ts).
// Invented organisations throughout: this repository is public.

test.describe('the request', () => {
  test('nothing recognisable asked means everything', () => {
    expect(synergyRequestFrom(undefined)).toEqual({ focus: ALL_FOCUS, note: null });
    expect(synergyRequestFrom({ focus: [], note: '   ' })).toEqual({ focus: ALL_FOCUS, note: null });
    expect(synergyRequestFrom({ focus: ['nope', 42] }).focus).toEqual(ALL_FOCUS);
  });

  test('a focus is kept in the catalogue order, and the sentence is one sentence', () => {
    expect(synergyRequestFrom({ focus: ['risco', 'familia', 'x'] }).focus).toEqual(['familia', 'risco']);
    const r = synergyRequestFrom({ note: `  preparando\n o encontro  de dezembro ${'a'.repeat(400)}` });
    expect(r.note!.startsWith('preparando o encontro de dezembro')).toBe(true);
    expect(r.note!.length).toBe(MAX_FOCUS_NOTE);
  });

  test('asking for everything a run can print is asking for the whole report', () => {
    // No table of the coordination: only "rede" can print, so "rede" is everything.
    expect(settleRequest({ focus: ['rede'], note: null }, false).focus).toEqual(ALL_FOCUS);
    expect(settleRequest({ focus: ['familia', 'risco'], note: 'x' }, false)).toEqual({ focus: ALL_FOCUS, note: 'x' });
    // With one, the same request is a real focus.
    expect(settleRequest({ focus: ['rede'], note: null }, true).focus).toEqual(['rede']);
    expect(settleRequest({ focus: ['familia', 'risco'], note: null }, true).focus).toEqual(['familia', 'risco']);
  });

  test('a report from before focusing existed prints everything', () => {
    expect(printsFocus(undefined, 'risco')).toBe(true);
    expect(printsFocus({ focus: ['familia'], note: null }, 'risco')).toBe(false);
  });

  test('the narrative hears the request only when there is one', () => {
    const a = analyseSynergies([]);
    expect(analysisForModel(a, { request: { focus: ALL_FOCUS, note: null } })).not.toContain('PEDIDO DA COORDENAÇÃO');
    const asked = analysisForModel(a, { request: { focus: ['risco'], note: 'encontro de dezembro sobre água' } });
    expect(asked).toContain('# PEDIDO DA COORDENAÇÃO PARA ESTE RELATÓRIO');
    expect(asked).toContain('Foco: Por risco.');
    expect(asked).toContain('"encontro de dezembro sobre água"');
  });
});

test.describe('a focused report prints what was asked', () => {
  test.use({ locale: 'pt-BR' });

  test('the buttons choose the sections, and the sentence is printed', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const cohort = (await api.createCohort(`Foco ${randomUUID().slice(0, 6)}`)).cohort;
    await api.createCoordinator({ email: `foco-${randomUUID()}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    for (const orgName of ['Associação Aurora', 'Coletivo Beira-Rio', 'Instituto Quatro Ventos']) {
      const m = (await api.inviteMember(cohort.id, { orgName, neighborhood: 'Centro', withSession: true })).member;
      await api.seedState(m.cboStateId, { phase: 3, language: 'pt', sections: [
        { sectionId: 'intervention_site', field: 'bairro', value: 'Centro' },
        { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
      ] });
    }
    const slug = cohort.coordinatorSlug;

    // No confirmed table yet: the buttons that need one are off.
    await page.goto('/orchestrator');
    await page.getByTestId('view-projects').click();
    await expect(page.getByTestId('synergy-focus-familia')).toBeDisabled();
    await expect(page.getByTestId('synergy-focus-rede')).toBeEnabled();

    // ⚠️ An untouched panel on a network with no files is the WHOLE report. It
    // used to send the one button that was enabled, and every such report was
    // printed as "Foco deste relatório: …".
    await page.getByTestId('synergy-run').click();
    await expect.poll(async () => (await (await page.request.get(`/api/cohort/${cohort.id}/synergies`)).json()).status, { timeout: 60_000 }).toBe('done');
    const plain = await (await page.request.get(`/api/cohort/${cohort.id}/synergies/print`)).text();
    expect(plain).not.toContain('Foco deste relatório');
    expect((await (await page.request.get(`/api/cohort/${cohort.id}/synergies`)).json()).report.request.focus).toEqual(ALL_FOCUS);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Organizações');
    ws.addRow(['Organização', 'O que já tem', 'O que quer implementar']);
    ws.addRow(['Associação Aurora', 'Horta Urbana', 'Teto verde\nJardim de chuva']);
    ws.addRow(['Coletivo Beira-Rio', 'Compostagem', 'Horta Urbana']);
    const up = await (await page.request.post(`/api/cohort/${slug}/network-files`, {
      multipart: { file: { name: 'planilha.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await wb.xlsx.writeBuffer()) } },
    })).json();
    await page.request.put(`/api/cohort/${slug}/network-files/${up.file.id}/table`, { data: {} });

    await page.reload();
    await page.getByTestId('view-projects').click();
    await expect(page.getByTestId('synergy-focus-familia')).toBeEnabled();
    // Everything is on to begin with; switch off all but "por família".
    for (const id of ['tem-quer', 'arquivo-plataforma', 'risco', 'rede']) await page.getByTestId(`synergy-focus-${id}`).click();
    await page.getByTestId('synergy-focus-note').fill('Preparando o encontro de dezembro sobre água');
    await page.getByTestId('synergy-run').click();
    await expect.poll(async () => {
      const r = await (await page.request.get(`/api/cohort/${cohort.id}/synergies`)).json();
      return r.status === 'done' ? (r.report?.request?.focus ?? []).join(',') : r.status;
    }, { timeout: 60_000 }).toBe('familia');

    const html = await (await page.request.get(`/api/cohort/${cohort.id}/synergies/print`)).text();
    expect(html).toContain('Pedido da coordenação:</strong> Preparando o encontro de dezembro sobre água');
    expect(html).toContain('Foco deste relatório:</strong> Por família de solução');
    expect(html).toContain('Organizações por família de solução');
    for (const gone of ['Solução por solução', 'lado a lado', 'Agrupamentos calculados', 'Denominadores comuns']) expect(html, gone).not.toContain(gone);
    // What every report keeps, whatever the focus.
    for (const kept of ['A Rede num relance', 'Lacunas e cuidados com os dados']) expect(html, kept).toContain(kept);

    // Asked for nothing in particular: all of it.
    const id = (await (await page.request.post(`/api/cohort/${cohort.id}/synergies`, { data: {} })).json()).id;
    await expect.poll(async () => { const r = await (await page.request.get(`/api/cohort/${cohort.id}/synergies`)).json(); return r.id === id ? r.status : 'waiting'; }, { timeout: 60_000 }).toBe('done');
    const full = await (await page.request.get(`/api/cohort/${cohort.id}/synergies/print`)).text();
    for (const s of ['Organizações por família de solução', 'Solução por solução', 'lado a lado']) expect(full, s).toContain(s);
    expect(full).not.toContain('Foco deste relatório');
  });
});
