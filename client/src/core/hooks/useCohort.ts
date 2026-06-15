import { useEffect, useRef, useState, useCallback } from 'react';
import type { Cohort, CohortMember, WorkshopConfig } from '@shared/cohort-schema';

// ---------------------------------------------------------------------------
// useCohort — loads the cohort THIS coordinator manages.
//
// GET /api/cohort/mine resolves the cohort from the logged-in coordinator's
// account (scoped coordinator → their cohort; admin → the default landing
// cohort). Every mutation then targets that cohort's own slug, and the server
// enforces ownership — so two coordinators see and act on different cohorts.
//
// All requests are same-origin, so the coordinator session cookie rides along
// automatically. A 401 means the session lapsed; the orchestrator page's auth
// guard handles the redirect to /coordinator-login.
// ---------------------------------------------------------------------------

export interface UseCohortResult {
  loading: boolean;
  cohort: Cohort | null;
  members: CohortMember[];
  isAdmin: boolean;
  refresh: () => Promise<void>;
  resetCohort: () => Promise<void>;
  invite: (params: { orgName: string; neighborhood?: string; role?: 'priority' | 'alternate' }) => Promise<CohortMember | null>;
  unlockPhase: (memberIds: string[] | 'all', phase: number) => Promise<void>;
  saveWorkshops: (workshops: WorkshopConfig[]) => Promise<void>;
}

export function useCohort(): UseCohortResult {
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  // The coordinator's own cohort slug, used for every mutation. Held in a ref
  // so the mutation callbacks stay referentially stable across reloads.
  const slugRef = useRef<string | null>(null);

  const fetchCohort = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/cohort/mine');
      if (!r.ok) return;
      const data = await r.json();
      setCohort(data.cohort ?? null);
      setMembers(data.members ?? []);
      setIsAdmin(!!data.isAdmin);
      slugRef.current = data.cohort?.coordinatorSlug ?? null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCohort(); }, [fetchCohort]);

  const refresh = useCallback(async () => { await fetchCohort(); }, [fetchCohort]);

  const resetCohort = useCallback(async () => {
    const slug = slugRef.current;
    if (!slug) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/cohort/${slug}/reset`, { method: 'POST' });
      if (!r.ok) return;
      const data = await r.json();
      setCohort(data.cohort);
      setMembers(data.members ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const invite: UseCohortResult['invite'] = useCallback(async ({ orgName, neighborhood, role }) => {
    const slug = slugRef.current;
    if (!slug) return null;
    const r = await fetch(`/api/cohort/${slug}/invite`, {
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
    const slug = slugRef.current;
    if (!slug) return;
    await fetch(`/api/cohort/${slug}/unlock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds, phase }),
    });
    await refresh();
  }, [refresh]);

  const saveWorkshops = useCallback(async (workshops: WorkshopConfig[]) => {
    const slug = slugRef.current;
    if (!slug) return;
    await fetch(`/api/cohort/${slug}/workshops`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workshops }),
    });
    await refresh();
  }, [refresh]);

  return { loading, cohort, members, isAdmin, refresh, resetCohort, invite, unlockPhase, saveWorkshops };
}
