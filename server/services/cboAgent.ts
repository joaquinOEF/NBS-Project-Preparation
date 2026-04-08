import { z } from "zod";
import type { Response } from "express";
import {
  type CboState,
  type CboEvent,
  type CboChatMessage,
  type Confidence,
  type MaturityScore,
  type PriorityFlag,
  ALL_CBO_SECTION_IDS,
  CBO_SECTIONS,
  MATURITY_METRICS,
  PRIORITY_FLAG_DEFINITIONS,
} from "@shared/cbo-schema";

// ============================================================================
// SDK LOADING — shared with conceptNoteAgent (lazy load)
// ============================================================================

let sdkAvailable = false;
let sdkQuery: any;
let sdkTool: any;
let sdkCreateMcpServer: any;

async function loadSdk() {
  if (sdkAvailable) return true;
  try {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    sdkQuery = sdk.query;
    sdkTool = sdk.tool;
    sdkCreateMcpServer = sdk.createSdkMcpServer;
    sdkAvailable = true;
    return true;
  } catch (e: any) {
    console.warn(`[cbo] SDK not available: ${e.message}`);
    return false;
  }
}

loadSdk();

// ============================================================================
// STATE STORES
// ============================================================================

const cboStates = new Map<string, CboState>();
const cboMessages = new Map<string, CboChatMessage[]>();

// Ensure old 5-section states get the new sections added
function migrateSections(state: CboState): CboState {
  for (const sec of CBO_SECTIONS) {
    if (!state.sections[sec.id as keyof typeof state.sections]) {
      (state.sections as any)[sec.id] = { id: sec.id, title: sec.title, phase: sec.phase, fields: {}, confidence: 'empty', sources: [], lastUpdatedBy: null };
    }
  }
  // Move data from old intervention_plan → intervention_type
  if ((state.sections as any).intervention_plan) {
    const old = (state.sections as any).intervention_plan;
    if (old.fields && Object.keys(old.fields).length > 0 && Object.keys((state.sections as any).intervention_type?.fields || {}).length === 0) {
      (state.sections as any).intervention_type.fields = old.fields;
      (state.sections as any).intervention_type.confidence = old.confidence;
      (state.sections as any).intervention_type.sources = old.sources;
    }
    delete (state.sections as any).intervention_plan;
  }
  return state;
}

export function getCboState(id: string): CboState | undefined {
  const state = cboStates.get(id);
  if (state) migrateSections(state);
  return state;
}
export function setCboState(id: string, state: CboState): void {
  if (!state) { cboStates.delete(id); cboMessages.delete(id); return; }
  state.metadata.updatedAt = new Date().toISOString();
  migrateSections(state);
  cboStates.set(id, state);
}
export function getCboMessages(id: string): CboChatMessage[] { return cboMessages.get(id) || []; }
export function addCboMessage(id: string, msg: CboChatMessage): void {
  const msgs = cboMessages.get(id) || [];
  const last = msgs[msgs.length - 1];
  if (last && last.role === msg.role && last.content === msg.content) return; // dedupe
  msgs.push(msg);
  cboMessages.set(id, msgs);
}

// ============================================================================
// MCP TOOLS
// ============================================================================

type EventPusher = (event: CboEvent) => void;
const pushEventRegistry = new Map<string, EventPusher>();

function setActivePushEvent(id: string, pusher: EventPusher) { pushEventRegistry.set(id, pusher); }

function createCboMcpTools(cboId: string) {
  if (!sdkTool || !sdkCreateMcpServer) return null;

  const pushEvent = (event: CboEvent) => {
    const pusher = pushEventRegistry.get(cboId);
    if (pusher) pusher(event);
  };

  const updateSection = sdkTool(
    "update_section",
    "Update a field in the CBO intervention profile. The document panel updates in real-time.",
    {
      sectionId: z.string().describe("Section ID: org_profile, intervention_site, intervention_type, impact_monitoring, operations_sustain, needs_assessment, results_evidence"),
      field: z.string().describe("Field name"),
      value: z.string().describe("Content to set"),
      confidence: z.enum(["high", "medium", "low"]).default("medium"),
      source: z.string().optional(),
    },
    async (args: any) => {
      const state = getCboState(cboId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: not found" }], isError: true };
      const section = state.sections[args.sectionId as keyof typeof state.sections];
      if (!section) return { content: [{ type: "text" as const, text: `Unknown section: ${args.sectionId}` }], isError: true };
      section.fields[args.field] = { value: args.value, confidence: args.confidence as Confidence, source: args.source, userEdited: false };
      section.lastUpdatedBy = 'agent';
      section.confidence = args.confidence as Confidence;
      if (args.source && !section.sources.includes(args.source)) section.sources.push(args.source);
      state.gaps = state.gaps.filter(g => !(g.sectionId === args.sectionId && g.field === args.field));
      setCboState(cboId, state);
      pushEvent({ type: 'field_update', sectionId: args.sectionId, field: args.field, value: args.value, confidence: args.confidence as Confidence, source: args.source });
      return { content: [{ type: "text" as const, text: `Updated ${args.sectionId}.${args.field}` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  const flagGap = sdkTool(
    "flag_gap",
    "Flag a gap in the intervention profile.",
    { sectionId: z.string(), field: z.string(), reason: z.string(), severity: z.enum(["critical", "important", "minor"]).default("important") },
    async (args: any) => {
      const state = getCboState(cboId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: not found" }], isError: true };
      state.gaps.push({ sectionId: args.sectionId as any, field: args.field, reason: args.reason, severity: args.severity as any });
      setCboState(cboId, state);
      pushEvent({ type: 'gap', sectionId: args.sectionId, field: args.field, reason: args.reason, severity: args.severity });
      return { content: [{ type: "text" as const, text: `Gap: ${args.sectionId}.${args.field}` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  const setPhase = sdkTool(
    "set_phase",
    "Advance to next phase (1-6).",
    { phase: z.number().min(0).max(6) },
    async (args: any) => {
      const state = getCboState(cboId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: not found" }], isError: true };
      state.phase = args.phase;
      setCboState(cboId, state);
      pushEvent({ type: 'phase_change', phase: args.phase });
      return { content: [{ type: "text" as const, text: `Phase ${args.phase}` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  const askUser = sdkTool(
    "ask_user",
    "Present questions to the user. The UI renders interactive buttons. Include showMap: true for site selection.",
    {
      questions: z.array(z.object({
        question: z.string(),
        options: z.array(z.object({ label: z.string(), description: z.string().optional(), recommended: z.boolean().optional() })),
        relatedSections: z.array(z.string()).optional(),
        showMap: z.boolean().optional(),
        multiSelect: z.boolean().optional(),
      })),
    },
    async (args: any) => {
      for (const q of args.questions || []) {
        pushEvent({ type: 'ask_user', question: q.question, options: q.options || [], relatedSections: q.relatedSections, showMap: q.showMap, multiSelect: q.multiSelect });
      }
      return { content: [{ type: "text" as const, text: `${(args.questions || []).length} question(s) shown. STOP and wait.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  const openMap = sdkTool(
    "open_map",
    `Open an interactive map microapp. Returns structured data about what the user selected.

## Selection modes
- "composite": TWO-STEP: user picks a zone first, then selects individual sites within it. Best for CBO Phase 2.
- "assets": User clicks individual OSM features (parks, schools, etc.) or draws custom sites. No zone selection.
- "zones": User clicks intervention zone boundaries only. No individual site selection.
- "sample": User clicks anywhere to read raster values at that point. No feature selection.

## Available layers
OSM (vector): osm_parks, osm_schools, osm_hospitals, osm_wetlands
Tiles (raster): oef_fri_2024 (Flood Risk), oef_hwm_2024 (Heatwave), oef_dynamic_world (Land Use), oef_chirps_r90p_2024, oef_copernicus_dem, oef_ghsl_population, oef_merit_elv, +40 more
Spatial queries: sq_parks_flood, sq_schools_flood, sq_hospitals_flood, sq_wetlands_flood, sq_parks_heatwave, sq_schools_heatwave

## Recipes
- CBO Phase 2 (Where We Work): composite + zoneSource:"neighborhoods" + [osm_parks, osm_schools, osm_wetlands] + [oef_fri_2024, oef_hwm_2024]
- CBO Phase 3 (What We're Doing): assets + [osm_parks, osm_wetlands] + [oef_dynamic_world, oef_fri_2024]
- Concept Note Phase 2 (Territorial Scope): zones + [] + [oef_fri_2024, oef_hwm_2024]
- Environmental analysis: sample + [] + [oef_fri_2024, oef_hwm_2024, oef_copernicus_dem]

STOP and wait for the user's map selection after calling this tool.`,
    {
      layers: z.array(z.string()).optional().describe("OSM layer IDs to show: osm_parks, osm_schools, osm_hospitals, osm_wetlands"),
      tileLayers: z.array(z.string()).optional().describe("Tile layer IDs as toggleable overlays (not auto-shown): oef_fri_2024, oef_hwm_2024, etc."),
      spatialQueries: z.array(z.string()).optional().describe("Pre-filter features: sq_parks_flood, sq_schools_heatwave, etc."),
      selectionMode: z.enum(["zones", "assets", "sample", "composite"]).describe("composite = zone first, then sites. assets = sites only. zones = zones only. sample = click-to-read-values."),
      prompt: z.string().describe("Clear instruction for the user, e.g. 'Select the zone where you work, then pick the parks and schools you are targeting'"),
      sampleLayers: z.array(z.string()).optional().describe("For sample mode: which tile layers to sample on click"),
      zoneSource: z.enum(["neighborhood_zones", "intervention_zones", "neighborhoods"]).optional().describe("For composite mode step 1: 'neighborhood_zones' (default) shows bairros with risk scores + vulnerability-weighted priority. 'neighborhoods' shows raw IBGE census data. 'intervention_zones' uses legacy synthetic zones."),
    },
    async (args: any) => {
      pushEvent({
        type: 'open_map',
        params: {
          layers: args.layers,
          tileLayers: args.tileLayers,
          spatialQueries: args.spatialQueries,
          selectionMode: args.selectionMode,
          prompt: args.prompt,
          sampleLayers: args.sampleLayers,
          zoneSource: args.zoneSource,
        },
      });
      return { content: [{ type: "text" as const, text: `Map opened in "${args.selectionMode}" mode. STOP and wait for selection.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  const scoreMaturity = sdkTool(
    "score_maturity",
    "Score a maturity metric (0-3) based on the COUGAR NBS Mapping Criteria. Call this after gathering enough information for each metric.",
    {
      metric: z.string().describe("One of: problem_clarity, climate_nbs_impact, solution_clarity, site_control, org_delivery_capacity, team_technical_experience, financial_thinking, community_anchoring, regulatory_awareness"),
      score: z.number().min(0).max(3),
      justification: z.string().describe("Brief explanation for the score"),
    },
    async (args: any) => {
      const state = getCboState(cboId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: not found" }], isError: true };
      state.maturityScores = state.maturityScores.filter(s => s.metric !== args.metric);
      state.maturityScores.push({ metric: args.metric, score: args.score, justification: args.justification });
      state.totalMaturityScore = state.maturityScores.reduce((sum, s) => sum + s.score, 0);
      setCboState(cboId, state);
      pushEvent({ type: 'maturity_update', scores: state.maturityScores, total: state.totalMaturityScore, flags: state.priorityFlags });
      return { content: [{ type: "text" as const, text: `Maturity: ${args.metric} = ${args.score}/3` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  const setPriorityFlag = sdkTool(
    "set_priority_flag",
    "Set a priority flag (met or not met). These are strong positive signals for investment readiness.",
    {
      flag: z.string().describe("One of the 6 priority flags"),
      met: z.boolean(),
      notes: z.string().optional(),
    },
    async (args: any) => {
      const state = getCboState(cboId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: not found" }], isError: true };
      state.priorityFlags = state.priorityFlags.filter(f => f.flag !== args.flag);
      state.priorityFlags.push({ flag: args.flag, met: args.met, notes: args.notes });
      setCboState(cboId, state);
      pushEvent({ type: 'maturity_update', scores: state.maturityScores, total: state.totalMaturityScore, flags: state.priorityFlags });
      return { content: [{ type: "text" as const, text: `Flag: ${args.flag} = ${args.met ? 'met' : 'not met'}` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  const readKnowledge = sdkTool(
    "read_knowledge",
    `Read a knowledge file for detailed data about interventions, co-benefits, city context, or case studies.

## Key folders
- _interventions/: bioswales-rain-gardens.md, flood-parks.md, green-corridors.md, green-roofs-walls.md, urban-forests.md, wetland-restoration.md
- _co-benefits/: public-health.md, carbon-sequestration.md, flood-risk-reduction.md, heat-island-mitigation.md, economic-social.md, biodiversity.md
- _success-cases/: brazilian-municipal.md (Curitiba, Recife, BH, São Paulo, Salvador examples)
- _evidence/: impact-benchmarks.md, funded-projects-brazil.md (GCF, World Bank, GEF projects)
- _financing-sources/: preparation-facilities.md, international.md, brazilian-domestic.md
- porto-alegre/: climate-risks.md, local-precedents.md, existing-plans.md, stakeholders.md, baseline-data.md
- _cougar/: nbs-mapping-criteria.md, ecosystem-assessment-summary.md, sample-cbo-vilaflores.md

USE THIS TOOL PROACTIVELY when guiding the user. Don't just ask questions — read relevant files and share insights.`,
    { folder: z.string(), file: z.string() },
    async (args: any) => {
      const fs = require('fs');
      const pathMod = require('path');
      try {
        const content = fs.readFileSync(pathMod.join(process.cwd(), 'knowledge', args.folder, args.file), 'utf-8');
        const body = content.replace(/^---[\s\S]*?---\s*/, '');
        return { content: [{ type: "text" as const, text: body.length > 4000 ? body.slice(0, 4000) + '\n...(truncated)' : body }] };
      } catch {
        return { content: [{ type: "text" as const, text: `File not found: knowledge/${args.folder}/${args.file}` }], isError: true };
      }
    },
    { annotations: { readOnlyHint: true } }
  );

  const openInterventionSelector = sdkTool(
    "open_intervention_selector",
    `Open the NBS Intervention Type Selector micro-app. Shows 6 NBS types as visual cards with REAL PHOTOS from Brazilian case studies, cost data, outcomes, and timelines. The user browses and selects one or more intervention types.

Use this in Phase 3a after collecting site information. Pass siteHazards from Phase 2 data to highlight the most relevant types. Only the top 2 types get the "Recommended" badge.

If the user went through guidance mode first (asked about problems, site conditions), pass recommendedTypes with your recommended order — the selector will sort and badge accordingly.

The user can select MULTIPLE types (e.g., wetland restoration + bioswales combo).

STOP and wait for the user's selection after calling this tool.`,
    {
      prompt: z.string().describe("Instruction shown to the user"),
      preSelectedType: z.string().optional().describe("Pre-select a type if the user already mentioned one"),
      showCaseStudies: z.boolean().optional().default(true),
      multiSelect: z.boolean().optional().default(true).describe("Allow selecting multiple NBS types"),
      siteHazards: z.object({
        flood: z.number().min(0).max(1),
        heat: z.number().min(0).max(1),
        landslide: z.number().min(0).max(1),
      }).optional().describe("Hazard scores from Phase 2 to rank types by relevance"),
      recommendedTypes: z.array(z.string()).optional().describe("Ordered list of recommended type IDs from guidance mode, e.g. ['wetland-restoration', 'bioswales-rain-gardens', 'flood-parks']. First 2 get 'Recommended' badge."),
      maxRecommendations: z.number().optional().default(2).describe("How many types to badge as Recommended (default 2)"),
    },
    async (args: any) => {
      pushEvent({
        type: 'open_intervention_selector',
        params: {
          prompt: args.prompt,
          preSelectedType: args.preSelectedType,
          showCaseStudies: args.showCaseStudies ?? true,
          multiSelect: args.multiSelect ?? true,
          siteHazards: args.siteHazards,
          recommendedTypes: args.recommendedTypes,
          maxRecommendations: args.maxRecommendations ?? 2,
        },
      });
      return { content: [{ type: "text" as const, text: `Intervention selector opened (multi-select enabled). STOP and wait for selection.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  return sdkCreateMcpServer({
    name: "cbo",
    version: "1.0.0",
    tools: [updateSection, flagGap, setPhase, askUser, openMap, scoreMaturity, setPriorityFlag, readKnowledge, openInterventionSelector],
  });
}

const mcpServers = new Map<string, any>();
function getMcpServer(cboId: string) {
  if (!mcpServers.has(cboId)) {
    const server = createCboMcpTools(cboId);
    if (server) mcpServers.set(cboId, server);
    return server;
  }
  return mcpServers.get(cboId);
}

// ============================================================================
// STREAMING
// ============================================================================

// ── Skip mechanism: [SKIP TO phase:X] ────────────────────────────────────────
// Pre-fills previous phases with CEA Bom Jesus sample data and jumps to target phase.
// Supports: 1, 2, 3a, 3b, 3c, 4, 5

const SKIP_PATTERN = /^\[SKIP TO phase:(\w+)\]/i;

const SAMPLE_CBO_DATA: Record<string, Record<string, { value: string; confidence: 'high' | 'medium'; source?: string }>> = {
  org_profile: {
    org_name: { value: 'CEA Bom Jesus', confidence: 'high', source: 'sample' },
    org_type: { value: 'ONG / Organização Não-Governamental', confidence: 'high', source: 'sample' },
    mission: { value: 'Gestão de resíduos sólidos, energia renovável e economia circular na comunidade Bom Jesus, Porto Alegre', confidence: 'high', source: 'sample' },
    team_size: { value: '12 membros (8 remunerados, 4 voluntários)', confidence: 'medium', source: 'sample' },
    years_active: { value: '6 anos (desde 2020)', confidence: 'high', source: 'sample' },
    prior_projects: { value: 'Cooperativa de reciclagem (2020-presente), Horta comunitária Bom Jesus (2022), Capacitação em compostagem (2023)', confidence: 'medium', source: 'sample' },
    contact_name: { value: 'Maria Santos', confidence: 'high', source: 'sample' },
    contact_role: { value: 'Coordenadora', confidence: 'high', source: 'sample' },
    contact_email: { value: 'maria@ceabomjesus.org.br', confidence: 'high', source: 'sample' },
  },
  intervention_site: {
    neighborhood: { value: 'Arquipélago (Ilhas)', confidence: 'high', source: 'map selection' },
    area: { value: '2.5 hectares', confidence: 'medium', source: 'map selection' },
    current_conditions: { value: 'Área degradada próxima ao arroio, com vegetação rasteira e acúmulo de resíduos. Solo argiloso, parcialmente inundável durante cheias.', confidence: 'medium', source: 'sample' },
    population: { value: 'Aproximadamente 3.200 moradores no entorno direto', confidence: 'medium', source: 'sample' },
    land_tenure: { value: 'Terreno público municipal com cessão de uso pendente', confidence: 'medium', source: 'sample' },
    community_engagement: { value: 'Modelo cooperativo com assembleia mensal e núcleos por rua', confidence: 'high', source: 'sample' },
  },
  intervention_type: {
    nbs_type: { value: 'wetland-restoration', confidence: 'high', source: 'intervention selector' },
    problem: { value: 'Inundações recorrentes no bairro Arquipélago, agravadas pelas enchentes de 2024. Água contaminada do arroio afeta a saúde da comunidade.', confidence: 'high', source: 'sample' },
    description: { value: 'Restauração de área úmida (várzea) ao longo do arroio, com plantio de espécies nativas para filtragem natural da água e retenção de cheias. Inclui construção de caminhos elevados e espaço de educação ambiental.', confidence: 'medium', source: 'sample' },
    scale: { value: '2.5 ha de área úmida restaurada, 800 mudas nativas, 3 bacias de retenção', confidence: 'medium', source: 'sample' },
  },
  impact_monitoring: {
    impact_areas: { value: 'Redução de inundação, melhoria da qualidade da água, biodiversidade, saúde pública', confidence: 'medium', source: 'sample' },
    expected_outcomes: { value: 'Redução de 40-60% do volume de enchente local, filtragem natural reduzindo coliformes em 70%, habitat para fauna ribeirinha', confidence: 'medium', source: 'knowledge benchmarks' },
    baseline: { value: 'Nível de inundação medido em 2024 (1.2m acima do normal). Análise de qualidade da água pendente.', confidence: 'medium', source: 'sample' },
    monitoring_plan: { value: 'Medição mensal do nível da água, análise trimestral de qualidade, contagem anual de espécies', confidence: 'medium', source: 'sample' },
  },
  operations_sustain: {
    operations_model: { value: 'Manutenção por equipe comunitária com apoio técnico da prefeitura', confidence: 'medium', source: 'sample' },
    maintenance: { value: 'Limpeza semanal, replantio trimestral, monitoramento mensal das bacias', confidence: 'medium', source: 'sample' },
    sustainability_model: { value: 'Combinação: taxa municipal de drenagem (40%), ecoturismo educacional (30%), pagamento por serviços ambientais (30%)', confidence: 'medium', source: 'sample' },
    timeline_start: { value: '2025-06', confidence: 'medium', source: 'sample' },
    timeline_milestones: { value: 'Limpeza do terreno (Jun 2025), Plantio fase 1 (Set 2025), Bacias de retenção (Dez 2025), Inauguração (Mar 2026)', confidence: 'medium', source: 'sample' },
  },
  needs_assessment: {
    technical_needs: { value: 'Projeto hidráulico detalhado, seleção de espécies nativas, engenharia das bacias de retenção', confidence: 'medium', source: 'sample' },
    financial_gap: { value: 'Custo total estimado: R$ 480.000. Já obtido: R$ 120.000 (edital FEPAM). Faltam: R$ 360.000', confidence: 'medium', source: 'sample' },
    regulatory_status: { value: 'Licença ambiental em análise na SMAMUS. Prefeito visitou o local em fevereiro.', confidence: 'medium', source: 'sample' },
  },
};

function applySkipData(state: CboState, targetPhase: string): { phase: number; agentMessage: string } {
  // Map phase labels to ordered phases
  const phaseOrder = ['1', '2', '3a', '3b', '3c', '4', '5'];
  const phaseToNumber: Record<string, number> = { '1': 1, '2': 2, '3a': 3, '3b': 3, '3c': 3, '4': 4, '5': 5 };
  const phaseToSection: Record<string, string> = {
    '1': 'org_profile', '2': 'intervention_site', '3a': 'intervention_type',
    '3b': 'impact_monitoring', '3c': 'operations_sustain', '4': 'needs_assessment', '5': 'results_evidence',
  };

  const targetIdx = phaseOrder.indexOf(targetPhase.toLowerCase());
  if (targetIdx === -1) return { phase: 1, agentMessage: `Unknown phase "${targetPhase}". Starting from Phase 1.` };

  // Fill all sections before the target phase
  const filledSections: string[] = [];
  for (let i = 0; i < targetIdx; i++) {
    const sectionId = phaseToSection[phaseOrder[i]];
    const sampleData = SAMPLE_CBO_DATA[sectionId];
    if (sampleData && state.sections[sectionId as keyof typeof state.sections]) {
      const section = state.sections[sectionId as keyof typeof state.sections];
      for (const [field, data] of Object.entries(sampleData)) {
        section.fields[field] = { value: data.value, confidence: data.confidence, source: data.source, userEdited: false };
      }
      section.confidence = 'medium';
      section.lastUpdatedBy = 'agent';
      filledSections.push(sectionId);
    }
  }

  // Set org name from sample data
  state.orgName = 'CEA Bom Jesus';
  state.phase = phaseToNumber[targetPhase.toLowerCase()] || 1;

  const phaseNum = phaseToNumber[targetPhase.toLowerCase()];
  const subPhase = targetPhase.toLowerCase().includes('a') ? 'a' : targetPhase.toLowerCase().includes('b') ? 'b' : targetPhase.toLowerCase().includes('c') ? 'c' : '';

  return {
    phase: phaseNum,
    agentMessage: `[SKIP] Pre-filled ${filledSections.length} sections with CEA Bom Jesus sample data. Now at Phase ${phaseNum}${subPhase}. Continue the interview from this phase. The user is testing — proceed as if previous phases were completed naturally.`,
  };
}

export async function streamCboChat(cboId: string, userMessage: string, res: Response, state: CboState) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const pushEvent = (event: CboEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'chat') {
      const isNarration = /^(Let me |Good[,. —]|Now |Starting |I'll |I can |I've |Reading |Loading |Setting |Creating |Phase )/i.test(event.content.trim())
        || (event.content.length < 300 && !event.content.includes('##') && !event.content.includes('**'));
      addCboMessage(cboId, { role: 'assistant', content: event.content, messageType: isNarration ? 'thinking' : 'content', timestamp: new Date().toISOString() });
    } else if (event.type === 'chat_thinking') {
      addCboMessage(cboId, { role: 'assistant', content: event.content, messageType: 'thinking', timestamp: new Date().toISOString() });
    }
  };

  // Handle [SKIP TO phase:X] magic prefix
  const skipMatch = userMessage.match(SKIP_PATTERN);
  if (skipMatch) {
    const targetPhase = skipMatch[1];
    const { phase, agentMessage } = applySkipData(state, targetPhase);
    setCboState(cboId, state);
    // Push field updates for all pre-filled sections so the UI updates
    for (const [sectionId, section] of Object.entries(state.sections)) {
      for (const [field, data] of Object.entries(section.fields)) {
        pushEvent({ type: 'field_update', sectionId, field, value: String(data.value), confidence: data.confidence, source: data.source });
      }
    }
    pushEvent({ type: 'phase_change', phase });
    // Replace user message with the skip instruction for the agent
    userMessage = agentMessage;
  }

  setActivePushEvent(cboId, pushEvent);
  const isSdkReady = await loadSdk();

  if (isSdkReady) {
    await streamWithSdk(cboId, userMessage, state, pushEvent);
  } else {
    pushEvent({ type: 'error', message: 'Claude Agent SDK not available.' });
  }

  res.end();
}

async function streamWithSdk(cboId: string, userMessage: string, state: CboState, pushEvent: EventPusher) {
  const mcpServer = getMcpServer(cboId);
  const sysCtx = await buildSystemContext(state);
  const stateSummary = buildStateSummary(state);
  const decisionLog = buildDecisionLog(cboId);

  const prompt = `${sysCtx}\n\n## CURRENT STATE\n${stateSummary}\n\n## USER DECISIONS\n${decisionLog}\n\nUser message: ${userMessage}`;

  console.log(`[cbo] Turn for ${cboId} (phase ${state.phase}, ${Object.values(state.sections).filter(s => Object.keys(s.fields).length > 0).length}/7 sections)`);

  try {
    for await (const message of sdkQuery({
      prompt,
      options: {
        cwd: process.cwd(),
        allowedTools: [
          "Read", "Glob", "Grep",
          "mcp__cbo__update_section",
          "mcp__cbo__flag_gap",
          "mcp__cbo__set_phase",
          "mcp__cbo__ask_user",
          "mcp__cbo__open_map",
          "mcp__cbo__open_intervention_selector",
          "mcp__cbo__score_maturity",
          "mcp__cbo__set_priority_flag",
          "mcp__cbo__read_knowledge",
        ],
        mcpServers: mcpServer ? { cbo: mcpServer } : {},
        permissionMode: "bypassPermissions",
      },
    })) {
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "text" && block.text) {
            pushEvent({ type: 'chat', content: block.text, role: 'assistant' });
          }
        }
      }
      if (message.type === "result") {
        pushEvent({ type: 'done', summary: 'Response complete' });
      }
    }
  } catch (error: any) {
    pushEvent({ type: 'error', message: error.message || 'Agent error' });
  }
}

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

function buildStateSummary(state: CboState): string {
  const lines = [`Phase: ${state.phase}/6, Org: ${state.orgName || '(not set)'}`];
  for (const [id, section] of Object.entries(state.sections)) {
    const fields = Object.entries(section.fields);
    if (fields.length === 0) continue;
    lines.push(`${id}: ${fields.map(([k, v]) => `${k}=${String(v.value || '').slice(0, 100)}`).join(' | ')}`);
  }
  if (state.maturityScores.length > 0) {
    lines.push(`\nMaturity (${state.totalMaturityScore}/27): ${state.maturityScores.map(s => `${s.metric}=${s.score}`).join(', ')}`);
  }
  if (state.priorityFlags.length > 0) {
    lines.push(`Flags: ${state.priorityFlags.map(f => `${f.met ? '✅' : '⬜'} ${f.flag}`).join(', ')}`);
  }
  return lines.join('\n');
}

function buildDecisionLog(cboId: string): string {
  const msgs = getCboMessages(cboId).filter(m => m.role === 'user' && m.messageType === 'content');
  if (msgs.length === 0) return 'No prior conversation.';
  return msgs.slice(-10).map(m => `- User: ${m.content.slice(0, 200)}`).join('\n');
}

// Skill + knowledge cache (cleared on server restart)
let skillCache: string | null = null;
let knowledgeCache: string | null = null;

// Invalidate caches so updated skill/knowledge files take effect
export function invalidateCboCache() { skillCache = null; knowledgeCache = null; }

async function buildSystemContext(state: CboState): Promise<string> {
  if (!skillCache) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      skillCache = await fs.readFile(path.join(process.cwd(), '.claude', 'commands', 'cbo-intervention.md'), 'utf-8');
    } catch { skillCache = ''; }
  }

  if (!knowledgeCache) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const chunks: string[] = [];
    // City context
    const cityDir = path.join(process.cwd(), 'knowledge', state.city);
    try {
      const files = await fs.readdir(cityDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        try {
          const content = await fs.readFile(path.join(cityDir, file), 'utf-8');
          chunks.push(`### ${state.city}/${file}\n${content.replace(/^---[\s\S]*?---\s*/, '').slice(0, 1500)}`);
        } catch {}
      }
    } catch {}
    // COUGAR context
    const cougarDir = path.join(process.cwd(), 'knowledge', '_cougar');
    try {
      const files = await fs.readdir(cougarDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        try {
          const content = await fs.readFile(path.join(cougarDir, file), 'utf-8');
          chunks.push(`### _cougar/${file}\n${content.replace(/^---[\s\S]*?---\s*/, '').slice(0, 2000)}`);
        } catch {}
      }
    } catch {}
    // Available knowledge listing
    for (const folder of ['_interventions', '_co-benefits', '_financing-sources', '_evidence', '_success-cases']) {
      try {
        const files = await fs.readdir(path.join(process.cwd(), 'knowledge', folder));
        chunks.push(`### Available in ${folder}/\n${files.filter((f: string) => f.endsWith('.md')).map((f: string) => `- ${f}`).join('\n')}`);
      } catch {}
    }
    knowledgeCache = chunks.join('\n\n');
    console.log(`[cbo] Knowledge loaded: ${knowledgeCache.length} chars`);
  }

  return `You are a friendly NBS project preparation consultant helping a community organization in ${state.city} prepare their nature-based solution project. You are NOT just collecting data — you are helping them THINK through their project like a consultant would.

Phase: ${state.phase}. Organization: ${state.orgName || '(not set)'}.

## YOUR TOOLS
1. **update_section** — fill document fields (org_profile, intervention_site, intervention_type, impact_monitoring, operations_sustain, needs_assessment, results_evidence)
2. **ask_user** — present multiple-choice questions for non-spatial decisions
3. **open_map** — open interactive map microapp for spatial/site questions
   - Phase 2: open_map({ selectionMode: "composite", zoneSource: "neighborhoods", layers: ["osm_parks", "osm_schools", "osm_wetlands"], tileLayers: ["oef_fri_2024", "oef_hwm_2024"], prompt: "Select your neighborhood, then pick the parks, schools, or sites you're targeting" })
   - Evidence check: open_map({ selectionMode: "sample", tileLayers: ["oef_fri_2024", "oef_hwm_2024", "oef_copernicus_dem"], prompt: "Click locations to check climate risk values" })
4. **open_intervention_selector** — Phase 3a: open NBS type selector micro-app with visual cards, images, and case studies. Pass siteHazards from Phase 2 data.
5. **set_phase** — advance phases (1-5, where Phase 3 has sub-phases 3a/3b/3c)
6. **flag_gap** — mark missing info (but prefer guiding the user over flagging gaps)
7. **score_maturity** — score COUGAR maturity metrics (0-3) as you gather info
8. **set_priority_flag** — mark priority flags (met/not met)
9. **read_knowledge** — read knowledge files for interventions, co-benefits, case studies, benchmarks. USE THIS PROACTIVELY.

## PHASE FLOW

### Phase 1: Who We Are (org_profile)
Org info, team, experience. Straightforward Q&A via ask_user.

### Phase 2: Where We Work (intervention_site)
Map selection via open_map (composite mode), neighborhood, site conditions.

### Phase 3a: What We're Building (intervention_type)
NBS type via open_intervention_selector micro-app, design details.

### Phase 3b: Expected Impact (impact_monitoring) — B£ST-STYLE ASSESSMENT
This is a GUIDED IMPACT ASSESSMENT, not a simple Q&A. Follow the B£ST model:

**Step 1 — Screening (pre-fill from Phase 2 data):**
Ask 5-6 yes/no toggle questions via ask_user to identify relevant benefit categories:
- Does your site experience flooding or water accumulation?
- Is heat stress a problem in the neighborhood?
- Is there a water body (stream, river, wetland) at or near the site?
- Do people live within 500m of the site?
- Is there existing vegetation on the site?
- Is erosion or landslide a risk?
Pre-fill answers from Phase 2 hazard data when available. Let user correct.

**Step 2 — Site-specific inputs:**
Ask for details that improve the estimate (show defaults from Phase 2/3a, let user adjust):
- What was the site like BEFORE? (paved/degraded/bare soil/existing vegetation)
- How many people live nearby? (from Phase 2 population data)
- What maintenance can you commit to? (weekly/monthly/seasonal)
- Over what timeframe? (1 year/3 years/5 years/10 years)

**Step 3 — With/without comparison:**
Read knowledge files: read_knowledge(_co-benefits/flood-risk-reduction.md), read_knowledge(_co-benefits/carbon-sequestration.md), read_knowledge(_evidence/impact-benchmarks.md), etc.

Present results as a WITH vs WITHOUT comparison:
- "WITHOUT your project: flooding continues, 0 tCO2 sequestered, 3,200 people at risk"
- "WITH your project: flood reduction 40-60% (high confidence), carbon 5-20 tCO2/yr (medium confidence), 2-3 jobs created"
- Reference a similar funded project as benchmark
- Show confidence levels honestly (high/medium/low)
- ALWAYS show ranges, NEVER point estimates

Then call update_section for impact_monitoring fields and score_maturity for climate_nbs_impact.

### Phase 3c: Operations & Sustainability (operations_sustain)
Ask about:
1. Who will maintain the project? (community volunteers / paid staff / municipality / mixed)
2. How often? (weekly, monthly, seasonal tasks)
3. What does maintenance involve? (read_knowledge for the selected NBS type's OPEX section)
4. How will you fund maintenance long-term?
   - Include "I don't know" → explain options simply:
   - Municipal budget allocation (if government supports the project)
   - Community fee or cooperative model
   - Productive use (food gardens, eco-tourism, educational visits)
   - Grant renewal (watch for new editais)
   - Carbon credits are NOT practical for small projects — be honest about this
5. Timeline: started when, milestones, expected completion

### Phase 4: What We Need (needs_assessment) — REAL FUNDING SOURCES
Read knowledge: read_knowledge(_financing-sources/cbo-grants.md)

Present ONLY funding sources that match the CBO's actual profile:
- **Tier 1** (apply directly): Teia da Sociobiodiversidade (R$100K), Fundo Casa Reconstruir RS (R$40K), Periferias Verdes Resilientes (federal), GEF SGP (US$50K)
- **Tier 2** (through municipality/partnership): Petrobras NBS Urbano (consortium), World Bank P178072 sub-components
- **Monitoring**: Recommend capta.org.br for tracking new editais

DO NOT present BNDES (min R$10M), GCF regular proposals (US$50M+), or World Bank loans as direct options for CBOs. Be honest: "These larger funds are for municipalities — but you can advocate for your project to be included."

Also ask about:
- Technical needs (engineering, species selection, monitoring equipment)
- Regulatory status (has anyone from the government visited? do you need permits?)
- Training needs

### Phase 5: Results & Evidence (results_evidence)
Documents, photos, links, data. Proactively ask for evidence and set priority flags.

## MATURITY METRICS (score each 0-3 as you go)
${MATURITY_METRICS.join(', ')}

## PRIORITY FLAGS (set as you discover them)
${PRIORITY_FLAG_DEFINITIONS.join(', ')}

## GUIDANCE MODE — CRITICAL
You are a CONSULTANT, not an interviewer. Every substantive question MUST include an "I don't know / Help me decide" option.

When the user selects "I don't know":
1. DON'T just flag a gap — HELP them think through it
2. Read relevant knowledge files (interventions, co-benefits, case studies, benchmarks)
3. Ask 2-3 simple follow-up questions to understand their situation
4. Present 2-3 concrete recommendations with real Brazilian examples
5. Explain WHY each option fits their specific site and situation
6. Use benchmarks: "Projects like yours in Curitiba typically see 65% flood reduction"
7. Reference funded projects: "The World Bank's Porto Alegre resilience project (US$85M) includes similar NBS"

Example guidance flow for "I don't know what type of NBS":
→ "No problem! Let me help. First: what's the biggest problem you see at your site?"
→ [Flooding / Heat / Erosion / Pollution]
→ "And what does the land look like now?"
→ [Empty lot / Park / Near river / Hillside]
→ read_knowledge(_interventions/flood-parks.md) + read_knowledge(_success-cases/brazilian-municipal.md)
→ "Based on your flood-prone site near the river, I'd recommend a Flood Park — like what Curitiba did with Barigui..."

## PROACTIVE EVIDENCE COLLECTION
Ask for evidence at 3 key moments:
- After Phase 2: "Do you have photos of the site? You can drag them into the chat."
- After Phase 3a: "Do you have any documents about this project — proposals, reports, plans?"
- Phase 5: "Can you share links to your website, social media, or any news coverage?"

## LANGUAGE
- Each user message ends with [LANGUAGE: ...]. Follow it strictly.
- ALL ask_user option labels and descriptions MUST be in the same language as your response.
- update_section content: always in Portuguese for Brazilian organizations.
- If Portuguese: use simple, accessible language. Avoid jargon. Write as if explaining to a community leader, not a scientist.

## QUESTION STYLE
- Use simple words: "Que tipo de solução?" not "Qual o tipo de SbN?"
- Add example hints in descriptions: "(ex: plantio de árvores, restauração de áreas úmidas)"
- Break complex questions into small steps
- Avoid technical terms: "Alguém do governo sabe do projeto?" not "Status regulatório"
- Offer encouragement: "Ótimo! Isso mostra que vocês já têm experiência."
- ALWAYS include "I don't know / Help me" as an option for substantive questions

## BEHAVIOR
- Be warm, encouraging, and consultative
- Start IMMEDIATELY with set_phase(1) and ask_user questions
- Score maturity metrics as you gather information (don't wait until the end)
- For ANY spatial question: use open_map (not ask_user with showMap)
- Phase 2: ALWAYS use open_map with "composite" mode
- Phase 3a: ALWAYS use open_intervention_selector (not ask_user for NBS type)
- Phase 3b/3c: read_knowledge PROACTIVELY to provide benchmarks and examples
- After Phase 5: generate the full maturity scorecard
- In your FIRST message: mention that the user can drop existing documents into the chat

## FILE DROPS
When the user drops a document, you'll receive its content. React by:
1. Extract ALL relevant info (org name, team, budget, site, interventions, progress)
2. Call update_section for every field you can fill — maximize auto-fill
3. Call score_maturity for metrics you can now assess
4. Tell the user: "I found [X] in your document. I've filled [sections] and scored [metrics]."
5. Skip questions already answered by the document
6. Having a written document is itself evidence of maturity — score accordingly

## SKILL FLOW
${skillCache?.slice(0, 3000) || ''}

## KNOWLEDGE
${knowledgeCache}`;
}

// ============================================================================
// USER EDIT HANDLER
// ============================================================================

export async function handleCboEdit(cboId: string, sectionId: string, field: string, newValue: string, res: Response) {
  const state = getCboState(cboId);
  if (!state) { res.status(404).json({ error: "Not found" }); return; }
  const section = state.sections[sectionId as keyof typeof state.sections];
  if (!section) { res.status(400).json({ error: `Unknown section: ${sectionId}` }); return; }
  section.fields[field] = { ...section.fields[field], value: newValue, userEdited: true };
  section.lastUpdatedBy = 'user';
  setCboState(cboId, state);
  await streamCboChat(cboId, `User edited ${sectionId}.${field} to: "${newValue}". Update related fields if needed.`, res, state);
}
