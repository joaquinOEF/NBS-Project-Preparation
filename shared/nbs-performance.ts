// NBS performance — retention capacity per typology, and the honest statement
// of what these solutions do and do not solve.
//
// Source: "Soluções Baseadas na Natureza — Dimensionamento, Base Científica,
// Escala de Impacto e Especificações para Dashboard", sent unprompted by the
// coordinator of Conceito Arte (Rede SCbN POA cohort) on 2026-07-31 via Ana.
//
// Two things arrived in that document and they serve different purposes here:
//
//   1. RETENTION PARAMETERS (m³ per m², per linear metre, or per hour) with the
//      sizing formula behind each. These are the first quantitative performance
//      figures in the catalog — everything else we carry is cost, delivery mode
//      and feasibility. They belong to W3 scoping ("your 1,000 m² praça holds
//      ~162 m³ per rain event" is the sentence that goes in a funding
//      application), NOT to the W2 recommendation, which deliberately does not
//      size anything.
//
//   2. THE SCALE STATEMENT. The same document compares accumulated NBS capacity
//      against real event volumes for the Sarandi basin and concludes, in its
//      own words, that NBS "não substituem obras de macrodrenagem" but are vital
//      for everyday microdrainage. That is the honest frame W2 has been missing:
//      an organization that answers "flooding" meaning May 2024 and is then
//      walked toward rain gardens has been offered something addressing ~0.03%
//      of what frightens them. Expectation-setting has to happen BEFORE they
//      design against the wrong problem (cf. Ana, 2026-07-08, on not overselling
//      community-scale project potential; Robson's repeated "not feasible for
//      communities' scale" on the 22 Jul catalog review).
//
// ⚠️ PROVENANCE: the percentages are illustrative for the Bacia do Sarandi and
// rest on a hypothetical portfolio (160 interventions totalling 5,736 m³). They
// are a scale argument, not a measurement of anything built. Anything rendered
// from `NBS_EVENT_SCALE` must carry `estimated`-style marking, the same
// discipline as `classificationEstimated` in nbs-catalog.ts.

/** What a retention figure is measured in — these are NOT interchangeable. */
export type RetentionUnit =
  /** Cubic metres held per m² of intervention, per rain event. */
  | 'm3_per_m2'
  /** Cubic metres held per linear metre, per rain event. */
  | 'm3_per_linear_m'
  /** Cubic metres passed per m² per hour — a flow rate, not a stored volume. */
  | 'm3_per_m2_per_hour';

export interface NbsRetention {
  /** Solution id in NBS_SOLUTIONS. */
  solutionId: string;
  min: number;
  max: number;
  unit: RetentionUnit;
  /** The sizing formula, in the document's terms. */
  formula: { pt: string; en: string };
  /** Design parameters a technician needs before this figure means anything. */
  parameters?: { pt: string; en: string };
  /** Evidence the document cites for the range. */
  basis: { pt: string; en: string };
  /** Always true for now — see the provenance warning above. */
  estimated: true;
}

export const NBS_RETENTION: NbsRetention[] = [
  {
    solutionId: 'bacia-de-retencao',
    min: 0.15,
    max: 0.35,
    unit: 'm3_per_m2',
    formula: {
      pt: 'Área (m²) × Lâmina (m) × 0,85 (perdas)',
      en: 'Area (m²) × Depth (m) × 0.85 (losses)',
    },
    parameters: {
      pt: 'A lâmina define a capacidade: subir de 0,30 m para 0,50 m eleva o volume retido em 50%. Em cenários severos projeta-se até 1,0 m.',
      en: 'Depth drives capacity: going from 0.30 m to 0.50 m raises retained volume by 50%. Severe scenarios design up to 1.0 m.',
    },
    basis: {
      pt: 'Engenharia hidráulica clássica de micro e macrodrenagem urbana.',
      en: 'Classical hydraulic engineering for urban micro and macrodrainage.',
    },
    estimated: true,
  },
  {
    solutionId: 'jardins-de-chuva',
    min: 0.15,
    max: 0.35,
    unit: 'm3_per_m2',
    formula: {
      pt: 'Área × Profundidade × Porosidade × Coeficiente de segurança',
      en: 'Area × Depth × Porosity × Safety coefficient',
    },
    parameters: {
      pt: 'Exemplo conservador: 55 m² × 0,40 m × 0,40 de porosidade × 0,85 ≈ 7,5 m³. Estimativas de campo chegam a 17,3 m³.',
      en: 'Conservative example: 55 m² × 0.40 m × 0.40 porosity × 0.85 ≈ 7.5 m³. Field estimates reach 17.3 m³.',
    },
    basis: {
      pt: 'Revisão sistemática de 2024 (53 artigos); pesquisas na Polônia registram retenção de 67% a 95% do volume afluente.',
      en: 'A 2024 systematic review (53 papers); Polish studies record 67–95% retention of inflow volume.',
    },
    estimated: true,
  },
  {
    solutionId: 'biovaletas',
    min: 0.10,
    max: 0.20,
    unit: 'm3_per_linear_m',
    formula: {
      pt: 'Comprimento × Largura × Profundidade × Porosidade',
      en: 'Length × Width × Depth × Porosity',
    },
    parameters: {
      pt: 'Exemplo: 100 m × 1,2 m × 0,4 m × 0,40 = 19,2 m³.',
      en: 'Example: 100 m × 1.2 m × 0.4 m × 0.40 = 19.2 m³.',
    },
    basis: {
      pt: 'Projetos em Guimarães (Portugal): volumes acumulados de até 115 m³, infiltração entre 1,6 e 11,9 m/dia.',
      en: 'Projects in Guimarães, Portugal: accumulated volumes up to 115 m³, infiltration 1.6–11.9 m/day.',
    },
    estimated: true,
  },
  {
    solutionId: 'pavimentos-permeaveis',
    min: 0.014,
    max: 0.194,
    // A RATE, not a stored volume — a permeable pavement passes water through,
    // it does not hold it. Never sum this with the m3_per_m2 figures.
    unit: 'm3_per_m2_per_hour',
    formula: {
      pt: 'Área × Taxa de infiltração do pavimento',
      en: 'Area × Pavement infiltration rate',
    },
    parameters: {
      pt: 'Taxa de até 10⁻³ m/s (3,6 m/h) [Acioli, 2005]: 100 m² absorvem até 19,4 m³/h. Exige manutenção preventiva contra colmatação.',
      en: 'Rate up to 10⁻³ m/s (3.6 m/h) [Acioli, 2005]: 100 m² absorb up to 19.4 m³/h. Needs preventive maintenance against clogging.',
    },
    basis: {
      pt: 'Acioli (2005), medições de campo em pavimentos porosos.',
      en: 'Acioli (2005), field measurement of porous pavements.',
    },
    estimated: true,
  },
  {
    // The document's "Microfloresta (Método Miyawaki)". Attached to
    // reflorestamento because that is where the catalog's dense-native-planting
    // content lives — and this is exactly the scale-variant Robson asked for and
    // Julia framed as "Miyawaki vs. floresta maior" on 2026-07-16. When
    // scaleVariants land in nbs-catalog.ts, this moves onto the Miyawaki variant.
    solutionId: 'reflorestamento',
    min: 0.20,
    max: 0.30,
    unit: 'm3_per_m2',
    formula: {
      pt: 'Área × 0,25 (interceptação foliar + infiltração)',
      en: 'Area × 0.25 (canopy interception + infiltration)',
    },
    parameters: {
      pt: 'Densidade de 3 a 12 mudas/m²; descompactação do solo de 0,5 a 1,0 m; composto orgânico e mulching. Por 100 m²: interceptação 10–30 m³/evento, infiltração 5–15 m³/evento.',
      en: 'Density 3–12 seedlings/m²; soil decompaction 0.5–1.0 m; compost and mulching. Per 100 m²: interception 10–30 m³/event, infiltration 5–15 m³/event.',
    },
    basis: {
      pt: 'Estudos da 2adapt (Portugal, desde 2021): alta eficiência hídrica, microclima favorável, aumento de biodiversidade.',
      en: '2adapt studies (Portugal, since 2021): high water efficiency, favourable microclimate, substantial biodiversity gain.',
    },
    estimated: true,
  },
];

export function retentionFor(solutionId: string): NbsRetention | undefined {
  return NBS_RETENTION.find(r => r.solutionId === solutionId);
}

/**
 * Rough retained volume for an area, in m³ per rain event — the W3 sizing
 * helper. Returns null for solutions we have no figure for, and for the
 * linear and rate units, which need a length or a duration the caller has to
 * supply deliberately rather than guess.
 */
export function estimateRetentionM3(solutionId: string, areaM2: number): { min: number; max: number } | null {
  const r = retentionFor(solutionId);
  if (!r || r.unit !== 'm3_per_m2' || !(areaM2 > 0)) return null;
  return { min: +(r.min * areaM2).toFixed(1), max: +(r.max * areaM2).toFixed(1) };
}

// ── The scale statement ──────────────────────────────────────────────────────

export interface EventScaleRow {
  id: 'historic' | 'intense' | 'design' | 'microbasin';
  label: { pt: string; en: string };
  /** Water volume generated by the event, m³, Sarandi basin. */
  volumeM3: number;
  /** Share a 5,736 m³ NBS portfolio would absorb. */
  absorbedPct: number;
  verdict: { pt: string; en: string };
  /** Whether NBS are a meaningful answer at this scale — drives the framing. */
  meaningful: boolean;
}

/** Bacia do Sarandi, Porto Alegre. Illustrative — see the provenance warning. */
export const NBS_EVENT_SCALE: EventScaleRow[] = [
  {
    id: 'historic',
    label: { pt: 'Enchente histórica (2024)', en: 'Historic flood (2024)' },
    volumeM3: 18_450_000,
    absorbedPct: 0.03,
    verdict: {
      pt: 'Insignificante frente ao transbordamento de rios e diques.',
      en: 'Insignificant against river and dike overtopping.',
    },
    meaningful: false,
  },
  {
    id: 'intense',
    label: { pt: 'Chuva intensa (TR 10 anos)', en: 'Intense rain (10-year return)' },
    volumeM3: 500_000,
    absorbedPct: 1.1,
    verdict: {
      pt: 'Alívio em gargalos e pontos críticos localizados.',
      en: 'Relief at local bottlenecks and critical points.',
    },
    meaningful: false,
  },
  {
    id: 'design',
    label: { pt: 'Chuva de projeto (TR 25 anos)', en: 'Design rain (25-year return)' },
    volumeM3: 250_000,
    absorbedPct: 2.3,
    verdict: {
      pt: 'Redução notável do pico de escoamento superficial.',
      en: 'Notable reduction of the runoff peak.',
    },
    meaningful: true,
  },
  {
    id: 'microbasin',
    label: { pt: 'Alagamento em microbacia', en: 'Microbasin flooding' },
    volumeM3: 50_000,
    absorbedPct: 11.5,
    verdict: {
      pt: 'Impacto expressivo: desacelera a água e evita acúmulo nas vias.',
      en: 'Expressive impact: slows the water and prevents it pooling in the streets.',
    },
    meaningful: true,
  },
];

/**
 * What these solutions solve and what they do not. Shown in W2 as
 * expectation-setting, before an organization designs a project against a
 * problem its project cannot address.
 */
export const NBS_SCALE_HONESTY = {
  solves: {
    pt: [
      'alagamento de rua em chuva de rotina',
      'sobrecarga das galerias',
      'ilhas de calor',
      'perda de biodiversidade',
    ],
    en: [
      'street flooding in routine rain',
      'stormwater gallery overload',
      'heat islands',
      'biodiversity loss',
    ],
  },
  doesNotSolve: {
    pt: [
      'o Guaíba e os rios subindo acima da cota de inundação',
      'rompimento de diques',
      'parada das bombas de macrodrenagem',
    ],
    en: [
      'the Guaíba and the rivers rising above flood level',
      'dike failure',
      'macrodrainage pumps going down',
    ],
  },
  /** The one-paragraph version, for the W2 educational beat. */
  framing: {
    pt: 'As SbN resolvem muito bem a água do dia a dia — a chuva que alaga a rua, que sobrecarrega a galeria, o calor que toma a praça. O que elas **não** resolvem é a enchente grande, de rio subindo e dique rompendo: pra isso são obras de macrodrenagem. Isso não diminui o projeto de vocês — só situa onde ele age de verdade.',
    en: "NBS work very well on everyday water — the rain that floods the street, overloads the drain, the heat that takes over the square. What they do **not** solve is the big flood, rivers rising and dikes breaking: that needs macrodrainage works. This doesn't diminish your project — it just places where it genuinely acts.",
  },
  source: {
    pt: 'Documento técnico da Conceito Arte (rede SCbN POA), julho de 2026 — cenário ilustrativo para a Bacia do Sarandi.',
    en: 'Technical document by Conceito Arte (Rede SCbN POA), July 2026 — illustrative scenario for the Sarandi basin.',
  },
  estimated: true as const,
};

/**
 * Whether what an organization named as its worry is something NBS can
 * meaningfully address at community scale — used to decide whether W2 needs to
 * reframe expectations before recommending anything.
 *
 * `catastrophic` is the case that matters: they said flooding AND described the
 * 2024 event or a river/dike. The honest answer is that their project acts on
 * the everyday water, and that the big flood is an advocacy conversation.
 */
export function needsScaleReframing(worry: string[], story: string): boolean {
  if (!worry.includes('flood')) return false;
  const s = story.toLowerCase();
  return /enchente|2024|guaíba|guaiba|dique|rio subiu|subiu o rio|inunda|the flood|dike|river rose/.test(s);
}
