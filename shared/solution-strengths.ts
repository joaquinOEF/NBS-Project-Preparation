// ============================================================================
// HOW MUCH EACH SOLUTION ACTS ON EACH THREAT — Robson's classification
// ============================================================================
// Until 26 Oct 2026 every solution inherited its família's hazard weights
// (shared/nbs-catalog.ts), so a horta and a parque read the same on heat.
// Robson (Rede SbN) rated each solution against the three threats Porto Alegre
// worries about, in the sheet "SbN COUGAR" → tab "Ameaças x SbN (proposta)".
// He confirmed on 26 Oct that the SHEET is the source ("pode manter o que está
// no arquivo original"); his portfolio text will be adjusted to it.
//
// His scale:
//   Forte  — acts directly on the physical process behind the threat;
//   Média  — contributes significantly, but depends on scale, place and
//            combination with other interventions;
//   Fraca  — local, indirect effect (other benefits may still be large);
//   nenhum — no relevant direct contribution.
// It is a potential, not a guarantee of performance.
//
// What reads it (JVP, 26 Oct): the census argument in the documents
// (`relevanceFor`) and Encontro 4's "O que vocês querem ver mudar?" menu
// (`e4-indicators.ts`). It does NOT touch the família ranking at the end of
// Encontro 2 or the map selector — those keep the família weights, which are
// what the frozen benchmark measures.
// ============================================================================

import { NBS_SOLUTIONS } from './nbs-catalog';
import type { HazardKey } from './site-knowledge';

export type Strength = 'forte' | 'media' | 'fraca' | 'nenhum';

/** Forte and Média count as "this solution addresses this threat" (JVP, 26 Oct). */
export const addresses = (s: Strength | undefined): boolean => s === 'forte' || s === 'media';

export const STRENGTH_SOURCE =
  'Classificação de Robson (Rede SbN), planilha "SbN COUGAR", aba "Ameaças x SbN", 26/10/2026';

type Row = Record<HazardKey, Strength>;
const r = (flood: Strength, heat: Strength, landslide: Strength): Row => ({ flood, heat, landslide });

/** flood = alagamento · heat = calor · landslide = deslizamento. */
export const SOLUTION_STRENGTHS: Record<string, Row> = {
  'jardins-de-chuva': r('forte', 'fraca', 'fraca'),
  'bacia-de-retencao': r('forte', 'media', 'fraca'),
  'biovaletas': r('forte', 'fraca', 'fraca'),
  'canteiro-pluvial': r('media', 'fraca', 'nenhum'),
  'wetland-construido': r('forte', 'fraca', 'nenhum'),
  'parques-e-florestas-urbanas': r('forte', 'forte', 'fraca'),
  'pavimentos-permeaveis': r('media', 'fraca', 'nenhum'),
  'teto-verde': r('media', 'forte', 'nenhum'),
  'escada-hidraulica-vegetada': r('media', 'nenhum', 'forte'),
  'terracos-de-chuva': r('media', 'nenhum', 'forte'),
  'corredores-verdes': r('media', 'forte', 'fraca'),
  'hortas-urbanas': r('fraca', 'fraca', 'nenhum'),
  'grade-viva': r('fraca', 'nenhum', 'media'),
  'ilhas-filtrantes-flutuantes': r('fraca', 'fraca', 'nenhum'),
  'muro-de-arrimo-verde': r('fraca', 'nenhum', 'forte'),
  'parques-lineares': r('forte', 'media', 'fraca'),
  'reflorestamento': r('media', 'media', 'media'),
  'restauracao-areas-umidas': r('forte', 'media', 'fraca'),
  'solo-grampeado-verde': r('fraca', 'nenhum', 'forte'),
  'barraginha': r('media', 'nenhum', 'fraca'),
  'contencoes-em-geocelulas': r('fraca', 'nenhum', 'forte'),
  'captacao-agua-da-chuva': r('fraca', 'fraca', 'nenhum'),
  'compostagem': r('fraca', 'nenhum', 'nenhum'),
  'cozinha-comunitaria-biodigestor': r('nenhum', 'nenhum', 'nenhum'),
  'escola-verde': r('fraca', 'forte', 'nenhum'),
  'parque-naturalizado': r('fraca', 'fraca', 'nenhum'),
  'sistema-alimentar-local': r('fraca', 'fraca', 'nenhum'),
};

export function strengthOf(solutionId: string | null | undefined, hazard: HazardKey): Strength | undefined {
  return solutionId ? SOLUTION_STRENGTHS[solutionId]?.[hazard] : undefined;
}

/**
 * Robson's suggested indicators per solution, from his portfolio text (26 Oct).
 * Mostly technical (m³ per event, infiltration rate, BOD/COD): they are shown
 * in his review sheet as reference, never on an organisation's page — the
 * menu in e4-indicators.ts keeps the rule that the organisation can measure it.
 */
export const ROBSON_INDICATORS_PT: Record<string, string> = {
  'jardins-de-chuva': 'Volume de água retido por evento (m³); tempo de esvaziamento (h:min); taxa de infiltração (mm/h); frequência de extravasamentos; percentual da área vegetada saudável.',
  'bacia-de-retencao': 'Volume útil de armazenamento (m³); redução do pico de vazão a jusante (%); tempo de retenção (h:min); frequência de extravasamento; qualidade da água na entrada e saída (turbidez, DBO, DQO).',
  'biovaletas': 'Vazão de pico reduzida (%); volume de escoamento tratado (m³); taxa de infiltração; remoção de sedimentos e poluentes; obstrução e integridade do canal.',
  'wetland-construido': 'Volume tratado (m³/dia); infiltração ou retenção por evento; redução do escoamento superficial (%); área funcional alagada (m²); percentual da área vegetada saudável.',
  'parques-e-florestas-urbanas': 'Área (m² ou ha), cobertura da copa, área sombreada acessível, sobrevivência de árvores, riqueza de espécies nativas.',
  'teto-verde': 'Área (m²), temperatura na superfície, volume de chuva retido (m³).',
  'escada-hidraulica-vegetada': 'Velocidade e vazão do escoamento; ocorrência de erosão entre degraus; sedimentos transportados (presença/ausência e volume).',
  'terracos-de-chuva': 'Volume retido (m³); infiltração por evento; escoamento superficial (%); estabilidade dos terraços.',
  'corredores-verdes': 'Área (m² ou ha), cobertura da copa, área sombreada acessível, sobrevivência de árvores, riqueza de espécies nativas.',
  'hortas-urbanas': 'Área cultivada (m²); temperatura do ar e solo; tempo de infiltração de volume conhecido/padronizado de água; produção de alimentos (kg/ciclo); número de participantes da manutenção.',
  'grade-viva': 'Extensão vegetada (m lineares ou área); cobertura foliar (%); periodicidade da manutenção.',
  'ilhas-filtrantes-flutuantes': 'Área (m²); sobrevivência das plantas (%); turbidez da água.',
  'muro-de-arrimo-verde': 'Proporção (%) de cobertura vegetal; temperatura superficial; integridade da estrutura; sinais de erosão ou desgaste.',
  'parques-lineares': 'Área (m² ou ha), cobertura da copa, área sombreada acessível, sobrevivência de árvores, riqueza de espécies nativas.',
  'reflorestamento': 'Área (m² ou ha), cobertura da copa, área sombreada acessível, sobrevivência de árvores, riqueza de espécies nativas.',
  'restauracao-areas-umidas': 'Área (m² ou ha), cobertura da copa, área sombreada acessível, sobrevivência de árvores, riqueza de espécies nativas.',
  'solo-grampeado-verde': 'Deslocamento da encosta; existência de fissuras, desgaste ou deformações.',
  'barraginha': 'Volume captado ou infiltrado (m³/evento); tempo de esvaziamento; frequência de extravasamento.',
  'contencoes-em-geocelulas': 'Deformação da estrutura; deslocamento do talude; erosão e perda de material de preenchimento; efetividade da drenagem/existência de poças e extravasamento.',
  'captacao-agua-da-chuva': 'Volume captado (m³/mês); capacidade de armazenamento (m³).',
  'compostagem': 'Resíduos desviados do aterro (kg/mês); composto produzido (kg/mês); número de participantes.',
  'cozinha-comunitaria-biodigestor': 'Resíduos orgânicos processados (kg/mês); biogás produzido (m³/mês); redução estimada de emissões.',
  'escola-verde': 'Área permeável e vegetada (m²); cobertura de sombra no pátio (%); temperatura em áreas de permanência; número de participantes.',
  'parque-naturalizado': 'Área permeável e vegetada (m²); cobertura de sombra no pátio (%); temperatura em áreas de permanência; número de participantes.',
  'sistema-alimentar-local': 'Volume de alimentos produzidos e distribuídos (kg/mês); número de famílias atendidas.',
};

// ── The invariant ───────────────────────────────────────────────────────────
// Every solution in the catalog is rated on all three threats, and nothing is
// rated that the catalog does not have.
for (const s of NBS_SOLUTIONS) {
  const row = SOLUTION_STRENGTHS[s.id];
  if (!row) throw new Error(`solution-strengths: "${s.id}" has no rating`);
}
for (const id of [...Object.keys(SOLUTION_STRENGTHS), ...Object.keys(ROBSON_INDICATORS_PT)]) {
  if (!NBS_SOLUTIONS.some(s => s.id === id)) throw new Error(`solution-strengths: "${id}" is not in the catalog`);
}
