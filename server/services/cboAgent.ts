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
  isValidMaturityMetric,
  isValidSectionId,
  canonicalPriorityFlag,
} from "@shared/cbo-schema";
import { getPhasePolicyForCbo, isPhaseAllowed, buildAccessPolicyPrompt, type PhasePolicy } from "./phaseGating";
import { loadEncontroSkill } from "./encontroSkills";
import {
  loadCboState as dbLoadCboState,
  loadCboMessages as dbLoadCboMessages,
  flushCbo,
} from "./cboPersistence";
import { db } from "../db";
import { cohortMembers } from "@shared/cohort-schema";
import { eq } from "drizzle-orm";
import { getOrgIdForCboState, listDocumentsByOrg, getDocumentForOrg } from "./documentPersistence";
import { queryTerms, scoreText, extractExcerpt } from "./textSearch";
import { isFakeModelEnabled, streamWithFakeModel } from "./fakeCboModel";
import { emitAssistantText } from "./agentOutput";

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

// Flush = UPSERT cbo_states + INSERT any new cbo_messages since last flush, in
// a single transaction (see cboPersistence.flushCbo). The flush pointer only
// advances when the whole transaction commits, so a failure can't strand state
// without its messages.
const saveTimers = new Map<string, NodeJS.Timeout>();
const SAVE_DEBOUNCE_MS = 2000;

async function persistCbo(id: string) {
  const state = cboStates.get(id);
  if (!state) return;
  const allMessages = cboMessages.get(id) ?? [];
  const flushed = flushedMessageCount.get(id) ?? 0;
  const newMessages = allMessages.length > flushed ? allMessages.slice(flushed) : [];
  const { flushedCount } = await flushCbo(state, newMessages, flushed);
  flushedMessageCount.set(id, flushedCount);
}

export function debouncedPersist(id: string) {
  const existing = saveTimers.get(id);
  if (existing) clearTimeout(existing);
  saveTimers.set(id, setTimeout(() => {
    persistCbo(id).catch(e => console.error(`[cbo] persist(${id}) failed`, e));
    saveTimers.delete(id);
  }, SAVE_DEBOUNCE_MS));
}

// Immediate, durable flush — cancels any pending debounce and persists now.
// Use on phase boundaries (set_phase, /advance-phase) so a completed session
// (e.g. a finished Session-1 org profile) is never lost to the 2s debounce
// window if the process restarts right after the user finishes.
export async function flushNow(id: string) {
  const existing = saveTimers.get(id);
  if (existing) { clearTimeout(existing); saveTimers.delete(id); }
  await persistCbo(id).catch(e => console.error(`[cbo] flushNow(${id}) failed`, e));
}

// ── Single source of truth for advancing a CBO's phase ──
// The agent's set_phase tool and the /advance-phase route (the green
// "Start Encontro" card) both used to inline the same gate + set + flush logic,
// which could drift. Both now delegate here: validate range, apply the P-8
// unlock gate (phases 1-5 must be opened by the coordinator; 0 and 6 are
// always allowed), set the phase, and persist immediately (phase boundary).
// Callers own their own UX (SSE event vs HTTP response). The chat-handler
// "vamos começar o encontro N" regex stays as a separate belt-and-suspenders
// fallback and does its own thing.
export type AdvancePhaseResult =
  | { ok: true; phase: number }
  | { ok: false; reason: 'not_found' | 'range' | 'locked'; currentPhase?: number; unlockedPhases?: number[] };

export async function advanceCboPhase(cboId: string, target: number): Promise<AdvancePhaseResult> {
  const state = getCboState(cboId);
  if (!state) return { ok: false, reason: 'not_found' };
  if (!Number.isInteger(target) || target < 0 || target > 6) {
    return { ok: false, reason: 'range', currentPhase: state.phase };
  }
  if (target >= 1 && target <= 5) {
    const policy = await getPhasePolicyForCbo(cboId);
    if (policy.gated && !isPhaseAllowed(policy, target)) {
      return { ok: false, reason: 'locked', currentPhase: state.phase, unlockedPhases: policy.unlockedPhases };
    }
  }
  state.phase = target;
  setCboState(cboId, state);
  await flushNow(cboId);
  return { ok: true, phase: target };
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
      if (!isValidSectionId(args.sectionId)) {
        return { content: [{ type: "text" as const, text: `Unknown section "${args.sectionId}". Use one of exactly: ${ALL_CBO_SECTION_IDS.join(', ')}.` }], isError: true };
      }
      const section = state.sections[args.sectionId as keyof typeof state.sections];
      if (!section) return { content: [{ type: "text" as const, text: `Unknown section: ${args.sectionId}` }], isError: true };
      const oldValue = section.fields[args.field]?.value ?? null;
      section.fields[args.field] = { value: args.value, confidence: args.confidence as Confidence, source: args.source, userEdited: false };
      section.lastUpdatedBy = 'agent';
      state.editLog.push({ timestamp: new Date().toISOString(), sectionId: args.sectionId, field: args.field, oldValue, newValue: args.value, source: 'agent' });
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
      const result = await advanceCboPhase(cboId, args.phase);
      if (!result.ok) {
        if (result.reason === 'not_found') return { content: [{ type: "text" as const, text: "Error: not found" }], isError: true };
        if (result.reason === 'locked') {
          return {
            content: [{
              type: "text" as const,
              text: `Phase ${args.phase} is locked. The coordinator has only opened phases ${result.unlockedPhases?.join(', ')}. Stay at Phase ${result.currentPhase} and tell the user warmly that the next workshop will open this section.`,
            }],
            isError: true,
          };
        }
        return { content: [{ type: "text" as const, text: `Invalid phase ${args.phase}.` }], isError: true };
      }
      pushEvent({ type: 'phase_change', phase: result.phase });
      return { content: [{ type: "text" as const, text: `Phase ${result.phase}` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  // E1 triage: stores the project-readiness path on the cohort member. Branches
  // E2-E3 flows (has-project + has-idea are project-forward; needs-help is
  // discovery). No-op if the CBO isn't part of a cohort.
  const setPath = sdkTool(
    "set_path",
    "Record the user's path choice from the E1 triage. 'has-project' = they already have a SELECTED, scoped NBS project (site + scope — typically a more mature / implementer org); 'has-idea' = they have a project direction in mind but it's not locked; 'needs-help' = they want help discovering one. Downstream, has-project is handled like has-idea (project-forward).",
    { path: z.enum(["has-project", "has-idea", "needs-help"]) },
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
    "Render the NbsShowcaseCard strip inline in chat. Use in E2 Beat 1, AFTER show_intervention_types, to show REAL Brazilian/Porto Alegre cases of the NBS types. Pass typeRefs to tie the examples to the types just shown. mode='favorites' for needs-help path. Optional hazardFilter to narrow.",
    {
      mode: z.enum(["browse", "favorites"]).default("browse"),
      hazardFilter: z.enum(["flood", "heat", "biodiversity"]).optional(),
      typeRefs: z.array(z.string()).optional().describe("NBS type ids (e.g. ['flood-parks','urban-forests']) — show only examples that represent these types"),
      intro: z.string().optional().describe("Optional 1-line lead text rendered above the strip"),
      cardIds: z.array(z.string()).optional().describe("Explicit card IDs to show (overrides hazardFilter/typeRefs)"),
    },
    async (args: any) => {
      const showcase = await import("@shared/nbs-showcase-cards");
      let cards: { id: string }[];
      if (Array.isArray(args.cardIds) && args.cardIds.length > 0) {
        cards = args.cardIds
          .map((id: string) => showcase.getShowcaseCard(id))
          .filter(Boolean) as { id: string }[];
      } else if (args.hazardFilter || (Array.isArray(args.typeRefs) && args.typeRefs.length > 0)) {
        cards = showcase.filterShowcaseCards({ hazard: args.hazardFilter, typeRefs: args.typeRefs });
      } else {
        cards = showcase.filterShowcaseCards();
      }
      const ids = cards.map(c => c.id);
      pushEvent({ type: 'show_examples', cardIds: ids, mode: args.mode ?? 'browse', intro: args.intro });
      return { content: [{ type: "text" as const, text: `Showed ${ids.length} example(s) in ${args.mode ?? 'browse'} mode. The strip has NO continue button. In browse mode, follow IN THE SAME TURN with a short message and an \`ask_user\` (e.g. "✓ Entendi" / "Tenho uma dúvida") so the user can continue. In favorites mode, let them save first — your next turn ends with that \`ask_user\`. Never leave the strip as the last thing in a turn.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  // E2 Beat 1 (educational): render the read-only NBS TYPE strip inline. This is
  // the FIRST thing in E2 — teach the categories of nature-based solutions
  // before showing real examples. Each card expands ("Saber mais") to the type's
  // description, example, and a case study. No selection here — purely to learn;
  // picking a type happens later. Types come from shared/cbo-schema NBS_INTERVENTION_TYPES.
  const showInterventionTypes = sdkTool(
    "show_intervention_types",
    "Render the educational NBS TYPE strip inline in chat. Use as the FIRST action in E2 to teach the kinds of nature-based solutions (read-only, expandable). Optionally pass typeIds to show a subset; omit to show all 6. STOP and wait for the user to read/react.",
    {
      typeIds: z.array(z.string()).optional().describe("Subset of NBS type ids to show (e.g. ['flood-parks','wetland-restoration']); omit for all 6"),
      intro: z.string().optional().describe("Optional 1-line lead text rendered above the strip"),
    },
    async (args: any) => {
      const schema = await import("@shared/cbo-schema");
      const all = schema.NBS_INTERVENTION_TYPES.map((t: any) => t.id);
      const ids = Array.isArray(args.typeIds) && args.typeIds.length > 0
        ? args.typeIds.filter((id: string) => all.includes(id))
        : all;
      pushEvent({ type: 'show_types', typeIds: ids, intro: args.intro });
      return { content: [{ type: "text" as const, text: `Showed ${ids.length} NBS type(s). The strip is read-only and has NO buttons — in this SAME turn you MUST follow with a short message and an \`ask_user\` (e.g. options "Ver exemplos" / "Já conheço, pular") so the user has a way to continue. Do not end the turn on the strip alone.` }] };
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
    `Present one or more multiple-choice questions to the user. The UI renders each as chip buttons (or a free-text input when the user picks "Outra coisa").

ALWAYS use this tool for any question with 2-7 natural buckets — legal form, team size, paid/volunteer split, project scale, NBS experience, hazard ranking, land tenure, current site use, etc. Never ask such questions as free-text chat. Free-text is allowed ONLY for genuinely unique values: org name, one-sentence mission, year, proud-moment story.

Every turn that calls update_section MUST also call ask_user (or another user-prompting tool: open_map, ask_priority_rank, ask_community_anchoring, show_examples, open_intervention_selector) in the SAME turn. Pairing is non-negotiable — if you persist a value and end the turn without prompting the next question, the user sees a blank screen and is stranded.

You may batch multiple questions in one call (pass an array). Use sparingly: batch only when the questions are tightly related and the user can answer them in any order. For a sequential question-by-question flow (the E1 default), one question per call is correct.

Include showMap: true on a question only when the user genuinely needs the map to pick an answer.`,
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
Tiles (raster): poa_flood_hazard (Flood Hazard), poa_heat_hazard (Heat Hazard), poa_landslide_hazard (Landslide Hazard), oef_dynamic_world (Land Use), oef_chirps_r90p_2024, oef_copernicus_dem, oef_ghsl_population, oef_merit_elv, +40 more
Spatial queries: sq_parks_flood, sq_schools_flood, sq_hospitals_flood, sq_wetlands_flood, sq_schools_heat_250m, sq_schools_landslide_250m

## Recipes
- CBO Phase 2 (Where We Work): composite + zoneSource:"neighborhoods" + [osm_parks, osm_schools, osm_wetlands] + [poa_flood_hazard, poa_heat_hazard, poa_landslide_hazard]
- CBO Phase 3 (What We're Doing): assets + [osm_parks, osm_wetlands] + [oef_dynamic_world, poa_flood_hazard, poa_heat_hazard, poa_landslide_hazard]
- Concept Note Phase 2 (Territorial Scope): zones + [] + [poa_flood_hazard, poa_heat_hazard, poa_landslide_hazard]
- Environmental analysis: sample + [] + [poa_flood_hazard, poa_heat_hazard, oef_copernicus_dem]

STOP and wait for the user's map selection after calling this tool.`,
    {
      layers: z.array(z.string()).optional().describe("OSM layer IDs to show: osm_parks, osm_schools, osm_hospitals, osm_wetlands"),
      tileLayers: z.array(z.string()).optional().describe("Tile layer IDs as toggleable overlays (not auto-shown): poa_flood_hazard, poa_heat_hazard, etc."),
      spatialQueries: z.array(z.string()).optional().describe("Pre-filter features: sq_parks_flood, sq_schools_heatwave, etc."),
      selectionMode: z.enum(["zones", "assets", "sample", "composite", "browse-only"]).describe("composite = zone first, then sites. assets = sites only. zones = zones only. sample = click-to-read-values. browse-only = exploration; no commitment (E2 needs-help)."),
      prompt: z.string().describe("Clear instruction for the user, e.g. 'Select the zone where you work, then pick the parks and schools you are targeting'"),
      sampleLayers: z.array(z.string()).optional().describe("For sample mode: which tile layers to sample on click"),
      zoneSource: z.enum(["neighborhood_zones", "intervention_zones", "neighborhoods"]).optional().describe("For composite mode step 1: 'neighborhood_zones' (default) shows bairros with risk scores + vulnerability-weighted priority. 'neighborhoods' shows raw IBGE census data. 'intervention_zones' uses legacy synthetic zones."),
      narrationOverlay: z.string().optional().describe("Translucent banner over the map for browse-only mode — agent narrates what colors mean. ~80 chars ideal."),
      showLegendSimple: z.boolean().optional().describe("Collapse the full toolkit into a simple 3-chip hazard legend. Useful for first-time CBO users."),
      hazardTour: z.boolean().optional().describe("E2 map step: open into a guided tour that walks the user through flood → heat → landslide ONE at a time before unlocking neighborhood/site selection. Use selectionMode:'composite' with this. Pass the 3 poa_*_hazard tileLayers."),
      allowDeferSite: z.boolean().optional().describe("E2 map step: let the user commit a neighborhood with no specific site yet ('usar o bairro todo'). Pass true for the CBO map step."),
      suggestedSite: z.object({
        quote: z.string().optional().describe("The literal passage from the org's document that names the place (shown to the user as 'na proposta: …')"),
        name: z.string().optional().describe("Place/address to geocode (e.g. 'Rua Voluntários da Pátria 123, Porto Alegre') when you don't have coordinates"),
        lat: z.number().optional(),
        lng: z.number().optional(),
        neighborhood: z.string().optional().describe("Bairro-only hint when the doc names a neighborhood but no precise site"),
      }).optional().describe("E2 map step: a site candidate found via search_org_documents, to pre-place for the user to VALIDATE ('é aqui?') instead of picking blind. Only pass what the doc actually says — the quote is the basis the user sees."),
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
          hazardTour: args.hazardTour,
          allowDeferSite: args.allowDeferSite,
          suggestedSite: args.suggestedSite,
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
      if (!isValidMaturityMetric(args.metric)) {
        return {
          content: [{
            type: "text" as const,
            text: `Invalid metric "${args.metric}". Use one of exactly: ${MATURITY_METRICS.join(', ')}. Re-call score_maturity with the correct metric name — the next-workshop banner only appears when the phase's metrics are scored with these exact ids.`,
          }],
          isError: true,
        };
      }
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
      const flag = canonicalPriorityFlag(args.flag);
      if (!flag) {
        return {
          content: [{
            type: "text" as const,
            text: `Invalid priority flag "${args.flag}". Use one of exactly: ${PRIORITY_FLAG_DEFINITIONS.join(' | ')}.`,
          }],
          isError: true,
        };
      }
      // Store the canonical flag string so the orchestrator's flag set stays consistent.
      state.priorityFlags = state.priorityFlags.filter(f => f.flag !== flag);
      state.priorityFlags.push({ flag, met: args.met, notes: args.notes });
      setCboState(cboId, state);
      pushEvent({ type: 'maturity_update', scores: state.maturityScores, total: state.totalMaturityScore, flags: state.priorityFlags });
      return { content: [{ type: "text" as const, text: `Flag: ${flag} = ${args.met ? 'met' : 'not met'}` }] };
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

  // Lexical search over the static knowledge base — find the right file(s) by
  // topic and get an excerpt, instead of guessing a path. Mirrors Funga.
  const searchKnowledge = sdkTool(
    "search_knowledge",
    "Search the knowledge base (interventions, co-benefits, financing sources, evidence, Brazilian case studies, Porto Alegre context) by topic/keyword and get the most relevant files with an excerpt. Use this to find the right file before read_knowledge, and especially to answer an 'I don't know / help me' question.",
    { query: z.string().describe("Topic to look up, e.g. 'rain garden cost' or 'funding for community gardens'") },
    async (args: any) => {
      const files = await getKnowledgeFiles();
      const terms = queryTerms(args.query);
      const scored = files
        .map(f => ({ f, score: scoreText(`${f.path} ${f.whenToUse} ${f.content}`, terms) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
      if (scored.length === 0) {
        return { content: [{ type: "text" as const, text: `No knowledge files matched "${args.query}".` }] };
      }
      const lines = scored.map(({ f, score }) =>
        `### ${f.path} (score ${score})${f.whenToUse ? `\n_${f.whenToUse}_` : ''}\n${extractExcerpt(f.content, terms)}`);
      return { content: [{ type: "text" as const, text: `Top knowledge matches for "${args.query}":\n\n${lines.join('\n\n')}\n\nThe path is folder/file — use read_knowledge(folder, file) for the full file.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  // ── Per-org knowledge base (the evidence locker) ──
  // These read the org's accumulated documents across ALL sessions, scoped to
  // the org that owns this CBO profile, so Encontro 4 can reference the budget
  // dropped in Encontro 1. See docs/cbo-platform-architecture.md.
  const listOrgDocuments = sdkTool(
    "list_org_documents",
    "List the documents this organization has shared so far (across all sessions) — proposals, budgets, photos, voice memos, prior-project docs. Use this to recall what evidence already exists before asking the user to re-explain something. Returns an id, filename, kind, and short summary for each.",
    {},
    async () => {
      const orgId = await getOrgIdForCboState(cboId);
      if (!orgId) return { content: [{ type: "text" as const, text: "No documents on file yet." }] };
      const docs = await listDocumentsByOrg(orgId);
      if (docs.length === 0) return { content: [{ type: "text" as const, text: "No documents on file yet." }] };
      const lines = docs.map(d => `- [${d.id}] ${d.filename} (${d.kind ?? 'file'}${d.droppedInPhase ? `, Encontro ${d.droppedInPhase}` : ''}) — ${(d.summary || '').slice(0, 160)}`);
      return { content: [{ type: "text" as const, text: `Documents on file (${docs.length}):\n${lines.join('\n')}\n\nUse read_org_document with an [id] to read the full text.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  const readOrgDocument = sdkTool(
    "read_org_document",
    "Read the full extracted text of one of this organization's documents (by id from list_org_documents). Use to pull details from a budget, proposal, or prior-project doc the org shared earlier — including in a previous session.",
    { id: z.string().describe("Document id from list_org_documents") },
    async (args: any) => {
      const orgId = await getOrgIdForCboState(cboId);
      if (!orgId) return { content: [{ type: "text" as const, text: "No documents available." }], isError: true };
      const doc = await getDocumentForOrg(args.id, orgId);
      if (!doc) return { content: [{ type: "text" as const, text: `Document ${args.id} not found for this organization.` }], isError: true };
      const text = doc.fullText || doc.summary || '(no extracted text)';
      return { content: [{ type: "text" as const, text: `# ${doc.filename}\n\n${text.length > 6000 ? text.slice(0, 6000) + '\n...(truncated — use search_org_documents to find a specific passage further in)' : text}` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  // Lexical search across the org's documents — returns the relevant passage
  // from anywhere in a (possibly large) doc, so the agent doesn't have to dump
  // or blind-truncate the whole file. Mirrors Funga's search_knowledge pattern.
  const searchOrgDocuments = sdkTool(
    "search_org_documents",
    "Search across ALL of this org's uploaded documents for a topic/keyword (e.g. 'annual budget', 'families served', 'partnership letter') and get the most relevant passages with their document id. PREFER this over read_org_document when you need a specific detail from large docs — it finds the relevant excerpt anywhere in the file, not just the first page.",
    { query: z.string().describe("What to look for, e.g. 'budget' or 'number of beneficiaries'") },
    async (args: any) => {
      const orgId = await getOrgIdForCboState(cboId);
      if (!orgId) return { content: [{ type: "text" as const, text: "No documents on file yet." }] };
      const docs = await listDocumentsByOrg(orgId);
      const terms = queryTerms(args.query);
      const scored = docs
        .map(d => ({ d, score: scoreText(`${d.filename} ${d.fullText || d.summary || ''}`, terms) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      if (scored.length === 0) {
        return { content: [{ type: "text" as const, text: `No matches for "${args.query}" in the org's documents. Use list_org_documents to see what's on file.` }] };
      }
      const lines = scored.map(({ d, score }) =>
        `### [${d.id}] ${d.filename} (score ${score})\n${extractExcerpt(d.fullText || d.summary || '', terms)}`);
      return { content: [{ type: "text" as const, text: `Top matches for "${args.query}":\n\n${lines.join('\n\n')}\n\nUse read_org_document([id]) for a document's full text.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  const openInterventionSelector = sdkTool(
    "open_intervention_selector",
    `Open the NBS Intervention Type Selector micro-app. Shows 6 NBS types as visual cards with REAL PHOTOS from Brazilian case studies, cost data, outcomes, and timelines. The user browses and selects one or more intervention types.

Use this in Phase 3a after collecting site information. Pass siteHazards from Phase 2 data to highlight the most relevant types. Only the top 2 types get the "Recommended" badge.

⚠️ siteHazards.landslide MUST be the site's landslide HAZARD (terrain susceptibility, 0–1) sampled on the E2 map (the poa_landslide_hazard layer value at the chosen point), NOT the landslide RISK. Landslide RISK is structurally tiny in POA (low exposure on the slopes ≈ 0), but the HAZARD is high on the morros — and it's what should drive slope-stabilizing NbS (urban forests, green corridors, whose roots stabilize slopes). If the E2 site sits on landslide-prone terrain (landslide hazard ≳ 0.2), pass that hazard value so those types surface as Recommended; a near-zero value would wrongly hide them.

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
      }).optional().describe("Hazard scores from Phase 2 to rank types by relevance. landslide = the site's landslide HAZARD (terrain susceptibility), NOT the risk — so slope-stabilizing NbS surface on the morros."),
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
    tools: [updateSection, flagGap, setPhase, setPath, showInterventionTypes, showExamples, askPriorityRank, askCommunityAnchoring, askUser, openMap, scoreMaturity, setPriorityFlag, readKnowledge, searchKnowledge, listOrgDocuments, readOrgDocument, searchOrgDocuments, openInterventionSelector],
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

  // Dead-socket guard. On a phone-first audience over patchy mobile data the
  // client frequently drops mid-stream. Without this the SDK loop keeps calling
  // res.write() on a closed socket (throwing / spewing EPIPE) and the per-CBO
  // push registry is never cleaned up. We flip a flag on 'close' and make every
  // push a no-op afterwards — in-flight tool calls still mutate in-memory state
  // (persisted on phase boundaries); we just stop writing to nobody.
  let clientGone = false;

  const pushEvent = (event: CboEvent) => {
    if (clientGone || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'chat') {
      // ALL chat events store as messageType: 'content'. The previous
      // heuristic (regex + length<300 fallback) was catastrophically
      // over-aggressive after PR #196 made the agent brief: any agent
      // response under 300 chars without markdown headers/bold was
      // misclassified as 'thinking' and hidden behind the WORKING
      // preview UI. This nuked acks ("Got it."), short questions
      // ("And who am I speaking with — what's your name?"), and any
      // closing message that followed the new ≤6-line cap.
      //
      // Real thinking content comes via the SDK's `chat_thinking`
      // event (handled below) when extended thinking is enabled — that's
      // the only path that should produce messageType: 'thinking' now.
      addCboMessage(cboId, { role: 'assistant', content: event.content, messageType: 'content', timestamp: new Date().toISOString() });
    } else if (event.type === 'chat_thinking') {
      addCboMessage(cboId, { role: 'assistant', content: event.content, messageType: 'thinking', timestamp: new Date().toISOString() });
    } else if (event.type === 'show_types') {
      // Persist the educational strip as an inline transcript message so it
      // re-renders on reload (the event itself is ephemeral). Content is a JSON
      // payload the client parses; messageType 'composer' keeps it out of text-
      // based message logic.
      addCboMessage(cboId, { role: 'assistant', content: JSON.stringify({ kind: 'types', typeIds: event.typeIds, intro: event.intro }), messageType: 'composer', timestamp: new Date().toISOString() });
    } else if (event.type === 'show_examples') {
      addCboMessage(cboId, { role: 'assistant', content: JSON.stringify({ kind: 'examples', cardIds: event.cardIds, mode: event.mode, intro: event.intro }), messageType: 'composer', timestamp: new Date().toISOString() });
    } else if (event.type === 'open_map') {
      // Persist that the map step is active so the right-panel tool stays
      // reachable across reloads (not gated behind a transient button).
      state.activeTool = { kind: 'map' };
      setCboState(cboId, state); debouncedPersist(cboId);
    } else if (event.type === 'open_intervention_selector') {
      state.activeTool = { kind: 'interventions' };
      setCboState(cboId, state); debouncedPersist(cboId);
    }
  };

  res.on('close', () => {
    if (clientGone) return;
    clientGone = true;
    if (pushEventRegistry.get(cboId) === pushEvent) pushEventRegistry.delete(cboId);
    console.log(`[cbo] client disconnected mid-stream for ${cboId} (phase ${state.phase})`);
  });

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

  // Test-only deterministic seam. When CBO_FAKE_MODEL=1 (set ONLY in the
  // test/preview env, never the prod Deployment), drive the turn from a scripted
  // fake instead of the live SDK — fast, free, and reproducible. The real path
  // below is byte-for-byte untouched. See server/services/fakeCboModel.ts.
  if (isFakeModelEnabled()) {
    await streamWithFakeModel(cboId, userMessage, state, pushEvent, lang, { setCboState });
    res.end();
    return;
  }

  const isSdkReady = await loadSdk();

  if (isSdkReady) {
    await streamWithSdk(cboId, userMessage, state, pushEvent, lang);
  } else {
    pushEvent({ type: 'error', message: 'Claude Agent SDK not available.' });
  }

  res.end();
}

// Default model for the CBO chat. Mirrors the conceptNoteAgent (CT) choice that
// proved reliable at sequential chip-first ask_user turns. Per-phase overrides
// live in the encontro skill's YAML frontmatter (`model:` field).
const DEFAULT_CBO_MODEL = 'claude-sonnet-4-6';

async function streamWithSdk(cboId: string, userMessage: string, state: CboState, pushEvent: EventPusher, lang: string = 'en') {
  const mcpServer = getMcpServer(cboId);
  const sysCtx = await buildSystemContext(state, lang);
  const stateSummary = buildStateSummary(state);
  const documentsBlock = await buildDocumentsBlock(cboId);
  const decisionLog = buildDecisionLog(cboId);
  const policy = await getPhasePolicyForCbo(cboId);
  const accessPolicy = buildAccessPolicyPrompt(policy);

  // Pull the per-phase model from skill frontmatter, fall back to default.
  // loadEncontroSkill is cached so this is free when buildSystemContext also
  // called it. Phase 0 (pre-onboarding, before the agent fires set_phase(1)
  // on its first turn) still uses E1's skill — otherwise the first chat turn
  // has no "check CURRENT STATE first" rule and the agent asks for the org
  // name even when the invite already prefilled it.
  const skillPhase = Math.max(1, state.phase);
  const skill = await loadEncontroSkill(skillPhase);
  const model = skill?.model ?? DEFAULT_CBO_MODEL;

  // System prompt = the durable facts the agent needs (persona, tools, skill,
  // state, recent conversation, access policy). User prompt = just the new
  // turn. This mirrors conceptNoteAgent and is the SDK's expected shape;
  // tool-use rules placed in the system prompt are followed more reliably
  // than rules concatenated into the user message string.
  const systemPrompt = `${sysCtx}\n\n## CURRENT STATE\n${stateSummary}${documentsBlock}\n\n## RECENT CONVERSATION\n${decisionLog}${accessPolicy}`;

  console.log(`[cbo] Turn for ${cboId} (phase ${state.phase}, model ${model}, ${Object.values(state.sections).filter(s => Object.keys(s.fields).length > 0).length}/7 sections)`);

  // Track what the agent actually did this turn, so we can detect the
  // skill-violation pattern where it ends without prompting the next question
  // (the "silent turn" that strands the user behind a Continue button).
  const calledTools = new Set<string>();
  let emittedText = false;

  try {
    for await (const message of sdkQuery({
      prompt: userMessage,
      options: {
        cwd: process.cwd(),
        model,
        systemPrompt,
        // Turn cap — a runaway tool loop otherwise burns the full ~10K-token
        // prompt once per roundtrip while the user watches "Processando…".
        // Normal turns use 2-5 tool calls; 12 is generous headroom.
        maxTurns: 12,
        // NOTE: no generic Read/Glob/Grep here. All knowledge + org-document
        // access goes through the purpose-built MCP tools below; the generic
        // file tools only invited stray repo exploration — each stray call is
        // a whole extra model roundtrip on the slowest path (Ana's "agent too
        // slow on basic questions").
        allowedTools: [
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
          "mcp__cbo__search_knowledge",
          "mcp__cbo__list_org_documents",
          "mcp__cbo__read_org_document",
          "mcp__cbo__search_org_documents",
        ],
        mcpServers: mcpServer ? { cbo: mcpServer } : {},
        permissionMode: "bypassPermissions",
      },
    })) {
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "text" && block.text) {
            emittedText = true;
            // Normalize before flushing: an inline option list becomes a real
            // ask_user (buttons) instead of inert markdown bullets (CBO-INLINE-OPTIONS).
            emitAssistantText(block.text, pushEvent);
          } else if (block.type === "tool_use" && block.name) {
            // MCP tools come through namespaced as "mcp__cbo__<name>"; strip
            // the prefix so the guard below can match against canonical names.
            calledTools.add(String(block.name).replace(/^mcp__cbo__/, ''));
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

  // Post-turn guard. The skill (encontro-*.md) requires every mid-encontro
  // turn to end with a user-prompting tool (ask_user / a composer / a closing
  // tool). When the model violates this — emits update_section and nothing
  // else, for example — the user is stranded: no chip to click, no text to
  // reply to. The cbo-profile.tsx "Continue from Phase X" button is a backstop
  // for that case but pressing it sends a directive that derails the agent.
  //
  // This guard logs the violation (for measurement) and, when the turn was
  // both tool-less AND text-less, emits a small recoverable message so the
  // user can re-prompt instead of facing a blank screen.
  // Only USER-PROMPTING tools make a turn "safe" — ones that actually leave the
  // user something to do. score_maturity and a mid-flow set_phase are SILENT
  // (they mutate state but ask nothing); counting them as enders let a turn that
  // only scored maturity or advanced a phase strand the user with a bare
  // "Continue" and no question (CBO-TURNENDER-GUARD). set_phase to 6 is the one
  // legitimate silent close (the flow is complete).
  const USER_PROMPTING = new Set([
    'ask_user',
    'open_map',
    'open_intervention_selector',
    'ask_priority_rank',
    'ask_community_anchoring',
    'show_examples',
    'show_types',
  ]);
  const hadPrompt = Array.from(calledTools).some(name => USER_PROMPTING.has(name));
  const completedFlow = calledTools.has('set_phase') && state.phase >= 6;
  if (!hadPrompt && !completedFlow && state.phase < 6) {
    const toolsList = Array.from(calledTools).join(',') || 'none';
    console.warn(`[cbo] silent_turn_fallback for ${cboId} phase=${state.phase} tools=${toolsList} text=${emittedText}`);
    // Recovery affordance ONLY when the agent emitted no text either — that's
    // the unambiguous stranded case (a tool ran, e.g. update_section, but no
    // question followed). When the agent DID emit text we leave it alone: the
    // skill asks free-text questions (org name, mission, year) as plain prose
    // with no tool call, so emitted-text-without-a-turn-ender is usually a
    // legitimate question, and injecting a fallback there would double-respond.
    //
    // Replaces the old "type \"continuar\"" instruction with a single clickable
    // chip — on mobile, tapping beats typing, and a chip can't be fat-fingered
    // into a derailing free-text reply.
    if (!emittedText) {
      const question = lang === 'pt'
        ? 'Tive um problema técnico no meio desse passo. Vamos retomar de onde paramos?'
        : 'I hit a snag mid-step. Want to pick up where we left off?';
      const label = lang === 'pt' ? 'Continuar' : 'Continue';
      const description = lang === 'pt' ? 'Retomar de onde paramos' : 'Pick up where we left off';
      pushEvent({ type: 'ask_user', question, options: [{ label, description }] });
    }
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

// A compact "documents on file" list for the org that owns this profile —
// injected into the system prompt so the agent always knows what evidence the
// org has shared (across every session) and can read_org_document([id]) instead
// of re-asking. Best-effort; never blocks a turn.
async function buildDocumentsBlock(cboId: string): Promise<string> {
  try {
    const orgId = await getOrgIdForCboState(cboId);
    if (!orgId) return '';
    const docs = await listDocumentsByOrg(orgId);
    if (docs.length === 0) return '';
    const lines = docs.slice(0, 20).map(d =>
      `- [${d.id}] ${d.filename} (${d.kind ?? 'file'}${d.droppedInPhase ? `, Encontro ${d.droppedInPhase}` : ''}) — ${(d.summary || '').slice(0, 120)}`);
    return `\n\n## DOCUMENTS ON FILE (${docs.length})\nThis org has already shared these. Read the full text with read_org_document([id]) before re-asking for information that's likely in them:\n${lines.join('\n')}`;
  } catch (e: any) {
    console.error('[cbo] buildDocumentsBlock failed:', e?.message || e);
    return '';
  }
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

// Cached, parsed knowledge files for search_knowledge (path + body + whenToUse).
// Built once per restart; mirrors the read-folders used for the listing.
const KNOWLEDGE_FOLDERS = ['_interventions', '_co-benefits', '_financing-sources', '_evidence', '_success-cases', 'porto-alegre', '_cougar'];
let knowledgeFilesCache: { path: string; content: string; whenToUse: string }[] | null = null;

async function getKnowledgeFiles(): Promise<{ path: string; content: string; whenToUse: string }[]> {
  if (knowledgeFilesCache) return knowledgeFilesCache;
  const fs = await import('fs/promises');
  const path = await import('path');
  const out: { path: string; content: string; whenToUse: string }[] = [];
  for (const folder of KNOWLEDGE_FOLDERS) {
    try {
      const dir = path.join(process.cwd(), 'knowledge', folder);
      for (const f of await fs.readdir(dir)) {
        if (!f.endsWith('.md')) continue;
        const raw = await fs.readFile(path.join(dir, f), 'utf-8');
        const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const whenToUse = fm ? (fm[1].match(/when[_-]?to[_-]?use:\s*(.+)/i)?.[1]?.trim().replace(/^["']|["']$/g, '') || '') : '';
        out.push({ path: `${folder}/${f}`, content: raw.replace(/^---[\s\S]*?---\s*/, ''), whenToUse });
      }
    } catch { /* folder may not exist */ }
  }
  knowledgeFilesCache = out;
  return out;
}

// Invalidate caches so updated knowledge files take effect
export function invalidateCboCache() { cougarCriteriaCache = null; knowledgeListingCache = null; knowledgeFilesCache = null; }

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
  // that haven't been migrated yet. Phase 0 (pre-onboarding, before the agent
  // calls set_phase(1) on its first turn) maps to E1 — otherwise the first
  // turn ignores the skill's "check CURRENT STATE first" rule.
  const skillPhase = Math.max(1, state.phase);
  const encontroSkill = await loadEncontroSkill(skillPhase);
  const phaseInstructions = encontroSkill?.markdown ?? buildPhaseInstructions(state.phase, isPt);

  // ── City summary (condensed, always loaded) ──
  const citySummary = isPt
    ? `Porto Alegre, RS, Brasil. Pop 1,4M. Enchentes catastróficas em maio 2024 (piores da história do RS). Riscos: inundação (Guaíba), ilhas de calor (4° Distrito, Centro), deslizamento (morros). Planos: PCVR, World Bank P178072 (US$85M regeneração verde). Precedentes: Orla do Guaíba (5,7ha, espécies nativas), Regenera Dilúvio. COUGAR mapeou 50+ atores no ecossistema.`
    : `Porto Alegre, RS, Brazil. Pop 1.4M. Catastrophic floods May 2024 (worst in RS history). Risks: Guaíba river flooding, heat islands (4° Distrito, Centro), landslide (morros/hillsides). Plans: PCVR, World Bank P178072 (US$85M green resilient regeneration). Precedents: Orla do Guaíba (5.7ha native species park), Regenera Dilúvio. COUGAR mapped 50+ ecosystem actors.`;

  // ── Assemble prompt ──
  const prompt = `${isPt
    ? `Você é um consultor de preparação de projetos de SbN ajudando uma organização comunitária em ${state.city}. Você NÃO está apenas coletando dados — está ajudando-os a PENSAR como um consultor.
IDIOMA: TUDO em português do Brasil. Todas as mensagens, opções de ask_user e valores de update_section. Sem exceções.`
    : `You are an NBS project preparation consultant helping a community organization in ${state.city}. You are NOT just collecting data — you are helping them THINK through their project like a consultant.
LANGUAGE: Everything in English — all messages, ask_user options, AND update_section values. Keep one language per session; do not mix.`}

Phase: ${state.phase}. Org: ${state.orgName || '(not set)'}.

## TOOLS
1. **update_section** — ${isPt ? 'preencher campos' : 'fill fields'} (org_profile, intervention_site, intervention_type, impact_monitoring, operations_sustain, needs_assessment, results_evidence)
2. **ask_user** — ${isPt ? 'perguntas múltipla escolha (TUDO em português)' : 'multiple-choice questions'}
3. **open_map** — ${isPt ? 'mapa interativo' : 'interactive map'} (composite/sample/zones/assets modes)
4. **open_intervention_selector** — ${isPt ? 'seletor visual de tipos de SbN (Fase 3a)' : 'NBS type selector micro-app (Phase 3a)'}
5. **set_phase** — ${isPt ? 'avançar fase (1-5, Fase 3 tem 3a/3b/3c). Fase 6 = completo.' : 'advance phase (1-5, Phase 3 has 3a/3b/3c). Phase 6 = complete.'}
6. **score_maturity** / **set_priority_flag** — ${isPt ? 'pontuar métricas COUGAR (0-3) e flags' : 'score COUGAR metrics (0-3) and flags'}
7. **search_knowledge** / **read_knowledge** — ${isPt ? 'buscar por tópico (retorna trechos) e ler o arquivo. USE PROATIVAMENTE — busque antes de adivinhar o caminho.' : 'search by topic (returns excerpts) then read the file. USE PROACTIVELY — search before guessing a path.'}
8. **search_org_documents** / **read_org_document** — ${isPt ? 'buscar um detalhe (orçamento, nº de famílias) nos documentos que a org enviou; prefira a busca a ler o arquivo inteiro.' : "search a detail (budget, # families) across the org's uploaded docs; prefer search over reading a whole file."}
9. **flag_gap** — ${isPt ? 'marcar lacunas (prefira orientar)' : 'mark gaps (prefer guiding)'}

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

  console.log(`[cbo] Prompt size: ~${Math.round(prompt.length / 4)} tokens (${prompt.length} chars) for phase ${state.phase}`);
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
Abrir open_map({ selectionMode: "composite", zoneSource: "neighborhoods", layers: ["osm_parks","osm_schools","osm_wetlands"], tileLayers: ["poa_flood_hazard","poa_heat_hazard","poa_landslide_hazard"], showLegendSimple: true, prompt: "Selecione seu bairro, depois escolha os locais" }).
Após seleção: perguntar condições atuais, população, posse do terreno, engajamento comunitário.
Se desenharem ponto/área customizada: perguntar "Esse local tem um nome?"
Pedir fotos do local. Avaliar: Controle do Local (0-3), Ancoragem Comunitária (0-3).`
        : `**Phase 2: Where We Work** (intervention_site)
Open open_map({ selectionMode: "composite", zoneSource: "neighborhoods", layers: ["osm_parks","osm_schools","osm_wetlands"], tileLayers: ["poa_flood_hazard","poa_heat_hazard","poa_landslide_hazard"], showLegendSimple: true, prompt: "Select your neighborhood, then pick sites" }).
After selection: ask current conditions, population, land tenure, community engagement.
If they draw custom point/area: ask "Does this site have a name?"
Ask for site photos. Score: Site Control (0-3), Community Anchoring (0-3).`;

    case 3:
      return isPt
        ? `**Fase 3a: O Que Construímos** (intervention_type)
Abrir open_intervention_selector com siteHazards da Fase 2 (landslide = o HAZARD/suscetibilidade do terreno do local, não o risco — assim SbN que estabilizam encostas aparecem em encostas/morros). Se "Não sei": orientar via read_knowledge + exemplos.
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
Open open_intervention_selector with siteHazards from Phase 2 (landslide = the site's terrain HAZARD/susceptibility, not the risk — so slope-stabilizing NbS surface on the morros). If "I don't know": guide via read_knowledge + examples.
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
  const oldValue = section.fields[field]?.value ?? null;
  section.fields[field] = { ...section.fields[field], value: newValue, userEdited: true };
  section.lastUpdatedBy = 'user';
  state.editLog.push({ timestamp: new Date().toISOString(), sectionId, field, oldValue, newValue, source: 'user' });
  setCboState(cboId, state);
  await streamCboChat(cboId, `User edited ${sectionId}.${field} to: "${newValue}". Update related fields if needed.`, res, state);
}
