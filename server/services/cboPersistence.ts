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
