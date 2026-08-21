// Funnel event recording. One function, one table, fire-and-forget.
//
// The contract that matters: recording an event must NEVER affect the org's
// session. A telemetry insert that throws, blocks, or slows a turn would be a
// worse bug than the blindness it exists to fix — so every call is
// unawaited-safe and every failure is swallowed after a log line.

import { db } from '../db';
import { cboEvents, type CboEventName, type CboEventOutcome, type CboEventRow } from '@shared/schema';
import { getOrgIdForCboState } from './documentPersistence';

export function recordCboEvent(input: {
  cboStateId: string;
  name: CboEventName;
  phase?: number | null;
  step?: string | null;
  outcome?: CboEventOutcome | null;
  detail?: string | null;
}): void {
  // Intentionally not returned: callers must not be able to await this and
  // accidentally put telemetry on the critical path.
  void (async () => {
    try {
      const orgId = await getOrgIdForCboState(input.cboStateId).catch(() => null);
      await db.insert(cboEvents).values({
        cboStateId: input.cboStateId,
        orgId: orgId ?? null,
        phase: input.phase ?? null,
        name: input.name,
        step: input.step ?? null,
        outcome: input.outcome ?? null,
        detail: input.detail ? input.detail.slice(0, 300) : null,
      });
    } catch (e: any) {
      console.error('[cboEvents] record failed (ignored):', e?.message || e);
    }
  })();
}

/** Where organizations are stopping, for one cohort or across all of them.
 *
 *  Two questions, one query each, both of which took six weeks of hand-reading
 *  to answer for W2:
 *   - which beat does each org last reach, and how long ago
 *   - how often does a map fail to render
 */
export async function getFunnelSummary(): Promise<{
  perOrg: Array<{ cboStateId: string; orgId: string | null; phase: number | null; lastStep: string | null; lastAt: string | null }>;
  stepCounts: Array<{ step: string; orgs: number }>;
  mapRender: { ok: number; failed: number };
}> {
  const rows = await db.select().from(cboEvents);

  const latest = new Map<string, CboEventRow>();
  const stepOrgs = new Map<string, Set<string>>();
  let ok = 0;
  let failed = 0;

  for (const r of rows) {
    if (r.name === 'map_render') {
      if (r.outcome === 'failed') failed++;
      else ok++;
      continue;
    }
    if (r.name !== 'checkpoint' || !r.step) continue;
    if (!stepOrgs.has(r.step)) stepOrgs.set(r.step, new Set());
    stepOrgs.get(r.step)!.add(r.cboStateId);
    const prev = latest.get(r.cboStateId);
    if (!prev || (r.createdAt ?? 0) > (prev.createdAt ?? 0)) latest.set(r.cboStateId, r);
  }

  return {
    perOrg: Array.from(latest.values()).map(r => ({
      cboStateId: r.cboStateId,
      orgId: r.orgId,
      phase: r.phase,
      lastStep: r.step,
      lastAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    })),
    stepCounts: Array.from(stepOrgs.entries())
      .map(([step, set]) => ({ step, orgs: set.size }))
      .sort((a, b) => b.orgs - a.orgs),
    mapRender: { ok, failed },
  };
}

