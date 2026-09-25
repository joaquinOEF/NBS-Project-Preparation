import { test, expect } from '@playwright/test';
import { serveE3Checkpoint } from '../server/services/cboE3Checkpoint';
import { parseTests } from '../shared/w3-tests';
import { buildSolutionTest } from '../shared/w3-solution-test';
import { buildComparison, portfolioTakeaway } from '../shared/w3-comparison';
import { renderComparisonHtml } from '../server/services/comparisonPrint';
import { CRITERIA, fitFor, criteriaScore, hardestOptions, parseCriteria, criteriaSentence } from '../shared/w3-criteria';
import type { W3Input } from '../shared/w3-dossier';

// TESTING A SOLUTION MAKES THEM THINK — not just tap.
//
// A staging run (21 Sept) tested three solutions in 100 seconds and all three
// "made sense": a card and a thumb. JVP: "are we getting enough information from
// the person? … if I hadn't added [8 files], would it have been as fast? … they
// get the solutions but they're also … thinking about what they could or could
// not do." So: what weighs most, ONCE, before any option is on the table; two
// questions per test that only they can answer; and a comparison ordered by
// their own criteria. This is the path of an organisation that uploaded NOTHING.

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const F = (v: string) => ({ value: v, confidence: 'high', source: 'user' });

function session() {
  const state: any = { phase: 3, editLog: [], gaps: [], maturityScores: [], priorityFlags: [], metadata: { language: 'pt' }, sections: {} };
  for (const id of ['org_profile', 'intervention_site', 'intervention_type', 'impact_monitoring', 'operations_sustain', 'needs_support', 'results_evidence']) state.sections[id] = { fields: {} };
  const put = (sid: string, kv: Record<string, string>) => { for (const [k, v] of Object.entries(kv)) state.sections[sid].fields[k] = F(v); };
  put('org_profile', { org_name: 'Coletivo Sem Arquivo', contact_name: 'Rosa' });
  put('intervention_site', { site_name: 'Praça do Meio', bairro: 'Sarandi', _site_lat: '-30.0', _site_lng: '-51.1', current_use: 'paved', land_tenure: 'public-informal', site_worry: 'alagamento', nbs_interest: 'aguas-pluviais', site_story: 'A água fica dias.', site_area_m2: '300', site_area_source: 'drawn' });
  put('intervention_type', { _e3_opened: 'yes', _material_pending: 'yes' });
  const deps: any = { writeFields: (sid: string, kv: Record<string, string>) => put(sid, kv), recordCheckpoint: () => {}, normChip: norm, recordMaturity: () => {} };
  const send = async (msg: string, kind = 'chip') => {
    const events: any[] = [];
    await serveE3Checkpoint('spec', msg, state, (e: any) => events.push(e), 'pt', kind, deps);
    const asks = events.filter(e => e.type === 'ask_user');
    return { events, ask: asks[asks.length - 1], said: events.filter(e => e.type === 'chat').map(e => e.content).join('\n'), card: events.some(e => e.type === 'show_solution_test'), cmp: events.find(e => e.type === 'show_comparison')?.comparison };
  };
  const type = (k: string) => String(state.sections.intervention_type.fields[k]?.value ?? '');
  return { state, send, type, tests: () => parseTests(type('solution_tests_json')) };
}
const labels = (ask: any) => (ask?.options ?? []).map((o: any) => o.label);

test.describe('an organisation with no files walks Encontro 3', () => {
  test('criteria once → per test: size, card, who, hardest, reaction → a comparison ordered by what they said', async () => {
    const s = session();
    // The door closes → before ANY option: what weighs most.
    const crit = await s.send('Seguir sem');
    expect(crit.ask.question).toContain('O que pesa mais?');
    expect(labels(crit.ask)).toEqual([...CRITERIA.map(c => c.chipPt), 'Prefiro não escolher agora']);
    const second = await s.send('Dar pra fazer com a nossa gente');
    expect(second.ask.question).toContain('Mais uma coisa que pesa?');
    expect(labels(second.ask)).not.toContain('Dar pra fazer com a nossa gente');
    const shelf = await s.send('Custar pouco');           // the second pick closes it: two at most
    expect(shelf.said).toContain('A comparação vai ser ordenada por isso');
    expect(shelf.ask.question).toBe('Qual vocês querem testar primeiro?');
    expect(s.type('_choice_criteria')).toBe('nossa-gente,custo');
    expect(s.type('choice_criteria'), 'the PUBLIC field holds words — it is printed as it is').toBe('dar pra fazer com a nossa gente; custar pouco');

    // Test 1 — the card, then two questions BEFORE the thumb.
    await s.send('Jardins de chuva');
    const card1 = await s.send('Confere ✓');
    expect(card1.card).toBe(true);
    expect(card1.ask.question).toBe('Se fosse pra fazer isso aí: quem faria?');
    const hard = await s.send('a gente, em mutirão', 'text');                 // typed — the contract canonicalises it
    expect(hard.card, 'the card is NOT pushed a second time').toBe(false);
    expect(hard.ask.question).toBe('E o que mais pega, pra vocês?');
    // Only what THIS card carries: it needs a study, so the study is an option; no authorisation chip it does not have.
    expect(labels(hard.ask)).toContain('O estudo técnico');
    expect(labels(hard.ask)).toContain('✍️ Outra coisa');
    const react = await s.send('Ninguém aqui sabe mexer com dreno, e a prefeitura não responde.', 'text');   // their own words
    expect(react.said).toContain('com as palavras de vocês');
    expect(react.ask.question).toBe('Vendo isso, o que vocês acham?');
    let next = await s.send('Faz sentido pra gente');
    if (next.ask?.question !== 'E agora?') next = await s.send('Não sei dizer');
    await s.send('Testar outra solução');

    // Test 2 — a counted solution; "não sei" is an answer to both.
    await s.send('Captação de água da chuva').then(async r => { if (!r.ask) return; });
    if (!s.tests().some(t => t.solutionId === 'captacao-agua-da-chuva')) { await s.send('Ver todas as soluções'); await s.send('Captação de água da chuva'); }
    const card2 = await s.send('2');
    expect(card2.ask.question).toBe('Se fosse pra fazer isso aí: quem faria?');
    await s.send('Teria que contratar');
    await s.send('O custo');
    await s.send('Ainda não sabemos');

    const [t1, t2] = s.tests();
    expect([t1.who, t1.hardest, t1.hardestNote]).toEqual(['nos', 'outro', 'Ninguém aqui sabe mexer com dreno, e a prefeitura não responde.']);
    expect([t2.who, t2.hardest]).toEqual(['contratar', 'custo']);

    // The comparison: said how it is ordered, their rows present, their words quoted.
    const out = await s.send('Ver a comparação');
    expect(out.said).toContain('ordenada pelo que vocês disseram que pesa mais');
    const cmp = out.cmp;
    expect(cmp.rows.map((r: any) => r.id).slice(0, 1)).toEqual(['criteria']);
    expect(cmp.rows.map((r: any) => r.id)).toEqual(expect.arrayContaining(['who', 'hardest']));
    const jardim = cmp.columns.find((c: any) => c.solutionId === 'jardins-de-chuva');
    expect(jardim.who).toBe('A própria organização, em mutirão');
    expect(jardim.hardest).toBe('“Ninguém aqui sabe mexer com dreno, e a prefeitura não responde.”');
    // ⚠️ THEIR answer outranks our classification: they said they would do it themselves.
    expect(jardim.criteria.find((c: any) => c.id === 'nossa-gente')).toMatchObject({ fit: 'bom', source: 'resposta da organização' });
    expect(cmp.columns.find((c: any) => c.solutionId === 'captacao-agua-da-chuva').criteria.find((c: any) => c.id === 'nossa-gente').fit).toBe('fraco');
    expect(cmp.columns[0].solutionId, 'ordered by their criteria, not by the order tested').toBe('jardins-de-chuva');

    // The closing box (Vila Flores, 24 Sept): the visit and the room get one
    // question before the close; a note is kept in their words, and it prints.
    const box = await s.send('Fechar o Encontro 3 ✓');
    expect(box.ask.question).toBe('Alguma observação?');
    expect(labels(box.ask)).toEqual(['📎 Mandar agora', 'Pode fechar ✓']);
    const noted = await s.send('Na visita a diretora disse que a obra só pode ser em janeiro.', 'text');
    expect(noted.said).toContain('Anotado ✓');
    expect(noted.ask.question).toBe('Mais alguma coisa?');
    expect(s.type('closing_observations')).toBe('Na visita a diretora disse que a obra só pode ser em janeiro.');
    expect(s.type('_e3_closed'), 'the box is not the close').toBe('');

    // The close carries the hand-off to the project-based encontro.
    const close = await s.send('Pode fechar ✓');
    expect(close.said).toContain('Pra levar à mesa do portfólio');
    expect(close.said).toContain('quem faria — a própria organização, em mutirão');
    expect(close.said).toContain('o que mais pega, segundo a organização');
  });

  test('⚠️ skipping "o que mais pega?" is not "nada disso pega" (22 Sept audit)', async () => {
    // Stored as 'nada', a skip printed "Nada de grande" in the comparison under
    // a question they never answered.
    const s = session();
    await s.send('Seguir sem'); await s.send('Prefiro não escolher agora');
    await s.send('Jardins de chuva'); await s.send('Confere ✓');
    await s.send('Teria que contratar');
    const after = await s.send('Prefiro pular', 'text');
    expect(after.ask.question).toBe('Vendo isso, o que vocês acham?');
    expect(s.tests()[0].hardest).toBe('pulou');
    await s.send('Faz sentido pra gente');
    const cmp = (await s.send('Ver a comparação')).cmp;
    const col = cmp.columns.find((c: any) => c.solutionId === 'jardins-de-chuva');
    expect(col.hardest, 'an unanswered question prints as nothing, not as an answer').toBeNull();
    // And a tapped "Nada disso pega" is still an answer.
    const t = session();
    await t.send('Seguir sem'); await t.send('Prefiro não escolher agora');
    await t.send('Jardins de chuva'); await t.send('Confere ✓');
    await t.send('Teria que contratar'); await t.send('Nada disso pega');
    expect(t.tests()[0].hardest).toBe('nada');
  });

  test('two worries: "qual pesa mais?" first, THEN "o que pesa mais pra escolher?" — never skipped (end-to-end run, 21 Sept)', async () => {
    const s = session();
    s.state.sections.intervention_site.fields.site_worry = F('heat, enxurrada');
    const focus = await s.send('Seguir sem');
    expect(focus.ask.question).toBe('Qual delas pesa mais no dia a dia?');
    const crit = await s.send(focus.ask.options[0].label);
    expect(crit.ask.question).toContain('O que pesa mais?');
  });

  test('"Prefiro não escolher agora" is respected: no criteria row, the order tested, nothing asked twice', async () => {
    const s = session();
    await s.send('Seguir sem');
    const shelf = await s.send('Prefiro não escolher agora');
    expect(shelf.ask.question).toBe('Qual vocês querem testar primeiro?');
    expect(s.type('_criteria_done')).toBe('yes');
    await s.send('Vamos começar o Encontro 3.', 'system');
    expect((await s.send('Vamos começar o Encontro 3.', 'system')).ask.question, 'a return does not re-ask the criteria').not.toContain('O que pesa mais');
  });
});

test.describe('the pure half', () => {
  const INPUT: W3Input = { org: { org_name: 'X' }, site: { bairro: 'Sarandi', site_name: 'Praça', _site_lat: '-30', _site_lng: '-51', site_worry: 'alagamento', current_use: 'paved', land_tenure: 'public-informal', nbs_interest: 'aguas-pluviais' }, areaM2: 300, w3: { _choice_criteria: 'custo,efeito' } };
  const at = '2026-09-30T12:00:00.000Z';

  test('every criterion is read off the card by a function, with its source — for all 27 solutions', async () => {
    const { NBS_SOLUTIONS } = await import('../shared/nbs-catalog');
    for (const sol of NBS_SOLUTIONS) {
      const card = buildSolutionTest(sol.id, INPUT, undefined, 'pt')!;
      for (const c of CRITERIA) {
        const f = fitFor(c.id, card, undefined, 'pt');
        expect(['bom', 'medio', 'fraco'], `${sol.id} · ${c.id}`).toContain(f.fit);
        expect(f.why.length, `${sol.id} · ${c.id} says why`).toBeGreaterThan(5);
        expect(f.source).not.toMatch(/shared\/|server\/|_/);
      }
      const opts = hardestOptions(card, 'pt');
      expect(opts.some(o => o.id === 'autorizacao')).toBe(card.verdict.state === 'needs_permission');
      expect(opts.some(o => o.id === 'estudo')).toBe(card.verdict.state === 'needs_study');
    }
    expect(parseCriteria('custo,bogus,efeito,nossa-gente')).toEqual(['custo', 'efeito']);
    expect(criteriaSentence(['custo', 'efeito'], 'pt')).toBe('custar pouco; resolver mais o problema');
    // The first criterion named counts double.
    expect(criteriaScore([{ id: 'custo', fit: 'bom', why: '', source: '' }, { id: 'efeito', fit: 'fraco', why: '', source: '' }]))
      .toBeGreaterThan(criteriaScore([{ id: 'custo', fit: 'fraco', why: '', source: '' }, { id: 'efeito', fit: 'bom', why: '', source: '' }]));
  });

  test('the cost reading agrees with the PRICE on the card, and "with a partner" is not "on our own" (end-to-end run, 21 Sept)', () => {
    const slope: W3Input = { org: { org_name: 'X' }, site: { bairro: 'Morro da Cruz', site_name: 'Barranco', _site_lat: '-30', _site_lng: '-51', site_worry: 'landslide', current_use: 'vegetated', land_tenure: 'public-informal', nbs_interest: 'encostas-e-solo' }, areaM2: 40, w3: {} };
    const t = (solutionId: string, extra = {}) => ({ solutionId, reaction: null, testedAt: at, areaM2: 40, ...extra });
    const muro = buildSolutionTest('muro-de-arrimo-verde', slope, t('muro-de-arrimo-verde'), 'pt')!;
    const grade = buildSolutionTest('grade-viva', slope, t('grade-viva'), 'pt')!;
    const rank = { bom: 2, medio: 1, fraco: 0 } as const;
    // The wall is priced BELOW the grade at 40 m²; its cost reading must not say worse.
    expect(rank[fitFor('custo', muro, undefined, 'pt').fit]).toBeGreaterThanOrEqual(rank[fitFor('custo', grade, undefined, 'pt').fit]);
    expect(fitFor('custo', muro, undefined, 'pt').source).toBe('faixa de preço da ficha, no tamanho testado');
    expect(fitFor('nossa-gente', grade, t('grade-viva', { who: 'nos-com-parceiro' }) as any, 'pt').fit).toBe('medio');
  });

  test('the closing observations print on the comparison, under their own heading, one per line (24 Sept)', () => {
    const tests = [{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido' as const, testedAt: at }];
    const cmp = buildComparison({ ...INPUT, w3: { ...INPUT.w3, closing_observations: 'Obra só em janeiro, segundo a direção.\nArquivo enviado: relatorio-visita.pdf' } }, tests, 'pt');
    expect(cmp.closingNotes).toEqual(['Obra só em janeiro, segundo a direção.', 'Arquivo enviado: relatorio-visita.pdf']);
    const html = renderComparisonHtml(cmp, 'pt');
    expect(html).toContain('Observações do fechamento');
    expect(html).toContain('Obra só em janeiro, segundo a direção.');
    expect(renderComparisonHtml(buildComparison(INPUT, tests, 'pt'), 'pt'), 'nothing said, no heading').not.toContain('Observações do fechamento');
  });

  test('a session from before these questions keeps exactly the comparison it had; the print carries the takeaway', () => {
    const tests = [{ solutionId: 'jardins-de-chuva', reaction: 'faz-sentido' as const, testedAt: at }, { solutionId: 'captacao-agua-da-chuva', reaction: 'nao-e-pra-gente' as const, units: 2, testedAt: at }];
    const old = buildComparison({ ...INPUT, w3: {} }, tests, 'pt');
    expect(old.rows.map(r => r.id)).not.toEqual(expect.arrayContaining(['criteria', 'who', 'hardest']));
    expect(old.columns.map(c => c.solutionId)).toEqual(['jardins-de-chuva', 'captacao-agua-da-chuva']);
    const now = buildComparison(INPUT, [{ ...tests[0], who: 'nos-com-parceiro', hardest: 'estudo' }, tests[1]], 'pt');
    expect(portfolioTakeaway(now, 'pt')).toHaveLength(1);
    const html = renderComparisonHtml(now, 'pt');
    expect(html).toContain('Para a conversa de portfólio');
    expect(html).toContain('No que pesa pra organização');
    expect(html).toContain('quem faria — a organização, com um parceiro técnico');
    expect(html).not.toMatch(/\bvocês\b|nossa-gente|nos-com-parceiro|_choice/);
    expect(portfolioTakeaway(buildComparison(INPUT, [{ ...tests[1] }], 'pt'), 'pt')[0]).toContain('Nenhuma das 1 soluções');
  });
});
