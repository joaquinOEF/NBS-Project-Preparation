// ============================================================================
// W3 BENEFITS — what we expect this to do, in ranges, from their own footprint
// ============================================================================
// W3 asks an organisation to draw an area. That drawing is the only quantity in
// the whole workshop, and until now it bought exactly one thing: a construction
// price. It can buy the other half of the argument too — what the thing is
// expected to DO — and that half is what a funder reads first.
//
// ── The rule this file exists to enforce ────────────────────────────────────
// WE bring the number; they react to it. An organisation should never be asked
// "quantos litros de chuva vocês esperam segurar?" — nobody knows that, and the
// answer to an unanswerable question is either a blank or a guess we then treat
// as data. So every entry below states a range we can source, and the beat that
// shows it offers "faz sentido / parece muito / parece pouco". Their reaction is
// the capture.
//
// ── And the rule that keeps it honest ───────────────────────────────────────
// A benefit figure is the thing an organisation repeats to a secretariat. A
// wrong one is worse than a blank, and louder. So:
//
//   · Only figures that exist in the repo or in a source named here. Nothing
//     interpolated because a neighbouring solution had a number.
//   · A unit is not a suggestion. Biovaletas are quoted per LINEAR metre and
//     permeable paving as a flow RATE per hour — multiplying either by a
//     polygon's m² produces a confident wrong number, so neither is.
//   · 15 of the 27 have no quantified effect anywhere in the repo, including
//     the whole slope family and the whole agriculture family. Those say what
//     they do in words and carry no number at all. "A gente ainda não tem
//     número pra isso" is a usable answer; an invented litre count is not.
//   · Everything is a DESIGN ESTIMATE, never a measurement, and the copy says
//     so every time.
// ============================================================================

import { retentionFor } from './nbs-performance';
import { NBS_SOLUTIONS } from './nbs-catalog';

export type BenefitBasis =
  /** m³ held per m² of footprint, per rain event — scales off their drawing. */
  | 'volume_per_m2'
  /** Real, but quoted in a unit the drawn area cannot supply. Stated, not multiplied. */
  | 'rate'
  /** Per tree, per cistern — counted, not measured in m². */
  | 'per_unit'
  /** Cooling, carbon, habitat: scales with area but not off a single rate. */
  | 'area_effect'
  /** No quantified effect anywhere in the repo. Says what it does, in words. */
  | 'qualitative';

export type Confidence = 'alta' | 'média' | 'baixa';

export interface AreaEffect {
  /** e.g. 'carbono', 'temperatura', 'biodiversidade' */
  kindPt: string;
  kindEn: string;
  /** Per hectare per year, when the source is quoted that way. */
  perHaLow?: number;
  perHaHigh?: number;
  /** The claim in words when it does not scale linearly (cooling does not). */
  statedPt?: string;
  statedEn?: string;
  unitPt?: string;
  unitEn?: string;
  sourcePt: string;
  sourceEn: string;
  confidence: Confidence;
}

export interface SolutionBenefit {
  basis: BenefitBasis;
  /** volume_per_m2: m³ per m² per event. per_unit: m³ (or count) per unit. */
  low?: number;
  high?: number;
  unitPt?: string;
  unitEn?: string;
  /** What it does, in words. Always present — the number is never alone. */
  claimPt: string;
  claimEn: string;
  sourcePt: string;
  sourceEn: string;
  confidence: Confidence;
  /** Secondary effects that do not come off the footprint rate. */
  effects?: AreaEffect[];
  /** Required when the figure is borrowed rather than stated for this solution. */
  notaPt?: string;
  notaEn?: string;
}

const GIZ = { pt: 'faixa de projeto (GIZ / conteúdo COUGAR)', en: 'design range (GIZ / COUGAR content)' };
const COOL_FOREST: AreaEffect = {
  kindPt: 'temperatura', kindEn: 'temperature',
  statedPt: 'entre 1 °C e 5 °C mais fresco perto e embaixo da copa, depois que as árvores pegam',
  statedEn: 'between 1 °C and 5 °C cooler under and near the canopy, once the trees establish',
  sourcePt: 'revisões sistemáticas de ilha de calor urbana (média de 1,6 °C para florestas urbanas)',
  sourceEn: 'urban heat-island systematic reviews (1.6 °C average for urban forests)',
  confidence: 'alta',
};
const CARBON_REGEN: AreaEffect = {
  kindPt: 'carbono', kindEn: 'carbon',
  perHaLow: 3, perHaHigh: 11,
  unitPt: 'toneladas de CO₂ por ano', unitEn: 'tonnes of CO₂ per year',
  sourcePt: 'regeneração natural tropical (WRI / Griscom et al. 2017)',
  sourceEn: 'tropical natural regeneration (WRI / Griscom et al. 2017)',
  confidence: 'alta',
};
const CARBON_PLANTED: AreaEffect = {
  kindPt: 'carbono', kindEn: 'carbon',
  perHaLow: 4.5, perHaHigh: 40.7,
  unitPt: 'toneladas de CO₂ por ano', unitEn: 'tonnes of CO₂ per year',
  sourcePt: 'floresta tropical plantada, primeiros 20 anos (Cook-Patton et al.)',
  sourceEn: 'planted tropical forest, first 20 years (Cook-Patton et al.)',
  confidence: 'alta',
};
const CARBON_WETLAND: AreaEffect = {
  kindPt: 'carbono', kindEn: 'carbon',
  perHaLow: 6.4, perHaHigh: 6.4,
  unitPt: 'toneladas de CO₂ por ano', unitEn: 'tonnes of CO₂ per year',
  sourcePt: 'taxa de soterramento em área úmida (Donato et al. 2012)',
  sourceEn: 'wetland carbon burial rate (Donato et al. 2012)',
  confidence: 'alta',
};
const BIODIV_RESTORE: AreaEffect = {
  kindPt: 'biodiversidade', kindEn: 'biodiversity',
  statedPt: 'cerca de 67% mais espécies do que antes, em restauração de margem e parque',
  statedEn: 'around 67% more species than before, in margin and park restoration',
  sourcePt: 'npj Urban Sustainability 2023',
  sourceEn: 'npj Urban Sustainability 2023',
  confidence: 'média',
};

/**
 * One entry per solution. Ordered by família, same as the catalogue.
 *
 * `claim` is the sentence an organisation reads. It is written to be true with
 * or without the number beside it, because for 15 of these there is no number.
 */
export const SOLUTION_BENEFITS: Record<string, SolutionBenefit> = {
  // ── Águas pluviais ────────────────────────────────────────────────────────
  'jardins-de-chuva': {
    basis: 'volume_per_m2', low: 0.15, high: 0.35,
    claimPt: 'Segura a chuva que hoje corre pra rua e devolve pro solo. Em até 72 horas a água some da superfície.',
    claimEn: 'Holds rain that today runs into the street and returns it to the soil. Surface water is gone within 72 hours.',
    sourcePt: GIZ.pt, sourceEn: GIZ.en, confidence: 'média',
  },
  'canteiro-pluvial': {
    basis: 'volume_per_m2', low: 0.15, high: 0.35,
    claimPt: 'Tira a água da calçada e da guia antes dela virar poça, num espaço pequeno.',
    claimEn: 'Takes water off the pavement and kerb before it pools, in a small footprint.',
    sourcePt: GIZ.pt, sourceEn: GIZ.en, confidence: 'baixa',
    notaPt: 'A ficha descreve o canteiro pluvial como “um jardim de chuva compactado”, com as mesmas camadas de brita, areia e terra — então a faixa usada aqui é a do jardim de chuva. Num espaço menor e com paredes, o número real tende ao piso da faixa.',
    notaEn: 'The ficha describes a stormwater planter as "a rain garden compacted into a small space", with the same crushed-stone, sand and soil layers — so the range here is the rain garden\'s. In a smaller walled space the real figure tends to the bottom of it.',
  },
  'biovaletas': {
    basis: 'rate', low: 0.1, high: 0.2,
    unitPt: 'metro linear de vala', unitEn: 'linear metre of swale',
    claimPt: 'Conduz a água devagar em vez de deixar correr, e infiltra no caminho.',
    claimEn: 'Carries water slowly instead of letting it run, and infiltrates along the way.',
    sourcePt: GIZ.pt, sourceEn: GIZ.en, confidence: 'média',
    notaPt: 'A biovaleta é cobrada por metro de comprimento, não por área — então o desenho de vocês não fecha esse número sozinho. Falta o comprimento da vala.',
    notaEn: 'A swale is measured by its length, not its area — so your drawing alone does not close this number. It needs the run length.',
  },
  'bacia-de-retencao': {
    basis: 'volume_per_m2', low: 0.15, high: 0.35,
    claimPt: 'Acumula a enxurrada por algumas horas e devolve devagar, tirando o pico da cheia da rua.',
    claimEn: 'Holds the surge for a few hours and releases it slowly, taking the peak off the street.',
    sourcePt: GIZ.pt, sourceEn: GIZ.en, confidence: 'média',
  },
  'pavimentos-permeaveis': {
    basis: 'rate', low: 0.014, high: 0.194,
    unitPt: 'm² por hora', unitEn: 'm² per hour',
    claimPt: 'O piso deixa a água passar em vez de empurrar tudo pra boca de lobo.',
    claimEn: 'The surface lets water through instead of pushing it all to the drain.',
    sourcePt: GIZ.pt, sourceEn: GIZ.en, confidence: 'média',
    notaPt: 'Aqui o número é uma velocidade de infiltração, não um volume guardado — depende de quanto chove por hora, então não dá pra multiplicar pela área e dizer “segura tantos litros”.',
    notaEn: 'This figure is an infiltration speed, not a stored volume — it depends on how hard it rains, so it cannot be multiplied by the area to claim "holds this many litres".',
  },
  'terracos-de-chuva': {
    basis: 'qualitative',
    claimPt: 'Quebra a descida da água em degraus, para ela chegar embaixo com menos força.',
    claimEn: 'Breaks the water\'s descent into steps, so it arrives below with less force.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
  },
  'escada-hidraulica-vegetada': {
    basis: 'qualitative',
    claimPt: 'Leva a enxurrada morro abaixo por um caminho preparado, em vez de ela abrir o próprio.',
    claimEn: 'Takes the flash flow downhill along a prepared path instead of letting it cut its own.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
  },
  'wetland-construido': {
    basis: 'qualitative',
    claimPt: 'Trata o esgoto ou a água suja pela planta e pelo solo, e ainda segura parte da chuva.',
    claimEn: 'Treats sewage or dirty water through plants and soil, and holds some of the rain too.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
    effects: [CARBON_WETLAND, BIODIV_RESTORE],
  },
  'ilhas-filtrantes-flutuantes': {
    basis: 'qualitative',
    claimPt: 'Limpa a água parada de um lago ou açude pela raiz das plantas que flutuam nele.',
    claimEn: 'Cleans standing water in a lake or pond through the roots of plants floating on it.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
  },
  'barraginha': {
    basis: 'qualitative',
    claimPt: 'Uma bacia rasa no caminho da enxurrada: recolhe a água que desce e deixa infiltrar entre uma chuva e outra.',
    claimEn: 'A shallow basin in the path of the flow: it collects water coming down and lets it soak in between rains.',
    sourcePt: 'ficha da solução (até 20 m de diâmetro)', sourceEn: 'solution ficha (up to 20 m across)', confidence: 'baixa',
  },
  'captacao-agua-da-chuva': {
    basis: 'per_unit', low: 16, high: 16,
    unitPt: 'cisterna de placas', unitEn: 'plate cistern',
    claimPt: 'Guarda a chuva do telhado para descarga, limpeza e rega — e tira essa água da rua.',
    claimEn: 'Stores roof rain for flushing, cleaning and watering — and takes that water off the street.',
    sourcePt: 'modelo padrão do Programa Cisternas: 16 mil litros', sourceEn: 'Programa Cisternas standard model: 16,000 litres', confidence: 'alta',
  },

  // ── Verde urbano ──────────────────────────────────────────────────────────
  'parques-e-florestas-urbanas': {
    basis: 'area_effect',
    claimPt: 'Um terreno vira mata fechada em 2 a 3 anos: sombra, chão que absorve e bicho de volta.',
    claimEn: 'A lot becomes closed forest in 2 to 3 years: shade, ground that absorbs, and wildlife back.',
    sourcePt: 'conteúdo COUGAR', sourceEn: 'COUGAR content', confidence: 'média',
    effects: [COOL_FOREST, CARBON_PLANTED],
  },
  'parque-naturalizado': {
    basis: 'area_effect',
    claimPt: 'Espaço de brincar feito com o que o terreno já tem — sombra e chão vivo em vez de piso.',
    claimEn: 'A play space built from what the site already has — shade and living ground instead of paving.',
    sourcePt: 'cartilha MMA', sourceEn: 'MMA guide', confidence: 'baixa',
    effects: [COOL_FOREST],
  },
  'teto-verde': {
    basis: 'qualitative',
    claimPt: 'Segura parte da chuva antes dela descer pro cano e esfria a casa por baixo — menos ventilador.',
    claimEn: 'Holds some rain before it reaches the downpipe and cools the house underneath — less fan.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
  },
  'corredores-verdes': {
    basis: 'per_unit', low: 0.5, high: 2,
    unitPt: 'árvore, ao longo da vida', unitEn: 'tree, over its lifetime',
    claimPt: 'Uma fita de árvores que liga dois verdes e faz sombra no caminho que as pessoas já fazem.',
    claimEn: 'A ribbon of trees linking two green spaces, shading a route people already walk.',
    sourcePt: 'sequestro por árvore urbana (tCO₂ ao longo da vida)', sourceEn: 'urban tree sequestration (tCO₂ over lifetime)', confidence: 'média',
    effects: [{
      kindPt: 'temperatura', kindEn: 'temperature',
      statedPt: 'até 1,7 °C mais fresco a até 10 m da copa, durante o dia',
      statedEn: 'up to 1.7 °C cooler within 10 m of the canopy, during the day',
      sourcePt: 'estudos de proximidade de copa', sourceEn: 'canopy proximity studies',
      confidence: 'média',
    }],
  },
  'parques-lineares': {
    basis: 'qualitative',
    claimPt: 'Devolve a faixa ao longo do arroio: a cheia tem para onde ir e o bairro ganha um caminho.',
    claimEn: 'Gives the strip along the stream back: the flood has somewhere to go and the neighbourhood gains a path.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
    effects: [BIODIV_RESTORE],
  },
  'escola-verde': {
    basis: 'qualitative',
    claimPt: 'O pátio de cimento vira lugar com sombra, chão que absorve e aula ao ar livre.',
    claimEn: 'The concrete yard becomes a place with shade, absorbent ground and outdoor lessons.',
    sourcePt: 'cartilha MMA', sourceEn: 'MMA guide', confidence: 'baixa',
    effects: [COOL_FOREST],
  },

  // ── Sistema alimentar ─────────────────────────────────────────────────────
  // Nothing quantified in the repo. These are real benefits with no number
  // behind them here, and saying so is the honest version.
  'hortas-urbanas': {
    basis: 'qualitative',
    claimPt: 'Comida perto de casa, chão descoberto que volta a absorver, e um motivo pra gente se encontrar.',
    claimEn: 'Food close to home, uncovered ground absorbing again, and a reason for people to meet.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
  },
  'compostagem': {
    basis: 'qualitative',
    claimPt: 'O resto de comida vira adubo em vez de virar aterro — e o adubo fica no bairro.',
    claimEn: 'Food waste becomes compost instead of landfill — and the compost stays in the neighbourhood.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
  },
  'cozinha-comunitaria-biodigestor': {
    basis: 'qualitative',
    claimPt: 'Refeição feita perto de quem come, com o resto orgânico virando gás em vez de lixo.',
    claimEn: 'Meals cooked near the people eating them, with the organic waste becoming gas instead of rubbish.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
  },
  'sistema-alimentar-local': {
    basis: 'qualitative',
    claimPt: 'Costura o que já existe — feira, horta, cozinha — pra a comida circular sem sair do território.',
    claimEn: 'Stitches together what already exists — market, garden, kitchen — so food circulates without leaving the territory.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
  },

  // ── Encostas e solo ───────────────────────────────────────────────────────
  // ⚠️ The repo holds NO quantified figure for slope stabilisation — not a
  // retention rate, not an erosion factor, nothing in the co-benefit files.
  // These carry no number, and the beat says plainly that we do not have one.
  'grade-viva': {
    basis: 'qualitative',
    claimPt: 'Segura o barranco com estrutura viva: a raiz cresce dentro da obra e vai firmando o solo com o tempo.',
    claimEn: 'Holds the slope with a living structure: roots grow into the works and firm the soil over time.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
  },
  'muro-de-arrimo-verde': {
    basis: 'qualitative',
    claimPt: 'Um muro que segura a terra e ainda deixa a água passar e a planta crescer na face.',
    claimEn: 'A wall that holds the earth back while still letting water through and plants grow on its face.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
  },
  'solo-grampeado-verde': {
    basis: 'qualitative',
    claimPt: 'Prende a encosta por dentro, com grampos, e veste a face com vegetação.',
    claimEn: 'Pins the slope from within and clothes its face with vegetation.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
  },
  'contencoes-em-geocelulas': {
    basis: 'qualitative',
    claimPt: 'Uma malha que prende o solo no lugar enquanto a vegetação pega.',
    claimEn: 'A mesh that holds soil in place while the vegetation takes.',
    sourcePt: 'ficha da solução', sourceEn: 'solution ficha', confidence: 'baixa',
  },

  // ── Recuperação de ecossistemas ───────────────────────────────────────────
  'reflorestamento': {
    basis: 'volume_per_m2', low: 0.2, high: 0.3,
    claimPt: 'A copa segura a chuva antes dela bater no chão e a raiz abre caminho pra ela entrar.',
    claimEn: 'The canopy catches rain before it hits the ground and roots open a way for it to soak in.',
    sourcePt: 'conteúdo COUGAR (interceptação foliar + infiltração)', sourceEn: 'COUGAR content (canopy interception + infiltration)', confidence: 'média',
    effects: [CARBON_REGEN, BIODIV_RESTORE],
  },
  'restauracao-areas-umidas': {
    basis: 'qualitative',
    claimPt: 'O banhado volta a fazer o que fazia: segura a cheia, filtra a água e traz bicho de volta.',
    claimEn: 'The wetland goes back to doing what it did: holds the flood, filters the water, brings wildlife back.',
    sourcePt: 'conteúdo COUGAR', sourceEn: 'COUGAR content', confidence: 'média',
    effects: [CARBON_WETLAND, BIODIV_RESTORE],
  },
};

// ── Rendering ───────────────────────────────────────────────────────────────

export interface BenefitLine {
  solutionId: string;
  basis: BenefitBasis;
  /**
   * True when the headline is about THIS site — their footprint, their solution.
   *
   * Only then is "o que vocês acham desse número?" a fair question. A rate
   * ("0,1–0,2 m³ por metro linear de vala") is a property of the technique, not
   * of their yard, and asking them to judge it invites an opinion on something
   * they have no standing to judge and we have no way to act on.
   */
  siteSpecific: boolean;
  /** The one sentence with the number in it, when there is a number. */
  headlinePt: string | null;
  headlineEn: string | null;
  /** What it does, always. */
  claimPt: string;
  claimEn: string;
  /** Secondary effects, already scaled to the footprint where the unit allows. */
  extrasPt: string[];
  extrasEn: string[];
  sourcePt: string;
  sourceEn: string;
  confidence: Confidence;
  /** Why the footprint could not close a number, when it could not. */
  notaPt?: string;
  notaEn?: string;
}

// ⚠️ A cubic metre is a THOUSAND litres. The first version of this divided
// where it should have multiplied, so a 20,000 m² footprint holding 3,000 m³
// printed as "3 mil litros" — a thousand times under, in the one figure an
// organisation would repeat out loud. Litres, because "175.000 litros" means
// something to someone standing in a yard and "175 m³" does not.
const litres = (m3: number) => {
  const L = m3 * 1000;
  return L >= 1_000_000
    ? `${(L / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} milhões de litros`
    : `${Math.round(L).toLocaleString('pt-BR')} litros`;
};
const litresEn = (m3: number) => {
  const L = m3 * 1000;
  return L >= 1_000_000
    ? `${(L / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 1 })} million litres`
    : `${Math.round(L).toLocaleString('en-US')} litres`;
};
const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const numEn = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });

/**
 * The benefit line for one solution over a drawn footprint.
 *
 * A headline appears ONLY when the footprint can honestly close the number.
 * Everything else returns the claim plus, where relevant, a note saying what is
 * missing — which is itself useful: "falta o comprimento da vala" is a next
 * step, and a silently absent number is not.
 */
export function benefitFor(solutionId: string, areaM2?: number): BenefitLine | null {
  const b = SOLUTION_BENEFITS[solutionId];
  if (!b) return null;

  const extrasPt: string[] = [];
  const extrasEn: string[] = [];
  for (const e of b.effects ?? []) {
    if (e.perHaLow != null && e.perHaHigh != null && areaM2) {
      const ha = areaM2 / 10000;
      const lo = e.perHaLow * ha;
      const hi = e.perHaHigh * ha;
      extrasPt.push(
        lo === hi
          ? `${e.kindPt}: cerca de ${num(lo)} ${e.unitPt} nessa área — ${e.sourcePt}`
          : `${e.kindPt}: entre ${num(lo)} e ${num(hi)} ${e.unitPt} nessa área — ${e.sourcePt}`,
      );
      extrasEn.push(
        lo === hi
          ? `${e.kindEn}: about ${numEn(lo)} ${e.unitEn} on this area — ${e.sourceEn}`
          : `${e.kindEn}: between ${numEn(lo)} and ${numEn(hi)} ${e.unitEn} on this area — ${e.sourceEn}`,
      );
    } else if (e.statedPt && e.statedEn) {
      extrasPt.push(`${e.kindPt}: ${e.statedPt} — ${e.sourcePt}`);
      extrasEn.push(`${e.kindEn}: ${e.statedEn} — ${e.sourceEn}`);
    }
  }

  const base = {
    solutionId,
    basis: b.basis,
    siteSpecific: false,
    claimPt: b.claimPt,
    claimEn: b.claimEn,
    extrasPt,
    extrasEn,
    sourcePt: b.sourcePt,
    sourceEn: b.sourceEn,
    confidence: b.confidence,
    ...(b.notaPt ? { notaPt: b.notaPt, notaEn: b.notaEn } : {}),
  };

  if (b.basis === 'volume_per_m2' && b.low != null && b.high != null) {
    if (!areaM2) {
      return {
        ...base,
        headlinePt: `Segura entre ${litres(b.low)} e ${litres(b.high)} de chuva por metro quadrado, a cada chuva forte — falta a área pra fechar o total.`,
        headlineEn: `Holds between ${litresEn(b.low)} and ${litresEn(b.high)} of rain per square metre in a heavy rain — the area is missing to close a total.`,
      };
    }
    return {
      ...base,
      siteSpecific: true,
      headlinePt: `Numa chuva forte, segura entre ${litres(b.low * areaM2).replace(/ (milhões de )?litros$/, '')} e ${litres(b.high * areaM2)} de água que hoje vai pra rua.`,
      headlineEn: `In a heavy rain, holds between ${litresEn(b.low * areaM2).replace(/ (million )?litres$/, '')} and ${litresEn(b.high * areaM2)} of water that today goes to the street.`,
    };
  }

  if (b.basis === 'per_unit' && b.low != null && b.high != null) {
    const v = b.low === b.high;
    return {
      ...base,
      headlinePt: v
        ? `${b.low >= 1 && solutionId === 'captacao-agua-da-chuva' ? `${litres(b.low)}` : num(b.low)} por ${b.unitPt}.`
        : `Entre ${num(b.low)} e ${num(b.high)} por ${b.unitPt}.`,
      headlineEn: v
        ? `${b.low >= 1 && solutionId === 'captacao-agua-da-chuva' ? `${litresEn(b.low)}` : numEn(b.low)} per ${b.unitEn}.`
        : `Between ${numEn(b.low)} and ${numEn(b.high)} per ${b.unitEn}.`,
    };
  }

  if (b.basis === 'rate' && b.low != null && b.high != null) {
    return {
      ...base,
      headlinePt: `${num(b.low)}–${num(b.high)} m³ por ${b.unitPt}.`,
      headlineEn: `${numEn(b.low)}–${numEn(b.high)} m³ per ${b.unitEn}.`,
    };
  }

  return { ...base, headlinePt: null, headlineEn: null };
}

// ── The invariant ───────────────────────────────────────────────────────────
// Same contract as SOLUTION_COSTS: every solution answered for, every borrowed
// figure declaring itself, and every per-m² rate still matching the performance
// table it claims to come from.

for (const s of NBS_SOLUTIONS) {
  const b = SOLUTION_BENEFITS[s.id];
  if (!b) throw new Error(`w3-benefits: solution "${s.id}" has no benefit entry`);
  if (!b.claimPt || !b.claimEn) throw new Error(`w3-benefits: ${s.id} has no claim in both languages`);
  if ((b.notaPt && !b.notaEn) || (b.notaEn && !b.notaPt)) {
    throw new Error(`w3-benefits: ${s.id} has a note in only one language`);
  }
  if (b.basis !== 'qualitative' && b.basis !== 'area_effect') {
    if (b.low == null || b.high == null || b.low > b.high) {
      throw new Error(`w3-benefits: ${s.id} declares basis "${b.basis}" without a valid range`);
    }
  }
  // A per-m² or rate figure must still be the one nbs-performance states, unless
  // it declares itself borrowed. Drift between the two would put a different
  // number in the roadmap than in the technical annex.
  const perf = retentionFor(s.id);
  if (perf && !b.notaPt) {
    if (b.low !== perf.min || b.high !== perf.max) {
      throw new Error(
        `w3-benefits: ${s.id} claims ${b.low}–${b.high} but nbs-performance says ${perf.min}–${perf.max}. ` +
        `Follow the performance table, or add notaPt/notaEn explaining the difference.`,
      );
    }
  }
}
