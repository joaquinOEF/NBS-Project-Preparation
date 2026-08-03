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
  CBO_SECTIONS,
  MATURITY_METRICS,
  PRIORITY_FLAG_DEFINITIONS,
  isValidMaturityMetric,
  isValidSectionId,
  canonicalPriorityFlag,
} from "@shared/cbo-schema";
import { getPhasePolicyForCbo, isPhaseAllowed, buildAccessPolicyPrompt, type PhasePolicy } from "./phaseGating";
import { loadEncontroSkill } from "./encontroSkills";
import {
  loadCboState as dbLoadCboState,
  loadCboMessages as dbLoadCboMessages,
  flushCbo,
} from "./cboPersistence";
import { db } from "../db";
import { cohortMembers, type SupportRequest } from "@shared/cohort-schema";
import { resolveOpenMapParams } from "@shared/cbo-map-presets";
import { rankFamiliasForSite, inferSiteTypeLabel } from "@shared/nbs-recommendation";
import { rankFamiliasWithContext, rankerCanRun, type FamiliaRankingResult } from "./familiaRanker";
import { getObject } from "./blobStorage";
import { reverseGeocode, isPlaceholderSiteName } from "./geocodeService";
import {
  E2_WORRIES,
  orderWorriesByData,
  photoPromptsFor,
  PHOTO_PROMPT_OPEN,
  HAZARD_CHECK_OPTIONS,
  hazardCheckQuestion,
  hazardsToCheck,
  computeSiteKnowledgeDepth,
  type HazardKey,
  type HazardCheckAnswer,
} from "@shared/site-knowledge";
import { NBS_SCALE_HONESTY, needsScaleReframing } from "@shared/nbs-performance";
import { NBS_FAMILIAS } from "@shared/nbs-catalog";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { getOrgIdForCboState, listDocumentsByOrg, listDocumentSummariesByOrg, getDocumentForOrg, listDocumentsForScope } from "./documentPersistence";
import { setMaturityTierForCboState, getMaturityTierForCboState } from "./orgPersistence";
import { queryTerms, scoreText, extractExcerpt } from "./textSearch";
import { isFakeModelEnabled, streamWithFakeModel } from "./fakeCboModel";
import { isPhaseSkipEnabled } from "./runtimeEnv";
import { emitAssistantText } from "./agentOutput";
import { isKnownOrgProfileField, canonicalizeOrgProfileValue, isEnumOrgProfileField, isCanonicalOrgProfileValue, orgProfileOptionLabels, orgProfileLabelsForIds, ORG_PROFILE_FIELDS, enumFieldsMatchingOptions } from "@shared/cbo-field-catalog";
import { QUESTIONNAIRES, checkOptionRule, filterRuledOptions, missingRequiredForClose, type FieldReader, type QuestionnaireManifest } from "@shared/cbo-questionnaire";

/** Manifests whose rules govern this section (today: E1 ↔ org_profile). */
function manifestsForSection(sectionId: string): QuestionnaireManifest[] {
  return Object.values(QUESTIONNAIRES).filter(m => m.sectionId === sectionId);
}

/** FieldReader over a live section's fields. */
function sectionFieldReader(section: { fields: Record<string, { value: unknown } | undefined> }): FieldReader {
  return (field: string) => {
    const v = section.fields[field]?.value;
    return v == null ? undefined : String(v);
  };
}

/** How many real user messages the transcript holds — the staging/commit
 *  guard's clock: confirm_doc_fields only commits values staged at a LOWER
 *  count, i.e. the user has spoken since. */
function countUserContentTurns(cboId: string): number {
  return getCboMessages(cboId).filter(m => m.role === 'user' && m.messageType === 'content').length;
}

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

// Ensure old 5-section states get the new sections added
function migrateSections(state: CboState): CboState {
  for (const sec of CBO_SECTIONS) {
    if (!state.sections[sec.id as keyof typeof state.sections]) {
      (state.sections as any)[sec.id] = { id: sec.id, title: sec.title, phase: sec.phase, fields: {}, confidence: 'empty', sources: [], lastUpdatedBy: null };
    }
  }
  // Move data from old intervention_plan → intervention_type
  if ((state.sections as any).intervention_plan) {
    const old = (state.sections as any).intervention_plan;
    if (old.fields && Object.keys(old.fields).length > 0 && Object.keys((state.sections as any).intervention_type?.fields || {}).length === 0) {
      (state.sections as any).intervention_type.fields = old.fields;
      (state.sections as any).intervention_type.confidence = old.confidence;
      (state.sections as any).intervention_type.sources = old.sources;
    }
    delete (state.sections as any).intervention_plan;
  }
  return state;
}

export function getCboState(id: string): CboState | undefined {
  const state = cboStates.get(id);
  if (state) migrateSections(state);
  return state;
}
export function setCboState(id: string, state: CboState): void {
  if (!state) {
    cboStates.delete(id);
    cboMessages.delete(id);
    flushedMessageCount.delete(id);
    return;
  }
  state.metadata.updatedAt = new Date().toISOString();
  migrateSections(state);
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
// PERSISTENCE — DB-backed (was file-based, see cboPersistence.ts for rationale)
// ============================================================================

// Per-CBO count of messages already persisted to DB. Used by the flusher to
// avoid re-inserting the same messages on every flush.
const flushedMessageCount = new Map<string, number>();

// Hydrate the in-memory cache from DB on cold lookup. Used by the route
// layer when a session reconnects to a CBO state created in a previous
// process lifetime.
export async function loadCboFromDb(id: string): Promise<{ state: CboState; messages: CboChatMessage[] } | null> {
  const state = await dbLoadCboState(id);
  if (!state) return null;
  const messages = await dbLoadCboMessages(id);
  flushedMessageCount.set(id, messages.length);
  return { state, messages };
}

// Flush = UPSERT cbo_states + INSERT any new cbo_messages since last flush, in
// a single transaction (see cboPersistence.flushCbo). The flush pointer only
// advances when the whole transaction commits, so a failure can't strand state
// without its messages.
const saveTimers = new Map<string, NodeJS.Timeout>();
const SAVE_DEBOUNCE_MS = 2000;

async function persistCbo(id: string) {
  const state = cboStates.get(id);
  if (!state) return;
  const allMessages = cboMessages.get(id) ?? [];
  const flushed = flushedMessageCount.get(id) ?? 0;
  const newMessages = allMessages.length > flushed ? allMessages.slice(flushed) : [];
  const { flushedCount } = await flushCbo(state, newMessages, flushed);
  flushedMessageCount.set(id, flushedCount);
}

export function debouncedPersist(id: string) {
  const existing = saveTimers.get(id);
  if (existing) clearTimeout(existing);
  saveTimers.set(id, setTimeout(() => {
    persistCbo(id).catch(e => console.error(`[cbo] persist(${id}) failed`, e));
    saveTimers.delete(id);
  }, SAVE_DEBOUNCE_MS));
}

// Immediate, durable flush — cancels any pending debounce and persists now.
// Use on phase boundaries (set_phase, /advance-phase) so a completed session
// (e.g. a finished Session-1 org profile) is never lost to the 2s debounce
// window if the process restarts right after the user finishes.
export async function flushNow(id: string) {
  const existing = saveTimers.get(id);
  if (existing) { clearTimeout(existing); saveTimers.delete(id); }
  await persistCbo(id).catch(e => console.error(`[cbo] flushNow(${id}) failed`, e));
}

// ── Single source of truth for advancing a CBO's phase ──
// The agent's set_phase tool and the /advance-phase route (the green
// "Start Encontro" card) both used to inline the same gate + set + flush logic,
// which could drift. Both now delegate here: validate range, apply the P-8
// unlock gate (phases 1-5 must be opened by the coordinator; 0 and 6 are
// always allowed), set the phase, and persist immediately (phase boundary).
// Callers own their own UX (SSE event vs HTTP response). The chat-handler
// "vamos começar o encontro N" regex stays as a separate belt-and-suspenders
// fallback and does its own thing.
export type AdvancePhaseResult =
  | { ok: true; phase: number }
  | { ok: false; reason: 'not_found' | 'range' | 'locked'; currentPhase?: number; unlockedPhases?: number[] };

export async function advanceCboPhase(cboId: string, target: number): Promise<AdvancePhaseResult> {
  const state = getCboState(cboId);
  if (!state) return { ok: false, reason: 'not_found' };
  if (!Number.isInteger(target) || target < 0 || target > 6) {
    return { ok: false, reason: 'range', currentPhase: state.phase };
  }
  if (target >= 1 && target <= 5) {
    const policy = await getPhasePolicyForCbo(cboId);
    if (policy.gated && !isPhaseAllowed(policy, target)) {
      return { ok: false, reason: 'locked', currentPhase: state.phase, unlockedPhases: policy.unlockedPhases };
    }
  }
  state.phase = target;
  setCboState(cboId, state);
  await flushNow(cboId);
  return { ok: true, phase: target };
}

// Reset the flush pointer when a CBO is deleted so a fresh re-creation
// with the same id wouldn't skip its first messages.
export function clearFlushedMessageCount(id: string) {
  flushedMessageCount.delete(id);
}

// Read the per-CBO flush pointer — diagnostic only.
export function getFlushedMessageCount(id: string): number {
  return flushedMessageCount.get(id) ?? 0;
}

// Read pending-flush state — diagnostic only.
export function hasPendingFlush(id: string): boolean {
  return saveTimers.has(id);
}

// ============================================================================
// MCP TOOLS
// ============================================================================

type EventPusher = (event: CboEvent) => void;
const pushEventRegistry = new Map<string, EventPusher>();

// ── One turn at a time, per session ─────────────────────────────────────────
// ⚠️ CBO-CONCURRENT-TURNS (JVP, 2026-08-03: "there were like two flows running…
// two agents. One had opened the map and it was going through the map but then
// it started responding again like 'Oh I will show you the examples'").
//
// Nothing stopped a second /chat from starting while the first was still
// streaming. His server log shows it plainly — two `Turn for <same cboId>`
// beginning 17s apart, the first finishing later:
//
//   [cbo] Turn for 7d0b… (phase 2, model claude-sonnet-4-6, 1/7 sections)
//   [cbo] Turn for 7d0b… (phase 2, model claude-haiku-4-5, 1/7 sections)
//   [cbo] timing … model=claude-sonnet-4-6 rounds=3 … total=16816ms
//
// Both then wrote into one transcript, and because `pushEventRegistry` holds a
// SINGLE pusher per session, the later turn silently hijacked the earlier one's
// event stream — so one agent's map opened while the other's prose kept
// arriving. A 76-second turn (rounds=9, first_event=62557ms) in the same log
// shows how wide the window gets.
//
// The window is easy to hit: the client disables its input while streaming, but
// a persisted composer's chips re-render on load, and any reload or second tab
// re-arms them. So this has to be enforced server-side, not by the UI.
//
// Rejecting is right rather than queueing: the second message is almost always
// an impatient re-tap of a question the in-flight turn is already answering, and
// running it would double-answer. The client surfaces a gentle "ainda estou
// respondendo" instead of a failure.
const activeTurns = new Map<string, number>();

/** Safety valve: a turn whose finally-block never ran must not lock a session
 *  forever. Longer than any real turn (the slowest observed was 77s). */
const TURN_LOCK_MAX_MS = 5 * 60 * 1000;

/** Claim the turn slot for a session. False = one is already in flight. */
export function beginTurn(cboId: string): boolean {
  const startedAt = activeTurns.get(cboId);
  if (startedAt != null && Date.now() - startedAt < TURN_LOCK_MAX_MS) return false;
  if (startedAt != null) {
    console.warn(`[cbo] turn lock for ${cboId} exceeded ${TURN_LOCK_MAX_MS}ms — force-releasing`);
  }
  activeTurns.set(cboId, Date.now());
  return true;
}

export function endTurn(cboId: string): void {
  activeTurns.delete(cboId);
}

function setActivePushEvent(id: string, pusher: EventPusher) { pushEventRegistry.set(id, pusher); }

// Session language per CBO, refreshed on every turn. The MCP server (and its
// tool closures) is cached per cboId, so tools can't take lang at creation —
// they read it here instead. pt is the product default.
const cboLangRegistry = new Map<string, 'pt' | 'en'>();
function setActiveCboLang(id: string, lang: string) { cboLangRegistry.set(id, lang === 'en' ? 'en' : 'pt'); }
function getActiveCboLang(id: string): 'pt' | 'en' { return cboLangRegistry.get(id) ?? 'pt'; }

function createCboMcpTools(cboId: string) {
  if (!sdkTool || !sdkCreateMcpServer) return null;

  const pushEvent = (event: CboEvent) => {
    const pusher = pushEventRegistry.get(cboId);
    if (pusher) pusher(event);
  };

  const updateSection = sdkTool(
    "update_section",
    "Update fields in the CBO intervention profile (document panel updates live). PREFERRED: pass ALL of a turn's fields for a section in ONE call via `fields` — never one call per field.",
    {
      sectionId: z.string().describe("Section ID: org_profile, intervention_site, intervention_type, impact_monitoring, operations_sustain, needs_assessment, results_evidence"),
      fields: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().describe("PREFERRED: { fieldName: value, … } — every field this turn captured, in one call"),
      field: z.string().optional().describe("Single-field form (legacy)"),
      value: z.string().optional().describe("Single-field form (legacy)"),
      confidence: z.enum(["high", "medium", "low"]).default("medium"),
      source: z.string().optional(),
    },
    async (args: any) => {
      const state = getCboState(cboId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: not found" }], isError: true };
      if (!isValidSectionId(args.sectionId)) {
        return { content: [{ type: "text" as const, text: `Unknown section "${args.sectionId}". Use one of exactly: ${ALL_CBO_SECTION_IDS.join(', ')}.` }], isError: true };
      }
      const section = state.sections[args.sectionId as keyof typeof state.sections];
      if (!section) return { content: [{ type: "text" as const, text: `Unknown section: ${args.sectionId}` }], isError: true };

      // Multi-field form (preferred — one call per turn) or legacy single-field.
      const entries: [string, string][] = args.fields && Object.keys(args.fields).length > 0
        ? Object.entries(args.fields).map(([k, v]) => [k, String(v)] as [string, string])
        : (args.field != null && args.value != null ? [[String(args.field), String(args.value)]] : []);
      if (entries.length === 0) {
        return { content: [{ type: "text" as const, text: "Nothing to update: pass `fields: { name: value, … }` (preferred) or `field` + `value`." }], isError: true };
      }
      // Foolproofing (Ana 2026-07-07): invented field names ("current_leadership")
      // land facts in chat that never reach the document, and machine enum ids
      // ("funded") leak to the user raw. PARTIAL WRITE: persist every valid
      // field, report the invalid ones — rejecting the whole batch over one
      // hallucinated name would silently lose the good answers of the turn.
      const rejected: string[] = [];
      let writable = entries;
      if (args.sectionId === 'org_profile') {
        rejected.push(...entries.filter(([k]) => !isKnownOrgProfileField(k)).map(([k]) => k));
        writable = entries.filter(([k]) => isKnownOrgProfileField(k));
        if (writable.length === 0) {
          return { content: [{ type: "text" as const, text: `Unknown org_profile field(s) ${rejected.map(b => `"${b}"`).join(', ')} — nothing saved. Use exactly: ${ORG_PROFILE_FIELDS.join(', ')}. If a fact fits none of these, mention it in chat but do not store it.` }], isError: true };
        }
      }
      // Document-sourced extractions get the containment fallback ("Associação
      // comunitária de moradores" → 'ONG / Associação'), and anything STILL
      // off-list is rejected below — a link's paraphrase must land exactly on
      // a chip label or become a question to the user, never a stored value
      // outside the list (field report 2026-07-08). User-sourced values keep
      // exact-match-or-pass-through: never destroy what the human said.
      const isDocSource = String(args.source ?? '').toLowerCase() === 'document';
      const offList: string[] = [];
      const ruleBlocked: { field: string; dependsOn: string; allowedIds: string[] }[] = [];
      const staged: string[] = [];
      const updated: string[] = [];
      // Conditional-option rules (manifest): write dependency fields first so
      // a batch carrying { has_cnpj, legal_form } validates legal_form against
      // the has_cnpj value from THIS batch, not a stale one.
      const manifests = manifestsForSection(args.sectionId);
      const dependencyFields = new Set(manifests.flatMap(m => Object.values(m.optionRules).map(r => r.dependsOn)));
      writable = [...writable.filter(([k]) => dependencyFields.has(k)), ...writable.filter(([k]) => !dependencyFields.has(k))];
      for (const [fieldName, rawValue] of writable) {
        const finalValue = args.sectionId === 'org_profile'
          ? canonicalizeOrgProfileValue(fieldName, rawValue, getActiveCboLang(cboId), isDocSource)
          : rawValue;
        if (
          isDocSource && args.sectionId === 'org_profile' &&
          isEnumOrgProfileField(fieldName) && !isCanonicalOrgProfileValue(fieldName, finalValue)
        ) {
          offList.push(fieldName);
          continue;
        }
        // Manifest rule: a KNOWN option that the stored dependency answer
        // excludes (e.g. legal_form "ONG" after has_cnpj "Ainda não") is
        // rejected for every source — user chips included, since a wrong
        // stored combination is wrong no matter who produced it.
        const ruleHit = manifests
          .map(m => checkOptionRule(m, fieldName, finalValue, sectionFieldReader(section)))
          .find(r => !r.ok) as { ok: false; dependsOn: string; allowedIds: string[] } | undefined;
        if (ruleHit) {
          ruleBlocked.push({ field: fieldName, dependsOn: ruleHit.dependsOn, allowedIds: ruleHit.allowedIds });
          continue;
        }
        // Crawl-trust gate: doc-sourced FREE-TEXT extractions are STAGED, not
        // written — the user must confirm the recap before they land in the
        // document (field report 2026-07: "should validate with user before
        // filling out any fields … sometimes asks for validation sometimes
        // doesn't"). Enum fields already commit through the exact-label
        // guard above; free-text has no list to catch a misread, so the
        // human is the guard. confirm_doc_fields commits after they reply.
        // intervention_site joins the gate (2026-07-31). It had none: a PDF
        // could write the site's tenure or current use straight into the
        // record as fact, and the only trace was a coordinator-facing line
        // saying nobody had confirmed it. Those two fields also drive the
        // site_control score. A document is evidence; the record should hold
        // testimony, so the human confirms before it commits.
        if (isDocSource &&
            ((args.sectionId === 'org_profile' && !isEnumOrgProfileField(fieldName)) ||
             args.sectionId === 'intervention_site')) {
          state.stagedDocFields = state.stagedDocFields ?? {};
          state.stagedDocFields[`${args.sectionId}.${fieldName}`] = {
            sectionId: args.sectionId, field: fieldName, value: String(finalValue),
            confidence: args.confidence as Confidence, stagedAtUserTurns: countUserContentTurns(cboId),
          };
          staged.push(fieldName);
          continue;
        }
        const oldValue = section.fields[fieldName]?.value ?? null;
        section.fields[fieldName] = { value: finalValue, confidence: args.confidence as Confidence, source: args.source, userEdited: false };
        state.editLog.push({ timestamp: new Date().toISOString(), sectionId: args.sectionId, field: fieldName, oldValue, newValue: finalValue, source: 'agent' });
        state.gaps = state.gaps.filter(g => !(g.sectionId === args.sectionId && g.field === fieldName));
        pushEvent({ type: 'field_update', sectionId: args.sectionId, field: fieldName, value: finalValue, confidence: args.confidence as Confidence, source: args.source });
        updated.push(fieldName);
      }
      section.lastUpdatedBy = 'agent';
      section.confidence = args.confidence as Confidence;
      if (args.source && !section.sources.includes(args.source)) section.sources.push(args.source);
      setCboState(cboId, state);
      const note = rejected.length > 0
        ? ` REJECTED (not stored, unknown field name${rejected.length > 1 ? 's' : ''}): ${rejected.join(', ')} — valid org_profile fields are: ${ORG_PROFILE_FIELDS.join(', ')}. The saved fields above do NOT need resending.`
        : '';
      const offListNote = offList.length > 0
        ? ` NOT STORED (off-list value from document): ${offList.map(f => `${f} — allowed values are exactly: ${orgProfileOptionLabels(f, getActiveCboLang(cboId)).join(' · ')}`).join('; ')}. Either resend with one of those exact labels, or leave the field empty and ask the user that question with the normal chips, leading with your best guess from the document.`
        : '';
      const ruleNote = ruleBlocked.length > 0
        ? ` NOT STORED (inconsistent with an earlier answer): ${ruleBlocked.map(b => `${b.field} — given the stored ${b.dependsOn} answer, the only valid options are: ${orgProfileLabelsForIds(b.field, b.allowedIds, getActiveCboLang(cboId)).join(' · ')}`).join('; ')}. Re-ask the user with exactly those chips.`
        : '';
      const stagedNote = staged.length > 0
        ? ` STAGED (awaiting the user's confirmation — NOT in the document yet): ${staged.join(', ')}. Recap each staged value to the user verbatim, say WHERE you read it (which page/section of the site or document, e.g. "li na página Sobre nós"), and ask for confirmation with chips ("Confere tudo" / "Quero ajustar"). When the user confirms, call confirm_doc_fields to commit; if they correct something, resend it via update_section with source 'user'.`
        : '';
      const summary = updated.length > 0 ? `Updated ${args.sectionId}: ${updated.join(', ')}.` : `Nothing stored in ${args.sectionId}.`;
      return { content: [{ type: "text" as const, text: `${summary}${note}${offListNote}${ruleNote}${stagedNote}` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  // Crawl-trust gate, commit half: doc-sourced free-text values staged by
  // update_section land in the document only through this tool, and only
  // after the user has actually replied since staging — the guard makes
  // "stage and silently self-confirm in the same turn" impossible.
  const confirmDocFields = sdkTool(
    "confirm_doc_fields",
    "Commit document-extracted values that update_section STAGED (free-text fields sent with source 'document'), after the user confirmed your recap in chat. Optional `fields` commits a subset (the rest stay staged). REFUSES when the user hasn't replied since staging — never call it in the same turn that staged the values.",
    { fields: z.array(z.string()).optional() },
    async (args: any) => {
      const state = getCboState(cboId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: not found" }], isError: true };
      const stagedAll = Object.values(state.stagedDocFields ?? {});
      const wanted = args.fields?.length ? stagedAll.filter(s => args.fields.includes(s.field)) : stagedAll;
      if (wanted.length === 0) {
        return { content: [{ type: "text" as const, text: "Nothing staged to commit. Doc-sourced free-text values are staged by update_section (source 'document'); there are none pending." }] };
      }
      const userTurns = countUserContentTurns(cboId);
      const committable = wanted.filter(s => s.stagedAtUserTurns < userTurns);
      if (committable.length === 0) {
        return { content: [{ type: "text" as const, text: "NOT committed — the user hasn't replied since these values were staged. Present the staged values (with where you read them) and wait for the user's confirmation, then call confirm_doc_fields again." }], isError: true };
      }
      const committed: string[] = [];
      for (const s of committable) {
        const sec = state.sections[s.sectionId as keyof typeof state.sections];
        if (!sec) continue;
        const oldValue = sec.fields[s.field]?.value ?? null;
        sec.fields[s.field] = { value: s.value, confidence: s.confidence, source: 'document', userEdited: false };
        sec.lastUpdatedBy = 'agent';
        if (!sec.sources.includes('document')) sec.sources.push('document');
        state.editLog.push({ timestamp: new Date().toISOString(), sectionId: s.sectionId, field: s.field, oldValue, newValue: s.value, source: 'agent' });
        state.gaps = state.gaps.filter(g => !(g.sectionId === s.sectionId && g.field === s.field));
        pushEvent({ type: 'field_update', sectionId: s.sectionId, field: s.field, value: s.value, confidence: s.confidence, source: 'document' });
        delete state.stagedDocFields![`${s.sectionId}.${s.field}`];
        committed.push(s.field);
      }
      setCboState(cboId, state);
      const held = wanted.length - committable.length;
      return { content: [{ type: "text" as const, text: `Committed to the document: ${committed.join(', ')}.${held > 0 ? ` ${held} value(s) stayed staged (user hasn't replied since they were staged).` : ''}` }] };
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
    "Advance to next phase (1-6). Refuses to advance past phases the coordinator has unlocked.",
    { phase: z.number().min(0).max(6) },
    async (args: any) => {
      const result = await advanceCboPhase(cboId, args.phase);
      if (!result.ok) {
        if (result.reason === 'not_found') return { content: [{ type: "text" as const, text: "Error: not found" }], isError: true };
        if (result.reason === 'locked') {
          return {
            content: [{
              type: "text" as const,
              text: `Phase ${args.phase} is locked. The coordinator has only opened phases ${result.unlockedPhases?.join(', ')}. Stay at Phase ${result.currentPhase} and tell the user warmly that the next workshop will open this section.`,
            }],
            isError: true,
          };
        }
        return { content: [{ type: "text" as const, text: `Invalid phase ${args.phase}.` }], isError: true };
      }
      pushEvent({ type: 'phase_change', phase: result.phase });
      return { content: [{ type: "text" as const, text: `Phase ${result.phase}` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  // E1 triage: stores the project-readiness path on the cohort member. Branches
  // E2-E3 flows (has-project + has-idea are project-forward; needs-help is
  // discovery). No-op if the CBO isn't part of a cohort.
  const setPath = sdkTool(
    "set_path",
    "Record the user's path choice from the E1 triage. 'has-project' = they already have a SELECTED, scoped NBS project (site + scope — typically a more mature / implementer org); 'has-idea' = they have a project direction in mind but it's not locked; 'needs-help' = they want help discovering one. Downstream, has-project is handled like has-idea (project-forward).",
    { path: z.enum(["has-project", "has-idea", "needs-help"]) },
    async (args: any) => {
      try {
        const result = await db
          .update(cohortMembers)
          .set({ path: args.path })
          .where(eq(cohortMembers.cboStateId, cboId))
          .returning();
        if (result.length === 0) {
          return { content: [{ type: "text" as const, text: `No cohort member linked to this CBO; path '${args.path}' not persisted (standalone session).` }] };
        }
        // Without this event the panel's Path section says "not yet chosen"
        // until a full page refresh (Perfect Demo 2026-07-14) — the value
        // lives on the member row, which the client only refetches on load.
        pushEvent({ type: 'path_set', path: args.path });
        return { content: [{ type: "text" as const, text: `Path set to '${args.path}' for ${result[0].orgName}.` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error setting path: ${err.message}` }], isError: true };
      }
    },
    { annotations: { readOnlyHint: false } }
  );

  // E1 close: persist the maturity-tier read (audit EF-5). The tier used to
  // be inferred fresh from the transcript every turn and never written
  // anywhere — organizations.maturity_tier stayed null, and E2+ (whose
  // skills don't re-derive it) ran with no calibration signal at all.
  const setMaturityTier = sdkTool(
    "set_maturity_tier",
    "Persist the org's maturity-tier read at the END of Encontro 1 (with the closing score_maturity + set_path calls). 'emerging' = plainest language, hide jargon; 'developing' = standard depth; 'advanced' = crisper, assume fluency. Grounded in the COUGAR Gate-2 rubric. Later encontros read this instead of re-deriving it, and the coordinator can override it.",
    { tier: z.enum(["emerging", "developing", "advanced"]) },
    async (args: any) => {
      try {
        const orgName = await setMaturityTierForCboState(cboId, args.tier);
        if (!orgName) {
          return { content: [{ type: "text" as const, text: `No organization linked to this session; tier '${args.tier}' not persisted (standalone session).` }] };
        }
        return { content: [{ type: "text" as const, text: `Maturity tier set to '${args.tier}' for ${orgName}.` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error setting tier: ${err.message}` }], isError: true };
      }
    },
    { annotations: { readOnlyHint: false } }
  );

  // E2 educational anchor: render the NbsShowcaseCard strip inline. Two modes:
  //   browse (has-idea) - read-only horizontal scroll
  //   favorites (needs-help) - per-card save toggle → inspiration_picks[]
  // Optional hazardFilter narrows the strip (e.g. flood-only when bairro
  // hazard is known). Cards available from shared/nbs-showcase-cards.ts.
  const showExamples = sdkTool(
    "show_examples",
    "Render the NbsShowcaseCard strip inline in chat. Use in E2 Beat 1, AFTER show_nbs_familias, to show REAL Brazilian/Porto Alegre cases. Pass typeRefs (deep-content type ids) to tie the examples to what was just taught. mode='favorites' for needs-help path. Optional hazardFilter to narrow.",
    {
      mode: z.enum(["browse", "favorites"]).default("browse"),
      hazardFilter: z.enum(["flood", "heat", "biodiversity"]).optional(),
      typeRefs: z.array(z.string()).optional().describe("NBS type ids (e.g. ['flood-parks','urban-forests']) — show only examples that represent these types"),
      intro: z.string().optional().describe("Optional 1-line lead text rendered above the strip"),
      cardIds: z.array(z.string()).optional().describe("Explicit card IDs to show (overrides hazardFilter/typeRefs)"),
    },
    async (args: any) => {
      const showcase = await import("@shared/nbs-showcase-cards");
      let cards: { id: string }[];
      if (Array.isArray(args.cardIds) && args.cardIds.length > 0) {
        cards = args.cardIds
          .map((id: string) => showcase.getShowcaseCard(id))
          .filter(Boolean) as { id: string }[];
      } else if (args.hazardFilter || (Array.isArray(args.typeRefs) && args.typeRefs.length > 0)) {
        cards = showcase.filterShowcaseCards({ hazard: args.hazardFilter, typeRefs: args.typeRefs });
      } else {
        cards = showcase.filterShowcaseCards();
      }
      const ids = cards.map(c => c.id);
      pushEvent({ type: 'show_examples', cardIds: ids, mode: args.mode ?? 'browse', intro: args.intro });
      return { content: [{ type: "text" as const, text: `Showed ${ids.length} example(s) in ${args.mode ?? 'browse'} mode. The strip has NO continue button. In browse mode, follow IN THE SAME TURN with a short message and an \`ask_user\` (e.g. "✓ Entendi" / "Tenho uma dúvida") so the user can continue. In favorites mode, let them save first — your next turn ends with that \`ask_user\`. Never leave the strip as the last thing in a turn.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  // E2 Beat 1 (educational): render the read-only NBS TYPE strip inline. This is
  // the FIRST thing in E2 — teach the categories of nature-based solutions
  // before showing real examples. Each card expands ("Saber mais") to the type's
  // description, example, and a case study. No selection here — purely to learn;
  // picking a type happens later. Types come from shared/cbo-schema NBS_INTERVENTION_TYPES.
  const showInterventionTypes = sdkTool(
    "show_intervention_types",
    "Render the educational NBS TYPE strip inline in chat. Use as the FIRST action in E2 to teach the kinds of nature-based solutions (read-only, expandable). Optionally pass typeIds to show a subset; omit to show all 6. STOP and wait for the user to read/react.",
    {
      typeIds: z.array(z.string()).optional().describe("Subset of NBS type ids to show (e.g. ['flood-parks','wetland-restoration']); omit for all 6"),
      intro: z.string().optional().describe("Optional 1-line lead text rendered above the strip"),
    },
    async (args: any) => {
      const schema = await import("@shared/cbo-schema");
      const all = schema.NBS_INTERVENTION_TYPES.map((t: any) => t.id);
      const ids = Array.isArray(args.typeIds) && args.typeIds.length > 0
        ? args.typeIds.filter((id: string) => all.includes(id))
        : all;
      pushEvent({ type: 'show_types', typeIds: ids, intro: args.intro });
      return { content: [{ type: "text" as const, text: `Showed ${ids.length} NBS type(s). The strip is read-only and has NO buttons — in this SAME turn you MUST follow with a short message and an \`ask_user\` (e.g. options "Ver exemplos" / "Já conheço, pular") so the user has a way to continue. Do not end the turn on the strip alone.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  // Two-level taxonomy strip: the 5 famílias of the Rede SCbN POA card deck
  // (shared/nbs-catalog.ts), each expandable into its solution variants.
  // Preferred over show_intervention_types for teaching — it matches the
  // printed cards the cohort holds in the encontros.
  const showNbsFamilias = sdkTool(
    "show_nbs_familias",
    "Render the educational NBS FAMÍLIAS strip inline in chat (5 famílias from the Rede SCbN POA card deck, each opening into its solution variants). Use as the FIRST action in E2 to build vocabulary. Optionally pass familiaIds for a subset; omit for all 5. STOP and wait for the user to read/react.",
    {
      familiaIds: z.array(z.string()).optional().describe("Subset of família ids: aguas-pluviais, verde-urbano, agricultura-urbana, encostas-e-solo, recuperacao-ecossistemas; omit for all 5"),
      intro: z.string().optional().describe("Optional 1-line lead text rendered above the strip"),
    },
    async (args: any) => {
      const catalog = await import("@shared/nbs-catalog");
      const all = catalog.NBS_FAMILIAS.map((f: any) => f.id);
      const ids = Array.isArray(args.familiaIds) && args.familiaIds.length > 0
        ? args.familiaIds.filter((id: string) => all.includes(id))
        : undefined; // undefined = all five
      pushEvent({ type: 'show_familias', familiaIds: ids, intro: args.intro } as any);
      return { content: [{ type: "text" as const, text: `Showed the famílias strip (${ids ? ids.length : 5} família(s)). It is read-only and has NO buttons — in this SAME turn you MUST follow with a short message and an \`ask_user\` (e.g. options "Ver exemplos" / "Já conheço, pular") so the user has a way to continue. Do not end the turn on the strip alone.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  // E2 linear flow closing — famílias worth studying for this site. The RANKING
  // is computed server-side (bairro risks × catalog hazard weights × context
  // boosts — shared/nbs-recommendation.ts) so the card can never be a single
  // hallucinated verdict; the model's contribution is richer per-família "why"
  // lines when it has context the server doesn't (photos, free-text answers).
  const showFamiliaRecommendation = sdkTool(
    "show_familia_recommendation",
    "Render the closing 'famílias pra estudar' card for the captured site (always ≥2 famílias, ranked by the bairro's risks + what the org shared). Optionally pass per-família `why` lines grounded in what the USER said/uploaded; the server fills ranking, example variants, and any missing whys. In this SAME turn follow with an ask_user (e.g. 'Faz sentido' / 'Quero ajustar').",
    {
      items: z.array(z.object({
        familiaId: z.string().describe("aguas-pluviais | verde-urbano | agricultura-urbana | encostas-e-solo | recuperacao-ecossistemas"),
        why: z.string().describe("One-line reason tied to THEIR data ('você contou que o terreno alaga'), session language"),
      })).optional(),
      intro: z.string().optional().describe("Optional 1-line lead above the card"),
    },
    async (args: any) => {
      const state = getCboState(cboId);
      if (!state) return { content: [{ type: "text" as const, text: "Error: not found" }], isError: true };
      const items = buildFamiliaRecoItems(state, getActiveCboLang(cboId), args.items);
      pushEvent({ type: 'show_familia_recommendation', items, intro: args.intro } as any);
      return { content: [{ type: "text" as const, text: `Showed ${items.length} famílias (${items.map(i => i.familiaId).join(', ')}). The card is read-only — follow with an ask_user in this SAME turn.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  // E2 Beat 3a — risk priority ranking. Renders 3 tap-in-order chips for
  // flood / heat / landslide. User taps in priority order, then confirms.
  // Result comes back as a chat message: "Priority ranking: flood (1), heat (2)..."
  // which the agent parses to fill primary_hazard, secondary_hazard fields.
  const askPriorityRank = sdkTool(
    "ask_priority_rank",
    "Render the RiskPriorityChips composer for the user to rank flood/heat/landslide in order of concern. minRanked is the minimum number of chips they must rank (default 2). STOP and wait for the user's confirmation.",
    {
      prompt: z.string().describe("The question shown above the chips, e.g. 'Desses três riscos, qual mais te preocupa?'"),
      minRanked: z.number().min(1).max(3).optional().default(2),
    },
    async (args: any) => {
      pushEvent({ type: 'ask_priority_rank', prompt: args.prompt, minRanked: args.minRanked ?? 2 });
      return { content: [{ type: "text" as const, text: `RiskPriorityChips opened. STOP and wait for the user's ranking.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  // E2 Beat 3c — community anchoring composer. Renders a structured form with
  // 3 short text fields (lead/volunteers/beneficiaries) + chip multi-select
  // for engagement methods. Result comes back as a parseable chat message.
  const askCommunityAnchoring = sdkTool(
    "ask_community_anchoring",
    "Render the CommunityAnchoringComposer inline. Used at E2 Beat 3c to capture who from the community is anchored to the work. STOP and wait for the user's confirmation.",
    { prompt: z.string().describe("Lead text shown above the form") },
    async (args: any) => {
      pushEvent({ type: 'ask_community_anchoring', prompt: args.prompt });
      return { content: [{ type: "text" as const, text: `CommunityAnchoringComposer opened. STOP and wait.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  const askUser = sdkTool(
    "ask_user",
    `Present one or more multiple-choice questions to the user. The UI renders each as chip buttons (or a free-text input when the user picks "Outra coisa").

ALWAYS use this tool for any question with 2-7 natural buckets — legal form, team size, paid/volunteer split, project scale, NBS experience, hazard ranking, land tenure, current site use, etc. Never ask such questions as free-text chat. Free-text is allowed ONLY for genuinely unique values: org name, one-sentence mission, year, proud-moment story.

Every turn that calls update_section MUST also call ask_user (or another user-prompting tool: open_map, ask_priority_rank, ask_community_anchoring, show_examples, open_intervention_selector) in the SAME turn. Pairing is non-negotiable — if you persist a value and end the turn without prompting the next question, the user sees a blank screen and is stranded.

You may batch multiple questions in one call (pass an array). Use sparingly: batch only when the questions are tightly related and the user can answer them in any order. For a sequential question-by-question flow (the E1 default), one question per call is correct.

Include showMap: true on a question only when the user genuinely needs the map to pick an answer.`,
    {
      questions: z.array(z.object({
        question: z.string(),
        // action 'upload': renders as a prominent attach banner (paperclip
        // icon) that opens the file picker instead of sending an answer. Use
        // ONLY on the intake-opening "send your site or documents" option.
        options: z.array(z.object({ label: z.string(), description: z.string().optional(), recommended: z.boolean().optional(), action: z.enum(['upload', 'upload_then_answer']).optional() })),
        relatedSections: z.array(z.string()).optional(),
        showMap: z.boolean().optional(),
        multiSelect: z.boolean().optional(),
        // Escape hatch for the re-ask guard below: set it ONLY when the user
        // explicitly asked, this turn, to change an answer they already gave.
        allowReask: z.boolean().optional(),
      })),
    },
    async (args: any) => {
      // A question with no chips is a PROSE question, not an ask_user — the
      // model kept wrapping free-text questions (the mission) in empty-option
      // ask_user calls, rendering a bare question card instead of plain chat
      // text (live E1 run, 2026-07-08). Reject the whole call so the model
      // re-asks correctly; rendering the valid subset would double-ask the
      // rest on the retry.
      const empty = (args.questions || []).filter((q: any) => !(q.options?.length > 0));
      if (empty.length > 0) {
        return { content: [{ type: "text" as const, text: `NOT shown — ${empty.length} question(s) had no options. ask_user is only for chip questions (2-7 buckets). A question with no natural buckets (mission, name, story) must be asked as PLAIN TEXT in your message, with no tool call. Re-ask now: chip questions via ask_user, free-text ones as prose.` }], isError: true };
      }
      // A ONE-option "list" is a free-text question wearing a chip costume —
      // the user has to tap the lone chip (e.g. "Me conta") just to unlock the
      // text input (field report 2026-07: "weird option, like a one-option
      // list … a little bit confusing"). The skill forbids it but the model
      // still does it, so convert server-side: deliver the question as plain
      // chat prose instead of a composer. No isError — the question DID reach
      // the user; an error retry would double-ask it.
      let converted = 0;
      const filteredNotes: string[] = [];
      const blockedNotes: string[] = [];
      let shown = 0;
      for (const q of args.questions || []) {
        if ((q.options?.length ?? 0) === 1) {
          pushEvent({ type: 'chat', content: q.question, role: 'assistant' } as any);
          converted++;
          continue;
        }
        // Re-ask guard (COUGAR Perfect Demo 2026-07-14): the model re-asked
        // already-answered questions ("How is your team structured?" twice in
        // a row). ask_user carries no field id, so infer the target field(s)
        // by resolving the chip labels against the enum catalog; when every
        // plausible field already holds an answer, this is a duplicate — drop
        // it and teach the model instead of rendering it. `allowReask: true`
        // (a deliberate act, reserved for a user-requested change) bypasses.
        if (!q.allowReask) {
          const chipLabels = (q.options || []).filter((o: any) => !o.action).map((o: any) => o.label);
          const fieldsHit = enumFieldsMatchingOptions(chipLabels);
          if (fieldsHit.length > 0) {
            const orgSection = getCboState(cboId)?.sections?.org_profile;
            if (orgSection) {
              const read = sectionFieldReader(orgSection);
              const answered = fieldsHit.map(f => ({ field: f, value: read(f) })).filter(x => (x.value ?? '').trim().length > 0);
              if (answered.length === fieldsHit.length) {
                blockedNotes.push(`"${q.question}" — ${answered.map(a => `${a.field} is already answered ("${a.value}")`).join(' and ')}`);
                continue;
              }
            }
          }
        }
        let options = q.options || [];
        const qState = getCboState(cboId);
        // E1 asks FACTS about the org (team size, CNPJ, experience) — there is
        // no answer to "recommend", and a ⭐ badge on "Sim" reads as pressure
        // to self-inflate (Perfect Demo 2026-07-14: "por que dice
        // recomendado?"). Strip the flag in phase 1; later encontros (real
        // recommendations, e.g. NBS types) keep it.
        if ((qState?.phase ?? 1) <= 1) {
          options = options.map(({ recommended: _r, ...rest }: any) => rest);
        }
        // Manifest rule: when this is recognizably a rule-governed enum
        // question (e.g. legal_form), drop the options the stored dependency
        // answer excludes — a CNPJ-less org must never see "ONG" as a chip.
        // Only applied when ≥2 options survive; otherwise the original list
        // renders and the write-path rule still backstops the answer.
        for (const m of Object.values(QUESTIONNAIRES)) {
          const qSection = qState?.sections[m.sectionId as keyof typeof qState.sections];
          if (!qSection) continue;
          const filtered = filterRuledOptions(m, options, sectionFieldReader(qSection));
          if (filtered && filtered.droppedLabels.length > 0 && filtered.kept.length >= 2) {
            options = filtered.kept as typeof options;
            filteredNotes.push(`dropped ${filtered.droppedLabels.length} ${filtered.field} option(s) inconsistent with the stored ${m.optionRules[filtered.field].dependsOn} answer: ${filtered.droppedLabels.join(' · ')}`);
          }
        }
        pushEvent({ type: 'ask_user', question: q.question, options, relatedSections: q.relatedSections, showMap: q.showMap, multiSelect: q.multiSelect });
        shown++;
      }
      // Everything was a blocked duplicate and nothing reached the user →
      // error so the model retries with the NEXT unanswered question (a plain
      // success here would strand the user on a promptless turn).
      if (shown === 0 && converted === 0 && blockedNotes.length > 0) {
        return { content: [{ type: "text" as const, text: `NOT shown — duplicate question(s): ${blockedNotes.join('; ')}. Do NOT re-ask answered fields. Move on to the next UNANSWERED field now (check the CURRENT STATE). If the user explicitly asked to change one of these answers, call update_section with the new value directly, or re-ask with allowReask: true.` }], isError: true };
      }
      const note = converted > 0 ? ` (${converted} single-option question(s) delivered as plain text instead — a one-option list is a free-text question; next time ask it as prose with no tool call)` : '';
      const filterNote = filteredNotes.length > 0 ? ` (${filteredNotes.join('; ')} — the user only saw the valid chips)` : '';
      const blockedNote = blockedNotes.length > 0 ? ` (${blockedNotes.length} duplicate question(s) NOT shown: ${blockedNotes.join('; ')} — never re-ask answered fields)` : '';
      return { content: [{ type: "text" as const, text: `${shown + converted} question(s) shown.${note}${filterNote}${blockedNote} STOP and wait.` }] };
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
Tiles (raster): poa_flood_hazard (Flood Hazard), poa_heat_hazard (Heat Hazard), poa_landslide_hazard (Landslide Hazard), oef_dynamic_world (Land Use), oef_chirps_r90p_2024, oef_copernicus_dem, oef_ghsl_population, oef_merit_elv, +40 more
Spatial queries: sq_parks_flood, sq_schools_flood, sq_hospitals_flood, sq_wetlands_flood, sq_schools_heat_250m, sq_schools_landslide_250m

## Presets — ALWAYS use one for an Encontro-2 map. Never retype its params.
⚠️ In E2 the platform's checkpoints open both map sessions for you — only call
open_map yourself when the user explicitly asks to redo a step.
- \`preset:"e2_bairro"\` — Map 1: hazard tour, then bairro; confirms AT the zone step. Pass \`preselectZone:"<bairro>"\` (org_profile.bairro_of_operation) so the org confirms instead of hunting for itself on a 94-polygon map.
- \`preset:"e2_site_focused"\` — Map 2: pass \`focusZone:"<bairro>"\`; opens inside it (satellite, chooser overlay).
- \`preset:"e2_risk_tour"\` / \`preset:"e2_site"\` — legacy combined session (old flow re-entries only).
- \`preset:"e2_browse"\` — needs-help: look around, commit to nothing.
A preset supplies selectionMode, zoneSource, layers, tiles, legend, tour and prompt.
Pass an extra field ONLY to narrow it — e.g. \`{preset:"e2_site_focused", focusZone:"Sarandi"}\`.

## Recipes (non-CBO flows, which have no preset)
- CBO Phase 3 (What We're Doing): assets + [osm_parks, osm_wetlands] + [oef_dynamic_world, poa_flood_hazard, poa_heat_hazard, poa_landslide_hazard]
- Concept Note Phase 2 (Territorial Scope): zones + [] + [poa_flood_hazard, poa_heat_hazard, poa_landslide_hazard]
- Environmental analysis: sample + [] + [poa_flood_hazard, poa_heat_hazard, oef_copernicus_dem]

STOP and wait for the user's map selection after calling this tool.`,
    {
      preset: z.enum(["e2_risk_tour", "e2_site", "e2_browse", "e2_bairro", "e2_site_focused"]).optional().describe("The canonical Encontro-2 map step. Supplies every param below. USE THIS for any E2 map — the params are defined once in shared/cbo-map-presets.ts, so a retyped copy can never drift from the one the client renders."),
      focusZone: z.string().optional().describe("e2_site_focused only: the confirmed bairro name — the map opens already inside it"),
      preselectZone: z.string().optional().describe("e2_bairro only: the bairro E1 already recorded (org_profile.bairro_of_operation). Pre-selects it and rings it through the hazard tour, so the step is a confirmation. The zone step is NOT skipped — the user can still tap a different bairro. A name matching no zone is ignored."),
      confirmAtZone: z.boolean().optional().describe("Composite: the session ends at the zone step (e2_bairro sets this)"),
      layers: z.array(z.string()).optional().describe("OSM layer IDs to show: osm_parks, osm_schools, osm_hospitals, osm_wetlands"),
      tileLayers: z.array(z.string()).optional().describe("Tile layer IDs as toggleable overlays (not auto-shown): poa_flood_hazard, poa_heat_hazard, etc."),
      spatialQueries: z.array(z.string()).optional().describe("Pre-filter features: sq_parks_flood, sq_schools_heatwave, etc."),
      selectionMode: z.enum(["zones", "assets", "sample", "composite", "browse-only"]).optional().describe("Required unless `preset` is given. composite = zone first, then sites. assets = sites only. zones = zones only. sample = click-to-read-values. browse-only = exploration; no commitment (E2 needs-help)."),
      prompt: z.string().optional().describe("Required unless `preset` is given. Clear instruction for the user, e.g. 'Select the zone where you work, then pick the parks and schools you are targeting'"),
      sampleLayers: z.array(z.string()).optional().describe("For sample mode: which tile layers to sample on click"),
      zoneSource: z.enum(["neighborhood_zones", "intervention_zones", "neighborhoods"]).optional().describe("For composite mode step 1: 'neighborhood_zones' (default) shows bairros with risk scores + vulnerability-weighted priority. 'neighborhoods' shows raw IBGE census data. 'intervention_zones' uses legacy synthetic zones."),
      narrationOverlay: z.string().optional().describe("Translucent banner over the map for browse-only mode — agent narrates what colors mean. ~80 chars ideal."),
      showLegendSimple: z.boolean().optional().describe("Collapse the full toolkit into a simple 3-chip hazard legend. Useful for first-time CBO users."),
      hazardTour: z.boolean().optional().describe("E2 map step: open into a guided tour that walks the user through flood → heat → landslide ONE at a time before unlocking neighborhood/site selection. Use selectionMode:'composite' with this. Pass the 3 poa_*_hazard tileLayers."),
      allowDeferSite: z.boolean().optional().describe("E2 map step: let the user commit a neighborhood with no specific site yet ('usar o bairro todo'). Pass true for the CBO map step."),
      suggestedSite: z.object({
        quote: z.string().optional().describe("The literal passage from the org's document that names the place (shown to the user as 'na proposta: …')"),
        name: z.string().optional().describe("Place/address to geocode (e.g. 'Rua Voluntários da Pátria 123, Porto Alegre') when you don't have coordinates"),
        lat: z.number().optional(),
        lng: z.number().optional(),
        neighborhood: z.string().optional().describe("Bairro-only hint when the doc names a neighborhood but no precise site"),
      }).optional().describe("E2 map step: a site candidate found via search_org_documents, to pre-place for the user to VALIDATE ('é aqui?') instead of picking blind. Only pass what the doc actually says — the quote is the basis the user sees."),
    },
    async (args: any) => {
      // Deterministic fence (fake-E2 field report 2026-07-08): the map step
      // belongs to Encontro 2+. At phase 1, a model that sees a finished
      // diagnostic in the transcript will happily role-play the E2 opening
      // and open the map with NO phase change — skipping the E2 preamble,
      // the templated educational entry, and the header progression. Prompt
      // rules alone don't hold on light-model turns; refuse at the engine.
      const mapState = getCboState(cboId);
      if ((mapState?.phase ?? 0) < 2) {
        return { content: [{ type: "text" as const, text: `BLOCKED: open_map is an Encontro 2+ tool and this org is still in phase ${mapState?.phase ?? 0}. Do NOT simulate Encontro 2 content or open the map. Tell the user the next encontro will appear as a green card here in the chat once their coordinator opens it, then END your turn.` }] };
      }
      // A preset supplies the whole canonical step (shared/cbo-map-presets.ts);
      // any explicit arg narrows it. Without a preset this is a passthrough, so
      // the city / concept-note flows are untouched.
      const lang = mapState?.metadata?.language === 'en' ? 'en' : 'pt';
      const resolved = resolveOpenMapParams({
        preset: args.preset,
        layers: args.layers,
        tileLayers: args.tileLayers,
        spatialQueries: args.spatialQueries,
        selectionMode: args.selectionMode,
        prompt: args.prompt,
        sampleLayers: args.sampleLayers,
        zoneSource: args.zoneSource,
        narrationOverlay: args.narrationOverlay,
        showLegendSimple: args.showLegendSimple,
        hazardTour: args.hazardTour,
        allowDeferSite: args.allowDeferSite,
        suggestedSite: args.suggestedSite,
        // Both zone hints were documented in this tool's description and then
        // dropped on the floor here — the whitelist above is explicit, so an arg
        // absent from it silently never reaches the client. `focusZone` is the
        // one the description tells the model to pass for e2_site_focused.
        focusZone: args.focusZone,
        preselectZone: args.preselectZone,
      }, lang);

      if (!resolved.selectionMode) {
        return { content: [{ type: "text" as const, text: `NOT opened — pass a \`preset\` (e2_risk_tour | e2_site | e2_browse) or an explicit \`selectionMode\`. Re-call open_map now.` }], isError: true };
      }

      pushEvent({ type: 'open_map', params: resolved });
      return { content: [{ type: "text" as const, text: `Map opened in "${resolved.selectionMode}" mode${args.preset ? ` (preset ${args.preset})` : ''}. STOP and wait for selection.` }] };
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
      if (!isValidMaturityMetric(args.metric)) {
        return {
          content: [{
            type: "text" as const,
            text: `Invalid metric "${args.metric}". Use one of exactly: ${MATURITY_METRICS.join(', ')}. Re-call score_maturity with the correct metric name — the next-workshop banner only appears when the phase's metrics are scored with these exact ids.`,
          }],
          isError: true,
        };
      }
      // CLOSE GATE (manifest): for phases scored at close (E1), scoring IS the
      // closing signal — so refuse it while required questionnaire fields (or
      // the set_path triage) are missing, naming exactly what's left. This is
      // what makes "edit an earlier answer near the end → the model jumps to
      // the closing and skips the project-status question" structurally
      // impossible (field report 2026-07).
      const closeManifest = QUESTIONNAIRES[state.phase];
      if (closeManifest) {
        const gateSection = state.sections[closeManifest.sectionId as keyof typeof state.sections];
        let hasPath: boolean | null = null; // null = standalone session, path not persistable
        if (closeManifest.requiresPath) {
          try {
            const rows = await db.select({ path: cohortMembers.path }).from(cohortMembers).where(eq(cohortMembers.cboStateId, cboId)).limit(1);
            hasPath = rows.length === 0 ? null : rows[0].path != null;
          } catch { hasPath = null; }
        }
        const missing = gateSection ? missingRequiredForClose(closeManifest, sectionFieldReader(gateSection), hasPath) : [];
        if (missing.length > 0) {
          return {
            content: [{
              type: "text" as const,
              text: `NOT scored — Encontro ${state.phase} can't close yet, these are still missing: ${missing.join(', ')}. Ask the user for each of them (chips for enum fields, prose for free-text), store the answers, and only then re-run the closing calls.`,
            }],
            isError: true,
          };
        }
      }
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
      const flag = canonicalPriorityFlag(args.flag);
      if (!flag) {
        return {
          content: [{
            type: "text" as const,
            text: `Invalid priority flag "${args.flag}". Use one of exactly: ${PRIORITY_FLAG_DEFINITIONS.join(' | ')}.`,
          }],
          isError: true,
        };
      }
      // Store the canonical flag string so the orchestrator's flag set stays consistent.
      state.priorityFlags = state.priorityFlags.filter(f => f.flag !== flag);
      state.priorityFlags.push({ flag, met: args.met, notes: args.notes });
      setCboState(cboId, state);
      pushEvent({ type: 'maturity_update', scores: state.maturityScores, total: state.totalMaturityScore, flags: state.priorityFlags });
      return { content: [{ type: "text" as const, text: `Flag: ${flag} = ${args.met ? 'met' : 'not met'}` }] };
    },
    { annotations: { readOnlyHint: false } }
  );

  const readKnowledge = sdkTool(
    "read_knowledge",
    `Read a knowledge file for detailed data about interventions, co-benefits, city context, or case studies.

## Key folders
- _interventions/: bioswales-rain-gardens.md, flood-parks.md, green-corridors.md, green-roofs-walls.md, urban-forests.md, wetland-restoration.md
- _co-benefits/: public-health.md, carbon-sequestration.md, flood-risk-reduction.md, heat-island-mitigation.md, economic-social.md, biodiversity.md
- _success-cases/: brazilian-municipal.md (Curitiba, Recife, BH, São Paulo, Salvador examples)
- _evidence/: impact-benchmarks.md, funded-projects-brazil.md (GCF, World Bank, GEF projects)
- _financing-sources/: preparation-facilities.md, international.md, brazilian-domestic.md
- porto-alegre/: climate-risks.md, local-precedents.md, existing-plans.md, stakeholders.md, baseline-data.md
- _cougar/: nbs-mapping-criteria.md, ecosystem-assessment-summary.md, sample-cbo-vilaflores.md

USE THIS TOOL PROACTIVELY when guiding the user. Don't just ask questions — read relevant files and share insights.`,
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

  // Lexical search over the static knowledge base — find the right file(s) by
  // topic and get an excerpt, instead of guessing a path. Mirrors Funga.
  const searchKnowledge = sdkTool(
    "search_knowledge",
    "Search the knowledge base (interventions, co-benefits, financing sources, evidence, Brazilian case studies, Porto Alegre context) by topic/keyword and get the most relevant files with an excerpt. Use this to find the right file before read_knowledge, and especially to answer an 'I don't know / help me' question.",
    { query: z.string().describe("Topic to look up, e.g. 'rain garden cost' or 'funding for community gardens'") },
    async (args: any) => {
      const files = await getKnowledgeFiles();
      const terms = queryTerms(args.query);
      const scored = files
        .map(f => ({ f, score: scoreText(`${f.path} ${f.whenToUse} ${f.content}`, terms) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
      if (scored.length === 0) {
        return { content: [{ type: "text" as const, text: `No knowledge files matched "${args.query}".` }] };
      }
      const lines = scored.map(({ f, score }) =>
        `### ${f.path} (score ${score})${f.whenToUse ? `\n_${f.whenToUse}_` : ''}\n${extractExcerpt(f.content, terms)}`);
      return { content: [{ type: "text" as const, text: `Top knowledge matches for "${args.query}":\n\n${lines.join('\n\n')}\n\nThe path is folder/file — use read_knowledge(folder, file) for the full file.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  // ── Per-org knowledge base (the evidence locker) ──
  // These read the org's accumulated documents across ALL sessions, scoped to
  // the org that owns this CBO profile, so Encontro 4 can reference the budget
  // dropped in Encontro 1. See docs/cbo-platform-architecture.md.
  const listOrgDocuments = sdkTool(
    "list_org_documents",
    "List the documents this organization has shared so far (across all sessions) — proposals, budgets, photos, voice memos, prior-project docs. Use this to recall what evidence already exists before asking the user to re-explain something. Returns an id, filename, kind, and short summary for each.",
    {},
    async () => {
      const orgId = await getOrgIdForCboState(cboId);
      if (!orgId) return { content: [{ type: "text" as const, text: "No documents on file yet." }] };
      const docs = await listDocumentSummariesByOrg(orgId); // summaries only — no fullText on a listing (LT-3)
      if (docs.length === 0) return { content: [{ type: "text" as const, text: "No documents on file yet." }] };
      const lines = docs.map(d => `- [${d.id}] ${d.filename} (${d.kind ?? 'file'}${d.droppedInPhase ? `, Encontro ${d.droppedInPhase}` : ''}) — ${(d.summary || '').slice(0, 160)}`);
      return { content: [{ type: "text" as const, text: `Documents on file (${docs.length}):\n${lines.join('\n')}\n\nUse read_org_document with an [id] to read the full text.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  const readOrgDocument = sdkTool(
    "read_org_document",
    "Read the full extracted text of one of this organization's documents (by id from list_org_documents). Use to pull details from a budget, proposal, or prior-project doc the org shared earlier — including in a previous session.",
    { id: z.string().describe("Document id from list_org_documents") },
    async (args: any) => {
      const orgId = await getOrgIdForCboState(cboId);
      if (!orgId) return { content: [{ type: "text" as const, text: "No documents available." }], isError: true };
      const doc = await getDocumentForOrg(args.id, orgId);
      if (!doc) return { content: [{ type: "text" as const, text: `Document ${args.id} not found for this organization.` }], isError: true };
      const text = doc.fullText || doc.summary || '(no extracted text)';
      return { content: [{ type: "text" as const, text: `# ${doc.filename}\n\n${text.length > 6000 ? text.slice(0, 6000) + '\n...(truncated — use search_org_documents to find a specific passage further in)' : text}` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  // Lexical search across the org's documents — returns the relevant passage
  // from anywhere in a (possibly large) doc, so the agent doesn't have to dump
  // or blind-truncate the whole file. Mirrors Funga's search_knowledge pattern.
  const searchOrgDocuments = sdkTool(
    "search_org_documents",
    "Search across ALL of this org's uploaded documents for a topic/keyword (e.g. 'annual budget', 'families served', 'partnership letter') and get the most relevant passages with their document id. PREFER this over read_org_document when you need a specific detail from large docs — it finds the relevant excerpt anywhere in the file, not just the first page.",
    { query: z.string().describe("What to look for, e.g. 'budget' or 'number of beneficiaries'") },
    async (args: any) => {
      const orgId = await getOrgIdForCboState(cboId);
      if (!orgId) return { content: [{ type: "text" as const, text: "No documents on file yet." }] };
      const docs = await listDocumentsByOrg(orgId);
      const terms = queryTerms(args.query);
      const scored = docs
        .map(d => ({ d, score: scoreText(`${d.filename} ${d.fullText || d.summary || ''}`, terms) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      if (scored.length === 0) {
        return { content: [{ type: "text" as const, text: `No matches for "${args.query}" in the org's documents. Use list_org_documents to see what's on file.` }] };
      }
      const lines = scored.map(({ d, score }) =>
        `### [${d.id}] ${d.filename} (score ${score})\n${extractExcerpt(d.fullText || d.summary || '', terms)}`);
      return { content: [{ type: "text" as const, text: `Top matches for "${args.query}":\n\n${lines.join('\n\n')}\n\nUse read_org_document([id]) for a document's full text.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  const openInterventionSelector = sdkTool(
    "open_intervention_selector",
    `Open the NBS Solution Selector micro-app — TWO-LEVEL: 5 famílias (from the Rede SCbN POA card deck) that expand into their 27 solution variants, each with the deck's real photo. YOU recommend at the FAMÍLIA level; the ORGANIZATION picks the variant (terrain, tenure and politics are theirs to know).

Use this in Phase 3a after collecting site information. Pass siteHazards from Phase 2 data (or recommendedFamilias from guidance mode) to badge and pre-open the most relevant famílias. Only the top 2 famílias get the "Recommended" badge.

⚠️ siteHazards.landslide MUST be the site's landslide HAZARD (terrain susceptibility, 0–1) sampled on the E2 map (the poa_landslide_hazard layer value at the chosen point), NOT the landslide RISK. Landslide RISK is structurally tiny in POA (low exposure on the slopes ≈ 0), but the HAZARD is high on the morros — and it's what should drive slope-stabilizing NbS (urban forests, green corridors, whose roots stabilize slopes). If the E2 site sits on landslide-prone terrain (landslide hazard ≳ 0.2), pass that hazard value so those types surface as Recommended; a near-zero value would wrongly hide them.

If the user went through guidance mode first (asked about problems, site conditions), pass recommendedFamilias with your recommended order — the selector will sort and badge accordingly. (recommendedTypes still works and maps to famílias.)

The user can select MULTIPLE solutions (e.g., wetland construído + biovaletas combo).

STOP and wait for the user's selection after calling this tool.`,
    {
      prompt: z.string().describe("Instruction shown to the user"),
      preSelectedType: z.string().optional().describe("Pre-select a type if the user already mentioned one"),
      showCaseStudies: z.boolean().optional().default(true),
      multiSelect: z.boolean().optional().default(true).describe("Allow selecting multiple NBS types"),
      siteHazards: z.object({
        flood: z.number().min(0).max(1),
        heat: z.number().min(0).max(1),
        landslide: z.number().min(0).max(1),
      }).optional().describe("Hazard scores from Phase 2 to rank types by relevance. landslide = the site's landslide HAZARD (terrain susceptibility), NOT the risk — so slope-stabilizing NbS surface on the morros."),
      recommendedTypes: z.array(z.string()).optional().describe("Legacy: ordered list of recommended TYPE ids; mapped to famílias. Prefer recommendedFamilias."),
      recommendedFamilias: z.array(z.string()).optional().describe("Ordered list of recommended FAMÍLIA ids from guidance mode: aguas-pluviais, verde-urbano, agricultura-urbana, encostas-e-solo, recuperacao-ecossistemas. First 2 get 'Recommended' badge and start expanded."),
      maxRecommendations: z.number().optional().default(2).describe("How many famílias to badge as Recommended (default 2)"),
    },
    async (args: any) => {
      // Same engine fence as open_map: the selector is an Encontro 3+ tool.
      const selState = getCboState(cboId);
      if ((selState?.phase ?? 0) < 3) {
        return { content: [{ type: "text" as const, text: `BLOCKED: open_intervention_selector is an Encontro 3+ tool and this org is still in phase ${selState?.phase ?? 0}. Do NOT simulate a later encontro. Tell the user the next encontro will appear as a green card here in the chat once their coordinator opens it, then END your turn.` }] };
      }
      pushEvent({
        type: 'open_intervention_selector',
        params: {
          prompt: args.prompt,
          preSelectedType: args.preSelectedType,
          showCaseStudies: args.showCaseStudies ?? true,
          multiSelect: args.multiSelect ?? true,
          siteHazards: args.siteHazards,
          recommendedTypes: args.recommendedTypes,
          recommendedFamilias: args.recommendedFamilias,
          maxRecommendations: args.maxRecommendations ?? 2,
        },
      });
      return { content: [{ type: "text" as const, text: `Intervention selector opened (multi-select enabled). STOP and wait for selection.` }] };
    },
    { annotations: { readOnlyHint: true } }
  );

  return sdkCreateMcpServer({
    name: "cbo",
    version: "1.0.0",
    tools: [updateSection, confirmDocFields, flagGap, setPhase, setPath, setMaturityTier, showInterventionTypes, showNbsFamilias, showFamiliaRecommendation, showExamples, askPriorityRank, askCommunityAnchoring, askUser, openMap, scoreMaturity, setPriorityFlag, readKnowledge, searchKnowledge, listOrgDocuments, readOrgDocument, searchOrgDocuments, openInterventionSelector],
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

// ── Skip mechanism: [SKIP TO phase:X] ────────────────────────────────────────
// Pre-fills previous phases with CEA Bom Jesus sample data and jumps to target phase.
// Supports: 1, 2, 3a, 3b, 3c, 4, 5

const SKIP_PATTERN = /^\[SKIP TO phase:(\w+)\]/i;

const SAMPLE_CBO_DATA: Record<string, Record<string, { value: string; confidence: 'high' | 'medium'; source?: string }>> = {
  org_profile: {
    org_name: { value: 'CEA Bom Jesus', confidence: 'high', source: 'sample' },
    org_type: { value: 'ONG / Organização Não-Governamental', confidence: 'high', source: 'sample' },
    mission: { value: 'Gestão de resíduos sólidos, energia renovável e economia circular na comunidade Bom Jesus, Porto Alegre', confidence: 'high', source: 'sample' },
    team_size: { value: '12 membros (8 remunerados, 4 voluntários)', confidence: 'medium', source: 'sample' },
    years_active: { value: '6 anos (desde 2020)', confidence: 'high', source: 'sample' },
    prior_projects: { value: 'Cooperativa de reciclagem (2020-presente), Horta comunitária Bom Jesus (2022), Capacitação em compostagem (2023)', confidence: 'medium', source: 'sample' },
    contact_name: { value: 'Maria Santos', confidence: 'high', source: 'sample' },
    contact_role: { value: 'Coordenadora', confidence: 'high', source: 'sample' },
    contact_email: { value: 'maria@ceabomjesus.org.br', confidence: 'high', source: 'sample' },
  },
  intervention_site: {
    neighborhood: { value: 'Arquipélago (Ilhas)', confidence: 'high', source: 'map selection' },
    area: { value: '2.5 hectares', confidence: 'medium', source: 'map selection' },
    current_conditions: { value: 'Área degradada próxima ao arroio, com vegetação rasteira e acúmulo de resíduos. Solo argiloso, parcialmente inundável durante cheias.', confidence: 'medium', source: 'sample' },
    population: { value: 'Aproximadamente 3.200 moradores no entorno direto', confidence: 'medium', source: 'sample' },
    land_tenure: { value: 'Terreno público municipal com cessão de uso pendente', confidence: 'medium', source: 'sample' },
    community_engagement: { value: 'Modelo cooperativo com assembleia mensal e núcleos por rua', confidence: 'high', source: 'sample' },
  },
  intervention_type: {
    nbs_type: { value: 'wetland-restoration', confidence: 'high', source: 'intervention selector' },
    problem: { value: 'Inundações recorrentes no bairro Arquipélago, agravadas pelas enchentes de 2024. Água contaminada do arroio afeta a saúde da comunidade.', confidence: 'high', source: 'sample' },
    description: { value: 'Restauração de área úmida (várzea) ao longo do arroio, com plantio de espécies nativas para filtragem natural da água e retenção de cheias. Inclui construção de caminhos elevados e espaço de educação ambiental.', confidence: 'medium', source: 'sample' },
    scale: { value: '2.5 ha de área úmida restaurada, 800 mudas nativas, 3 bacias de retenção', confidence: 'medium', source: 'sample' },
  },
  impact_monitoring: {
    impact_areas: { value: 'Redução de inundação, melhoria da qualidade da água, biodiversidade, saúde pública', confidence: 'medium', source: 'sample' },
    expected_outcomes: { value: 'Redução de 40-60% do volume de enchente local, filtragem natural reduzindo coliformes em 70%, habitat para fauna ribeirinha', confidence: 'medium', source: 'knowledge benchmarks' },
    baseline: { value: 'Nível de inundação medido em 2024 (1.2m acima do normal). Análise de qualidade da água pendente.', confidence: 'medium', source: 'sample' },
    monitoring_plan: { value: 'Medição mensal do nível da água, análise trimestral de qualidade, contagem anual de espécies', confidence: 'medium', source: 'sample' },
  },
  operations_sustain: {
    operations_model: { value: 'Manutenção por equipe comunitária com apoio técnico da prefeitura', confidence: 'medium', source: 'sample' },
    maintenance: { value: 'Limpeza semanal, replantio trimestral, monitoramento mensal das bacias', confidence: 'medium', source: 'sample' },
    sustainability_model: { value: 'Combinação: taxa municipal de drenagem (40%), ecoturismo educacional (30%), pagamento por serviços ambientais (30%)', confidence: 'medium', source: 'sample' },
    timeline_start: { value: '2025-06', confidence: 'medium', source: 'sample' },
    timeline_milestones: { value: 'Limpeza do terreno (Jun 2025), Plantio fase 1 (Set 2025), Bacias de retenção (Dez 2025), Inauguração (Mar 2026)', confidence: 'medium', source: 'sample' },
  },
  needs_assessment: {
    technical_needs: { value: 'Projeto hidráulico detalhado, seleção de espécies nativas, engenharia das bacias de retenção', confidence: 'medium', source: 'sample' },
    financial_gap: { value: 'Custo total estimado: R$ 480.000. Já obtido: R$ 120.000 (edital FEPAM). Faltam: R$ 360.000', confidence: 'medium', source: 'sample' },
    regulatory_status: { value: 'Licença ambiental em análise na SMAMUS. Prefeito visitou o local em fevereiro.', confidence: 'medium', source: 'sample' },
  },
};

function applySkipData(state: CboState, targetPhase: string): { phase: number; agentMessage: string } {
  // Map phase labels to ordered phases
  const phaseOrder = ['1', '2', '3a', '3b', '3c', '4', '5'];
  const phaseToNumber: Record<string, number> = { '1': 1, '2': 2, '3a': 3, '3b': 3, '3c': 3, '4': 4, '5': 5 };
  const phaseToSection: Record<string, string> = {
    '1': 'org_profile', '2': 'intervention_site', '3a': 'intervention_type',
    '3b': 'impact_monitoring', '3c': 'operations_sustain', '4': 'needs_assessment', '5': 'results_evidence',
  };

  const targetIdx = phaseOrder.indexOf(targetPhase.toLowerCase());
  if (targetIdx === -1) return { phase: 1, agentMessage: `Unknown phase "${targetPhase}". Starting from Phase 1.` };

  // Fill all sections before the target phase
  const filledSections: string[] = [];
  for (let i = 0; i < targetIdx; i++) {
    const sectionId = phaseToSection[phaseOrder[i]];
    const sampleData = SAMPLE_CBO_DATA[sectionId];
    if (sampleData && state.sections[sectionId as keyof typeof state.sections]) {
      const section = state.sections[sectionId as keyof typeof state.sections];
      for (const [field, data] of Object.entries(sampleData)) {
        section.fields[field] = { value: data.value, confidence: data.confidence, source: data.source, userEdited: false };
      }
      section.confidence = 'medium';
      section.lastUpdatedBy = 'agent';
      filledSections.push(sectionId);
    }
  }

  // Set org name from sample data
  state.orgName = 'CEA Bom Jesus';
  state.phase = phaseToNumber[targetPhase.toLowerCase()] || 1;

  const phaseNum = phaseToNumber[targetPhase.toLowerCase()];
  const subPhase = targetPhase.toLowerCase().includes('a') ? 'a' : targetPhase.toLowerCase().includes('b') ? 'b' : targetPhase.toLowerCase().includes('c') ? 'c' : '';

  return {
    phase: phaseNum,
    agentMessage: `[SKIP] Pre-filled ${filledSections.length} sections with CEA Bom Jesus sample data. Now at Phase ${phaseNum}${subPhase}. Continue the interview from this phase. The user is testing — proceed as if previous phases were completed naturally.`,
  };
}

// ── Instant E2 entry (W2 latency) ─────────────────────────────────────────────
// Turn 1 of Encontro 2 is fully scripted by the skill (greeting line + types
// strip + fixed continue/skip chips — improvisation is explicitly forbidden
// there), yet it cost a heavy 10-17s model turn. Serve it as a template with
// zero model time. Copy mirrors encontro-2.md Turn 1 verbatim, including the
// needs-help branch (no skip chip — they need the grounding). The events flow
// through the normal pushEvent, so persistence (chat + composers) and reload
// behavior are identical to an agent-produced turn. Returns false to fall
// through to the model (already-shown strip, lookup errors).
const e2EntryInFlight = new Set<string>();
// ============================================================================
// E2 linear flow — server-templated checkpoints
// ============================================================================
// The W2 redesign (2026-07-16): chat → mapa → chat, one job per map session,
// every stage boundary a deterministic template. The step is DERIVED from the
// saved intervention_site fields — not a counter — so resume, park-and-return
// ("vou verificar e volto"), and old mid-flow transcripts are all free. The
// model only converses inside the describe stage (free follow-ups, uploads)
// and the "quero ajustar" branches; everything else never reaches it.

const E2C: Record<string, { pt: string; en: string; desc?: { pt: string; en: string } }> = {
  umBairro: { pt: 'Um bairro', en: 'One neighborhood' },
  maisDeUm: { pt: 'Mais de um', en: 'More than one' },
  simTenho: { pt: 'Sim, tenho um lugar', en: 'Yes, I have a place' },
  aindaNao: { pt: 'Ainda não', en: 'Not yet' },
  pedirApoio: { pt: 'Pedir apoio à coordenação', en: 'Ask the coordination for help' },
  voltoDepois: { pt: 'Vou verificar e volto', en: "I'll check and come back" },
  jaTenho: { pt: 'Já sei o lugar', en: 'I know the place now' },
  confirmar: { pt: 'Confirmar ✓', en: 'Confirm ✓' },
  outroTipo: { pt: 'É outro tipo de lugar', en: "It's a different kind of place" },
  outroLugar: { pt: 'Escolher outro lugar', en: 'Pick another place' },
  temArquivos: { pt: 'Tenho arquivos pra anexar', en: 'I have files to attach' },
  semArquivos: { pt: 'Não tenho agora', en: "I don't have any right now" },
  prontoSeguir: { pt: 'Pronto, pode seguir', en: "Done, let's continue" },
  fazSentido: { pt: 'Faz sentido', en: 'Makes sense' },
  queroAjustar: { pt: 'Quero ajustar', en: 'I want to adjust' },
  prontoLista: { pt: 'Pronto ✓', en: 'Done ✓' },
  outroPapel: { pt: 'Outro papel', en: 'Another role' },
  podePerguntar: { pt: 'Pode perguntar', en: 'Go ahead and ask' },
};

// current_use / land_tenure enum chips (un-deferred from the old Beat 2b/3b —
// they ARE the "describe your site" questions of the sketch).
const E2_CURRENT_USE: Array<{ id: string; pt: string; en: string }> = [
  { id: 'vegetated', pt: 'Vegetação (área verde, mato, árvores)', en: 'Vegetation (green area, brush, trees)' },
  { id: 'paved', pt: 'Pavimentado / impermeabilizado', en: 'Paved / sealed' },
  { id: 'mixed', pt: 'Misto (vegetação + pavimentação)', en: 'Mixed (vegetation + paving)' },
  { id: 'abandoned', pt: 'Abandonado / degradado', en: 'Abandoned / degraded' },
  { id: 'under-construction', pt: 'Em construção', en: 'Under construction' },
];
const E2_TENURE: Array<{ id: string; pt: string; en: string }> = [
  { id: 'private-owned', pt: 'Sim, somos donas do terreno', en: 'Yes, we own the land' },
  { id: 'formal-agreement', pt: 'Sim, com acordo formal', en: 'Yes, with a formal agreement' },
  { id: 'public-informal', pt: 'É da prefeitura, mas a gente usa', en: "It's the city's, but we use it" },
  { id: 'public-no-access', pt: 'É público mas não temos acesso garantido', en: "It's public but access isn't guaranteed" },
  { id: 'mixed', pt: 'Misto / não sei certinho', en: 'Mixed / not sure' },
];
// Implementation-role chips for the interest step (2026-07-16 biweekly: orgs
// signal preferred roles before Workshop 3 so the coordination can cluster the
// portfolio by role and scale). The taxonomy is the meeting's placeholder set —
// pending Robson/Belén confirmation; labels are a data-only change.
const E2_ROLES: Array<{ id: string; pt: string; en: string }> = [
  { id: 'ser-consultada', pt: 'Ser consultada (dar opinião)', en: 'Be consulted (give input)' },
  { id: 'escrever-projeto', pt: 'Escrever o projeto', en: 'Write the project' },
  { id: 'receber-administrar', pt: 'Receber e administrar recursos', en: 'Receive and manage the funds' },
  { id: 'executar', pt: 'Executar / implementar', en: 'Implement on the ground' },
  { id: 'articular-parceiros', pt: 'Articular parceiros', en: 'Coordinate partners' },
];

const normChip = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function writeE2Fields(cboId: string, state: CboState, fields: Record<string, string>, pushEvent: EventPusher, source = 'user') {
  const section = state.sections.intervention_site;
  if (!section) return;
  for (const [k, v] of Object.entries(fields)) {
    const oldValue = section.fields[k]?.value ?? null;
    section.fields[k] = { value: v, confidence: 'high', source, userEdited: false };
    state.editLog.push({ timestamp: new Date().toISOString(), sectionId: 'intervention_site', field: k, oldValue, newValue: v, source: 'agent' });
    state.gaps = state.gaps.filter(g => !(g.sectionId === 'intervention_site' && g.field === k));
    pushEvent({ type: 'field_update', sectionId: 'intervention_site', field: k, value: v, confidence: 'high', source });
  }
  section.lastUpdatedBy = 'agent';
  setCboState(cboId, state);
  debouncedPersist(cboId);
}

/** Server-computed recommendation items; model-passed whys override per família. */
function buildFamiliaRecoItems(state: CboState, lang: string, modelItems?: Array<{ familiaId: string; why: string }>) {
  const f = state.sections.intervention_site?.fields ?? {} as any;
  const pct = (k: string) => Math.max(0, Math.min(100, parseInt(String(f[k]?.value ?? '0'), 10) || 0));
  const bairro = String(f.bairro?.value ?? '').split(',')[0].trim() || (lang === 'pt' ? 'seu bairro' : 'your neighborhood');
  // The W2 read-back corrections override the bairro means — see the comment on
  // FamiliaRecoInput.corrections. Without this the org corrects our data and
  // the recommendation visibly ignores them, one turn after we said their
  // answer counts for more than our number.
  let corrections: Record<string, any> | undefined;
  try { corrections = JSON.parse(String(f._hazard_check_json?.value ?? '')) || undefined; } catch { corrections = undefined; }
  const ranked = rankFamiliasForSite({
    risks: { flood: pct('_bairro_flood_pct'), heat: pct('_bairro_heat_pct'), landslide: pct('_bairro_landslide_pct') },
    bairro,
    currentUse: String(f.current_use?.value ?? '') || undefined,
    siteName: String(f.site_name?.value ?? '') || undefined,
    corrections,
    worries: String(f.site_worry?.value ?? '').split(',').map(s => s.trim()).filter(Boolean),
  });
  const overrides = new Map((modelItems ?? []).map(i => [i.familiaId, i.why]));
  // All five ship. The old slice(0, 3) sat directly beneath a line promising
  // "nada fica descartado", and it hid the one família that answered the
  // hazard Coletivo Encosta Viva had just named (scenario test, 2026-07-31).
  // A família answering a stated worry can never be marked weak.
  return ranked.map(r => ({
    familiaId: r.familiaId,
    why: overrides.get(r.familiaId) ?? (lang === 'pt' ? r.why.pt : r.why.en),
    exampleSolutionIds: r.exampleSolutionIds,
    ...(r.weak && !r.guaranteed ? { weak: true } : {}),
  }));
}

/** Cap on a single photo sent to the ranker. Above this the request gets slow
 *  and expensive for no gain — the model is looking for standing water and bare
 *  pavement, not reading a sign. */
const RANKER_PHOTO_MAX_BYTES = 1_500_000;

/**
 * The org's site photos, as data URLs for the ranking call.
 *
 * We asked them to walk their own site and photograph it. Until now those
 * photos informed nothing downstream of the chat turn they arrived in. Reads
 * the durable blob original; a photo whose bytes are gone is simply skipped.
 */
async function sitePhotosForRanking(
  cboId: string,
): Promise<Array<{ filename: string; dataUrl: string }>> {
  try {
    const orgId = await getOrgIdForCboState(cboId);
    const docs = await listDocumentsForScope({ cboStateId: cboId, orgId: orgId ?? undefined });
    const images = docs
      .filter(d => d.kind === 'image' && d.storageKey)
      .filter(d => !d.sizeBytes || d.sizeBytes <= RANKER_PHOTO_MAX_BYTES)
      .slice(0, 3);
    const out: Array<{ filename: string; dataUrl: string }> = [];
    for (const d of images) {
      const buf = await getObject(d.storageKey!).catch(() => null);
      if (!buf) continue;
      const mime = d.mimeType || 'image/jpeg';
      out.push({ filename: d.filename, dataUrl: `data:${mime};base64,${buf.toString('base64')}` });
    }
    return out;
  } catch (e: any) {
    console.error('[cbo] sitePhotosForRanking failed:', e?.message || e);
    return [];
  }
}

/** Short excerpts from the org's uploaded documents, for the ranking call. */
async function siteDocExcerpts(cboId: string): Promise<string[]> {
  try {
    const orgId = await getOrgIdForCboState(cboId);
    const docs = await listDocumentsForScope({ cboStateId: cboId, orgId: orgId ?? undefined });
    return docs
      .filter(d => d.kind !== 'image' && (d.summary || d.fullText))
      .slice(0, 2)
      .map(d => String(d.summary || d.fullText).replace(/\s+/g, ' ').trim().slice(0, 600))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Assemble the org's full context and rank the famílias over it, then persist
 * BOTH that ranking and the deterministic baseline.
 *
 * Persisting both is what pays for putting a model in this position. A model
 * ranking cannot be recomputed later — two runs can differ — so instead of
 * deriving the reasoning after the fact we record it: `_reco_json` holds the
 * served list, which ranker produced it, why it fell back if it did, and the
 * baseline it would otherwise have shown. That is what lets a coordinator (and
 * the context-bundle export) answer "the photos and the voice note — what did
 * they change?" with evidence rather than an assumption.
 */
async function buildFamiliaReco(
  state: CboState,
  lang: string,
  cboId: string,
): Promise<FamiliaRankingResult> {
  const f = state.sections.intervention_site?.fields ?? ({} as any);
  const v = (k: string) => String(f[k]?.value ?? '').trim();
  const pct = (k: string) => Math.max(0, Math.min(100, parseInt(v(k), 10) || 0));
  const l: 'pt' | 'en' = lang === 'pt' ? 'pt' : 'en';

  let corrections: Record<string, any> | undefined;
  try { corrections = JSON.parse(v('_hazard_check_json')) || undefined; } catch { corrections = undefined; }

  const worries = v('site_worry').split(',').map(s => s.trim()).filter(Boolean);
  const baseline = {
    risks: { flood: pct('_bairro_flood_pct'), heat: pct('_bairro_heat_pct'), landslide: pct('_bairro_landslide_pct') },
    bairro: v('bairro').split(',')[0].trim() || (l === 'pt' ? 'seu bairro' : 'your neighborhood'),
    currentUse: v('current_use') || undefined,
    siteName: v('site_name') || undefined,
    corrections,
    worries,
  };

  const org = state.sections.org_profile?.fields ?? ({} as any);
  const canRun = rankerCanRun();
  const result = await rankFamiliasWithContext({
    lang: l,
    baseline,
    // The voice note. The whole reason this function exists.
    story: v('site_story') || undefined,
    worries,
    corrections,
    landTenure: v('land_tenure') || undefined,
    orgMission: String(org.mission_summary?.value ?? '').trim() || undefined,
    // Only assemble the expensive context when it can actually be used —
    // gathering the photos reads every blob original, and without this guard
    // the beat paid for it on every run that was always going to fall back.
    photos: canRun ? await sitePhotosForRanking(cboId) : [],
    docExcerpts: canRun ? await siteDocExcerpts(cboId) : [],
  });

  // Record what was served and what the arithmetic alone would have said.
  try {
    const deterministic = rankFamiliasForSite(baseline);
    writeE2Fields(cboId, state, {
      _reco_json: JSON.stringify({
        source: result.source,
        ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
        served: result.items.map(i => i.familiaId),
        baseline: deterministic.map(d => d.familiaId),
        usedStory: !!v('site_story'),
        at: new Date().toISOString(),
      }),
    }, () => {});
  } catch { /* recording must never break the beat */ }

  return result;
}

/**
 * What the org has already shared. An organization that uploaded a proposal or
 * a site description may have answered the diagnostic's questions before we
 * asked them — re-asking reads as not having looked, which is exactly the
 * "people keep engaging us and nothing comes of it" dynamic Antônia flagged
 * (2026-07-16). Fetched only inside the beats that need it, never on every turn.
 */
async function siteDocsBrief(cboId: string): Promise<{ count: number; images: number; names: string[] }> {
  try {
    // Scope by the SESSION as well as the org. An org link is not guaranteed to
    // exist by the time someone uploads, and the org-only lookup then reports
    // zero documents for a file that is sitting in the user's own drawer — so
    // the agent asks "tell me about this place" seconds after they sent a note
    // describing it, which is exactly the "you didn't read it" moment this beat
    // exists to prevent. The CBO's own /documents route already scopes this way.
    const orgId = await getOrgIdForCboState(cboId);
    const docs = await listDocumentsForScope({ cboStateId: cboId, orgId: orgId ?? undefined });
    return {
      count: docs.length,
      images: docs.filter(d => d.kind === 'image').length,
      names: docs.slice(0, 3).map(d => d.filename),
    };
  } catch (e: any) {
    console.error('[cbo] siteDocsBrief failed:', e?.message || e);
    return { count: 0, images: 0, names: [] };
  }
}

/**
 * intervention_site values that came out of a document and were never confirmed
 * by a person. The doc-staging gate covers org_profile only, so these commit
 * unstaged — evidence, not testimony, until someone says otherwise.
 */
function unconfirmedDocSiteFields(state: CboState): string[] {
  const fields = state.sections.intervention_site?.fields ?? {};
  return Object.entries(fields)
    .filter(([name, f]: [string, any]) => !name.startsWith('_') && f?.source === 'document')
    .map(([name]) => name);
}

/**
 * A sentence from the org's own uploaded files that bears on `topic`, so a
 * templated question can open with what they already wrote instead of asking
 * from zero.
 *
 * Quotes, never infers. We return THEIR sentence and still ask the same
 * question with the same chips — the skill's rule that tenure and current use
 * come from the person rather than a PDF stands, because both feed the
 * site_control score and a model's reading of a proposal is evidence, not
 * testimony. Leading with the quote only removes the feeling of not having
 * been read.
 */
const DOC_TOPIC_PATTERNS: Record<string, RegExp> = {
  tenure: /\b(prefeitura|munic[ií]pio|cedid[oa]|comodato|alugad[oa]|arrendad[oa]|terreno (?:nosso|próprio|da associação)|área pública|escritura|posse|autoriza(?:ção|do)|tapume)\b/i,
  current_use: /\b(baldio|abandonad[oa]|entulho|cimentad[oa]|pavimentad[oa]|asfaltad[oa]|mato|vegeta(?:ção|do)|gramado|quadra|pátio|horta já)\b/i,
};

async function docQuoteFor(cboId: string, topic: 'tenure' | 'current_use'): Promise<string | null> {
  try {
    const orgId = await getOrgIdForCboState(cboId);
    const docs = await listDocumentsForScope({ cboStateId: cboId, orgId: orgId ?? undefined });
    const re = DOC_TOPIC_PATTERNS[topic];
    // Bounded on purpose: these rows carry fullText, which for a doc-heavy org
    // is megabytes (the same trap buildDocumentsBlock avoids by selecting
    // summaries). This runs on exactly two turns, so cap the work rather than
    // scanning an entire locker for a sentence.
    for (const d of docs.slice(0, 4)) {
      const text = String((d as any).fullText ?? '').slice(0, 40_000).replace(/\s+/g, ' ');
      if (!text) continue;
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        const s = sentence.trim();
        // Long enough to be a real statement, short enough to quote on a phone.
        if (s.length < 25 || s.length > 190) continue;
        if (re.test(s)) return s;
      }
    }
    return null;
  } catch (e: any) {
    console.error('[cbo] docQuoteFor failed:', e?.message || e);
    return null;
  }
}

/** The E1 triage answer, so E2 stops re-asking what it already established. */
async function getCboPath(cboId: string): Promise<string | null> {
  try {
    const rows = await db.select({ path: cohortMembers.path })
      .from(cohortMembers).where(eq(cohortMembers.cboStateId, cboId)).limit(1);
    return (rows[0]?.path as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** File a coordinator support request from the "pedir apoio" chip. */
async function createSiteSupportRequest(cboId: string, lang: string): Promise<boolean> {
  try {
    const rows = await db.select().from(cohortMembers).where(eq(cohortMembers.cboStateId, cboId)).limit(1);
    const member = rows[0];
    if (!member) return false;
    const entry: SupportRequest = {
      id: nanoid(12),
      type: 'coordinator-chat',
      message: lang === 'pt'
        ? 'E2: a organização ainda não tem um lugar específico e pediu apoio pra encontrar um.'
        : 'E2: the organization has no specific site yet and asked for help finding one.',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      resolvedNote: null,
    };
    const existing = Array.isArray(member.supportRequests) ? (member.supportRequests as SupportRequest[]) : [];
    let next = [...existing, entry];
    if (next.length > 20) {
      const resolvedIdx = next.findIndex(r => !!r.resolvedAt);
      next.splice(resolvedIdx >= 0 ? resolvedIdx : 0, 1);
    }
    await db.update(cohortMembers).set({ supportRequests: next }).where(eq(cohortMembers.id, member.id));
    return true;
  } catch {
    return false;
  }
}

async function serveE2Checkpoint(
  cboId: string,
  userMessage: string,
  state: CboState,
  pushEvent: EventPusher,
  lang: string,
  turnKind?: string,
): Promise<boolean> {
  if (state.phase !== 2) return false;
  const isPt = lang === 'pt';
  const raw = userMessage.split('\n[LANGUAGE:')[0].trim();
  const fields = state.sections.intervention_site?.fields ?? ({} as Record<string, any>);
  const val = (k: string) => String(fields[k]?.value ?? '').trim();
  const bairro = val('bairro');
  const siteName = val('site_name');
  const currentUse = val('current_use');
  const tenure = val('land_tenure');
  const pickedFamilias = val('nbs_interest') ? val('nbs_interest').split(',').map(s => s.trim()).filter(Boolean) : [];
  const pickedRoles = val('role_preference') ? val('role_preference').split(',').map(s => s.trim()).filter(Boolean) : [];

  const say = (pt: string, en: string) => pushEvent({ type: 'chat', content: isPt ? pt : en, role: 'assistant' } as any);
  // `action` is the seam that lets a TEMPLATED checkpoint offer a chip that does
  // something client-side as well as answering. It already existed end to end —
  // declared on the ask_user option type, accepted by the model's tool, and
  // honoured by the chip renderer (cbo-profile.tsx: `opt.action === 'upload'`
  // opens the file picker) — but this helper flattened every option down to
  // label + description, so no server checkpoint could ever set it. The result
  // was the dead step JVP hit twice: tapping "Tenho arquivos pra anexar"
  // answered the question and then told you to go find the 📎 yourself.
  //
  // Deliberately additive: the chip still posts its message. The checkpoint
  // machine derives its position from the answers, so a chip that only opened a
  // picker without answering would strand the flow.
  const ask = (
    qPt: string,
    qEn: string,
    opts: Array<{ pt: string; en: string; dPt?: string; dEn?: string; action?: 'upload_then_answer' }>,
  ) =>
    pushEvent({
      type: 'ask_user',
      question: isPt ? qPt : qEn,
      options: opts.map(o => ({
        label: isPt ? o.pt : o.en,
        description: isPt ? (o.dPt ?? '') : (o.dEn ?? ''),
        ...(o.action ? { action: o.action } : {}),
      })),
    } as any);
  const finish = (detail: string): true => {
    pushEvent({ type: 'done', summary: `E2 checkpoint (${detail})` } as any);
    console.log(`[cbo] timing for ${cboId}: model=template rounds=0 first_event=0ms total=0ms kind=system detail=e2-${detail}`);
    return true;
  };
  const openMapPreset = (args: Record<string, unknown>) =>
    pushEvent({ type: 'open_map', params: resolveOpenMapParams(args as any, isPt ? 'pt' : 'en') } as any);

  // ── Interest + role loops (2026-07-16 biweekly commitment for Aug 12) ──────
  // After the famílias recommendation, orgs mark which famílias they'd want a
  // project in and the role(s) they'd play. Multi-pick via chip loops: every
  // pick re-offers what's left plus "Pronto ✓" — templated, park/resume-safe.
  const askInterest = (picked: string[]) => {
    const opts = NBS_FAMILIAS.filter(f => !picked.includes(f.id)).map(f => ({ pt: f.pt.label, en: f.en.label })) as Array<{ pt: string; en: string; dPt?: string; dEn?: string }>;
    if (picked.length > 0) opts.push({ pt: E2C.prontoLista.pt, en: E2C.prontoLista.en, dPt: 'Fechar a lista', dEn: 'Close the list' });
    ask(
      picked.length === 0
        ? 'Em quais famílias vocês teriam interesse em tocar um projeto? Pode marcar mais de uma — toca numa por vez.'
        : 'Marcado ✓ Mais alguma?',
      picked.length === 0
        ? 'Which famílias would you be interested in running a project on? You can pick more than one — tap one at a time.'
        : 'Noted ✓ Any other?',
      opts,
    );
  };
  const askRoles = (picked: string[], intro: boolean) => {
    if (intro)
      say(
        'Fechou. E que **papel a organização** quer ter na execução desses projetos? Também pode marcar mais de um.',
        'Got it. And what **role does the organization** want in delivering these projects? You can pick more than one too.',
      );
    const opts = E2_ROLES.filter(r => !picked.includes(r.id)).map(r => ({ pt: r.pt, en: r.en })) as Array<{ pt: string; en: string; dPt?: string; dEn?: string }>;
    opts.push({ pt: E2C.outroPapel.pt, en: E2C.outroPapel.en, dPt: 'Me conta qual', dEn: 'Tell me which' });
    if (picked.length > 0) opts.push({ pt: E2C.prontoLista.pt, en: E2C.prontoLista.en, dPt: 'Fechar a lista', dEn: 'Close the list' });
    ask(
      picked.length === 0 ? 'Que papel a organização imagina?' : 'Marcado ✓ Mais algum papel?',
      picked.length === 0 ? 'What role do you imagine?' : 'Noted ✓ Any other role?',
      opts,
    );
  };
  // ── W2 diagnostic beats (/refine 2026-07-31) ──────────────────────────────
  // Frame → worry → story → photos → read-back. See shared/site-knowledge.ts for
  // why this order and not the reverse: the platform states its own coarseness
  // first and exposes itself to correction, rather than quizzing the org.
  const risks: Record<HazardKey, number> = {
    flood: Math.max(0, Math.min(100, parseInt(val('_bairro_flood_pct'), 10) || 0)),
    heat: Math.max(0, Math.min(100, parseInt(val('_bairro_heat_pct'), 10) || 0)),
    landslide: Math.max(0, Math.min(100, parseInt(val('_bairro_landslide_pct'), 10) || 0)),
  };
  const pickedWorries = val('site_worry') ? val('site_worry').split(',').map(s => s.trim()).filter(Boolean) : [];
  const hazardChecks: Partial<Record<HazardKey, HazardCheckAnswer>> = (() => {
    try { return JSON.parse(val('_hazard_check_json') || '{}'); } catch { return {}; }
  })();

  const askWorry = (picked: string[]) => {
    const remaining = orderWorriesByData(risks).filter(w => !picked.includes(w.id));
    const opts = remaining.map(w => ({ pt: w.pt, en: w.en, dPt: w.dPt, dEn: w.dEn })) as Array<{ pt: string; en: string; dPt?: string; dEn?: string }>;
    if (picked.length > 0) opts.push({ pt: E2C.prontoLista.pt, en: E2C.prontoLista.en, dPt: 'Fechar', dEn: 'Close' });
    ask(
      picked.length === 0 ? 'O que mais preocupa vocês nesse lugar?' : 'Marcado ✓ Mais alguma coisa?',
      picked.length === 0 ? 'What worries you most about this place?' : 'Noted ✓ Anything else?',
      opts,
    );
  };

  const askStory = async () => {
    writeE2Fields(cboId, state, { _story_pending: 'yes' }, pushEvent);
    const docs = await siteDocsBrief(cboId);
    // If they already sent something, say so first. Asking as though the file
    // never arrived is the fastest way to look like we didn't read it.
    const seen = docs.count > 0
      ? {
          pt: `Vi que vocês já mandaram ${docs.count === 1 ? 'um arquivo' : `${docs.count} arquivos`} (${docs.names.join(', ')}) — já dei uma lida. `,
          en: `I can see you already sent ${docs.count === 1 ? 'a file' : `${docs.count} files`} (${docs.names.join(', ')}) — I've read through them. `,
        }
      : { pt: '', en: '' };
    say(
      `${seen.pt}Agora me conta desse lugar com as palavras de vocês — pode **gravar um áudio** no microfone aqui embaixo, ou escrever.\n\n_Coisas que ajudam, se vierem à cabeça: o que acontece quando chove forte, quem usa o espaço, o que já tem plantado ou construído ali._`,
      `${seen.en}Now tell me about this place in your own words — you can **record a voice note** with the microphone below, or type.\n\n_Things that help, if they come to mind: what happens when it rains hard, who uses the space, what is already planted or built there._`,
    );
    ask('Quando quiser:', 'Whenever you like:', [
      ...(docs.count > 0
        ? [{ pt: 'Já está no arquivo', en: "It's in the file", dPt: 'Uso o que vocês mandaram', dEn: "I'll use what you sent" }]
        : []),
      { pt: 'Prefiro pular', en: "I'd rather skip", dPt: 'Sem problema', dEn: 'No problem' },
    ]);
  };

  /** The diagnostic runs at bairro level too, when no site is pinned yet. */
  const hasSite = !!siteName;
  const placeWord = () => (hasSite ? (isPt ? 'lugar' : 'place') : (isPt ? 'bairro' : 'neighborhood'));

  const askPhotos = async () => {
    const docs = await siteDocsBrief(cboId);
    const prompts = photoPromptsFor(pickedWorries);
    const lines = prompts.map(p => `- ${isPt ? p.pt : p.en}`).join('\n');
    const already = docs.images > 0
      ? {
          pt: `Vocês já mandaram ${docs.images === 1 ? 'uma imagem' : `${docs.images} imagens`}. Se der pra completar, essas ajudariam:`,
          en: `You've already sent ${docs.images === 1 ? 'an image' : `${docs.images} images`}. If you can round it out, these would help:`,
        }
      : hasSite
        ? {
            pt: 'Se em algum momento vocês estiverem lá com o celular, umas fotos ajudam muito. Sem pressa, e pode pular qualquer uma:',
            en: "If you're ever there with your phone, a few photos would help a lot. No rush, and skip any of them:",
          }
        : {
            // No site pinned yet — anchor the request to whatever in the bairro
            // worries them, so the ask still makes sense.
            pt: 'Se vocês passarem por algum lugar do bairro que preocupa vocês, umas fotos ajudam muito. Sem pressa, e pode pular qualquer uma:',
            en: 'If you pass by somewhere in the neighborhood that worries you, a few photos would help a lot. No rush, and skip any of them:',
          };
    say(`${already.pt}\n\n${lines}`, `${already.en}\n\n${lines}`);
    ask('Como prefere?', 'What works best?', [
      // Opens the file picker on tap AND answers the question — see the note on
      // `ask`. The description no longer instructs them to find the 📎 because
      // the chip does it.
      { pt: E2C.temArquivos.pt, en: E2C.temArquivos.en, dPt: 'Abre pra escolher os arquivos', dEn: 'Opens the file chooser', action: 'upload_then_answer' },
      { pt: 'Mando depois', en: "I'll send later", dPt: 'Fica anotado', dEn: "I'll note it down" },
      ...(docs.images > 0
        ? [{ pt: 'Já mandei o que tinha', en: 'I already sent what I had', dPt: 'Seguir com o que tem', dEn: 'Continue with what we have' }]
        : []),
      { pt: E2C.semArquivos.pt, en: E2C.semArquivos.en, dPt: 'Seguir sem fotos', dEn: 'Continue without photos' },
    ]);
  };

  /** The data side of the read-back — one hazard at a time, max two. */
  const askHazardCheck = (): boolean => {
    const pending = hazardsToCheck(pickedWorries, risks).filter(h => !hazardChecks[h]);
    if (pending.length === 0) return false;
    const h = pending[0];
    // No preamble: beat 0 already said the map is coarse, and the question
    // itself repeats "isso é a média do bairro inteiro". Saying it a third time
    // four turns later reads as filler — and the skill's own voice rules ban it.
    const bn = bairro.split(',')[0].trim();
    ask(
      hazardCheckQuestion(h, risks[h], bn || 'seu bairro', 'pt', hasSite),
      hazardCheckQuestion(h, risks[h], bn || 'your neighborhood', 'en', hasSite),
      HAZARD_CHECK_OPTIONS.map(o => ({ pt: o.pt, en: o.en })),
    );
    return true;
  };

  /**
   * An org with no site used to park here with nothing captured but a bairro
   * name — and those are precisely the orgs the coordination most needs a read
   * on. Offer the diagnostic at bairro level instead, while keeping the "I know
   * the place now" escape one tap away: someone who taps "not yet" and
   * immediately remembers the spot must not be marched through the whole
   * questionnaire first.
   */
  const offerBairroDiagnostic = (detail: string): true => {
    ask(
      'Enquanto isso, posso te perguntar umas coisas sobre o bairro? Ajuda bastante — e se já souberem o lugar, a gente marca no mapa.',
      'In the meantime, can I ask you a few things about the neighborhood? It helps a lot — and if you already know the place, we can mark it on the map.',
      [
        { pt: E2C.podePerguntar.pt, en: E2C.podePerguntar.en, dPt: 'Perguntas rápidas', dEn: 'Quick questions' },
        { pt: E2C.jaTenho.pt, en: E2C.jaTenho.en, dPt: 'Vamos pro mapa', dEn: "Let's go to the map" },
      ],
    );
    return finish(detail);
  };

  /**
   * Beat 0 + 1. Reached two ways: after tenure (site pinned), and after an org
   * says it has no site yet — in which case the whole diagnostic runs at bairro
   * level rather than parking the session with nothing but a bairro name.
   */
  const startDiagnostic = (): true => {
    say(
      `Agora uma coisa importante: o nosso mapa é **grosso** — cada quadradinho dele cobre uns quarteirões inteiros. Ele serve pra comparar bairros, mas não enxerga o ${hasSite ? 'pátio' : 'dia a dia'} de vocês. **Vocês conhecem esse ${placeWord()} muito melhor do que o nosso dado.** Então vou perguntar umas coisas.`,
      `Now something important: our map is **coarse** — each of its squares covers whole blocks. It's useful for comparing neighborhoods, but it can't see your ${hasSite ? 'yard' : 'day to day'}. **You know this ${placeWord()} far better than our data does.** So let me ask you a few things.`,
    );
    writeE2Fields(cboId, state, { _worry_offered: 'yes' }, pushEvent);
    askWorry([]);
    return finish('ask-worry');
  };

  /** Serve the famílias recommendation — the end of the diagnostic. */
  const serveFamiliaReco = async (): Promise<true> => {
    // The line below says "com o que você me contou", so the ranking has to
    // have actually read it. buildFamiliaRecoItems() alone never saw the voice
    // note or the photos — see familiaRanker.ts. This call does, and falls back
    // to exactly the old arithmetic on any failure.
    //
    // It is allowed to take a few seconds. Narrate it: an unexplained pause
    // after someone recorded a voice note reads as the app hanging, and a named
    // one reads as being listened to (JVP, 2026-08-03: fine to take ~15s
    // "especially if the tool call is explicit").
    const thinkingLabel = isPt
      ? 'Lendo o que vocês contaram sobre o lugar…'
      : 'Reading what you told us about the place…';
    pushEvent({
      type: 'thinking_step',
      step: { id: 'familia-ranking', label: thinkingLabel, status: 'active' },
    } as any);
    const ranking = await buildFamiliaReco(state, lang, cboId);
    // Clear the indicator explicitly. The client only drops the label on a
    // non-'active' status, so a turn that ends without this leaves "Lendo o que
    // vocês contaram…" frozen under the finished card.
    pushEvent({
      type: 'thinking_step',
      step: { id: 'familia-ranking', label: thinkingLabel, status: 'complete' },
    } as any);
    const items = ranking.items;
    say(
      'Pra esse lugar, com o que você me contou, vale estudar essas famílias — não é veredito, é convite. **Nada fica descartado**: dá pra ver as 27 soluções quando quiser.',
      "For this place, with what you've told me, these famílias are worth studying — not a verdict, an invitation. **Nothing is ruled out**: you can see all 27 solutions whenever you like.",
    );
    pushEvent({ type: 'show_familia_recommendation', items } as any);
    ask('Faz sentido pra vocês?', 'Does this make sense to you?', [
      { pt: E2C.fazSentido.pt, en: E2C.fazSentido.en },
      { pt: E2C.queroAjustar.pt, en: E2C.queroAjustar.en, dPt: 'Quero mexer na lista', dEn: 'I want to change the list' },
    ]);
    return finish('familia-reco');
  };

  /**
   * The depth read — what W2 hands to W3. Coordinator-facing by decision
   * (2026-07-31): shown to the org it reads as a grade.
   *
   * Recomputed after EVERY beat, not only at the close. Orgs routinely stop
   * once they've seen the famílias, and a read that only exists for sessions
   * that ran all the way through the interest and role loops would be missing
   * for exactly the half-finished sessions the coordination most needs to see.
   */
  const persistDepth = async () => {
    try {
      const docs = await siteDocsBrief(cboId);
      const depth = computeSiteKnowledgeDepth({
        siteConfirmed: val('_site_confirmed') === 'yes',
        worries: pickedWorries,
        story: val('site_story'),
        photoIntent: (val('site_photo_intent') as 'sent' | 'later' | 'skip' | '') || '',
        photoCount: docs.images,
        hazardChecks,
        currentUse,
        tenure,
        risks,
        docCount: docs.count,
        docImageCount: docs.images,
        unconfirmedDocFields: unconfirmedDocSiteFields(state),
      }, isPt ? 'pt' : 'en');
      writeE2Fields(cboId, state, {
        _depth_json: JSON.stringify(depth),
        site_knowledge_depth: depth.level,
      }, pushEvent, 'agent');
    } catch (err) {
      console.error(`[cbo] depth read failed for ${cboId}:`, err);
    }
  };

  const closeE2 = async (): Promise<true> => {
    await persistDepth();
    const nome = String(state.sections.org_profile?.fields?.contact_name?.value || '').trim().split(/\s+/)[0];
    // No site yet: close on the way back in, not on a dead end. This also keeps
    // the turn from ending silent, which would strand a Continue button.
    if (!hasSite) {
      say(
        `✓ **Valeu${nome ? `, ${nome}` : ''}!** Já dá pra trabalhar com o que vocês contaram do **${bairro.split(',')[0].trim()}**.\n\nQuando souberem o lugar exato, é só voltar aqui e me dizer — a gente marca no mapa e afina a partir dele.`,
        `✓ **Thanks${nome ? `, ${nome}` : ''}!** What you told me about **${bairro.split(',')[0].trim()}** is already enough to work with.\n\nWhen you know the exact place, just come back and tell me — we'll mark it on the map and sharpen things from there.`,
      );
      ask('Quando souberem o lugar:', 'When you know the place:', [
        { pt: E2C.jaTenho.pt, en: E2C.jaTenho.en },
      ]);
      return finish('closing-no-site');
    }
    say(
      `✓ **Pronto${nome ? `, ${nome}` : ''}!** Marcamos **${siteName || bairro}** e já sabemos por onde começar a estudar.\n\nNo próximo encontro a gente escolhe juntas a solução que mais combina com esse lugar. Até lá! 🌱`,
      `✓ **Done${nome ? `, ${nome}` : ''}!** We've marked **${siteName || bairro}** and we know where to start studying.\n\nIn the next encontro we'll pick together the solution that best fits this place. See you! 🌱`,
    );
    return finish('closing');
  };

  // ── Map results ────────────────────────────────────────────────────────────
  if (turnKind === 'map' || raw.startsWith('Map selection (')) {
    if (!raw.startsWith('Map selection (composite mode):')) return false;
    if (raw.includes('- [site] DEFERRED')) return false; // legacy "bairro todo" flow → model
    const zones = Array.from(raw.matchAll(/^- \[zone\] (.+?): .*?flood: (\d+)%, heat: (\d+)%, landslide: (\d+)%/gm))
      .map(m => ({ name: m[1].trim(), flood: +m[2], heat: +m[3], landslide: +m[4] }));
    const sites = Array.from(raw.matchAll(/^- \[(osm|custom)\] (.+?)(?: \(drawn area\))? at \((-?[\d.]+), (-?[\d.]+)\)/gm))
      .map(m => ({ kind: m[1] as 'osm' | 'custom', name: m[2].trim(), lat: +m[3], lng: +m[4] }));
    if (zones.length === 0) return false;

    if (sites.length === 0) {
      // CP: bairro confirmed (zone-only session) → the "tem um lugar?" fork.
      // ALL zones persist in _bairros_json (a multi-bairro org picks which one
      // the site is in later); the primary's risks seed the _pct fields until
      // the site session pins them to the site's own bairro.
      const names = zones.map(z => z.name).join(', ');
      const z = zones[0];
      writeE2Fields(cboId, state, {
        bairro: names,
        _bairros_json: JSON.stringify(zones),
        _bairro_flood_pct: String(z.flood),
        _bairro_heat_pct: String(z.heat),
        _bairro_landslide_pct: String(z.landslide),
      }, pushEvent);
      say(`✓ **${names}** confirmado.`, `✓ **${names}** confirmed.`);
      // E1's closing triage already answered this for two of the three paths:
      // 'has-project' is DEFINED as having the site and scope, and
      // 'needs-help' means they explicitly asked for help finding one. Only
      // 'has-idea' is genuinely open. Lead accordingly instead of asking all
      // three the same cold question.
      const e1Path = await getCboPath(cboId);
      if (e1Path === 'has-project') {
        say(
          'Como vocês já têm o projeto definido, vamos direto marcar o lugar dele no mapa.',
          'Since you already have the project defined, let\'s go straight to marking its place on the map.',
        );
        ask('Pode ser?', 'Shall we?', [
          { pt: E2C.simTenho.pt, en: E2C.simTenho.en, dPt: 'Vamos pro mapa', dEn: "Let's go to the map" },
          { pt: E2C.aindaNao.pt, en: E2C.aindaNao.en, dPt: 'Mudou, ainda não temos', dEn: "It changed, not yet" },
        ]);
        return finish('bairro-fork-has-project');
      }
      ask(
        e1Path === 'needs-help'
          ? 'Vocês falaram que queriam ajuda pra achar um lugar. Já apareceu algum, ou seguimos sem ele por enquanto?'
          : 'Vocês já têm um lugar específico onde querem atuar — um terreno, uma praça, um pátio?',
        e1Path === 'needs-help'
          ? 'You said you wanted help finding a place. Has one come up, or do we carry on without it for now?'
          : 'Do you already have a specific place where you want to act — a lot, a square, a yard?',
        e1Path === 'needs-help'
          ? [
              { pt: E2C.aindaNao.pt, en: E2C.aindaNao.en, dPt: 'Seguimos sem ele', dEn: 'Carry on without it' },
              { pt: E2C.simTenho.pt, en: E2C.simTenho.en, dPt: 'Apareceu um lugar', dEn: 'A place came up' },
            ]
          : [
              { pt: E2C.simTenho.pt, en: E2C.simTenho.en, dPt: 'Vamos marcar no mapa', dEn: "Let's mark it on the map" },
              { pt: E2C.aindaNao.pt, en: E2C.aindaNao.en, dPt: 'Tudo bem — tem caminhos', dEn: "That's fine — there are paths" },
            ],
      );
      return finish('bairro-fork');
    }

    // CP: site chosen → the site card + confirm. The site session's message
    // carries the FOCUSED bairro's zone line — always prefer it: for a
    // multi-bairro org it is the bairro the site is actually in, so the card
    // and the recommendation use ITS risks (the _pct fields are re-pinned).
    const s = sites[sites.length - 1];
    const z = zones[0];
    writeE2Fields(cboId, state, {
      ...(bairro ? {} : { bairro: z.name }),
      _bairro_flood_pct: String(z.flood),
      _bairro_heat_pct: String(z.heat),
      _bairro_landslide_pct: String(z.landslide),
      site_name: s.name,
      _site_lat: String(s.lat),
      _site_lng: String(s.lng),
    }, pushEvent);
    // A dropped pin is stored as "Ponto marcado (-30.0577, -51.1936)" — and the
    // next thing we do is ask the org to confirm it. Nobody can confirm a
    // latitude, and that string then travels into the transcript, the concept
    // note and the coordinator roster as the name of the place. Reverse-geocode
    // it to a street address, and write that back as `site_name` so there is
    // ONE name everywhere downstream rather than a display alias.
    //
    // Only for the coordinate placeholders: a name the user typed or that OSM
    // supplied ("Praça da Encol") is already better than any address we'd fetch.
    // Fails soft — a slow or unhelpful Nominatim leaves the coordinate name.
    let address: string | null = null;
    if (isPlaceholderSiteName(s.name)) {
      address = await reverseGeocode(s.lat, s.lng);
      if (address) writeE2Fields(cboId, state, { site_name: address }, pushEvent);
    }
    // Infer the kind of place from the best name we now have: "R. São Manoel"
    // tells us nothing, but a geocode that lands on "Praça Itália" or "EMEF
    // Vila Nova" feeds the same keyword rules the picked-place path uses.
    const typeLabel = inferSiteTypeLabel(address || s.name, isPt ? 'pt' : 'en');
    pushEvent({
      type: 'show_site_card',
      card: {
        name: s.name,
        bairro: z.name,
        lat: s.lat,
        lng: s.lng,
        siteKind: s.kind,
        ...(address ? { address } : {}),
        ...(typeLabel ? { siteTypeLabel: typeLabel } : {}),
        risks: { flood: z.flood, heat: z.heat, landslide: z.landslide },
      },
    } as any);
    // "É isso mesmo?" over a card carrying three risk bars asked two questions
    // at once and accepted an answer to neither — the chips are all about the
    // PLACE, and the risk question belongs to the diagnostic beat that comes
    // later and is built to receive an answer (pior / mais ou menos / mais
    // tranquilo). Name what is being confirmed.
    ask('Esse é o lugar certo?', 'Is this the right place?', [
      { pt: E2C.confirmar.pt, en: E2C.confirmar.en },
      { pt: E2C.outroTipo.pt, en: E2C.outroTipo.en, dPt: 'Me conta o que é', dEn: 'Tell me what it is' },
      { pt: E2C.outroLugar.pt, en: E2C.outroLugar.en, dPt: 'Voltar pro mapa', dEn: 'Back to the map' },
    ]);
    return finish('site-card');
  }

  // ── Uploads during a beat must not hand the turn to the model ─────────────
  // Every upload posts a chat message carrying the parsed content. Left to the
  // model, that turn renders its own question and REPLACES the checkpoint's
  // pending composer — so the "Pronto, pode seguir" chip disappears and the
  // flow strands, which is exactly what three photos produced in the scenario
  // run. Keep the beat in control: acknowledge and re-offer the same question.
  if (raw.startsWith("I'm uploading:")) {
    if (val('_story_pending') === 'yes') {
      // Also stops an upload dump being stored as their story.
      say('Recebi o arquivo — já dou uma lida.', "Got the file — I'll read it.");
      ask('Quando quiser:', 'Whenever you like:', [
        { pt: 'Já está no arquivo', en: "It's in the file", dPt: 'Uso o que vocês mandaram', dEn: "I'll use what you sent" },
        { pt: 'Prefiro pular', en: "I'd rather skip", dPt: 'Sem problema', dEn: 'No problem' },
      ]);
      return finish('upload-during-story');
    }
    if (val('_story_done') === 'yes' && val('_photos_done') !== 'yes') {
      say('Recebi ✓', 'Got it ✓');
      ask('Quando terminar de anexar:', 'When you finish attaching:', [
        { pt: E2C.prontoSeguir.pt, en: E2C.prontoSeguir.en },
      ]);
      return finish('upload-during-photos');
    }
  }

  // ── Beat 2 · the story, free text ─────────────────────────────────────────
  // A voice note arrives here too: the recorder transcribes and sends it as an
  // ordinary text turn. Stored verbatim — their words are the point, and the
  // agent's working memory (last 10 messages, 300 chars each) would lose them
  // within a few turns otherwise.
  // ⚠️ turnKind is NOT a reliable "did they type it" signal here. The story
  // prompt ends with an ask_user (so the turn prompts, and so "Prefiro pular"
  // exists), and the client routes anything typed while a question is pending
  // through handleSelectOption — which posts it as turnKind 'chip'. A dictated
  // voice note, by contrast, always posts as 'text'. Keying off turnKind would
  // therefore capture spoken stories and silently drop typed ones. With a
  // single pending question the message is the raw text verbatim, so we accept
  // either kind and just exclude the two chip labels this beat offers.
  if (val('_story_pending') === 'yes' && raw && !raw.startsWith('Map selection (')) {
    const n = normChip(raw);
    const isStoryChip =
      n === normChip('Prefiro pular') || n === normChip("I'd rather skip") ||
      n === normChip('Já está no arquivo') || n === normChip("It's in the file");
    if (!isStoryChip) {
    writeE2Fields(cboId, state, {
      site_story: raw.slice(0, 4000),
      _story_pending: '',
      _story_done: 'yes',
    }, pushEvent);
    // If they described the 2024 catastrophe, the scale has to be named now —
    // before they design a project against a problem NBS cannot address.
    // (Conceito Arte's technical note, 2026-07-31: NBS absorb ~0.03% of that
    // event but ~11.5% of a microbasin flooding.)
    if (needsScaleReframing(pickedWorries, raw)) {
      say(
        `Obrigado por contar — isso ajuda muito.\n\n${NBS_SCALE_HONESTY.framing.pt}`,
        `Thank you for that — it helps a lot.\n\n${NBS_SCALE_HONESTY.framing.en}`,
      );
    } else {
      say('Obrigado por contar — isso ajuda muito.', 'Thank you for that — it helps a lot.');
    }
    await askPhotos();
    return finish('story-captured');
    }
  }

  // "Outra coisa" worry — free text, same pending-flag pattern.
  if (val('_worry_other_pending') === 'yes' && turnKind !== 'chip' && raw && !raw.startsWith('Map selection (')) {
    const other = `outro: ${raw.replace(/\s+/g, ' ').slice(0, 120)}`;
    const next = [...pickedWorries.filter(w => w !== 'other'), other];
    writeE2Fields(cboId, state, {
      site_worry: next.join(', '),
      _worry_other_pending: '',
      _worry_done: 'yes',
    }, pushEvent);
    await askStory();
    return finish('worry-other-captured');
  }

  // "Outro papel" answer — the ONLY free-text turn the checkpoint machine
  // consumes, and only while the role question is explicitly waiting for it.
  if (val('_role_other_pending') === 'yes' && val('_role_done') !== 'yes' && turnKind !== 'chip' && raw && !raw.startsWith('Map selection (')) {
    const other = `outro: ${raw.replace(/\s+/g, ' ').slice(0, 120)}`;
    writeE2Fields(cboId, state, {
      role_preference: [...pickedRoles, other].join(', '),
      _role_other_pending: '',
    }, pushEvent);
    askRoles([...pickedRoles, other], false);
    return finish('role-other-captured');
  }

  // ── Chip taps ──────────────────────────────────────────────────────────────
  if (turnKind !== 'chip') return false;
  const msg = normChip(raw);
  const is = (c: { pt: string; en: string }) => msg === normChip(c.pt) || msg === normChip(c.en);

  // Educational done ("pular" / "entendi") → the one-or-more-bairros question.
  if (!bairro && (is({ pt: 'Já conheço SbN — pular', en: 'I know NbS — skip' }) || /\bentendi\b|\bgot it\b/.test(msg))) {
    const sawStrip = getCboMessages(cboId).some(m => m.messageType === 'composer' && (m.content.includes('"kind":"familias"') || m.content.includes('"kind":"types"')));
    if (!sawStrip) return false;
    // Framing matters here: the cohort KNOWS its risks ("a gente já sabe o que
    // acontece no nosso bairro", org meeting 2026-07-15) — the map's job is
    // official quantitative data that gives their project weight with funders,
    // never "teaching them their own territory" (Ana, biweekly 2026-07-16).
    say(
      'Show! Agora vamos pro mapa. Vocês já conhecem os riscos do território de vocês — o mapa traz os **dados oficiais** de enchente, calor e deslizamento, que dão peso ao projeto na hora de buscar recursos. Dá uma olhada e marca seu bairro.',
      "Great! Now to the map. You already know your territory's risks — the map adds the **official data** on flood, heat and landslide, which gives your project weight when you go after funding. Take a look, then mark your neighborhood.",
    );
    // E1 already recorded where they work, and until now E2 never read it —
    // `bairro_of_operation` was written at kickoff and consulted nowhere in
    // this file. Asking cold for something we were told twenty minutes ago is
    // the clearest "you weren't listening" signal in the flow. Known facts
    // become confirmations; only an unknown stays a question.
    const e1Bairro = String(
      state.sections.org_profile?.fields?.bairro_of_operation?.value ?? '',
    ).split(',')[0].trim();
    ask(
      e1Bairro
        ? `Vocês atuam no **${e1Bairro}**, certo? Só ele, ou em mais de um bairro?`
        : 'Vocês atuam em um bairro só ou em mais de um?',
      e1Bairro
        ? `You work in **${e1Bairro}**, right? Just there, or in more than one neighborhood?`
        : 'Do you work in one neighborhood or more than one?',
      [
      { pt: e1Bairro ? `Só o ${e1Bairro}` : E2C.umBairro.pt, en: e1Bairro ? `Just ${e1Bairro}` : E2C.umBairro.en },
      { pt: E2C.maisDeUm.pt, en: E2C.maisDeUm.en },
    ]);
    return finish('bairro-question');
  }

  // One-or-more answer → Map 1 (tour + bairro, confirms at the zone step).
  // "Um bairro" may arrive as the confirm label built from E1 ("Só o Sarandi"),
  // so match the shape as well as the constant.
  const isSingleBairroChip = is(E2C.umBairro) || /^(so o |so a |just )/.test(msg);
  if (!bairro && (isSingleBairroChip || is(E2C.maisDeUm))) {
    // Carry E1's bairro onto the map so the step is a confirmation, not a
    // search through 94 polygons for yourself. Only for the single-bairro
    // answer: an org that just said "mais de um" is being asked to mark
    // several, and pre-committing one of them would frame the answer.
    // The client ignores a name that matches no zone, so a typo at invite time
    // degrades to today's behaviour rather than selecting the wrong territory.
    const e1BairroForMap = String(
      state.sections.org_profile?.fields?.bairro_of_operation?.value ?? '',
    ).split(',')[0].trim();
    openMapPreset({
      preset: 'e2_bairro',
      ...(isSingleBairroChip && e1BairroForMap
        ? { preselectZone: e1BairroForMap }
        : {}),
      ...(is(E2C.maisDeUm)
        ? { prompt: isPt ? 'Conheça os riscos e marque os bairros onde vocês atuam.' : 'Get to know the risks, then mark the neighborhoods where you work.' }
        : {}),
    });
    return finish('open-bairro-map');
  }

  // "Tem um lugar" fork answers. Multi-bairro orgs pick WHICH bairro the site
  // is in first (one chip per bairro from _bairros_json); single-bairro orgs
  // go straight to the focused map.
  const storedBairros: Array<{ name: string; flood: number; heat: number; landslide: number }> = (() => {
    try { return JSON.parse(val('_bairros_json') || '[]'); } catch { return []; }
  })();
  const openSiteMapOrPicker = (detail: string): true => {
    if (storedBairros.length > 1) {
      ask('Em qual bairro fica o lugar?', 'Which neighborhood is the place in?',
        storedBairros.map(b => ({ pt: b.name, en: b.name })));
      return finish(`${detail}-bairro-picker`);
    }
    openMapPreset({ preset: 'e2_site_focused', focusZone: bairro.split(',')[0].trim() });
    return finish(detail);
  };
  if (bairro && !siteName && (is(E2C.simTenho) || is(E2C.jaTenho))) {
    return openSiteMapOrPicker('open-site-map');
  }
  if (bairro && siteName && is(E2C.outroLugar)) {
    return openSiteMapOrPicker('open-site-map-again');
  }
  // Bairro-picker answer: the chip is one of the stored bairro names.
  if (bairro && storedBairros.length > 1) {
    const picked = storedBairros.find(b => msg === normChip(b.name));
    if (picked) {
      openMapPreset({ preset: 'e2_site_focused', focusZone: picked.name });
      return finish('open-site-map-picked');
    }
  }
  if (bairro && !siteName && is(E2C.aindaNao)) {
    say(
      'Sem problema. Quer que a coordenação te ajude a achar um lugar, ou prefere verificar com a equipe e voltar aqui?',
      'No problem. Want the coordination to help you find a place, or would you rather check with your team and come back?',
    );
    ask('Como prefere?', 'What works best?', [
      { pt: E2C.pedirApoio.pt, en: E2C.pedirApoio.en, dPt: 'Eles recebem seu pedido', dEn: 'They get your request' },
      { pt: E2C.voltoDepois.pt, en: E2C.voltoDepois.en, dPt: 'A gente retoma daqui', dEn: 'We pick up from here' },
    ]);
    return finish('no-site-fork');
  }
  if (bairro && !siteName && is(E2C.pedirApoio)) {
    const ok = await createSiteSupportRequest(cboId, lang);
    say(
      ok
        ? '✓ Avisei a coordenação — eles vão te procurar pra ajudar a achar o lugar.'
        : 'Anotei — fala com a coordenação pelo botão **Pedir Apoio** aqui na tela, tá?',
      ok
        ? "✓ I've told the coordination — they'll reach out to help you find the place."
        : 'Noted — please reach the coordination via the **Request Support** button on this screen.',
    );
    return offerBairroDiagnostic('support-requested');
  }
  if (bairro && !siteName && is(E2C.voltoDepois)) {
    say(
      'Tranquilo — o lugar exato fica pra depois.',
      'No rush — the exact place can wait.',
    );
    return offerBairroDiagnostic('parked');
  }
  // Fork answer: run the diagnostic at bairro level.
  if (bairro && !siteName && is(E2C.podePerguntar)) return startDiagnostic();

  // Site card confirmed → describe stage, first templated question (current use).
  if (siteName && !currentUse && is(E2C.confirmar)) {
    writeE2Fields(cboId, state, { _site_confirmed: 'yes' }, pushEvent);
    const useQuote = await docQuoteFor(cboId, 'current_use');
    if (useQuote) {
      say(
        `No arquivo que vocês mandaram eu li: _"${useQuote}"_`,
        `In the file you sent I read: _"${useQuote}"_`,
      );
    }
    ask(
      useQuote ? 'É assim que está hoje?' : 'Como é esse lugar hoje?',
      useQuote ? 'Is that how it is today?' : 'What is this place like today?',
      E2_CURRENT_USE.map(o => ({ pt: o.pt, en: o.en })),
    );
    return finish('ask-current-use');
  }
  // "É outro tipo de lugar" → the model converses (free text), then continues.
  if (siteName && !currentUse) {
    const useHit = E2_CURRENT_USE.find(o => is(o));
    if (useHit) {
      writeE2Fields(cboId, state, { current_use: useHit.id }, pushEvent);
      const tenureQuote = await docQuoteFor(cboId, 'tenure');
      if (tenureQuote) {
        say(
          `E sobre o terreno, no arquivo diz: _"${tenureQuote}"_`,
          `And about the land, the file says: _"${tenureQuote}"_`,
        );
      }
      ask(
        tenureQuote ? 'Continua assim?' : 'E vocês têm acesso a esse espaço hoje?',
        tenureQuote ? 'Is that still the case?' : 'And do you have access to this space today?',
        E2_TENURE.map(o => ({ pt: o.pt, en: o.en })),
      );
      return finish('ask-tenure');
    }
  }
  if (siteName && currentUse && !tenure) {
    const tenureHit = E2_TENURE.find(o => is(o));
    if (tenureHit) {
      writeE2Fields(cboId, state, { land_tenure: tenureHit.id }, pushEvent);
      // Score site_control HERE — the rubric is pure land_tenure, and in the
      // happy path every remaining turn is a template, so the model (which
      // used to do this scoring) never runs. public-informal scores 1, not 2:
      // the 2 requires municipal awareness we haven't asked about — the model
      // may raise it later if the conversation surfaces it.
      const score = tenureHit.id === 'private-owned' || tenureHit.id === 'formal-agreement' ? 3
        : tenureHit.id === 'mixed' ? 2 : 1;
      const just: Record<string, { pt: string; en: string }> = {
        'private-owned': { pt: 'A organização é dona do terreno.', en: 'The organization owns the land.' },
        'formal-agreement': { pt: 'Acesso garantido por acordo formal.', en: 'Access secured by a formal agreement.' },
        'mixed': { pt: 'Situação de posse mista — detalhes a verificar.', en: 'Mixed tenure — details to verify.' },
        'public-informal': { pt: 'Uso informal de área pública, sem documento.', en: 'Informal use of public land, no document.' },
        'public-no-access': { pt: 'Área pública sem acesso garantido.', en: 'Public land without guaranteed access.' },
      };
      state.maturityScores = state.maturityScores.filter(s => s.metric !== 'site_control');
      state.maturityScores.push({ metric: 'site_control', score, justification: (isPt ? just[tenureHit.id]?.pt : just[tenureHit.id]?.en) ?? '' });
      state.totalMaturityScore = state.maturityScores.reduce((sum, s) => sum + s.score, 0);
      setCboState(cboId, state);
      debouncedPersist(cboId);
      pushEvent({ type: 'maturity_update', scores: state.maturityScores, total: state.totalMaturityScore, flags: state.priorityFlags } as any);
      // An org that already did the diagnostic at bairro level and then came
      // back to pin a site must not be walked through all of it again.
      if (val('_check_done') === 'yes') return await serveFamiliaReco();
      return startDiagnostic();
    }
  }

  // Bridge for sessions that were parked at the old generic "quer anexar
  // fotos?" step when the diagnostic beats shipped: their next tap enters the
  // new flow at beat 1 instead of falling through to the model.
  if (tenure && !val('_worry_offered') && (is(E2C.temArquivos) || is(E2C.semArquivos) || is(E2C.prontoSeguir))) {
    writeE2Fields(cboId, state, { _worry_offered: 'yes' }, pushEvent);
    askWorry([]);
    return finish('ask-worry-bridged');
  }

  // ── Beat 1 · what worries them here ───────────────────────────────────────
  if (val('_worry_offered') === 'yes' && val('_worry_done') !== 'yes') {
    const hit = orderWorriesByData(risks).find(w => is({ pt: w.pt, en: w.en }) && !pickedWorries.includes(w.id));
    if (hit) {
      const next = [...pickedWorries, hit.id];
      writeE2Fields(cboId, state, { site_worry: next.join(', ') }, pushEvent);
      if (hit.id === 'other') {
        writeE2Fields(cboId, state, { _worry_other_pending: 'yes' }, pushEvent);
        say('Me conta: o que mais preocupa vocês nesse lugar?', 'Tell me: what worries you most about this place?');
        return finish('worry-other-asked');
      }
      if (next.length >= E2_WORRIES.length - 1) {
        writeE2Fields(cboId, state, { _worry_done: 'yes' }, pushEvent);
        await askStory();
        return finish('ask-story');
      }
      askWorry(next);
      return finish('worry-picked');
    }
    if (is(E2C.prontoLista) && pickedWorries.length > 0) {
      writeE2Fields(cboId, state, { _worry_done: 'yes' }, pushEvent);
      await askStory();
      return finish('ask-story');
    }
  }

  // ── Beat 2 · the story — skip paths (the free-text path is above) ─────────
  if (val('_story_pending') === 'yes') {
    if (is({ pt: 'Já está no arquivo', en: "It's in the file" })) {
      writeE2Fields(cboId, state, {
        _story_pending: '',
        _story_done: 'yes',
        site_story: isPt ? '(remeteram ao arquivo que já enviaram)' : '(they pointed to the file they already sent)',
      }, pushEvent);
      say(
        'Perfeito — uso o que vocês mandaram, e a coordenação também vai olhar.',
        "Perfect — I'll use what you sent, and the coordination will look at it too.",
      );
      await askPhotos();
      return finish('ask-photos');
    }
    if (is({ pt: 'Prefiro pular', en: "I'd rather skip" })) {
      writeE2Fields(cboId, state, { _story_pending: '', _story_done: 'yes' }, pushEvent);
      say('Sem problema.', 'No problem.');
      await askPhotos();
      return finish('ask-photos');
    }
  }

  // ── Beat 3 · photographs ──────────────────────────────────────────────────
  if (val('_story_done') === 'yes' && val('_photos_done') !== 'yes') {
    // "Anexar mais" re-opens the picker (client-side) and must re-serve the SAME
    // pending question. Left unhandled it would fall through to the model, whose
    // turn replaces the pending composer — so the "Pronto, pode seguir" chip
    // would vanish and the org would be stranded mid-upload.
    if (is({ pt: 'Anexar mais', en: 'Attach more' })) {
      ask('Quando terminar de anexar:', 'When you finish attaching:', [
        { pt: E2C.prontoSeguir.pt, en: E2C.prontoSeguir.en },
        { pt: 'Anexar mais', en: 'Attach more', dPt: 'Abre de novo', dEn: 'Opens it again', action: 'upload_then_answer' },
      ]);
      return finish('await-more-uploads');
    }
    if (is(E2C.temArquivos)) {
      // The picker is already open at this point (the chip opened it), so this
      // no longer says "toca no 📎" — that instruction was the dead step.
      say(
        'Show! Escolhe os arquivos e manda. Quando terminar, toca abaixo.',
        'Great! Pick your files and send them. When you finish, tap below.',
      );
      ask('Quando terminar de anexar:', 'When you finish attaching:', [
        { pt: E2C.prontoSeguir.pt, en: E2C.prontoSeguir.en },
        { pt: 'Anexar mais', en: 'Attach more', dPt: 'Abre de novo', dEn: 'Opens it again', action: 'upload_then_answer' },
      ]);
      return finish('await-uploads');
    }
    const intent =
      is(E2C.prontoSeguir) || is({ pt: 'Já mandei o que tinha', en: 'I already sent what I had' }) ? 'sent'
      : is({ pt: 'Mando depois', en: "I'll send later" }) ? 'later'
      : is(E2C.semArquivos) ? 'skip'
      : null;
    if (intent) {
      writeE2Fields(cboId, state, { _photos_done: 'yes', site_photo_intent: intent }, pushEvent);
      if (intent === 'later') {
        say(
          'Fica anotado — quando mandarem, eu leio e a coordenação também vê.',
          "Noted — when you send them I'll read them, and the coordination sees them too.",
        );
      }
      await persistDepth();
      if (askHazardCheck()) return finish('ask-hazard-check');
      return await serveFamiliaReco();
    }
  }

  // ── Beat 4 · the read-back, our side ──────────────────────────────────────
  if (val('_photos_done') === 'yes' && val('_check_done') !== 'yes') {
    const answer = HAZARD_CHECK_OPTIONS.find(o => is(o));
    if (answer) {
      const pending = hazardsToCheck(pickedWorries, risks).filter(h => !hazardChecks[h]);
      const h = pending[0];
      if (h) {
        const next = { ...hazardChecks, [h]: answer.id };
        writeE2Fields(cboId, state, { _hazard_check_json: JSON.stringify(next) }, pushEvent);
        hazardChecks[h] = answer.id;
        if (answer.id !== 'unsure') {
          say(
            answer.id === 'worse'
              ? 'Anotado — e isso vale mais que o nosso número, porque vocês estão lá.'
              : answer.id === 'less'
                ? 'Bom saber — o dado do bairro estava puxando pra cima.'
                : 'Show, o dado bate então.',
            answer.id === 'worse'
              ? "Noted — and that counts for more than our number, because you're the ones there."
              : answer.id === 'less'
                ? 'Good to know — the bairro figure was pulling it up.'
                : 'Good, the data matches then.',
          );
        } else {
          say(
            'Tranquilo — deixo em aberto e a coordenação pode olhar isso com vocês.',
            "That's fine — I'll leave it open and the coordination can look at it with you.",
          );
        }
      }
      if (askHazardCheck()) return finish('ask-hazard-check');
      writeE2Fields(cboId, state, { _check_done: 'yes' }, pushEvent);
      await persistDepth();
      return await serveFamiliaReco();
    }
  }
  // Recommendation acknowledged → the interest question (not closing yet).
  if (is(E2C.fazSentido) && val('_interest_done') !== 'yes' && getCboMessages(cboId).some(m => m.messageType === 'composer' && m.content.includes('"kind":"familia_reco"'))) {
    say(
      'Boa! Última coisa — e essa parte ajuda a coordenação a montar os grupos dos próximos encontros.',
      'Great! One last thing — this part helps the coordination shape the groups for the next encontros.',
    );
    writeE2Fields(cboId, state, { _interest_offered: 'yes' }, pushEvent);
    askInterest(pickedFamilias);
    return finish('ask-interest');
  }

  // Interest loop: família picks accumulate; "Pronto ✓" (or all five) advances.
  if (val('_interest_offered') === 'yes' && val('_interest_done') !== 'yes') {
    const fam = NBS_FAMILIAS.find(f => is({ pt: f.pt.label, en: f.en.label }) && !pickedFamilias.includes(f.id));
    if (fam) {
      const next = [...pickedFamilias, fam.id];
      writeE2Fields(cboId, state, { nbs_interest: next.join(', ') }, pushEvent);
      if (next.length >= NBS_FAMILIAS.length) {
        writeE2Fields(cboId, state, { _interest_done: 'yes', _roles_offered: 'yes' }, pushEvent);
        askRoles(pickedRoles, true);
        return finish('ask-roles');
      }
      askInterest(next);
      return finish('interest-picked');
    }
    if (is(E2C.prontoLista) && pickedFamilias.length > 0) {
      writeE2Fields(cboId, state, { _interest_done: 'yes', _roles_offered: 'yes' }, pushEvent);
      askRoles(pickedRoles, true);
      return finish('ask-roles');
    }
  }

  // Role loop: same shape; "Outro papel" hands one turn to free text above.
  if (val('_roles_offered') === 'yes' && val('_role_done') !== 'yes') {
    const role = E2_ROLES.find(r => is(r) && !pickedRoles.includes(r.id));
    if (role) {
      const next = [...pickedRoles, role.id];
      writeE2Fields(cboId, state, { role_preference: next.join(', ') }, pushEvent);
      if (E2_ROLES.every(r => next.includes(r.id))) {
        writeE2Fields(cboId, state, { _role_done: 'yes' }, pushEvent);
        return await closeE2();
      }
      askRoles(next, false);
      return finish('role-picked');
    }
    if (is(E2C.outroPapel)) {
      writeE2Fields(cboId, state, { _role_other_pending: 'yes' }, pushEvent);
      say('Me conta: que papel vocês imaginam pra vocês nesses projetos?', 'Tell me: what role do you imagine for yourselves in these projects?');
      return finish('role-other-asked');
    }
    if (is(E2C.prontoLista) && pickedRoles.length > 0) {
      writeE2Fields(cboId, state, { _role_done: 'yes' }, pushEvent);
      return await closeE2();
    }
  }

  return false;
}

async function serveEncontro2Entry(cboId: string, state: CboState, pushEvent: EventPusher, lang: string): Promise<boolean> {
  // Single-flight per cbo: a double-tapped banner fires two overlapping /chat
  // requests; without this both pass the virgin gate (it sits before awaits)
  // and the transcript gets two greetings + two strips (adversarial-review
  // catch). Concurrent duplicates fall through to the model, whose own gate
  // (the skill's don't-re-greet rule) is conversational, not duplicating.
  if (e2EntryInFlight.has(cboId)) return false;
  e2EntryInFlight.add(cboId);
  try {
    // If the types strip already exists in the transcript (banner re-fire,
    // resume race), this is not a virgin E2 entry — let the model handle it.
    // "types" is the pre-familias strip — old transcripts that already saw it
    // must not get a second (familias) strip on resume.
    const seen = getCboMessages(cboId).some(m => m.messageType === 'composer' && (m.content.includes('"kind":"types"') || m.content.includes('"kind":"familias"')));
    if (seen) return false;

    const isPt = lang === 'pt';
    const nome = String(state.sections.org_profile?.fields?.contact_name?.value || '').trim().split(/\s+/)[0] || '';

    // needs-help orgs don't get the skip option (skill Turn 1 rule).
    let path: string | null = null;
    try {
      const rows = await db.select({ path: cohortMembers.path }).from(cohortMembers).where(eq(cohortMembers.cboStateId, cboId)).limit(1);
      path = rows[0]?.path ?? null;
    } catch {
      // Can't know if this is a needs-help org → don't guess the chip set;
      // the model path sees the same data through its own context.
      return false;
    }

    // Re-check the gate after the awaits above — the cheap half of the race
    // defense (the in-flight set covers the concurrent half).
    if (getCboMessages(cboId).some(m => m.messageType === 'composer' && (m.content.includes('"kind":"types"') || m.content.includes('"kind":"familias"')))) return false;

    const greeting = isPt
      ? `Oi${nome ? `, ${nome}` : ''}. Antes de falar do seu território, dois minutos sobre as famílias de Solução baseada na Natureza — pra gente falar a mesma língua.`
      : `Hi${nome ? `, ${nome}` : ''}. Before we talk about your territory, two minutes on the families of Nature-based Solutions — so we speak the same language.`;
    pushEvent({ type: 'chat', content: greeting, role: 'assistant' } as any);
    // The 5 famílias of the Rede SCbN POA deck (shared/nbs-catalog.ts) — the
    // same cards the cohort holds in the encontros. Empty ids = all five.
    pushEvent({
      type: 'show_familias',
      intro: isPt ? 'Toca em "Ver opções" em qualquer uma pra conhecer as soluções.' : 'Tap "See options" on any of them to explore the solutions.',
    } as any);
    pushEvent({
      type: 'chat', role: 'assistant',
      content: isPt
        ? 'Essas são as 5 famílias de SbN — as mesmas das cartas que vocês vão usar nos encontros. Não precisa decorar: dá uma olhada nas que têm a ver com o seu território e, quando terminar, é só tocar abaixo.'
        : "These are the 5 families of NbS — the same ones on the cards you'll use in the encontros. No need to memorize them: look at the ones that match your territory and tap below when you're done.",
    } as any);
    const options = [
      { label: isPt ? 'Ver exemplos' : 'See examples', description: isPt ? 'Casos reais desses tipos' : 'Real cases of these types' },
      ...(path === 'needs-help' ? [] : [{ label: isPt ? 'Já conheço SbN — pular' : 'I know NbS — skip', description: isPt ? 'Ir direto pro final' : 'Go straight to the end' }]),
    ];
    pushEvent({
      type: 'ask_user',
      question: isPt ? 'Quando terminar de ver os tipos, seguimos pros exemplos reais?' : 'When you finish looking at the types, shall we move on to real examples?',
      options,
    } as any);
    pushEvent({ type: 'done', summary: 'E2 entry (template)' } as any);
    console.log(`[cbo] timing for ${cboId}: model=template rounds=0 first_event=0ms total=0ms kind=system detail=e2-entry-template`);
    return true;
  } catch {
    return false;
  } finally {
    e2EntryInFlight.delete(cboId);
  }
}

export async function streamCboChat(cboId: string, userMessage: string, res: Response, state: CboState, lang: string = 'en', turnKind?: string) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Dead-socket guard. On a phone-first audience over patchy mobile data the
  // client frequently drops mid-stream. Without this the SDK loop keeps calling
  // res.write() on a closed socket (throwing / spewing EPIPE) and the per-CBO
  // push registry is never cleaned up. We flip a flag on 'close' and make every
  // push a no-op afterwards — in-flight tool calls still mutate in-memory state
  // (persisted on phase boundaries); we just stop writing to nobody.
  let clientGone = false;

  // Near-duplicate guard for this turn's chat text. Live test 2026-07-13: the
  // model asked the proud-moment question, ran tools, then re-emitted the same
  // question slightly extended in its final round — the client concatenates
  // consecutive assistant blocks, so the user read the question twice in one
  // bubble. If a later block is a prefix-extension (or repeat) of an earlier
  // one this turn, drop it. 40-char floor so short legit repeats ("Anotado.")
  // are never touched; per-turn scope so re-asking in a LATER turn still works.
  const turnChatTexts: string[] = [];
  const normChat = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const isTurnDuplicate = (content: string): boolean => {
    const n = normChat(content);
    return turnChatTexts.some(p => Math.min(p.length, n.length) >= 40 && (n.startsWith(p) || p.startsWith(n)));
  };

  const pushEvent = (event: CboEvent) => {
    if (clientGone || res.writableEnded) return;
    if (event.type === 'chat') {
      if (isTurnDuplicate(event.content)) {
        console.log(`[cbo] dropped near-duplicate chat block for ${cboId} (${event.content.length} chars)`);
        return;
      }
      turnChatTexts.push(normChat(event.content));
    }
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'chat') {
      // ALL chat events store as messageType: 'content'. The previous
      // heuristic (regex + length<300 fallback) was catastrophically
      // over-aggressive after PR #196 made the agent brief: any agent
      // response under 300 chars without markdown headers/bold was
      // misclassified as 'thinking' and hidden behind the WORKING
      // preview UI. This nuked acks ("Got it."), short questions
      // ("And who am I speaking with — what's your name?"), and any
      // closing message that followed the new ≤6-line cap.
      //
      // Real thinking content comes via the SDK's `chat_thinking`
      // event (handled below) when extended thinking is enabled — that's
      // the only path that should produce messageType: 'thinking' now.
      addCboMessage(cboId, { role: 'assistant', content: event.content, messageType: 'content', timestamp: new Date().toISOString() });
    } else if (event.type === 'chat_thinking') {
      addCboMessage(cboId, { role: 'assistant', content: event.content, messageType: 'thinking', timestamp: new Date().toISOString() });
    } else if (event.type === 'show_types') {
      // Persist the educational strip as an inline transcript message so it
      // re-renders on reload (the event itself is ephemeral). Content is a JSON
      // payload the client parses; messageType 'composer' keeps it out of text-
      // based message logic.
      addCboMessage(cboId, { role: 'assistant', content: JSON.stringify({ kind: 'types', typeIds: event.typeIds, intro: event.intro }), messageType: 'composer', timestamp: new Date().toISOString() });
    } else if (event.type === 'show_familias') {
      addCboMessage(cboId, { role: 'assistant', content: JSON.stringify({ kind: 'familias', familiaIds: event.familiaIds, intro: event.intro }), messageType: 'composer', timestamp: new Date().toISOString() });
    } else if (event.type === 'show_examples') {
      addCboMessage(cboId, { role: 'assistant', content: JSON.stringify({ kind: 'examples', cardIds: event.cardIds, mode: event.mode, intro: event.intro }), messageType: 'composer', timestamp: new Date().toISOString() });
    } else if (event.type === 'show_site_card') {
      addCboMessage(cboId, { role: 'assistant', content: JSON.stringify({ kind: 'site_card', card: (event as any).card }), messageType: 'composer', timestamp: new Date().toISOString() });
    } else if (event.type === 'show_familia_recommendation') {
      addCboMessage(cboId, { role: 'assistant', content: JSON.stringify({ kind: 'familia_reco', items: (event as any).items, intro: (event as any).intro }), messageType: 'composer', timestamp: new Date().toISOString() });
    } else if (event.type === 'ask_user') {
      // Persist every user-prompting question (PERSIST-PROMPTS). Before this,
      // ask_user was SSE-only: a reload mid-question dropped the prompt and the
      // user faced a dead transcript with only the derailing "Continuar" chip.
      // Persisting also puts the question into buildDecisionLog, so the agent
      // remembers what it asked — including questions synthesized by the
      // inline-options converter, which previously vanished from BOTH places.
      addCboMessage(cboId, { role: 'assistant', content: JSON.stringify({ kind: 'ask_user', question: event.question, options: event.options, multiSelect: event.multiSelect, showMap: event.showMap, relatedSections: event.relatedSections }), messageType: 'composer', timestamp: new Date().toISOString() });
    } else if (event.type === 'ask_priority_rank') {
      addCboMessage(cboId, { role: 'assistant', content: JSON.stringify({ kind: 'priority', prompt: event.prompt, minRanked: event.minRanked }), messageType: 'composer', timestamp: new Date().toISOString() });
    } else if (event.type === 'ask_community_anchoring') {
      addCboMessage(cboId, { role: 'assistant', content: JSON.stringify({ kind: 'anchoring', prompt: event.prompt }), messageType: 'composer', timestamp: new Date().toISOString() });
    } else if (event.type === 'open_map') {
      // Persist BOTH signals (invariant 5 / RL-1). activeTool {kind} keeps the
      // tab + nudge chip alive across reloads; the composer row carries the
      // agent's ACTUAL params so a reload restores the exact map step (custom
      // prompt, hazardTour, suggestedSite, …) instead of the phase defaults —
      // {kind}-only persistence dropped the params and left the resume chip
      // rendering over a pending map step.
      addCboMessage(cboId, { role: 'assistant', content: JSON.stringify({ kind: 'open_map', params: (event as any).params }), messageType: 'composer', timestamp: new Date().toISOString() });
      // A fresh guided tour starts at hazard 0. Any other open_map (re-entry,
      // site step) leaves the recorded position alone, so the user resumes.
      state.activeTool = (event as any).params?.hazardTour
        ? { kind: 'map', tourIdx: 0 }
        : { kind: 'map', tourIdx: state.activeTool?.tourIdx };
      setCboState(cboId, state); debouncedPersist(cboId);
    } else if (event.type === 'open_intervention_selector') {
      addCboMessage(cboId, { role: 'assistant', content: JSON.stringify({ kind: 'open_intervention_selector', params: (event as any).params }), messageType: 'composer', timestamp: new Date().toISOString() });
      state.activeTool = { kind: 'interventions' };
      setCboState(cboId, state); debouncedPersist(cboId);
    }
  };

  // SSE heartbeat. The SDK can think for 10-20s between events; proxies
  // (Replit's dev domain included) may idle-kill a silent socket, and the
  // client's 60s inactivity watchdog needs SOMETHING arriving to know the
  // stream is alive. A comment line every 15s keeps both fed — the client
  // parser only consumes `data: ` lines, so this is invisible to it beyond
  // resetting the watchdog. With the heartbeat in place, 60s of true silence
  // now reliably means the connection is dead.
  const heartbeat = setInterval(() => {
    if (!clientGone && !res.writableEnded) res.write(': ping\n\n');
  }, 15_000);

  res.on('close', () => {
    clearInterval(heartbeat);
    if (clientGone) return;
    clientGone = true;
    if (pushEventRegistry.get(cboId) === pushEvent) pushEventRegistry.delete(cboId);
    // Node fires 'close' after every NORMAL completion too — only a close
    // before end() is a real disconnect. (The unguarded version logged a
    // spurious "disconnected" after every healthy turn.)
    if (!res.writableEnded) {
      console.log(`[cbo] client disconnected mid-stream for ${cboId} (phase ${state.phase})`);
    }
  });

  // Self-heal sessions stranded at phase 0 — AND tell the client (fake-E2
  // field report 2026-07-08: the first version of this lift lived in the
  // route and emitted nothing, so the live client kept phase 0, the green
  // advance banner stayed suppressed, and the user talked the model into a
  // role-played Encontro 2 instead). phase_change here keeps the client's
  // state.phase — and therefore the banner gate — in sync with the lift.
  if ((state.phase ?? 0) === 0) {
    state.phase = 1;
    setCboState(cboId, state);
    pushEvent({ type: 'phase_change', phase: 1 });
    console.log(`[cbo] lifted ${cboId} from stranded phase 0 to phase 1`);
  }

  // "vamos começar o encontro N" — the banner's fixed message (belt to the
  // client's /advance-phase call), or a user typing the phrase by hand. This
  // previously lived in the route with its own duplicated policy check and a
  // silent `state.phase = target` write: no phase_change event, no durable
  // flush (backlog CBO-PHASE-WRITERS — the manual-typed case left the client
  // header/banner stale, the same desync class as the fake-E2 report). Route
  // it through advanceCboPhase — the single gate every other phase writer
  // uses — and TELL the client.
  const startEncontroMatch = userMessage.match(/(?:vamos\s+(?:começar|comecar)\s+(?:o\s+)?encontro|let'?s\s+start\s+encontro)\s+(\d+)/i);
  if (startEncontroMatch) {
    const target = parseInt(startEncontroMatch[1], 10);
    if (target >= 1 && target <= 6 && target > (state.phase ?? 0)) {
      const advanced = await advanceCboPhase(cboId, target);
      if (advanced.ok) {
        pushEvent({ type: 'phase_change', phase: target });
        console.log(`[cbo] chat handler advanced ${cboId} to phase ${target} via "start Encontro" pattern`);
      }
    }
  }

  // Handle [SKIP TO phase:X] magic prefix — DEMO TOOL, env-gated. It stamps
  // fictitious CEA Bom Jesus sample data over earlier sections and renames the
  // org, so on prod (flag never set there, same family as ENABLE_TEST_ROUTES)
  // it must be dead even for someone who TYPES the magic string: the message
  // is intercepted here and never reaches the model or the state.
  const skipMatch = userMessage.match(SKIP_PATTERN);
  if (skipMatch && !isPhaseSkipEnabled()) {
    console.warn(`[cbo] blocked [SKIP TO phase:${skipMatch[1]}] for ${cboId} — phase skip disabled (flag unset or running in a deployment)`);
    pushEvent({ type: 'chat', content: lang === 'pt' ? 'Esse atalho de demonstração está desativado aqui.' : 'That demo shortcut is disabled here.', role: 'assistant' } as any);
    pushEvent({ type: 'done', summary: 'phase-skip blocked (flag off)' });
    res.end();
    return;
  }
  if (skipMatch) {
    const targetPhase = skipMatch[1];
    const { phase, agentMessage } = applySkipData(state, targetPhase);
    setCboState(cboId, state);
    // Push field updates for all pre-filled sections so the UI updates
    for (const [sectionId, section] of Object.entries(state.sections)) {
      for (const [field, data] of Object.entries(section.fields)) {
        pushEvent({ type: 'field_update', sectionId, field, value: String(data.value), confidence: data.confidence, source: data.source });
      }
    }
    pushEvent({ type: 'phase_change', phase });
    // Replace user message with the skip instruction for the agent
    userMessage = agentMessage;
  }

  setActivePushEvent(cboId, pushEvent);
  setActiveCboLang(cboId, lang);

  // Instant E2 entry — the banner's fixed message at phase 2 gets the
  // templated Turn 1 (see serveEncontro2Entry) instead of a model turn.
  const rawEntryMsg = userMessage.split('\n[LANGUAGE:')[0].trim();
  if (state.phase === 2 && /^(vamos come\u00e7ar o encontro 2\.?|let'?s start encontro 2\.?)$/i.test(rawEntryMsg)) {
    if (await serveEncontro2Entry(cboId, state, pushEvent, lang)) {
      res.end();
      return;
    }
  }

  // E2 linear-flow checkpoints \u2014 every stage boundary of the chat\u2192mapa\u2192chat
  // journey is a deterministic template (see serveE2Checkpoint). Falls through
  // to the model for everything it doesn't recognize (describe-stage free
  // text, uploads, "quero ajustar", legacy flows).
  if (state.phase === 2) {
    try {
      if (await serveE2Checkpoint(cboId, userMessage, state, pushEvent, lang, turnKind)) {
        res.end();
        return;
      }
    } catch (err) {
      console.error(`[cbo] e2 checkpoint error for ${cboId} \u2014 falling through to the model:`, err);
    }
  }

  // Test-only deterministic seam. When CBO_FAKE_MODEL=1 (set ONLY in the
  // test/preview env, never the prod Deployment), drive the turn from a scripted
  // fake instead of the live SDK — fast, free, and reproducible. The real path
  // below is byte-for-byte untouched. See server/services/fakeCboModel.ts.
  if (isFakeModelEnabled()) {
    await streamWithFakeModel(cboId, userMessage, state, pushEvent, lang, { setCboState });
    res.end();
    return;
  }

  const isSdkReady = await loadSdk();

  if (isSdkReady) {
    await streamWithSdk(cboId, userMessage, state, pushEvent, lang, turnKind);
  } else {
    pushEvent({ type: 'error', message: 'Claude Agent SDK not available.' });
  }

  res.end();
}

// Default model for the CBO chat. Mirrors the conceptNoteAgent (CT) choice that
// proved reliable at sequential chip-first ask_user turns. Per-phase overrides
// live in the encontro skill's YAML frontmatter (`model:` field).
const DEFAULT_CBO_MODEL = 'claude-sonnet-4-6';

// Adaptive turn routing (Ana's "agent too slow on basic questions"). Trivial
// turns — a chip answer, a short conversational reply in the interview phases —
// don't need the big model: route them to the fast tier so they feel instant
// (~3× cheaper, materially lower latency). Everything with real reasoning load
// (file uploads, map payloads, phase starts, scoring phases) stays on the
// skill/default model, and HEAVY IS THE DEFAULT — an unclassified turn behaves
// exactly as before this feature. Only the `model` value changes: same system
// prompt, same tools, same turn guards, so a light-model slip is caught by the
// same guardrails (inline-options converter, turn-ender recovery, persisted
// prompts). Kill switch: CBO_ADAPTIVE_MODEL=0 (no redeploy needed).
const LIGHT_CBO_MODEL = process.env.CBO_LIGHT_MODEL || 'claude-haiku-4-5';

// Exported for testability — the first-turn guard interacts with the kickoff
// route's persisted greeting, and that interaction is exactly what regressed.
export function resolveTurnModel(
  cboId: string,
  state: CboState,
  userMessage: string,
  turnKind: string | undefined,
  heavyModel: string,
): { model: string; routing: 'light' | 'heavy'; reason: string } {
  const heavy = (reason: string) => ({ model: heavyModel, routing: 'heavy' as const, reason });
  const light = (reason: string) => ({ model: LIGHT_CBO_MODEL, routing: 'light' as const, reason });

  if (process.env.CBO_ADAPTIVE_MODEL === '0') return heavy('disabled');
  // The langDirective is appended server-side — strip it before classifying,
  // or a 3-char chip answer looks like a 240-char message.
  const raw = userMessage.split('\n[LANGUAGE:')[0].trim();

  // "What do these colors mean?" from the map's legend sheet. The message
  // already carries the ramp's hex/value pairs and the tools are fenced to
  // ask_user + read_knowledge, so there is nothing here for the big model to
  // reason about — and the user is staring at a map waiting.
  if (turnKind === 'map_help') return light('map-help');

  // Reasoning-heavy shapes ALWAYS stay on the big model.
  if (state.phase > 2) return heavy('phase>2');
  if (turnKind === 'upload' || raw.startsWith("I'm uploading:") || raw.startsWith('Uploaded "')) return heavy('upload');
  // A pasted link is an extraction turn (WebFetch → multi-field
  // update_section → bulk-confirm), not a short chat reply — live testing
  // showed the light model fetching the page and then "recapping" fields it
  // never persisted. Same class as uploads: always heavy.
  if (/https?:\/\/\S+/i.test(raw)) return heavy('link-paste');
  if (turnKind === 'map' || raw.startsWith('Map selection (')) return heavy('map-result');
  if (turnKind === 'system') return heavy('system-turn');
  if (/(?:vamos\s+(?:começar|comecar)|let'?s\s+start)\s+(?:o\s+)?encontro/i.test(raw)) return heavy('phase-start');
  // First user message of the session = the intro turn (set_phase + framing).
  // Count USER messages only. The old check counted all 'content' messages,
  // and the instant-kickoff route persists one ASSISTANT content message before
  // the user ever types — so by the first real turn the count was already 2 and
  // this guard never fired: the session's most important turn fell through to
  // light('short-text') → the fast model (audit §2.3, a regression: guard
  // c9a00d5e 2026-07-02, kickoff fa647505 2026-07-07). The current user message
  // is persisted before we run, so first turn ⇒ exactly 1 user message.
  if (getCboMessages(cboId).filter(m => m.messageType === 'content' && m.role === 'user').length < 2) return heavy('first-turn');

  // Trivial conversational turns in the interview phases → fast model.
  if (turnKind === 'chip') return light('chip-answer');
  if (turnKind === 'text' && raw.length <= 200) return light('short-text');

  return heavy('default');
}

/** Human label for the working indicator while a tool executes. Server-side
 *  (not i18n keys) because the WebFetch label embeds the fetched hostname and
 *  the kickoff/recovery copy already follows this server-picks-language
 *  pattern. Returns null for instant / user-facing tools (ask_user, chips,
 *  composers, phase bookkeeping) — a label that flashes for 50ms is noise. */
function formatCboToolLabel(tool: string, input: any, lang: string): string | null {
  const pt = lang === 'pt';
  switch (tool) {
    case 'WebFetch': {
      let host = '';
      try { host = new URL(String(input?.url ?? '')).hostname.replace(/^www\./, ''); } catch { /* no host in label */ }
      return host ? (pt ? `Lendo ${host}…` : `Reading ${host}…`) : (pt ? 'Lendo o site…' : 'Reading the website…');
    }
    case 'update_section':
      return pt ? 'Atualizando a ficha…' : 'Updating the profile…';
    case 'read_org_document':
    case 'search_org_documents':
    case 'list_org_documents':
      return pt ? 'Lendo seus documentos…' : 'Reading your documents…';
    case 'read_knowledge':
    case 'search_knowledge':
      return pt ? 'Consultando o material de apoio…' : 'Checking the reference material…';
    case 'score_maturity':
      return pt ? 'Avaliando o perfil…' : 'Assessing the profile…';
    default:
      return null;
  }
}

async function streamWithSdk(cboId: string, userMessage: string, state: CboState, pushEvent: EventPusher, lang: string = 'en', turnKind?: string) {
  const mcpServer = getMcpServer(cboId);
  // Independent reads — run concurrently instead of serially. Together with
  // the cohortLanguage JOIN this collapses the pre-model DB wait from 5
  // sequential round-trips to ~1 (audit LT-2); matters most on light-model
  // fast turns where the DB wait was a visible share of the turn.
  const [sysCtx, documentsBlock, policy] = await Promise.all([
    buildSystemContext(state, lang),
    buildDocumentsBlock(cboId),
    getPhasePolicyForCbo(cboId),
  ]);
  const stateSummary = buildStateSummary(state);
  const decisionLog = buildDecisionLog(cboId);
  const accessPolicy = buildAccessPolicyPrompt(policy);

  // Pull the per-phase model from skill frontmatter, fall back to default.
  // loadEncontroSkill is cached so this is free when buildSystemContext also
  // called it. Phase 0 (pre-onboarding, before the agent fires set_phase(1)
  // on its first turn) still uses E1's skill — otherwise the first chat turn
  // has no "check CURRENT STATE first" rule and the agent asks for the org
  // name even when the invite already prefilled it.
  const skillPhase = Math.max(1, state.phase);
  const skill = await loadEncontroSkill(skillPhase);
  const heavyModel = skill?.model ?? DEFAULT_CBO_MODEL;
  const { model, routing, reason } = resolveTurnModel(cboId, state, userMessage, turnKind, heavyModel);
  console.log(`[cbo] turn routing for ${cboId}: ${routing} (${reason}) kind=${turnKind ?? 'none'} model=${model}`);

  // System prompt = the durable facts the agent needs (persona, tools, skill,
  // state, recent conversation, access policy). User prompt = just the new
  // turn. This mirrors conceptNoteAgent and is the SDK's expected shape;
  // tool-use rules placed in the system prompt are followed more reliably
  // than rules concatenated into the user message string.
  // Prompt-cache split (audit LT-1). The system prompt carries ONLY the
  // stable, phase-keyed material (persona + rules + skill = sysCtx, ~8-9K
  // tokens); everything that changes turn-to-turn (CURRENT STATE, DOCUMENTS,
  // RECENT CONVERSATION, access policy) rides in front of the user message.
  // Before this, one changed character in the volatile blocks invalidated the
  // whole prefix, so Anthropic prompt caching never hit across turns — every
  // turn re-prefilled the full skill. With the split, consecutive same-model
  // turns reuse the cached prefix (~1-1.5s off round 1 + ~90% input-cost cut
  // on the prefix). The section names stay identical — sysCtx rules that say
  // "check CURRENT STATE first" keep working; the blocks just arrive in the
  // conversation instead of the system message.
  const systemPrompt = sysCtx;
  // TODAY rides in the volatile block (never the cached system prompt): the
  // model has no other way to know the date, so age arithmetic silently
  // drifted — a site saying "fundada em 2013" got bucketed '5 a 10 anos'
  // instead of 'Mais de 10 anos' (live E1 run, 2026-07-08).
  const todayLine = `TODAY: ${new Date().toISOString().slice(0, 10)}\n`;
  const turnContext = `## CURRENT STATE\n${todayLine}${stateSummary}${documentsBlock}\n\n## RECENT CONVERSATION\n${decisionLog}${accessPolicy}\n\n## NEW MESSAGE FROM THE USER\n`;
  // The user tapped "Tenho outra dúvida" in the map's legend sheet. They are
  // parked mid-tour on the map tab; answer the question and give them the way
  // back. The tool fence below already blocks everything else, but saying so
  // keeps the model from narrating an advance it cannot perform.
  const mapHelpDirective = turnKind === 'map_help'
    ? `## THIS TURN\nO usuário está no tour de riscos do mapa e perguntou como ler as cores. Responda a pergunta em 2-3 frases curtas, usando as cores REAIS que a mensagem informa (elas variam por risco e às vezes contrariam a intuição — verde nem sempre é seguro). Não avance o encontro, não preencha campos, não reabra o mapa. Termine SEMPRE com ask_user, showMap: true, oferecendo "Voltar pro mapa" como primeira opção.\n\n`
    : '';

  console.log(`[cbo] Turn for ${cboId} (phase ${state.phase}, model ${model}, ${Object.values(state.sections).filter(s => Object.keys(s.fields).length > 0).length}/7 sections)`);

  // Track what the agent actually did this turn, so we can detect the
  // skill-violation pattern where it ends without prompting the next question
  // (the "silent turn" that strands the user behind a Continue button).
  const calledTools = new Set<string>();
  let emittedText = false;
  // Latency attribution (W1 latency pack): spawn+prefill shows up as time-to-
  // first-assistant-message; each assistant message is one inference round.
  const turnStart = Date.now();
  let firstEventMs = 0;
  let inferenceRounds = 0;
  const roundsDetail: string[] = [];

  // A map_help turn answers "what do these colors mean?" while the user sits on
  // the map with the tour paused. Fencing the tools is what makes that round
  // trip safe: the turn is structurally incapable of advancing the encontro,
  // persisting a field, or reopening the map underneath the user. It ends on
  // ask_user, which is also how it hands control back to the map.
  const MAP_HELP_TOOLS = [
    "mcp__cbo__ask_user",
    "mcp__cbo__read_knowledge",
    "mcp__cbo__search_knowledge",
  ];

  try {
    for await (const message of sdkQuery({
      prompt: mapHelpDirective + turnContext + userMessage,
      options: {
        cwd: process.cwd(),
        model,
        systemPrompt,
        // Token streaming (LT-4): emit stream_event deltas so text reaches the
        // phone as it generates instead of arriving as whole blocks after each
        // inference round (~1-3s of staring at "Processando…" per round).
        includePartialMessages: true,
        // Turn cap — a runaway tool loop otherwise burns the full ~10K-token
        // prompt once per roundtrip while the user watches "Processando…".
        // Normal turns use 2-5 tool calls; 12 is generous headroom.
        maxTurns: 12,
        // NOTE: no generic Read/Glob/Grep here. All knowledge + org-document
        // access goes through the purpose-built MCP tools below; the generic
        // file tools only invited stray repo exploration — each stray call is
        // a whole extra model roundtrip on the slowest path (Ana's "agent too
        // slow on basic questions").
        allowedTools: turnKind === 'map_help' ? MAP_HELP_TOOLS : [
          "mcp__cbo__update_section",
          "mcp__cbo__confirm_doc_fields",
          "mcp__cbo__flag_gap",
          "mcp__cbo__set_phase",
          "mcp__cbo__set_path",
          "mcp__cbo__set_maturity_tier",
          "mcp__cbo__show_examples",
          "mcp__cbo__show_nbs_familias",
          "mcp__cbo__show_familia_recommendation",
          "mcp__cbo__ask_priority_rank",
          "mcp__cbo__ask_community_anchoring",
          "mcp__cbo__ask_user",
          "mcp__cbo__open_map",
          "mcp__cbo__open_intervention_selector",
          "mcp__cbo__score_maturity",
          "mcp__cbo__set_priority_flag",
          "mcp__cbo__read_knowledge",
          "mcp__cbo__search_knowledge",
          "mcp__cbo__list_org_documents",
          "mcp__cbo__read_org_document",
          "mcp__cbo__search_org_documents",
          // Pasted links (field report 2026-07-08): the flow invites "manda o
          // link" but NOTHING could fetch a URL, so the model role-played
          // having read the page and invented near-miss categories from the
          // URL slug. WebFetch makes link ingestion real; the E1 skill pairs
          // it with an honesty rule (fetch fails → say so, ask for an upload).
          "WebFetch",
        ],
        mcpServers: mcpServer ? { cbo: mcpServer } : {},
        permissionMode: "bypassPermissions",
      },
    })) {
      // Live text deltas — transient chat_delta events (never persisted; the
      // whole-block 'chat' below is the durable record + normalizer input).
      if ((message as any).type === "stream_event") {
        const ev: any = (message as any).event;
        if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
          if (!firstEventMs) firstEventMs = Date.now() - turnStart;
          pushEvent({ type: 'chat_delta', content: ev.delta.text });
        }
        continue;
      }
      if (message.type === "assistant" && message.message?.content) {
        inferenceRounds++;
        if (!firstEventMs) firstEventMs = Date.now() - turnStart;
        roundsDetail.push(message.message.content.map((b: any) =>
          b.type === 'tool_use' ? String(b.name).replace(/^mcp__cbo__/, '') : b.type
        ).join('+'));
        for (const block of message.message.content) {
          if (block.type === "text" && block.text) {
            emittedText = true;
            // Normalize before flushing: an inline option list becomes a real
            // ask_user (buttons) instead of inert markdown bullets (CBO-INLINE-OPTIONS).
            emitAssistantText(block.text, pushEvent);
          } else if (block.type === "tool_use" && block.name) {
            // MCP tools come through namespaced as "mcp__cbo__<name>"; strip
            // the prefix so the guard below can match against canonical names.
            const toolName = String(block.name).replace(/^mcp__cbo__/, '');
            calledTools.add(toolName);
            // Live activity label (field report 2026-07: users only ever saw
            // "Processando…" and couldn't tell the agent was e.g. reading
            // their website). The tool_use block lands right BEFORE the tool
            // executes — exactly the wait this label narrates. Ephemeral:
            // the client clears it on the next text delta / composer / done.
            const label = formatCboToolLabel(toolName, (block as any).input, lang);
            if (label) pushEvent({ type: 'thinking_step', step: { id: String((block as any).id || toolName), label, status: 'active' } });
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

  // One greppable line per turn — the before/after for every latency change.
  console.log(`[cbo] timing for ${cboId}: model=${model} rounds=${inferenceRounds} first_event=${firstEventMs}ms total=${Date.now() - turnStart}ms kind=${turnKind ?? 'none'} detail=${roundsDetail.join(' | ')}`);

  // Post-turn guard. The skill (encontro-*.md) requires every mid-encontro
  // turn to end with a user-prompting tool (ask_user / a composer / a closing
  // tool). When the model violates this — emits update_section and nothing
  // else, for example — the user is stranded: no chip to click, no text to
  // reply to. The cbo-profile.tsx "Continue from Phase X" button is a backstop
  // for that case but pressing it sends a directive that derails the agent.
  //
  // This guard logs the violation (for measurement) and, when the turn was
  // both tool-less AND text-less, emits a small recoverable message so the
  // user can re-prompt instead of facing a blank screen.
  // Only USER-PROMPTING tools make a turn "safe" — ones that actually leave the
  // user something to do. score_maturity and a mid-flow set_phase are SILENT
  // (they mutate state but ask nothing); counting them as enders let a turn that
  // only scored maturity or advanced a phase strand the user with a bare
  // "Continue" and no question (CBO-TURNENDER-GUARD). set_phase to 6 is the one
  // legitimate silent close (the flow is complete).
  const USER_PROMPTING = new Set([
    'ask_user',
    'open_map',
    'open_intervention_selector',
    'ask_priority_rank',
    'ask_community_anchoring',
    'show_examples',
    'show_types',
  ]);
  const hadPrompt = Array.from(calledTools).some(name => USER_PROMPTING.has(name));
  const completedFlow = calledTools.has('set_phase') && state.phase >= 6;
  if (!hadPrompt && !completedFlow && state.phase < 6) {
    const toolsList = Array.from(calledTools).join(',') || 'none';
    console.warn(`[cbo] silent_turn_fallback for ${cboId} phase=${state.phase} tools=${toolsList} text=${emittedText}`);
    // Recovery affordance ONLY when the agent emitted no text either — that's
    // the unambiguous stranded case (a tool ran, e.g. update_section, but no
    // question followed). When the agent DID emit text we leave it alone: the
    // skill asks free-text questions (org name, mission, year) as plain prose
    // with no tool call, so emitted-text-without-a-turn-ender is usually a
    // legitimate question, and injecting a fallback there would double-respond.
    //
    // Replaces the old "type \"continuar\"" instruction with a single clickable
    // chip — on mobile, tapping beats typing, and a chip can't be fat-fingered
    // into a derailing free-text reply.
    if (!emittedText) {
      const question = lang === 'pt'
        ? 'Tive um problema técnico no meio desse passo. Vamos retomar de onde paramos?'
        : 'I hit a snag mid-step. Want to pick up where we left off?';
      const label = lang === 'pt' ? 'Continuar' : 'Continue';
      const description = lang === 'pt' ? 'Retomar de onde paramos' : 'Pick up where we left off';
      pushEvent({ type: 'ask_user', question, options: [{ label, description }] });
    }
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

// A compact "documents on file" list for the org that owns this profile —
// injected into the system prompt so the agent always knows what evidence the
// org has shared (across every session) and can read_org_document([id]) instead
// of re-asking. Best-effort; never blocks a turn.
async function buildDocumentsBlock(cboId: string): Promise<string> {
  try {
    const orgId = await getOrgIdForCboState(cboId);
    if (!orgId) return '';
    // Projection only — the full rows carry fullText, which for a doc-heavy
    // org is megabytes pulled from Postgres on EVERY chat turn (LT-3).
    const docs = await listDocumentSummariesByOrg(orgId);
    if (docs.length === 0) return '';
    const lines = docs.slice(0, 20).map(d =>
      `- [${d.id}] ${d.filename} (${d.kind ?? 'file'}${d.droppedInPhase ? `, Encontro ${d.droppedInPhase}` : ''}) — ${(d.summary || '').slice(0, 120)}`);
    return `\n\n## DOCUMENTS ON FILE (${docs.length})\nThis org has already shared these. Read the full text with read_org_document([id]) before re-asking for information that's likely in them:\n${lines.join('\n')}`;
  } catch (e: any) {
    console.error('[cbo] buildDocumentsBlock failed:', e?.message || e);
    return '';
  }
}

function buildDecisionLog(cboId: string): string {
  // The SDK is called per-turn with no session continuity, so the agent has
  // no native memory of its own previous responses. Without that context,
  // the agent reads a user message like "Test Huerta" with no idea it was
  // a reply to "what's your org name?" — and starts re-introducing itself
  // every turn. Interleave user + assistant messages so the agent sees the
  // recent conversation as a coherent thread.
  // Include composer messages (persisted prompts/strips) as readable
  // annotations — without them the agent has NO memory of questions it asked
  // via ask_user (the user's "Sim" reads as a reply to nothing), and re-asks.
  const msgs = getCboMessages(cboId).filter(m =>
    (m.messageType === 'content' || m.messageType === 'composer') &&
    !!m.content?.trim()
  );
  if (msgs.length === 0) return 'No prior conversation. This is the first turn — introduce yourself and start the flow.';
  // Last 10 messages (composers now occupy slots too). Truncate each to keep prompt small.
  const recent = msgs.slice(-10);
  return recent.map(m => {
    if (m.messageType === 'composer') {
      try {
        const p = JSON.parse(m.content);
        if (p.kind === 'ask_user') {
          const opts = (p.options ?? []).map((o: any) => o.label).join(' / ');
          return `- You (agent) asked: ${String(p.question).slice(0, 200)}${opts ? ` [options: ${opts.slice(0, 150)}]` : ''}`;
        }
        if (p.kind === 'priority') return '- You (agent) asked the user to rank the hazards by priority.';
        if (p.kind === 'anchoring') return '- You (agent) asked the community-anchoring questions.';
        if (p.kind === 'types') return '- You (agent) showed the NBS types strip.';
        if (p.kind === 'familias') return '- You (agent) showed the NBS famílias strip (5 famílias, expandable into variants).';
        if (p.kind === 'examples') return '- You (agent) showed real project examples.';
        if (p.kind === 'site_card') return `- You (agent) showed the site card: "${String(p.card?.name ?? '')}" in ${String(p.card?.bairro ?? '')} — and asked the user to confirm it.`;
        if (p.kind === 'familia_reco') return `- You (agent) showed the famílias recommendation card: ${(p.items ?? []).map((i: any) => i.familiaId).join(', ')}.`;
      } catch {}
      return null;
    }
    const who = m.role === 'user' ? 'User' : 'You (agent)';
    return `- ${who}: ${clipKeepingTail(m.content, 300)}`;
  }).filter(Boolean).join('\n');
}

// Truncate from the MIDDLE, never the end. Agent messages put their question
// LAST, so the old head-only `slice(0, 300)` deleted the question from the
// agent's own memory of any message over 300 chars. The guaranteed victim was
// the templated kickoff greeting (404 chars, every language/prefill variant):
// the model never saw that it had already asked for the contact's name+role,
// so it re-asked on turn 1 of every session. See
// docs/audit-e1-first-turn-2026-07-10.md §2.1. Exported for the proof test.
export function clipKeepingTail(text: string, max = 300): string {
  if (text.length <= max) return text;
  const marker = ' […] ';
  const head = Math.ceil((max - marker.length) * 0.55);
  const tail = max - marker.length - head;
  return `${text.slice(0, head)}${marker}${text.slice(-tail)}`;
}

// Knowledge cache (cleared on server restart)
let cougarCriteriaCache: string | null = null;
let knowledgeListingCache: string | null = null;

// Cached, parsed knowledge files for search_knowledge (path + body + whenToUse).
// Built once per restart; mirrors the read-folders used for the listing.
const KNOWLEDGE_FOLDERS = ['_interventions', '_co-benefits', '_financing-sources', '_evidence', '_success-cases', 'porto-alegre', '_cougar'];
let knowledgeFilesCache: { path: string; content: string; whenToUse: string }[] | null = null;

async function getKnowledgeFiles(): Promise<{ path: string; content: string; whenToUse: string }[]> {
  if (knowledgeFilesCache) return knowledgeFilesCache;
  const fs = await import('fs/promises');
  const path = await import('path');
  const out: { path: string; content: string; whenToUse: string }[] = [];
  for (const folder of KNOWLEDGE_FOLDERS) {
    try {
      const dir = path.join(process.cwd(), 'knowledge', folder);
      for (const f of await fs.readdir(dir)) {
        if (!f.endsWith('.md')) continue;
        const raw = await fs.readFile(path.join(dir, f), 'utf-8');
        const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        const whenToUse = fm ? (fm[1].match(/when[_-]?to[_-]?use:\s*(.+)/i)?.[1]?.trim().replace(/^["']|["']$/g, '') || '') : '';
        out.push({ path: `${folder}/${f}`, content: raw.replace(/^---[\s\S]*?---\s*/, ''), whenToUse });
      }
    } catch { /* folder may not exist */ }
  }
  knowledgeFilesCache = out;
  return out;
}

// Invalidate caches so updated knowledge files take effect
export function invalidateCboCache() { cougarCriteriaCache = null; knowledgeListingCache = null; knowledgeFilesCache = null; }

async function buildSystemContext(state: CboState, lang: string = 'en'): Promise<string> {
  const isPt = lang === 'pt';

  // ── Load knowledge caches (once per restart) ──
  if (!cougarCriteriaCache) {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const content = await fs.readFile(path.join(process.cwd(), 'knowledge', '_cougar', 'nbs-mapping-criteria.md'), 'utf-8');
      cougarCriteriaCache = content.replace(/^---[\s\S]*?---\s*/, '').slice(0, 2500);
    } catch { cougarCriteriaCache = ''; }
  }
  if (!knowledgeListingCache) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const listings: string[] = [];
    for (const folder of ['_interventions', '_co-benefits', '_financing-sources', '_evidence', '_success-cases', 'porto-alegre', '_cougar']) {
      try {
        const files = await fs.readdir(path.join(process.cwd(), 'knowledge', folder));
        listings.push(`${folder}/: ${files.filter((f: string) => f.endsWith('.md')).join(', ')}`);
      } catch {}
    }
    knowledgeListingCache = listings.join('\n');
    console.log(`[cbo] Knowledge listing loaded: ${knowledgeListingCache.length} chars`);
  }

  // ── Phase-specific instructions (only load current phase) ──
  // Prefer encontro skill markdown from knowledge/_skills/encontro-{N}.md when
  // present (E1-E6 curriculum); fall back to the hardcoded block for phases
  // that haven't been migrated yet. Phase 0 (pre-onboarding, before the agent
  // calls set_phase(1) on its first turn) maps to E1 — otherwise the first
  // turn ignores the skill's "check CURRENT STATE first" rule.
  const skillPhase = Math.max(1, state.phase);
  const encontroSkill = await loadEncontroSkill(skillPhase);
  const phaseInstructions = encontroSkill?.markdown ?? buildPhaseInstructions(state.phase, isPt);

  // Persisted maturity tier (EF-5): E1 infers and persists it via
  // set_maturity_tier; from E2 on we inject the stored value so later
  // encontros calibrate depth without re-deriving it from a transcript that
  // no longer contains the E1 signals. Stable per phase, so it lives in the
  // cached system prefix, not the volatile blocks.
  let tierBlock = '';
  if (state.phase >= 2) {
    const tier = await getMaturityTierForCboState(state.id).catch(() => null);
    if (tier) {
      const guidance: Record<string, string> = {
        emerging: isPt
          ? 'linguagem simples, sem jargão técnico ("hotspots", "tipologias"); reforço extra de acolhimento; nunca pressuponha orçamento ou estrutura formal.'
          : 'plainest language, no technical jargon; extra reassurance; never assume budget or formal structure.',
        developing: isPt ? 'profundidade e ritmo padrão.' : 'standard depth and pace.',
        advanced: isPt
          ? 'tom mais direto, assuma fluência; pode aprofundar em projetos anteriores e parcerias — perfis rasos desperdiçam o tempo dessa org.'
          : 'crisper tone, assume fluency; go deeper on prior projects and partnerships — a thin profile wastes this org\'s time.',
      };
      tierBlock = `\n\n## MATURITY TIER: ${tier}\nCalibration (persisted at E1, coordinator can override — adapt TONE and depth, never which steps you run): ${guidance[tier]}`;
    }
  }

  // ── City summary (condensed, always loaded) ──
  const citySummary = isPt
    ? `Porto Alegre, RS, Brasil. Pop 1,4M. Enchentes catastróficas em maio 2024 (piores da história do RS). Riscos: inundação (Guaíba), ilhas de calor (4° Distrito, Centro), deslizamento (morros). Planos: PCVR, World Bank P178072 (US$85M regeneração verde). Precedentes: Orla do Guaíba (5,7ha, espécies nativas), Regenera Dilúvio. COUGAR mapeou 50+ atores no ecossistema.`
    : `Porto Alegre, RS, Brazil. Pop 1.4M. Catastrophic floods May 2024 (worst in RS history). Risks: Guaíba river flooding, heat islands (4° Distrito, Centro), landslide (morros/hillsides). Plans: PCVR, World Bank P178072 (US$85M green resilient regeneration). Precedents: Orla do Guaíba (5.7ha native species park), Regenera Dilúvio. COUGAR mapped 50+ ecosystem actors.`;

  // ── Assemble prompt ──
  const prompt = `${isPt
    ? `Você é um consultor de preparação de projetos de SbN ajudando uma organização comunitária em ${state.city}. Você NÃO está apenas coletando dados — está ajudando-os a PENSAR como um consultor.
IDIOMA: TUDO em português do Brasil. Todas as mensagens, opções de ask_user e valores de update_section. Sem exceções.`
    : `You are an NBS project preparation consultant helping a community organization in ${state.city}. You are NOT just collecting data — you are helping them THINK through their project like a consultant.
LANGUAGE: Everything in English — all messages, ask_user options, AND update_section values. Keep one language per session; do not mix.`}

Phase: ${state.phase}. Org: ${state.orgName || '(not set)'}.

## TOOLS
1. **update_section** — ${isPt ? 'preencher campos' : 'fill fields'} (org_profile, intervention_site, intervention_type, impact_monitoring, operations_sustain, needs_assessment, results_evidence)
2. **ask_user** — ${isPt ? 'perguntas múltipla escolha (TUDO em português)' : 'multiple-choice questions'}
3. **open_map** — ${isPt ? 'mapa interativo' : 'interactive map'} (composite/sample/zones/assets modes)
4. **open_intervention_selector** — ${isPt ? 'seletor visual de tipos de SbN (Fase 3a)' : 'NBS type selector micro-app (Phase 3a)'}
5. **set_phase** — ${isPt ? 'avançar fase (1-5, Fase 3 tem 3a/3b/3c). Fase 6 = completo.' : 'advance phase (1-5, Phase 3 has 3a/3b/3c). Phase 6 = complete.'}
6. **score_maturity** / **set_priority_flag** — ${isPt ? 'pontuar métricas COUGAR (0-3) e flags' : 'score COUGAR metrics (0-3) and flags'}
7. **search_knowledge** / **read_knowledge** — ${isPt ? 'buscar por tópico (retorna trechos) e ler o arquivo. USE PROATIVAMENTE — busque antes de adivinhar o caminho.' : 'search by topic (returns excerpts) then read the file. USE PROACTIVELY — search before guessing a path.'}
8. **search_org_documents** / **read_org_document** — ${isPt ? 'buscar um detalhe (orçamento, nº de famílias) nos documentos que a org enviou; prefira a busca a ler o arquivo inteiro.' : "search a detail (budget, # families) across the org's uploaded docs; prefer search over reading a whole file."}
9. **flag_gap** — ${isPt ? 'marcar lacunas (prefira orientar)' : 'mark gaps (prefer guiding)'}

## PHASE ROADMAP
${isPt
  ? `1. Quem Somos (org_profile) · 2. Onde Atuamos (intervention_site, usar open_map) · 3a. O Que Construímos (intervention_type, usar open_intervention_selector) · 3b. Impacto Esperado (impact_monitoring) · 3c. Operação e Sustentabilidade (operations_sustain) · 4. O Que Precisamos (needs_assessment) · 5. Resultados e Evidências (results_evidence) · 6. Placar de Maturidade (set_phase 6 para finalizar)`
  : `1. Who We Are (org_profile) · 2. Where We Work (intervention_site, use open_map) · 3a. What We're Building (intervention_type, use open_intervention_selector) · 3b. Expected Impact (impact_monitoring) · 3c. Operations & Sustainability (operations_sustain) · 4. What We Need (needs_assessment) · 5. Results & Evidence (results_evidence) · 6. Maturity Scorecard (set_phase 6 to complete)`}

## CURRENT PHASE INSTRUCTIONS
${phaseInstructions}${tierBlock}

## RULES
${isPt
  ? `- Ser caloroso, encorajador e consultivo. Linguagem simples, sem jargão.
- **SE phase = 0 E RECENT CONVERSATION está vazio**: introduza-se brevemente, mencione upload de documentos, chame set_phase(1), e faça a primeira pergunta. NÃO repita a introdução em turnos subsequentes.
- **SE phase ≥ 1 OU já há mensagens em RECENT CONVERSATION**: você está NO MEIO da conversa. NÃO se reintroduza. Continue de onde parou. Antes de qualquer pergunta nova, **persista a resposta anterior do usuário** via update_section() — sem isso, o estado fica vazio e tudo se perde.
- **Após CADA resposta livre do usuário** (texto digitado): chame update_section('<sectionId>', { <campo>: '<valor>' }) ANTES de fazer a próxima pergunta. Isso é OBRIGATÓRIO.
- Pontuar métricas conforme coleta (não esperar). Fase 2: open_map composite. Fase 3a: open_intervention_selector.
- **PADRÃO: SEMPRE usar ask_user com chips** para qualquer pergunta com 2-7 buckets naturais (tipo de org, tamanho de equipe, proporção paga/voluntária, escala de projeto, experiência SbN, etc). Texto livre SOMENTE para inputs genuinamente únicos: nome da org, missão em uma frase, momento de orgulho. Proporções e "splits" SEMPRE viram chips ("Todas voluntárias", "Maioria voluntárias", "Metade e metade", etc) — NUNCA pedir números exatos via texto livre.
- **NUNCA juntar duas perguntas em um chip** ("CBO; 16-30 pessoas" é errado). Cada pergunta é uma chamada ask_user separada.
- TODA pergunta substantiva DEVE ter opção "Não sei / Me ajude". Quando selecionada: read_knowledge, dar exemplos brasileiros, recomendar.
- NÃO repetir perguntas já respondidas. Checar ESTADO ATUAL antes de perguntar. Referenciar respostas anteriores.
- Upload de documentos: extrair tudo, preencher com update_section, pontuar maturidade, pular perguntas respondidas.
- Pedir evidências em 3 momentos: após Fase 2 (fotos), após Fase 3a (documentos), Fase 5 (links).
- Após Fase 5: placar completo + set_phase(6). Pedir revisão do documento antes de exportar.`
  : `- Be warm, encouraging, consultative. Simple language, no jargon.
- **IF phase = 0 AND RECENT CONVERSATION is empty**: introduce yourself briefly, mention document upload, call set_phase(1), ask the first question. Do NOT repeat the intro on subsequent turns.
- **IF phase ≥ 1 OR RECENT CONVERSATION has messages**: you are MID-conversation. Do NOT re-introduce. Continue from where you left off. Before any new question, **persist the user's previous answer** via update_section() — without that, state stays empty and progress is lost.
- **After EVERY free-text user answer**: call update_section('<sectionId>', { <field>: '<value>' }) BEFORE the next question. This is MANDATORY.
- Score metrics as you go (don't wait). Phase 2: open_map composite. Phase 3a: open_intervention_selector.
- **DEFAULT: ALWAYS use ask_user with chips** for any question with 2-7 natural buckets (org type, team size, paid/volunteer split, project scale, NBS experience, etc). Free-text ONLY for genuinely unique inputs: org name, one-sentence mission, proud-moment story. Ratios and splits ALWAYS become chips ("All volunteers", "Mostly volunteers", "Half and half", etc) — NEVER ask for exact numbers via free-text.
- **NEVER bundle two questions into one chip** ("CBO; 16-30 people" is wrong). Each question is its own separate ask_user call.
- EVERY substantive question MUST have "I don't know / Help me" option. When selected: read_knowledge, give Brazilian examples, recommend.
- DO NOT repeat questions already answered. Check CURRENT STATE before asking. Reference earlier answers.
- File drops: extract all, fill with update_section, score maturity, skip answered questions.
- Ask for evidence at 3 moments: after Phase 2 (photos), after Phase 3a (documents), Phase 5 (links).
- After Phase 5: full scorecard + set_phase(6). Ask user to review document before export.`}

## MATURITY METRICS: ${MATURITY_METRICS.join(', ')}
## PRIORITY FLAGS: ${PRIORITY_FLAG_DEFINITIONS.join(', ')}

## CITY CONTEXT
${citySummary}

## COUGAR SCORING CRITERIA
${cougarCriteriaCache}

## KNOWLEDGE FILES (use read_knowledge to access)
${knowledgeListingCache}`;

  console.log(`[cbo] Prompt size: ~${Math.round(prompt.length / 4)} tokens (${prompt.length} chars) for phase ${state.phase}`);
  return prompt;
}

// ── Phase-specific instructions ──────────────────────────────────────────────
function buildPhaseInstructions(phase: number, isPt: boolean): string {
  // Map internal phase numbers to instruction blocks
  // Phase 3 covers 3a/3b/3c — we include all sub-phase instructions when phase=3
  switch (phase) {
    case 0:
    case 1:
      return isPt
        ? `**Fase 1: Quem Somos** (org_profile)
Perguntas via ask_user: nome e tipo da organização, missão, equipe (quantos, remunerados/voluntários), anos de atuação, projetos anteriores, contato.
Se desenharem ponto/área customizada no mapa: perguntar se o local tem nome.
Avaliar: Capacidade de Execução (0-3), Experiência Técnica (0-3).`
        : `**Phase 1: Who We Are** (org_profile)
Ask via ask_user: org name and type, mission, team (how many, paid/volunteer), years active, prior projects, contact.
If they draw a custom point/area on map: ask if the site has a name.
Score: Org Delivery Capacity (0-3), Team Technical Experience (0-3).`;

    case 2:
      return isPt
        ? `**Fase 2: Onde Atuamos** (intervention_site)
⚠️ O fluxo linear do E2 é conduzido por checkpoints do servidor (mapas, cartão do lugar, uso atual, posse, fotos, famílias). Você só cuida do que a skill lista: exemplos, dúvidas, uploads, ajustes. NUNCA abra mapa por conta própria nem refaça perguntas dos checkpoints.
Avaliar Controle do Local (0-3) quando land_tenure aparecer no estado.`
        : `**Phase 2: Where We Work** (intervention_site)
⚠️ The linear E2 flow is driven by server checkpoints (maps, site card, current use, tenure, photos, famílias). You only handle what the skill lists: examples, doubts, uploads, adjustments. NEVER open a map on your own or redo checkpoint questions.
Score Site Control (0-3) once land_tenure appears in state.`;

    case 3:
      return isPt
        ? `**Fase 3a: O Que Construímos** (intervention_type)
Abrir open_intervention_selector com siteHazards da Fase 2 (landslide = o HAZARD/suscetibilidade do terreno do local, não o risco — assim SbN que estabilizam encostas aparecem em encostas/morros). Se "Não sei": orientar via read_knowledge + exemplos.
Após seleção, PERGUNTAS PRESCRITIVAS (cada uma é UMA chamada ask_user com chips):
  • intervention_scale → chips: ['Pequeno (<200 m²)', 'Médio (200-1000 m²)', 'Grande (1000+ m²)', 'Não sei ainda']
  • construction_model → chips: ['Mutirão comunitário', 'Empreiteira contratada', 'Parceria universidade/ONG', 'Misto', 'Ainda não decidido']
  • Para florestas urbanas: species_preference → chips ['Espécies nativas POA', 'Frutíferas', 'Sombra (porte grande)', 'Misto', 'Equipe técnica decide']
  • Para jardins de chuva/biovaletas: substrate_type → chips ['Solo permeável existente', 'Substrato modificado', 'Cascalho + plantas', 'Ainda não sabemos']
  • justification_why_here → texto livre (1-2 frases): "Por que esse tipo nesse lugar?"
Avaliar: Clareza do Problema (0-3), Clareza da Solução (0-3).

**Fase 3b: Impacto Esperado** (impact_monitoring) — APROFUNDAR, NÃO REPETIR
NÃO perguntar sobre riscos/população (já sabe da Fase 2).
PERGUNTAS PRESCRITIVAS (cada uma uma ask_user com chips, exceto onde indicado):
  • baseline_condition → texto livre: "Como está o lugar HOJE, antes da intervenção?"
  • maintenance_frequency → chips: ['Semanal', 'Mensal', 'Trimestral', 'Anual', 'Sob demanda']
  • project_timeframe → chips: ['6 meses', '1 ano', '2 anos', '3+ anos', 'Faseado em etapas']
  • monitoring_capacity → chips: ['Nós medimos sozinhos', 'Parceria universidade', 'Sem capacidade', 'Aprender no caminho']
read_knowledge(_co-benefits/ + _evidence/impact-benchmarks.md). Apresentar COM vs SEM com faixas + confiança.
Avaliar: Impacto Climático/SbN (0-3).

**Fase 3c: Operação e Sustentabilidade** (operations_sustain) — REFERENCIAR FASE 1
NÃO perguntar sobre equipe de novo (Fase 1). Referenciar: "Na Fase 1, vocês mencionaram X..."
PERGUNTAS PRESCRITIVAS (ask_user com chips):
  • sustainability_model → chips: ['Orçamento municipal', 'Cooperativa/uso produtivo', 'Editais recorrentes', 'Misto', 'Não planejado ainda']
  • opex_estimate_year1 → chips: ['<R$ 5k/ano', 'R$ 5-20k/ano', 'R$ 20-50k/ano', 'R$ 50k+/ano', 'Não estimei ainda']
  • who_maintains → chips: ['Nossa organização', 'Comunidade voluntária', 'Parceria com prefeitura', 'Contratado externo', 'A definir']
read_knowledge para OPEX do tipo de SbN. Créditos de carbono NÃO são práticos pra escala comunitária.
Avaliar: Planejamento Financeiro (0-3).`
        : `**Phase 3a: What We're Building** (intervention_type)
Open open_intervention_selector with siteHazards from Phase 2 (landslide = the site's terrain HAZARD/susceptibility, not the risk — so slope-stabilizing NbS surface on the morros). If "I don't know": guide via read_knowledge + examples.
After selection, PRESCRIPTIVE QUESTIONS (each is ONE ask_user call with chips):
  • intervention_scale → chips: ['Small (<200 m²)', 'Medium (200-1000 m²)', 'Large (1000+ m²)', 'Not sure yet']
  • construction_model → chips: ['Community mutirão', 'Hired contractor', 'University/NGO partnership', 'Mixed', 'Undecided']
  • For urban forests: species_preference → chips ['Native POA species', 'Fruit trees', 'Shade trees', 'Mixed', 'Technical team decides']
  • For rain gardens/bioswales: substrate_type → chips ['Existing permeable soil', 'Modified substrate', 'Gravel + plants', 'Not sure']
  • justification_why_here → free-text (1-2 sentences): "Why this type in this place?"
Score: Problem Clarity (0-3), Solution Clarity (0-3).

**Phase 3b: Expected Impact** (impact_monitoring) — GO DEEPER, DON'T REPEAT
DO NOT re-ask about hazards/population (already from Phase 2).
PRESCRIPTIVE QUESTIONS (each one ask_user with chips, unless noted):
  • baseline_condition → free-text: "How is the place TODAY, before the intervention?"
  • maintenance_frequency → chips: ['Weekly', 'Monthly', 'Quarterly', 'Annual', 'On demand']
  • project_timeframe → chips: ['6 months', '1 year', '2 years', '3+ years', 'Phased']
  • monitoring_capacity → chips: ['We measure ourselves', 'University partnership', 'No capacity', 'Learn as we go']
read_knowledge(_co-benefits/ + _evidence/impact-benchmarks.md). Present WITH vs WITHOUT with ranges + confidence.
Score: Climate NBS Impact (0-3).

**Phase 3c: Operations & Sustainability** (operations_sustain) — REFERENCE PHASE 1
DO NOT re-ask about team (Phase 1). Reference: "In Phase 1, you mentioned X..."
PRESCRIPTIVE QUESTIONS (ask_user with chips):
  • sustainability_model → chips: ['Municipal budget', 'Cooperative/productive use', 'Recurring grants', 'Mixed', 'Not planned yet']
  • opex_estimate_year1 → chips: ['<R$ 5k/yr', 'R$ 5-20k/yr', 'R$ 20-50k/yr', 'R$ 50k+/yr', 'Not estimated yet']
  • who_maintains → chips: ['Our organization', 'Community volunteers', 'Municipal partnership', 'External contractor', 'TBD']
read_knowledge for OPEX of chosen NBS type. Carbon credits NOT practical at community scale.
Score: Financial Thinking (0-3).`;

    case 4:
      return isPt
        ? `**Fase 4: O Que Precisamos** (needs_assessment) — FONTES REAIS
NÃO perguntar sobre orçamento de novo (Fase 3c). read_knowledge(_financing-sources/cbo-grants.md).
Nível 1 (direto): Teia (R$100K), Fundo Casa RS (R$40K), Periferias Verdes, GEF SGP (US$50K).
Nível 2 (parceria): Petrobras SbN Urbano, World Bank P178072. Monitor: capta.org.br.
NÃO apresentar BNDES ou GCF como opções diretas para OBCs.

PERGUNTAS PRESCRITIVAS (ask_user com chips, exceto onde indicado):
  • technical_needs → multi-select chips: ['Apoio em design', 'Engenharia', 'Monitoramento', 'Capacitação técnica', 'Múltiplos', 'Nenhum']
  • regulatory_status → chips: ['Temos licenças', 'Em processo', 'Não iniciamos', 'Não sei se preciso']
  • training_needs → multi-select chips: ['Design SbN', 'Gestão de projeto', 'Engajamento comunitário', 'Monitoramento', 'Financeiro', 'Captação', 'Nenhum']
  • financial_gap → chips: ['<R$ 10k', 'R$ 10-50k', 'R$ 50-200k', 'R$ 200k+', 'Ainda não estimei']
  • equipment_needed → texto livre (lista específica, ex: "ferramentas de jardinagem, mudas, viveiro")
  • partnerships → texto livre: "Tem parcerias atuais ou potenciais? (universidades, prefeitura, ONGs, padrinhos)"
  • online_presence → texto livre: site / Instagram / Facebook (URLs)
Avaliar: Consciência Regulatória (0-3).`
        : `**Phase 4: What We Need** (needs_assessment) — REAL FUNDING SOURCES
DO NOT re-ask about budget (Phase 3c). read_knowledge(_financing-sources/cbo-grants.md).
Tier 1 (direct): Teia (R$100K), Fundo Casa RS (R$40K), Periferias Verdes, GEF SGP (US$50K).
Tier 2 (partnership): Petrobras NBS Urbano, World Bank P178072. Monitor: capta.org.br.
DO NOT present BNDES or GCF as direct CBO options.

PRESCRIPTIVE QUESTIONS (ask_user with chips, unless noted):
  • technical_needs → multi-select chips: ['Design support', 'Engineering', 'Monitoring', 'Technical capacity-building', 'Multiple', 'None']
  • regulatory_status → chips: ['Have permits', 'In process', 'Not started', 'Not sure if needed']
  • training_needs → multi-select chips: ['NBS design', 'Project management', 'Community engagement', 'Monitoring', 'Financial mgmt', 'Fundraising', 'None']
  • financial_gap → chips: ['<R$ 10k', 'R$ 10-50k', 'R$ 50-200k', 'R$ 200k+', 'Not estimated yet']
  • equipment_needed → free-text (specific list, e.g. "garden tools, seedlings, nursery")
  • partnerships → free-text: "Any current or potential partnerships? (universities, city, NGOs, sponsors)"
  • online_presence → free-text: website / Instagram / Facebook (URLs)
Score: Regulatory Awareness (0-3).`;

    case 5:
      return isPt
        ? `**Fase 5: Resultados e Evidências** (results_evidence)
PERGUNTAS PRESCRITIVAS:
  • documents → pedir DRAG AND DROP: "Arraste no chat: propostas, relatórios, fotos antes/depois, plantas, orçamentos."
  • data_collected → chips: ['Sim, temos dados quantitativos', 'Apenas dados qualitativos', 'Não medimos ainda', 'Estamos começando agora']
  • community_feedback → chips: ['Forte apoio comunitário (com evidência)', 'Apoio moderado', 'Misto', 'Ainda construindo apoio']
  • government_interest → chips: ['Apoio formal escrito', 'Interesse verbal', 'Em conversa', 'Sem contato ainda']
  • co_financing → chips: ['Sim, já temos co-financiamento', 'Em negociação', 'Buscando ativamente', 'Ainda não']
  • scalability → chips: ['Pode replicar em outros bairros já', 'Modelo testado, pronto pra escalar', 'Piloto único por enquanto', 'Não pensamos em escala ainda']
Avaliar flags: posse do terreno (Fase 2), dados de baseline (Fase 3b), interesse do governo, co-financiamento, escalabilidade.
Após completar: gerar placar de maturidade completo (todas 9 métricas + 6 flags) e chamar set_phase(6).
Dizer: "Seu perfil está completo! Revise na aba Documento e clique Exportar."`
        : `**Phase 5: Results & Evidence** (results_evidence)
PRESCRIPTIVE QUESTIONS:
  • documents → ask for DRAG AND DROP: "Drop into chat: proposals, reports, before/after photos, plans, budgets."
  • data_collected → chips: ['Yes, we have quantitative data', 'Only qualitative data', 'Not measured yet', 'Just starting now']
  • community_feedback → chips: ['Strong community support (with evidence)', 'Moderate support', 'Mixed', 'Still building support']
  • government_interest → chips: ['Formal written support', 'Verbal interest', 'In conversation', 'No contact yet']
  • co_financing → chips: ['Yes, already secured', 'In negotiation', 'Actively seeking', 'Not yet']
  • scalability → chips: ['Can replicate in other neighborhoods now', 'Model tested, ready to scale', 'Single pilot for now', 'Have not thought about scale']
Assess flags: land tenure (Phase 2), baseline data (Phase 3b), gov interest, co-financing, scalability.
After completing: generate full maturity scorecard (all 9 metrics + 6 flags) and call set_phase(6).
Say: "Your profile is complete! Review in the Document tab and click Export."`;

    default: // Phase 6+ (complete)
      return isPt
        ? `**Perfil completo.** Ajudar o usuário a revisar e editar campos. Responder perguntas sobre o projeto.`
        : `**Profile complete.** Help user review and edit fields. Answer questions about their project.`;
  }
}

// ============================================================================
// USER EDIT HANDLER
// ============================================================================

export async function handleCboEdit(cboId: string, sectionId: string, field: string, newValue: string, res: Response) {
  const state = getCboState(cboId);
  if (!state) { res.status(404).json({ error: "Not found" }); return; }
  const section = state.sections[sectionId as keyof typeof state.sections];
  if (!section) { res.status(400).json({ error: `Unknown section: ${sectionId}` }); return; }
  const oldValue = section.fields[field]?.value ?? null;
  section.fields[field] = { ...section.fields[field], value: newValue, userEdited: true };
  section.lastUpdatedBy = 'user';
  state.editLog.push({ timestamp: new Date().toISOString(), sectionId, field, oldValue, newValue, source: 'user' });
  setCboState(cboId, state);
  await streamCboChat(cboId, `User edited ${sectionId}.${field} to: "${newValue}". Update related fields if needed.`, res, state);
}
