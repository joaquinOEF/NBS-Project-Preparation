// ============================================================================
// A SIZE THAT CANNOT BE RIGHT — the question the flow owes before the price
// ============================================================================
// On staging (Colégio Caldas Junior, 22 Sept) a rain garden was priced over
// **836 m²** — the whole cemented patio, 38 × 22 m, read out of the
// organisation's own sketch — while the same sketch, read by the same pass,
// carries the strip the technical visit designates for the garden: 12 × 8 m,
// 96 m². The two were offered side by side as equal chips, the larger one was
// tapped, and the card came back at R$ 334.400–585.200 against a parents'
// association with R$ 8.200 in hand. The bioswale tested next inherited the
// same 836 m² without a question, so the same ground was billed twice.
//
// Nothing was broken: every function did what it says. There was simply no
// point at which the platform compared the number to the place. That is what
// this file is.
//
// Three readings, in the order a person would make them:
//
//   1 · the SURFACE. A measure describes something — a roof, a strip of earth,
//       a cemented yard — and a solution needs one of those. A rain garden on
//       the measure of the concrete is the strongest signal available, and it
//       is the one that fired here.
//   2 · a SMALLER measure that fits. Their own material named the planting
//       area; they used a bigger number from the same file.
//   3 · BIGGER than the place. With no measures to argue with, a footprint
//       larger than the polygon they drew is worth one question.
//
// What it never does is decide. `sizeDoubt` returns a doubt, the flow asks it,
// and the organisation's answer is what stands — including "sim, é isso mesmo",
// which is a real answer: some organisations really do mean the whole yard.
import type { DocumentMeasure } from './w3-document-notes';
import { NBS_SOLUTIONS } from './nbs-catalog';

export type Surface = 'roof' | 'open-ground' | 'sealed-ground' | 'water' | 'unclear';

const ROOF_RE = /telhad|laje|cobertura|galp[ãa]o|roof|slab/i;
const SEALED_RE = /p[áa]tio|piso|cimentad|concret|asfalt|pavimentad|calçad|calcad|quadra|estacionamento|paved|pavement|courtyard|concrete|parking/i;
const WATER_RE = /lago|lagoa|açude|acude|arroio|c[óo]rrego|canal|banhado|espelho d.[áa]gua|pond|lake|stream|wetland/i;
const OPEN_RE = /terra|solo|gramad|canteir|jardim|verde|horta|faixa|cant(o|inho)|bare earth|soil|lawn|garden|green|strip/i;

/** What a measure from their files describes. The sealed reading wins a tie: a "pátio de terra" is rarer than a paved one, and being asked is cheap. */
export function measureSurface(m: Pick<DocumentMeasure, 'labelPt' | 'labelEn' | 'quote'>): Surface {
  const text = `${m.labelPt} ${m.labelEn} ${m.quote}`;
  if (ROOF_RE.test(text)) return 'roof';
  if (WATER_RE.test(text)) return 'water';
  if (SEALED_RE.test(text)) return 'sealed-ground';
  if (OPEN_RE.test(text)) return 'open-ground';
  return 'unclear';
}

/**
 * The surface every solution is built ON, declared once for all 27 — not
 * inferred, and not a default with two exceptions. A rain garden and a bioswale
 * go in earth; permeable paving REPLACES a paved surface, so the cemented yard
 * is exactly its right measure; a green roof and a cistern belong to the roof;
 * water bodies are their own surface, because a floating island measured
 * against a yard is as wrong as a garden measured against the concrete.
 *
 * ⚠️ A new solution must declare one — the invariant at the bottom of this file
 * throws on a catalogue this map does not cover. That is the whole point: the
 * check is a property of the catalogue, not of the one site that found it.
 */
export const SOLUTION_SURFACE: Record<string, Surface> = {
  // Águas pluviais — earth that receives water…
  'jardins-de-chuva': 'open-ground',
  'biovaletas': 'open-ground',
  'canteiro-pluvial': 'open-ground',
  'bacia-de-retencao': 'open-ground',
  'wetland-construido': 'open-ground',
  'escada-hidraulica-vegetada': 'open-ground',
  'terracos-de-chuva': 'open-ground',
  'barraginha': 'open-ground',
  // …the two that do not.
  'pavimentos-permeaveis': 'sealed-ground',
  'ilhas-filtrantes-flutuantes': 'water',
  'captacao-agua-da-chuva': 'roof',
  // Verde urbano
  'parques-e-florestas-urbanas': 'open-ground',
  'teto-verde': 'roof',
  'corredores-verdes': 'open-ground',
  'parques-lineares': 'open-ground',
  'escola-verde': 'open-ground',
  'parque-naturalizado': 'open-ground',
  // Agricultura urbana — a rooftop garden is a green roof; these are on the ground.
  'hortas-urbanas': 'open-ground',
  'compostagem': 'open-ground',
  'cozinha-comunitaria-biodigestor': 'open-ground',
  'sistema-alimentar-local': 'open-ground',
  // Encostas e solo
  'grade-viva': 'open-ground',
  'muro-de-arrimo-verde': 'open-ground',
  'solo-grampeado-verde': 'open-ground',
  'contencoes-em-geocelulas': 'open-ground',
  // Recuperação de ecossistemas
  'reflorestamento': 'open-ground',
  'restauracao-areas-umidas': 'water',
};

export function solutionSurface(solutionId: string): Surface {
  return SOLUTION_SURFACE[solutionId] ?? 'unclear';
}

/** Does this measure describe ground this solution could be built on? `unclear` never blocks. */
export function measureFits(solutionId: string, m: Pick<DocumentMeasure, 'labelPt' | 'labelEn' | 'quote'>): boolean {
  const want = solutionSurface(solutionId);
  const got = measureSurface(m);
  if (got === 'unclear' || want === 'unclear') return true;
  return got === want;
}

/**
 * The measures to offer for this solution, the fitting ones first — so the
 * strip of earth sits above the concrete for a rain garden, and the roof sits
 * alone for a green roof. Nothing is removed: a measure they consider right is
 * still one tap away, and the label on the chip says what each one is.
 */
export function orderMeasuresFor<T extends Pick<DocumentMeasure, 'labelPt' | 'labelEn' | 'quote'>>(solutionId: string, measures: T[]): T[] {
  const rank = (m: T) => {
    const got = measureSurface(m);
    if (got === solutionSurface(solutionId)) return 0;
    if (got === 'unclear') return 1;
    return 2;
  };
  return [...measures].sort((a, b) => rank(a) - rank(b));
}

export type SizeDoubtKind = 'wrong-surface' | 'smaller-measure-fits' | 'bigger-than-the-place';

export interface SizeDoubt {
  kind: SizeDoubtKind;
  /** What the number appears to be, in their own material. */
  matched?: DocumentMeasure;
  /** The measure that would fit the solution, when there is one to offer. */
  alternative?: DocumentMeasure;
  /** Share of the drawn site this footprint takes, 0–1, when the place has one. */
  share?: number;
}

/**
 * ⚠️ NOT "most of the place". The polygon drawn in Encontro 2 IS the area they
 * mean to work in, so a test sized at all of it is the ordinary answer and
 * asking about it would be noise — twelve journeys said so the first time this
 * fired at 60%. What is worth a question is a footprint LARGER than the place
 * they drew, which no intervention can be.
 */
const BIGGER_THAN_THE_PLACE = 1.0;

/**
 * Is there something to ask about this size? Called once the number is known,
 * whatever road it came from — a chip, speech, the map, or a size inherited
 * from the test before.
 */
export function sizeDoubt(args: {
  solutionId: string;
  areaM2: number;
  siteAreaM2?: number;
  measures?: DocumentMeasure[];
}): SizeDoubt | null {
  const { solutionId, areaM2 } = args;
  if (!(areaM2 > 0)) return null;
  const measures = args.measures ?? [];
  const fitting = measures.filter(m => measureFits(solutionId, m));

  // 1 · the number IS a measure of the wrong surface — the rain garden priced
  // over the concrete. The strongest reading, and the one that says most.
  const matched = measures.find(m => m.m2 === areaM2);
  if (matched && !measureFits(solutionId, matched)) {
    return { kind: 'wrong-surface', matched, alternative: smallest(fitting) };
  }

  // 2 · their own material names a smaller area that fits, and this is not it.
  const smaller = smallest(fitting.filter(m => m.m2 < areaM2));
  if (smaller) return { kind: 'smaller-measure-fits', matched, alternative: smaller };

  // 3 · no measures to argue with: most of what they drew, for a solution that
  // occupies a part of a place rather than replacing its whole surface.
  const site = args.siteAreaM2 ?? 0;
  if (site > 0 && areaM2 > site * BIGGER_THAN_THE_PLACE) {
    return { kind: 'bigger-than-the-place', share: areaM2 / site };
  }
  return null;
}

const smallest = (ms: DocumentMeasure[]): DocumentMeasure | undefined =>
  ms.length ? ms.reduce((a, b) => (a.m2 <= b.m2 ? a : b)) : undefined;

// ── The invariant ───────────────────────────────────────────────────────────
// Every solution in the catalogue declares the surface it is built on. Without
// this, a solution added later would quietly fall to `unclear`, which never
// blocks — and the check that exists to question a size would answer "fine" for
// the one solution nobody classified.
{
  const mute = NBS_SOLUTIONS.filter(s => !SOLUTION_SURFACE[s.id]).map(s => s.id);
  if (mute.length) {
    throw new Error(
      `w3-size-check: ${mute.length} solution(s) declare no surface: ${mute.join(', ')}. ` +
      'Add each to SOLUTION_SURFACE — roof, open-ground, sealed-ground or water.',
    );
  }
}
