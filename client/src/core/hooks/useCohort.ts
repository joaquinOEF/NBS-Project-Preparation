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

// A row in the admin cohort switcher — every cohort with its coordinator and
// member count. Mirrors GET /api/cohort/all.
export interface CohortSummary {
  id: string;
  name: string;
  coordinatorSlug: string;
  language: 'pt' | 'en' | null;
  memberCount: number;
  coordinatorName: string | null;
  coordinatorEmail: string | null;
  isDefault: boolean;
}

export interface ProvisionInput {
  coordinatorName?: string;
  email: string;
  password: string;
  cohortName: string;
  language?: 'pt' | 'en' | null;
}

export interface UseCohortResult {
  loading: boolean;
  cohort: Cohort | null;
  members: CohortMember[];
  isAdmin: boolean;
  /** Every cohort (admin only — empty for a scoped coordinator). */
  allCohorts: CohortSummary[];
  refresh: () => Promise<void>;
  refreshAllCohorts: () => Promise<void>;
  /** Admin: load a different cohort by its coordinatorSlug into the dashboard. */
  switchCohort: (coordinatorSlug: string) => Promise<void>;
  /** Admin: create a coordinator + their cohort in one shot, then load it. */
  provisionCohort: (input: ProvisionInput) => Promise<{ ok: boolean; error?: string; coordinatorEmail?: string }>;
  resetCohort: () => Promise<void>;
  resetMember: (memberId: string) => Promise<boolean>;
  removeMember: (memberId: string) => Promise<boolean>;
  invite: (params: { orgName: string; neighborhood?: string; orgType?: 'community' | 'implementer' }) => Promise<CohortMember | null>;
  unlockPhase: (memberIds: string[] | 'all', phase: number) => Promise<boolean>;
  /** Open a workshop for the whole cohort: unlock + stamp openedAt, atomically. */
  openWorkshopPhase: (phase: number, openedAt: string) => Promise<boolean>;
  /** Close a workshop: re-lock its phase for every member and roll back sessions sitting in it. */
  closeWorkshopPhase: (phase: number) => Promise<{ relocked: number; rolledBack: number } | null>;
  saveWorkshops: (workshops: WorkshopConfig[]) => Promise<void>;
  saveLanguage: (language: 'pt' | 'en' | null) => Promise<void>;
  deleteCohort: () => Promise<void>;
}

export function useCohort(): UseCohortResult {
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allCohorts, setAllCohorts] = useState<CohortSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // The currently-loaded cohort's slug, kept in a ref so mutation callbacks
  // always target the cohort on screen — even after an admin switches away from
  // their own default to another cohort — without re-creating on every change.
  const slugRef = useRef<string>('default');

  const refreshAllCohorts = useCallback(async () => {
    const r = await fetch('/api/cohort/all');
    if (!r.ok) { setAllCohorts([]); return; }
    const data = await r.json();
    setAllCohorts(data.cohorts ?? []);
  }, []);

  // Load a specific cohort by slug into the dashboard. Works for an admin on any
  // cohort and for a scoped coordinator on their own (server-side app.param
  // guard enforces it). Does NOT touch isAdmin — that's established once at boot.
  const loadCohort = useCallback(async (cohortSlug: string) => {
    const r = await fetch(`/api/cohort/${cohortSlug}`);
    if (!r.ok) return;
    const data = await r.json();
    setCohort(data.cohort);
    setMembers(data.members ?? []);
    if (data.cohort?.coordinatorSlug) slugRef.current = data.cohort.coordinatorSlug;
  }, []);

  // Boot resolution — /mine establishes who we are (admin vs scoped) and the
  // starting cohort. Admins additionally pull the full cohort directory.
  //
  // ⚠️ COHORT-SELECTION-LOST-ON-RELOAD (JVP, 2026-08-03: "I restarted server for
  // the staging version and the W2 was closed, when I had opened it before").
  // switchCohort used to live only in React state, so every reload resolved back
  // to /mine — the coordinator's OWN cohort. An admin who had switched to
  // another cohort, opened a workshop there, and then reloaded came back to a
  // different cohort whose rail showed that workshop as never opened. Nothing
  // was lost; they were looking at the wrong cohort, which is worse, because it
  // reads as data loss and invites re-opening a workshop that is already open.
  //
  // The selection now rides in the URL (?cohort=<slug>): it survives reloads and
  // restarts, it is shareable, and there is no stale localStorage to diverge
  // from what is on screen. A slug the caller may not access simply 403s at the
  // app.param guard and we keep /mine's cohort.
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
      if (data.isAdmin) void refreshAllCohorts();

      const wanted = new URLSearchParams(window.location.search).get('cohort');
      if (wanted && wanted !== data.cohort?.coordinatorSlug) {
        await loadCohort(wanted);
      }
    } finally {
      setLoading(false);
    }
  }, [refreshAllCohorts, loadCohort]);

  useEffect(() => { fetchCohort(); }, [fetchCohort]);

  // Re-load whatever cohort is currently on screen (not always /mine — an admin
  // may have switched to another cohort). Mutations call this after writing.
  const refresh = useCallback(async () => { await loadCohort(slugRef.current); }, [loadCohort]);

  const switchCohort = useCallback(async (cohortSlug: string) => {
    setLoading(true);
    try {
      await loadCohort(cohortSlug);
      // Write the selection into the URL so a reload lands on the SAME cohort.
      // replaceState, not push: switching cohorts is changing what you're
      // looking at, not navigating somewhere you'd expect Back to undo.
      const url = new URL(window.location.href);
      url.searchParams.set('cohort', cohortSlug);
      window.history.replaceState(null, '', url.toString());
    } finally { setLoading(false); }
  }, [loadCohort]);

  const provisionCohort = useCallback<UseCohortResult['provisionCohort']>(async (input) => {
    const r = await fetch('/api/cohort/create-with-coordinator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await r.json().catch(() => ({} as any));
    if (!r.ok) return { ok: false, error: data?.error || 'Could not create cohort' };
    await refreshAllCohorts();
    if (data.cohort?.coordinatorSlug) await switchCohort(data.cohort.coordinatorSlug);
    return { ok: true, coordinatorEmail: data.coordinator?.email };
  }, [refreshAllCohorts, switchCohort]);

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

  // Reset ONE org's profile — deletes its working session and run-derived
  // progress server-side; the member row (identity, invite link, unlocks)
  // stays. Returns false on failure so the card can toast an error.
  const resetMember = useCallback(async (memberId: string) => {
    const r = await fetch(`/api/cohort/${slugRef.current}/member/${memberId}/reset`, { method: 'POST' });
    await refresh();
    return r.ok;
  }, [refresh]);

  // Remove ONE org from the cohort — the invite link dies and the card
  // disappears. The org's documents survive server-side and relink if the
  // same org name is re-invited later.
  const removeMember = useCallback(async (memberId: string) => {
    const r = await fetch(`/api/cohort/${slugRef.current}/member/${memberId}`, { method: 'DELETE' });
    await refresh();
    return r.ok;
  }, [refresh]);

  const invite: UseCohortResult['invite'] = useCallback(async ({ orgName, neighborhood, orgType }) => {
    const r = await fetch(`/api/cohort/${slugRef.current}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgName, neighborhood, orgType }),
    });
    if (!r.ok) return null;
    const { member } = await r.json();
    await refresh();
    return member;
  }, [refresh]);

  // Per-member unlock (the "unlock next phase for this one org" card action).
  // Returns ok so the caller can stop claiming success on a failed write — the
  // bare `await fetch` here used to swallow every error while the toast fired
  // regardless.
  const unlockPhase = useCallback(async (memberIds: string[] | 'all', phase: number) => {
    const r = await fetch(`/api/cohort/${slugRef.current}/unlock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds, phase }),
    });
    await refresh();
    return r.ok;
  }, [refresh]);

  // Open a workshop for the whole cohort. ONE server call that unlocks every
  // member and stamps `openedAt` in a single transaction — this used to be two
  // sequential client-driven writes to two tables, neither of which checked
  // whether it succeeded.
  const openWorkshopPhase = useCallback(async (phase: number, openedAt: string) => {
    const r = await fetch(`/api/cohort/${slugRef.current}/open-workshop`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase, openedAt }),
    });
    await refresh();
    return r.ok;
  }, [refresh]);

  const closeWorkshopPhase = useCallback(async (phase: number): Promise<{ relocked: number; rolledBack: number } | null> => {
    const r = await fetch(`/api/cohort/${slugRef.current}/close-workshop`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase }),
    });
    const body = r.ok ? await r.json() : null;
    await refresh();
    return body;
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

  return {
    loading, cohort, members, isAdmin, allCohorts,
    refresh, refreshAllCohorts, switchCohort, provisionCohort, openWorkshopPhase,
    resetCohort, resetMember, removeMember, invite, unlockPhase, closeWorkshopPhase, saveWorkshops, saveLanguage, deleteCohort,
  };
}
