import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';
import { documentPurposeLabel, documentPurposeTag } from '../shared/document-purpose';
import { buildContextMarkdown } from '../server/services/contextBundle';
import { buildReaderPrompt } from '../server/services/w3DocumentReader';
import { synergyFactsFrom } from '../shared/w3-synergies';
import { createEmptyCboState } from '../shared/cbo-schema';

// FILES FROM THE TECHNICAL VISIT — the report, a technician's photos, a sketch.
//
// The coordination attaches them in the visit tab. What has to hold: they land
// in the organisation's own locker marked as the visit's (so every pass that
// reads its files reads these), they read as the COORDINATION's wherever a
// model or a person sees them, the coordination can remove only what it
// attached, and the drawer shows them.

const REPORT = 'Relatório da visita técnica — Pátio da Voluntários da Pátria 1039. Solo argiloso, infiltração baixa: o jardim de chuva precisa de dreno de fundo. Área útil medida: 140 m². A água entra pelo portão e para no canto baixo junto ao muro.';

test.describe('visit files — how they read', () => {
  test('a visit file is named as the coordination\'s, in prompts and in lists', () => {
    expect(documentPurposeLabel('visita_tecnica')).toBe('anexo da visita técnica da coordenação');
    expect(documentPurposeLabel('teia_sprint', 'en')).toBe('Teia Sprint application');
    expect(documentPurposeLabel(null)).toBeNull();
    expect(documentPurposeTag('visita_tecnica')).toBe('Visita técnica');
  });

  test('the context bundle carries the text of the file and says whose it is', () => {
    const md = buildContextMarkdown({
      orgName: 'Ksa Rosa', state: createEmptyCboState('porto-alegre'), messages: [], generatedAt: '2026-10-23 10:00',
      docs: [{ filename: 'relatorio-visita.pdf', kind: 'pdf', purpose: 'visita_tecnica', droppedInPhase: 3, summary: 'Relatório da visita', fullText: REPORT }],
    });
    expect(md).toContain('relatorio-visita.pdf');
    expect(md).toContain('anexo da visita técnica da coordenação');
    // The text itself — the project session used to see a 280-character précis.
    expect(md).toContain('precisa de dreno de fundo');
  });

  test('the document reader heads a visit file as the coordination\'s', () => {
    const prompt = buildReaderPrompt({ docs: [{ filename: 'relatorio-visita.pdf', fullText: REPORT, purpose: 'visita_tecnica' }], site: { name: 'Pátio' } });
    expect(prompt).toMatch(/### ARQUIVO \(anexo da visita técnica da coordenação\): relatorio-visita\.pdf/);
  });

  test('the synergy facts carry what the visit recommended', () => {
    const s = createEmptyCboState('porto-alegre');
    (s.sections as any).intervention_type.fields._visit_json = { value: JSON.stringify({ solutionId: 'jardins-de-chuva', areaM2: 140, date: '2026-10-23', recordedAt: 'x' }), confidence: 'high', source: 'coordinator', userEdited: false };
    expect(synergyFactsFrom(s.sections).visitPt).toBe('Jardins de chuva · 140 m² · visita em 23/10/2026');
  });
});

test.describe('visit files — the coordinator routes', () => {
  test('attach, list, refuse what is not the visit\'s, remove', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Visita arquivos ${tag}`)).cohort;
    await api.createCoordinator({ email: `visit-files-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true })).member;
    await api.seedState(m.cboStateId, { phase: 3, language: 'pt', sections: [{ sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' }] });
    const base = `/api/cohort/${cohort.coordinatorSlug}/member/${m.id}`;

    const up = await page.request.post(`${base}/visit/files`, {
      multipart: { file: { name: 'relatorio-visita.txt', mimeType: 'text/plain', buffer: Buffer.from(REPORT) } },
    });
    expect(up.ok()).toBe(true);
    const { document, parsed } = await up.json();
    expect(parsed).toBe(true);
    expect(document).toMatchObject({ filename: 'relatorio-visita.txt', purpose: 'visita_tecnica' });

    // In the organisation's own locker — what every pass reads.
    const listed = (await (await page.request.get(`${base}/documents`)).json()).documents;
    expect(listed.map((d: any) => d.id)).toContain(document.id);
    const text = await (await page.request.get(`${base}/documents/${document.id}/text`)).json();
    expect(JSON.stringify(text)).toContain('dreno de fundo');

    // The organisation's own upload is theirs — the visit route will not remove it.
    const own = await page.request.post(`/api/upload/cbo/${m.cboStateId}`, {
      multipart: { file: { name: 'proposta.txt', mimeType: 'text/plain', buffer: Buffer.from('Nossa proposta de horta.') } },
    });
    expect(own.ok()).toBe(true);
    const ownDoc = (await (await page.request.get(`${base}/documents`)).json()).documents.find((d: any) => d.filename === 'proposta.txt');
    expect((await page.request.delete(`${base}/visit/files/${ownDoc.id}`)).status()).toBe(404);

    // A type nobody can read is refused with a reason, not a 500.
    const exe = await page.request.post(`${base}/visit/files`, {
      multipart: { file: { name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') } },
    });
    expect(exe.status()).toBe(415);

    expect((await page.request.delete(`${base}/visit/files/${document.id}`)).ok()).toBe(true);
    const after = (await (await page.request.get(`${base}/documents`)).json()).documents;
    expect(after.map((d: any) => d.id)).not.toContain(document.id);
    expect(after.map((d: any) => d.filename)).toContain('proposta.txt');
  });
});

test.describe('visit files — the drawer', () => {
  test.use({ locale: 'pt-BR' });

  test('Vila Flores attaches the report in the visit tab and can take it back', async ({ page }) => {
    const api = new TestApi(page.request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
    const tag = randomUUID().slice(0, 6);
    const cohort = (await api.createCohort(`Visita arquivos UI ${tag}`)).cohort;
    await api.createCoordinator({ email: `visit-files-ui-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
    const m = (await api.inviteMember(cohort.id, { orgName: 'Ksa Rosa', neighborhood: 'Floresta', withSession: true })).member;
    await api.seedState(m.cboStateId, { phase: 3, language: 'pt', sections: [
      { sectionId: 'intervention_type', field: 'solution_tests_json', value: JSON.stringify([{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido', areaM2: 120, testedAt: '2026-09-15T12:00:00Z' }]) },
      { sectionId: 'intervention_type', field: '_e3_closed', value: 'yes' },
    ] });

    await page.goto(`/orchestrator?cohort=${cohort.coordinatorSlug}`);
    await page.getByTestId(`button-visit-${m.id}`).click({ timeout: 30_000 });
    const box = page.getByTestId('visit-files');
    await expect(box).toBeVisible();
    await expect(box).toContainText('Nenhum arquivo anexado.');

    await page.getByTestId('visit-files-input').setInputFiles({ name: 'relatorio-visita.txt', mimeType: 'text/plain', buffer: Buffer.from(REPORT) });
    const row = box.locator('[data-testid^="visit-file-"]').filter({ hasText: 'relatorio-visita.txt' });
    await expect(row).toBeVisible({ timeout: 20_000 });
    if (process.env.DRAWER_SHOTS) await box.screenshot({ path: `${process.env.DRAWER_SHOTS}/visit-files.png` });

    // The Arquivos tab names it as the visit's.
    await page.getByTestId('cbo-tab-arquivos').click();
    await expect(page.locator('[data-testid^="file-row-"]').filter({ hasText: 'relatorio-visita.txt' })).toContainText('Visita técnica');

    await page.getByTestId('cbo-tab-visita').click();
    await page.locator('[data-testid^="visit-file-remove-"]').first().click();
    await expect(page.getByTestId('visit-files')).toContainText('Nenhum arquivo anexado.');
  });
});
