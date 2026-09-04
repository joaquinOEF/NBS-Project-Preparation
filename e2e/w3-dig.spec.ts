import { test, expect } from '@playwright/test';
import { acceptDig, digParagraphs, pendingDig, answeredDig, type DigQuestion } from '../shared/w3-dig';

const RECORD = `A praça alaga toda chuva forte. A água fica parada por dias e volta pras casas do fundo.
É o único espaço livre do quarteirão. Antes tinha 4 árvores, cortaram tudo pra fazer estacionamento.
A gente fala com a diretora da escola às vezes.`;

const good = (over: Partial<DigQuestion> = {}) => ({
  askPt: 'Vocês falaram que a água volta pras casas do fundo. Quantas casas são?',
  askEn: 'You said the water comes back into the houses at the back. How many houses are there?',
  notePt: 'O alagamento atinge {answer}, conforme o relato da organização.',
  noteEn: 'The flooding affects {answer}, as the organisation reports it.',
  feeds: 'problema',
  sourceKind: 'quote',
  basedOn: 'a água fica parada por dias e volta pras casas do fundo',
  ...over,
});

const run = (cands: any[], already: DigQuestion[] = []) =>
  acceptDig(cands, { round: 1, record: RECORD, already, max: 3 });

test.describe('a question written for this organisation, and the guards on it', () => {
  test('a good question survives and gets an id', () => {
    const { kept, dropped } = run([good()]);
    expect(dropped).toEqual([]);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toMatch(/^dig-1-/);
    expect(kept[0].round).toBe(1);
  });

  test('⚠️ the NOTE may not speak in the second person', () => {
    // The register rule, at the point it is actually breached. The question is
    // spoken to them; the note is written about them, on a page a funder reads.
    // This exact failure already shipped once, from the decisive-detail
    // question — see docs/document-register.md.
    const { kept, dropped } = run([good({ notePt: 'A água que vocês descrevem atinge {answer}.' })]);
    expect(kept).toHaveLength(0);
    expect(dropped[0].why).toMatch(/segunda pessoa/);
  });

  test('⚠️ a note with nowhere to put the answer is not a note', () => {
    const { dropped } = run([good({ notePt: 'A organização relatou o alagamento.' })]);
    expect(dropped[0].why).toMatch(/onde encaixar/);
  });

  test('⚠️ a number nobody said cannot be asserted back at them', () => {
    // "As 8 casas do fundo alagam sempre?" is a different act from asking how
    // many there are: it invents a fact and then asks them to confirm it, and a
    // confirmed invention is indistinguishable from something they told us.
    const { kept, dropped } = run([good({ askPt: 'As 8 casas do fundo alagam toda vez?' })]);
    expect(kept).toHaveLength(0);
    expect(dropped[0].why).toMatch(/número que ninguém disse/);
  });

  test('a number they DID say may be used', () => {
    // "Antes tinha 4 árvores" is in the record, so asking about the 4 is
    // repeating them, not inventing.
    const { kept } = run([good({ askPt: 'As 4 árvores que cortaram ficavam em que parte da praça?' })]);
    expect(kept).toHaveLength(1);
  });

  test('⚠️ a quote that is not in the record is a fabricated prompt', () => {
    const { dropped } = run([good({ basedOn: 'vocês contaram que a escola fica alagada até o segundo andar' })]);
    expect(dropped[0].why).toMatch(/não está no registro/);
  });

  test('a quote wrapped in commentary is still a quote', () => {
    // ⚠️ From the first live run: the model wrote «As próprias palavras delas:
    // "A água fica parada por dias" — mas sem número concreto» and the check
    // read the preamble as the quote, rejecting a perfectly grounded question.
    const { kept } = run([good({ basedOn: 'As próprias palavras delas: "A água fica parada por dias" — sem número registrado' })]);
    expect(kept).toHaveLength(1);
  });

  test('⚠️ a question from a PHOTOGRAPH is not checked against the text — and is kept', () => {
    // The strongest question available is the one nobody could ask without
    // having looked, and it can never be found in a written record. Demanding
    // that it be there rejected exactly the questions worth keeping.
    const { kept, dropped } = run([good({
      sourceKind: 'photo',
      basedOn: 'foto 03: paralelepípedo rachado com lama acumulada entre as pedras',
      askPt: 'Na foto do chão dá pra ver lama entre as pedras. Esse trecho fica encharcado o ano todo?',
    })]);
    expect(dropped).toEqual([]);
    expect(kept[0].sourceKind).toBe('photo');
  });

  test('an unknown provenance is not a provenance', () => {
    expect(run([good({ sourceKind: 'vibes' as any })]).dropped[0].why).toMatch(/origem desconhecida/);
  });

  test('a section that does not exist costs the question, not the round', () => {
    const { kept, dropped } = run([good({ feeds: 'antecedentes' as any }), good({ askPt: 'Quem cuida da praça hoje?' })]);
    expect(dropped[0].why).toMatch(/seção inexistente/);
    expect(kept).toHaveLength(1);
  });

  test('nothing is asked twice — not in the round, not against an earlier one', () => {
    const earlier = run([good()]).kept;
    expect(run([good()], earlier).dropped[0].why).toMatch(/já perguntada/);
    expect(run([good(), good()]).kept).toHaveLength(1);
  });

  test('it stops at the round budget', () => {
    const many = Array.from({ length: 9 }, (_, i) => good({ askPt: `Pergunta número ${i} sobre a praça?` , askEn: `Question ${i} about the square?` }));
    // ⚠️ "número 4" is legitimate — 4 is in the record. The others carry digits
    // nobody said, which is the guard doing its job on a synthetic input.
    expect(run(many).kept.length).toBeLessThanOrEqual(3);
  });

  test('a statement is not a question', () => {
    expect(run([good({ askPt: 'Vocês deviam contar quantas casas alagam.' })]).dropped[0].why).toMatch(/não é uma pergunta/);
  });
});

test.describe('what reaches the page', () => {
  const answered = (answer: string): DigQuestion => ({ ...(good() as any), id: 'd1', round: 1, answer });

  test('the answer arrives inside a written sentence, not beside a question', () => {
    const [p] = digParagraphs([answered('umas 8 casas, as do fundo')], 'pt');
    expect(p.text).toBe('O alagamento atinge umas 8 casas, as do fundo, conforme o relato da organização.');
    expect(p.feeds).toBe('problema');
  });

  test('the speaker\'s full stop does not collide with the template\'s', () => {
    // Somebody speaking ends a sentence; the template supplies its own. Together
    // they printed "…que cortam caminho por ali.." on a funder's page.
    const [p] = digParagraphs([answered('as famílias das dez casas do fundo.')], 'pt');
    expect(p.text).toContain('do fundo, conforme');
    expect(p.text).not.toContain('..');
  });

  test('⚠️ "não sei" stays in the record and off the document', () => {
    // A real answer in the room — it tells the coordination where to look — and
    // a lie on a page, where it reads as though somebody had told us something.
    expect(digParagraphs([answered('não sei')], 'pt')).toEqual([]);
    expect(digParagraphs([answered('')], 'pt')).toEqual([]);
    expect(answeredDig([answered('não sei')])).toEqual([]);
  });

  test('⚠️ a declined question is closed, not asked again forever', () => {
    // '' means asked and declined; undefined means never asked. Conflating them
    // is an infinite loop with a friendly face.
    const asked: DigQuestion = { ...(good() as any), id: 'd1', round: 1, answer: '' };
    const unasked: DigQuestion = { ...(good() as any), id: 'd2', round: 1 };
    expect(pendingDig([asked], 1)).toBeNull();
    expect(pendingDig([asked, unasked], 1)?.id).toBe('d2');
  });

  test('rounds are served separately', () => {
    const r1: DigQuestion = { ...(good() as any), id: 'd1', round: 1, answer: 'oito' };
    const r2: DigQuestion = { ...(good() as any), id: 'd2', round: 2 };
    expect(pendingDig([r1, r2], 1)).toBeNull();
    expect(pendingDig([r1, r2], 2)?.id).toBe('d2');
  });
});
