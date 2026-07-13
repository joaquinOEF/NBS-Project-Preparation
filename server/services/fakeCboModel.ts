// ============================================================================
// FAKE CBO MODEL — deterministic turn driver for e2e tests
// ============================================================================
//
// The CBO chat is normally driven by the Claude Agent SDK (`streamWithSdk` in
// cboAgent.ts), which is non-deterministic, slow, and costs tokens — unusable
// as a per-fix regression gate. This module is the test-only seam: when
// CBO_FAKE_MODEL=1, `streamCboChat` routes here instead of the SDK and we emit
// a *scripted* sequence of the exact same SSE events the real path emits
// (`chat`, `field_update`, `ask_user`, `phase_change`, `open_map`, `done`).
//
// Two modes:
//   1. Scripted — a test POSTs a per-CBO script via /__test/cbo/:id/script.
//      Each user message pops the next turn and runs its ops. This lets a
//      Playwright spec drive an exact, reproducible conversation.
//   2. Default — when no script (or the script is exhausted), every turn emits
//      a short ack + a generic two-option ask_user + done. This keeps the chat
//      UI permanently driveable so specs can click through phases that were
//      seeded directly via the test API.
//
// SAFETY: this module does nothing unless CBO_FAKE_MODEL === '1'. Production
// never sets that flag (it is wired only into the test/preview env alongside
// ENABLE_TEST_ROUTES), so the real SDK path is the only one that ever runs in
// the live deployment. The real turn machinery in cboAgent.ts is untouched.

import {
  type CboState,
  type CboEvent,
  type Confidence,
  MATURITY_METRICS,
  NBS_INTERVENTION_TYPES,
  isValidMaturityMetric,
  isValidSectionId,
} from '@shared/cbo-schema';
import { NBS_SHOWCASE_CARDS } from '@shared/nbs-showcase-cards';
import { resolveOpenMapParams } from '@shared/cbo-map-presets';
import { emitAssistantText } from './agentOutput';
import { canonicalizeOrgProfileValue, isEnumOrgProfileField, isCanonicalOrgProfileValue } from '@shared/cbo-field-catalog';
import { QUESTIONNAIRES, checkOptionRule } from '@shared/cbo-questionnaire';

export function isFakeModelEnabled(): boolean {
  return process.env.CBO_FAKE_MODEL === '1';
}

// ── Script shape ────────────────────────────────────────────────────────────
// A script is a queue of turns; a turn is a list of ops executed in order. The
// op names mirror the real MCP tools so a script reads like the agent's intent.
export type FakeOp =
  | { op: 'say'; text: string }
  | { op: 'wait'; ms: number } // test seam: simulate SDK thinking time (capped 25s)
  | { op: 'thinking_step'; label: string; status?: 'active' | 'complete' } // live tool-activity label (pair with 'wait' to hold it visible)
  | { op: 'update_section'; sectionId: string; field: string; value: string; confidence?: Confidence; source?: string }
  | { op: 'confirm_doc_fields'; fields?: string[] } // commit values staged by doc-sourced free-text update_section
  | { op: 'ask_user'; question: string; options: { label: string; description?: string; recommended?: boolean; action?: 'upload' }[]; multiSelect?: boolean; showMap?: boolean }
  | { op: 'score_maturity'; metric: string; score: number; justification?: string }
  | { op: 'set_phase'; phase: number }
  | { op: 'priority_flag'; flag: string; met: boolean; notes?: string }
  | { op: 'open_map'; params?: Record<string, unknown> }
  | { op: 'open_intervention_selector'; params?: Record<string, unknown> }
  | { op: 'show_types'; typeIds?: string[]; intro?: string }
  | { op: 'show_examples'; cardIds?: string[]; mode?: 'browse' | 'favorites'; intro?: string };

export type FakeTurn = FakeOp[];

// Per-CBO script queues. Plain in-memory Map — scripts are ephemeral test
// fixtures, never persisted. Keyed by cboId.
const scripts = new Map<string, FakeTurn[]>();

export function setFakeScript(cboId: string, turns: FakeTurn[]): void {
  scripts.set(cboId, [...turns]);
}

export function clearFakeScript(cboId: string): void {
  scripts.delete(cboId);
}

export function peekFakeScript(cboId: string): { remainingTurns: number } {
  return { remainingTurns: scripts.get(cboId)?.length ?? 0 };
}

type PushEvent = (event: CboEvent) => void;
interface FakeDeps {
  // Passed in from streamCboChat (same module that owns the real path) so this
  // module never has to import from cboAgent — avoids a circular import.
  setCboState: (id: string, state: CboState) => void;
}

// ── Driver ──────────────────────────────────────────────────────────────────
// Mirrors the signature of streamWithSdk so streamCboChat can swap them cleanly.
export async function streamWithFakeModel(
  cboId: string,
  userMessage: string,
  state: CboState,
  pushEvent: PushEvent,
  lang: string,
  deps: FakeDeps,
): Promise<void> {
  const queue = scripts.get(cboId);
  const turn = queue && queue.length > 0 ? queue.shift()! : defaultTurn(lang, userMessage);

  for (const op of turn) {
    if (op.op === 'wait') {
      // Simulated thinking gap — lets specs exercise heartbeat/watchdog paths.
      await new Promise(r => setTimeout(r, Math.min(Math.max(op.ms || 0, 0), 25_000)));
      continue;
    }
    runOp(cboId, op, state, pushEvent, deps, lang);
  }

  pushEvent({ type: 'done', summary: 'Response complete (fake model)' });
}

function runOp(cboId: string, op: FakeOp, state: CboState, pushEvent: PushEvent, deps: FakeDeps, lang: string): void {
  switch (op.op) {
    case 'say': {
      emitAssistantText(op.text, pushEvent);
      break;
    }
    case 'thinking_step': {
      pushEvent({ type: 'thinking_step', step: { id: 'fake-step', label: op.label, status: op.status ?? 'active' } });
      break;
    }
    case 'update_section': {
      if (!isValidSectionId(op.sectionId)) break;
      const section = state.sections[op.sectionId as keyof typeof state.sections];
      if (!section) break;
      // Same write-path canonicalization as the real update_section tool, so
      // specs exercise the id -> label mapping deterministically — including
      // the document-source rules: containment fallback, and off-list values
      // rejected (not stored) instead of persisted as approximations.
      const isDocSource = String(op.source ?? '').toLowerCase() === 'document';
      const value = op.sectionId === 'org_profile'
        ? canonicalizeOrgProfileValue(op.field, op.value, lang === 'en' ? 'en' : 'pt', isDocSource)
        : op.value;
      if (
        isDocSource && op.sectionId === 'org_profile' &&
        isEnumOrgProfileField(op.field) && !isCanonicalOrgProfileValue(op.field, value)
      ) break;
      // Same conditional-option rule as the real tool (manifest): a known
      // option excluded by the stored dependency answer is not stored.
      if (op.sectionId === 'org_profile') {
        const blocked = Object.values(QUESTIONNAIRES)
          .filter(m => m.sectionId === op.sectionId)
          .some(m => !checkOptionRule(m, op.field, value, (f) => {
            const v = section.fields[f]?.value;
            return v == null ? undefined : String(v);
          }).ok);
        if (blocked) break;
      }
      // Crawl-trust gate (mirror of the real tool): doc-sourced FREE-TEXT
      // values are staged, not written — the confirm_doc_fields op commits.
      if (isDocSource && op.sectionId === 'org_profile' && !isEnumOrgProfileField(op.field)) {
        state.stagedDocFields = state.stagedDocFields ?? {};
        state.stagedDocFields[`${op.sectionId}.${op.field}`] = {
          sectionId: op.sectionId as any, field: op.field, value: String(value),
          confidence: (op.confidence ?? 'high') as Confidence, stagedAtUserTurns: 0,
        };
        deps.setCboState(cboId, state);
        break;
      }
      section.fields[op.field] = {
        value,
        confidence: (op.confidence ?? 'high') as Confidence,
        source: op.source ?? 'user',
        userEdited: false,
      };
      section.lastUpdatedBy = 'agent';
      if (op.sectionId === 'org_profile' && op.field === 'org_name' && !state.orgName) {
        state.orgName = value;
      }
      deps.setCboState(cboId, state);
      pushEvent({ type: 'field_update', sectionId: op.sectionId, field: op.field, value: String(value), confidence: (op.confidence ?? 'high') as Confidence, source: op.source ?? 'user' });
      break;
    }
    case 'confirm_doc_fields': {
      const stagedAll = Object.values(state.stagedDocFields ?? {});
      const wanted = op.fields?.length ? stagedAll.filter(s => op.fields!.includes(s.field)) : stagedAll;
      for (const s of wanted) {
        const sec = state.sections[s.sectionId as keyof typeof state.sections];
        if (!sec) continue;
        sec.fields[s.field] = { value: s.value, confidence: s.confidence, source: 'document', userEdited: false };
        sec.lastUpdatedBy = 'agent';
        delete state.stagedDocFields![`${s.sectionId}.${s.field}`];
        pushEvent({ type: 'field_update', sectionId: s.sectionId, field: s.field, value: s.value, confidence: s.confidence, source: 'document' });
      }
      deps.setCboState(cboId, state);
      break;
    }
    case 'ask_user': {
      const options = (op.options ?? []).map(o => ({ label: o.label, description: o.description ?? '', recommended: o.recommended, action: o.action }));
      pushEvent({ type: 'ask_user', question: op.question, options, showMap: op.showMap, multiSelect: op.multiSelect });
      break;
    }
    case 'score_maturity': {
      if (!isValidMaturityMetric(op.metric)) break;
      const score = Math.max(0, Math.min(3, Math.round(Number(op.score) || 0))) as 0 | 1 | 2 | 3;
      // Replace any existing score for this metric (mirror real upsert intent).
      state.maturityScores = state.maturityScores.filter(s => s.metric !== op.metric);
      state.maturityScores.push({ metric: op.metric, score, justification: op.justification ?? 'fake' });
      state.totalMaturityScore = state.maturityScores.reduce((sum, s) => sum + s.score, 0);
      deps.setCboState(cboId, state);
      pushEvent({ type: 'maturity_update', scores: state.maturityScores, total: state.totalMaturityScore, flags: state.priorityFlags });
      break;
    }
    case 'set_phase': {
      const phase = Math.max(0, Math.min(6, Number(op.phase) || 0));
      state.phase = phase;
      deps.setCboState(cboId, state);
      pushEvent({ type: 'phase_change', phase });
      break;
    }
    case 'priority_flag': {
      state.priorityFlags = state.priorityFlags.filter(f => f.flag !== op.flag);
      state.priorityFlags.push({ flag: op.flag, met: !!op.met, notes: op.notes });
      deps.setCboState(cboId, state);
      pushEvent({ type: 'maturity_update', scores: state.maturityScores, total: state.totalMaturityScore, flags: state.priorityFlags });
      break;
    }
    case 'open_map': {
      // Resolve presets exactly as the real MCP tool does, so a spec that
      // scripts { preset: 'e2_risk_tour' } exercises the same params a live
      // agent would produce. Without this the fake path would silently pass a
      // bare {preset} straight through and the map would render nothing.
      const resolved = resolveOpenMapParams((op.params ?? {}) as any, lang === 'en' ? 'en' : 'pt');
      pushEvent({ type: 'open_map', params: resolved as any });
      break;
    }
    case 'open_intervention_selector': {
      pushEvent({ type: 'open_intervention_selector', params: (op.params ?? {}) as any });
      break;
    }
    case 'show_types': {
      const ids = op.typeIds && op.typeIds.length > 0
        ? op.typeIds
        : NBS_INTERVENTION_TYPES.map(t => t.id);
      pushEvent({ type: 'show_types', typeIds: ids, intro: op.intro });
      break;
    }
    case 'show_examples': {
      const ids = op.cardIds && op.cardIds.length > 0
        ? op.cardIds
        : NBS_SHOWCASE_CARDS.map(c => c.id);
      pushEvent({ type: 'show_examples', cardIds: ids, mode: op.mode ?? 'browse', intro: op.intro });
      break;
    }
  }
}

// A safe, generic turn used whenever no script is queued: keeps the chat UI
// driveable without asserting any particular content. PT/EN aware so the
// sticky-language fix can be exercised against it.
function defaultTurn(lang: string, _userMessage: string): FakeTurn {
  const pt = lang === 'pt';
  return [
    { op: 'say', text: pt ? 'Entendi. Vamos continuar.' : "Got it. Let's continue." },
    {
      op: 'ask_user',
      question: pt ? 'Como deseja prosseguir?' : 'How would you like to proceed?',
      options: [
        { label: pt ? 'Continuar' : 'Continue', description: pt ? 'Seguir para a próxima etapa' : 'Move to the next step' },
        { label: pt ? 'Outra coisa' : 'Something else', description: pt ? 'Responder com texto livre' : 'Reply in free text' },
      ],
    },
  ];
}
