import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Response } from "express";
import {
  type ConceptNoteState,
  type ConceptNoteEvent,
  type Confidence,
  ALL_SECTION_IDS,
} from "@shared/concept-note-schema";

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
  const updateSection = tool(
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

  const flagGap = tool(
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

  const setPhase = tool(
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

  return createSdkMcpServer({
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

  // Create MCP server with tools that push to this SSE connection
  const mcpServer = createConceptNoteTools(noteId, pushEvent);

  // Build the prompt — include the skill instructions + current state context
  const systemContext = `You are running inside the NBS Concept Note module.
The user is building a BPJP/C40 concept note for the city of ${state.city}.
Current phase: ${state.phase}.
Project name: ${state.metadata.projectName || '(not yet set)'}.

IMPORTANT: Use the update_section tool to fill concept note fields as you gather information.
Use flag_gap to mark sections that need more data.
Use set_phase to advance through the interview phases.

The knowledge/ folder contains curated research data. Use Read and Glob to search it.
Key folders: knowledge/_interventions/, knowledge/_co-benefits/, knowledge/_financing-sources/, knowledge/_evidence/, knowledge/${state.city}/

Follow the interview flow from the concept-note skill in .claude/commands/concept-note.md.`;

  try {
    const sessionId = activeSessions.get(noteId);

    for await (const message of query({
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
        mcpServers: { concept_note: mcpServer },
        ...(sessionId ? { resume: sessionId } : {}),
      },
    })) {
      // Capture session ID for resume
      if ('session_id' in message && message.session_id) {
        activeSessions.set(noteId, message.session_id as string);
      }

      // Stream assistant text to chat panel
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

      // Final result
      if (message.type === "result") {
        const result = message as any;
        if (result.subtype === "success" && result.result) {
          pushEvent({ type: 'chat', content: result.result, role: 'assistant' });
        }
        pushEvent({ type: 'done', summary: 'Response complete' });
      }
    }
  } catch (error: any) {
    pushEvent({ type: 'error', message: error.message || 'Agent error' });
  }

  res.end();
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
