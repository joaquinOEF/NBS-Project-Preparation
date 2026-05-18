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
import { getPhasePolicyForCbo, isPhaseAllowed, buildAccessPolicyPrompt, type PhasePolicy } from "./phaseGating";
import { loadEncontroSkill } from "./encontroSkills";
import {
  loadCboState as dbLoadCboState,
  loadCboMessages as dbLoadCboMessages,
  upsertCboState,
  appendCboMessages,
} from "./cboPersistence";
import { db } from "../db";
import { cohortMembers } from "@shared/cohort-schema";
import { eq } from "drizzle-orm";

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
  if (!state) {
    cboStates.delete(id);
    cboMessages.delete(id);
    flushedMessageCount.delete(id);
    return;
  }
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
// PERSISTENCE — DB-backed (was file-based, see cboPersistence.ts for rationale)
// ============================================================================

// Per-CBO count of messages already persisted to DB. Used by the flusher to
// avoid re-inserting the same messages on every flush.
const flushedMessageCount = new Map<string, number>();

// Hydrate the in-memory cache from DB on cold lookup. Used by the route
// layer when a session reconnects to a CBO state created in a previous
// process lifetime.
export async function loadCboFromDb(id: string): Promise<{ state: CboState; messages: CboChatMessage[] } | null> {
  const state = await dbLoadCboState(id);
  if (!state) return null;
  const messages = await dbLoadCboMessages(id);
  flushedMessageCount.set(id, messages.length);
  return { state, messages };
}

// Debounced flush — UPSERT cbo_states + INSERT any new cbo_messages since
// last flush. Single transaction would be nicer but Drizzle's transaction
// API is awkward across two tables; the worst case is a half-flush (state
// upserted but messages not appended) which is recoverable on next chat turn.
const saveTimers = new Map<string, NodeJS.Timeout>();
const SAVE_DEBOUNCE_MS = 2000;

async function persistCbo(id: string) {
  const state = cboStates.get(id);
  if (!state) return;
  await upsertCboState(state);
  const allMessages = cboMessages.get(id) ?? [];
  const flushed = flushedMessageCount.get(id) ?? 0;
  if (allMessages.length > flushed) {
    const newMessages = allMessages.slice(flushed);
    await appendCboMessages(id, flushed, newMessages);
    flushedMessageCount.set(id, allMessages.length);
  }
}

export function debouncedPersist(id: string) {
  const existing = saveTimers.get(id);
  if (existing) clearTimeout(existing);
  saveTimers.set(id, setTimeout(() => {
    persistCbo(id).catch(e => console.error(`[cbo] persist(${id}) failed`, e));
    saveTimers.delete(id);
  }, SAVE_DEBOUNCE_MS));
}

// Reset the flush pointer when a CBO is deleted so a fresh re-creation
// with the same id wouldn't skip its first messages.
export function clearFlushedMessageCount(id: string) {
  flushedMessageCount.delete(id);
}

// Read the per-CBO flush pointer — diagnostic only.
export function getFlushedMessageCount(id: string): number {
  return flushedMessageCount.get(id) ?? 0;
}

// Read pending-flush state — diagnostic only.
export function hasPendingFlush(id: string): boolean {
  return saveTimers.has(id);
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
    "Advance to next phase (1-6). Refuses to advance past phases the coordinator has unlocked.",
    { phase: z.number().min(0).max(6) },
    async (args: any) => {
      const state = getCboState(cboId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: not found" }], isError: true };
      // Workshop-phased unlock gate. Standalone CBOs are ungated.
      // Phase 6 = export/wrap; not part of unlocks (always allowed once Phase 5 is unlocked).
      const policy = await getPhasePolicyForCbo(cboId);
      if (policy.gated && args.phase >= 1 && args.phase <= 5 && !isPhaseAllowed(policy, args.phase)) {
        return {
          content: [{
            type: "text" as const,
            text: `Phase ${args.phase} is locked. The coordinator has only opened phases ${policy.unlockedPhases.join(', ')}. Stay at Phase ${state.phase} and tell the user warmly that the next workshop will open this section.`,
          }],
          isError: true,
        };
      }
      state.phase = args.phase;
      setCboState(cboId, state);
      pushEvent({ type: 'phase_change', phase: args.phase });
      return { content: [{ type: "text" as const, text: `Phase ${args.phase}` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  // E1 two-path triage: stores 'has-idea' or 'needs-help' on the cohort member.
  // Branches E2-E3 flows. No-op if the CBO isn't part of a cohort.
  const setPath = sdkTool(
    "set_path",
    "Record the user's path choice from the E1 triage. 'has-idea' = they have a specific NBS project in mind; 'needs-help' = they want to discover one.",
    { path: z.enum(["has-idea", "needs-help"]) },
    async (args: any) => {
      try {
        const result = await db
          .update(cohortMembers)
          .set({ path: args.path })
          .where(eq(cohortMembers.cboStateId, cboId))
          .returning();
        if (result.length === 0) {
          return { content: [{ type: "text" as const, text: `No cohort member linked to this CBO; path '${args.path}' not persisted (standalone session).` }] };
        }
        return { content: [{ type: "text" as const, text: `Path set to '${args.path}' for ${result[0].orgName}.` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error setting path: ${err.message}` }], isError: true };
      }
    },
    { annotations: { readOnlyHint: false } }
  );

  // E2 educational anchor: render the NbsShowcaseCard strip inline. Two modes:
  //   browse (has-idea) - read-only horizontal scroll
  //   favorites (needs-help) - per-card save toggle → inspiration_picks[]
  // Optional hazardFilter narrows the strip (e.g. flood-only when bairro
  // hazard is known). Cards available from shared/nbs-showcase-cards.ts.
  const showExamples = sdkTool(
    "show_examples",
    "Render the NbsShowcaseCard strip inline in chat. Use at the start of E2 to build NBS vocabulary. mode='favorites' for needs-help path. Optional hazardFilter to narrow the cards.",
    {
      mode: z.enum(["browse", "favorites"]).default("browse"),
      hazardFilter: z.enum(["flood", "heat", "biodiversity"]).optional(),
      intro: z.string().optional().describe("Optional 1-line lead text rendered above the strip"),
      cardIds: z.array(z.string()).optional().describe("Explicit card IDs to show (overrides hazardFilter)"),
    },
    async (args: any) => {
      const showcase = await import("@shared/nbs-showcase-cards");
      let cards: { id: string }[];
      if (Array.isArray(args.cardIds) && args.cardIds.length > 0) {
        cards = args.cardIds
          .map((id: string) => showcase.getShowcaseCard(id))
          .filter(Boolean) as { id: string }[];
      } else {
        cards = showcase.filterShowcaseCards(args.hazardFilter ? { hazard: args.hazardFilter } : undefined);
      }
      const ids = cards.map(c => c.id);
      pushEvent({ type: 'show_examples', cardIds: ids, mode: args.mode ?? 'browse', intro: args.intro });
      return { content: [{ type: "text" as const, text: `Showed ${ids.length} example(s) in ${args.mode ?? 'browse'} mode. STOP and wait for the user's reaction.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  // E2 Beat 3a — risk priority ranking. Renders 3 tap-in-order chips for
  // flood / heat / landslide. User taps in priority order, then confirms.
  // Result comes back as a chat message: "Priority ranking: flood (1), heat (2)..."
  // which the agent parses to fill primary_hazard, secondary_hazard fields.
  const askPriorityRank = sdkTool(
    "ask_priority_rank",
    "Render the RiskPriorityChips composer for the user to rank flood/heat/landslide in order of concern. minRanked is the minimum number of chips they must rank (default 2). STOP and wait for the user's confirmation.",
    {
      prompt: z.string().describe("The question shown above the chips, e.g. 'Desses três riscos, qual mais te preocupa?'"),
      minRanked: z.number().min(1).max(3).optional().default(2),
    },
    async (args: any) => {
      pushEvent({ type: 'ask_priority_rank', prompt: args.prompt, minRanked: args.minRanked ?? 2 });
      return { content: [{ type: "text" as const, text: `RiskPriorityChips opened. STOP and wait for the user's ranking.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  // E2 Beat 3c — community anchoring composer. Renders a structured form with
  // 3 short text fields (lead/volunteers/beneficiaries) + chip multi-select
  // for engagement methods. Result comes back as a parseable chat message.
  const askCommunityAnchoring = sdkTool(
    "ask_community_anchoring",
    "Render the CommunityAnchoringComposer inline. Used at E2 Beat 3c to capture who from the community is anchored to the work. STOP and wait for the user's confirmation.",
    { prompt: z.string().describe("Lead text shown above the form") },
    async (args: any) => {
      pushEvent({ type: 'ask_community_anchoring', prompt: args.prompt });
      return { content: [{ type: "text" as const, text: `CommunityAnchoringComposer opened. STOP and wait.` }] };
    },
    { annotations: { readOnlyHint: true } }
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
      selectionMode: z.enum(["zones", "assets", "sample", "composite", "browse-only"]).describe("composite = zone first, then sites. assets = sites only. zones = zones only. sample = click-to-read-values. browse-only = exploration; no commitment (E2 needs-help)."),
      prompt: z.string().describe("Clear instruction for the user, e.g. 'Select the zone where you work, then pick the parks and schools you are targeting'"),
      sampleLayers: z.array(z.string()).optional().describe("For sample mode: which tile layers to sample on click"),
      zoneSource: z.enum(["neighborhood_zones", "intervention_zones", "neighborhoods"]).optional().describe("For composite mode step 1: 'neighborhood_zones' (default) shows bairros with risk scores + vulnerability-weighted priority. 'neighborhoods' shows raw IBGE census data. 'intervention_zones' uses legacy synthetic zones."),
      narrationOverlay: z.string().optional().describe("Translucent banner over the map for browse-only mode — agent narrates what colors mean. ~80 chars ideal."),
      showLegendSimple: z.boolean().optional().describe("Collapse the full toolkit into a simple 3-chip hazard legend. Useful for first-time CBO users."),
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
          narrationOverlay: args.narrationOverlay,
          showLegendSimple: args.showLegendSimple,
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
    tools: [updateSection, flagGap, setPhase, setPath, showExamples, askPriorityRank, askCommunityAnchoring, askUser, openMap, scoreMaturity, setPriorityFlag, readKnowledge, openInterventionSelector],
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

export async function streamCboChat(cboId: string, userMessage: string, res: Response, state: CboState, lang: string = 'en') {
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
    await streamWithSdk(cboId, userMessage, state, pushEvent, lang);
  } else {
    pushEvent({ type: 'error', message: 'Claude Agent SDK not available.' });
  }

  res.end();
}

async function streamWithSdk(cboId: string, userMessage: string, state: CboState, pushEvent: EventPusher, lang: string = 'en') {
  const mcpServer = getMcpServer(cboId);
  const systemPrompt = await buildSystemContext(state, lang);
  const stateSummary = buildStateSummary(state);
  const decisionLog = buildDecisionLog(cboId);
  const policy = await getPhasePolicyForCbo(cboId);
  const accessPolicy = buildAccessPolicyPrompt(policy);

  // Split static vs dynamic for the SDK:
  //   systemPrompt  →  identity, tool list, phase instructions (skill markdown),
  //                    rules, COUGAR criteria, knowledge listing. ~5K tokens.
  //                    Stable across turns within a phase, so it's a cache target.
  //   prompt        →  current section snapshot, last-8 decision log, access
  //                    policy, and the user's actual message. Changes every turn.
  //
  // The static block lives in options.systemPrompt so the SDK's internal prompt
  // caching machinery can hit it. See knowledge/_skills/README.md for compute
  // budget context.
  const prompt = `## CURRENT STATE\n${stateSummary}\n\n## RECENT CONVERSATION\n${decisionLog}${accessPolicy}\n\nUser message: ${userMessage}`;

  // Compute budget — read from skill frontmatter (cached). Chip-heavy encontros
  // declare Haiku + 0 thinking for ~3× faster turns; synthesis-heavy ones
  // declare Sonnet + 4-8k thinking. See knowledge/_skills/README.md.
  const skill = state.phase >= 1 ? await loadEncontroSkill(state.phase) : null;
  let model = skill?.config.model;
  let thinkingBudget = skill?.config.thinkingBudget ?? 0;

  // Escalation hatch: file uploads contain parsed document content and need
  // real reasoning to map into sections. Override the skill default to Sonnet
  // + thinking regardless of which encontro we're in. Detected by the upload
  // prompt prefix used by the file-drop handler (see cbo-profile.tsx).
  const isFileUpload = /^(I'm uploading:|Estou enviando:|Uploaded ")/.test(userMessage);
  if (isFileUpload) {
    model = 'claude-sonnet-4-6';
    thinkingBudget = 4000;
  }

  const sectionsFilled = Object.values(state.sections).filter(s => Object.keys(s.fields).length > 0).length;
  const sysTokens = Math.round(systemPrompt.length / 4);
  const userTokens = Math.round(prompt.length / 4);
  console.log(`[cbo] Turn for ${cboId} phase=${state.phase} sections=${sectionsFilled}/7 model=${model ?? 'sdk-default'} thinking=${thinkingBudget} sys~${sysTokens}t user~${userTokens}t${isFileUpload ? ' (file-upload escalation)' : ''}`);

  try {
    for await (const message of sdkQuery({
      prompt,
      options: {
        cwd: process.cwd(),
        systemPrompt,
        ...(model ? { model } : {}),
        ...(thinkingBudget > 0 ? { maxThinkingTokens: thinkingBudget } : {}),
        allowedTools: [
          "Read", "Glob", "Grep",
          "mcp__cbo__update_section",
          "mcp__cbo__flag_gap",
          "mcp__cbo__set_phase",
          "mcp__cbo__set_path",
          "mcp__cbo__show_examples",
          "mcp__cbo__ask_priority_rank",
          "mcp__cbo__ask_community_anchoring",
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
  // The SDK is called per-turn with no session continuity, so the agent has
  // no native memory of its own previous responses. Without that context,
  // the agent reads a user message like "Test Huerta" with no idea it was
  // a reply to "what's your org name?" — and starts re-introducing itself
  // every turn. Interleave user + assistant messages so the agent sees the
  // recent conversation as a coherent thread.
  const msgs = getCboMessages(cboId).filter(m =>
    m.messageType === 'content' &&
    !!m.content?.trim()
  );
  if (msgs.length === 0) return 'No prior conversation. This is the first turn — introduce yourself and start the flow.';
  // Last 8 messages (≈ 4 turns each direction). Truncate each to keep prompt small.
  const recent = msgs.slice(-8);
  return recent.map(m => {
    const who = m.role === 'user' ? 'User' : 'You (agent)';
    return `- ${who}: ${m.content.slice(0, 300)}`;
  }).join('\n');
}

// Knowledge cache (cleared on server restart)
let cougarCriteriaCache: string | null = null;
let knowledgeListingCache: string | null = null;

// Invalidate caches so updated knowledge files take effect
export function invalidateCboCache() { cougarCriteriaCache = null; knowledgeListingCache = null; }

async function buildSystemContext(state: CboState, lang: string = 'en'): Promise<string> {
  const isPt = lang === 'pt';

  // ── Load knowledge caches (once per restart) ──
  if (!cougarCriteriaCache) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const content = await fs.readFile(path.join(process.cwd(), 'knowledge', '_cougar', 'nbs-mapping-criteria.md'), 'utf-8');
      cougarCriteriaCache = content.replace(/^---[\s\S]*?---\s*/, '').slice(0, 2500);
    } catch { cougarCriteriaCache = ''; }
  }
  if (!knowledgeListingCache) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const listings: string[] = [];
    for (const folder of ['_interventions', '_co-benefits', '_financing-sources', '_evidence', '_success-cases', 'porto-alegre', '_cougar']) {
      try {
        const files = await fs.readdir(path.join(process.cwd(), 'knowledge', folder));
        listings.push(`${folder}/: ${files.filter((f: string) => f.endsWith('.md')).join(', ')}`);
      } catch {}
    }
    knowledgeListingCache = listings.join('\n');
    console.log(`[cbo] Knowledge listing loaded: ${knowledgeListingCache.length} chars`);
  }

  // ── Phase-specific instructions (only load current phase) ──
  // Prefer encontro skill markdown from knowledge/_skills/encontro-{N}.md when
  // present (E1-E6 curriculum); fall back to the hardcoded block for phases
  // that haven't been migrated yet. Phase 0 = pre-onboarding, no encontro.
  // Compute budget (model + thinking) is read from skill frontmatter in
  // streamWithSdk via the same loader (cached, so no double fs read).
  const encontroSkill = state.phase >= 1 ? await loadEncontroSkill(state.phase) : null;
  const phaseInstructions = encontroSkill?.content ?? buildPhaseInstructions(state.phase, isPt);

  // ── City summary (condensed, always loaded) ──
  const citySummary = isPt
    ? `Porto Alegre, RS, Brasil. Pop 1,4M. Enchentes catastróficas em maio 2024 (piores da história do RS). Riscos: inundação (Guaíba), ilhas de calor (4° Distrito, Centro), deslizamento (morros). Planos: PCVR, World Bank P178072 (US$85M regeneração verde). Precedentes: Orla do Guaíba (5,7ha, espécies nativas), Regenera Dilúvio. COUGAR mapeou 50+ atores no ecossistema.`
    : `Porto Alegre, RS, Brazil. Pop 1.4M. Catastrophic floods May 2024 (worst in RS history). Risks: Guaíba river flooding, heat islands (4° Distrito, Centro), landslide (morros/hillsides). Plans: PCVR, World Bank P178072 (US$85M green resilient regeneration). Precedents: Orla do Guaíba (5.7ha native species park), Regenera Dilúvio. COUGAR mapped 50+ ecosystem actors.`;

  // ── Assemble prompt ──
  const prompt = `${isPt
    ? `Você é um consultor de preparação de projetos de SbN ajudando uma organização comunitária em ${state.city}. Você NÃO está apenas coletando dados — está ajudando-os a PENSAR como um consultor.
IDIOMA: TUDO em português do Brasil. Todas as mensagens, opções de ask_user e valores de update_section. Sem exceções.`
    : `You are an NBS project preparation consultant helping a community organization in ${state.city}. You are NOT just collecting data — you are helping them THINK through their project like a consultant.
LANGUAGE: Respond in English. update_section content in Portuguese for Brazilian orgs.`}

Phase: ${state.phase}. Org: ${state.orgName || '(not set)'}.

## TOOLS
1. **update_section** — ${isPt ? 'preencher campos' : 'fill fields'} (org_profile, intervention_site, intervention_type, impact_monitoring, operations_sustain, needs_assessment, results_evidence)
2. **ask_user** — ${isPt ? 'perguntas múltipla escolha (TUDO em português)' : 'multiple-choice questions'}
3. **open_map** — ${isPt ? 'mapa interativo' : 'interactive map'} (composite/sample/zones/assets modes)
4. **open_intervention_selector** — ${isPt ? 'seletor visual de tipos de SbN (Fase 3a)' : 'NBS type selector micro-app (Phase 3a)'}
5. **set_phase** — ${isPt ? 'avançar fase (1-5, Fase 3 tem 3a/3b/3c). Fase 6 = completo.' : 'advance phase (1-5, Phase 3 has 3a/3b/3c). Phase 6 = complete.'}
6. **score_maturity** / **set_priority_flag** — ${isPt ? 'pontuar métricas COUGAR (0-3) e flags' : 'score COUGAR metrics (0-3) and flags'}
7. **read_knowledge** — ${isPt ? 'ler arquivos de conhecimento. USE PROATIVAMENTE.' : 'read knowledge files. USE PROACTIVELY.'}
8. **flag_gap** — ${isPt ? 'marcar lacunas (prefira orientar)' : 'mark gaps (prefer guiding)'}

## PHASE ROADMAP
${isPt
  ? `1. Quem Somos (org_profile) · 2. Onde Atuamos (intervention_site, usar open_map) · 3a. O Que Construímos (intervention_type, usar open_intervention_selector) · 3b. Impacto Esperado (impact_monitoring) · 3c. Operação e Sustentabilidade (operations_sustain) · 4. O Que Precisamos (needs_assessment) · 5. Resultados e Evidências (results_evidence) · 6. Placar de Maturidade (set_phase 6 para finalizar)`
  : `1. Who We Are (org_profile) · 2. Where We Work (intervention_site, use open_map) · 3a. What We're Building (intervention_type, use open_intervention_selector) · 3b. Expected Impact (impact_monitoring) · 3c. Operations & Sustainability (operations_sustain) · 4. What We Need (needs_assessment) · 5. Results & Evidence (results_evidence) · 6. Maturity Scorecard (set_phase 6 to complete)`}

## CURRENT PHASE INSTRUCTIONS
${phaseInstructions}

## RULES
${isPt
  ? `- Ser caloroso, encorajador e consultivo. Linguagem simples, sem jargão.
- **SE phase = 0 E RECENT CONVERSATION está vazio**: introduza-se brevemente, mencione upload de documentos, chame set_phase(1), e faça a primeira pergunta. NÃO repita a introdução em turnos subsequentes.
- **SE phase ≥ 1 OU já há mensagens em RECENT CONVERSATION**: você está NO MEIO da conversa. NÃO se reintroduza. Continue de onde parou. Antes de qualquer pergunta nova, **persista a resposta anterior do usuário** via update_section() — sem isso, o estado fica vazio e tudo se perde.
- **Após CADA resposta livre do usuário** (texto digitado): chame update_section('<sectionId>', { <campo>: '<valor>' }) ANTES de fazer a próxima pergunta. Isso é OBRIGATÓRIO.
- Pontuar métricas conforme coleta (não esperar). Fase 2: open_map composite. Fase 3a: open_intervention_selector.
- **PADRÃO: SEMPRE usar ask_user com chips** para qualquer pergunta com 2-7 buckets naturais (tipo de org, tamanho de equipe, proporção paga/voluntária, escala de projeto, experiência SbN, etc). Texto livre SOMENTE para inputs genuinamente únicos: nome da org, missão em uma frase, momento de orgulho. Proporções e "splits" SEMPRE viram chips ("Todas voluntárias", "Maioria voluntárias", "Metade e metade", etc) — NUNCA pedir números exatos via texto livre.
- **NUNCA juntar duas perguntas em um chip** ("CBO; 16-30 pessoas" é errado). Cada pergunta é uma chamada ask_user separada.
- TODA pergunta substantiva DEVE ter opção "Não sei / Me ajude". Quando selecionada: read_knowledge, dar exemplos brasileiros, recomendar.
- NÃO repetir perguntas já respondidas. Checar ESTADO ATUAL antes de perguntar. Referenciar respostas anteriores.
- Upload de documentos: extrair tudo, preencher com update_section, pontuar maturidade, pular perguntas respondidas.
- Pedir evidências em 3 momentos: após Fase 2 (fotos), após Fase 3a (documentos), Fase 5 (links).
- Após Fase 5: placar completo + set_phase(6). Pedir revisão do documento antes de exportar.`
  : `- Be warm, encouraging, consultative. Simple language, no jargon.
- **IF phase = 0 AND RECENT CONVERSATION is empty**: introduce yourself briefly, mention document upload, call set_phase(1), ask the first question. Do NOT repeat the intro on subsequent turns.
- **IF phase ≥ 1 OR RECENT CONVERSATION has messages**: you are MID-conversation. Do NOT re-introduce. Continue from where you left off. Before any new question, **persist the user's previous answer** via update_section() — without that, state stays empty and progress is lost.
- **After EVERY free-text user answer**: call update_section('<sectionId>', { <field>: '<value>' }) BEFORE the next question. This is MANDATORY.
- Score metrics as you go (don't wait). Phase 2: open_map composite. Phase 3a: open_intervention_selector.
- **DEFAULT: ALWAYS use ask_user with chips** for any question with 2-7 natural buckets (org type, team size, paid/volunteer split, project scale, NBS experience, etc). Free-text ONLY for genuinely unique inputs: org name, one-sentence mission, proud-moment story. Ratios and splits ALWAYS become chips ("All volunteers", "Mostly volunteers", "Half and half", etc) — NEVER ask for exact numbers via free-text.
- **NEVER bundle two questions into one chip** ("CBO; 16-30 people" is wrong). Each question is its own separate ask_user call.
- EVERY substantive question MUST have "I don't know / Help me" option. When selected: read_knowledge, give Brazilian examples, recommend.
- DO NOT repeat questions already answered. Check CURRENT STATE before asking. Reference earlier answers.
- File drops: extract all, fill with update_section, score maturity, skip answered questions.
- Ask for evidence at 3 moments: after Phase 2 (photos), after Phase 3a (documents), Phase 5 (links).
- After Phase 5: full scorecard + set_phase(6). Ask user to review document before export.`}

## MATURITY METRICS: ${MATURITY_METRICS.join(', ')}
## PRIORITY FLAGS: ${PRIORITY_FLAG_DEFINITIONS.join(', ')}

## CITY CONTEXT
${citySummary}

## COUGAR SCORING CRITERIA
${cougarCriteriaCache}

## KNOWLEDGE FILES (use read_knowledge to access)
${knowledgeListingCache}`;

  return prompt;
}

// ── Phase-specific instructions ──────────────────────────────────────────────
function buildPhaseInstructions(phase: number, isPt: boolean): string {
  // Map internal phase numbers to instruction blocks
  // Phase 3 covers 3a/3b/3c — we include all sub-phase instructions when phase=3
  switch (phase) {
    case 0:
    case 1:
      return isPt
        ? `**Fase 1: Quem Somos** (org_profile)
Perguntas via ask_user: nome e tipo da organização, missão, equipe (quantos, remunerados/voluntários), anos de atuação, projetos anteriores, contato.
Se desenharem ponto/área customizada no mapa: perguntar se o local tem nome.
Avaliar: Capacidade de Execução (0-3), Experiência Técnica (0-3).`
        : `**Phase 1: Who We Are** (org_profile)
Ask via ask_user: org name and type, mission, team (how many, paid/volunteer), years active, prior projects, contact.
If they draw a custom point/area on map: ask if the site has a name.
Score: Org Delivery Capacity (0-3), Team Technical Experience (0-3).`;

    case 2:
      return isPt
        ? `**Fase 2: Onde Atuamos** (intervention_site)
Abrir open_map({ selectionMode: "composite", zoneSource: "neighborhoods", layers: ["osm_parks","osm_schools","osm_wetlands"], tileLayers: ["oef_fri_2024","oef_hwm_2024"], prompt: "Selecione seu bairro, depois escolha os locais" }).
Após seleção: perguntar condições atuais, população, posse do terreno, engajamento comunitário.
Se desenharem ponto/área customizada: perguntar "Esse local tem um nome?"
Pedir fotos do local. Avaliar: Controle do Local (0-3), Ancoragem Comunitária (0-3).`
        : `**Phase 2: Where We Work** (intervention_site)
Open open_map({ selectionMode: "composite", zoneSource: "neighborhoods", layers: ["osm_parks","osm_schools","osm_wetlands"], tileLayers: ["oef_fri_2024","oef_hwm_2024"], prompt: "Select your neighborhood, then pick sites" }).
After selection: ask current conditions, population, land tenure, community engagement.
If they draw custom point/area: ask "Does this site have a name?"
Ask for site photos. Score: Site Control (0-3), Community Anchoring (0-3).`;

    case 3:
      return isPt
        ? `**Fase 3a: O Que Construímos** (intervention_type)
Abrir open_intervention_selector com siteHazards da Fase 2. Se "Não sei": orientar via read_knowledge + exemplos.
Após seleção, PERGUNTAS PRESCRITIVAS (cada uma é UMA chamada ask_user com chips):
  • intervention_scale → chips: ['Pequeno (<200 m²)', 'Médio (200-1000 m²)', 'Grande (1000+ m²)', 'Não sei ainda']
  • construction_model → chips: ['Mutirão comunitário', 'Empreiteira contratada', 'Parceria universidade/ONG', 'Misto', 'Ainda não decidido']
  • Para florestas urbanas: species_preference → chips ['Espécies nativas POA', 'Frutíferas', 'Sombra (porte grande)', 'Misto', 'Equipe técnica decide']
  • Para jardins de chuva/biovaletas: substrate_type → chips ['Solo permeável existente', 'Substrato modificado', 'Cascalho + plantas', 'Ainda não sabemos']
  • justification_why_here → texto livre (1-2 frases): "Por que esse tipo nesse lugar?"
Avaliar: Clareza do Problema (0-3), Clareza da Solução (0-3).

**Fase 3b: Impacto Esperado** (impact_monitoring) — APROFUNDAR, NÃO REPETIR
NÃO perguntar sobre riscos/população (já sabe da Fase 2).
PERGUNTAS PRESCRITIVAS (cada uma uma ask_user com chips, exceto onde indicado):
  • baseline_condition → texto livre: "Como está o lugar HOJE, antes da intervenção?"
  • maintenance_frequency → chips: ['Semanal', 'Mensal', 'Trimestral', 'Anual', 'Sob demanda']
  • project_timeframe → chips: ['6 meses', '1 ano', '2 anos', '3+ anos', 'Faseado em etapas']
  • monitoring_capacity → chips: ['Nós medimos sozinhos', 'Parceria universidade', 'Sem capacidade', 'Aprender no caminho']
read_knowledge(_co-benefits/ + _evidence/impact-benchmarks.md). Apresentar COM vs SEM com faixas + confiança.
Avaliar: Impacto Climático/SbN (0-3).

**Fase 3c: Operação e Sustentabilidade** (operations_sustain) — REFERENCIAR FASE 1
NÃO perguntar sobre equipe de novo (Fase 1). Referenciar: "Na Fase 1, vocês mencionaram X..."
PERGUNTAS PRESCRITIVAS (ask_user com chips):
  • sustainability_model → chips: ['Orçamento municipal', 'Cooperativa/uso produtivo', 'Editais recorrentes', 'Misto', 'Não planejado ainda']
  • opex_estimate_year1 → chips: ['<R$ 5k/ano', 'R$ 5-20k/ano', 'R$ 20-50k/ano', 'R$ 50k+/ano', 'Não estimei ainda']
  • who_maintains → chips: ['Nossa organização', 'Comunidade voluntária', 'Parceria com prefeitura', 'Contratado externo', 'A definir']
read_knowledge para OPEX do tipo de SbN. Créditos de carbono NÃO são práticos pra escala comunitária.
Avaliar: Planejamento Financeiro (0-3).`
        : `**Phase 3a: What We're Building** (intervention_type)
Open open_intervention_selector with siteHazards from Phase 2. If "I don't know": guide via read_knowledge + examples.
After selection, PRESCRIPTIVE QUESTIONS (each is ONE ask_user call with chips):
  • intervention_scale → chips: ['Small (<200 m²)', 'Medium (200-1000 m²)', 'Large (1000+ m²)', 'Not sure yet']
  • construction_model → chips: ['Community mutirão', 'Hired contractor', 'University/NGO partnership', 'Mixed', 'Undecided']
  • For urban forests: species_preference → chips ['Native POA species', 'Fruit trees', 'Shade trees', 'Mixed', 'Technical team decides']
  • For rain gardens/bioswales: substrate_type → chips ['Existing permeable soil', 'Modified substrate', 'Gravel + plants', 'Not sure']
  • justification_why_here → free-text (1-2 sentences): "Why this type in this place?"
Score: Problem Clarity (0-3), Solution Clarity (0-3).

**Phase 3b: Expected Impact** (impact_monitoring) — GO DEEPER, DON'T REPEAT
DO NOT re-ask about hazards/population (already from Phase 2).
PRESCRIPTIVE QUESTIONS (each one ask_user with chips, unless noted):
  • baseline_condition → free-text: "How is the place TODAY, before the intervention?"
  • maintenance_frequency → chips: ['Weekly', 'Monthly', 'Quarterly', 'Annual', 'On demand']
  • project_timeframe → chips: ['6 months', '1 year', '2 years', '3+ years', 'Phased']
  • monitoring_capacity → chips: ['We measure ourselves', 'University partnership', 'No capacity', 'Learn as we go']
read_knowledge(_co-benefits/ + _evidence/impact-benchmarks.md). Present WITH vs WITHOUT with ranges + confidence.
Score: Climate NBS Impact (0-3).

**Phase 3c: Operations & Sustainability** (operations_sustain) — REFERENCE PHASE 1
DO NOT re-ask about team (Phase 1). Reference: "In Phase 1, you mentioned X..."
PRESCRIPTIVE QUESTIONS (ask_user with chips):
  • sustainability_model → chips: ['Municipal budget', 'Cooperative/productive use', 'Recurring grants', 'Mixed', 'Not planned yet']
  • opex_estimate_year1 → chips: ['<R$ 5k/yr', 'R$ 5-20k/yr', 'R$ 20-50k/yr', 'R$ 50k+/yr', 'Not estimated yet']
  • who_maintains → chips: ['Our organization', 'Community volunteers', 'Municipal partnership', 'External contractor', 'TBD']
read_knowledge for OPEX of chosen NBS type. Carbon credits NOT practical at community scale.
Score: Financial Thinking (0-3).`;

    case 4:
      return isPt
        ? `**Fase 4: O Que Precisamos** (needs_assessment) — FONTES REAIS
NÃO perguntar sobre orçamento de novo (Fase 3c). read_knowledge(_financing-sources/cbo-grants.md).
Nível 1 (direto): Teia (R$100K), Fundo Casa RS (R$40K), Periferias Verdes, GEF SGP (US$50K).
Nível 2 (parceria): Petrobras SbN Urbano, World Bank P178072. Monitor: capta.org.br.
NÃO apresentar BNDES ou GCF como opções diretas para OBCs.

PERGUNTAS PRESCRITIVAS (ask_user com chips, exceto onde indicado):
  • technical_needs → multi-select chips: ['Apoio em design', 'Engenharia', 'Monitoramento', 'Capacitação técnica', 'Múltiplos', 'Nenhum']
  • regulatory_status → chips: ['Temos licenças', 'Em processo', 'Não iniciamos', 'Não sei se preciso']
  • training_needs → multi-select chips: ['Design SbN', 'Gestão de projeto', 'Engajamento comunitário', 'Monitoramento', 'Financeiro', 'Captação', 'Nenhum']
  • financial_gap → chips: ['<R$ 10k', 'R$ 10-50k', 'R$ 50-200k', 'R$ 200k+', 'Ainda não estimei']
  • equipment_needed → texto livre (lista específica, ex: "ferramentas de jardinagem, mudas, viveiro")
  • partnerships → texto livre: "Tem parcerias atuais ou potenciais? (universidades, prefeitura, ONGs, padrinhos)"
  • online_presence → texto livre: site / Instagram / Facebook (URLs)
Avaliar: Consciência Regulatória (0-3).`
        : `**Phase 4: What We Need** (needs_assessment) — REAL FUNDING SOURCES
DO NOT re-ask about budget (Phase 3c). read_knowledge(_financing-sources/cbo-grants.md).
Tier 1 (direct): Teia (R$100K), Fundo Casa RS (R$40K), Periferias Verdes, GEF SGP (US$50K).
Tier 2 (partnership): Petrobras NBS Urbano, World Bank P178072. Monitor: capta.org.br.
DO NOT present BNDES or GCF as direct CBO options.

PRESCRIPTIVE QUESTIONS (ask_user with chips, unless noted):
  • technical_needs → multi-select chips: ['Design support', 'Engineering', 'Monitoring', 'Technical capacity-building', 'Multiple', 'None']
  • regulatory_status → chips: ['Have permits', 'In process', 'Not started', 'Not sure if needed']
  • training_needs → multi-select chips: ['NBS design', 'Project management', 'Community engagement', 'Monitoring', 'Financial mgmt', 'Fundraising', 'None']
  • financial_gap → chips: ['<R$ 10k', 'R$ 10-50k', 'R$ 50-200k', 'R$ 200k+', 'Not estimated yet']
  • equipment_needed → free-text (specific list, e.g. "garden tools, seedlings, nursery")
  • partnerships → free-text: "Any current or potential partnerships? (universities, city, NGOs, sponsors)"
  • online_presence → free-text: website / Instagram / Facebook (URLs)
Score: Regulatory Awareness (0-3).`;

    case 5:
      return isPt
        ? `**Fase 5: Resultados e Evidências** (results_evidence)
PERGUNTAS PRESCRITIVAS:
  • documents → pedir DRAG AND DROP: "Arraste no chat: propostas, relatórios, fotos antes/depois, plantas, orçamentos."
  • data_collected → chips: ['Sim, temos dados quantitativos', 'Apenas dados qualitativos', 'Não medimos ainda', 'Estamos começando agora']
  • community_feedback → chips: ['Forte apoio comunitário (com evidência)', 'Apoio moderado', 'Misto', 'Ainda construindo apoio']
  • government_interest → chips: ['Apoio formal escrito', 'Interesse verbal', 'Em conversa', 'Sem contato ainda']
  • co_financing → chips: ['Sim, já temos co-financiamento', 'Em negociação', 'Buscando ativamente', 'Ainda não']
  • scalability → chips: ['Pode replicar em outros bairros já', 'Modelo testado, pronto pra escalar', 'Piloto único por enquanto', 'Não pensamos em escala ainda']
Avaliar flags: posse do terreno (Fase 2), dados de baseline (Fase 3b), interesse do governo, co-financiamento, escalabilidade.
Após completar: gerar placar de maturidade completo (todas 9 métricas + 6 flags) e chamar set_phase(6).
Dizer: "Seu perfil está completo! Revise na aba Documento e clique Exportar."`
        : `**Phase 5: Results & Evidence** (results_evidence)
PRESCRIPTIVE QUESTIONS:
  • documents → ask for DRAG AND DROP: "Drop into chat: proposals, reports, before/after photos, plans, budgets."
  • data_collected → chips: ['Yes, we have quantitative data', 'Only qualitative data', 'Not measured yet', 'Just starting now']
  • community_feedback → chips: ['Strong community support (with evidence)', 'Moderate support', 'Mixed', 'Still building support']
  • government_interest → chips: ['Formal written support', 'Verbal interest', 'In conversation', 'No contact yet']
  • co_financing → chips: ['Yes, already secured', 'In negotiation', 'Actively seeking', 'Not yet']
  • scalability → chips: ['Can replicate in other neighborhoods now', 'Model tested, ready to scale', 'Single pilot for now', 'Have not thought about scale']
Assess flags: land tenure (Phase 2), baseline data (Phase 3b), gov interest, co-financing, scalability.
After completing: generate full maturity scorecard (all 9 metrics + 6 flags) and call set_phase(6).
Say: "Your profile is complete! Review in the Document tab and click Export."`;

    default: // Phase 6+ (complete)
      return isPt
        ? `**Perfil completo.** Ajudar o usuário a revisar e editar campos. Responder perguntas sobre o projeto.`
        : `**Profile complete.** Help user review and edit fields. Answer questions about their project.`;
  }
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
