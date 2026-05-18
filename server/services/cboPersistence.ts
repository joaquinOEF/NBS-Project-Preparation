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
import { eq, asc } from 'drizzle-orm';
import type { CboState, CboChatMessage } from '@shared/cbo-schema';

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
    console.error(`[cbo] loadCboState(${id}) error`, e);
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
    console.error(`[cbo] loadCboMessages(${id}) error`, e);
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
      metadata: state.metadata ?? { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      updatedAt: new Date(),
    };
    await db.insert(cboStates).values(values).onConflictDoUpdate({
      target: cboStates.id,
      set: values,
    });
  } catch (e) {
    console.error(`[cbo] upsertCboState(${state.id}) error`, e);
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
    console.error(`[cbo] appendCboMessages(${cboStateId}, ${msgs.length} msgs) error`, e);
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
    console.error(`[cbo] deleteCboState(${id}) error`, e);
  }
}
