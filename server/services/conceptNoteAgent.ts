import { z } from "zod";
import type { Response } from "express";
import {
  type ConceptNoteState,
  type ConceptNoteEvent,
  type Confidence,
  ALL_SECTION_IDS,
} from "@shared/concept-note-schema";

// Lazy-load the Claude Agent SDK — it requires the Claude Code CLI binary
// which may not be available on all environments (e.g., Replit)
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
    console.log("[concept-note] Claude Agent SDK loaded successfully");
    return true;
  } catch (e: any) {
    console.warn(`[concept-note] Claude Agent SDK not available: ${e.message}`);
    console.warn("[concept-note] Chat will use Anthropic API fallback");
    return false;
  }
}

// Try to load on startup (non-blocking)
loadSdk();

// In-memory state store (swap for DB in production)
const noteStates = new Map<string, ConceptNoteState>();

export function getConceptNoteState(noteId: string): ConceptNoteState | undefined {
  return noteStates.get(noteId);
}

export function setConceptNoteState(noteId: string, state: ConceptNoteState): void {
  state.metadata.updatedAt = new Date().toISOString();
  noteStates.set(noteId, state);
}

// ============================================================================
// CUSTOM MCP TOOLS — thin bridge between agent and UI
// ============================================================================

// Callback to push SSE events to the browser
type EventPusher = (event: ConceptNoteEvent) => void;

function createConceptNoteTools(noteId: string, pushEvent: EventPusher) {
  if (!sdkTool || !sdkCreateMcpServer) return null;

  const updateSection = sdkTool(
    "update_section",
    "Update a field in the concept note. The change appears in the user's document panel in real-time. Use this whenever you have content to fill in a section.",
    {
      sectionId: z.string().describe("Section ID from the template, e.g. 'territorial_context'"),
      field: z.string().describe("Field name within the section, e.g. 'description', 'capex_total', 'co2_reduction'"),
      value: z.string().describe("The content to set. Can be plain text, markdown, or a number as string."),
      confidence: z.enum(["high", "medium", "low"]).default("medium").describe("How confident this value is based on evidence"),
      source: z.string().optional().describe("Knowledge file that grounds this value, e.g. 'porto-alegre/climate-risks.md'"),
    },
    async (args) => {
      const state = getConceptNoteState(noteId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: note not found" }], isError: true };

      const section = state.sections[args.sectionId as keyof typeof state.sections];
      if (!section) return { content: [{ type: "text" as const, text: `Error: unknown section '${args.sectionId}'` }], isError: true };

      // Update state
      const oldValue = section.fields[args.field]?.value ?? null;
      section.fields[args.field] = {
        value: args.value,
        confidence: args.confidence as Confidence,
        source: args.source,
        userEdited: false,
      };
      section.lastUpdatedBy = 'agent';
      section.confidence = args.confidence as Confidence;
      if (args.source && !section.sources.includes(args.source)) {
        section.sources.push(args.source);
      }

      // Log edit
      state.editLog.push({
        timestamp: new Date().toISOString(),
        sectionId: args.sectionId as any,
        field: args.field,
        oldValue,
        newValue: args.value,
        source: 'agent',
      });

      setConceptNoteState(noteId, state);

      // Push to browser
      pushEvent({
        type: 'field_update',
        sectionId: args.sectionId,
        field: args.field,
        value: args.value,
        confidence: args.confidence as Confidence,
        source: args.source,
      });

      return { content: [{ type: "text" as const, text: `Updated ${args.sectionId}.${args.field} (${args.confidence} confidence)` }] };
    },
    { annotations: { readOnlyHint: false, destructiveHint: false } }
  );

  const flagGap = sdkTool(
    "flag_gap",
    "Flag a gap in the concept note — a missing field, weak evidence, or incomplete section. Shows a warning in the user's document panel.",
    {
      sectionId: z.string().describe("Section with the gap"),
      field: z.string().describe("Specific field that's missing or weak"),
      reason: z.string().describe("Why this is a gap and what data is needed"),
      severity: z.enum(["critical", "important", "minor"]).default("important"),
    },
    async (args) => {
      const state = getConceptNoteState(noteId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: note not found" }], isError: true };

      state.gaps.push({
        sectionId: args.sectionId as any,
        field: args.field,
        reason: args.reason,
        severity: args.severity as any,
      });
      setConceptNoteState(noteId, state);

      pushEvent({
        type: 'gap',
        sectionId: args.sectionId,
        field: args.field,
        reason: args.reason,
        severity: args.severity,
      });

      return { content: [{ type: "text" as const, text: `Flagged gap: ${args.sectionId}.${args.field} — ${args.reason}` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  const setPhase = sdkTool(
    "set_phase",
    "Advance the interview to a new phase. Updates the progress indicator in the UI.",
    {
      phase: z.number().min(0).max(10).describe("Phase number (0=setup, 1-8=interview phases, 9=gap analysis, 10=output)"),
    },
    async (args) => {
      const state = getConceptNoteState(noteId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: note not found" }], isError: true };

      state.phase = args.phase;
      setConceptNoteState(noteId, state);

      pushEvent({ type: 'phase_change', phase: args.phase });

      return { content: [{ type: "text" as const, text: `Phase set to ${args.phase}` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  return sdkCreateMcpServer({
    name: "concept_note",
    version: "1.0.0",
    tools: [updateSection, flagGap, setPhase],
  });
}

// ============================================================================
// AGENT SESSION — wraps Claude Agent SDK query()
// ============================================================================

// Track active sessions for resume
const activeSessions = new Map<string, string>(); // noteId → sessionId

export async function streamConceptNoteChat(
  noteId: string,
  userMessage: string,
  res: Response,
  state: ConceptNoteState,
) {
  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Note-Id", noteId);

  const pushEvent = (event: ConceptNoteEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const isSdkReady = await loadSdk();

  if (isSdkReady) {
    await streamWithAgentSdk(noteId, userMessage, state, pushEvent);
  } else {
    await streamWithAnthropicApi(noteId, userMessage, state, pushEvent);
  }

  res.end();
}

// Path A: Full Claude Agent SDK (same as Claude Code CLI)
async function streamWithAgentSdk(
  noteId: string,
  userMessage: string,
  state: ConceptNoteState,
  pushEvent: EventPusher,
) {
  const mcpServer = createConceptNoteTools(noteId, pushEvent);

  const systemContext = buildSystemContext(state);

  try {
    const sessionId = activeSessions.get(noteId);

    for await (const message of sdkQuery({
      prompt: `${systemContext}\n\nUser message: ${userMessage}`,
      options: {
        cwd: process.cwd(),
        settingSources: ['project'],
        allowedTools: [
          "Read", "Glob", "Grep",
          "mcp__concept_note__update_section",
          "mcp__concept_note__flag_gap",
          "mcp__concept_note__set_phase",
        ],
        mcpServers: mcpServer ? { concept_note: mcpServer } : {},
        ...(sessionId ? { resume: sessionId } : {}),
      },
    })) {
      if ('session_id' in message && message.session_id) {
        activeSessions.set(noteId, message.session_id as string);
      }

      if (message.type === "assistant" && 'message' in message) {
        const msg = message.message as any;
        if (msg?.content) {
          for (const block of msg.content) {
            if (block.type === "text" && block.text) {
              pushEvent({ type: 'chat', content: block.text, role: 'assistant' });
            }
          }
        }
      }

      if (message.type === "result") {
        const result = message as any;
        if (result.subtype === "success" && result.result) {
          pushEvent({ type: 'chat', content: result.result, role: 'assistant' });
        }
        pushEvent({ type: 'done', summary: 'Response complete' });
      }
    }
  } catch (error: any) {
    pushEvent({ type: 'error', message: error.message || 'Agent SDK error' });
  }
}

// Path B: Direct Anthropic API fallback (for Replit / environments without Claude Code CLI)
async function streamWithAnthropicApi(
  noteId: string,
  userMessage: string,
  state: ConceptNoteState,
  pushEvent: EventPusher,
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    pushEvent({ type: 'error', message: 'ANTHROPIC_API_KEY not set. Add it in Replit Secrets.' });
    return;
  }

  const systemContext = buildSystemContext(state);

  // Load knowledge files for context
  const knowledgeContext = await loadKnowledgeContext(state.city);

  const tools = [
    {
      name: "update_section",
      description: "Update a field in the concept note document.",
      input_schema: {
        type: "object" as const,
        properties: {
          sectionId: { type: "string", description: "Section ID, e.g. 'territorial_context'" },
          field: { type: "string", description: "Field name, e.g. 'description'" },
          value: { type: "string", description: "Content to set" },
          confidence: { type: "string", enum: ["high", "medium", "low"], description: "Evidence confidence" },
          source: { type: "string", description: "Knowledge file source" },
        },
        required: ["sectionId", "field", "value"],
      },
    },
    {
      name: "flag_gap",
      description: "Flag a gap in the concept note.",
      input_schema: {
        type: "object" as const,
        properties: {
          sectionId: { type: "string" },
          field: { type: "string" },
          reason: { type: "string" },
          severity: { type: "string", enum: ["critical", "important", "minor"] },
        },
        required: ["sectionId", "field", "reason"],
      },
    },
    {
      name: "set_phase",
      description: "Advance the interview to a new phase.",
      input_schema: {
        type: "object" as const,
        properties: {
          phase: { type: "number", description: "Phase 0-10" },
        },
        required: ["phase"],
      },
    },
  ];

  const messages: Array<{ role: string; content: any }> = [
    { role: "user", content: userMessage },
  ];

  try {
    // Agentic loop — keep calling until no more tool use
    let continueLoop = true;
    while (continueLoop) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          system: `${systemContext}\n\n## Knowledge Base Context\n${knowledgeContext}`,
          tools,
          messages,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        pushEvent({ type: 'error', message: `API error ${response.status}: ${err}` });
        return;
      }

      const data: any = await response.json();

      // Process response blocks
      const assistantContent: any[] = [];
      for (const block of data.content) {
        if (block.type === "text") {
          pushEvent({ type: 'chat', content: block.text, role: 'assistant' });
          assistantContent.push(block);
        }
        if (block.type === "tool_use") {
          assistantContent.push(block);
          const toolResult = handleToolCall(noteId, block.name, block.input, pushEvent);
          // Add assistant message + tool result to conversation
          messages.push({ role: "assistant", content: assistantContent.splice(0) });
          messages.push({
            role: "user",
            content: [{ type: "tool_result", tool_use_id: block.id, content: toolResult }],
          });
        }
      }

      // If there were remaining text blocks without tool use, add them
      if (assistantContent.length > 0) {
        messages.push({ role: "assistant", content: assistantContent });
      }

      continueLoop = data.stop_reason === "tool_use";
    }

    pushEvent({ type: 'done', summary: 'Response complete' });
  } catch (error: any) {
    pushEvent({ type: 'error', message: error.message || 'API error' });
  }
}

function handleToolCall(noteId: string, toolName: string, input: any, pushEvent: EventPusher): string {
  const state = getConceptNoteState(noteId);
  if (!state) return "Error: note not found";

  if (toolName === "update_section") {
    const section = state.sections[input.sectionId as keyof typeof state.sections];
    if (!section) return `Error: unknown section '${input.sectionId}'`;

    section.fields[input.field] = {
      value: input.value,
      confidence: (input.confidence || 'medium') as Confidence,
      source: input.source,
      userEdited: false,
    };
    section.lastUpdatedBy = 'agent';
    section.confidence = (input.confidence || 'medium') as Confidence;
    if (input.source && !section.sources.includes(input.source)) section.sources.push(input.source);
    setConceptNoteState(noteId, state);

    pushEvent({
      type: 'field_update',
      sectionId: input.sectionId,
      field: input.field,
      value: input.value,
      confidence: (input.confidence || 'medium') as Confidence,
      source: input.source,
    });
    return `Updated ${input.sectionId}.${input.field}`;
  }

  if (toolName === "flag_gap") {
    state.gaps.push({ sectionId: input.sectionId, field: input.field, reason: input.reason, severity: input.severity || 'important' });
    setConceptNoteState(noteId, state);
    pushEvent({ type: 'gap', sectionId: input.sectionId, field: input.field, reason: input.reason, severity: input.severity || 'important' });
    return `Flagged gap: ${input.sectionId}.${input.field}`;
  }

  if (toolName === "set_phase") {
    state.phase = input.phase;
    setConceptNoteState(noteId, state);
    pushEvent({ type: 'phase_change', phase: input.phase });
    return `Phase set to ${input.phase}`;
  }

  return `Unknown tool: ${toolName}`;
}

function buildSystemContext(state: ConceptNoteState): string {
  return `You are running inside the NBS Concept Note module.
The user is building a BPJP/C40 concept note for the city of ${state.city}.
Current phase: ${state.phase}.
Project name: ${state.metadata.projectName || '(not yet set)'}.

IMPORTANT: Use the update_section tool to fill concept note fields as you gather information.
Use flag_gap to mark sections that need more data.
Use set_phase to advance through the interview phases.

Available section IDs: ${ALL_SECTION_IDS.join(', ')}

Guide the user through an interview to build a complete BPJP concept note.
For each phase, auto-fill what you can from the knowledge context provided, then ask targeted questions for gaps.
Output is in Portuguese (matching the BPJP template). Questions can be in English.`;
}

// Load knowledge files as context for the API fallback
async function loadKnowledgeContext(city: string): Promise<string> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const knowledgeDir = path.join(process.cwd(), 'knowledge');
  const chunks: string[] = [];

  const folders = [`${city}`, '_interventions', '_co-benefits', '_financing-sources', '_evidence', '_success-cases'];

  for (const folder of folders) {
    const dirPath = path.join(knowledgeDir, folder);
    try {
      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        try {
          const content = await fs.readFile(path.join(dirPath, file), 'utf-8');
          // Truncate long files to keep context manageable
          const truncated = content.length > 2000 ? content.slice(0, 2000) + '\n...(truncated)' : content;
          chunks.push(`### ${folder}/${file}\n${truncated}`);
        } catch {}
      }
    } catch {}
  }

  return chunks.join('\n\n---\n\n');
}

// Handle user edits from the document panel
export async function handleUserEdit(
  noteId: string,
  sectionId: string,
  field: string,
  newValue: string,
  res: Response,
) {
  const state = getConceptNoteState(noteId);
  if (!state) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  const section = state.sections[sectionId as keyof typeof state.sections];
  if (!section) {
    res.status(400).json({ error: `Unknown section: ${sectionId}` });
    return;
  }

  const oldValue = section.fields[field]?.value ?? null;

  // Update the field
  section.fields[field] = {
    ...section.fields[field],
    value: newValue,
    userEdited: true,
  };
  section.lastUpdatedBy = 'user';

  state.editLog.push({
    timestamp: new Date().toISOString(),
    sectionId: sectionId as any,
    field,
    oldValue,
    newValue,
    source: 'user',
  });

  setConceptNoteState(noteId, state);

  // Send a cascade message to the agent
  const cascadePrompt = `[System: The user manually edited section "${sectionId}" field "${field}" from "${oldValue}" to "${newValue}". Analyze implications and cascade updates to related sections using update_section. Do NOT override the user's edit — treat it as a constraint. Explain what you changed and why.]`;

  // Stream the cascade response
  await streamConceptNoteChat(noteId, cascadePrompt, res, state);
}
