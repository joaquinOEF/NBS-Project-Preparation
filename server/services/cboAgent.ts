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
    tools: [updateSection, flagGap, setPhase, askUser, scoreMaturity, setPriorityFlag, readKnowledge],
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
2. **ask_user** — present multiple-choice questions. Use showMap: true for site selection.
3. **set_phase** — advance phases (1-6)
4. **flag_gap** — mark missing info
5. **score_maturity** — score COUGAR maturity metrics (0-3) as you gather info
6. **set_priority_flag** — mark priority flags (met/not met)
7. **read_knowledge** — read detailed knowledge files

## MATURITY METRICS (score each 0-3 as you go)
${MATURITY_METRICS.join(', ')}

## PRIORITY FLAGS (set as you discover them)
${PRIORITY_FLAG_DEFINITIONS.join(', ')}

## BEHAVIOR
- Be warm and encouraging — many CBOs have limited formal documentation experience
- Start IMMEDIATELY with set_phase(1) and ask_user questions
- Score maturity metrics as you gather information (don't wait until the end)
- For site selection (Phase 2): ALWAYS use showMap: true
- Each user message has a [LANGUAGE: ...] directive — follow it
- update_section content in Portuguese if the org is Brazilian
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
