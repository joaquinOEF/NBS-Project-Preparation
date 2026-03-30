import type { Express, Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import {
  streamConceptNoteChat,
  handleUserEdit,
  getConceptNoteState,
  setConceptNoteState,
  getMessages,
  addMessage,
} from "../services/conceptNoteAgent";
import {
  createEmptyConceptNote,
  CONCEPT_NOTE_SECTIONS,
  type ConceptNoteState,
  type ChatMessage,
} from "@shared/concept-note-schema";

// ============================================================================
// FILESYSTEM PERSISTENCE
// ============================================================================

const RUNS_DIR = path.join(process.cwd(), 'knowledge', 'runs');

async function persistState(noteId: string) {
  const state = getConceptNoteState(noteId);
  const messages = getMessages(noteId);
  if (!state) return;

  const dir = path.join(RUNS_DIR, noteId);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify(state, null, 2));
    if (messages.length > 0) {
      await fs.writeFile(path.join(dir, 'messages.json'), JSON.stringify(messages, null, 2));
    }
  } catch (e: any) {
    console.warn(`[concept-note] Failed to persist state: ${e.message}`);
  }
}

async function loadPersistedState(noteId: string): Promise<{ state: ConceptNoteState; messages: ChatMessage[] } | null> {
  const dir = path.join(RUNS_DIR, noteId);
  try {
    const stateJson = await fs.readFile(path.join(dir, 'state.json'), 'utf-8');
    const state: ConceptNoteState = JSON.parse(stateJson);
    let messages: ChatMessage[] = [];
    try {
      const msgsJson = await fs.readFile(path.join(dir, 'messages.json'), 'utf-8');
      messages = JSON.parse(msgsJson);
    } catch {}
    return { state, messages };
  } catch {
    return null;
  }
}

// Debounced save — max once per 2 seconds per note
const saveTimers = new Map<string, NodeJS.Timeout>();
function debouncedPersist(noteId: string) {
  const existing = saveTimers.get(noteId);
  if (existing) clearTimeout(existing);
  saveTimers.set(noteId, setTimeout(() => {
    persistState(noteId);
    saveTimers.delete(noteId);
  }, 2000));
}

// ============================================================================
// ROUTES
// ============================================================================

export function registerConceptNoteRoutes(app: Express): void {
  // Create a new concept note session
  app.post("/api/concept-note", async (req: Request, res: Response) => {
    const { city, projectId } = req.body;
    if (!city) {
      return res.status(400).json({ error: "city is required" });
    }

    const state = createEmptyConceptNote(projectId || "sample-project", city);
    setConceptNoteState(state.id, state);
    debouncedPersist(state.id);

    res.json({ noteId: state.id, state });
  });

  // Get current concept note state (tries memory first, then filesystem)
  app.get("/api/concept-note/:noteId", async (req: Request, res: Response) => {
    let state = getConceptNoteState(req.params.noteId);

    if (!state) {
      // Try loading from filesystem
      const persisted = await loadPersistedState(req.params.noteId);
      if (persisted) {
        setConceptNoteState(req.params.noteId, persisted.state);
        // Restore messages
        for (const msg of persisted.messages) {
          addMessage(req.params.noteId, msg);
        }
        state = persisted.state;
      }
    }

    if (!state) {
      return res.status(404).json({ error: "Note not found" });
    }
    res.json({ state, noteId: req.params.noteId });
  });

  // Get saved messages for a session
  app.get("/api/concept-note/:noteId/messages", async (req: Request, res: Response) => {
    let messages = getMessages(req.params.noteId);

    if (messages.length === 0) {
      // Try loading from filesystem
      const persisted = await loadPersistedState(req.params.noteId);
      if (persisted && persisted.messages.length > 0) {
        for (const msg of persisted.messages) {
          addMessage(req.params.noteId, msg);
        }
        messages = persisted.messages;
      }
    }

    res.json(messages);
  });

  // Chat with the agent (SSE stream)
  app.post("/api/concept-note/:noteId/chat", async (req: Request, res: Response) => {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "message is required" });
    }

    let state = getConceptNoteState(req.params.noteId);
    if (!state) {
      // Try restoring
      const persisted = await loadPersistedState(req.params.noteId);
      if (persisted) {
        setConceptNoteState(req.params.noteId, persisted.state);
        state = persisted.state;
      }
    }
    if (!state) {
      return res.status(404).json({ error: "Note not found" });
    }

    // Detect language and append directive
    const isPortuguese = /[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]/.test(message) ||
      /\b(sim|não|qual|como|quero|projeto|cidade|obrigad|favor|pode|também)\b/i.test(message);
    const langDirective = isPortuguese
      ? '\n[LANGUAGE: Respond in Portuguese. Questions, options, explanations — all in Portuguese. Only use English for technical terms that have no good translation.]'
      : '\n[LANGUAGE: Respond in English. Questions, options, explanations — all in English. update_section content stays in Portuguese.]';
    const messageWithLang = message + langDirective;

    // Save user message (without the directive)
    addMessage(req.params.noteId, {
      role: 'user',
      content: message,
      messageType: 'content',
      timestamp: new Date().toISOString(),
    });

    await streamConceptNoteChat(req.params.noteId, messageWithLang, res, state);

    // Persist after response completes
    debouncedPersist(req.params.noteId);
  });

  // User edits a field from the document panel (triggers cascade via SSE)
  app.post("/api/concept-note/:noteId/edit", async (req: Request, res: Response) => {
    const { sectionId, field, value } = req.body;
    if (!sectionId || !field || value === undefined) {
      return res.status(400).json({ error: "sectionId, field, and value are required" });
    }

    await handleUserEdit(req.params.noteId, sectionId, field, value, res);
    debouncedPersist(req.params.noteId);
  });

  // Delete / restart a session
  app.delete("/api/concept-note/:noteId", async (req: Request, res: Response) => {
    const dir = path.join(RUNS_DIR, req.params.noteId);
    try { await fs.rm(dir, { recursive: true, force: true }); } catch {}
    // Clear from memory (the agent service handles this)
    setConceptNoteState(req.params.noteId, undefined as any);
    res.json({ deleted: true });
  });

  // Export concept note as markdown
  app.get("/api/concept-note/:noteId/export", async (req: Request, res: Response) => {
    const state = getConceptNoteState(req.params.noteId);
    if (!state) {
      return res.status(404).json({ error: "Note not found" });
    }

    const markdown = exportToMarkdown(state);
    res.setHeader("Content-Type", "text/markdown");
    res.setHeader("Content-Disposition", `attachment; filename="concept-note-${state.city}.md"`);
    res.send(markdown);
  });

  // Section registry
  app.get("/api/concept-note-sections", async (_req: Request, res: Response) => {
    res.json(CONCEPT_NOTE_SECTIONS);
  });
}

function exportToMarkdown(state: ConceptNoteState): string {
  const lines: string[] = [];
  lines.push(`# ${state.metadata.projectName || 'Concept Note'} — Nota Conceitual`);
  lines.push('');
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push(`> City: ${state.city}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const sec of CONCEPT_NOTE_SECTIONS) {
    const section = state.sections[sec.id];
    lines.push(`## ${sec.title}`);
    lines.push('');

    if (Object.keys(section.fields).length === 0) {
      lines.push('*(Not yet filled)*');
    } else {
      for (const [fieldName, field] of Object.entries(section.fields)) {
        if (field.value) {
          lines.push(`### ${fieldName.replace(/_/g, ' ')}`);
          lines.push('');
          lines.push(String(field.value));
          if (field.source) {
            lines.push('');
            lines.push(`> Source: ${field.source} (${field.confidence} confidence)`);
          }
          lines.push('');
        }
      }
    }

    const sectionGaps = state.gaps.filter(g => g.sectionId === sec.id);
    if (sectionGaps.length > 0) {
      lines.push('**Gaps:**');
      for (const gap of sectionGaps) {
        lines.push(`- ${gap.field}: ${gap.reason} (${gap.severity})`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  lines.push('## Metadata');
  lines.push('');
  lines.push(`- **Gaps identified**: ${state.gaps.length}`);
  lines.push(`- **Edits logged**: ${state.editLog.length}`);
  lines.push(`- **Current phase**: ${state.phase}/10`);
  lines.push(`- **Generated by**: NBS Concept Note Module`);

  return lines.join('\n');
}
