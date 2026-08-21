import type { Express, Request, Response } from "express";
import {
  streamCboChat,
  handleCboEdit,
  getCboState,
  setCboState,
  getCboMessages,
  addCboMessage,
  debouncedPersist,
  advanceCboPhase,
  loadCboFromDb,
  acquireTurn,
  endTurn,
  getFlushedMessageCount,
  hasPendingFlush,
} from "../services/cboAgent";
import {
  deleteCboState as dbDeleteCboState,
  loadCboState as dbLoadCboState,
  loadCboMessages as dbLoadCboMessages,
  resetMemberProgressForCboState,
} from "../services/cboPersistence";
import { clearMaturityTierForCboState } from "../services/orgPersistence";
import { createEmptyCboState, CBO_SECTIONS, isInternalCboField, type CboState } from "@shared/cbo-schema";
import { recordCboEvent, getFunnelSummary } from "../services/cboEvents";
import { cboFieldLabel, cboDisplayValue, CBO_SECTION_TITLES, CBO_PRIORITY_FLAG_LABELS } from "@shared/cbo-field-catalog";
import {
  listDocumentsForScope,
  getDocumentForScope,
  getOrgIdForCboState,
  toDocumentMeta,
} from "../services/documentPersistence";
import { getCohortLanguageForCbo } from "../services/cohortLanguage";
import { isPhaseSkipEnabled } from "../services/runtimeEnv";

// Shim — pre-DB code called this synchronous-style. Routes now await DB.
async function loadPersistedCboState(id: string): Promise<{ state: CboState; messages: any[] } | null> {
  return loadCboFromDb(id);
}

export function registerCboRoutes(app: Express): void {
  // Demo-only phase skipping (progress-bar segments become jump buttons and
  // the server honors [SKIP TO phase:X]) — the skip stamps sample data over
  // real answers. isPhaseSkipEnabled requires the flag AND a non-deployment
  // environment, so a secret shared with the Deployment can't enable it there.
  const phaseSkipEnabled = () => isPhaseSkipEnabled();

  // Create new CBO session
  app.post("/api/cbo", async (req: Request, res: Response) => {
    const { city } = req.body;
    const state = createEmptyCboState(city || "porto-alegre");
    setCboState(state.id, state);
    debouncedPersist(state.id);
    res.json({ cboId: state.id, state, phaseSkipEnabled: phaseSkipEnabled() });
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
    // Read-time phase-0 self-heal: sessions created during the 020fe0a7
    // rollback window finished E1 stranded at phase 0 (banner is gated to
    // phase >= 1). Lifting here means a plain reload immediately shows the
    // "Começar Encontro 2" card; the chat path lifts too (with a
    // phase_change event) for live sessions. See fake-E2 report 2026-07-08.
    if ((state.phase ?? 0) === 0) {
      state.phase = 1;
      setCboState(req.params.id, state);
      debouncedPersist(req.params.id);
      console.log(`[cbo] lifted ${req.params.id} from stranded phase 0 to phase 1 (read path)`);
    }
    res.json({ state, cboId: req.params.id, phaseSkipEnabled: phaseSkipEnabled() });
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

  // The CBO's own uploaded files (evidence locker) — powers the mobile
  // "Seus arquivos" bottom sheet. Open-by-UUID, consistent with the other
  // /api/cbo/:id/* routes (the client resolves the session from its token).
  app.get("/api/cbo/:id/documents", async (req: Request, res: Response) => {
    // Scope by the session itself (always reliable) + the org if it's linked,
    // so files show even when org_id hasn't been linked to the session yet.
    const orgId = await getOrgIdForCboState(req.params.id);
    const docs = await listDocumentsForScope({ cboStateId: req.params.id, orgId });
    res.json({ documents: docs.map(toDocumentMeta) });
  });

  app.get("/api/cbo/:id/documents/:docId/text", async (req: Request, res: Response) => {
    const orgId = await getOrgIdForCboState(req.params.id);
    const doc = await getDocumentForScope(req.params.docId, { cboStateId: req.params.id, orgId });
    if (!doc) return res.status(404).json({ error: "not found" });
    res.json({ fullText: doc.fullText ?? "", summary: doc.summary ?? null });
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

    // ⚠️ Serialize turns for this session — CBO-TURN-QUEUE in cboAgent.ts.
    // Acquired HERE, before anything below reads state or writes a transcript
    // row: a turn that had to wait must not resolve the session language from
    // a pre-wait handle, nor interleave its user message into the running
    // turn's messages. Still ahead of any SSE header, so the give-up case is a
    // clean JSON 409 rather than a half-open stream.
    if (!(await acquireTurn(req.params.id))) {
      return res.status(409).json({ error: 'turn_in_flight' });
    }
    try {
      // The turn we queued behind may have replaced the state object wholesale
      // (setCboState stores a new object), so re-read it instead of trusting
      // the handle taken before the wait.
      state = getCboState(req.params.id) ?? state;
      // The phase-0 self-heal AND the "vamos começar o encontro N" advance both
      // live in streamCboChat now, where they can emit phase_change — the client
      // must LEARN about server-side phase writes or the header/banner go stale
      // and users talk the model into a role-played encontro (fake-E2 field
      // report 2026-07-08; backlog CBO-PHASE-WRITERS). The regex path also runs
      // through advanceCboPhase there, the same gate as /advance-phase and the
      // set_phase tool, instead of a duplicated inline policy check. The GET
      // handler above lifts phase 0 too, so a plain reload shows the banner.

      // Session language authority (CBO-LANG-AUTH). If this CBO belongs to a
      // cohort with a coordinator-forced language, that ALWAYS wins — it overrides
      // the client-sent lang and text detection, so an English-looking org name, a
      // standalone/test fallback, or a pre-fetch race can't flip the agent to
      // English mid-flow. Only truly standalone CBOs (no cohort) fall through to
      // the legacy sticky behavior: an explicit UI pick, else the stored language,
      // else detect once from this first message.
      const cohortLang = await getCohortLanguageForCbo(req.params.id);
      let sessionLang: 'pt' | 'en';
      if (cohortLang) {
        sessionLang = cohortLang;
      } else if (lang === 'pt' || lang === 'en') {
        sessionLang = lang;
      } else if (state.metadata.language) {
        sessionLang = state.metadata.language;
      } else {
        sessionLang = (
          /[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]/.test(message) ||
          /\b(sim|não|qual|como|quero|projeto|nossa|organização|comunidade)\b/i.test(message)
        ) ? 'pt' : 'en';
      }
      if (state.metadata.language !== sessionLang) {
        state.metadata.language = sessionLang;
        setCboState(req.params.id, state);
      }
      const isPt = sessionLang === 'pt';
      const langDirective = isPt
        ? '\n[LANGUAGE: Respond ONLY in Portuguese — every single word, including ask_user option labels and update_section content. Do NOT mix in any English words or phrases, even if the user writes some English back. One language, Portuguese, with no exceptions.]'
        : '\n[LANGUAGE: Respond ONLY in English — every single word, including ask_user option labels and update_section content. Do NOT mix in any Portuguese words or phrases, even if the user writes some Portuguese back. One language, English, with no exceptions.]';

      const resolvedLang = sessionLang;
      // Client-declared turn kind ('chip' | 'text' | 'upload' | 'map' | 'system') —
      // a HINT for adaptive model routing. The server only ever *downgrades* to the
      // fast model when its own checks agree; a missing/bogus value routes heavy.
      const turnKind = typeof req.body.turnKind === 'string' ? req.body.turnKind : undefined;

      // A map_help turn's `message` is a machine payload — "[MAP HELP] hazard=flood
      // … #3c2c6c (0.104) → #4dc16b (0.62)" — that exists only so the agent reasons
      // from the real ramp instead of the usual green-is-safe convention. Persist
      // what the user actually asked, or the hex dump becomes the transcript on
      // reload and lands in buildDecisionLog forever.
      //
      // Scoped to map_help on purpose. `map` turns persist their raw payload too,
      // but the agent legitimately re-reads the H×E×V numbers out of the decision
      // log on later turns; swapping those for the summary is a separate change.
      const displayText = typeof req.body.displayText === 'string' ? req.body.displayText : undefined;
      // 'anchoring' joins map_help: its payload is machine text the agent
      // parses (`Lead: … | Volunteers: …`), so persisting it verbatim put an
      // English machine string in a pt-BR org's transcript, permanently.
      const persistedUserText = (turnKind === 'map_help' || turnKind === 'anchoring') && displayText ? displayText : message;
      addCboMessage(req.params.id, { role: 'user', content: persistedUserText, messageType: 'content', timestamp: new Date().toISOString() });

      // A chip turn also records WHICH answer went with WHICH question, as an
      // `answers` composer row. The plain user message above is untouched -
      // buildDecisionLog and resolveTurnModel both key off
      // `messageType === 'content'`, and the agent reads the joined text - so this
      // row is additive and invisible to the model. The transcript uses it to
      // render each question with the chip the user picked, instead of a single
      // "Associacao; 6-20" bubble hanging under two questions.
      //
      // It is a separate row, not a field on the ask_user row, because the message
      // log is append-only: the flusher persists `allMessages.slice(flushed)`, so
      // an in-place edit of an earlier row would never reach the database.
      const chipAnswers = req.body.chipAnswers;
      if (turnKind === 'chip' && Array.isArray(chipAnswers) && chipAnswers.length > 0) {
        const pairs = chipAnswers
          .filter((p: any) => p && typeof p.question === 'string' && typeof p.answer === 'string')
          .map((p: any) => ({ question: p.question, answer: p.answer }));
        if (pairs.length > 0) {
          addCboMessage(req.params.id, {
            role: 'user',
            content: JSON.stringify({ kind: 'answers', pairs }),
            messageType: 'composer',
            timestamp: new Date().toISOString(),
          });
        }
      }

      await streamCboChat(req.params.id, message + langDirective, res, state, resolvedLang, turnKind);
    } finally {
      endTurn(req.params.id);
    }
    debouncedPersist(req.params.id);
  });

  // Instant kickoff (W1 latency pack, P2). Turn 1 of E1 is 100% deterministic —
  // greeting + doc invite + invite-prefill confirmation + the name/role question —
  // so it is served from a template with ZERO model time instead of a 10-17s
  // SDK turn. The message persists as a normal assistant transcript message, so
  // the agent sees it in RECENT CONVERSATION on the user's first real answer
  // (the E1 skill knows not to re-greet). Fires only on a virgin transcript;
  // anything else no-ops and the client falls back to the model kickoff.
  app.post("/api/cbo/:id/kickoff", async (req: Request, res: Response) => {
    const state = getCboState(req.params.id);
    if (!state) return res.status(404).json({ error: "Not found" });
    const existing = getCboMessages(req.params.id).filter(m => m.messageType === 'content');
    if (existing.length > 0) return res.json({ ok: false, reason: 'already-started' });

    const cohortLang = await getCohortLanguageForCbo(req.params.id);
    const bodyLang = typeof req.body?.lang === 'string' ? req.body.lang : undefined;
    const resolved: 'pt' | 'en' = (cohortLang ?? (bodyLang === 'en' ? 'en' : 'pt')) as 'pt' | 'en';
    const isPt = resolved === 'pt';
    // Seed the sticky session language so the agent's first real turn can't
    // diverge from the greeting's language (adversarial-review catch: the
    // detection fallback could flip an unseeded standalone session).
    if (state.metadata.language !== resolved) {
      state.metadata.language = resolved;
      setCboState(req.params.id, state);
    }

    const org = (state.orgName || String(state.sections.org_profile?.fields?.org_name?.value || '')).trim();
    const bairro = String(state.sections.org_profile?.fields?.bairro_of_operation?.value || '').trim();

    // Copy mirrors the E1 skill's Step-0 lines verbatim — the skill and the
    // template must never drift apart in tone or content.
    let content: string;
    if (isPt) {
      const confirm = org
        ? `Conferindo: vocês são a **${org}**${bairro ? `, atuando no ${bairro}` : ''}, certo? Me corrige se eu errei. E com quem eu tô falando — seu nome e seu papel por aí?`
        : `Pra começar: qual é o nome da organização de vocês, e com quem eu tô falando — seu nome e seu papel por aí?`;
      content = `Oi! 👋 Eu vou te ajudar a montar o perfil da ${org || 'organização de vocês'} — leva uns 20 minutinhos, no seu ritmo.\n\n${confirm}`;
    } else {
      const confirm = org
        ? `Checking: you are **${org}**${bairro ? `, working in ${bairro}` : ''}, right? Correct me if I got it wrong. And who am I talking to — your name and your role?`
        : `To start: what is your organization's name, and who am I talking to — your name and your role?`;
      content = `Hi! 👋 I'll help you build ${org ? `${org}'s` : 'your organization\u2019s'} profile — about 20 minutes, at your pace.\n\n${confirm}`;
    }

    const msg = { role: 'assistant' as const, content, messageType: 'content' as const, timestamp: new Date().toISOString() };
    addCboMessage(req.params.id, msg);
    debouncedPersist(req.params.id);
    return res.json({ ok: true, message: msg });
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

  // Advance phase server-side (called by the Start-Next-Workshop banner).
  //
  // The CBO can't rely on the agent to call set_phase() when entering a new
  // encontro — without explicit instruction, the agent generated E2-flavored
  // text but left state.phase at 1, leaving the banner in a re-trigger loop.
  //
  // This endpoint advances state authoritatively, checking the P-8 gate so
  // CBOs can't skip past workshops the coordinator hasn't opened.
  app.post("/api/cbo/:id/advance-phase", async (req: Request, res: Response) => {
    // Ensure the state is in memory (hydrate from DB on a cold reconnect), then
    // delegate to the single phase-advance path (gate + set + durable flush)
    // shared with the agent's set_phase tool.
    if (!getCboState(req.params.id)) {
      const persisted = await loadPersistedCboState(req.params.id);
      if (persisted) setCboState(req.params.id, persisted.state);
    }
    const target = Number(req.body?.phase);
    const result = await advanceCboPhase(req.params.id, target);
    if (!result.ok) {
      if (result.reason === 'not_found') return res.status(404).json({ error: "Not found" });
      if (result.reason === 'range') return res.status(400).json({ error: "phase must be an integer 0-6" });
      return res.status(409).json({ error: "phase_locked", requestedPhase: target, unlockedPhases: result.unlockedPhases });
    }
    res.json({ ok: true, phase: result.phase, state: getCboState(req.params.id) });
  });

  // E2 hazard-tour position. The only client→state write that isn't a chat turn:
  // advancing the tour is a UI gesture, not something the agent should hear about.
  // Persisting it is what lets "Abrir o mapa" resume at the hazard the user left,
  // and survives both a reload and a cross-device resume of the token link.
  app.post("/api/cbo/:id/tour-progress", async (req: Request, res: Response) => {
    if (!getCboState(req.params.id)) {
      const persisted = await loadPersistedCboState(req.params.id);
      if (persisted) setCboState(req.params.id, persisted.state);
    }
    const state = getCboState(req.params.id);
    if (!state) return res.status(404).json({ error: "Not found" });

    const tourIdx = Number(req.body?.tourIdx);
    // 0-2 = touring that hazard; 3 = finished. Anything else is a client bug.
    if (!Number.isInteger(tourIdx) || tourIdx < 0 || tourIdx > 3) {
      return res.status(400).json({ error: "tourIdx must be an integer 0-3" });
    }
    // Only meaningful while the map is the open tool; refuse to invent one.
    if (state.activeTool?.kind !== 'map') {
      return res.status(409).json({ error: "map is not the active tool" });
    }

    state.activeTool = { ...state.activeTool, tourIdx };
    setCboState(req.params.id, state);
    debouncedPersist(req.params.id);
    res.json({ ok: true, tourIdx });
  });

  // User edit
  // Client-observed outcomes the server cannot see for itself — today only
  // whether a map actually rendered. Deliberately tiny and unauthenticated in
  // the same way the rest of the CBO capability-token surface is: it writes one
  // row to a telemetry table and returns nothing.
  // The funnel, as a request. This is the thing whose absence cost us six
  // weeks: drop-off per beat, and how often the map fails to appear.
  //
  // Deliberately NOT /api/cbo/_funnel — that sits under the "/api/cbo/:id"
  // GET registered above and would be served as an id lookup, which is how it
  // first failed here. Same shadowing trap as the tile routes.
  app.get("/api/cbo-funnel", async (_req: Request, res: Response) => {
    try {
      res.json(await getFunnelSummary());
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? String(e) });
    }
  });

  app.post("/api/cbo/:id/event", (req: Request, res: Response) => {
    const { name, step, outcome, detail, phase } = req.body ?? {};
    if (name !== 'map_render') return res.status(400).json({ error: 'unknown event' });
    recordCboEvent({
      cboStateId: req.params.id,
      name: 'map_render',
      phase: typeof phase === 'number' ? phase : null,
      step: typeof step === 'string' ? step.slice(0, 60) : null,
      outcome: outcome === 'failed' ? 'failed' : 'ok',
      detail: typeof detail === 'string' ? detail : null,
    });
    res.json({ ok: true });
  });

  app.post("/api/cbo/:id/edit", async (req: Request, res: Response) => {
    const { sectionId, field, value } = req.body;
    if (!sectionId || !field || value === undefined) return res.status(400).json({ error: "sectionId, field, value required" });
    await handleCboEdit(req.params.id, sectionId, field, value, res);
    debouncedPersist(req.params.id);
  });

  // Delete / restart. Run-derived member/org data (path, site, snapshots,
  // maturity tier) is cleared alongside the state itself — otherwise a
  // "recomeçar do zero" session inherits ghosts of the run being thrown away
  // (field report 2026-07-08: the E1 path answer survived a restart because
  // it lives on cohort_members). Both cleanups must run BEFORE the state row
  // is deleted: the tier clear resolves the org through cbo_states.orgId.
  app.delete("/api/cbo/:id", async (req: Request, res: Response) => {
    await clearMaturityTierForCboState(req.params.id).catch((e) =>
      console.error(`[cbo] clearMaturityTier(${req.params.id}) on delete failed`, e));
    await resetMemberProgressForCboState(req.params.id);
    await dbDeleteCboState(req.params.id);
    setCboState(req.params.id, undefined as any);
    res.json({ deleted: true });
  });

  // Diagnostic — compares the in-memory cache with the DB to verify the
  // persistence layer is healthy. Returns a JSON snapshot of both layers
  // plus a small consistency summary. Safe to leave in place (read-only,
  // no PII exposure beyond what the user already authored).
  app.get("/api/cbo/:id/_inspect", async (req: Request, res: Response) => {
    const id = req.params.id;

    // In-memory snapshot
    const memState = getCboState(id);
    const memMessages = getCboMessages(id);

    // DB snapshot
    const dbState = await dbLoadCboState(id);
    const dbMessages = await dbLoadCboMessages(id);

    // Section-fill summary — easier to scan than the full sections blob
    const summarizeFields = (state: any) => {
      if (!state?.sections) return {};
      const out: Record<string, string[]> = {};
      for (const [sid, sec] of Object.entries<any>(state.sections)) {
        const fields = Object.keys(sec.fields ?? {});
        if (fields.length > 0) out[sid] = fields;
      }
      return out;
    };

    const lastMsgs = (msgs: typeof memMessages, n = 5) => msgs.slice(-n).map(m => ({
      role: m.role,
      type: m.messageType,
      content: (m.content ?? '').slice(0, 160),
    }));

    res.json({
      id,
      memory: {
        hasState: !!memState,
        phase: memState?.phase ?? null,
        orgName: memState?.orgName ?? null,
        sectionsWithFields: summarizeFields(memState),
        maturityScoreCount: memState?.maturityScores?.length ?? 0,
        messageCount: memMessages.length,
        flushedSoFar: getFlushedMessageCount(id),
        unflushedDelta: Math.max(0, memMessages.length - getFlushedMessageCount(id)),
        hasPendingFlush: hasPendingFlush(id),
        lastMessages: lastMsgs(memMessages),
      },
      db: {
        hasState: !!dbState,
        phase: dbState?.phase ?? null,
        orgName: dbState?.orgName ?? null,
        sectionsWithFields: summarizeFields(dbState),
        maturityScoreCount: dbState?.maturityScores?.length ?? 0,
        messageCount: dbMessages.length,
        lastMessages: lastMsgs(dbMessages),
      },
      consistency: {
        statesMatch: memState && dbState
          ? memState.phase === dbState.phase && memState.orgName === dbState.orgName
          : !memState && !dbState,
        messagesMatch: memMessages.length === dbMessages.length,
        flushedPointerAligned: getFlushedMessageCount(id) === dbMessages.length,
      },
      timestamp: new Date().toISOString(),
    });
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

/**
 * The org's own document, downloaded. It was English end to end — headings,
 * section titles, humanized field keys, raw enum ids — for a cohort that works
 * in Portuguese (JVP, 2026-08-06). Same catalog the panel uses, so the file and
 * the screen say the same words.
 *
 * It also dumped the `_`-prefixed internals (`_depth_json`, `_reco_json`) as
 * raw JSON blobs into the middle of the profile; those are machinery, hidden
 * everywhere else by isInternalCboField.
 */
function exportCboMarkdown(state: CboState): string {
  const lang: 'pt' | 'en' = state.metadata?.language === 'en' ? 'en' : 'pt';
  const isPt = lang === 'pt';
  const T = isPt
    ? { title: 'Perfil de Intervenção Comunitária', city: 'Cidade', gen: 'Gerado em',
        empty: '*(Ainda não preenchido)*', unnamed: 'Organização sem nome',
        scorecard: 'Placar de Maturidade', total: 'Total',
        cols: '| Métrica | Nota | Justificativa |', flags: 'Prioridades' }
    : { title: 'CBO Intervention Profile', city: 'City', gen: 'Generated',
        empty: '*(Not yet filled)*', unnamed: 'Unnamed Organization',
        scorecard: 'Maturity Scorecard', total: 'Total',
        cols: '| Metric | Score | Justification |', flags: 'Priority Flags' };

  const lines = [
    `# ${T.title} — ${state.orgName || T.unnamed}`,
    `> ${T.city}: ${state.city} | ${T.gen}: ${new Date().toISOString()}`,
    '', '---', '',
  ];

  for (const sec of CBO_SECTIONS) {
    const section = state.sections[sec.id];
    lines.push(`## ${CBO_SECTION_TITLES[sec.id]?.[lang] ?? sec.title}`, '');
    const fields = Object.entries(section.fields).filter(([k]) => !isInternalCboField(k));
    if (fields.length === 0) { lines.push(T.empty, ''); continue; }
    for (const [k, v] of fields) {
      if (v.value) {
        lines.push(`**${cboFieldLabel(k, lang)}**: ${cboDisplayValue(sec.id, k, String(v.value), lang)}`, '');
      }
    }
    lines.push('---', '');
  }

  if (state.maturityScores.length > 0) {
    lines.push(`## ${T.scorecard}`, '', `**${T.total}: ${state.totalMaturityScore}/27**`, '');
    lines.push(T.cols, '|---|---|---|');
    for (const s of state.maturityScores) {
      lines.push(`| ${cboFieldLabel(s.metric, lang)} | ${'█'.repeat(s.score)}${'░'.repeat(3 - s.score)} ${s.score}/3 | ${s.justification} |`);
    }
    lines.push('');
  }

  if (state.priorityFlags.length > 0) {
    lines.push(`## ${T.flags}`, '');
    for (const f of state.priorityFlags) {
      const flag = CBO_PRIORITY_FLAG_LABELS[f.flag]?.[lang] ?? f.flag;
      lines.push(`- ${f.met ? '✅' : '⬜'} ${flag}${f.notes ? ` — ${f.notes}` : ''}`);
    }
  }

  return lines.join('\n');
}
