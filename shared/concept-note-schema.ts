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

export type MapSelectionMode = 'zones' | 'assets' | 'sample' | 'composite' | 'browse-only';

export interface OpenMapParams {
  layers?: string[];          // OSM layer IDs to enable (e.g., 'osm_parks')
  tileLayers?: string[];      // Tile layer IDs to enable (e.g., 'oef_fri_2024')
  spatialQueries?: string[];  // Spatial query IDs to run (e.g., 'sq_parks_flood')
  selectionMode: MapSelectionMode;
  prompt: string;             // Instruction shown on the map
  sampleLayers?: string[];    // For 'sample' mode: which tile layers to sample on click
  zoneSource?: 'neighborhood_zones' | 'intervention_zones' | 'neighborhoods'; // Step 1 source for composite mode (default: neighborhood_zones)
  // E2 needs-help additions — used in `browse-only` mode but available across modes.
  // Translucent banner rendered over the map (top): used by the E2 needs-help
  // path to narrate what colors mean while the user explores. ~80 char ideal.
  narrationOverlay?: string;
  // Simplified legend: collapses the full 48-layer toolkit into a 3-chip
  // hazard legend (flood/heat/landslide) when only those hazards are active.
  // Used by E2 to reduce visual noise for first-time CBO users.
  showLegendSimple?: boolean;
  // E2 map step — allow committing a neighborhood with NO specific site ("usar
  // o bairro todo"). Gates the site-optional UI so the city/concept-note flow
  // (which requires a real site in composite mode) is unaffected.
  allowDeferSite?: boolean;
  // E2 map step — guided hazard tour. When true, the map opens in a tour that
  // walks the user through flood → heat → landslide ONE at a time (locked
  // legend, per-hazard caption + counter) before unlocking neighborhood/site
  // selection. Opt-in; the city/concept-note flow leaves it off.
  hazardTour?: boolean;
  // E2 linear flow — the map session ends at the ZONE step: "Confirmar bairro"
  // replaces "Próximo (sites)" and confirms with the selected zone(s) only.
  // The site is picked later, in its own focused session (focusZone).
  confirmAtZone?: boolean;
  // E2 Map 1 — shade the bairros on a SINGLE sequential ramp by their
  // within-city risk percentile, instead of the typology choropleth.
  //
  // The typology version encoded two things at once (hue = which hazard,
  // opacity = how much) and discriminated almost nothing: 67 of 94 POA bairros
  // came out the same red, 18 green and 8 purple were hues the legend never
  // named, and its brown never appeared at all. It was removed outright, which
  // then left the selection map blank — and a blank map cannot answer the
  // question the hazard tour just raised ("so which bairros are worst?").
  //
  // One ramp fixes both: one legend, and a scale that actually separates the
  // city now that the CBO flow reads percentiles rather than the compressed
  // absolute means (see CBO-RISK-SCALE). The band colours come from
  // risk-display.RISK_BANDS, so this map, the site card and the coordinator all
  // speak one visual language.
  zoneRiskRamp?: boolean;
  // E2 Map 1 — the bairro E1 already knows (org_profile.bairro_of_operation),
  // pre-selected so the step is a confirmation, not a search. Its outline stays
  // visible through the hazard tour so the org sees its own territory in each
  // risk layer. Unlike `focusZone` this does NOT skip the zone step: the user
  // can still tap a different bairro. A name matching no zone is ignored.
  preselectZone?: string;
  // E2 linear flow — open the composite map already INSIDE this bairro: the
  // zone is pre-selected by name, the zone step is skipped, the view fits the
  // bairro (satellite via allowDeferSite), other bairros hidden. If the name
  // doesn't match any zone, the map falls back to the normal zone step.
  focusZone?: string;
  // E2 map step — a site candidate extracted from the org's uploaded docs, to
  // pre-place for the user to validate ("é aqui?") instead of picking blind.
  // Tiered: a precise place geocodes to a pin; a bairro-only hint pre-selects
  // the neighborhood. `quote` is the literal doc excerpt shown as the basis.
  suggestedSite?: {
    quote?: string;        // literal passage from the doc (shown to the user)
    name?: string;         // place/address to geocode (Nominatim) if no coords
    lat?: number;
    lng?: number;
    neighborhood?: string; // bairro-only hint (pre-select the zone)
  };
  // E3 — the footprint session. The site is already known, so the map has ONE
  // job: get a polygon around it. Opens at the pin in satellite, arms polygon
  // drawing, hides the zone step and every selection affordance that is not
  // drawing. Without this the org would be asked to find its own place again
  // and then hunt for a draw tool, on a phone, in order to answer "how big".
  drawFootprint?: {
    lat: number;
    lng: number;
    name?: string;
  };
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
  // E2: the user committed a neighborhood but no specific site ("usar o bairro
  // todo"). Consumers should keep the neighborhood and treat the site as TBD.
  siteDeferred?: boolean;
  // E2: how the site was arrived at — 'doc' (validated a doc-extracted
  // candidate) vs 'user' (picked/drew it). Omitted outside the CBO map step.
  siteSource?: 'doc' | 'user';
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
