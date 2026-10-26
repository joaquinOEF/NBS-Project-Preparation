// ============================================================================
// E4 INDICATORS — what the pre-note says will be counted, per solution
// ============================================================================
// The one-page pre-note (Encontro 4) promises a funder "2 a 4 indicadores".
// Organisations are not NBS specialists and were never going to write them
// (Julia, 14 Oct 2026: "não achamos que as organizações têm capacidade de
// desenvolver esses itens"). So the indicators are OURS, chosen from a fixed
// menu per solution, and the organisation only picks which change matters to
// them ("O que vocês querem ver mudar?") — the chip they tap IS an indicator.
//
// ── The rules this file keeps ───────────────────────────────────────────────
//   · Every indicator says WHO can measure it and HOW, in words a community
//     association can act on. An indicator nobody can count is decoration.
//     Most are countable by the organisation itself, with a phone photo.
//   · A number on the page comes from a function (`sizeOf`, `benefitFor`),
//     never from this file — the menu says what to count, not how much.
//   · The menu is reviewed once by Robson (decided 14 Oct 2026) instead of
//     every note being reviewed. `INDICATOR_MENU_REVIEW` records whether that
//     review happened; until it has, the note prints the indicators as a
//     "proposta técnica" — which they are.
//   · The printable review sheet for Robson is generated from this file
//     (`docs/e4-indicators-review.md`, `scripts/e4-indicators-review.ts`) and a
//     spec fails if it drifts, so what he signs is what the code prints.
// ============================================================================

import { NBS_SOLUTIONS } from './nbs-catalog';
import { SOLUTION_COSTS } from './w3-sizing';
import { benefitFor } from './w3-benefits';
import { familiesOfWorries, type HazardKey } from './site-knowledge';
import { SOLUTION_STRENGTHS, addresses } from './solution-strengths';

type Lang = 'pt' | 'en';

/** pessoas = who benefits · entrega = what gets built · efeito = what changes. */
export type IndicatorKind = 'pessoas' | 'entrega' | 'efeito';

/** Who can take the measurement without hiring anyone. */
export type Measurer = 'organizacao' | 'tecnico';

export interface IndicatorDef {
  id: string;
  kind: IndicatorKind;
  measurer: Measurer;
  /** Hazards this indicator speaks to — pre-ticks it from the E2 worry. */
  answers?: HazardKey[];
  pt: { label: string; unit: string; how: string; baseline: string; change?: string };
  en: { label: string; unit: string; how: string; baseline: string; change?: string };
  /** Where the measure comes from, in our KB. */
  source: string;
}

const CO = (f: string) => `knowledge/_co-benefits/${f}.md`;

/**
 * The library. `change` is the chip an organisation taps at "O que vocês
 * querem ver mudar?" — present only on `efeito` indicators, because that
 * question is about effects; people and delivery are always on the note.
 */
export const INDICATORS: Record<string, IndicatorDef> = {
  // ── Pessoas ───────────────────────────────────────────────────────────────
  'familias-atendidas': {
    id: 'familias-atendidas', kind: 'pessoas', measurer: 'organizacao',
    pt: { label: 'Famílias atendidas', unit: 'famílias', how: 'Contagem da organização das casas no entorno que sentem o problema hoje.', baseline: 'O número contado antes da obra é a própria linha de base.' },
    en: { label: 'Households served', unit: 'households', how: "The organisation's count of the homes nearby that feel the problem today.", baseline: 'The count taken before the works is the baseline itself.' },
    source: CO('economic-social'),
  },
  // ── Entrega ───────────────────────────────────────────────────────────────
  'area-implantada': {
    id: 'area-implantada', kind: 'entrega', measurer: 'organizacao',
    pt: { label: 'Área implantada', unit: 'm²', how: 'Medida com trena ou desenhada no mapa da plataforma depois da obra, com foto.', baseline: 'Zero antes da obra.' },
    en: { label: 'Area built', unit: 'm²', how: "Measured with a tape or traced on the platform's map after the works, with a photo.", baseline: 'Zero before the works.' },
    source: CO('flood-risk-reduction'),
  },
  'unidades-implantadas': {
    id: 'unidades-implantadas', kind: 'entrega', measurer: 'organizacao',
    pt: { label: 'Unidades implantadas', unit: 'unidades', how: 'Contagem com foto de cada unidade pronta.', baseline: 'Zero antes da obra.' },
    en: { label: 'Units built', unit: 'units', how: 'A count, with a photo of each finished unit.', baseline: 'Zero before the works.' },
    source: CO('flood-risk-reduction'),
  },
  'mudas-vivas': {
    id: 'mudas-vivas', kind: 'entrega', measurer: 'organizacao',
    pt: { label: 'Mudas vivas depois de um ano', unit: '% das plantadas', how: 'Contagem das mudas vivas um ano depois do plantio, comparada com as plantadas.', baseline: 'O número de mudas plantadas.' },
    en: { label: 'Seedlings alive after one year', unit: '% of planted', how: 'A count of living seedlings a year after planting, against the number planted.', baseline: 'The number planted.' },
    source: CO('biodiversity'),
  },
  // ── Efeito ────────────────────────────────────────────────────────────────
  'alagamentos': {
    id: 'alagamentos', kind: 'efeito', measurer: 'organizacao', answers: ['flood'],
    pt: { label: 'Vezes que o lugar alagou numa chuva forte', unit: 'vezes por ano', how: 'Registro da organização a cada chuva forte: alagou ou não, até onde a água chegou, com foto.', baseline: 'Quantas vezes alagou no último ano, de memória e pelas fotos que existirem.', change: 'Menos água parada / menos alagamento' },
    en: { label: 'Times the place flooded in heavy rain', unit: 'times per year', how: "The organisation's log after each heavy rain: flooded or not, how high, with a photo.", baseline: 'How often it flooded in the past year, from memory and existing photos.', change: 'Less standing water / less flooding' },
    source: CO('flood-risk-reduction'),
  },
  'agua-segurada': {
    id: 'agua-segurada', kind: 'efeito', measurer: 'tecnico', answers: ['flood'],
    pt: { label: 'Água segurada por chuva forte', unit: 'litros por chuva', how: 'Estimativa de projeto pela área implantada; medição real exige régua ou sensor de nível.', baseline: 'Zero: hoje essa água vai pra rua.', change: 'Segurar a água da chuva no lugar' },
    en: { label: 'Water held per heavy rain', unit: 'litres per rain', how: 'A design estimate from the area built; a real measurement needs a gauge or level sensor.', baseline: 'Zero: today this water runs to the street.', change: 'Hold rainwater where it falls' },
    source: CO('flood-risk-reduction'),
  },
  'agua-captada': {
    id: 'agua-captada', kind: 'efeito', measurer: 'organizacao', answers: ['flood'],
    pt: { label: 'Água da chuva captada e usada', unit: 'litros por mês', how: 'Leitura mensal do nível da cisterna, anotada pela organização.', baseline: 'Zero antes da cisterna.', change: 'Ter água da chuva pra usar' },
    en: { label: 'Rainwater captured and used', unit: 'litres per month', how: 'A monthly reading of the cistern level, logged by the organisation.', baseline: 'Zero before the cistern.', change: 'Have rainwater to use' },
    source: CO('flood-risk-reduction'),
  },
  'temperatura': {
    id: 'temperatura', kind: 'efeito', measurer: 'organizacao', answers: ['heat'],
    pt: { label: 'Diferença de temperatura no lugar', unit: '°C', how: 'Termômetro simples no lugar e num ponto sem sombra perto, no mesmo horário, em três dias de calor por verão.', baseline: 'A mesma medição antes da obra.', change: 'Mais sombra / menos calor' },
    en: { label: 'Temperature difference at the place', unit: '°C', how: 'A simple thermometer at the place and at a nearby unshaded spot, same time, on three hot days each summer.', baseline: 'The same reading before the works.', change: 'More shade / less heat' },
    source: CO('heat-island-mitigation'),
  },
  'erosao': {
    id: 'erosao', kind: 'efeito', measurer: 'organizacao', answers: ['landslide'],
    pt: { label: 'Sinais de erosão depois de chuva forte', unit: 'ocorrências por ano', how: 'Foto do mesmo ponto depois de cada chuva forte: terra descendo, rachadura, sulco novo.', baseline: 'Fotos do barranco hoje, dos mesmos pontos.', change: 'Barranco firme / menos terra descendo' },
    en: { label: 'Signs of erosion after heavy rain', unit: 'occurrences per year', how: 'A photo of the same spot after each heavy rain: earth moving, cracks, new gullies.', baseline: 'Photos of the slope today, from the same spots.', change: 'A stable slope / less earth coming down' },
    source: CO('flood-risk-reduction'),
  },
  'qualidade-agua': {
    id: 'qualidade-agua', kind: 'efeito', measurer: 'organizacao', answers: ['flood'],
    pt: { label: 'Aparência da água', unit: 'escala de 1 a 3', how: 'Foto mensal do mesmo ponto: cor, cheiro, lixo boiando (1 ruim, 3 boa).', baseline: 'A mesma foto e nota antes da obra.', change: 'Água mais limpa' },
    en: { label: 'How the water looks', unit: 'scale of 1 to 3', how: 'A monthly photo from the same spot: colour, smell, floating litter (1 poor, 3 good).', baseline: 'The same photo and score before the works.', change: 'Cleaner water' },
    source: CO('biodiversity'),
  },
  'especies': {
    id: 'especies', kind: 'efeito', measurer: 'organizacao',
    pt: { label: 'Espécies de aves e insetos vistas', unit: 'espécies', how: 'Uma caminhada de 30 minutos por estação, anotando ou fotografando (o app iNaturalist ajuda).', baseline: 'A mesma caminhada antes da obra.', change: 'Mais bichos e plantas' },
    en: { label: 'Bird and insect species seen', unit: 'species', how: 'A 30-minute walk each season, noting or photographing (the iNaturalist app helps).', baseline: 'The same walk before the works.', change: 'More wildlife and plants' },
    source: CO('biodiversity'),
  },
  'uso-do-espaco': {
    id: 'uso-do-espaco', kind: 'efeito', measurer: 'organizacao',
    pt: { label: 'Pessoas usando o espaço', unit: 'pessoas num dia típico', how: 'Contagem de quem passa ou fica no lugar numa hora fixa, um dia de semana e um de fim de semana.', baseline: 'A mesma contagem antes da obra.', change: 'Gente usando o lugar' },
    en: { label: 'People using the space', unit: 'people on a typical day', how: 'A count of who passes or stays at a fixed hour, on one weekday and one weekend day.', baseline: 'The same count before the works.', change: 'People using the place' },
    source: CO('public-health'),
  },
  'alunos': {
    id: 'alunos', kind: 'efeito', measurer: 'organizacao',
    pt: { label: 'Alunos em atividades no pátio', unit: 'alunos por semana', how: 'Registro da escola das aulas e atividades feitas no pátio.', baseline: 'O mesmo registro antes da obra.', change: 'Alunos aproveitando o pátio' },
    en: { label: 'Pupils in activities in the yard', unit: 'pupils per week', how: "The school's log of lessons and activities held in the yard.", baseline: 'The same log before the works.', change: 'Pupils using the yard' },
    source: CO('public-health'),
  },
  'alimento': {
    id: 'alimento', kind: 'efeito', measurer: 'organizacao',
    pt: { label: 'Alimento colhido', unit: 'kg por mês', how: 'Pesagem da colheita, anotada pela organização.', baseline: 'Zero antes da horta.', change: 'Comida saindo da horta' },
    en: { label: 'Food harvested', unit: 'kg per month', how: 'Weighing the harvest, logged by the organisation.', baseline: 'Zero before the garden.', change: 'Food coming out of the garden' },
    source: CO('economic-social'),
  },
  'residuo-desviado': {
    id: 'residuo-desviado', kind: 'efeito', measurer: 'organizacao',
    pt: { label: 'Resíduo orgânico que deixou de ir pro lixo', unit: 'kg por mês', how: 'Pesagem dos baldes que chegam na composteira ou no biodigestor.', baseline: 'Zero antes.', change: 'Menos lixo orgânico na rua' },
    en: { label: 'Organic waste kept out of the bin', unit: 'kg per month', how: 'Weighing the buckets that reach the composter or digester.', baseline: 'Zero before.', change: 'Less organic waste on the street' },
    source: CO('economic-social'),
  },
  'gas-economizado': {
    id: 'gas-economizado', kind: 'efeito', measurer: 'organizacao',
    pt: { label: 'Gás de cozinha economizado', unit: 'botijões por mês', how: 'Comparação dos botijões comprados por mês antes e depois.', baseline: 'Botijões por mês antes do biodigestor.', change: 'Gastar menos com gás' },
    en: { label: 'Cooking gas saved', unit: 'cylinders per month', how: 'Gas cylinders bought per month, before and after.', baseline: 'Cylinders per month before the digester.', change: 'Spend less on gas' },
    source: CO('economic-social'),
  },
  'carbono': {
    id: 'carbono', kind: 'efeito', measurer: 'tecnico',
    pt: { label: 'Carbono guardado pela vegetação', unit: 't CO₂ por ano', how: 'Estimativa de projeto pela área e pelo tipo de vegetação; medição real exige inventário técnico.', baseline: 'O que a área guarda hoje (perto de zero em área sem vegetação).', change: 'Guardar carbono' },
    en: { label: 'Carbon stored by the vegetation', unit: 't CO₂ per year', how: 'A design estimate from area and vegetation type; a real measurement needs a technical inventory.', baseline: 'What the area stores today (near zero on bare ground).', change: 'Store carbon' },
    source: CO('carbon-sequestration'),
  },
};

/**
 * The menu per solution: the EFFECTS an organisation can choose between (1–4).
 * People (`familias-atendidas`) and delivery (area or units, from the cost
 * basis) are added by `indicatorMenu` for every solution, so they are not
 * repeated here. `extraDelivery` adds a second delivery indicator where the
 * built count alone hides the risk (seedlings that die).
 *
 * ⚠️ Add, never remove or rename. An organisation's picks are stored as ids
 * (`_e4_changes`) and the note keeps only ids still on the menu, so a removed
 * effect silently leaves their page; a chip is matched by its label when
 * tapped, so a renamed one asked before a deploy and answered after it is
 * read as typed text. The fourth effect on seven solutions came from Robson's
 * rating (shared/solution-strengths.ts, 26 Oct): a threat he rates Forte or
 * Média that the menu could not measure got its effect — the strongest first,
 * alagamento before calor on a tie, one per solution already at three.
 */
export const SOLUTION_INDICATORS: Record<string, { effects: string[]; extraDelivery?: string[] }> = {
  'jardins-de-chuva': { effects: ['alagamentos', 'agua-segurada'] },
  'biovaletas': { effects: ['alagamentos'] },
  'canteiro-pluvial': { effects: ['alagamentos', 'agua-segurada'] },
  'bacia-de-retencao': { effects: ['alagamentos', 'agua-segurada', 'temperatura'] },
  'wetland-construido': { effects: ['qualidade-agua', 'especies', 'carbono', 'alagamentos'] },
  'pavimentos-permeaveis': { effects: ['alagamentos'] },
  'escada-hidraulica-vegetada': { effects: ['erosao', 'alagamentos'] },
  'terracos-de-chuva': { effects: ['erosao', 'alagamentos'] },
  'ilhas-filtrantes-flutuantes': { effects: ['qualidade-agua', 'especies'] },
  'barraginha': { effects: ['erosao', 'alagamentos'] },
  'captacao-agua-da-chuva': { effects: ['agua-captada', 'alagamentos'] },
  'parques-e-florestas-urbanas': { effects: ['temperatura', 'uso-do-espaco', 'carbono', 'alagamentos'], extraDelivery: ['mudas-vivas'] },
  'teto-verde': { effects: ['temperatura', 'alagamentos'] },
  'corredores-verdes': { effects: ['temperatura', 'carbono', 'alagamentos'], extraDelivery: ['mudas-vivas'] },
  'parques-lineares': { effects: ['uso-do-espaco', 'especies', 'alagamentos', 'temperatura'] },
  'escola-verde': { effects: ['temperatura', 'alunos', 'alagamentos'] },
  'parque-naturalizado': { effects: ['temperatura', 'uso-do-espaco', 'especies'] },
  'hortas-urbanas': { effects: ['alimento', 'uso-do-espaco'] },
  'compostagem': { effects: ['residuo-desviado'] },
  'cozinha-comunitaria-biodigestor': { effects: ['residuo-desviado', 'gas-economizado'] },
  'sistema-alimentar-local': { effects: ['alimento'] },
  'grade-viva': { effects: ['erosao'] },
  'muro-de-arrimo-verde': { effects: ['erosao'] },
  'solo-grampeado-verde': { effects: ['erosao'] },
  'contencoes-em-geocelulas': { effects: ['erosao'] },
  'reflorestamento': { effects: ['erosao', 'especies', 'carbono', 'alagamentos'], extraDelivery: ['mudas-vivas'] },
  'restauracao-areas-umidas': { effects: ['especies', 'qualidade-agua', 'carbono', 'alagamentos'] },
};

/**
 * Whether Robson has reviewed the menu above. Flip to the review date once he
 * has, with his corrections applied — the note prints "proposta técnica, a
 * revisar" until then.
 */
export const INDICATOR_MENU_REVIEW: { reviewedBy: string; on: string } | null = null;

export interface ResolvedIndicator {
  id: string;
  kind: IndicatorKind;
  measurer: Measurer;
  label: string;
  unit: string;
  how: string;
  baseline: string;
  /** What the project sets out to deliver, when the size closes it ("120 m²"). */
  target?: string;
  /** A design estimate from `benefitFor`, never a measurement. */
  estimate?: string;
  source: string;
}

const fmt = (n: number, lang: Lang) => n.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: 0 });

/** The delivery indicator a solution's cost basis implies. */
function deliveryFor(solutionId: string): string | null {
  const basis = SOLUTION_COSTS[solutionId]?.basis;
  if (basis === 'unit') return 'unidades-implantadas';
  if (basis === 'm2') return 'area-implantada';
  return null; // 'project' / 'none': no honest single count; the effects carry it.
}

/**
 * Resolve one indicator for one solution at one size. Returns null when the
 * indicator would print with nothing to stand on — a design-estimate indicator
 * (`agua-segurada`, `carbono`) whose number the footprint cannot close.
 */
export function resolveIndicator(
  indicatorId: string,
  solutionId: string,
  size: { areaM2?: number; units?: number },
  lang: Lang = 'pt',
): ResolvedIndicator | null {
  const def = INDICATORS[indicatorId];
  if (!def) return null;
  const t = def[lang];
  const base: ResolvedIndicator = {
    id: def.id, kind: def.kind, measurer: def.measurer,
    label: t.label, unit: t.unit, how: t.how, baseline: t.baseline, source: def.source,
  };
  const cost = SOLUTION_COSTS[solutionId];

  if (indicatorId === 'area-implantada' && size.areaM2) {
    return { ...base, target: `${fmt(size.areaM2, lang)} m²` };
  }
  if (indicatorId === 'unidades-implantadas') {
    const one = lang === 'pt' ? cost?.unitPt : cost?.unitEn;
    const many = lang === 'pt' ? cost?.unitPluralPt : cost?.unitPluralEn;
    const label = many ? `${many.charAt(0).toUpperCase()}${many.slice(1)} ${lang === 'pt' ? 'implantadas' : 'built'}` : t.label;
    // ⚠️ The participle agrees with the noun in Portuguese — árvores/cisternas/
    // barraginhas are all feminine, which is why one form is enough today. A
    // masculine unit added to SOLUTION_COSTS needs its own form here.
    return {
      ...base,
      label,
      unit: many ?? t.unit,
      ...(size.units ? { target: `${fmt(size.units, lang)} ${size.units === 1 ? one ?? '' : many ?? ''}`.trim() } : {}),
    };
  }
  if (indicatorId === 'agua-segurada') {
    const b = benefitFor(solutionId, size.areaM2, size.units);
    if (!b?.siteSpecific || !(lang === 'pt' ? b.headlinePt : b.headlineEn)) return null;
    return { ...base, estimate: (lang === 'pt' ? b.headlinePt : b.headlineEn)! };
  }
  if (indicatorId === 'carbono') {
    const b = benefitFor(solutionId, size.areaM2, size.units);
    const kind = lang === 'pt' ? 'carbono' : 'carbon';
    const line = (lang === 'pt' ? b?.extrasPt : b?.extrasEn)?.find(e => e.startsWith(`${kind}:`) && /\d/.test(e));
    const perUnit = b?.basis === 'per_unit' && b.siteSpecific ? (lang === 'pt' ? b.headlinePt : b.headlineEn) : null;
    if (!line && !perUnit) return null;
    if (line) return { ...base, estimate: line.slice(kind.length + 1).trim() };
    // A per-tree figure is a LIFETIME total, not a yearly rate — the unit says so.
    return { ...base, unit: lang === 'pt' ? 't CO₂ ao longo da vida' : 't CO₂ over its lifetime', estimate: perUnit! };
  }
  return base;
}

/** Every indicator a solution's note may carry, people and delivery first. */
export function indicatorMenu(
  solutionId: string,
  size: { areaM2?: number; units?: number } = {},
  lang: Lang = 'pt',
): ResolvedIndicator[] {
  const entry = SOLUTION_INDICATORS[solutionId];
  if (!entry) return [];
  const ids = [
    'familias-atendidas',
    ...[deliveryFor(solutionId)].filter((x): x is string => !!x),
    ...(entry.extraDelivery ?? []),
    ...entry.effects,
  ];
  return ids.map(id => resolveIndicator(id, solutionId, size, lang)).filter((x): x is ResolvedIndicator => !!x);
}

export interface ImpactChip {
  indicatorId: string;
  label: string;
  /** Pre-ticked because it answers what worried them in Encontro 2. */
  preselected: boolean;
}

/**
 * The chips for "O que vocês querem ver mudar?" — one per effect indicator on
 * the menu, pre-ticked when it answers a worry named in Encontro 2 (`site_worry`,
 * comma-separated ids) AND the solution acts on that threat (Robson's rating,
 * Forte or Média): a horta does not pre-tick "menos alagamento" for a place
 * that floods. A design-estimate effect that the size cannot close is not
 * offered: a chip for a change we cannot describe is a promise.
 */
export function impactChips(
  solutionId: string,
  siteWorry: string | undefined,
  size: { areaM2?: number; units?: number } = {},
  lang: Lang = 'pt',
): ImpactChip[] {
  const named = familiesOfWorries((siteWorry ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const rated = SOLUTION_STRENGTHS[solutionId];
  const families = rated ? named.filter(h => addresses(rated[h])) : named;
  return indicatorMenu(solutionId, size, lang)
    .filter(i => i.kind === 'efeito')
    .map(i => {
      const def = INDICATORS[i.id];
      return {
        indicatorId: i.id,
        label: def[lang].change ?? i.label,
        preselected: (def.answers ?? []).some(h => families.includes(h)),
      };
    });
}

/**
 * The indicators that go on the note: people, delivery, and the effects the
 * organisation chose — or, if they chose none, the pre-ticked ones, or the
 * first effect. Capped at four, as the note promises "2 a 4".
 */
export function noteIndicators(
  solutionId: string,
  chosenEffects: string[] | undefined,
  siteWorry: string | undefined,
  size: { areaM2?: number; units?: number } = {},
  lang: Lang = 'pt',
): ResolvedIndicator[] {
  const menu = indicatorMenu(solutionId, size, lang);
  const effects = menu.filter(i => i.kind === 'efeito');
  let picked = effects.filter(i => chosenEffects?.includes(i.id));
  if (picked.length === 0) {
    const pre = new Set(impactChips(solutionId, siteWorry, size, lang).filter(c => c.preselected).map(c => c.indicatorId));
    picked = effects.filter(i => pre.has(i.id));
  }
  if (picked.length === 0 && effects[0]) picked = [effects[0]];
  const people = menu.filter(i => i.kind === 'pessoas');
  const delivery = menu.filter(i => i.kind === 'entrega');
  // People and the primary delivery always; effects next; extra delivery last.
  return [...people, ...delivery.slice(0, 1), ...picked, ...delivery.slice(1)].slice(0, 4);
}

// ── The invariant ───────────────────────────────────────────────────────────
// Every solution answered for, every id real, every effect choosable.
for (const s of NBS_SOLUTIONS) {
  const e = SOLUTION_INDICATORS[s.id];
  if (!e) throw new Error(`e4-indicators: solution "${s.id}" has no indicator menu`);
  if (e.effects.length < 1 || e.effects.length > 4) throw new Error(`e4-indicators: "${s.id}" needs 1–4 effects`);
  for (const id of [...e.effects, ...(e.extraDelivery ?? [])]) {
    if (!INDICATORS[id]) throw new Error(`e4-indicators: "${s.id}" names unknown indicator "${id}"`);
  }
  for (const id of e.effects) {
    if (INDICATORS[id].kind !== 'efeito') throw new Error(`e4-indicators: "${s.id}" lists "${id}" as an effect`);
    if (!INDICATORS[id].pt.change || !INDICATORS[id].en.change) throw new Error(`e4-indicators: effect "${id}" has no chip`);
  }
}
