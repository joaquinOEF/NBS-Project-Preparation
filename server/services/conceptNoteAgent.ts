import { z } from "zod";
import type { Response } from "express";
import {
  type ConceptNoteState,
  type ConceptNoteEvent,
  type ChatMessage,
  type Confidence,
  ALL_SECTION_IDS,
} from "@shared/concept-note-schema";

// ============================================================================
// SDK LOADING — lazy, with V2 + V1 detection
// ============================================================================

let sdkAvailable = false;
let sdkV2Available = false;
let sdkQuery: any;
let sdkTool: any;
let sdkCreateMcpServer: any;
let sdkCreateSession: any;
let sdkResumeSession: any;

async function loadSdk() {
  if (sdkAvailable) return true;
  try {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    sdkQuery = sdk.query;
    sdkTool = sdk.tool;
    sdkCreateMcpServer = sdk.createSdkMcpServer;
    sdkAvailable = true;

    // Try V2 imports
    try {
      sdkCreateSession = (sdk as any).unstable_v2_createSession;
      sdkResumeSession = (sdk as any).unstable_v2_resumeSession;
      if (sdkCreateSession) {
        sdkV2Available = true;
        console.log("[concept-note] Claude Agent SDK V2 (persistent sessions) loaded");
      } else {
        console.log("[concept-note] Claude Agent SDK V1 loaded (V2 not available)");
      }
    } catch {
      console.log("[concept-note] Claude Agent SDK V1 loaded (V2 not available)");
    }

    return true;
  } catch (e: any) {
    console.warn(`[concept-note] Claude Agent SDK not available: ${e.message}`);
    console.warn("[concept-note] Chat will use Anthropic API fallback");
    return false;
  }
}

loadSdk();

// ============================================================================
// IN-MEMORY STORES
// ============================================================================

const noteStates = new Map<string, ConceptNoteState>();
const noteMessages = new Map<string, ChatMessage[]>();
const activeSessions = new Map<string, any>(); // noteId → V2 session object or V1 session ID string
const sessionIsFirstTurn = new Map<string, boolean>();

export function getConceptNoteState(noteId: string): ConceptNoteState | undefined {
  return noteStates.get(noteId);
}

export function setConceptNoteState(noteId: string, state: ConceptNoteState): void {
  if (!state) {
    noteStates.delete(noteId);
    noteMessages.delete(noteId);
    // Clean up V2 session
    const session = activeSessions.get(noteId);
    if (session && typeof session.close === 'function') {
      try { session.close(); } catch {}
    }
    activeSessions.delete(noteId);
    sessionIsFirstTurn.delete(noteId);
    return;
  }
  state.metadata.updatedAt = new Date().toISOString();
  noteStates.set(noteId, state);
}

export function getMessages(noteId: string): ChatMessage[] {
  return noteMessages.get(noteId) || [];
}

export function addMessage(noteId: string, msg: ChatMessage): void {
  const msgs = noteMessages.get(noteId) || [];
  // Dedupe: skip if same content + role as last message
  const last = msgs[msgs.length - 1];
  if (last && last.role === msg.role && last.content === msg.content) return;
  msgs.push(msg);
  noteMessages.set(noteId, msgs);
}

// ============================================================================
// CUSTOM MCP TOOLS — thin bridge between agent and UI
// ============================================================================

type EventPusher = (event: ConceptNoteEvent) => void;

// Per-noteId push function registry — avoids the global mutable problem
// When V2 sessions persist across requests, each new request swaps the push function for its noteId
const pushEventRegistry = new Map<string, EventPusher>();

function setActivePushEvent(noteId: string, pusher: EventPusher) {
  pushEventRegistry.set(noteId, pusher);
}

function createConceptNoteToolsForSdk(noteId: string) {
  if (!sdkTool || !sdkCreateMcpServer) return null;

  // Tools resolve the push function at call time (not creation time)
  // so it always uses the current request's SSE writer
  const pushEvent = (event: ConceptNoteEvent) => {
    if (event.type === 'field_update') console.log(`[concept-note] tool: update_section ${event.sectionId}.${event.field}`);
    if (event.type === 'phase_change') console.log(`[concept-note] tool: set_phase ${event.phase}`);
    if (event.type === 'ask_user') console.log(`[concept-note] tool: ask_user "${(event as any).question?.slice(0, 50)}..."`);
    const activePusher = pushEventRegistry.get(noteId);
    if (activePusher) activePusher(event);
    else console.warn(`[concept-note] No active push function for ${noteId}`);
  };

  const updateSection = sdkTool(
    "update_section",
    "Update a field in the concept note. The change appears in the user's document panel in real-time.",
    {
      sectionId: z.string().describe("Section ID, e.g. 'territorial_context'"),
      field: z.string().describe("Field name, e.g. 'description'"),
      value: z.string().describe("Content to set (Portuguese for concept note content)"),
      confidence: z.enum(["high", "medium", "low"]).default("medium"),
      source: z.string().optional().describe("Knowledge file source"),
    },
    async (args: any) => {
      const state = getConceptNoteState(noteId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: note not found" }], isError: true };
      const section = state.sections[args.sectionId as keyof typeof state.sections];
      if (!section) return { content: [{ type: "text" as const, text: `Unknown section: ${args.sectionId}` }], isError: true };

      const oldValue = section.fields[args.field]?.value ?? null;
      section.fields[args.field] = { value: args.value, confidence: args.confidence as Confidence, source: args.source, userEdited: false };
      section.lastUpdatedBy = 'agent';
      section.confidence = args.confidence as Confidence;
      if (args.source && !section.sources.includes(args.source)) section.sources.push(args.source);
      state.editLog.push({ timestamp: new Date().toISOString(), sectionId: args.sectionId, field: args.field, oldValue, newValue: args.value, source: 'agent' });
      setConceptNoteState(noteId, state);

      pushEvent({ type: 'field_update', sectionId: args.sectionId, field: args.field, value: args.value, confidence: args.confidence as Confidence, source: args.source });
      return { content: [{ type: "text" as const, text: `Updated ${args.sectionId}.${args.field}` }] };
    },
    { annotations: { readOnlyHint: false, destructiveHint: false } }
  );

  const flagGap = sdkTool(
    "flag_gap",
    "Flag a gap — missing field, weak evidence, or incomplete section.",
    { sectionId: z.string(), field: z.string(), reason: z.string(), severity: z.enum(["critical", "important", "minor"]).default("important") },
    async (args: any) => {
      const state = getConceptNoteState(noteId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: note not found" }], isError: true };
      state.gaps.push({ sectionId: args.sectionId as any, field: args.field, reason: args.reason, severity: args.severity as any });
      setConceptNoteState(noteId, state);
      pushEvent({ type: 'gap', sectionId: args.sectionId, field: args.field, reason: args.reason, severity: args.severity });
      return { content: [{ type: "text" as const, text: `Gap: ${args.sectionId}.${args.field}` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  const setPhase = sdkTool(
    "set_phase",
    "Advance the interview phase. Updates the progress indicator.",
    { phase: z.number().min(0).max(10) },
    async (args: any) => {
      const state = getConceptNoteState(noteId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: note not found" }], isError: true };
      state.phase = args.phase;
      setConceptNoteState(noteId, state);
      pushEvent({ type: 'phase_change', phase: args.phase });
      return { content: [{ type: "text" as const, text: `Phase ${args.phase}` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  const askUser = sdkTool(
    "ask_user",
    "Present multiple-choice questions to the user. The UI renders interactive buttons. ALWAYS batch ALL questions for the current phase in a SINGLE call. Include relatedSections to highlight which document sections the user should review when answering.",
    {
      questions: z.array(z.object({
        question: z.string().describe("Question text"),
        options: z.array(z.object({
          label: z.string(),
          description: z.string().optional(),
          recommended: z.boolean().optional(),
        })),
        relatedSections: z.array(z.string()).optional().describe("Section IDs to highlight in the document panel"),
        showMap: z.boolean().optional().describe("Set true for spatial questions — the UI switches to an interactive map where the user can click zones to select areas"),
      })).describe("Array of questions — batch ALL phase questions here"),
    },
    async (args: any) => {
      const questions = args.questions || [];
      for (const q of questions) {
        pushEvent({ type: 'ask_user', question: q.question, options: q.options || [], relatedSections: q.relatedSections, showMap: q.showMap });
      }
      return { content: [{ type: "text" as const, text: `${questions.length} question(s) presented. STOP and wait for ALL answers. The user will respond with their selections.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  return sdkCreateMcpServer({
    name: "concept_note",
    version: "1.0.0",
    tools: [updateSection, flagGap, setPhase, askUser],
  });
}

// MCP server cache — created once per noteId, reused across turns
const mcpServers = new Map<string, any>();

function getMcpServer(noteId: string) {
  if (!mcpServers.has(noteId)) {
    const server = createConceptNoteToolsForSdk(noteId);
    if (server) mcpServers.set(noteId, server);
    return server;
  }
  return mcpServers.get(noteId);
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function streamConceptNoteChat(
  noteId: string,
  userMessage: string,
  res: Response,
  state: ConceptNoteState,
) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Note-Id", noteId);

  const pushEvent = (event: ConceptNoteEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'chat') {
      // Detect narration/thinking on server side so persisted messages have correct type
      const text = event.content;
      const isNarration = /^(Let me |Good[,. —]|Now let|Starting |I'll |I can see|I've |I have |Reading |Loading |Setting up|Creating |Checking |Moving to |Knowledge |The note |Proceed|Phase \d|Municipality |All |Porto Alegre)/i.test(text.trim())
        || (text.length < 300 && !text.includes('##') && !text.includes('**') && !/\d\.\s/.test(text));
      const msgType = event.messageType || (isNarration ? 'thinking' : 'content');
      addMessage(noteId, { role: 'assistant', content: text, messageType: msgType, timestamp: new Date().toISOString() });
    } else if (event.type === 'chat_thinking') {
      addMessage(noteId, { role: 'assistant', content: event.content, messageType: 'thinking', timestamp: new Date().toISOString() });
    }
  };

  // Register this request's push function for the noteId
  setActivePushEvent(noteId, pushEvent);

  const isSdkReady = await loadSdk();

  // V2 persistent sessions are the primary path (fastest)
  // Set V2_SESSIONS=0 env var to disable and fall back to V1
  const useV2 = sdkV2Available && process.env.V2_SESSIONS !== '0';
  if (isSdkReady && useV2) {
    await streamWithV2Session(noteId, userMessage, state, pushEvent);
  } else if (isSdkReady) {
    await streamWithV1Continue(noteId, userMessage, state, pushEvent);
  } else {
    await streamWithAnthropicApi(noteId, userMessage, state, pushEvent);
  }

  res.end();
}

// ============================================================================
// PATH A: V2 Persistent Session (fastest — no subprocess restart between turns)
// ============================================================================

async function streamWithV2Session(
  noteId: string,
  userMessage: string,
  state: ConceptNoteState,
  pushEvent: EventPusher,
) {
  try {
    let session = activeSessions.get(noteId);
    const isFirstTurn = !session;

    if (!session) {
      console.log(`[concept-note] V2 creating session for ${noteId}...`);
      const mcpServer = getMcpServer(noteId);

      // Create session with timeout — if it takes > 30s, fall back to V1
      const sessionPromise = new Promise<any>((resolve, reject) => {
        try {
          const s = sdkCreateSession({
            model: "claude-opus-4-6",
            cwd: process.cwd(),
            allowedTools: [
              "Read", "Glob", "Grep",
              "mcp__concept_note__update_section",
              "mcp__concept_note__flag_gap",
              "mcp__concept_note__set_phase",
              "mcp__concept_note__ask_user",
            ],
            mcpServers: mcpServer ? { concept_note: mcpServer } : {},
            permissionMode: "bypassPermissions",
            // No settingSources — we embed the system prompt directly
          });
          resolve(s);
        } catch (e) {
          reject(e);
        }
      });

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("V2 session creation timed out after 30s")), 30000)
      );

      session = await Promise.race([sessionPromise, timeout]);
      activeSessions.set(noteId, session);
      sessionIsFirstTurn.set(noteId, true);
      console.log(`[concept-note] V2 session created for ${noteId}`);
    }

    const prompt = sessionIsFirstTurn.get(noteId)
      ? `${buildSystemContext(state)}\n\nUser message: ${userMessage}`
      : userMessage;

    sessionIsFirstTurn.set(noteId, false);
    console.log(`[concept-note] V2 ${isFirstTurn ? 'first turn' : 'continue'} for ${noteId}`);

    await session.send(prompt);

    for await (const message of session.stream()) {
      processSDKMessage(message, pushEvent);
    }
  } catch (error: any) {
    console.error("[concept-note] V2 error:", error.message, "— falling back to V1");
    // Clean up failed session
    const session = activeSessions.get(noteId);
    if (session && typeof session.close === 'function') {
      try { session.close(); } catch {}
    }
    activeSessions.delete(noteId);
    sessionIsFirstTurn.delete(noteId);
    await streamWithV1Continue(noteId, userMessage, state, pushEvent);
  }
}

// ============================================================================
// PATH B: V1 with continue: true (stable fallback — resumes most recent session)
// ============================================================================

async function streamWithV1Continue(
  noteId: string,
  userMessage: string,
  state: ConceptNoteState,
  pushEvent: EventPusher,
) {
  const mcpServer = getMcpServer(noteId);
  const isFirstTurn = !activeSessions.has(noteId);

  const prompt = isFirstTurn
    ? `${buildSystemContext(state)}\n\nUser message: ${userMessage}`
    : userMessage;

  console.log(`[concept-note] V1 ${isFirstTurn ? 'new session' : 'continue'} for ${noteId}`);

  try {
    for await (const message of sdkQuery({
      prompt,
      options: {
        cwd: process.cwd(),
        settingSources: ['project'],
        allowedTools: [
          "Read", "Glob", "Grep",
          "mcp__concept_note__update_section",
          "mcp__concept_note__flag_gap",
          "mcp__concept_note__set_phase",
          "mcp__concept_note__ask_user",
        ],
        mcpServers: mcpServer ? { concept_note: mcpServer } : {},
        ...(isFirstTurn ? {} : { continue: true }),
        permissionMode: "bypassPermissions",
      },
    })) {
      // Capture session for continue
      if ('session_id' in message && message.session_id) {
        activeSessions.set(noteId, message.session_id);
      }
      processSDKMessage(message, pushEvent);
    }
  } catch (error: any) {
    pushEvent({ type: 'error', message: error.message || 'Agent SDK error' });
  }
}

// Shared message processor for V1 and V2
function processSDKMessage(message: any, pushEvent: EventPusher) {
  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if (block.type === "text" && block.text) {
        pushEvent({ type: 'chat', content: block.text, role: 'assistant' });
      }
    }
  }

  if (message.type === "result") {
    if (message.subtype === "success" && message.result) {
      pushEvent({ type: 'chat', content: message.result, role: 'assistant' });
    }
    pushEvent({ type: 'done', summary: 'Response complete' });
  }
}

// ============================================================================
// PATH C: Direct Anthropic API fallback
// ============================================================================

async function streamWithAnthropicApi(
  noteId: string,
  userMessage: string,
  state: ConceptNoteState,
  pushEvent: EventPusher,
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    pushEvent({ type: 'error', message: 'ANTHROPIC_API_KEY not set.' });
    return;
  }

  const systemContext = buildSystemContext(state);
  const knowledgeContext = await loadKnowledgeContext(state.city);

  const tools = [
    { name: "read_knowledge", description: "Read a knowledge file.", input_schema: { type: "object" as const, properties: { folder: { type: "string" }, file: { type: "string" } }, required: ["folder", "file"] } },
    { name: "update_section", description: "Update a concept note field.", input_schema: { type: "object" as const, properties: { sectionId: { type: "string" }, field: { type: "string" }, value: { type: "string" }, confidence: { type: "string", enum: ["high", "medium", "low"] }, source: { type: "string" } }, required: ["sectionId", "field", "value"] } },
    { name: "flag_gap", description: "Flag a gap.", input_schema: { type: "object" as const, properties: { sectionId: { type: "string" }, field: { type: "string" }, reason: { type: "string" }, severity: { type: "string", enum: ["critical", "important", "minor"] } }, required: ["sectionId", "field", "reason"] } },
    { name: "set_phase", description: "Advance phase.", input_schema: { type: "object" as const, properties: { phase: { type: "number" } }, required: ["phase"] } },
    { name: "ask_user", description: "Present multiple-choice questions. Batch ALL phase questions in ONE call.", input_schema: { type: "object" as const, properties: { questions: { type: "array", items: { type: "object", properties: { question: { type: "string" }, options: { type: "array", items: { type: "object", properties: { label: { type: "string" }, description: { type: "string" }, recommended: { type: "boolean" } }, required: ["label"] } }, relatedSections: { type: "array", items: { type: "string" } }, showMap: { type: "boolean", description: "Set true for spatial/zone selection questions" } }, required: ["question", "options"] } } }, required: ["questions"] } },
  ];

  const messages: Array<{ role: string; content: any }> = [{ role: "user", content: userMessage }];

  try {
    let continueLoop = true;
    while (continueLoop) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 8192, system: `${systemContext}\n\n## Knowledge Base Context\n${knowledgeContext}`, tools, messages }),
      });

      if (!response.ok) {
        pushEvent({ type: 'error', message: `API error ${response.status}: ${await response.text()}` });
        return;
      }

      const data: any = await response.json();
      const assistantContent: any[] = [];

      for (const block of data.content) {
        if (block.type === "text") {
          pushEvent({ type: 'chat', content: block.text, role: 'assistant' });
          assistantContent.push(block);
        }
        if (block.type === "tool_use") {
          assistantContent.push(block);
          if (block.name !== 'ask_user') {
            const stepId = `tool_${block.id || Date.now()}`;
            const stepLabel = formatToolStepLabel(block.name, block.input);
            pushEvent({ type: 'thinking_step', step: { id: stepId, label: stepLabel, status: 'active' } });
          }
          const toolResult = handleToolCall(noteId, block.name, block.input, pushEvent);
          if (block.name !== 'ask_user') {
            const stepId = `tool_${block.id || Date.now()}`;
            const stepLabel = formatToolStepLabel(block.name, block.input);
            pushEvent({ type: 'thinking_step', step: { id: stepId, label: stepLabel, status: 'complete' } });
          }
          messages.push({ role: "assistant", content: assistantContent.splice(0) });
          messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: block.id, content: toolResult }] });
        }
      }

      if (assistantContent.length > 0) messages.push({ role: "assistant", content: assistantContent });
      continueLoop = data.stop_reason === "tool_use";
    }

    pushEvent({ type: 'done', summary: 'Response complete' });
  } catch (error: any) {
    pushEvent({ type: 'error', message: error.message || 'API error' });
  }
}

// ============================================================================
// SHARED HELPERS
// ============================================================================

function handleToolCall(noteId: string, toolName: string, input: any, pushEvent: EventPusher): string {
  const state = getConceptNoteState(noteId);
  if (!state) return "Error: note not found";

  if (toolName === "read_knowledge") {
    const fs = require('fs');
    const path = require('path');
    try {
      const content = fs.readFileSync(path.join(process.cwd(), 'knowledge', input.folder, input.file), 'utf-8');
      return content.length > 4000 ? content.slice(0, 4000) + '\n...(truncated)' : content;
    } catch { return `Error: file not found at knowledge/${input.folder}/${input.file}`; }
  }

  if (toolName === "update_section") {
    const section = state.sections[input.sectionId as keyof typeof state.sections];
    if (!section) return `Unknown section: ${input.sectionId}`;
    section.fields[input.field] = { value: input.value, confidence: (input.confidence || 'medium') as Confidence, source: input.source, userEdited: false };
    section.lastUpdatedBy = 'agent';
    section.confidence = (input.confidence || 'medium') as Confidence;
    if (input.source && !section.sources.includes(input.source)) section.sources.push(input.source);
    setConceptNoteState(noteId, state);
    pushEvent({ type: 'field_update', sectionId: input.sectionId, field: input.field, value: input.value, confidence: (input.confidence || 'medium') as Confidence, source: input.source });
    return `Updated ${input.sectionId}.${input.field}`;
  }

  if (toolName === "flag_gap") {
    state.gaps.push({ sectionId: input.sectionId, field: input.field, reason: input.reason, severity: input.severity || 'important' });
    setConceptNoteState(noteId, state);
    pushEvent({ type: 'gap', sectionId: input.sectionId, field: input.field, reason: input.reason, severity: input.severity || 'important' });
    return `Gap flagged: ${input.sectionId}.${input.field}`;
  }

  if (toolName === "set_phase") {
    state.phase = input.phase;
    setConceptNoteState(noteId, state);
    pushEvent({ type: 'phase_change', phase: input.phase });
    return `Phase ${input.phase}`;
  }

  if (toolName === "ask_user") {
    const questions = input.questions || [{ question: input.question, options: input.options, relatedSections: input.relatedSections, showMap: input.showMap }];
    for (const q of questions) {
      if (q?.question) {
        pushEvent({ type: 'ask_user', question: q.question, options: q.options || [], relatedSections: q.relatedSections, showMap: q.showMap });
      }
    }
    return `${questions.length} question(s) shown. STOP and wait for ALL answers.`;
  }

  return `Unknown tool: ${toolName}`;
}

function formatToolStepLabel(toolName: string, input: any): string {
  switch (toolName) {
    case 'read_knowledge': return `Reading ${input.folder}/${input.file}`;
    case 'update_section': return `Filling ${input.sectionId} → ${input.field}`;
    case 'flag_gap': return `Flagging gap in ${input.sectionId}`;
    case 'set_phase': return `Phase ${input.phase}`;
    default: return `Running ${toolName}`;
  }
}

function buildSystemContext(state: ConceptNoteState): string {
  return `You are the NBS Concept Note assistant. You help build a BPJP/C40 concept note for ${state.city}.
Current phase: ${state.phase}. Project: ${state.metadata.projectName || '(not set)'}.

## CRITICAL RULES — FOLLOW EXACTLY

1. **ALWAYS use update_section** to fill document fields. Every piece of data goes into a section field.
2. **ALWAYS use ask_user** for questions. NEVER write questions as text.
3. **ALWAYS use set_phase** when moving to a new phase.
4. Use English for chat. Portuguese for update_section content only.
5. Do NOT re-read files already in context.
6. Keep chat messages SHORT — the document panel shows the details.

## REQUIRED FLOW PER PHASE

For EVERY phase, you MUST:
1. Call set_phase(N) to advance
2. Call update_section for EACH field you can auto-fill from knowledge
3. Call ask_user for decisions that need user input
4. After user answers, call update_section with the chosen values

## PHASE GUIDE

Phase 1 (sections project_id, proponent):
- Auto-fill: municipalities, state from city profile
- Call ask_user ONCE with ALL 4 questions: sector, adaptation/mitigation, project name, proponent
- After user responds, update_section for each answer

Phase 2 (sections territorial_context, problem_diagnosis, general_objective):
- Auto-fill: territorial context from climate-risks + city-profile
- Auto-fill: problem diagnosis from climate-risks + baseline-data
- Ask: scope refinement, validate diagnosis, strategic objective
- Then update_section with answers

Phase 3 (sections specific_objectives, indicators, solution_description):
- Auto-fill: intervention descriptions from knowledge
- Ask: interventions, scale, maturity, prior history
- Then update_section with answers

Phase 4 (sections climate_benefits, economic_social_benefits, inclusive_action):
- Auto-fill: CO2, flood, heat benefits from co-benefits knowledge
- Ask: validate benefits, vulnerable communities
- Then update_section with answers

Phase 5 (sections institutional_arrangement, technical_capacity, political_support, plan_alignment):
- Auto-fill: stakeholders, plans from knowledge
- Ask: institutional setup, political backing, plan alignment
- Then update_section with answers

Phase 6 (sections cost_detail, financial_sustainability, financing_need):
- Auto-fill: cost estimates from intervention data
- Ask: validate costs, budget availability
- Then update_section with answers

Phase 7 (sections risk_analysis, replicability):
- Auto-fill: risks from knowledge
- Ask: validate risks, land tenure
- Then update_section with answers

Phase 8 (sections technical_assistance, contact, supplementary):
- Ask: TA needs, timeline, contact
- Then update_section with answers

## Section IDs
${ALL_SECTION_IDS.join(', ')}

## IMPORTANT
- After the user answers EACH question, you MUST immediately call update_section to save their answers.
- For ask_user questions that ask the user to APPROVE or REVIEW content, ALWAYS include relatedSections listing the section IDs the user should look at. The UI auto-scrolls to those sections.
- Example: when asking "Approve the problem diagnosis?", set relatedSections: ["problem_diagnosis"]
- For spatial questions (territorial scope, zone selection, intervention areas), set showMap: true — the UI switches to an interactive map where the user clicks zones to select areas`;
}

async function loadKnowledgeContext(city: string): Promise<string> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const knowledgeDir = path.join(process.cwd(), 'knowledge');
  const chunks: string[] = [];

  const cityDir = path.join(knowledgeDir, city);
  try {
    const files = await fs.readdir(cityDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      try {
        const content = await fs.readFile(path.join(cityDir, file), 'utf-8');
        const truncated = content.length > 1500 ? content.slice(0, 1500) + '\n...(use read_knowledge for full)' : content;
        chunks.push(`### ${city}/${file}\n${truncated}`);
      } catch {}
    }
  } catch {}

  for (const folder of ['_interventions', '_co-benefits', '_financing-sources', '_evidence', '_success-cases']) {
    try {
      const files = await fs.readdir(path.join(knowledgeDir, folder));
      const mdFiles = files.filter((f: string) => f.endsWith('.md'));
      if (mdFiles.length > 0) chunks.push(`### Available in ${folder}/\n${mdFiles.map((f: string) => `- ${f}`).join('\n')}`);
    } catch {}
  }

  return chunks.join('\n\n---\n\n');
}

// ============================================================================
// USER EDIT HANDLER
// ============================================================================

export async function handleUserEdit(noteId: string, sectionId: string, field: string, newValue: string, res: Response) {
  const state = getConceptNoteState(noteId);
  if (!state) { res.status(404).json({ error: "Note not found" }); return; }

  const section = state.sections[sectionId as keyof typeof state.sections];
  if (!section) { res.status(400).json({ error: `Unknown section: ${sectionId}` }); return; }

  const oldValue = section.fields[field]?.value ?? null;
  section.fields[field] = { ...section.fields[field], value: newValue, userEdited: true };
  section.lastUpdatedBy = 'user';
  state.editLog.push({ timestamp: new Date().toISOString(), sectionId: sectionId as any, field, oldValue, newValue, source: 'user' });
  setConceptNoteState(noteId, state);

  const cascadePrompt = `The user edited ${sectionId}.${field} to: "${newValue}". Cascade updates to related sections. Do NOT override the user's edit.`;
  await streamConceptNoteChat(noteId, cascadePrompt, res, state);
}
