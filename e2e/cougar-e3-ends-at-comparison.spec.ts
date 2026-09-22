import { test, expect } from '@playwright/test';
import { serveE3Checkpoint } from '../server/services/cboE3Checkpoint';
import { encontroClosed } from '../shared/cbo-schema';
import { parseTests } from '../shared/w3-tests';
import { buildSolutionTest } from '../shared/w3-solution-test';

// ENCONTRO 3 ENDS AT THE COMPARISON — and what JVP's staging run of 21 Sept found.
//
// The run (session c2a6ab61, read back from the staging API): three solutions
// tested in 100 seconds; a green roof priced over the 2,900 m² drawn for the
// SITE (R$ 435 mil–1 mi) because a counted solution tested first switched the
// size question off; eight uploaded files whose findings never surfaced because
// none of the three solutions tested was one the files speak about; three
// questions written for this organisation generated and never asked; and an
// eleven-question "detalhar" tail tapped through in fifty seconds, asking "who
// builds this?" once across three different solutions. Driven in-process: the
// checkpoint is a module with its dependencies passed in.

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const F = (v: string) => ({ value: v, confidence: 'high', source: 'user' });

function session(extraType: Record<string, string> = {}, deps: Record<string, unknown> = {}) {
  const state: any = { phase: 3, editLog: [], gaps: [], maturityScores: [], priorityFlags: [], metadata: { language: 'pt' }, sections: {} };
  for (const id of ['org_profile', 'intervention_site', 'intervention_type', 'impact_monitoring', 'operations_sustain', 'needs_support', 'results_evidence']) state.sections[id] = { fields: {} };
  const put = (sid: string, kv: Record<string, string>) => { for (const [k, v] of Object.entries(kv)) state.sections[sid].fields[k] = F(v); };
  put('org_profile', { org_name: 'APM Caldas Junior', contact_name: 'Maria' });
  put('intervention_site', { site_name: 'Colégio Caldas Junior', bairro: 'Partenon', _site_lat: '-30.0582', _site_lng: '-51.1598', current_use: 'paved', land_tenure: 'formal-agreement', site_worry: 'heat, enxurrada', nbs_interest: 'verde-urbano, aguas-pluviais', site_story: 'O pátio esquenta muito.', site_area_m2: '2900', site_area_source: 'drawn', _worry_focus_done: 'yes' });
  put('intervention_type', { _e3_opened: 'yes', _material_done: 'yes', ...extraType });
  const started: string[] = [];
  const allDeps: any = {
    writeFields: (sid: string, kv: Record<string, string>) => put(sid, kv),
    recordCheckpoint: () => {}, normChip: norm,
    recordMaturity: (scores: any[]) => { for (const sc of scores) { state.maturityScores = state.maturityScores.filter((m: any) => m.metric !== sc.metric); state.maturityScores.push(sc); } },
    // This spec is about the ending, the sizes and the files; the deliberation beats have their own.
    quickTests: true,
    startDig: (r: number) => started.push(`dig${r}`), startAdvisor: () => started.push('advisor'), startDocumentReader: () => started.push('reader'),
    ...deps,
  };
  const send = async (msg: string, kind = 'chip') => {
    const events: any[] = [];
    const served = await serveE3Checkpoint('spec', msg, state, (e: any) => events.push(e), 'pt', kind, allDeps);
    const asks = events.filter(e => e.type === 'ask_user');
    return { served, events, ask: asks[asks.length - 1], said: events.filter(e => e.type === 'chat').map(e => e.content).join('\n'), done: events.filter(e => e.type === 'done').pop()?.summary ?? '' };
  };
  const type = (k: string) => String(state.sections.intervention_type.fields[k]?.value ?? '');
  return { state, send, type, started, tests: () => parseTests(type('solution_tests_json')) };
}

const NOTES = JSON.stringify({
  notes: [
    { solutionId: 'captacao-agua-da-chuva', stance: 'a-favor', textPt: 'O relatório recomenda duas cisternas junto aos pilares.', textEn: 'x', quote: 'Faz sentido: captar a água do telhado da quadra', sourceFilename: '03-relatorio.pdf' },
    { solutionId: 'pavimentos-permeaveis', stance: 'contra', textPt: 'O relatório desaconselha pavimento permeável no pátio.', textEn: 'x', quote: 'Não recomendo agora: pavimento permeável no pátio.', sourceFilename: '03-relatorio.pdf' },
  ],
  measures: [
    { labelPt: 'faixa de terra no canto nordeste', labelEn: 'strip', quote: 'faixa de terra de aproximadamente 12 × 8 m', sourceFilename: '03-relatorio.pdf', m2: 96 },
    { labelPt: 'telhado da quadra coberta', labelEn: 'court roof', quote: 'telhado ± 30 × 20 m', sourceFilename: '02-croqui.png', m2: 600 },
  ],
});
const labels = (ask: any) => (ask?.options ?? []).map((o: any) => o.label);

test.describe('the size belongs to the test', () => {
  test('⚠️ a counted solution first, then a green roof: the roof is ASKED its size, offered the ROOF\'s measure, and never priced over the site', async () => {
    const s = session({ _document_notes_json: NOTES });
    await s.send('Vamos começar o Encontro 3.', 'system');
    await s.send('Escola verde'); await s.send('2'); await s.send('Faz sentido pra gente'); await s.send('Testar outra solução');
    const roof = await s.send('Teto verde');
    expect(roof.ask.question, 'the size question is back — it was skipped on staging').toBe('Ainda é esse o tamanho?');
    expect(roof.said).toContain('telhado ou da laje');
    expect(labels(roof.ask).join(' | ')).toContain('Usar 600 m² — telhado da quadra coberta');
    expect(labels(roof.ask).join(' | '), 'the ground strip is not a roof').not.toContain('96 m²');
    await s.send('Usar 600 m² — telhado da quadra coberta');
    const t = s.tests().find(x => x.solutionId === 'teto-verde')!;
    expect(t.areaM2).toBe(600);
    expect(String(s.state.sections.intervention_site.fields.site_area_m2.value), 'the PLACE keeps its own footprint').toBe('2900');
    const input: any = { site: Object.fromEntries(Object.entries(s.state.sections.intervention_site.fields).map(([k, f]: any) => [k, f.value])), areaM2: 2900, w3: {} };
    expect(buildSolutionTest('teto-verde', input, t, 'pt')!.sizedBy).toEqual({ areaM2: 600 });
    // "não sei" is unknown for the test — never the site's 2,900 m² by default.
    expect(buildSolutionTest('teto-verde', input, { ...t, areaM2: 0 }, 'pt')!.sizedBy).toEqual({});
  });

  test('once per SURFACE — and OFFERED, never inherited in silence: one tap carries the ground\'s size', async () => {
    const s = session({ _document_notes_json: NOTES });
    await s.send('Vamos começar o Encontro 3.', 'system');
    await s.send('Jardins de chuva');
    const card = await s.send('Usar 96 m² — faixa de terra no canto nordeste');
    expect(card.events.some(e => e.type === 'show_solution_test')).toBe(true);
    // The reaction, then this solution's own decisive detail if it has one, then the loop question.
    let next = await s.send('Não é pra gente');
    if (next.ask?.question !== 'E agora?') next = await s.send('Não sei dizer');
    expect(next.ask?.question).toBe('E agora?');
    await s.send('Testar outra solução');
    const second = await s.send('Biovaletas');
    // Not the size question again — the number they already settled, shown with
    // the solution it came from. "Ground" covers a strip of earth and a cemented
    // yard alike, and taking the first test's number in silence priced two
    // solutions over the whole patio on staging (22 Sept).
    expect(second.ask?.question).not.toBe('Ainda é esse o tamanho?');
    expect(second.ask?.question).toContain('vale o mesmo tamanho');
    expect(second.ask?.options?.map((o: any) => o.label)).toContain('Sim, o mesmo tamanho');
    expect(s.tests().find(x => x.solutionId === 'biovaletas')?.areaM2, 'nothing is written until they say so').toBeUndefined();
    const carried = await s.send('Sim, o mesmo tamanho');
    expect(carried.events.some(e => e.type === 'show_solution_test')).toBe(true);
    expect(s.tests().find(x => x.solutionId === 'biovaletas')!.areaM2).toBe(96);
  });
});

test.describe('what their files speak about is put in front of them', () => {
  test('pinned on the shelf, named with the file and its stance — and never over a seat that answers their main worry', async () => {
    const s = session({ _document_notes_json: NOTES });
    const shelf = await s.send('Vamos começar o Encontro 3.', 'system');
    expect(labels(shelf.ask)).toEqual(expect.arrayContaining(['Captação de água da chuva', 'Pavimentos permeáveis']));
    expect(shelf.said).toContain('O que vocês mandaram fala de');
    expect(shelf.said).toMatch(/Captação de água da chuva\*\* \(a favor — 03-relatorio\.pdf\)/);
    expect(shelf.said).toMatch(/Pavimentos permeáveis\*\* \(contra/);
    // Heat is what they said weighs most: the first seats still answer it.
    expect(labels(shelf.ask).slice(0, 2)).toEqual(expect.arrayContaining(['Escola verde']));
    // A chip carries one sentence, not the advisor's paragraph.
    for (const o of shelf.ask.options) expect(String(o.description ?? '').length).toBeLessThanOrEqual(135);
  });

  test('asked ONCE before comparing over them; "compare anyway" is respected', async () => {
    const s = session({ _document_notes_json: NOTES });
    await s.send('Vamos começar o Encontro 3.', 'system');
    await s.send('Escola verde'); await s.send('2'); await s.send('Faz sentido pra gente');
    const nudge = await s.send('Ver a comparação');
    expect(nudge.done).toContain('files-nudge');
    expect(nudge.ask.question).toBe('Querem testar antes de comparar?');
    expect(labels(nudge.ask)).toEqual(['Captação de água da chuva', 'Pavimentos permeáveis', 'Ver a comparação']);
    const cmp = await s.send('Ver a comparação');
    expect(cmp.events.some(e => e.type === 'show_comparison')).toBe(true);
    // No files, no nudge.
    const bare = session();
    await bare.send('Vamos começar o Encontro 3.', 'system');
    await bare.send('Escola verde'); await bare.send('2'); await bare.send('Faz sentido pra gente');
    expect((await bare.send('Ver a comparação')).events.some(e => e.type === 'show_comparison')).toBe(true);
  });
});

test.describe('the comparison is the end', () => {
  test('no "detalhar": test one more, or close — three scores, the close marker, nothing from the tail', async () => {
    const s = session();
    await s.send('Vamos começar o Encontro 3.', 'system');
    await s.send('Escola verde'); await s.send('2'); await s.send('Faz sentido pra gente');
    const cmp = await s.send('Ver a comparação');
    expect(labels(cmp.ask)).toEqual(['Fechar o Encontro 3 ✓', 'Testar mais uma']);
    expect(encontroClosed(s.state, 3)).toBe(false);
    const close = await s.send('Fechar o Encontro 3 ✓');
    expect(close.said).toContain('ficaram com **Escola verde**');
    expect(close.said).toContain('vai pra conversa de portfólio');
    expect(close.events.some(e => e.type === 'show_roadmap'), 'the roadmap is no longer an Encontro 3 output').toBe(false);
    expect(s.type('_e3_closed')).toBe('yes');
    expect(s.type('construction_model')).toBe('');
    expect(s.state.maturityScores.map((m: any) => m.metric).sort()).toEqual(['climate_nbs_impact', 'problem_clarity', 'solution_clarity']);
    expect(encontroClosed(s.state, 3), 'closed by its own marker — the fourth score moved out with the tail').toBe(true);
    // A return says so again.
    expect((await s.send('Vamos começar o Encontro 3.', 'system')).said).toContain('vai pra conversa de portfólio');
  });

  test('chips from before the change still land: "Detalhar agora" → the comparison, "Deixar pra depois" → the close', async () => {
    const s = session();
    await s.send('Vamos começar o Encontro 3.', 'system');
    await s.send('Escola verde'); await s.send('2'); await s.send('Ainda não sabemos'); await s.send('Ver a comparação');
    expect((await s.send('Detalhar agora')).events.some(e => e.type === 'show_comparison')).toBe(true);
    const close = await s.send('Deixar pra depois');
    expect(close.said).toContain('nenhuma fechou ainda');
    expect(s.type('_e3_closed')).toBe('yes');
  });

  test('a session that STARTED the tail under the old flow finishes it; the switch keeps the tail testable', async () => {
    const old = session({ solution_tests_json: JSON.stringify([{ solutionId: 'escola-verde', reaction: 'faz-sentido', units: 2, testedAt: '2026-09-20T12:00:00.000Z' }]), chosen_solutions: 'escola-verde', construction_model: 'mutirao', _comparison_shown: 'yes' });
    const back = await old.send('Vamos começar o Encontro 3.', 'system');
    expect(back.ask?.question, 'mid-tail sessions are not dropped').not.toBe('E agora?');
    const sw = session({ _tail_enabled: 'yes' });
    await sw.send('Vamos começar o Encontro 3.', 'system');
    await sw.send('Escola verde'); await sw.send('2'); await sw.send('Faz sentido pra gente');
    expect(labels((await sw.send('Ver a comparação')).ask)).toContain('Detalhar agora');
  });
});

test.describe('the questions written for THIS organisation are asked — before the comparison', () => {
  const DIG = JSON.stringify([
    { id: 'dig-1-1', round: 1, askPt: 'No croqui a água vem também do muro dos fundos. O vizinho é um prédio, um galpão?', askEn: 'x', notePt: '{answer}', noteEn: '{answer}', feeds: 'problema', basedOn: 'croqui', sourceKind: 'photo' },
    { id: 'dig-1-2', round: 1, askPt: 'Quantas turmas usam o pátio no recreio?', askEn: 'x', notePt: '{answer}', noteEn: '{answer}', feeds: 'problema', basedOn: 'ata', sourceKind: 'doc' },
    { id: 'dig-1-3', round: 1, askPt: 'Terceira pergunta.', askEn: 'x', notePt: '{answer}', noteEn: '{answer}', feeds: 'problema', basedOn: 'ata', sourceKind: 'doc' },
  ]);

  test('started at the door, asked before the comparison, two at most, skippable', async () => {
    const s = session({ _material_done: '', _material_pending: 'yes' });
    await s.send('Seguir sem');
    expect(s.started, 'written WHILE they test — not at the end of a tail that no longer runs').toEqual(expect.arrayContaining(['advisor', 'reader', 'dig1']));
    s.state.sections.intervention_type.fields.dig_json = F(DIG);
    await s.send('Escola verde'); await s.send('2'); await s.send('Faz sentido pra gente');
    const q1 = await s.send('Ver a comparação');
    expect(q1.said).toContain('muro dos fundos');
    const q2 = await s.send('É um prédio de três andares, muro de uns 4 metros.', 'text');
    expect(q2.said).toContain('Quantas turmas');
    const cmp = await s.send('Prefiro pular');
    expect(cmp.events.some(e => e.type === 'show_comparison'), 'two at most — a third is a form').toBe(true);
    const dig = JSON.parse(s.type('dig_json'));
    expect(dig[0].answer).toContain('três andares');
    expect(dig[1].answer).toBe('');
    expect(dig[2].answer).toBeUndefined();
  });
});

test('⚠️ a trace made during a test is that test\'s size — the place keeps its footprint (22 Sept audit)', async () => {
  // Written straight to the place, a roof traced for a teto verde became the
  // "Ainda é esse o tamanho?" offered to the next solution on the ground.
  const s = session();
  await s.send('Vamos começar o Encontro 3.', 'system');
  await s.send('Teto verde');
  const traced = await s.send('Map selection (e3 footprint): Colégio Caldas Junior · 450 m²', 'map');
  expect(traced.said).toContain('450 m²');
  expect(String(s.state.sections.intervention_site.fields.site_area_m2.value), 'the place keeps the 2,900 m² drawn in Encontro 2').toBe('2900');
  expect(s.tests().find(t => t.solutionId === 'teto-verde')?.areaM2).toBe(450);
});
