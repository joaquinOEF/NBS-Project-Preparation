// ============================================================================
// W3 SIZING — how big the thing is, and what that costs
// ============================================================================
// W2 ends with a pin. W3 has to turn that pin into a number an organisation can
// take to a funder, and the shortest honest route is: they draw the footprint,
// we measure it, and we multiply by a price the ficha already states.
//
// Everything here is deliberately dumb arithmetic over text the fichas already
// carry, for the same reason shared/w3-dossier.ts calls no model: a budget line
// an organisation shows a secretariat has to be traceable to a published
// figure, not to a plausible-sounding number.
//
// ── What this refuses to do ─────────────────────────────────────────────────
// 17 of the 27 fichas quote a price per m². The other 10 do not, and they do
// not for real reasons: barraginhas are priced per lot of a hundred, corredores
// verdes per planted tree, cisterns per unit, and parques lineares say outright
// that no closed price exists because it depends on what the strip already has.
// Inventing an R$/m² for those would produce exactly the confident wrong number
// that makes the rest of the dossier untrustworthy. They return `kind: 'unit'`
// or `kind: 'none'`, and W3 shows the ficha's own words instead.
// ============================================================================

import { getSolutionFicha } from './nbs-solution-fichas';

// ── Area ────────────────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

/**
 * Area of a lon/lat ring in m², by spherical excess — the same formula Turf's
 * `area` uses, written out here so `shared/` stays importable from the server
 * without pulling the whole of @turf/turf into it.
 *
 * Accurate to well under a percent at the scale W3 works on (a schoolyard, a
 * praça), which is far finer than the precision a hand-drawn footprint carries
 * in the first place — hence roundAreaM2 below.
 */
export function ringAreaM2(ring: Array<[number, number]>): number {
  if (ring.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % ring.length];
    total += (toRad(lon2) - toRad(lon1)) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/** Area of a GeoJSON Polygon, outer ring minus holes. */
export function polygonAreaM2(geometry: { type: string; coordinates: unknown }): number {
  if (geometry?.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) return 0;
  const rings = geometry.coordinates as Array<Array<[number, number]>>;
  if (!rings.length) return 0;
  return rings.reduce((acc, r, i) => acc + (i === 0 ? ringAreaM2(r) : -ringAreaM2(r)), 0);
}

/**
 * Round to the precision a finger-drawn polygon actually carries.
 *
 * "487 m²" reads as a survey. It is four taps on a phone over a satellite tile,
 * and the difference between 450 and 500 is where someone's finger landed. So
 * the number is rounded to something that reads as the estimate it is, and the
 * copy around it says "aproximadamente".
 */
export function roundAreaM2(m2: number): number {
  if (m2 <= 0) return 0;
  if (m2 < 100) return Math.round(m2 / 5) * 5;
  if (m2 < 1000) return Math.round(m2 / 50) * 50;
  if (m2 < 10000) return Math.round(m2 / 100) * 100;
  return Math.round(m2 / 500) * 500;
}

// ── Cost ────────────────────────────────────────────────────────────────────
//
// The first version of this parsed `quantoCusta` with regexes, and it got three
// of the 27 wrong in ways that all pointed the same direction — confidently:
//
//   • bacia-de-retenção reads "R$ 700/m² de estrutura + R$ 300/m² de
//     paisagismo". The parse took the first figure and reported R$ 700/m²,
//     understating a 300 m² basin by ninety thousand reais.
//   • escola-verde opens by saying the MMA cartilha does NOT close a number,
//     then quotes R$ 250–500 per planted TREE. The parse saw "m²" elsewhere in
//     the sentence and published the per-tree figure as a per-m² rate.
//   • barraginha and cisterna prices were truncated at the thousands separator
//     — R$ 20.000 became R$ 20.
//
// So the numbers are authored, once, here. What stops them drifting from the
// prose Robson reviewed is the invariant at the bottom of this file: both ends
// of every band must appear literally in the ficha's own `quantoCusta`, and the
// only exemption is a band that is explicitly derived — which must then carry a
// `notaPt`/`notaEn` showing the arithmetic to the organisation. Edit the
// sentence without editing the number and the module throws at load, in dev and
// in every test run.

export type CostBasis = 'm2' | 'unit' | 'project' | 'none';

export interface SolutionCost {
  basis: CostBasis;
  /** R$, both ends. Absent for 'none'. */
  low?: number;
  high?: number;
  /** 'unit': what one unit is. 'project': what that money buys. */
  scalePt?: string;
  scaleEn?: string;
  /**
   * The short noun the count question uses — "Quantas **cisternas**?" — and the
   * counts worth offering as chips.
   *
   * ⚠️ Without these there was no size question at all for a solution priced
   * per unit or per project. The footprint is correctly skipped (tracing an
   * outline buys nothing when the price is per tree), and then nothing asked
   * the question that DOES apply — while `notePt` below printed "quantas vocês
   * querem?" and no beat ever collected the answer. Those organisations left
   * W3 with a price per cistern and no number of cisterns: no total, no scale,
   * and nothing to put under "dimensões" in a concept note.
   */
  unitPt?: string;
  unitEn?: string;
  unitPluralPt?: string;
  unitPluralEn?: string;
  /** Counts worth offering. Trees come in dozens; biodigesters do not. */
  unitChips?: number[];
  /** Portuguese agrees: "Quantas hortas?" but "Quantos biodigestores?". */
  unitFemininePt?: boolean;
  /**
   * What the band assumes about WHO BUILDS IT, and what changes if they build
   * it themselves.
   *
   * ⚠️ Encontro 3 asks "e quem constrói isso?" one beat after showing the price,
   * and the price never moved. The fichas already know it matters — a cistern
   * is R$ 4.500 in mutirão and R$ 8.000–10.500 contracted by edital; a teto
   * verde is ~R$ 5/m² bidim-built against R$ 150–350 bought in. So an
   * organisation that answered "mutirão" was printing a contractor's price.
   *
   * Every figure here is LITERAL in that solution's `quantoCusta` — checked at
   * module load. Where the ficha states nothing this is absent, and the band is
   * shown with what it assumes rather than scaled by a multiplier we invented.
   */
  buildModel?: {
    /** The band when they build it themselves. Both ends literal in the ficha. */
    mutiraoLow?: number;
    mutiraoHigh?: number;
    /** The ficha rules self-building out — said plainly, since they just chose it. */
    mutiraoImpossiblePt?: string;
    mutiraoImpossibleEn?: string;
    /** Which model the headline band describes, so the caveat can name it. */
    bandAssumesPt?: string;
    bandAssumesEn?: string;
    /**
     * The entry's `notaPt` describes the CONTRACTED model, so printing it
     * beside an applied self-build band contradicts it — teto-verde's nota
     * opens "Faixa do sistema comprado pronto", which is false once the R$ 5/m²
     * band is the one on screen.
     */
    notaDescribesTheOtherModel?: boolean;
  };
  /**
   * Set when the figures are NOT literal in the ficha (a sum of two lines, a
   * rate worked back from a total). Required in that case, and always shown —
   * derived arithmetic an organisation cannot see is arithmetic it cannot
   * defend in front of a secretariat.
   */
  notaPt?: string;
  notaEn?: string;
}

/**
 * Cost per solution, read off each ficha's `quantoCusta`.
 *
 * Ten of the 27 have no rate and say so — priced per lot, per tree, per unit,
 * or genuinely open because it depends on what the site already has. Those get
 * 'unit', 'project' or 'none' rather than a fabricated R$/m², and W3 shows the
 * ficha's own sentence in their place. An honest "this one has no closed price"
 * is a usable answer; a made-up rate on a budget sheet is not.
 */
export const SOLUTION_COSTS: Record<string, SolutionCost> = {
  // ── Águas pluviais · infiltração ──────────────────────────────────────────
  'jardins-de-chuva': { basis: 'm2', low: 400, high: 700 },
  'canteiro-pluvial': { basis: 'm2', low: 400, high: 800 },
  'biovaletas': { basis: 'm2', low: 200, high: 500 },
  // The ficha lists the components and then its own closed-budget line.
  'terracos-de-chuva': { basis: 'm2', low: 600, high: 1000 },
  'escada-hidraulica-vegetada': { basis: 'm2', low: 600, high: 1200 },
  'pavimentos-permeaveis': { basis: 'm2', low: 220, high: 480 },
  'bacia-de-retencao': {
    basis: 'm2',
    low: 1000,
    high: 1000,
    notaPt: 'Soma das duas linhas da ficha: R$ 700/m² de estrutura mais R$ 300/m² de paisagismo e equipamentos.',
    notaEn: "The ficha's two lines added: R$ 700/m² of structure plus R$ 300/m² of landscaping and equipment.",
  },
  'wetland-construido': { basis: 'm2', low: 1200, high: 2000 },
  'ilhas-filtrantes-flutuantes': { basis: 'm2', low: 200, high: 700 },
  'barraginha': {
    basis: 'unit', low: 70, high: 200,
    scalePt: 'barraginha', scaleEn: 'barraginha',
    unitPt: 'barraginha', unitEn: 'barraginha', unitPluralPt: 'barraginhas', unitPluralEn: 'barraginhas',
    unitChips: [1, 2, 5, 10],
    unitFemininePt: true,
  },
  'captacao-agua-da-chuva': {
    basis: 'unit', low: 4500, high: 10500,
    buildModel: {
      // "R$ 4.500 quando construída em mutirão com mão de obra capacitada pelo
      // programa (ASA/P1MC); R$ 8.000 a R$ 10.500 quando contratada por edital."
      mutiraoLow: 4500, mutiraoHigh: 4500,
      bandAssumesPt: 'do mutirão do Programa Cisternas até a contratação por edital',
      bandAssumesEn: 'from a Programa Cisternas mutirão up to contracting by public call',
    },
    scalePt: 'cisterna de 16 mil litros — o piso é em mutirão, o teto é contratada por edital',
    scaleEn: 'a 16,000-litre cistern — the floor is mutirão-built, the ceiling is contracted through a public call',
    unitPt: 'cisterna', unitEn: 'cistern', unitPluralPt: 'cisternas', unitPluralEn: 'cisterns',
    unitChips: [1, 2, 5, 10],
    unitFemininePt: true,
  },

  // ── Áreas verdes ──────────────────────────────────────────────────────────
  'parques-e-florestas-urbanas': { basis: 'm2', low: 100, high: 230 },
  'teto-verde': {
    basis: 'm2', low: 150, high: 350,
    buildModel: {
      // "Método bidim: cerca de R$ 5 por m² de material… o Teto Verde Favela,
      // no Rio, já cobriu mais de 20 lajes a R$ 5 o metro, sem dinheiro de fora."
      mutiraoLow: 5, mutiraoHigh: 5,
      bandAssumesPt: 'sistema comprado pronto', bandAssumesEn: 'a bought-in system',
      notaDescribesTheOtherModel: true,
    },
    notaPt: 'Faixa do sistema comprado pronto. Feito pelo método bidim, em mutirão, cai para cerca de R$ 5 por m² — foi assim que o Teto Verde Favela cobriu mais de 20 lajes.',
    notaEn: 'Range for a bought-in system. Built bidim-style in a mutirão it drops to about R$ 5 per m² — that is how Teto Verde Favela covered more than 20 roofs.',
  },
  'corredores-verdes': {
    basis: 'unit', low: 250, high: 500,
    scalePt: 'árvore plantada, com berço, tutor e protetor até o 3º ano',
    scaleEn: 'planted tree, with pit, stake and guard through year 3',
    unitPt: 'árvore', unitEn: 'tree', unitPluralPt: 'árvores', unitPluralEn: 'trees',
    unitChips: [10, 25, 50, 100],
    unitFemininePt: true,
  },
  'parques-lineares': { basis: 'none' },
  'escola-verde': {
    basis: 'project', low: 5000, high: 20000,
    scalePt: 'um pátio pequeno com um jardim de chuva e algumas árvores',
    scaleEn: 'a small schoolyard with a rain garden and a few trees',
    unitPt: 'pátio de escola', unitEn: 'school yard', unitPluralPt: 'pátios de escola', unitPluralEn: 'school yards',
    unitChips: [1, 2, 3],
  },
  'parque-naturalizado': { basis: 'm2', low: 100, high: 230 },

  // ── Sistema alimentar ─────────────────────────────────────────────────────
  'hortas-urbanas': {
    basis: 'project', low: 300, high: 1200,
    scalePt: 'uma horta pequena de 10 a 50 m², com material reaproveitado. Uma horta comunitária de porte médio, com cercamento e irrigação, soma perto de R$ 25.000',
    scaleEn: 'a small garden of 10–50 m² using reclaimed materials. A mid-sized community garden with fencing and irrigation comes to around R$ 25,000',
    unitPt: 'horta', unitEn: 'garden', unitPluralPt: 'hortas', unitPluralEn: 'gardens',
    unitChips: [1, 2, 3, 5],
    unitFemininePt: true,
  },
  'compostagem': {
    basis: 'project', low: 300, high: 2000,
    scalePt: 'de uma composteira doméstica pronta até uma estrutura comunitária com tambores reaproveitados',
    scaleEn: 'from a ready-made household composter up to a community setup with reclaimed drums',
    unitPt: 'composteira', unitEn: 'composter', unitPluralPt: 'composteiras', unitPluralEn: 'composters',
    unitChips: [1, 2, 5, 10],
    unitFemininePt: true,
  },
  'cozinha-comunitaria-biodigestor': {
    basis: 'project', low: 300, high: 8900,
    scalePt: 'o biodigestor sozinho — caseiro com tambores no piso, kit comercial no teto. A cozinha completa é outra conta: hoje financiada pelo governo federal em até R$ 350 mil por unidade',
    scaleEn: 'the biodigester alone — home-built from drums at the floor, a commercial kit at the ceiling. The full kitchen is a separate matter: currently federally financed up to R$ 350,000 per unit',
    unitPt: 'biodigestor', unitEn: 'biodigester', unitPluralPt: 'biodigestores', unitPluralEn: 'biodigesters',
    unitChips: [1, 2],
  },
  'sistema-alimentar-local': { basis: 'none' },

  // ── Encostas ──────────────────────────────────────────────────────────────
  'grade-viva': { basis: 'm2', low: 500, high: 600 },
  'muro-de-arrimo-verde': {
    basis: 'm2', low: 200, high: 300,
    buildModel: {
      // "É custo alto em qualquer variante — envolve avaliação geotécnica,
      // fundação e mão de obra especializada."
      mutiraoImpossiblePt: 'a ficha diz que envolve avaliação geotécnica, fundação e mão de obra especializada — é custo alto em qualquer variante',
      mutiraoImpossibleEn: 'the ficha says it involves a geotechnical assessment, foundations and specialised labour — high cost in every variant',
      bandAssumesPt: 'execução especializada', bandAssumesEn: 'specialised contracting',
    },
    notaPt: 'Faixa da pedra ou gabião. A versão pré-fabricada tipo cribwall chega a R$ 1.000–2.000 por m².',
    notaEn: 'Range for stone or gabion. The prefabricated cribwall version reaches R$ 1,000–2,000 per m².',
  },
  'solo-grampeado-verde': {
    basis: 'm2', low: 800, high: 1000,
    buildModel: {
      // "exige perfuração mecanizada, grampos e injeção de calda de cimento —
      // equipamento e mão de obra especializada, não dá para mutirão."
      mutiraoImpossiblePt: 'a ficha é explícita: exige perfuração mecanizada, grampos e injeção de calda de cimento — equipamento e mão de obra especializada, não dá pra mutirão',
      mutiraoImpossibleEn: 'the ficha is explicit: it needs mechanised drilling, soil nails and cement grout injection — specialised equipment and labour, not something a mutirão can build',
      bandAssumesPt: 'execução especializada', bandAssumesEn: 'specialised contracting',
    },
  },
  'contencoes-em-geocelulas': { basis: 'm2', low: 500, high: 700 },

  // ── Restauração ───────────────────────────────────────────────────────────
  'reflorestamento': {
    basis: 'm2', low: 100, high: 230,
    buildModel: {
      // "Em terreno pequeno, feito em mutirão: R$ 100 a R$ 230 por m²" — the
      // headline band IS the mutirão figure, so nothing changes. What the
      // caveat must not do is imply a discount that is already applied.
      mutiraoLow: 100, mutiraoHigh: 230,
      bandAssumesPt: 'terreno pequeno feito em mutirão', bandAssumesEn: 'a small plot built by mutirão',
    },
  },
  'restauracao-areas-umidas': {
    basis: 'm2', low: 10, high: 60,
    notaPt: 'Vem do total da ficha — R$ 20 mil a R$ 120 mil para recuperar 2.000 m² de banhado já existente. Construir um jardim filtrante novo é outra ordem de grandeza: R$ 540 a R$ 1.410 por m².',
    notaEn: "Worked back from the ficha's total — R$ 20,000–120,000 to restore 2,000 m² of existing wetland. Building a new treatment wetland is a different order: R$ 540–1,410 per m².",
  },
};

export interface BudgetLine {
  solutionId: string;
  basis: CostBasis;
  /** Total for the drawn footprint. Null unless the basis is per-m² AND an area exists. */
  lowBrl: number | null;
  highBrl: number | null;
  areaM2?: number;
  /** How many of them — the size question for a solution counted per unit. */
  units?: number;
  /** They will build it themselves and the ficha prices only a contractor. */
  builtBySelfWithoutFigure?: boolean;
  /** The one line an organisation puts on a page. */
  notePt: string;
  noteEn: string;
  /** The ficha sentence behind it — shown, never paraphrased away. */
  sourcePt: string;
  sourceEn: string;
  /** The ficha marks its own figure as our inference rather than a cited value. */
  estimado: boolean;
}

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
const brlEn = (v: number) => `R$ ${Math.round(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

/**
 * The budget line for one solution over a drawn footprint.
 *
 * Always a range, never a point estimate, and the wording always says what it
 * is for: getting a supplier to quote against. W3's job is to get an
 * organisation into that conversation, not to stand in for it.
 */
/** How the organisation answered "e quem constrói isso?". */
export type BuildModel = 'mutirao' | 'mista' | 'contratada' | 'parceria' | 'indefinido';
const SELF_BUILT = new Set<BuildModel>(['mutirao', 'mista']);

export function budgetLineFor(
  solutionId: string,
  areaM2?: number,
  units?: number,
  buildModel?: BuildModel,
): BudgetLine | null {
  const ficha = getSolutionFicha(solutionId);
  const cost = SOLUTION_COSTS[solutionId];
  if (!ficha || !cost) return null;
  const bm = cost.buildModel;
  const selfBuilt = !!buildModel && SELF_BUILT.has(buildModel);
  const builtBySelfWithoutFigure = selfBuilt && !bm?.mutiraoLow && !bm?.mutiraoImpossiblePt;

  const base = {
    solutionId,
    basis: cost.basis,
    ...(builtBySelfWithoutFigure ? { builtBySelfWithoutFigure: true } : {}),
    sourcePt: ficha.pt.quantoCusta,
    sourceEn: ficha.en.quantoCusta,
    estimado: !!ficha.custoEstimado,
  };
  // ⚠️ WHO BUILDS IT MOVES THE NUMBER, and W3 asks one beat after showing it.
  // A cistern is R$ 4.500 in mutirão against R$ 8.000–10.500 contracted; a teto
  // verde is R$ 5/m² bidim-built against R$ 150–350 bought in. Printing the
  // contracted band to an organisation that just said "mutirão" is printing the
  // wrong number — and it is the number that reaches a funder.
  //
  // Only ever from figures the ficha states. Where it states none, the band
  // stands and says what it assumes; a multiplier we invented would be worse
  // than the mismatch it replaces.
  const buildNote = (pt: boolean): string => {
    if (!selfBuilt) return '';
    if (bm?.mutiraoImpossiblePt) {
      return pt
        ? ` ⚠️ Vocês disseram mutirão, e ${bm.mutiraoImpossiblePt}. Vale conversar com a coordenação sobre execução contratada — isso não invalida o projeto, muda quem põe a mão.`
        : ` ⚠️ You said mutirão, and ${bm.mutiraoImpossibleEn}. Worth talking to the coordination about contracting it — this does not invalidate the project, it changes who does the building.`;
    }
    if (bm?.mutiraoLow != null) return '';
    return pt
      ? ` ⚠️ Esta faixa é de execução contratada. Em mutirão o custo cai — a ficha não fecha quanto, então isso fica como número a levantar.`
      : ` ⚠️ This range is for contracted work. Built by mutirão it drops — the ficha does not close how much, so it stays a figure to find out.`;
  };
  const useMutiraoBand = selfBuilt && bm?.mutiraoLow != null && bm?.mutiraoHigh != null;
  const lowV = useMutiraoBand ? bm!.mutiraoLow! : cost.low;
  const highV = useMutiraoBand ? bm!.mutiraoHigh! : cost.high;

  const nota = (pt: boolean) => {
    const suppressed = useMutiraoBand && bm?.notaDescribesTheOtherModel;
    const n = suppressed ? '' : (pt ? cost.notaPt : cost.notaEn);
    const b = buildNote(pt);
    const m = useMutiraoBand
      ? (pt
        ? ` Esta é a faixa de mutirão da própria ficha — a de ${bm!.bandAssumesPt ?? 'execução contratada'} é outra.`
        : ` This is the ficha's own self-build range — the ${bm!.bandAssumesEn ?? 'contracted'} one is different.`)
      : '';
    return `${n ? ` ${n}` : ''}${m}${b}`;
  };

  if (cost.basis === 'm2' && lowV != null && highV != null) {
    const rate = lowV === highV ? brl(lowV) : `${brl(lowV)}–${brl(highV)}`;
    const rateEn = lowV === highV ? brlEn(lowV) : `${brlEn(lowV)}–${brlEn(highV)}`;
    if (!areaM2) {
      return {
        ...base,
        lowBrl: null,
        highBrl: null,
        notePt: `${rate} por m². Falta desenhar a área para fechar um total.${nota(true)}`,
        noteEn: `${rateEn} per m². The footprint is still undrawn, so there is no total.${nota(false)}`,
      };
    }
    const lo = lowV! * areaM2;
    const hi = highV! * areaM2;
    return {
      ...base,
      lowBrl: lo,
      highBrl: hi,
      areaM2,
      notePt: `Cerca de ${lo === hi ? brl(lo) : `${brl(lo)}–${brl(hi)}`} para ${areaM2} m², à referência da ficha. É uma faixa para pedir cotação, não um orçamento fechado.${nota(true)}`,
      noteEn: `About ${lo === hi ? brlEn(lo) : `${brlEn(lo)}–${brlEn(hi)}`} for ${areaM2} m², at the ficha's reference price. A range to request quotes against, not a closed budget.${nota(false)}`,
    };
  }

  if ((cost.basis === 'unit' || cost.basis === 'project') && lowV != null && highV != null) {
    const per = cost.basis === 'unit' ? 'por' : 'para';
    const perEn = cost.basis === 'unit' ? 'per' : 'for';
    // ⚠️ Only a per-UNIT band multiplies. A 'project' band prices one instance
    // at a particular size, and its prose often names a much larger figure for
    // a bigger one — hortas urbanas is R$ 300–1.200 for a small bed and "perto
    // de R$ 25.000" for a proper community garden in the same sentence.
    // Multiplying the small end by a count would hand an organisation a total
    // that reads authoritative and is wrong by an order of magnitude. The count
    // is still recorded and shown; only the arithmetic is withheld.
    if (units && units > 0 && cost.basis === 'project') {
      const nounPt = units === 1 ? cost.unitPt : cost.unitPluralPt;
      const nounEn = units === 1 ? cost.unitEn : cost.unitPluralEn;
      return {
        ...base,
        lowBrl: null,
        highBrl: null,
        units,
        ...(areaM2 ? { areaM2 } : {}),
        notePt:
          `${units} ${nounPt ?? 'unidade(s)'}. A ficha orça ${brl(lowV)}–${brl(highV)} ${per} ${cost.scalePt}. ` +
          `O total depende do porte de cada uma, então aqui fica a referência e não uma conta fechada.${nota(true)}`,
        noteEn:
          `${units} ${nounEn ?? 'unit(s)'}. The ficha prices ${brlEn(lowV)}–${brlEn(highV)} ${perEn} ${cost.scaleEn}. ` +
          `The total depends on how big each one is, so this is the reference rather than a closed sum.${nota(false)}`,
      };
    }
    if (units && units > 0) {
      const lo = lowV * units;
      const hi = highV * units;
      const nounPt = units === 1 ? cost.unitPt : cost.unitPluralPt;
      const nounEn = units === 1 ? cost.unitEn : cost.unitPluralEn;
      return {
        ...base,
        lowBrl: lo,
        highBrl: hi,
        units,
        ...(areaM2 ? { areaM2 } : {}),
        notePt:
          `Cerca de ${lo === hi ? brl(lo) : `${brl(lo)}–${brl(hi)}`} para ${units} ${nounPt ?? 'unidade(s)'}, ` +
          `à referência da ficha (${brl(cost.low!)}–${brl(cost.high!)} ${per} ${cost.scalePt}). ` +
          `É uma faixa para pedir cotação, não um orçamento fechado.${nota(true)}`,
        noteEn:
          `About ${lo === hi ? brlEn(lo) : `${brlEn(lo)}–${brlEn(hi)}`} for ${units} ${nounEn ?? 'unit(s)'}, ` +
          `at the ficha's reference price (${brlEn(cost.low!)}–${brlEn(cost.high!)} ${perEn} ${cost.scaleEn}). ` +
          `A range to request quotes against, not a closed budget.${nota(false)}`,
      };
    }
    return {
      ...base,
      lowBrl: null,
      highBrl: null,
      ...(areaM2 ? { areaM2 } : {}),
      notePt:
        `${brl(lowV)}–${brl(highV)} ${per} ${cost.scalePt}. ` +
        (cost.basis === 'unit'
          ? 'Esta solução se conta por unidade, não por metro quadrado — falta definir quantas.'
          : 'Esta solução se orça pelo conjunto, não por metro quadrado.') +
        nota(true),
      noteEn:
        `${brlEn(lowV)}–${brlEn(highV)} ${perEn} ${cost.scaleEn}. ` +
        (cost.basis === 'unit'
          ? 'This one is counted per unit, not per square metre — the number is still to be set.'
          : 'This one is budgeted as a whole, not per square metre.') +
        nota(false),
    };
  }

  return {
    ...base,
    lowBrl: null,
    highBrl: null,
    ...(areaM2 ? { areaM2 } : {}),
    notePt: `A ficha não fecha um preço para esta solução — o custo depende do que o lugar já tem. Vale pedir uma cotação cedo.${nota(true)}`,
    noteEn: `The ficha does not close a price for this one — the cost depends on what the place already has. Worth asking for a quote early.${nota(false)}`,
  };
}

// ── The invariant ───────────────────────────────────────────────────────────
// Every band above must be findable in the ficha it claims to come from, unless
// it declares itself derived and shows the working. Runs at module load, so a
// content edit that orphans a number fails the test suite rather than shipping
// a budget nobody can trace.

/** Every currency amount stated in a sentence, with "R$ 20 mil" read as 20000. */
function amountsIn(prose: string): Set<number> {
  const found = new Set<number>();
  const re = /R\$\s*([\d.,]+)(\s*mil)?/gi;
  for (const m of Array.from(prose.matchAll(re))) {
    const n = Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    if (!Number.isFinite(n)) continue;
    found.add(m[2] ? n * 1000 : n);
  }
  // "R$ 400–700 por m²" and "entre R$ 70 e R$ 200" both leave the second figure
  // without its own R$; take every bare number in the sentence too. This makes
  // the check permissive on presence, which is the right direction: its job is
  // to catch a number that has NO basis in the prose at all.
  for (const m of Array.from(prose.matchAll(/(\d[\d.,]*)(\s*mil)?/g))) {
    const n = Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    if (Number.isFinite(n)) found.add(m[2] ? n * 1000 : n);
  }
  return found;
}

for (const [id, cost] of Object.entries(SOLUTION_COSTS)) {
  const ficha = getSolutionFicha(id);
  if (!ficha) throw new Error(`w3-sizing: SOLUTION_COSTS has "${id}", which is not a ficha`);
  // ⚠️ Every self-build figure has to be LITERAL in that solution's own
  // quantoCusta. This is the whole reason the mutirão band is trustworthy: it
  // is not a discount rate someone chose, it is the number the ficha states for
  // the method — teto verde's R$ 5/m² bidim, the cistern's R$ 4.500 in the
  // Programa Cisternas mutirão. A figure that cannot be found in the source is
  // a figure nobody can defend in front of a secretariat.
  if (cost.buildModel) {
    const bm = cost.buildModel;
    const source = ficha.pt.quantoCusta;
    for (const value of [bm.mutiraoLow, bm.mutiraoHigh]) {
      if (value == null) continue;
      const plain = String(value);
      const dotted = value.toLocaleString('pt-BR');
      if (!source.includes(plain) && !source.includes(dotted)) {
        throw new Error(
          `w3-sizing: ${id} claims a self-build figure of ${value}, which does not appear in its own quantoCusta`,
        );
      }
    }
    if ((bm.mutiraoImpossiblePt && !bm.mutiraoImpossibleEn) || (bm.mutiraoImpossibleEn && !bm.mutiraoImpossiblePt)) {
      throw new Error(`w3-sizing: ${id} says self-building is impossible in only one language`);
    }
    if (bm.mutiraoLow != null && bm.mutiraoImpossiblePt) {
      throw new Error(`w3-sizing: ${id} both prices a mutirão and says one is impossible`);
    }
  }
  if (cost.basis === 'none') continue;
  if (cost.low == null || cost.high == null || cost.low > cost.high) {
    throw new Error(`w3-sizing: ${id} declares basis "${cost.basis}" without a valid low/high band`);
  }
  if ((cost.basis === 'unit' || cost.basis === 'project') && !(cost.scalePt && cost.scaleEn)) {
    throw new Error(`w3-sizing: ${id} is priced per ${cost.basis} but never says what one ${cost.basis} is`);
  }
  // A solution counted rather than measured needs the words to ask the count
  // with. Without them the flow silently falls back to asking nothing, which is
  // the hole this pair of fields was added to close.
  if ((cost.basis === 'unit' || cost.basis === 'project')) {
    if (!cost.unitPt || !cost.unitEn || !cost.unitPluralPt || !cost.unitPluralEn) {
      throw new Error(`w3-sizing: ${id} is counted, not measured, but has no unit noun to ask "how many" with`);
    }
    if (!cost.unitChips?.length) {
      throw new Error(`w3-sizing: ${id} is counted, not measured, but offers no counts to choose from`);
    }
  }
  if (cost.notaPt || cost.notaEn) {
    if (!(cost.notaPt && cost.notaEn)) throw new Error(`w3-sizing: ${id} has a derivation note in only one language`);
    continue; // declared derived — the note carries the working
  }
  const amounts = amountsIn(ficha.pt.quantoCusta);
  for (const v of [cost.low, cost.high]) {
    if (!amounts.has(v)) {
      throw new Error(
        `w3-sizing: ${id} claims R$ ${v}, which no longer appears in its ficha's quantoCusta. ` +
        `Either the sentence changed and the band must follow it, or the band is derived — in which case add notaPt/notaEn showing the arithmetic.`,
      );
    }
  }
}

// Every ficha must be priced or explicitly declared unpriced. Adding a 28th
// solution without a cost entry is then a load-time failure rather than a
// silently blank budget line in someone's dossier.
import { NBS_SOLUTION_FICHAS } from './nbs-solution-fichas';
for (const id of Object.keys(NBS_SOLUTION_FICHAS)) {
  if (!SOLUTION_COSTS[id]) throw new Error(`w3-sizing: ficha "${id}" has no SOLUTION_COSTS entry`);
}
