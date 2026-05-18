import type { Express, Request, Response } from "express";
import {
  streamCboChat,
  handleCboEdit,
  getCboState,
  setCboState,
  getCboMessages,
  addCboMessage,
  debouncedPersist,
  loadCboFromDb,
} from "../services/cboAgent";
import { deleteCboState as dbDeleteCboState } from "../services/cboPersistence";
import { createEmptyCboState, CBO_SECTIONS, type CboState } from "@shared/cbo-schema";

// Shim — pre-DB code called this synchronous-style. Routes now await DB.
async function loadPersistedCboState(id: string): Promise<{ state: CboState; messages: any[] } | null> {
  return loadCboFromDb(id);
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

  // Seed from invite — when a CBO is part of a cohort, the orchestrator
  // already collected org name (and sometimes neighborhood) at invite time.
  // Re-asking on E1 is bad UX. This endpoint pre-fills those values into
  // the state so the agent confirms instead of asking. Idempotent: won't
  // overwrite fields the user has already edited.
  app.post("/api/cbo/:id/prefill", async (req: Request, res: Response) => {
    let state = getCboState(req.params.id);
    if (!state) {
      const persisted = await loadPersistedCboState(req.params.id);
      if (persisted) { setCboState(req.params.id, persisted.state); state = persisted.state; }
    }
    if (!state) return res.status(404).json({ error: "Not found" });

    const { orgName, neighborhood } = req.body ?? {};
    const orgProfile: any = state.sections.org_profile;
    if (!orgProfile) return res.status(500).json({ error: "org_profile section missing" });

    let changed = false;

    if (typeof orgName === 'string' && orgName.trim()) {
      const existing = orgProfile.fields?.org_name;
      // Don't overwrite if the user has already edited the name in chat or
      // inline. Source 'invite' lets the agent know the value came from the
      // orchestrator, not the user themselves — so it'll confirm.
      if (!existing || (!existing.userEdited && (!existing.value || existing.source === 'invite'))) {
        orgProfile.fields = orgProfile.fields || {};
        orgProfile.fields.org_name = { value: orgName.trim(), confidence: 'high', source: 'invite', userEdited: false };
        if (!state.orgName) state.orgName = orgName.trim();
        changed = true;
      }
    }

    if (typeof neighborhood === 'string' && neighborhood.trim()) {
      const existing = orgProfile.fields?.bairro_of_operation;
      if (!existing || (!existing.userEdited && (!existing.value || existing.source === 'invite'))) {
        orgProfile.fields = orgProfile.fields || {};
        orgProfile.fields.bairro_of_operation = { value: neighborhood.trim(), confidence: 'medium', source: 'invite', userEdited: false };
        changed = true;
      }
    }

    if (changed) {
      orgProfile.lastUpdatedBy = 'agent';
      setCboState(req.params.id, state);
      debouncedPersist(req.params.id);
    }

    res.json({ ok: true, changed, state });
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
    await dbDeleteCboState(req.params.id);
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
