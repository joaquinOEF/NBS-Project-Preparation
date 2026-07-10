// CBO state + chat persistence — DB-backed.
//
// Replaces the prior file-based persistence (knowledge/runs/cbo-<id>/{state,
// messages}.json). The in-memory Map in cboAgent.ts remains the hot path —
// agent tool calls mutate state synchronously without DB round-trips — and
// this module is the persistence sink that the debounced flusher writes to.
//
// Flush model: a single transaction per CBO per flush.
//   1. UPSERT cbo_states (full row replace)
//   2. INSERT cbo_messages for any messages not yet persisted
// The per-CBO "messages flushed so far" pointer is tracked in cboAgent.ts so
// repeated flushes don't re-insert the same messages.

import { db } from '../db';
import { cboStates, cboMessages } from '@shared/cbo-db-schema';
import { cohortMembers } from '@shared/cohort-schema';
import { cboSectionsFilledCount } from '@shared/cbo-schema';
import { eq, asc } from 'drizzle-orm';
import type { CboState, CboChatMessage } from '@shared/cbo-schema';

// Detect "relation does not exist" and log a clear, actionable message.
// Postgres error code 42P01 means the table is missing — almost always
// because `npm run db:push` hasn't been run after schema changes.
function logDbError(op: string, id: string, e: any) {
  if (e?.code === '42P01') {
    console.error(
      `[cbo] ${op}(${id}) — DB TABLE MISSING (code 42P01).\n` +
      `      The cbo_states / cbo_messages tables don't exist yet.\n` +
      `      Run \`npm run db:push\` on Replit shell to create them.\n` +
      `      Until then, state is in-memory only and will be lost on restart.`
    );
  } else {
    console.error(`[cbo] ${op}(${id}) error`, e);
  }
}

function rowToState(row: any): CboState {
  return {
    id: row.id,
    orgName: row.orgName ?? '',
    city: row.city ?? '',
    phase: row.phase ?? 0,
    sections: (row.sections ?? {}) as CboState['sections'],
    gaps: row.gaps ?? [],
    maturityScores: row.maturityScores ?? [],
    priorityFlags: row.priorityFlags ?? [],
    totalMaturityScore: row.totalMaturityScore ?? 0,
    editLog: row.editLog ?? [],
    uploadedFiles: row.uploadedFiles ?? [],
    activeTool: row.activeTool ?? null,
    metadata: row.metadata ?? {
      createdAt: row.createdAt?.toISOString?.() ?? new Date().toISOString(),
      updatedAt: row.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    },
  };
}

export async function loadCboState(id: string): Promise<CboState | null> {
  try {
    const [row] = await db.select().from(cboStates).where(eq(cboStates.id, id)).limit(1);
    return row ? rowToState(row) : null;
  } catch (e) {
    logDbError('loadCboState', id, e);
    return null;
  }
}

export async function loadCboMessages(id: string): Promise<CboChatMessage[]> {
  try {
    const rows = await db
      .select()
      .from(cboMessages)
      .where(eq(cboMessages.cboStateId, id))
      .orderBy(asc(cboMessages.position));
    return rows.map(r => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
      messageType: r.messageType as 'content' | 'thinking' | 'tool_status',
      timestamp: r.timestamp?.toISOString?.() ?? new Date().toISOString(),
    }));
  } catch (e) {
    logDbError('loadCboMessages', id, e);
    return [];
  }
}

/**
 * Idempotent full-row upsert. Called by the debounced flusher in cboAgent.ts.
 * The agent's in-memory state is the source of truth during a chat turn;
 * this just snapshots it to DB.
 */
export async function upsertCboState(state: CboState): Promise<void> {
  try {
    const values = {
      id: state.id,
      orgName: state.orgName ?? '',
      city: state.city ?? '',
      phase: state.phase ?? 0,
      totalMaturityScore: state.totalMaturityScore ?? 0,
      sections: state.sections ?? {},
      gaps: state.gaps ?? [],
      maturityScores: state.maturityScores ?? [],
      priorityFlags: state.priorityFlags ?? [],
      editLog: state.editLog ?? [],
      uploadedFiles: state.uploadedFiles ?? [],
      activeTool: state.activeTool ?? null,
      metadata: state.metadata ?? { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      updatedAt: new Date(),
    };
    await db.insert(cboStates).values(values).onConflictDoUpdate({
      target: cboStates.id,
      set: values,
    });
  } catch (e) {
    logDbError('upsertCboState', state.id, e);
  }
}

/**
 * Batch-append messages to a CBO's message log. `startPosition` is the
 * sequential position of the first message in this batch — cboAgent.ts
 * tracks it via lastFlushedMessageCount and increments per insert.
 */
export async function appendCboMessages(
  cboStateId: string,
  startPosition: number,
  msgs: CboChatMessage[],
): Promise<void> {
  if (msgs.length === 0) return;
  try {
    await db.insert(cboMessages).values(msgs.map((m, i) => ({
      cboStateId,
      position: startPosition + i,
      role: m.role,
      content: m.content,
      messageType: m.messageType,
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
    })));
  } catch (e) {
    logDbError(`appendCboMessages[${msgs.length} msgs]`, cboStateId, e);
  }
}

/**
 * Transactional flush — UPSERT the state row AND append any new messages in a
 * single DB transaction. Replaces the prior two separate awaits whose worst
 * case was a "half-flush" (state saved, messages lost), which left a cold load
 * with a short decision log and an agent that lost conversational context.
 * The node-postgres Pool supports interactive transactions, so this is safe.
 * Returns the new flushed-message count so the caller can advance its pointer
 * only when the whole transaction committed.
 */
export async function flushCbo(
  state: CboState,
  newMessages: CboChatMessage[],
  startPosition: number,
): Promise<{ committed: boolean; flushedCount: number }> {
  const values = {
    id: state.id,
    orgName: state.orgName ?? '',
    city: state.city ?? '',
    phase: state.phase ?? 0,
    totalMaturityScore: state.totalMaturityScore ?? 0,
    sections: state.sections ?? {},
    gaps: state.gaps ?? [],
    maturityScores: state.maturityScores ?? [],
    priorityFlags: state.priorityFlags ?? [],
    editLog: state.editLog ?? [],
    uploadedFiles: state.uploadedFiles ?? [],
    activeTool: state.activeTool ?? null,
    metadata: state.metadata ?? { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    updatedAt: new Date(),
  };
  try {
    await db.transaction(async (tx) => {
      await tx.insert(cboStates).values(values).onConflictDoUpdate({ target: cboStates.id, set: values });
      if (newMessages.length > 0) {
        await tx.insert(cboMessages).values(newMessages.map((m, i) => ({
          cboStateId: state.id,
          position: startPosition + i,
          role: m.role,
          content: m.content,
          messageType: m.messageType,
          timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
        })));
      }
    });
    // Mirror the roster snapshot server-side (audit EF-4). These columns used
    // to be written only by a client PATCH fired from the SSE handler on the
    // CBO's phone — pushEvent silently drops events with no live socket, so
    // scores earned during a dead stream (or with the app backgrounded) never
    // reached the coordinator roster. The flush path runs on every durable
    // save regardless of any client, so the roster can't silently go stale.
    // Standalone CBOs simply match zero member rows. Best-effort: a snapshot
    // miss must never fail the flush (the read path derives sections live —
    // EF-2 — so worst case the roster lags one flush).
    await syncMemberSnapshot(state).catch((e) => logDbError('syncMemberSnapshot', state.id, e));
    return { committed: true, flushedCount: startPosition + newMessages.length };
  } catch (e) {
    logDbError('flushCbo', state.id, e);
    // Pointer is NOT advanced on failure — the same messages retry next flush,
    // and the state row will be re-upserted (idempotent), so nothing is lost.
    return { committed: false, flushedCount: startPosition };
  }
}

/** Derived roster snapshot from the live state — single source of truth for
 *  what the coordinator cards show between workshops. */
async function syncMemberSnapshot(state: CboState): Promise<void> {
  const sectionsComplete = cboSectionsFilledCount(state);
  const interventionRaw = (state.sections as any)?.intervention_type?.fields;
  const intervention = (interventionRaw?.intervention_type?.value ?? interventionRaw?.nbs_type?.value ?? null) as string | null;
  await db.update(cohortMembers).set({
    snapshotPhase: state.phase ?? 1,
    snapshotSectionsComplete: sectionsComplete,
    snapshotMaturityScore: state.totalMaturityScore ?? 0,
    snapshotFlagsMet: (state.priorityFlags ?? []).filter(f => f.met).length,
    ...(intervention ? { snapshotIntervention: String(intervention) } : {}),
    snapshotUpdatedAt: new Date(),
  }).where(eq(cohortMembers.cboStateId, state.id));
}

/**
 * Restart-from-scratch cleanup — when a CBO session is deleted, every piece
 * of member/org data DERIVED from that run must go with it, or the fresh
 * session inherits ghosts of the old one (field report 2026-07-08: after
 * "recomeçar do zero" the E1 path answer survived because it lives on
 * cohort_members, not cbo_state). Clears the run-derived columns only —
 * identity (orgName, neighborhood, tokens), coordinator-controlled unlocks,
 * and support-request history are NOT touched. cboStateId is nulled; the
 * client re-binds its new session via the member-link effect immediately.
 */
export async function resetMemberProgressForCboState(cboStateId: string): Promise<void> {
  try {
    await db.update(cohortMembers).set({
      cboStateId: null,
      path: null,
      site: null,
      inspirationPicks: [],
      snapshotPhase: null,
      snapshotSectionsComplete: null,
      snapshotMaturityScore: null,
      snapshotFlagsMet: null,
      snapshotIntervention: null,
      snapshotUpdatedAt: new Date(),
    }).where(eq(cohortMembers.cboStateId, cboStateId));
  } catch (e) {
    logDbError('resetMemberProgressForCboState', cboStateId, e);
  }
}

/**
 * Self-check at boot — probes for the cbo_states table. If it doesn't exist,
 * log a single LOUD line so the dev sees the fix immediately instead of
 * chasing the symptom (re-introducing agent, 404s on cold load, etc).
 */
export async function checkCboTablesExist(): Promise<boolean> {
  try {
    await db.select().from(cboStates).limit(1);
    return true;
  } catch (e: any) {
    if (e?.code === '42P01') {
      console.error('\n' +
        '╔══════════════════════════════════════════════════════════════════════╗\n' +
        '║  ⚠️  CBO DB TABLES MISSING                                           ║\n' +
        '║                                                                      ║\n' +
        '║  The cbo_states and cbo_messages tables do not exist yet.            ║\n' +
        '║  Run `npm run db:push` on the Replit shell to create them.           ║\n' +
        '║                                                                      ║\n' +
        '║  Until then, CBO state survives only in process memory and will be   ║\n' +
        '║  lost on restart. The agent will see empty state every cold load     ║\n' +
        '║  and may re-ask questions it already asked.                          ║\n' +
        '╚══════════════════════════════════════════════════════════════════════╝\n'
      );
    } else {
      console.error('[cbo] checkCboTablesExist unexpected error', e);
    }
    return false;
  }
}

/**
 * Delete CBO state + all its messages. Used by the restart flow.
 */
export async function deleteCboState(id: string): Promise<void> {
  try {
    await db.delete(cboMessages).where(eq(cboMessages.cboStateId, id));
    await db.delete(cboStates).where(eq(cboStates.id, id));
  } catch (e) {
    logDbError('deleteCboState', id, e);
  }
}
