import { useEffect, useRef, useState, useCallback } from 'react';
import type { Cohort, CohortMember, WorkshopConfig } from '@shared/cohort-schema';

// ---------------------------------------------------------------------------
// useCohort — loads the coordinator's OWN cohort from GET /api/cohort/mine.
//
// The account resolves the cohort: a scoped coordinator gets their cohort, an
// admin gets the default singleton. All mutations target that cohort's real
// coordinatorSlug (held in slugRef so callbacks never capture a stale slug),
// which the server's app.param ownership guard then validates — so a scoped
// coordinator physically cannot act on another cohort. `isAdmin` is surfaced
// for a future cohort switcher (deferred until a 2nd cohort exists).
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
  saveLanguage: (language: 'pt' | 'en' | null) => Promise<void>;
  deleteCohort: () => Promise<void>;
}

export function useCohort(): UseCohortResult {
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  // The resolved cohort's slug, kept in a ref so mutation callbacks always use
  // the current one without re-creating on every cohort change.
  const slugRef = useRef<string>('default');

  const fetchCohort = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/cohort/mine');
      if (!r.ok) return;
      const data = await r.json();
      setCohort(data.cohort);
      setMembers(data.members ?? []);
      setIsAdmin(!!data.isAdmin);
      if (data.cohort?.coordinatorSlug) slugRef.current = data.cohort.coordinatorSlug;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCohort(); }, [fetchCohort]);

  const refresh = useCallback(async () => { await fetchCohort(); }, [fetchCohort]);

  const resetCohort = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/cohort/${slugRef.current}/reset`, { method: 'POST' });
      if (!r.ok) return;
      const data = await r.json();
      setCohort(data.cohort);
      setMembers(data.members ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const invite: UseCohortResult['invite'] = useCallback(async ({ orgName, neighborhood, role }) => {
    const r = await fetch(`/api/cohort/${slugRef.current}/invite`, {
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
    await fetch(`/api/cohort/${slugRef.current}/unlock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds, phase }),
    });
    await refresh();
  }, [refresh]);

  const saveWorkshops = useCallback(async (workshops: WorkshopConfig[]) => {
    await fetch(`/api/cohort/${slugRef.current}/workshops`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workshops }),
    });
    await refresh();
  }, [refresh]);

  const saveLanguage = useCallback(async (language: 'pt' | 'en' | null) => {
    await fetch(`/api/cohort/${slugRef.current}/language`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language }),
    });
    await refresh();
  }, [refresh]);

  const deleteCohort = useCallback(async () => {
    setLoading(true);
    try {
      await fetch(`/api/cohort/${slugRef.current}`, { method: 'DELETE' });
      // Re-resolve: the default cohort is re-created empty; a deleted scoped
      // cohort falls back to whatever /mine now returns.
      await fetchCohort();
    } finally {
      setLoading(false);
    }
  }, [fetchCohort]);

  return { loading, cohort, members, isAdmin, refresh, resetCohort, invite, unlockPhase, saveWorkshops, saveLanguage, deleteCohort };
}
