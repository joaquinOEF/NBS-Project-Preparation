import { z } from 'zod';
import type { OpenMapParams } from './concept-note-schema';

// ============================================================================
// CBO INTERVENTION PROFILE — 5 sections aligned to COUGAR NBS Mapping Criteria
// ============================================================================

export const CBO_SECTIONS = [
  { id: 'org_profile', title: '1. Who We Are', phase: 1, maturityMetrics: ['org_delivery_capacity', 'team_technical_experience'] },
  { id: 'intervention_site', title: '2. Where We Work', phase: 2, maturityMetrics: ['site_control', 'community_anchoring'] },
  { id: 'intervention_type', title: '3a. What We\'re Building', phase: 3, subPhase: 'a', maturityMetrics: ['problem_clarity', 'solution_clarity'] },
  { id: 'impact_monitoring', title: '3b. Expected Impact', phase: 3, subPhase: 'b', maturityMetrics: ['climate_nbs_impact'] },
  { id: 'operations_sustain', title: '3c. Operations & Sustainability', phase: 3, subPhase: 'c', maturityMetrics: ['financial_thinking'] },
  { id: 'needs_assessment', title: '4. What We Need', phase: 4, maturityMetrics: ['regulatory_awareness'] },
  { id: 'results_evidence', title: '5. Results & Evidence', phase: 5, maturityMetrics: [] },
] as const;

export type CboSectionId = typeof CBO_SECTIONS[number]['id'];
export const ALL_CBO_SECTION_IDS = CBO_SECTIONS.map(s => s.id);

// Maturity scores (0-3 per COUGAR NBS Mapping Criteria)
export interface MaturityScore {
  metric: string;
  score: 0 | 1 | 2 | 3;
  justification: string;
}

export interface PriorityFlag {
  flag: string;
  met: boolean;
  notes?: string;
}

export type Confidence = 'high' | 'medium' | 'low' | 'empty';

export interface CboFieldState {
  value: string | number | null;
  confidence: Confidence;
  source?: string;
  userEdited: boolean;
}

export interface CboSectionState {
  id: CboSectionId;
  title: string;
  phase: number;
  fields: Record<string, CboFieldState>;
  confidence: Confidence;
  sources: string[];
  lastUpdatedBy: 'agent' | 'user' | null;
}

export interface CboGapEntry {
  sectionId: CboSectionId;
  field: string;
  reason: string;
  severity: 'critical' | 'important' | 'minor';
}

export interface CboState {
  id: string;
  orgName: string;
  city: string;
  phase: number;
  sections: Record<CboSectionId, CboSectionState>;
  gaps: CboGapEntry[];
  maturityScores: MaturityScore[];
  priorityFlags: PriorityFlag[];
  totalMaturityScore: number; // out of 27
  editLog: Array<{ timestamp: string; sectionId: string; field: string; oldValue: any; newValue: any; source: 'agent' | 'user' }>;
  uploadedFiles: Array<{ name: string; path: string; parsedAt: string; summary: string }>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    sessionId?: string;
  };
}

// NBS intervention types available in the selector micro-app
// Each type has EN fields at the top level and a `pt` object with Portuguese translations
export const NBS_INTERVENTION_TYPES = [
  { id: 'bioswales-rain-gardens', label: 'Bioswales & Rain Gardens', emoji: '🌿', primaryBenefit: 'adaptation', knowledgeFile: 'bioswales-rain-gardens.md',
    description: 'Channels and planted areas that filter rainwater naturally',
    example: 'Rain garden in a park, bioswale along a street',
    pt: { label: 'Biovaletas e Jardins de Chuva', description: 'Canais e áreas plantadas que filtram a água da chuva naturalmente', example: 'Jardim de chuva em um parque, biovaleta ao longo de uma rua' },
    caseStudy: {
      city: 'Portland, USA', project: 'Bioretention Rain Garden', image: '/assets/interventions/bioswales.jpg',
      outcome: 'Bioswales reduce stormwater runoff by 65% and remove 85-95% of sediment. 78% cheaper than grey infrastructure.',
      outcomePt: 'Biovaletas reduzem o escoamento de água da chuva em 65% e removem 85-95% dos sedimentos. 78% mais baratas que infraestrutura cinza.',
      cost: 'R$ 350-1.400/m²', timeline: '2-6 months design + 2-8 weeks construction', timelinePt: '2-6 meses de projeto + 2-8 semanas de construção',
      photoCredit: 'EmilyBlueGreen, CC BY-SA 3.0',
    } },
  { id: 'flood-parks', label: 'Flood Parks', emoji: '🌊', primaryBenefit: 'adaptation', knowledgeFile: 'flood-parks.md',
    description: 'Parks that absorb floodwater and serve the community',
    example: 'Praça that becomes a retention pond during rain',
    pt: { label: 'Parques de Retenção de Cheias', description: 'Parques que absorvem enchentes e servem à comunidade', example: 'Praça que vira lagoa de retenção durante a chuva' },
    caseStudy: {
      city: 'Curitiba, PR', project: 'Parque Barigui', image: '/assets/interventions/flood-parks.jpg',
      outcome: '5% cheaper than concrete canals. 52 m² green space per capita. Significant flood reduction in protected areas.',
      outcomePt: '5% mais barato que canais de concreto. 52 m² de área verde por habitante. Redução significativa de enchentes nas áreas protegidas.',
      cost: 'Investimento público + incentivos fiscais', timeline: 'Multi-year (park network since 1996)', timelinePt: 'Multi-ano (rede de parques desde 1996)',
      photoCredit: 'Agrinaldo Caires Fonseca, CC BY-SA 3.0',
    } },
  { id: 'green-corridors', label: 'Green Corridors', emoji: '🌳', primaryBenefit: 'both', knowledgeFile: 'green-corridors.md',
    description: 'Linear green spaces connecting neighborhoods and ecosystems',
    example: 'Tree-lined avenue, riverside walking path with native plants',
    pt: { label: 'Corredores Verdes', description: 'Espaços verdes lineares conectando bairros e ecossistemas', example: 'Avenida arborizada, caminhada à beira-rio com plantas nativas' },
    caseStudy: {
      city: 'Recife, PE', project: 'Parque Capibaribe', image: '/assets/interventions/green-corridors.jpg',
      outcome: '60 ha of riverbank recovered. Controlled flooding sectors reduce damage. Catalyzed private investment nearby.',
      outcomePt: '60 ha de margem de rio recuperados. Setores de inundação controlada reduzem danos. Catalisou investimento privado no entorno.',
      cost: 'Municipal + cooperação internacional', timeline: 'Phased — pilot filtering garden first, then scaling', timelinePt: 'Faseado — jardim filtrante piloto primeiro, depois escala',
      photoCredit: 'Lais Castro, CC BY-SA 3.0',
    } },
  { id: 'green-roofs-walls', label: 'Green Roofs & Walls', emoji: '🏗️', primaryBenefit: 'both', knowledgeFile: 'green-roofs-walls.md',
    description: 'Vegetation on rooftops and building facades for cooling and insulation',
    example: 'Garden on a school roof, vertical garden on a community center',
    pt: { label: 'Telhados e Paredes Verdes', description: 'Vegetação em telhados e fachadas para resfriamento e isolamento', example: 'Horta no telhado de uma escola, jardim vertical em centro comunitário' },
    caseStudy: {
      city: 'São Paulo, SP', project: 'Fundação Cásper Líbero', image: '/assets/interventions/green-roofs.jpg',
      outcome: '600 m² rooftop garden on Av. Paulista. Green roofs reduce flooding, cool buildings by 1-3°C, and cut energy use.',
      outcomePt: 'Jardim de 600 m² no telhado na Av. Paulista. Telhados verdes reduzem enchentes, resfriam edifícios em 1-3°C e diminuem consumo de energia.',
      cost: 'R$ 600-1.800/m²', timeline: '1-3 months installation', timelinePt: '1-3 meses de instalação',
      photoCredit: 'Joalpe, CC BY-SA 4.0',
    } },
  { id: 'urban-forests', label: 'Urban Forests', emoji: '🌲', primaryBenefit: 'both', knowledgeFile: 'urban-forests.md',
    description: 'Tree planting to cool neighborhoods, clean air, and absorb water',
    example: 'Reforestation of a hillside, street tree program, community orchard',
    pt: { label: 'Florestas Urbanas', description: 'Plantio de árvores para resfriar bairros, limpar o ar e absorver água', example: 'Reflorestamento de encosta, programa de arborização, pomar comunitário' },
    caseStudy: {
      city: 'Porto Alegre, RS', project: 'Rua Gonçalo de Carvalho', image: '/assets/interventions/urban-forests.jpg',
      outcome: '100+ Tipuana trees planted in 1930s. Declared Environmental Heritage of Latin America. Full canopy tunnel over 3 blocks.',
      outcomePt: '100+ Tipuanas plantadas nos anos 1930. Declarada Patrimônio Ambiental da América Latina. Túnel de copa em 3 quarteirões.',
      cost: 'Baixo — árvores maduras, manutenção municipal', timeline: 'Decades of growth — new plantings take 10-20 years for canopy', timelinePt: 'Décadas de crescimento — novos plantios levam 10-20 anos para copa',
      photoCredit: 'Amigos da Rua Gonçalo de Carvalho, CC BY-SA 3.0',
    } },
  { id: 'wetland-restoration', label: 'Wetland Restoration', emoji: '🌾', primaryBenefit: 'adaptation', knowledgeFile: 'wetland-restoration.md',
    description: 'Restoring natural water areas for filtration, flood control, and habitat',
    example: 'Recovering a degraded stream or várzea area',
    pt: { label: 'Restauração de Áreas Úmidas', description: 'Restauração de áreas naturais de água para filtragem, controle de enchentes e habitat', example: 'Recuperação de um arroio degradado ou área de várzea' },
    caseStudy: {
      city: 'Belo Horizonte, MG', project: 'DRENURBS — Parque Primeiro de Maio', image: '/assets/interventions/wetland-restoration.jpg',
      outcome: 'Green-blue infra proved more resilient than canalization during 2020 floods. IDB-financed. Recreation + biodiversity.',
      outcomePt: 'Infraestrutura verde-azul se mostrou mais resiliente que canalização durante enchentes de 2020. Financiado pelo BID. Recreação + biodiversidade.',
      cost: 'Empréstimo BID + orçamento municipal', timeline: 'Multi-phase since 2003 (Córrego do Onça sub-basin)', timelinePt: 'Multi-fase desde 2003 (sub-bacia do Córrego do Onça)',
      photoCredit: 'Marcio Adauto Dutra, CC BY 3.0',
    } },
] as const;

// Helper to get localized NBS type fields
export function getLocalizedNbsType(type: typeof NBS_INTERVENTION_TYPES[number], lang: string) {
  const isPt = lang === 'pt';
  return {
    ...type,
    label: isPt ? type.pt.label : type.label,
    description: isPt ? type.pt.description : type.description,
    example: isPt ? type.pt.example : type.example,
    caseStudy: {
      ...type.caseStudy,
      outcome: isPt ? type.caseStudy.outcomePt : type.caseStudy.outcome,
      timeline: isPt ? type.caseStudy.timelinePt : type.caseStudy.timeline,
    },
  };
}

export type NbsInterventionTypeId = typeof NBS_INTERVENTION_TYPES[number]['id'];

// Params for the NBS Type Selector micro-app
export interface OpenInterventionSelectorParams {
  prompt: string;
  preSelectedType?: NbsInterventionTypeId;
  showCaseStudies?: boolean;
  multiSelect?: boolean; // allow selecting multiple NBS types (e.g., wetland + bioswales combo)
  siteHazards?: { flood: number; heat: number; landslide: number }; // from Phase 2 to highlight relevant types
  recommendedTypes?: NbsInterventionTypeId[]; // agent can pass ordered recommendations from guidance mode
  maxRecommendations?: number; // max types to badge as "Recommended" (default: 2)
}

// Result returned when user confirms selection in the micro-app
export interface InterventionSelectorResult {
  interventionTypes: NbsInterventionTypeId[]; // array to support multi-select
  labels: string[];
  primaryBenefits: string[];
  knowledgeFiles: string[];
  // Legacy single-select fields for backwards compat
  interventionType: NbsInterventionTypeId;
  label: string;
  primaryBenefit: string;
  knowledgeFile: string;
}

// SSE events — same structure as concept note but with CBO types
export type CboEvent =
  | { type: 'chat'; content: string; role: 'assistant'; messageType?: 'content' | 'thinking' | 'tool_status' }
  | { type: 'chat_thinking'; content: string }
  | { type: 'thinking_step'; step: { id: string; label: string; status: 'pending' | 'active' | 'complete' | 'error' } }
  | { type: 'field_update'; sectionId: string; field: string; value: string; confidence: Confidence; source?: string }
  | { type: 'gap'; sectionId: string; field: string; reason: string; severity: string }
  | { type: 'phase_change'; phase: number }
  | { type: 'maturity_update'; scores: MaturityScore[]; total: number; flags: PriorityFlag[] }
  | { type: 'ask_user'; question: string; options: Array<{ label: string; description: string; recommended?: boolean; imageUrl?: string; location?: string }>; relatedSections?: string[]; showMap?: boolean; multiSelect?: boolean }
  | { type: 'open_map'; params: OpenMapParams }
  | { type: 'open_intervention_selector'; params: OpenInterventionSelectorParams }
  | { type: 'done'; summary: string }
  | { type: 'error'; message: string };

// Chat message type (same as concept note — shared)
export interface CboChatMessage {
  role: 'user' | 'assistant';
  content: string;
  messageType: 'content' | 'thinking' | 'tool_status';
  timestamp: string;
}

// Helper to create empty CBO state
export function createEmptyCboState(city: string): CboState {
  const sections: Record<string, CboSectionState> = {};
  for (const sec of CBO_SECTIONS) {
    sections[sec.id] = {
      id: sec.id,
      title: sec.title,
      phase: sec.phase,
      fields: {},
      confidence: 'empty',
      sources: [],
      lastUpdatedBy: null,
    };
  }
  return {
    id: crypto.randomUUID(),
    orgName: '',
    city,
    phase: 0,
    sections: sections as Record<CboSectionId, CboSectionState>,
    gaps: [],
    maturityScores: [],
    priorityFlags: [],
    totalMaturityScore: 0,
    editLog: [],
    uploadedFiles: [],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

// COUGAR maturity metrics
export const MATURITY_METRICS = [
  'problem_clarity',
  'climate_nbs_impact',
  'solution_clarity',
  'site_control',
  'org_delivery_capacity',
  'team_technical_experience',
  'financial_thinking',
  'community_anchoring',
  'regulatory_awareness',
] as const;

export const PRIORITY_FLAG_DEFINITIONS = [
  'Land tenure secure or likely secure',
  'Baseline environmental data exists',
  'Local government expressed interest',
  'Potential buyers/payors identified',
  'Co-financing possibility identified',
  'Scalable beyond one site',
] as const;
