import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';
import { computeVerdict, studyRequirement, studyAlreadyDone, studiesDone, buildDossier, COMPLETABLE_STUDIES, type W3Input } from '../shared/w3-dossier';
import { buildSolutionTest } from '../shared/w3-solution-test';
import { buildConceptNote } from '../shared/concept-note';
import { shortlistForSite } from '../shared/w3-solutions';
import { synergyFactsFrom } from '../shared/w3-synergies';
import { keepVerifiedNotes, keepVerifiedMeasures, docsSignature, withConversation, salvageQuote, READER_SYSTEM } from '../server/services/w3DocumentReader';
import { parseDocumentMeasures, studyProposal, studyEvidenceIn, conversationLines, notesFromInput, CONVERSATION_SOURCE, DOCUMENT_NOTES_FIELD } from '../shared/w3-document-notes';
import { NBS_SOLUTIONS } from '../shared/nbs-catalog';

// THE MODEL PROPOSES · THEY CONFIRM · A FUNCTION DECIDES.
//
// After #547 a card could say "precisa de um teste de infiltração" beside a
// note quoting the test's results, and an organisation that sent a measured
// sketch was still asked "how big?" — or had a rain garden priced over the
// whole patio it drew in Encontro 2. Both are closed the same way: the reader
// finds the passage, Encontro 3 asks, and only the answer changes a verdict or
// a size. Nothing here lets a model move a verdict or supply a number.

const SITE = { bairro: 'Partenon', site_name: 'Pátio dos fundos', _site_lat: '-30.0583', _site_lng: '-51.1672', site_worry: 'alagamento', current_use: 'paved', land_tenure: 'formal-agreement', nbs_interest: 'aguas-pluviais', site_story: 'A água empoça.' };
const input = (site: Record<string, string> = {}, w3: Record<string, string> = {}): W3Input => ({ org: { org_name: 'APM' }, site: { ...SITE, ...site }, solutions: ['jardins-de-chuva'], areaM2: 96, w3: { chosen_solutions: 'jardins-de-chuva', ...w3 } });

test.describe('a confirmed study moves the verdict — and nothing else does', () => {
  test('needs_study → past it, with the confirmation said on the page; an unconfirmed one changes nothing', () => {
    expect(computeVerdict('jardins-de-chuva', input()).state).toBe('needs_study');
    const v = computeVerdict('jardins-de-chuva', input({ studies_done: 'infiltration', studies_done_source: 'relatorio.pdf' }));
    expect(v.state).not.toBe('needs_study');
    expect(v.studyDone).toEqual({ label: 'um teste de infiltração do solo', source: 'relatorio.pdf' });
    expect(v.why).toContain('a organização confirmou que já tem (relatorio.pdf)');
    // Done is not favourable: the sentence sends the reader to what it found.
    expect(v.why).toContain('o que ele mostrou entra no desenho');
    // A different study does not answer this one.
    expect(computeVerdict('jardins-de-chuva', input({ studies_done: 'geotechnical' })).state).toBe('needs_study');
  });

  test('⚠️ only a study a paper can hold: a licensed lead (ART) is never "already done"', () => {
    expect(studiesDone({ studies_done: 'art,technical-lead,technician,infiltration,bogus' })).toEqual(['infiltration']);
    const art = NBS_SOLUTIONS.find(s => studyRequirement(s.id)?.id === 'art')!;
    expect(art, 'the catalogue has a solution that needs an ART').toBeTruthy();
    expect(computeVerdict(art.id, input({ studies_done: 'art' })).state).toBe('needs_study');
    expect(COMPLETABLE_STUDIES).not.toContain('art');
  });

  test('every reader of "what this needs" agrees: card, shortlist, dossier, Resumo, cohort pooling', () => {
    const done = input({ studies_done: 'infiltration', studies_done_source: 'relatorio.pdf' });
    const card = buildSolutionTest('jardins-de-chuva', done, undefined, 'pt')!;
    expect(card.needs.join(' ')).toContain('já realizado, segundo a organização (relatorio.pdf)');
    expect(card.needs.join(' ')).not.toContain('Precisa de um teste de infiltração');
    const onShelf = shortlistForSite({ site: done.site }, 'pt').find(e => e.solution.id === 'jardins-de-chuva')!;
    expect(JSON.stringify(onShelf)).not.toContain('precisa de um teste de infiltração');
    expect(JSON.stringify(buildDossier(done, 'pt').studies)).not.toContain('infiltração');
    expect(JSON.stringify(buildDossier(input(), 'pt').studies)).toContain('infiltração');
    const note = JSON.stringify(buildConceptNote(done, 'pt'));
    expect(note).toContain('estudo técnico já realizado');
    expect(note).toContain('confirmado pela organização no Encontro 3');
    const sections: any = { intervention_type: { fields: { chosen_solutions: { value: 'jardins-de-chuva' } } }, intervention_site: { fields: { studies_done: { value: 'infiltration' } } } };
    expect(synergyFactsFrom(sections).studyNeeds ?? []).not.toContain('um teste de infiltração do solo');
    expect(studyAlreadyDone('jardins-de-chuva', input().site)).toBeNull();
  });
});

const REPORT = `O pátio de recreio é todo cimentado, com cerca de 38 × 22 m.
No canto nordeste há uma faixa de terra de aproximadamente 12 × 8 m, hoje sem uso.
Foi feito um teste de infiltração com anel simples em dois pontos da faixa de terra. P1: 4 mm/h.
Recomenda-se contratar uma avaliação geotécnica antes de qualquer contenção.`;
const DOCS = [{ filename: 'relatorio.pdf', fullText: REPORT }, { filename: 'croqui.png', fullText: 'Croqui à mão: pátio 38 x 22 m; canteiro livre 12 x 8 m; portão 2,40 m.' }];
const note = (over: any) => ({ solutionId: 'jardins-de-chuva', stance: 'a-favor', textPt: 'O relatório registra ensaio de infiltração já realizado.', textEn: 'x', quote: 'Foi feito um teste de infiltração com anel simples em dois pontos da faixa de terra.', sourceFilename: 'relatorio.pdf', ...over });

test.describe('what the reader may propose', () => {
  test('a study "done" must be one a paper can hold; anything else costs the mark, not the note', () => {
    const kept = keepVerifiedNotes([note({ studyDone: 'infiltration' }), note({ solutionId: 'biovaletas', studyDone: 'art' }), note({ solutionId: 'canteiro-pluvial', studyDone: '' })], DOCS);
    expect(kept.map(n => n.studyDone)).toEqual(['infiltration', undefined, undefined]);
    expect(studyProposal(kept, 'infiltration', 'biovaletas')?.solutionId, 'a study belongs to the place: any solution asking for it gets the proposal').toBe('jardins-de-chuva');
    expect(studyProposal(kept, 'geotechnical', 'jardins-de-chuva')).toBeNull();
    expect(READER_SYSTEM).toContain('recomendado, planejado ou orçado NÃO é um estudo feito');
  });

  test('⚠️ a measure: the passage is theirs, the NUMBER is computed — never the model\'s', () => {
    const ms = keepVerifiedMeasures([
      { labelPt: 'faixa de terra no canto nordeste', labelEn: 'strip', quote: 'faixa de terra de aproximadamente 12 × 8 m', sourceFilename: 'relatorio.pdf' },
      { labelPt: 'canteiro livre (croqui)', labelEn: 'bed', quote: 'canteiro livre 12 x 8 m', sourceFilename: 'croqui.png' },     // same area → once
      { labelPt: 'pátio inteiro', labelEn: 'yard', quote: 'com cerca de 38 × 22 m', sourceFilename: 'arquivos/relatorio.pdf' },   // the bundle's path resolves
      { labelPt: 'inventada', labelEn: 'made up', quote: 'área útil de 500 m²', sourceFilename: 'relatorio.pdf' },                // not in the file
      { labelPt: 'sem número', labelEn: 'no number', quote: 'hoje sem uso', sourceFilename: 'relatorio.pdf' },                   // nothing to compute
    ], DOCS);
    expect(ms.map(m => [m.m2, m.sourceFilename])).toEqual([[96, 'relatorio.pdf'], [836, 'relatorio.pdf']]);
    // A sketch's transcription is a source for a MEASURE (it is offered as a chip)…
    expect(keepVerifiedMeasures([{ labelPt: 'canteiro', labelEn: 'bed', quote: 'canteiro livre 12 x 8 m', sourceFilename: 'croqui.png' }], DOCS)).toHaveLength(1);
    // …and never for a note, which is shown as a fact.
    expect(keepVerifiedNotes([note({ quote: 'Croqui à mão: pátio 38 x 22 m; canteiro livre 12 x 8 m', sourceFilename: 'croqui.png' })], DOCS)).toHaveLength(0);
    expect(parseDocumentMeasures(JSON.stringify({ notes: [], measures: ms }))).toHaveLength(2);
    expect(parseDocumentMeasures('{bad')).toEqual([]);
  });

  test('what they SAID is a source too, cited as the conversation — and it moves the signature', () => {
    const said = 'Ipês to preserve: Os dois ipês do canto nordeste não podem ser removidos nem ter raiz cortada.';
    const all = withConversation({ docs: DOCS, site: {}, conversationNotes: said });
    expect(all.at(-1)!.filename).toBe(CONVERSATION_SOURCE);
    const kept = keepVerifiedNotes([note({ solutionId: '*', stance: 'condicao', textPt: 'A organização informou que os dois ipês do canto nordeste ficam.', quote: 'Os dois ipês do canto nordeste não podem ser removidos', sourceFilename: CONVERSATION_SOURCE })], all);
    expect(kept.map(n => n.sourceFilename)).toEqual([CONVERSATION_SOURCE]);
    expect(docsSignature(DOCS, said)).not.toBe(docsSignature(DOCS));
    expect(docsSignature(DOCS, said)).toBe(docsSignature(DOCS, said));
    // A new PICTURE moves it as well now — a sketch can carry a measure.
    expect(docsSignature([...DOCS, { filename: 'outro-croqui.jpg', fullText: 'Croqui: faixa 10 x 4 m, junto ao muro.' }])).not.toBe(docsSignature(DOCS));
  });
});

test.describe('what the platform does NOT leave to the model', () => {
  test('the evidence sentence for a study is found in THEIR file; a mark with none is dropped', () => {
    expect(studyEvidenceIn(REPORT, 'infiltration')).toBe('Foi feito um teste de infiltração com anel simples em dois pontos da faixa de terra.');
    expect(studyEvidenceIn(REPORT, 'hydraulic')).toBeNull();
    // The model attached the mark to a passage about RESULTS; they are shown the sentence that names the test.
    const [kept] = keepVerifiedNotes([note({ studyDone: 'infiltration', quote: 'No canto nordeste há uma faixa de terra de aproximadamente 12 × 8 m, hoje sem uso.' })], DOCS);
    expect(studyProposal([kept], 'infiltration', 'jardins-de-chuva')!.quote).toContain('Foi feito um teste de infiltração');
    // Marked "hydraulic" in a file that never names one: the note stays, the mark goes.
    expect(keepVerifiedNotes([note({ studyDone: 'hydraulic' })], DOCS)[0].studyDone).toBeUndefined();
  });

  test('a quote that ran a sentence into a table keeps the sentence that is really there', () => {
    const ran = 'Foi feito um teste de infiltração com anel simples em dois pontos da faixa de terra. P1 Centro da faixa 4 mm/h Muito baixa';
    expect(salvageQuote(ran, REPORT)).toBe('Foi feito um teste de infiltração com anel simples em dois pontos da faixa de terra.');
    expect(salvageQuote('Nada disso está no arquivo, nem uma frase sequer.', REPORT)).toBeNull();
    expect(keepVerifiedNotes([note({ quote: ran })], DOCS)[0].quote).not.toContain('Muito baixa');
  });

  test('⚠️ what they SAID is on the card whether or not the model cited it — once', () => {
    const said = 'Horário: A zeladoria só abre o portão dos fundos aos sábados de manhã.\nOs dois ipês do canto ficam.';
    expect(conversationLines(said, '').map(n => [n.stance, n.textPt])).toEqual([
      ['dito', 'A zeladoria só abre o portão dos fundos aos sábados de manhã.'],   // the model's label dropped, their sentence kept
      ['dito', 'Os dois ipês do canto ficam.'],
    ]);
    const bare = input({ site_notes: said });
    const card = buildSolutionTest('jardins-de-chuva', bare, undefined, 'pt')!;
    expect(card.fromTheirFiles.filter(n => n.stance === 'dito').map(n => n.source)).toEqual([CONVERSATION_SOURCE, CONVERSATION_SOURCE]);
    expect(card.fromTheirFiles[0].stanceLabel).toBe('Dito na conversa');
    // The model cited the first line as a condition: its note stands, the plain line is not repeated.
    const cited = { solutionId: '*', stance: 'condicao', textPt: 'A organização informou que entregas só podem ocorrer aos sábados de manhã.', textEn: 'x', quote: 'A zeladoria só abre o portão dos fundos aos sábados de manhã.', sourceFilename: CONVERSATION_SOURCE };
    const all = notesFromInput(input({ site_notes: said }, { [DOCUMENT_NOTES_FIELD]: JSON.stringify({ notes: [cited] }) }));
    expect(all.map(n => n.stance)).toEqual(['condicao', 'dito']);
    expect(all[1].textPt).toBe('Os dois ipês do canto ficam.');
  });
});

test.describe('Encontro 3 — in the room', () => {
  test.use({ locale: 'pt-BR' });

  test('their measure is offered and used; the study is asked, confirmed, and the card stops asking for it — across a reload', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model env (for seeding)');
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    const cboId = (await marker.getAttribute('data-cbo-id'))!;
    const S = (sectionId: string, fields: Record<string, string>) => Object.entries(fields).map(([field, value]) => ({ sectionId, field, value }));
    await api.seedState(cboId, { phase: 3, language: 'pt', sections: [
      ...S('org_profile', { org_name: 'APM Caldas Junior' }),
      ...S('intervention_site', { ...SITE, site_knowledge_depth: 'strong', site_area_m2: '836', site_area_source: 'drawn' }),
      ...S('intervention_type', { [DOCUMENT_NOTES_FIELD]: JSON.stringify({
        notes: [note({ studyDone: 'infiltration' })],
        measures: [{ labelPt: 'faixa de terra no canto nordeste', labelEn: 'strip of earth', quote: 'faixa de terra de aproximadamente 12 × 8 m', sourceFilename: 'relatorio.pdf', m2: 96 }],
      }) }),
    ] });
    const chip = (label: string) => page.locator(`[data-testid^="cbo-option-"][data-option-label="${label}"]`);
    const thread = page.getByTestId('cbo-chat-thread');
    const box = page.getByTestId('cbo-chat-input');
    const say = async (t: string) => { await box.fill(t); await box.press('Enter'); };

    await say('Vamos começar o Encontro 3.');
    await chip('É isso ✓').click();
    await expect(chip('📎 Mandar agora')).toBeVisible({ timeout: 20_000 });
    await say('seguir sem');
    await expect(page.getByTestId('cbo-solution-options')).toBeVisible({ timeout: 30_000 });
    await say('Jardins de chuva');

    // The size: 836 m² was drawn in Encontro 2; their report measures the free strip.
    const measure = chip('Usar 96 m² — faixa de terra no canto nordeste');
    await expect(measure).toBeVisible({ timeout: 20_000 });
    await expect(thread.getByText(/aparece uma medida do espaço/)).toBeVisible();
    await measure.click();
    await expect(thread.getByText(/a medida que está em/)).toBeVisible({ timeout: 20_000 });

    // The study: asked, with the passage — and the question survives a reload.
    await expect(chip('Sim, já temos esse estudo')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('solution-test-needs')).toHaveCount(0); // no card yet
    await page.reload();
    await expect(chip('Sim, já temos esse estudo')).toBeVisible({ timeout: 30_000 });
    await chip('Sim, já temos esse estudo').click();

    const needs = page.getByTestId('solution-test-needs').last();
    await expect(needs).toBeVisible({ timeout: 30_000 });
    await expect(needs).toContainText('já realizado, segundo a organização');
    await expect(page.locator('[data-testid="solution-test-verdict-needs_study"]')).toHaveCount(0);
    await expect(page.getByTestId('solution-test-cost').last()).toContainText('96 m²');

    const state = await (await request.get(`/api/cbo/${cboId}`)).json();
    const site = (state.state ?? state).sections.intervention_site.fields;
    expect(site.studies_done.value).toBe('infiltration');
    expect(site.site_area_m2.value).toBe('96');
    expect(site.site_area_source.value).toContain('relatorio.pdf');
  });
});
