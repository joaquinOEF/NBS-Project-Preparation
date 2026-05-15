import { useEffect, useState, useCallback } from 'react';
import type { Cohort, CohortMember, WorkshopConfig } from '@shared/cohort-schema';

// ---------------------------------------------------------------------------
// useCohort — singleton-cohort model for the Vila Flores pilot.
//
// There is exactly one cohort for the entire deployment, served from
// GET /api/cohort/default. The orchestrator opens straight to it — no slug
// to remember, no auth, no "Create" / "Load existing" dance. A Reset action
// wipes members and restores the default workshop cadence for demo dry runs.
//
// When auth lands in a later phase, this hook becomes the place that swaps
// `default` for a real coordinator session.
// ---------------------------------------------------------------------------

export interface UseCohortResult {
  loading: boolean;
  cohort: Cohort | null;
  members: CohortMember[];
  refresh: () => Promise<void>;
  resetCohort: () => Promise<void>;
  invite: (params: { orgName: string; neighborhood?: string; role?: 'priority' | 'alternate' }) => Promise<CohortMember | null>;
  unlockPhase: (memberIds: string[] | 'all', phase: number) => Promise<void>;
  saveWorkshops: (workshops: WorkshopConfig[]) => Promise<void>;
}

const COORDINATOR_SLUG = 'default';

export function useCohort(): UseCohortResult {
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCohort = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/cohort/default');
      if (!r.ok) return;
      const data = await r.json();
      setCohort(data.cohort);
      setMembers(data.members ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCohort(); }, [fetchCohort]);

  const refresh = useCallback(async () => { await fetchCohort(); }, [fetchCohort]);

  const resetCohort = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/cohort/default/reset', { method: 'POST' });
      if (!r.ok) return;
      const data = await r.json();
      setCohort(data.cohort);
      setMembers(data.members ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const invite: UseCohortResult['invite'] = useCallback(async ({ orgName, neighborhood, role }) => {
    const r = await fetch(`/api/cohort/${COORDINATOR_SLUG}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgName, neighborhood, role }),
    });
    if (!r.ok) return null;
    const { member } = await r.json();
    await refresh();
    return member;
  }, [refresh]);

  const unlockPhase = useCallback(async (memberIds: string[] | 'all', phase: number) => {
    await fetch(`/api/cohort/${COORDINATOR_SLUG}/unlock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds, phase }),
    });
    await refresh();
  }, [refresh]);

  const saveWorkshops = useCallback(async (workshops: WorkshopConfig[]) => {
    await fetch(`/api/cohort/${COORDINATOR_SLUG}/workshops`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workshops }),
    });
    await refresh();
  }, [refresh]);

  return { loading, cohort, members, refresh, resetCohort, invite, unlockPhase, saveWorkshops };
}
