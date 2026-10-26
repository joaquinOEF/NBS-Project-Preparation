import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TestApi } from './helpers/testApi';

// A FILE NAME READS AS TYPED, EVERYWHERE (26 Oct 2026). Uploads made before the
// multipart fix were stored with UTF-8 read as Latin-1 — 9 of Conceito Arte's
// files and 1 of SDV's in prod ("CROQUI_PraÃ§a Oliveira Rolim.pdf"). The
// screens repaired the name, but the API, the model prompts, the E3 notes'
// sources and the download header did not. Every read now repairs it; the
// stored row is left as it is.

const GARBLED = 'CROQUI_PraÃ§a Oliveira Rolim.pdf';
const TYPED = 'CROQUI_Praça Oliveira Rolim.pdf';

test('a name stored garbled before the fix comes back as typed from every read', async ({ page }) => {
  test.setTimeout(90_000);
  const api = new TestApi(page.request);
  test.skip(!(await api.ping()).fakeModel, 'needs the fake model');
  const tag = randomUUID().slice(0, 6);
  const cohort = (await api.createCohort(`Nomes ${tag}`)).cohort;
  await api.createCoordinator({ email: `names-${tag}@e2e.test`, password: 'pw-123456', cohortId: cohort.id });
  const m = (await api.inviteMember(cohort.id, { orgName: 'Conceito Teste', withSession: true, unlockedPhases: [1, 2, 3] })).member;

  const put = await (await page.request.post(`/__test/cbo/${m.cboStateId}/documents`, { data: { filename: GARBLED, fullText: 'Croqui da praça.' } })).json();
  expect(put.stored, 'the row is stored exactly as the old uploads were').toBe(GARBLED);

  // The coordination's files.
  const coord = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/member/${m.id}/documents`)).json();
  expect(coord.documents.map((d: any) => d.filename)).toContain(TYPED);
  expect(JSON.stringify(coord)).not.toContain('Ã');

  // The organisation's own list.
  const ownRes = await page.request.get(`/api/cbo/${m.cboStateId}/documents`);
  expect(ownRes.ok()).toBe(true);
  expect(JSON.stringify(await ownRes.json())).toContain(TYPED);

  // The repair is only for that pattern: a name already right is untouched.
  const ok = await (await page.request.post(`/__test/cbo/${m.cboStateId}/documents`, { data: { filename: 'Praça já certa.pdf' } })).json();
  const again = await (await page.request.get(`/api/cohort/${cohort.coordinatorSlug}/member/${m.id}/documents`)).json();
  expect(again.documents.find((d: any) => d.id === ok.id)?.filename).toBe('Praça já certa.pdf');
});

test('stored E3 notes citing a garbled source read it as typed', async () => {
  const { parseDocumentNotes, parseDocumentMeasures } = await import('../shared/w3-document-notes');
  const json = JSON.stringify({
    notes: [{ solutionId: 'jardins-de-chuva', stance: 'a-favor', textPt: 'x', textEn: 'x', quote: 'q', sourceFilename: GARBLED }],
    measures: [{ labelPt: 'a praça', labelEn: 'the square', quote: '1.200 m²', sourceFilename: GARBLED, m2: 1200 }],
  });
  const notes = parseDocumentNotes(json);
  expect(notes).toHaveLength(1);
  expect(notes[0].sourceFilename).toBe(TYPED);
  expect(parseDocumentMeasures(json)[0].sourceFilename).toBe(TYPED);
});
