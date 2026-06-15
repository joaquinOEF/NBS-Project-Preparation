// Per-org document store persistence (see docs/cbo-platform-architecture.md).

import { db } from '../db';
import { documents, type DocumentRow, type DocumentKind } from '@shared/document-schema';
import { cboStates } from '@shared/cbo-db-schema';
import { eq, desc, and } from 'drizzle-orm';

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
  sizeBytes?: number | null;
  fullText?: string | null;
  summary?: string | null;
  droppedInPhase?: number | null;
  source?: 'upload' | 'agent';
}): Promise<DocumentRow> {
  const [doc] = await db.insert(documents).values({
    orgId: input.orgId ?? null,
    cboStateId: input.cboStateId ?? null,
    filename: input.filename,
    mimeType: input.mimeType ?? null,
    kind: input.kind ?? null,
    sizeBytes: input.sizeBytes ?? null,
    fullText: input.fullText ?? null,
    summary: input.summary ?? null,
    droppedInPhase: input.droppedInPhase ?? null,
    source: input.source ?? 'upload',
  }).returning();
  return doc;
}

/** All of an org's documents, newest first. The evidence locker for the agent. */
export async function listDocumentsByOrg(orgId: string): Promise<DocumentRow[]> {
  return db.select().from(documents).where(eq(documents.orgId, orgId)).orderBy(desc(documents.createdAt));
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
