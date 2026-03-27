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
        showMap: z.boolean().optional().describe("Set true for spatial questions"),
        multiSelect: z.boolean().optional().describe("Set true when user can select multiple options (e.g., intervention types). Default is single-select."),
      })).describe("Array of questions — batch ALL phase questions here"),
    },
    async (args: any) => {
      const questions = args.questions || [];
      for (const q of questions) {
        pushEvent({ type: 'ask_user', question: q.question, options: q.options || [], relatedSections: q.relatedSections, showMap: q.showMap, multiSelect: q.multiSelect });
      }
      return { content: [{ type: "text" as const, text: `${questions.length} question(s) presented. STOP and wait for ALL answers. The user will respond with their selections.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  const readKnowledge = sdkTool(
    "read_knowledge",
    "Read a knowledge file for detailed data. Use when you need more information than what's in the city context. ONLY reads from the knowledge/ folder.",
    {
      folder: z.string().describe("Folder: porto-alegre, _interventions, _co-benefits, _financing-sources, _evidence, _success-cases, _inclusive-action"),
      file: z.string().describe("File name, e.g. 'urban-forests.md', 'climate-risks.md'"),
    },
    async (args: any) => {
      const fs = require('fs');
      const pathMod = require('path');
      const filePath = pathMod.join(process.cwd(), 'knowledge', args.folder, args.file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const body = content.replace(/^---[\s\S]*?---\s*/, ''); // strip frontmatter
        return { content: [{ type: "text" as const, text: body.length > 4000 ? body.slice(0, 4000) + '\n...(truncated)' : body }] };
      } catch {
        return { content: [{ type: "text" as const, text: `File not found: knowledge/${args.folder}/${args.file}` }], isError: true };
      }
    },
    { annotations: { readOnlyHint: true } }
  );

  return sdkCreateMcpServer({
    name: "concept_note",
    version: "1.0.0",
    tools: [updateSection, flagGap, setPhase, askUser, readKnowledge],
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

  // V1 with continue:true is the primary path — V2 doesn't support MCP tools yet
  // Set V2_SESSIONS=1 to opt-in to V2 when it supports mcpServers
  const useV2 = sdkV2Available && process.env.V2_SESSIONS === '1';
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
              "mcp__concept_note__read_knowledge",
            ],
            mcpServers: mcpServer ? { concept_note: mcpServer } : {},
            permissionMode: "bypassPermissions",
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

    const sysCtx = sessionIsFirstTurn.get(noteId) ? await buildSystemContext(state) : null;
    const prompt = sysCtx
      ? `${sysCtx}\n\nUser message: ${userMessage}`
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

  const sysCtx = isFirstTurn ? await buildSystemContext(state) : null;
  const prompt = sysCtx
    ? `${sysCtx}\n\nUser message: ${userMessage}`
    : userMessage;

  console.log(`[concept-note] V1 ${isFirstTurn ? 'new session' : 'continue'} for ${noteId}`);

  try {
    for await (const message of sdkQuery({
      prompt,
      options: {
        cwd: process.cwd(),
        allowedTools: [
          "Read", "Glob", "Grep",
          "mcp__concept_note__update_section",
          "mcp__concept_note__flag_gap",
          "mcp__concept_note__set_phase",
          "mcp__concept_note__ask_user",
          "mcp__concept_note__read_knowledge",
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
    // Don't re-send result text — it duplicates the last assistant message
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

  const systemContext = await buildSystemContext(state);
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
    const questions = input.questions || [{ question: input.question, options: input.options, relatedSections: input.relatedSections, showMap: input.showMap, multiSelect: input.multiSelect }];
    for (const q of questions) {
      if (q?.question) {
        pushEvent({ type: 'ask_user', question: q.question, options: q.options || [], relatedSections: q.relatedSections, showMap: q.showMap, multiSelect: q.multiSelect });
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

// Cache for pre-loaded content
const skillFileCache: { content: string | null; loaded: boolean } = { content: null, loaded: false };
const cityContextCache = new Map<string, string>();

async function loadSkillFile(): Promise<string> {
  if (skillFileCache.loaded) return skillFileCache.content || '';
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const content = await fs.readFile(path.join(process.cwd(), '.claude', 'commands', 'concept-note.md'), 'utf-8');
    skillFileCache.content = content;
    skillFileCache.loaded = true;
    console.log(`[concept-note] Skill file loaded: ${content.length} chars`);
    return content;
  } catch (e) {
    skillFileCache.loaded = true;
    console.warn('[concept-note] Could not load skill file');
    return '';
  }
}

async function loadCityContext(city: string): Promise<string> {
  if (cityContextCache.has(city)) return cityContextCache.get(city)!;

  const fs = await import('fs/promises');
  const path = await import('path');
  const knowledgeDir = path.join(process.cwd(), 'knowledge');
  const chunks: string[] = [];

  // Load city files (summaries for fast start)
  const cityDir = path.join(knowledgeDir, city);
  try {
    const files = await fs.readdir(cityDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      try {
        const content = await fs.readFile(path.join(cityDir, file), 'utf-8');
        const body = content.replace(/^---[\s\S]*?---\s*/, '');
        chunks.push(`### ${city}/${file}\n${body.slice(0, 2000)}`);
      } catch {}
    }
  } catch {}

  // List available knowledge files (agent can use read_knowledge to get full content)
  for (const folder of ['_interventions', '_co-benefits', '_financing-sources', '_evidence', '_success-cases', '_inclusive-action']) {
    try {
      const files = await fs.readdir(path.join(knowledgeDir, folder));
      const mdFiles = files.filter((f: string) => f.endsWith('.md'));
      if (mdFiles.length > 0) chunks.push(`### Available in ${folder}/\n${mdFiles.map((f: string) => `- ${f}`).join('\n')}`);
    } catch {}
  }

  const context = chunks.join('\n\n');
  cityContextCache.set(city, context);
  console.log(`[concept-note] City context for ${city}: ${context.length} chars`);
  return context;
}

async function buildSystemContext(state: ConceptNoteState): Promise<string> {
  const [skillContent, cityContext] = await Promise.all([
    loadSkillFile(),
    loadCityContext(state.city),
  ]);

  return `You are an expert NBS (Nature-Based Solutions) concept note advisor helping a city official prepare a BPJP/C40 concept note for ${state.city}.
Phase: ${state.phase}. Project: ${state.metadata.projectName || '(not set)'}.

## WHO YOU'RE HELPING

The user may be:
- A municipal secretary (needs guidance, may ask "what is NBS?")
- A political advisor (wants speed, may say "skip to costs")
- A technical expert (may challenge your data with better numbers)
- Any combination — adapt your tone and depth accordingly.

## YOUR TOOLS

1. **update_section(sectionId, field, value, confidence, source)** — fill a document field. The right panel updates in real-time. ALWAYS use this to save data.
2. **ask_user({questions: [...]})** — present multiple-choice questions. The UI renders clickable buttons. Use for key decisions.
3. **set_phase(phase)** — advance to next phase (0-10).
4. **flag_gap(sectionId, field, reason)** — mark missing data.
5. **read_knowledge(folder, file)** — read a knowledge file for detailed data. Use when the user asks about something not in the pre-loaded context, or when you need specific numbers for a later phase.

## HOW TO BEHAVE

### On first turn
Start immediately: set_phase(1) → auto-fill what you know → ask_user for decisions. No preamble, no exploring.

### Tool usage
- update_section for EVERY piece of data — the document panel only updates when you call it
- ask_user for decisions that need user input — the UI renders clickable buttons
- You can also chat naturally — not everything needs to be a tool call. If the user asks a question, answer it conversationally, then continue the flow.

### Language
- English for all chat messages and questions
- Portuguese for update_section content (the concept note is in Portuguese)

### When the user goes off-script
This is expected and good. Handle it:
- **"What is NBS?"** → Explain briefly using knowledge, then continue the flow
- **"Skip to costs"** → set_phase(6), auto-fill what you can, ask about costs
- **"Go back to scope"** → set_phase(2), show what's filled, ask what to change
- **"My numbers are different"** → Accept their data. Update the section with their numbers. Adjust confidence to "high" since it's user-provided. Recalculate dependent sections.
- **"What about neighborhood X?"** → Use read_knowledge or your city context to discuss it. If it's not in the data, say so and ask the user for details.
- **"Tell me more about Y"** → Use read_knowledge to get detailed data, explain it, then ask if they want to incorporate it.
- **"Compare options A and B"** → Present a brief comparison, then ask_user which they prefer.

### When the user provides data
When the user gives you specific numbers, names, or text:
- Use update_section immediately with their exact data
- Set confidence to "high" (user-provided data trumps knowledge base estimates)
- If it changes dependent sections, update those too and explain what changed

### Ask_user guidelines
- For approve/review questions: include relatedSections (UI auto-scrolls to the relevant section)
- For spatial/zone questions: include showMap: true (UI switches to interactive map)
- For questions where user can pick MULTIPLE answers (e.g., intervention types, risk factors, plan alignment): set multiSelect: true. UI shows checkboxes + "Confirm N selected" button.
- Batch related questions in ONE ask_user call when possible
- Always include a recommended option when the knowledge base points to a clear winner

### Pacing
- Default: follow the phase guide (1→2→3→...→8→gap analysis→output)
- If user is in a hurry: move faster, auto-fill more, ask fewer questions
- If user wants to explore: slow down, explain more, offer comparisons
- Let the user drive — if they want to jump around, follow them

## Section IDs
${ALL_SECTION_IDS.join(', ')}

## SKILL FLOW (default guide — adapt as needed)
${skillContent ? skillContent.slice(0, 5000) : ''}

## CITY KNOWLEDGE (pre-loaded)
${cityContext}

## AVAILABLE KNOWLEDGE FILES (use read_knowledge to access)
These files contain detailed data. Read them when you need specific numbers, evidence, or deeper context for a section.`;
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
