import { test, expect } from '@playwright/test';
import { buildConceptNote } from '../shared/concept-note';
import { buildRoadmap } from '../shared/w3-roadmap';
import { digParagraphs } from '../shared/w3-dig';

// ══════════════════════════════════════════════════════════════════════════
// THE AUDIT OF ONE REAL DOCUMENT
// ══════════════════════════════════════════════════════════════════════════
// Every case here is a sentence that was printed on 2026-09-07 in the concept
// note and hoja de ruta of CEA Bom Jesus (Colégio Caldas Junior, Partenon), and
// each is the kind of wrong that nothing fails on: the document renders, the
// sections are all there, and only a reader who holds the whole record can see
// that it says something untrue.
//
// The fixture is that organisation's record, near enough to reproduce them.

const SITE = {
  bairro: 'Partenon',
  site_name: 'Colégio Caldas Junior',
  current_use: 'paved',
  land_tenure: 'formal-agreement',
  // ⚠️ heat FIRST, enxurrada second. This ordering is the whole of case 2.
  site_worry: 'heat, enxurrada',
  site_area_m2: '2900',
  justification_why_here:
    'Porque é para onde a água vai. O Colégio Caldas Junior está no ponto mais baixo da nossa parte do Partenon.',
};

const ORG = {
  org_name: 'CEA Bom Jesus',
  contact_name: 'Maria Santos',
  contact_role: 'Coordenadora',
  team_size: '12 membros',
};

/** A dig answer of the length people actually give. */
const LONG_ANSWER =
  'Ficou o dia inteiro. A chuva foi de manhã, por volta das nove, e a água só começou a baixar umas cinco da tarde — quase oito horas com uns quinze centímetros dentro das duas salas. O piso ficou úmido por três dias.';

const DIG = [
  {
    id: 'dig-1-1-abcd', round: 1 as const,
    askPt: 'Essa água ficou por quanto tempo dentro da escola antes de baixar?',
    askEn: 'How long did that water stay inside the school before it went down?',
    notePt: 'No evento de março de 2026, a água permaneceu {answer} nas salas do térreo do Colégio Caldas Junior, segundo relato da organização.',
    noteEn: 'In the March 2026 event, water stood {answer} in the ground-floor classrooms, as reported by the organisation.',
    feeds: 'problema' as const,
    sourceKind: 'quote' as const,
    basedOn: 'a água entrou em duas salas do térreo',
    answer: LONG_ANSWER,
  },
  {
    id: 'dig-1-2-efgh', round: 1 as const,
    askPt: 'Quanto tempo a água leva para escoar depois que abrem o ralo?',
    askEn: 'How long does the water take to drain once the drain is cleared?',
    notePt: 'Aberto o ralo, a água escoa em {answer}, segundo relato da organização.',
    noteEn: 'Once the drain is cleared the water runs off in {answer}, as reported by the organisation.',
    feeds: 'problema' as const,
    sourceKind: 'quote' as const,
    basedOn: 'o ralo do corredor estava entupido',
    answer: 'mais ou menos uma hora',
  },
];

const input = (over: Record<string, any> = {}) => ({
  site: SITE,
  org: ORG,
  solutions: ['biovaletas'],
  areaM2: 2900,
  w3: {
    chosen_solutions: 'biovaletas',
    construction_model: 'partner-led',
    project_timeframe: '1-ano',
    justification_why_here: SITE.justification_why_here,
    dig_json: JSON.stringify(DIG),
    ...over,
  },
  cohort: [],
});

const noteText = (over?: Record<string, any>) =>
  buildConceptNote(input(over) as any, 'pt')
    .sections.flatMap(s => s.paragraphs.map(p => p.text))
    .join('\n\n');

test.describe('the documents say true things', () => {
  // ── 1 · A frame fits a fragment, not a paragraph ─────────────────────────
  test('a long dig answer is quoted, not spliced into a sentence', () => {
    const out = digParagraphs(DIG as any, 'pt');
    const long = out[0].text;
    const short = out[1].text;

    // The short one still goes inside the sentence — that reads better.
    expect(short).toContain('Aberto o ralo, a água escoa em mais ou menos uma hora');
    // The long one must NOT be dropped into the hole. This is the exact shape
    // that reached a funder: "a água permaneceu Ficou o dia inteiro. …"
    expect(long).not.toContain('permaneceu Ficou o dia inteiro');
    expect(long).not.toMatch(/permaneceu [A-ZÀ-Ý]/);
    // It is printed as what it is, whole, attributed.
    expect(long).toContain('a organização relatou');
    expect(long).toContain('quinze centímetros');
    expect(out[0].quoted).toBe(true);
    // And the frame's own tail does not survive without its frame.
    expect(long).not.toContain('nas salas do térreo do Colégio Caldas Junior, segundo relato');
  });

  // ── 2 · The mechanism answers the worry it answers ───────────────────────
  test('a bioswale is never described as the answer to heat', () => {
    const text = noteText();
    // "heat" leads the list, and a bioswale answers enxurrada. The document
    // named the first worry and asserted the mechanism answered THAT.
    expect(text).not.toContain('mecanismo que responde ao sol forte');
    expect(text).not.toContain('mecanismo que responde a sol forte');
    // The label is the worry's own words — enxurrada's, not heat's.
    expect(text).toContain('água que desce com força');
    // Naming a worry nothing chosen answers is the other half: silence there
    // reads as coverage.
    expect(text).toMatch(/também nomeou.*sol forte|também nomeou.*calor/);
    expect(text).toContain('permanece em aberto');
  });

  test('when the solution does answer the leading worry, nothing is invented', () => {
    // Same organisation, worry ordered the other way: no "left open" sentence,
    // because the bioswale answers the only mechanism named.
    const text = buildConceptNote(
      { ...input(), site: { ...SITE, site_worry: 'enxurrada' } } as any, 'pt',
    ).sections.flatMap(s => s.paragraphs.map(p => p.text)).join('\n\n');
    expect(text).toContain('água que desce com força');
    expect(text).not.toContain('permanece em aberto');
  });

  // ── 3 · A gap observed at the start is not a fact at the end ─────────────
  test('advisor gap observations never reach the page', () => {
    const advice = {
      observations: [
        { kind: 'gap', textPt: 'Não há nenhum dado sobre quantas pessoas são afetadas pelo alagamento.', basedOn: 'Nenhuma resposta registrada no Encontro 2.' },
        { kind: 'strength', textPt: 'Ter acordo formal com o colégio é raro neste grupo.', basedOn: "Campo 'Acesso ao terreno' registrado no Encontro 2." },
        { kind: 'cohort', textPt: 'Outras organizações do grupo também apontaram pátios escolares impermeabilizados.', basedOn: 'Registros do Encontro 2 da coorte.' },
      ],
    };
    const text = noteText({ _advice_json: JSON.stringify(advice) });
    // The stale one — it printed under a quote that answered it.
    expect(text).not.toContain('Não há nenhum dado sobre quantas pessoas');
    // The two that age well stay.
    expect(text).toContain('Ter acordo formal com o colégio é raro');
    expect(text).toContain('pátios escolares impermeabilizados');
  });

  // ── 4 · The caveat travels with the figure ───────────────────────────────
  test("the benefit's own caveat reaches the funder's document, not only the org's plan", () => {
    const text = noteText();
    const roadmap = buildRoadmap(input() as any, 'pt');
    const roadmapText = [...roadmap.what, ...roadmap.how].flatMap(c => c.lines).join('\n');
    // The hoja de ruta always carried it …
    expect(roadmapText).toContain('por metro de comprimento da vala');
    // … and now so does the note, beside the same number.
    expect(text).toContain('0,1');
    expect(text).toContain('por metro de comprimento da vala');
  });

  // ── 5 · The ask is this project's ask ────────────────────────────────────
  test('the aggregation argument does not quote somebody else’s figure', () => {
    const text = noteText();
    // R$ 580.000–1.450.000 is this project. A hardcoded R$ 20.000–40.000 told a
    // funder the ask was forty thousand.
    expect(text).not.toContain('R$ 20.000 a R$ 40.000');
    // ⚠️ And substituting the real band is not the fix either: "o custo de
    // administrar uma DOAÇÃO PEQUENA" over R$ 580.000–1.450.000 is the same
    // sentence being false in the other direction. Above a small ask the
    // portfolio case is made on its own terms. (Caught by rendering it and
    // reading it, after the first version of this test passed.)
    expect(text).not.toContain('doação pequena é desproporcional');
    expect(text).toContain('disputa atenção com propostas institucionais');
    expect(text).toContain('reunido num portfólio');

    // A genuinely small project still gets the original argument, with its own
    // figure in it.
    const small = buildConceptNote(
      { ...input(), solutions: ['jardins-de-chuva'], areaM2: 120,
        site: { ...SITE, site_area_m2: '120' },
        w3: { ...input().w3, chosen_solutions: 'jardins-de-chuva' } } as any,
      'pt',
    ).sections.flatMap(s => s.paragraphs.map(p => p.text)).join('\n\n');
    expect(small).toMatch(/pedindo R\$ [\d.]+ a R\$ [\d.]+ sozinho/);
  });

  // ── 5b · A verdict may not deny the paragraphs under it ──────────────────
  test('"no place marked" does not contradict the area and cost printed below it', () => {
    // No pin, but a size given in words and a cost derived from it — the note
    // said "sem isso não há área, custo nem caminho de aprovação" and then
    // printed all three.
    const text = noteText();
    expect(text).toContain('R$');
    expect(text).not.toContain('sem isso não há área, custo nem caminho');
    expect(text).toContain('não tem o lugar marcado no mapa');
  });

  // ── 6 · Not recorded means not recorded ──────────────────────────────────
  test('the roadmap does not call a written account unrecorded', () => {
    // No site_story (E2 skipped it), but a full why-here from E3 — the exact
    // record that printed "Ainda não registrado." above the paragraph itself.
    const roadmap = buildRoadmap(input() as any, 'pt');
    const problem = [...roadmap.what, ...roadmap.how].find(c => /problema/i.test(c.title))!;
    expect(problem.lines.join('\n')).not.toContain('Ainda não registrado');
    expect(problem.lines.join('\n')).toContain('ponto mais baixo');
    expect(problem.open).toBeFalsy();

    // With neither account, it is genuinely open and says so.
    const empty = buildRoadmap(
      { ...input(), site: { ...SITE, justification_why_here: '' }, w3: { ...input().w3, justification_why_here: '' } } as any,
      'pt',
    );
    const emptyProblem = [...empty.what, ...empty.how].find(c => /problema/i.test(c.title))!;
    expect(emptyProblem.lines.join('\n')).toContain('Ainda não registrado');
    expect(emptyProblem.open).toBe(true);
  });
});
