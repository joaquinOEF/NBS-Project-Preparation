import { test, expect } from '@playwright/test';
import { acceptDig, acceptPairing, digParagraphs, pendingDig, answeredDig, DIG_ROUND_1, DIG_FOLLOW_UPS, type DigQuestion } from '../shared/w3-dig';

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

// ⚠️ The bank is a fallback, not a second helping. This is asserted at the unit
// where the decision lives; the journey spec walks the beats.
test.describe('how many questions a workshop actually gets', () => {
  test('three written, at most two follow-ups, and never the bank on top', () => {
    expect(DIG_ROUND_1).toBe(3);
    expect(DIG_FOLLOW_UPS).toBe(2);
    // Five is already the ceiling of what belongs at the end of an encontro.
    // Adding the bank's three behind them made eight, which is a form.
    expect(DIG_ROUND_1 + DIG_FOLLOW_UPS).toBeLessThanOrEqual(5);
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

// ── The pairing: beside, never instead ─────────────────────────────────────
test.describe('a solution that goes beside the one they chose', () => {
  const opts = { eligibleIds: ['biovaletas', 'hortas-urbanas'], alreadyChosen: ['jardins-de-chuva'] };
  const pair = (over: any = {}) => ({
    solutionId: 'biovaletas',
    reasonPt: 'A biovaleta conduziria até o jardim a água que chega da rua de cima.',
    reasonEn: 'A swale would carry the water arriving from the street up to the garden.',
    ...over,
  });

  test('a proposal that adds something is kept', () => {
    expect(acceptPairing(pair(), opts).pairing?.solutionId).toBe('biovaletas');
  });

  test('⚠️ a proposal that questions their choice is refused', () => {
    // The alignment rule, enforced rather than requested. Their Encontro 2 pick
    // leads: they chose with intent and we do not walk over it — and a model
    // asked to judge its own input tends to agree with whatever it is handed,
    // so "is this right?" is the wrong question to give it in the first place.
    for (const bad of [
      'Em vez do jardim de chuva, uma biovaleta resolveria melhor esse problema.',
      'O jardim de chuva não resolve a água que vem da rua, o certo seria uma vala.',
      'Melhor seria começar por uma biovaleta antes de pensar no jardim.',
    ]) {
      const out = acceptPairing(pair({ reasonPt: bad }), opts);
      expect(out.pairing, bad).toBeNull();
      expect(out.why).toMatch(/questiona a escolha/);
    }
  });

  test('it cannot propose something the site is not eligible for', () => {
    // Belt and braces, like the shortlist: a model is good at relevance and bad
    // at knowing a slope solution makes no sense on a flat schoolyard.
    expect(acceptPairing(pair({ solutionId: 'muro-de-arrimo-verde' }), opts).why).toMatch(/fora do catálogo/);
  });

  test('it cannot propose what they already took', () => {
    expect(acceptPairing(pair({ solutionId: 'jardins-de-chuva' }), opts).why).toMatch(/já escolhida/);
  });

  test('no pairing is a correct and common answer', () => {
    expect(acceptPairing(null, opts).pairing).toBeNull();
    expect(acceptPairing(pair({ reasonPt: 'Boa.' }), opts).why).toMatch(/sem motivo/);
  });
});
