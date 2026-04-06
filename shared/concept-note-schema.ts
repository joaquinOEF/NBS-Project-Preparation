import { z } from 'zod';

// ============================================================================
// CONCEPT NOTE SECTION REGISTRY
// Maps the 23 BPJP "Nota Conceitual" sections to typed state
// ============================================================================

export const CONCEPT_NOTE_SECTIONS = [
  { id: 'project_id', title: '1. Identificação do Projeto', phase: 1 },
  { id: 'proponent', title: '2. Instituição Proponente', phase: 1 },
  { id: 'territorial_context', title: '3. Contexto Territorial', phase: 2 },
  { id: 'problem_diagnosis', title: '4. Diagnóstico do Problema', phase: 2 },
  { id: 'general_objective', title: '5. Objetivo Geral do Projeto', phase: 2 },
  { id: 'specific_objectives', title: '6. Objetivos Específicos', phase: 3 },
  { id: 'indicators', title: '7. Indicadores Físico-Operacionais', phase: 3 },
  { id: 'solution_description', title: '8. Descrição da Solução Proposta', phase: 3 },
  { id: 'climate_benefits', title: '9. Benefícios Climáticos', phase: 4 },
  { id: 'economic_social_benefits', title: '10. Benefícios Econômicos e Sociais', phase: 4 },
  { id: 'inclusive_action', title: '11. Ação Climática Inclusiva', phase: 4 },
  { id: 'institutional_arrangement', title: '12. Arranjo Institucional', phase: 5 },
  { id: 'technical_capacity', title: '13. Capacidade Técnica', phase: 5 },
  { id: 'political_support', title: '14. Apoio e Alinhamento Político', phase: 5 },
  { id: 'plan_alignment', title: '15. Alinhamento com Planos', phase: 5 },
  { id: 'cost_detail', title: '16. Detalhamento dos Custos', phase: 6 },
  { id: 'financial_sustainability', title: '17. Disponibilidade de Recursos', phase: 6 },
  { id: 'financing_need', title: '18. Necessidade de Financiamento', phase: 6 },
  { id: 'risk_analysis', title: '19. Análise e Mitigação de Riscos', phase: 7 },
  { id: 'replicability', title: '20. Replicabilidade e Escalabilidade', phase: 7 },
  { id: 'technical_assistance', title: '21. Demanda por Assistência Técnica', phase: 8 },
  { id: 'contact', title: '22. Contato e Ponto Focal', phase: 8 },
  { id: 'supplementary', title: '23. Informações Complementares', phase: 8 },
] as const;

export type SectionId = typeof CONCEPT_NOTE_SECTIONS[number]['id'];
export const ALL_SECTION_IDS = CONCEPT_NOTE_SECTIONS.map(s => s.id);

export type Confidence = 'high' | 'medium' | 'low' | 'empty';

export interface FieldState {
  value: string | number | null;
  confidence: Confidence;
  source?: string;
  userEdited: boolean;
}

export interface SectionState {
  id: SectionId;
  title: string;
  phase: number;
  fields: Record<string, FieldState>;
  confidence: Confidence;
  sources: string[];
  lastUpdatedBy: 'agent' | 'user' | null;
}

export interface GapEntry {
  sectionId: SectionId;
  field: string;
  reason: string;
  severity: 'critical' | 'important' | 'minor';
}

export interface EditLogEntry {
  timestamp: string;
  sectionId: SectionId;
  field: string;
  oldValue: string | number | null;
  newValue: string | number | null;
  source: 'agent' | 'user';
}

export interface ConceptNoteState {
  id: string;
  projectId: string;
  city: string;
  phase: number;
  sections: Record<SectionId, SectionState>;
  gaps: GapEntry[];
  editLog: EditLogEntry[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    projectName: string;
    proponentType: string;
    sessionId?: string;
  };
}

// Zod schema for the update_section tool input
export const UpdateSectionInput = z.object({
  sectionId: z.string(),
  field: z.string(),
  value: z.string(),
  confidence: z.enum(['high', 'medium', 'low']).default('medium'),
  source: z.string().optional(),
});

export const FlagGapInput = z.object({
  sectionId: z.string(),
  field: z.string(),
  reason: z.string(),
  severity: z.enum(['critical', 'important', 'minor']).default('important'),
});

// Helper to create initial empty state
export function createEmptyConceptNote(projectId: string, city: string): ConceptNoteState {
  const sections: Record<string, SectionState> = {};
  for (const sec of CONCEPT_NOTE_SECTIONS) {
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
    projectId,
    city,
    phase: 0,
    sections: sections as Record<SectionId, SectionState>,
    gaps: [],
    editLog: [],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectName: '',
      proponentType: '',
    },
  };
}

// Chat message types for the frontend
export type ChatMessageType = 'content' | 'thinking' | 'tool_status';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  messageType: ChatMessageType;
  timestamp: string;
}

// Structured question extracted from agent text or ask_user tool
export interface ParsedQuestion {
  id: string;
  question: string;
  options: Array<{ label: string; description: string; recommended?: boolean }>;
  relatedSections?: string[];
  multiSelect?: boolean;
}

// Structured thinking step for the step checklist UI
export interface ThinkingStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}

// ── Map Microapp types ────────────────────────────────────────────────────────

export type MapSelectionMode = 'zones' | 'assets' | 'sample' | 'composite';

export interface OpenMapParams {
  layers?: string[];          // OSM layer IDs to enable (e.g., 'osm_parks')
  tileLayers?: string[];      // Tile layer IDs to enable (e.g., 'oef_fri_2024')
  spatialQueries?: string[];  // Spatial query IDs to run (e.g., 'sq_parks_flood')
  selectionMode: MapSelectionMode;
  prompt: string;             // Instruction shown on the map
  sampleLayers?: string[];    // For 'sample' mode: which tile layers to sample on click
  zoneSource?: 'neighborhood_zones' | 'intervention_zones' | 'neighborhoods'; // Step 1 source for composite mode (default: neighborhood_zones)
}

export interface SelectedAsset {
  type: 'osm' | 'custom' | 'zone';
  source?: string;            // e.g., 'osm_parks', 'intervention_zones'
  name: string;
  geometry?: any;             // GeoJSON geometry
  coordinates: [number, number]; // [lat, lng] centroid
  properties: Record<string, any>;
  rasterValues?: Record<string, number>; // sampled values from active tile layers
}

export interface SampledPoint {
  lat: number;
  lng: number;
  values: Record<string, number>; // layerName → decoded value
}

export interface MapSelectionResult {
  selectionMode: MapSelectionMode;
  selectedAssets: SelectedAsset[];
  sampledPoints: SampledPoint[];
  enabledLayers: string[];
}

// SSE event types pushed to the browser
export type ConceptNoteEvent =
  | { type: 'chat'; content: string; role: 'assistant'; messageType?: ChatMessageType }
  | { type: 'chat_thinking'; content: string }
  | { type: 'thinking_step'; step: ThinkingStep }
  | { type: 'field_update'; sectionId: string; field: string; value: string; confidence: Confidence; source?: string }
  | { type: 'gap'; sectionId: string; field: string; reason: string; severity: string }
  | { type: 'phase_change'; phase: number }
  | { type: 'cascade'; edits: Array<{ sectionId: string; field: string; value: string }> }
  | { type: 'ask_user'; question: string; options: Array<{ label: string; description: string; recommended?: boolean }>; relatedSections?: string[]; showMap?: boolean; multiSelect?: boolean }
  | { type: 'open_map'; params: OpenMapParams }
  | { type: 'done'; summary: string }
  | { type: 'error'; message: string };

// Persistence types
export interface PersistedSession {
  noteId: string;
  state: ConceptNoteState;
  messages: ChatMessage[];
  savedAt: string;
}
