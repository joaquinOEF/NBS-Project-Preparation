// ============================================================================
// THE STUDY LINE — what the works cost does not include
// ============================================================================
// Encontro 3 names the study in the verdict and on the shortlist card — "precisa
// de um teste de infiltração do solo", "uma avaliação geotécnica" — and then
// prints a budget containing only the works. A concept note with a construction
// cost and no study line is incomplete in the one place a funder checks, and
// the study is precisely what the coordination is pooling across the cohort.
//
// ⚠️ NONE OF THESE FIGURES COMES FROM A FICHA, unlike everything in w3-sizing.
// They are market references, and every one carries its source into the copy —
// because a number an organisation cannot attribute is a number it cannot
// defend. Where no citable reference exists, this says so and names the
// profession instead, which is still more than the page had before.
// ============================================================================

export interface StudyCost {
  /** The profession that does it — useful even when the price is unknown. */
  whoPt: string;
  whoEn: string;
  /** Brazilian reais. Absent when no citable reference was found. */
  lowBrl?: number;
  highBrl?: number;
  /** What that money buys, so the range is readable. */
  scalePt?: string;
  scaleEn?: string;
  /** Always rendered. An unattributable number is worse than none. */
  sourcePt?: string;
  sourceEn?: string;
  /** Where the headline figure would mislead on its own. */
  notePt?: string;
  noteEn?: string;
}

/**
 * Keyed on the exact `studyRequirement().pt` string, so a change there fails
 * the lookup loudly at load rather than silently dropping the line.
 */
export const STUDY_COSTS: Record<string, StudyCost> = {
  'uma avaliação geotécnica': {
    whoPt: 'engenheiro geotécnico', whoEn: 'a geotechnical engineer',
    lowBrl: 820, highBrl: 5125,
    scalePt: 'de um furo de sondagem de 10 m até um estudo geotécnico completo com SPT',
    scaleEn: 'from a single 10 m borehole up to a full geotechnical study with SPT',
    sourcePt: 'gerador de preços CYPE Brasil, 2025', sourceEn: 'CYPE Brasil price generator, 2025',
    notePt: 'A ABGE situa a sondagem abaixo de 1% do valor total da obra — é caro em relação ao bolso da organização, barato em relação ao risco de um barranco mal avaliado.',
    noteEn: 'ABGE puts soil investigation at under 1% of total works cost — expensive against an organisation\'s budget, cheap against the risk of a badly assessed slope.',
  },
  'um responsável técnico com ART': {
    whoPt: 'engenheiro ou arquiteto registrado no CREA/CAU', whoEn: 'an engineer or architect registered with CREA/CAU',
    lowBrl: 103, highBrl: 271,
    scalePt: 'a TAXA da ART',
    scaleEn: 'the ART registration fee',
    sourcePt: 'tabela Confea 2025 (Decisão Plenária PL 615/2024)', sourceEn: 'Confea 2025 table (Plenary Decision PL 615/2024)',
    // ⚠️ The distinction that makes the figure honest rather than misleading.
    notePt: '⚠️ Isso é só a taxa de registro. O trabalho do profissional — projeto, acompanhamento — é outra conta, e é a que pesa. Vale pedir orçamento junto com as outras organizações da rede que também precisam.',
    noteEn: '⚠️ That is the registration fee only. The professional\'s work — design, supervision — is a separate cost, and it is the one that matters. Worth quoting together with the other organisations in the network that also need it.',
  },
  'um responsável técnico com ART — a ficha diz que depende de como for feito': {
    whoPt: 'engenheiro ou arquiteto registrado no CREA/CAU', whoEn: 'an engineer or architect registered with CREA/CAU',
    lowBrl: 103, highBrl: 271,
    scalePt: 'a TAXA da ART',
    scaleEn: 'the ART registration fee',
    sourcePt: 'tabela Confea 2025 (Decisão Plenária PL 615/2024)', sourceEn: 'Confea 2025 table (Plenary Decision PL 615/2024)',
    notePt: '⚠️ Isso é só a taxa de registro; o trabalho do profissional é outra conta. E a ficha diz que a exigência depende de como a obra for feita — vale confirmar antes de orçar.',
    noteEn: '⚠️ Registration fee only; the professional\'s work is a separate cost. And the ficha says the requirement depends on how it is built — worth confirming before quoting.',
  },
  'um teste de infiltração do solo': {
    whoPt: 'técnico ou engenheiro com ensaio de infiltração', whoEn: 'a technician or engineer running an infiltration test',
    sourcePt: 'sem referência de preço publicada que sirva para escala comunitária',
    sourceEn: 'no published price reference that holds at community scale',
  },
  'um técnico para o desenho': {
    whoPt: 'engenheiro ou arquiteto para o projeto executivo', whoEn: 'an engineer or architect for the detailed design',
    sourcePt: 'sem referência de preço publicada que sirva para escala comunitária',
    sourceEn: 'no published price reference that holds at community scale',
  },
  'um estudo hidrológico': {
    whoPt: 'engenheiro hidrólogo', whoEn: 'a hydrologist',
    sourcePt: 'sem referência de preço publicada que sirva para escala comunitária',
    sourceEn: 'no published price reference that holds at community scale',
  },
  'um estudo hidráulico': {
    whoPt: 'engenheiro hidráulico', whoEn: 'a hydraulic engineer',
    sourcePt: 'sem referência de preço publicada que sirva para escala comunitária',
    sourceEn: 'no published price reference that holds at community scale',
  },
};

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const brlEn = (v: number) => `R$ ${Math.round(v).toLocaleString('en-US')}`;

/** One line for the budget: who does it, what it costs, and where that came from. */
export function studyCostLine(needPt: string, lang: 'pt' | 'en' = 'pt'): string | null {
  const c = STUDY_COSTS[needPt];
  if (!c) return null;
  const pt = lang === 'pt';
  const who = pt ? c.whoPt : c.whoEn;
  const note = pt ? c.notePt : c.noteEn;
  const source = pt ? c.sourcePt : c.sourceEn;

  if (c.lowBrl == null) {
    return pt
      ? `Além da obra: ${needPt} — quem faz é ${who}. Preço a cotar (${source}).${note ? ` ${note}` : ''}`
      : `Beyond the works: this needs ${who}. Price to be quoted (${source}).${note ? ` ${note}` : ''}`;
  }
  const range = c.lowBrl === c.highBrl
    ? (pt ? brl(c.lowBrl) : brlEn(c.lowBrl))
    : (pt ? `${brl(c.lowBrl)}–${brl(c.highBrl!)}` : `${brlEn(c.lowBrl)}–${brlEn(c.highBrl!)}`);
  return pt
    ? `Além da obra: ${needPt} — quem faz é ${who}. ${range} ${c.scalePt} (${source}).${note ? ` ${note}` : ''}`
    : `Beyond the works: ${who}. ${range} ${c.scaleEn} (${source}).${note ? ` ${note}` : ''}`;
}

// The invariant lives in w3-dossier, not here: this file would have to import
// `studyRequirement` to check itself, and w3-dossier already imports this one —
// a cycle that left STUDY_MARKERS uninitialised at load. The check runs at boot
// either way; it just runs from the side that can see both.
