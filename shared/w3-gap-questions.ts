// ============================================================================
// THE GAP ASKS ONCE MORE — a second way in, not the same question again
// ============================================================================
// Encontro 3 already knows exactly what it could not produce. `dossier.gaps`
// names it — "tem preço por m² na ficha, mas ninguém desenhou a área, e sem
// isso não sai um total" — and until now the system wrote that on the page and
// never asked about it again. The organisation said "ainda não sei o tamanho",
// which is an honest answer to "how many square metres", and nobody tried the
// question a person would have tried next.
//
// The bank of eight custom questions (shared/w3-questions.ts) is selected by
// static rules and has never read a gap. So an organisation whose single most
// valuable missing number is the area of its slope gets asked about houses
// above it and annual upkeep, and is never asked about the slope again.
//
// Two rules make this a question rather than nagging:
//
//  1 · ASK ONCE, THEN LET IT GO. Recorded per gap, so it cannot repeat. These
//      organisations have answered sixty fields across three workshops; a third
//      attempt at the same thing reads as pressure, and pressure is how a
//      session ends early.
//  2 · THE RETRY CHANGES THE MODALITY. Not metres again — paces, or a
//      comparison to something they can see. Not "where will the money come
//      from" — "who pays the water bill there today". A repeated question
//      collects the same silence and spends trust doing it.
//
// ⚠️ And the number a retry produces is ROUGHER than one they measured, so it
// carries its own provenance and says so wherever it is printed. A pace count
// turned into square metres and multiplied by a per-m² rate is exactly how a
// rain garden became 9.986.500 m² and four billion reais.
// ============================================================================

export type GapKind = 'area' | 'units' | 'recurring-money' | 'baseline';

export interface GapRetry {
  kind: GapKind;
  /** The field that records the retry, so it is asked at most once. */
  askedFlag: string;
  askPt: string;
  askEn: string;
  /**
   * Chips, where a band is more honest than a number. An organisation that
   * could not give metres can almost always place its site against something
   * it can see.
   */
  options: Array<{ pt: string; en: string; dPt?: string; dEn?: string }>;
}

/**
 * ⚠️ Bands, not a measurement. Each chip carries the middle of its own range,
 * and everything downstream is told where it came from — `site_area_source`.
 * The bands are deliberately coarse: their job is to separate a courtyard from
 * a football pitch, which is the difference that changes a price band, not to
 * pretend at a survey.
 */
export const AREA_BANDS: Array<{ pt: string; en: string; m2: number; dPt: string; dEn: string }> = [
  { pt: 'Do tamanho de uma sala', en: 'About the size of a room', m2: 40, dPt: 'até uns 50 m²', dEn: 'up to about 50 m²' },
  { pt: 'Do tamanho de uma quadra de vôlei', en: 'About the size of a volleyball court', m2: 160, dPt: 'uns 150 m²', dEn: 'around 150 m²' },
  { pt: 'Do tamanho de uma quadra de futsal', en: 'About the size of a futsal court', m2: 600, dPt: 'uns 600 m²', dEn: 'around 600 m²' },
  { pt: 'Maior que uma quadra de futsal', en: 'Bigger than a futsal court', m2: 1200, dPt: 'mais de 1.000 m²', dEn: 'over 1,000 m²' },
];

export const GAP_RETRIES: Record<GapKind, GapRetry> = {
  area: {
    kind: 'area',
    askedFlag: '_area_retry_asked',
    askPt: 'Sem problema — e de grosso? Não precisa medir nada: só compare com algo que vocês conhecem.',
    askEn: 'No problem — roughly, then? Nothing to measure: just compare it with something you know.',
    // ⚠️ The way out is not optional. Four bands and no escape forces an
    // organisation that genuinely cannot compare to pick one, and we would
    // record a fabricated area — then multiply it by a price per square metre.
    // The first version of this file had no such chip, which is exactly the
    // shape of the failure it was written to prevent.
    options: [
      ...AREA_BANDS.map(b => ({ pt: b.pt, en: b.en, dPt: b.dPt, dEn: b.dEn })),
      { pt: 'Não dá pra chutar', en: 'I cannot even guess', dPt: 'Fica como pendência', dEn: 'Recorded as still open' },
    ],
  },
  units: {
    kind: 'units',
    askedFlag: '_units_retry_asked',
    // ⚠️ A different question, not the same one softer. "How many would you do
    // in the first year" is answerable by an organisation that cannot yet say
    // how many it wants in total, and it is the number that sizes a first ask.
    askPt: 'E se fosse só pra começar — quantas dariam pra fazer no primeiro ano?',
    askEn: 'And just to start — how many could you manage in the first year?',
    options: [
      { pt: '1', en: '1' },
      { pt: '2', en: '2' },
      { pt: '3', en: '3' },
      { pt: '5', en: '5' },
      { pt: 'Não dá pra chutar', en: 'I cannot even guess', dPt: 'Fica como pendência', dEn: 'Recorded as still open' },
    ],
  },
  'recurring-money': {
    kind: 'recurring-money',
    askedFlag: '_money_retry_asked',
    // Not "where will the money come from" again. Who pays TODAY is a fact they
    // hold, and it is the honest start of the same conversation.
    askPt: 'Deixa eu perguntar de outro jeito: hoje, quem paga as contas desse lugar — água, luz, a roçada quando o mato cresce?',
    askEn: 'Let me ask it another way: today, who pays for that place — water, electricity, the mowing when the grass grows?',
    options: [
      { pt: 'A própria organização', en: 'The organisation itself' },
      { pt: 'A prefeitura', en: 'The city' },
      { pt: 'Os moradores, na vaquinha', en: 'Residents, chipping in' },
      { pt: 'Ninguém — fica sem', en: 'Nobody — it goes without' },
      { pt: 'Não sei dizer', en: "I could not say", dPt: 'Fica como pendência', dEn: 'Recorded as still open' },
    ],
  },
  baseline: {
    kind: 'baseline',
    askedFlag: '_baseline_retry_asked',
    askPt: 'Uma foto resolve isso, e vale mais que qualquer descrição depois que a obra começar. Dá pra tirar hoje?',
    askEn: 'A photograph settles this, and it is worth more than any description once work starts. Could you take one today?',
    options: [
      { pt: 'Tiro e mando agora', en: 'I will take one and send it now' },
      { pt: 'Mando depois', en: 'I will send one later' },
      { pt: 'Prefiro pular', en: "I'd rather skip" },
    ],
  },
};

/** The chip that declines, in every retry. Always present, always last. */
export const CANNOT_GUESS = { pt: 'Não dá pra chutar', en: 'I cannot even guess' };

/** The band a chip names, or null when the reply is not one of them. */
export function areaBandFor(label: string, norm: (s: string) => string): number | null {
  const n = norm(label);
  const hit = AREA_BANDS.find(b => norm(b.pt) === n || norm(b.en) === n);
  return hit ? hit.m2 : null;
}

/** How a rough area is described wherever it is printed. */
export const ROUGH_AREA_SOURCE = {
  pt: 'estimativa por comparação, não medição',
  en: 'estimated by comparison, not measured',
};
