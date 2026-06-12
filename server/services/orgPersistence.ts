// Organization persistence — thin CRUD over the organizations table.
// See docs/cbo-platform-architecture.md (Layer 1 — org identity).

import { db } from '../db';
import { organizations, type Organization, type OrgType, type MaturityTier } from '@shared/org-schema';
import { cboStates } from '@shared/cbo-db-schema';
import { eq } from 'drizzle-orm';

export async function createOrganization(input: {
  name: string;
  city?: string;
  type?: OrgType;
  cohortId?: string | null;
  maturityTier?: MaturityTier | null;
}): Promise<Organization> {
  const [org] = await db.insert(organizations).values({
    name: input.name,
    city: input.city ?? 'porto-alegre',
    type: input.type ?? 'unknown',
    cohortId: input.cohortId ?? null,
    maturityTier: input.maturityTier ?? null,
  }).returning();
  return org;
}

export async function getOrganization(id: string): Promise<Organization | null> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
  return org ?? null;
}

/** Link a cbo_state to its owning org (set when the member↔state join is established). */
export async function linkCboStateToOrg(cboStateId: string, orgId: string): Promise<void> {
  await db.update(cboStates).set({ orgId }).where(eq(cboStates.id, cboStateId));
}
