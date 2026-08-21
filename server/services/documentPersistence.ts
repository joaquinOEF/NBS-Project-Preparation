// Per-org document store persistence (see docs/cbo-platform-architecture.md).

import { db } from '../db';
import { documents, type DocumentRow, type DocumentKind, type DocumentPurpose, type DocumentMeta } from '@shared/document-schema';
import { cboStates } from '@shared/cbo-db-schema';
import { eq, desc, and, or, inArray, sql } from 'drizzle-orm';

// A document "belongs" to a CBO if it matches the member's org (cross-session
// evidence locker) OR the specific working-profile/session it was uploaded in.
// The session match is the reliable one — org_id is linked lazily (at snapshot
// time) so an upload made before that link, or in a standalone session, lands
// with org_id = null and would otherwise be invisible.
export type DocumentScope = { orgId?: string | null; cboStateId?: string | null };

function scopeConds(scope: DocumentScope) {
  const conds = [];
  if (scope.orgId) conds.push(eq(documents.orgId, scope.orgId));
  if (scope.cboStateId) conds.push(eq(documents.cboStateId, scope.cboStateId));
  return conds;
}

/** Documents for a CBO scope (org OR session), newest first. */
export async function listDocumentsForScope(scope: DocumentScope): Promise<DocumentRow[]> {
  const conds = scopeConds(scope);
  if (conds.length === 0) return [];
  return db.select().from(documents)
    .where(conds.length === 1 ? conds[0] : or(...conds))
    .orderBy(desc(documents.createdAt));
}

/** A single document, accepted only if it falls within the given scope. */
export async function getDocumentForScope(id: string, scope: DocumentScope): Promise<DocumentRow | null> {
  const doc = await getDocumentById(id);
  if (!doc) return null;
  const ok =
    (!!scope.orgId && doc.orgId === scope.orgId) ||
    (!!scope.cboStateId && doc.cboStateId === scope.cboStateId);
  return ok ? doc : null;
}

/** Strip a document row down to the client-facing metadata (no fullText/blob key). */
export function toDocumentMeta(d: DocumentRow): DocumentMeta {
  return {
    id: d.id,
    filename: d.filename,
    mimeType: d.mimeType,
    kind: d.kind,
    purpose: d.purpose ?? null,
    sizeBytes: d.sizeBytes,
    droppedInPhase: d.droppedInPhase,
    summary: d.summary,
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
    hasOriginal: !!d.storageKey,
  };
}

/** The owning org of a CBO working profile (org_id was linked in Phase 1). */
export async function getOrgIdForCboState(cboStateId: string): Promise<string | null> {
  const [row] = await db.select({ orgId: cboStates.orgId }).from(cboStates).where(eq(cboStates.id, cboStateId)).limit(1);
  return row?.orgId ?? null;
}

export async function createDocument(input: {
  orgId: string | null;
  cboStateId: string | null;
  filename: string;
  mimeType?: string | null;
  kind?: DocumentKind | null;
  purpose?: DocumentPurpose | null;
  sizeBytes?: number | null;
  fullText?: string | null;
  summary?: string | null;
  droppedInPhase?: number | null;
  source?: 'upload' | 'agent';
  parseStatus?: 'parsed' | 'failed' | null;
  parseError?: string | null;
}): Promise<DocumentRow> {
  const [doc] = await db.insert(documents).values({
    orgId: input.orgId ?? null,
    cboStateId: input.cboStateId ?? null,
    filename: input.filename,
    mimeType: input.mimeType ?? null,
    kind: input.kind ?? null,
    purpose: input.purpose ?? null,
    sizeBytes: input.sizeBytes ?? null,
    fullText: input.fullText ?? null,
    summary: input.summary ?? null,
    parseStatus: input.parseStatus ?? null,
    parseError: input.parseError ?? null,
    droppedInPhase: input.droppedInPhase ?? null,
    source: input.source ?? 'upload',
  }).returning();
  return doc;
}

/** All of an org's documents, newest first. The evidence locker for the agent. */
export async function listDocumentsByOrg(orgId: string): Promise<DocumentRow[]> {
  return db.select().from(documents).where(eq(documents.orgId, orgId)).orderBy(desc(documents.createdAt));
}

/** Summary metadata only — distinctly typed so `.fullText` misuse is a compile
 *  error. The per-turn DOCUMENTS ON FILE block needs a 120-char summary line,
 *  but listDocumentsByOrg ships every column INCLUDING fullText — for a
 *  doc-heavy org that's megabytes pulled from Postgres on every single chat
 *  turn (audit LT-3). Search/read paths keep the full rows. */
export interface DocumentSummary {
  id: string;
  filename: string;
  kind: string | null;
  purpose: string | null;
  droppedInPhase: number | null;
  summary: string | null;
}
export async function listDocumentSummariesByOrg(orgId: string): Promise<DocumentSummary[]> {
  return db
    .select({
      id: documents.id,
      filename: documents.filename,
      kind: documents.kind,
      purpose: documents.purpose,
      droppedInPhase: documents.droppedInPhase,
      summary: documents.summary,
    })
    .from(documents)
    .where(eq(documents.orgId, orgId))
    .orderBy(desc(documents.createdAt));
}

/** Document counts for a set of orgs, in one grouped query — powers the per-CBO
 *  file-count chip on the orchestrator cards without an N+1. */
export async function countDocumentsByOrgIds(orgIds: string[]): Promise<Map<string, number>> {
  const ids = orgIds.filter((id): id is string => !!id);
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ orgId: documents.orgId, n: sql<number>`count(*)::int` })
    .from(documents)
    .where(inArray(documents.orgId, ids))
    .groupBy(documents.orgId);
  const counts = new Map<string, number>();
  for (const r of rows) if (r.orgId) counts.set(r.orgId, Number(r.n));
  return counts;
}

/** Per-member document counts, matching by org OR session (one query, no N+1).
 *  Returns a Map keyed by the member's id. A document that matches a member on
 *  both org and session is counted once. */
export async function countDocumentsForMembers(
  members: { id: string; orgId: string | null; cboStateId: string | null }[],
): Promise<Map<string, number>> {
  const orgIds = Array.from(new Set(members.map(m => m.orgId).filter((x): x is string => !!x)));
  const stateIds = Array.from(new Set(members.map(m => m.cboStateId).filter((x): x is string => !!x)));
  const result = new Map<string, number>();
  if (orgIds.length === 0 && stateIds.length === 0) return result;
  const conds = [];
  if (orgIds.length) conds.push(inArray(documents.orgId, orgIds));
  if (stateIds.length) conds.push(inArray(documents.cboStateId, stateIds));
  const rows = await db
    .select({ id: documents.id, orgId: documents.orgId, cboStateId: documents.cboStateId })
    .from(documents)
    .where(conds.length === 1 ? conds[0] : or(...conds));
  for (const m of members) {
    const seen = new Set<string>();
    for (const r of rows) {
      if ((m.orgId && r.orgId === m.orgId) || (m.cboStateId && r.cboStateId === m.cboStateId)) {
        seen.add(r.id);
      }
    }
    result.set(m.id, seen.size);
  }
  return result;
}

/** A single document, scoped to its org so one org can't read another's files. */
export async function getDocumentForOrg(id: string, orgId: string): Promise<DocumentRow | null> {
  const [doc] = await db.select().from(documents)
    .where(and(eq(documents.id, id), eq(documents.orgId, orgId)))
    .limit(1);
  return doc ?? null;
}

/** A single document by id (UUID). Used by the original-file download route. */
export async function getDocumentById(id: string): Promise<DocumentRow | null> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return doc ?? null;
}

/** Record the durable-storage key for a document's original blob (Phase 2b). */
export async function updateDocumentStorageKey(id: string, storageKey: string): Promise<void> {
  await db.update(documents).set({ storageKey }).where(eq(documents.id, id));
}


/**
 * What the coordinator's org card shows about a member's files (backlog #25):
 * a couple of image ids to render as thumbnails, the newest filenames, and the
 * total so the card can say "+3" instead of pretending it showed everything.
 *
 * Same one-query shape as countDocumentsForMembers — the roster loads 10+ orgs
 * at once and must not fan out per member.
 */
export async function docPreviewForMembers(
  members: { id: string; orgId: string | null; cboStateId: string | null }[],
  opts: { images?: number; names?: number } = {},
): Promise<Map<string, { total: number; imageIds: string[]; filenames: string[]; teiaSprint: boolean }>> {
  const maxImages = opts.images ?? 3;
  const maxNames = opts.names ?? 3;
  const orgIds = Array.from(new Set(members.map(m => m.orgId).filter((x): x is string => !!x)));
  const stateIds = Array.from(new Set(members.map(m => m.cboStateId).filter((x): x is string => !!x)));
  const out = new Map<string, { total: number; imageIds: string[]; filenames: string[]; teiaSprint: boolean }>();
  for (const m of members) out.set(m.id, { total: 0, imageIds: [], filenames: [], teiaSprint: false });
  if (orgIds.length === 0 && stateIds.length === 0) return out;
  const conds = [];
  if (orgIds.length) conds.push(inArray(documents.orgId, orgIds));
  if (stateIds.length) conds.push(inArray(documents.cboStateId, stateIds));
  const rows = await db
    .select({
      id: documents.id, orgId: documents.orgId, cboStateId: documents.cboStateId,
      filename: documents.filename, kind: documents.kind, purpose: documents.purpose,
      storageKey: documents.storageKey, createdAt: documents.createdAt,
    })
    .from(documents)
    .where(conds.length === 1 ? conds[0] : or(...conds))
    .orderBy(desc(documents.createdAt));
  for (const m of members) {
    const mine = rows.filter(r =>
      (m.orgId && r.orgId === m.orgId) || (m.cboStateId && r.cboStateId === m.cboStateId));
    const seen = new Set(mine.map(r => r.id));
    out.set(m.id, {
      total: seen.size,
      // Only images with a durable original can render — without a storageKey
      // the card would show a broken frame, so it falls back to the count.
      imageIds: mine.filter(r => r.kind === 'image' && r.storageKey).slice(0, maxImages).map(r => r.id),
      filenames: mine.filter(r => r.kind !== 'image').slice(0, maxNames).map(r => r.filename),
      teiaSprint: mine.some(r => r.purpose === 'teia_sprint'),
    });
  }
  return out;
}
