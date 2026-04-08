import type { Express, Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import {
  streamCboChat,
  handleCboEdit,
  getCboState,
  setCboState,
  getCboMessages,
  addCboMessage,
} from "../services/cboAgent";
import { createEmptyCboState, CBO_SECTIONS, type CboState } from "@shared/cbo-schema";

const RUNS_DIR = path.join(process.cwd(), 'knowledge', 'runs');

async function persistCboState(id: string) {
  const state = getCboState(id);
  const messages = getCboMessages(id);
  if (!state) return;
  const dir = path.join(RUNS_DIR, `cbo-${id}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify(state, null, 2));
    if (messages.length > 0) await fs.writeFile(path.join(dir, 'messages.json'), JSON.stringify(messages, null, 2));
  } catch {}
}

async function loadPersistedCboState(id: string): Promise<{ state: CboState; messages: any[] } | null> {
  const dir = path.join(RUNS_DIR, `cbo-${id}`);
  try {
    const state = JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf-8'));
    let messages: any[] = [];
    try { messages = JSON.parse(await fs.readFile(path.join(dir, 'messages.json'), 'utf-8')); } catch {}
    return { state, messages };
  } catch { return null; }
}

const saveTimers = new Map<string, NodeJS.Timeout>();
function debouncedPersist(id: string) {
  const existing = saveTimers.get(id);
  if (existing) clearTimeout(existing);
  saveTimers.set(id, setTimeout(() => { persistCboState(id); saveTimers.delete(id); }, 2000));
}

export function registerCboRoutes(app: Express): void {
  // Create new CBO session
  app.post("/api/cbo", async (req: Request, res: Response) => {
    const { city } = req.body;
    const state = createEmptyCboState(city || "porto-alegre");
    setCboState(state.id, state);
    debouncedPersist(state.id);
    res.json({ cboId: state.id, state });
  });

  // Get CBO state
  app.get("/api/cbo/:id", async (req: Request, res: Response) => {
    let state = getCboState(req.params.id);
    if (!state) {
      const persisted = await loadPersistedCboState(req.params.id);
      if (persisted) {
        setCboState(req.params.id, persisted.state);
        for (const msg of persisted.messages) addCboMessage(req.params.id, msg);
        state = persisted.state;
      }
    }
    if (!state) return res.status(404).json({ error: "Not found" });
    res.json({ state, cboId: req.params.id });
  });

  // Get messages
  app.get("/api/cbo/:id/messages", async (req: Request, res: Response) => {
    let messages = getCboMessages(req.params.id);
    if (messages.length === 0) {
      const persisted = await loadPersistedCboState(req.params.id);
      if (persisted?.messages.length) {
        for (const msg of persisted.messages) addCboMessage(req.params.id, msg);
        messages = persisted.messages;
      }
    }
    res.json(messages);
  });

  // Chat (SSE)
  app.post("/api/cbo/:id/chat", async (req: Request, res: Response) => {
    const { message, lang } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });

    let state = getCboState(req.params.id);
    if (!state) {
      const persisted = await loadPersistedCboState(req.params.id);
      if (persisted) { setCboState(req.params.id, persisted.state); state = persisted.state; }
    }
    if (!state) return res.status(404).json({ error: "Not found" });

    // Language: prefer explicit lang from UI picker, fall back to auto-detection
    const isPt = lang === 'pt' || (!lang && (
      /[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]/.test(message) ||
      /\b(sim|não|qual|como|quero|projeto|nossa|organização|comunidade)\b/i.test(message)
    ));
    const langDirective = isPt
      ? '\n[LANGUAGE: Respond in Portuguese. ask_user option labels in Portuguese. update_section content in Portuguese.]'
      : '\n[LANGUAGE: Respond in English. update_section content in Portuguese for Brazilian orgs.]';

    const resolvedLang = isPt ? 'pt' : 'en';
    addCboMessage(req.params.id, { role: 'user', content: message, messageType: 'content', timestamp: new Date().toISOString() });
    await streamCboChat(req.params.id, message + langDirective, res, state, resolvedLang);
    debouncedPersist(req.params.id);
  });

  // User edit
  app.post("/api/cbo/:id/edit", async (req: Request, res: Response) => {
    const { sectionId, field, value } = req.body;
    if (!sectionId || !field || value === undefined) return res.status(400).json({ error: "sectionId, field, value required" });
    await handleCboEdit(req.params.id, sectionId, field, value, res);
    debouncedPersist(req.params.id);
  });

  // Delete / restart
  app.delete("/api/cbo/:id", async (req: Request, res: Response) => {
    try { await fs.rm(path.join(RUNS_DIR, `cbo-${req.params.id}`), { recursive: true, force: true }); } catch {}
    setCboState(req.params.id, undefined as any);
    res.json({ deleted: true });
  });

  // Export
  app.get("/api/cbo/:id/export", async (req: Request, res: Response) => {
    const state = getCboState(req.params.id);
    if (!state) return res.status(404).json({ error: "Not found" });
    const md = exportCboMarkdown(state);
    res.setHeader("Content-Type", "text/markdown");
    res.setHeader("Content-Disposition", `attachment; filename="cbo-profile-${state.orgName || state.id}.md"`);
    res.send(md);
  });

  // Section registry
  app.get("/api/cbo-sections", async (_req: Request, res: Response) => {
    res.json(CBO_SECTIONS);
  });
}

function exportCboMarkdown(state: CboState): string {
  const lines = [
    `# CBO Intervention Profile — ${state.orgName || 'Unnamed Organization'}`,
    `> City: ${state.city} | Generated: ${new Date().toISOString()}`,
    '', '---', '',
  ];

  for (const sec of CBO_SECTIONS) {
    const section = state.sections[sec.id];
    lines.push(`## ${sec.title}`, '');
    const fields = Object.entries(section.fields);
    if (fields.length === 0) { lines.push('*(Not yet filled)*', ''); continue; }
    for (const [k, v] of fields) {
      if (v.value) { lines.push(`**${k.replace(/_/g, ' ')}**: ${v.value}`, ''); }
    }
    lines.push('---', '');
  }

  // Maturity scorecard
  if (state.maturityScores.length > 0) {
    lines.push('## Maturity Scorecard', '', `**Total: ${state.totalMaturityScore}/27**`, '');
    lines.push('| Metric | Score | Justification |', '|---|---|---|');
    for (const s of state.maturityScores) {
      lines.push(`| ${s.metric.replace(/_/g, ' ')} | ${'█'.repeat(s.score)}${'░'.repeat(3 - s.score)} ${s.score}/3 | ${s.justification} |`);
    }
    lines.push('');
  }

  if (state.priorityFlags.length > 0) {
    lines.push('## Priority Flags', '');
    for (const f of state.priorityFlags) {
      lines.push(`- ${f.met ? '✅' : '⬜'} ${f.flag}${f.notes ? ` — ${f.notes}` : ''}`);
    }
  }

  return lines.join('\n');
}
