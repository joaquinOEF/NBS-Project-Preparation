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

export function getCboState(id: string): CboState | undefined { return cboStates.get(id); }
export function setCboState(id: string, state: CboState): void {
  if (!state) { cboStates.delete(id); cboMessages.delete(id); return; }
  state.metadata.updatedAt = new Date().toISOString();
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
      sectionId: z.string().describe("Section ID: org_profile, intervention_site, intervention_plan, needs_assessment, results_evidence"),
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
      zoneSource: z.enum(["intervention_zones", "neighborhoods"]).optional().describe("For composite mode step 1: 'neighborhoods' shows bairros with census data (population, poverty). Default: intervention_zones."),
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
    "Read a knowledge file for detailed data about interventions, co-benefits, or city context.",
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

  return sdkCreateMcpServer({
    name: "cbo",
    version: "1.0.0",
    tools: [updateSection, flagGap, setPhase, askUser, openMap, scoreMaturity, setPriorityFlag, readKnowledge],
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

  console.log(`[cbo] Turn for ${cboId} (phase ${state.phase}, ${Object.values(state.sections).filter(s => Object.keys(s.fields).length > 0).length}/5 sections)`);

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

// Skill + knowledge cache
let skillCache: string | null = null;
let knowledgeCache: string | null = null;

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
    for (const folder of ['_interventions', '_co-benefits']) {
      try {
        const files = await fs.readdir(path.join(process.cwd(), 'knowledge', folder));
        chunks.push(`### Available in ${folder}/\n${files.filter((f: string) => f.endsWith('.md')).map((f: string) => `- ${f}`).join('\n')}`);
      } catch {}
    }
    knowledgeCache = chunks.join('\n\n');
    console.log(`[cbo] Knowledge loaded: ${knowledgeCache.length} chars`);
  }

  return `You are a friendly CBO intervention profile advisor helping a community organization in ${state.city} document their NBS project.
Phase: ${state.phase}. Organization: ${state.orgName || '(not set)'}.

## YOUR TOOLS
1. **update_section** — fill document fields (org_profile, intervention_site, intervention_plan, needs_assessment, results_evidence)
2. **ask_user** — present multiple-choice questions for non-spatial decisions
3. **open_map** — open interactive map microapp. Use for ALL spatial/site questions instead of ask_user.
   - Phase 2 (Where We Work): open_map({ selectionMode: "composite", zoneSource: "neighborhoods", layers: ["osm_parks", "osm_schools", "osm_wetlands"], tileLayers: ["oef_fri_2024", "oef_hwm_2024"], prompt: "Select your neighborhood, then pick the parks, schools, or sites you're targeting" })
   - Phase 3 (What intervention): open_map({ selectionMode: "assets", layers: ["osm_parks", "osm_wetlands"], tileLayers: ["oef_dynamic_world", "oef_fri_2024"], prompt: "Select the green spaces or wetlands your NBS will transform" })
   - Evidence check: open_map({ selectionMode: "sample", tileLayers: ["oef_fri_2024", "oef_hwm_2024", "oef_copernicus_dem"], prompt: "Click locations to check climate risk values" })
4. **set_phase** — advance phases (1-6)
5. **flag_gap** — mark missing info
6. **score_maturity** — score COUGAR maturity metrics (0-3) as you gather info
7. **set_priority_flag** — mark priority flags (met/not met)
8. **read_knowledge** — read detailed knowledge files

## MATURITY METRICS (score each 0-3 as you go)
${MATURITY_METRICS.join(', ')}

## PRIORITY FLAGS (set as you discover them)
${PRIORITY_FLAG_DEFINITIONS.join(', ')}

## LANGUAGE
- Each user message ends with [LANGUAGE: ...]. Follow it strictly.
- ALL ask_user option labels and descriptions MUST be in the same language as your response.
- update_section content: always in Portuguese for Brazilian organizations.
- If Portuguese: use simple, accessible language. Avoid jargon. Write as if explaining to a community leader, not a scientist.

## QUESTION STYLE
- Use simple words: "Que tipo de solução?" not "Qual o tipo de SbN?"
- Add example hints in descriptions: "(ex: plantio de árvores, restauração de áreas úmidas)"
- Break complex questions into small steps: ask team size, THEN ask about paid vs volunteer
- For financial questions: ask "Quanto custa o projeto todo?" then "Quanto vocês já têm?" then "Quanto falta?"
- Avoid technical terms: "Alguém do governo sabe do projeto?" not "Status regulatório"
- Offer encouragement: "Ótimo! Isso mostra que vocês já têm experiência."

## BEHAVIOR
- Be warm and encouraging — many CBOs have limited formal documentation experience
- Start IMMEDIATELY with set_phase(1) and ask_user questions
- Score maturity metrics as you gather information (don't wait until the end)
- For ANY spatial question: use open_map (not ask_user with showMap)
- Phase 2: ALWAYS use open_map with "composite" mode
- Phase 3: use open_map with "assets" mode if asking about specific intervention sites
- The tool description has recipes — follow them
- After Phase 5: generate the full maturity scorecard using score_maturity for remaining metrics + set_priority_flag for all 6 flags
- In your FIRST message: mention that the user can drop existing documents into the chat

## FILE DROPS
When the user drops a document, you'll receive its content. React by:
1. Extract ALL relevant info (org name, team, budget, site, interventions, progress)
2. Call update_section for every field you can fill — maximize auto-fill
3. Call score_maturity for metrics you can now assess (e.g., "Problem Clarity" → 2 if doc has a clear problem statement)
4. Tell the user: "I found [X] in your document. I've filled [sections] and scored [metrics]."
5. Skip questions already answered by the document
6. Having a written document is itself evidence of maturity — score accordingly

## SKILL FLOW
${skillCache?.slice(0, 2000) || ''}

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
