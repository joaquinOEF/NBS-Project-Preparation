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

/** Resolve the org for a cbo_state (member link preferred, cboStates.orgId
 *  fallback) and set its maturity tier. Returns the org name, or null when
 *  no org exists (standalone session). Used by the agent's set_maturity_tier
 *  tool at E1 close and the coordinator override endpoint (audit EF-5 — the
 *  tier used to be inferred fresh every turn and never persisted anywhere,
 *  so E2+ had no tier signal at all). */
export async function setMaturityTierForCboState(
  cboStateId: string,
  tier: MaturityTier,
): Promise<string | null> {
  const [row] = await db.select({ orgId: cboStates.orgId }).from(cboStates).where(eq(cboStates.id, cboStateId)).limit(1);
  const orgId = row?.orgId ?? null;
  if (!orgId) return null;
  const [org] = await db.update(organizations).set({ maturityTier: tier }).where(eq(organizations.id, orgId)).returning();
  return org?.name ?? null;
}

/** Drop the org's persisted tier when its cbo_state is deleted (restart from
 *  scratch). The tier was inferred from the run being thrown away — leaving it
 *  would inject the OLD run's calibration block into the new conversation.
 *  Must run BEFORE the cbo_states row is deleted (it resolves org via the join). */
export async function clearMaturityTierForCboState(cboStateId: string): Promise<void> {
  const [row] = await db.select({ orgId: cboStates.orgId }).from(cboStates).where(eq(cboStates.id, cboStateId)).limit(1);
  if (!row?.orgId) return;
  await db.update(organizations).set({ maturityTier: null }).where(eq(organizations.id, row.orgId));
}

/** The persisted tier for a cbo_state's org, or null. Read on E2+ turns to
 *  inject the calibration block into the system context. */
export async function getMaturityTierForCboState(cboStateId: string): Promise<MaturityTier | null> {
  const [row] = await db
    .select({ tier: organizations.maturityTier })
    .from(cboStates)
    .innerJoin(organizations, eq(organizations.id, cboStates.orgId))
    .where(eq(cboStates.id, cboStateId))
    .limit(1);
  return (row?.tier as MaturityTier | null) ?? null;
}
