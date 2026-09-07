// ============================================================================
// A NUMBER OF SQUARE METRES, AGAINST SOMETHING YOU CAN STAND IN
// ============================================================================
// "2.900 m²" is not checkable by eye. "mais ou menos 5 quadras de futsal" is —
// and checking it is the whole point: a footprint traced on a zoomed-out map
// once produced a 9 986 500 m² rain garden priced at four billion reais, stated
// with the same confidence as a correct number. An organisation cannot audit a
// figure; it can tell you instantly that its yard is not twenty football
// pitches.
//
// The references are deliberately the ones the size chips already use
// (shared/w3-gap-questions.ts) — the room meets the same yardsticks whether it
// traced the area or compared it.
// ============================================================================

interface AreaRef {
  m2: number;
  pt: string;
  ptPlural: string;
  en: string;
  enPlural: string;
}

const REFS: AreaRef[] = [
  { m2: 160, pt: 'quadra de vôlei', ptPlural: 'quadras de vôlei', en: 'volleyball court', enPlural: 'volleyball courts' },
  { m2: 600, pt: 'quadra de futsal', ptPlural: 'quadras de futsal', en: 'futsal court', enPlural: 'futsal courts' },
  { m2: 7000, pt: 'campo de futebol', ptPlural: 'campos de futebol', en: 'football pitch', enPlural: 'football pitches' },
];

/**
 * One comparison, in the session language. Null below the smallest reference in
 * a way that would round to nothing — better no comparison than a wrong one.
 */
export function areaComparison(m2: number, lang: 'pt' | 'en' = 'pt'): string | null {
  if (!Number.isFinite(m2) || m2 <= 0) return null;
  const pt = lang === 'pt';
  if (m2 < REFS[0].m2 * 0.6) {
    return pt ? `menor que uma ${REFS[0].pt}` : `smaller than a ${REFS[0].en}`;
  }
  // The biggest yardstick this area is worth at least one of — so a courtyard
  // is measured in volleyball courts and a park in football pitches.
  const ref = [...REFS].reverse().find(r => m2 >= r.m2 * 0.6) ?? REFS[0];
  const n = Math.round(m2 / ref.m2);
  if (n <= 1) return pt ? `mais ou menos uma ${ref.pt}` : `about one ${ref.en}`;
  const count = n.toLocaleString(pt ? 'pt-BR' : 'en-US');
  return pt
    ? `mais ou menos ${count} ${ref.ptPlural}`
    : `about ${count} ${ref.enPlural}`;
}
