import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { uploadNotice, uploadBatchOf, moreUploadsComing, uploadedFilename, isUploadNotice, classifyUploadNotice } from '../shared/cbo-upload-notices';
import { collapseRepeatedAnswer } from '../shared/cbo-chip-answers';

// SEVERAL FILES AT ONCE — one question, at the end.
//
// The picker takes several files and posts one notice per file, each its own
// turn. Encontro 3's door (and Encontro 2's photo beat) answered every one with
// "Recebi ✓" + the "Pronto, pode seguir" chip — so "done" was on offer after
// the FIRST of seven files, while six were still arriving, and the composer
// ended up reading "Pergunta 1 de 2" (JVP on staging, 2026-09-21: "it might
// think it's already done"). The notice now says where the file sits in its
// selection, and the beat asks once, after the last.

test.describe('the notice knows where it sits in the selection', () => {
  test('a single file carries no marker; a selection carries "i of n" on every kind of notice', () => {
    expect(uploadBatchOf(uploadNotice.parsed('a.pdf', 'texto'))).toBeNull();
    const kinds = [
      uploadNotice.parsed('a.pdf', 'texto', { index: 2, total: 7 }),
      uploadNotice.storedUnread('foto.heic', { index: 2, total: 7 }),
      uploadNotice.refused('grande.zip', 'too large', 'send a smaller one', { index: 2, total: 7 }),
      uploadNotice.transport('b.pdf', { index: 2, total: 7 }),
    ];
    for (const k of kinds) {
      expect(uploadBatchOf(k)).toEqual({ index: 2, total: 7 });
      expect(moreUploadsComing(k)).toBe(true);
      expect(isUploadNotice(k), 'every kind is an upload notice to a beat').toBe(true);
      expect(classifyUploadNotice(k), 'the marker does not confuse the classifier').not.toBeNull();
    }
    expect(moreUploadsComing(uploadNotice.parsed('g.pdf', 'x', { index: 7, total: 7 }))).toBe(false);
    expect(uploadedFilename(uploadNotice.storedUnread('foto do pátio.heic'))).toBe('foto do pátio.heic');
    // A document whose own text ends in something marker-shaped is not a batch.
    expect(uploadBatchOf(uploadNotice.parsed('ata.pdf', 'ver anexo [UPLOAD_BATCH 1/9]'))).toBeNull();
  });
});

const W2_STATE = [
  { sectionId: 'org_profile', field: 'org_name', value: 'Raízes do Sarandi' },
  { sectionId: 'intervention_site', field: 'bairro', value: 'Sarandi' },
  { sectionId: 'intervention_site', field: 'site_name', value: 'Pátio da EMEI Solar' },
  { sectionId: 'intervention_site', field: '_site_lat', value: '-30.0906' },
  { sectionId: 'intervention_site', field: '_site_lng', value: '-51.1726' },
  { sectionId: 'intervention_site', field: 'current_use', value: 'paved' },
  { sectionId: 'intervention_site', field: 'land_tenure', value: 'public-informal' },
  { sectionId: 'intervention_site', field: 'site_worry', value: 'alagamento' },
  { sectionId: 'intervention_site', field: 'site_story', value: 'Quando chove forte a água entra pelo fundo e fica dias.' },
  { sectionId: 'intervention_site', field: 'site_knowledge_depth', value: 'strong' },
  { sectionId: 'intervention_site', field: 'nbs_interest', value: 'aguas-pluviais' },
  // Skips Encontro 3's deliberation beats (criteria · who would do it · what is hardest) — this spec
  // is about something else. They are covered by e2e/cougar-e3-deliberation.spec.ts and the fuzzer.
  { sectionId: 'intervention_type', field: '_quick_tests', value: 'yes' },
];

test.describe('Encontro 3 — the door, with several files at once', () => {
  test.use({ locale: 'pt-BR' });

  test('three files: three acknowledgements by name, ONE question, and only after the last', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_STATE });
    const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const thread = page.getByTestId('cbo-chat-thread');
    const input = page.getByTestId('cbo-chat-input');

    await input.fill('Vamos começar o Encontro 3.');
    await input.press('Enter');
    await chip('É isso ✓').click();
    await expect(chip('📎 Mandar agora')).toBeVisible({ timeout: 15_000 });

    // "Mandar agora" answers AND opens the picker. Three files in one selection.
    const chooser = page.waitForEvent('filechooser');
    await chip('📎 Mandar agora').click();
    await (await chooser).setFiles([
      { name: '01-visita.txt', mimeType: 'text/plain', buffer: Buffer.from('Relatório da visita: solo argiloso, infiltração 4 mm/h.') },
      { name: '02-ata.txt', mimeType: 'text/plain', buffer: Buffer.from('Ata: contrapartida de R$ 8.200.') },
      { name: '03-observacoes.txt', mimeType: 'text/plain', buffer: Buffer.from('Obra só em janeiro.') },
    ]);

    // Each file is acknowledged BY NAME, with where it sits.
    await expect(thread.getByText('01-visita.txt', { exact: false }).last()).toBeVisible({ timeout: 30_000 });
    await expect(thread.getByText('(1 de 3)', { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(thread.getByText('(2 de 3)', { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(thread.getByText('(3 de 3)', { exact: false })).toBeVisible({ timeout: 30_000 });
    // …and the last one says how many are here now.
    await expect(thread.getByText('Agora são 3 arquivos aqui', { exact: false })).toBeVisible({ timeout: 15_000 });

    // ONE question, asked once: not once per file, and never a "1 de 2" stack.
    await expect(chip('Pronto, pode seguir')).toHaveCount(1, { timeout: 15_000 });
    await expect(chip('📎 Mandar mais')).toHaveCount(1);
    await expect(thread.getByText('Tem mais algum pra mandar?')).toHaveCount(1);
    await expect(page.getByText(/Pergunta \d de \d/)).toHaveCount(0);

    // A reload lands on that one question.
    await page.reload();
    await expect(chip('Pronto, pode seguir')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByText(/Pergunta \d de \d/)).toHaveCount(0);

    // And "Pronto" closes the door: the shelf.
    await chip('Pronto, pode seguir').click();
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 20_000 });
  });

  test('one file alone: acknowledged by name, asked once, no "(1 de 1)" noise', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_STATE });
    const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const thread = page.getByTestId('cbo-chat-thread');
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Vamos começar o Encontro 3.');
    await input.press('Enter');
    await chip('É isso ✓').click();
    await expect(chip('📎 Mandar agora')).toBeVisible({ timeout: 15_000 });
    const chooser = page.waitForEvent('filechooser');
    await chip('📎 Mandar agora').click();
    await (await chooser).setFiles([{ name: 'croqui.txt', mimeType: 'text/plain', buffer: Buffer.from('Pátio 38 x 22 m.') }]);
    await expect(thread.getByText('croqui.txt', { exact: false }).last()).toBeVisible({ timeout: 30_000 });
    await expect(chip('Pronto, pode seguir')).toHaveCount(1, { timeout: 15_000 });
    await expect(thread.getByText(/\(\d de \d\)/)).toHaveCount(0);
  });

  // Drag-and-drop was a SECOND uploader (useFileDrop), with older wording and no
  // idea where a file sat in its drop — so the fix for the picker left a drop of
  // seven files asking "Tem mais algum?" seven times (staging, same afternoon).
  test('dropped files take the same path as picked ones: named acks, one question', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_STATE });
    const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const thread = page.getByTestId('cbo-chat-thread');
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Vamos começar o Encontro 3.');
    await input.press('Enter');
    await chip('É isso ✓').click();
    await expect(chip('Já mandamos tudo')).toBeVisible({ timeout: 15_000 });

    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.items.add(new File(['Relatório da visita: infiltração 4 mm/h.'], '01-visita.txt', { type: 'text/plain' }));
      d.items.add(new File(['Ata: contrapartida de R$ 8.200.'], '02-ata.txt', { type: 'text/plain' }));
      d.items.add(new File(['Obra só em janeiro.'], '03-observacoes.txt', { type: 'text/plain' }));
      return d;
    });
    await page.dispatchEvent('[data-testid="cbo-drop-zone"]', 'drop', { dataTransfer: dt });

    await expect(thread.getByText('(1 de 3)', { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(thread.getByText('(3 de 3)', { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(thread.getByText('Agora são 3 arquivos aqui', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(thread.getByText('Tem mais algum pra mandar?')).toHaveCount(1);
    await expect(chip('Pronto, pode seguir')).toHaveCount(1);
    await expect(page.getByText(/Pergunta \d de \d/)).toHaveCount(0);
  });

  // ⚠️ THE DEAD END JVP HIT ON STAGING (2026-09-21). Seven files stacked the
  // same question twice; one tap posted "Pronto, pode seguir; Pronto, pode
  // seguir"; the door did not recognise it; the model took the turn, extracted
  // for 53 s, and ended on prose with nothing to tap — the door still open.
  test('a stacked answer, an unknown chip and a silent model turn all land back on a question', async ({ page, request }) => {
    expect(collapseRepeatedAnswer('Pronto, pode seguir; Pronto, pode seguir')).toBe('Pronto, pode seguir');
    expect(collapseRepeatedAnswer('Associação; 6-20'), 'different answers stay a batch').toBe('Associação; 6-20');

    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: W2_STATE });
    const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const thread = page.getByTestId('cbo-chat-thread');
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('Vamos começar o Encontro 3.');
    await input.press('Enter');
    await chip('É isso ✓').click();
    await expect(chip('Já mandamos tudo')).toBeVisible({ timeout: 15_000 });

    // A model turn that says something and asks NOTHING, while the door is open.
    await api.scriptCbo(cboId, [[{ op: 'say', text: 'Deixa eu extrair tudo antes de seguirmos.' }]]);
    await input.fill('o que vocês fazem com os arquivos?');
    await input.press('Enter');
    await expect(thread.getByText('Deixa eu extrair tudo antes de seguirmos.')).toBeVisible({ timeout: 20_000 });
    // …the encontro asks its own question again instead of leaving a blank.
    await expect(chip('Já mandamos tudo').last()).toBeVisible({ timeout: 20_000 });

    // The exact string the stacked composer posted closes the door.
    const r = await request.post(`/api/cbo/${cboId}/chat`, { data: { message: 'Pronto, pode seguir; Pronto, pode seguir', turnKind: 'chip', lang: 'pt' } });
    expect(r.ok()).toBe(true);
    const body = await r.text();
    expect(body, 'served by the door, not the model').toContain('show_solution_options');
    expect(body).not.toContain('Entendi. Vamos continuar.');
  });

  test('a chip the open door does not know is answered by the door', async ({ request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');
    const { cboId } = await api.newSession('porto-alegre');
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: [...W2_STATE,
      { sectionId: 'intervention_type', field: '_e3_opened', value: 'yes' },
      { sectionId: 'intervention_type', field: '_material_pending', value: 'yes' }] });
    const r = await request.post(`/api/cbo/${cboId}/chat`, { data: { message: 'Outra coisa', turnKind: 'chip', lang: 'pt' } });
    const body = await r.text();
    expect(body).toContain('Tem mais algum pra mandar?');
    expect(body).toContain('Pronto, pode seguir');
    expect(body, 'the model never got the turn').not.toContain('Entendi. Vamos continuar.');
    // Typed "pronto" closes it too.
    const t = await request.post(`/api/cbo/${cboId}/chat`, { data: { message: 'pronto, terminei', turnKind: 'text', lang: 'pt' } });
    expect(await t.text()).toContain('show_solution_options');
  });
});
