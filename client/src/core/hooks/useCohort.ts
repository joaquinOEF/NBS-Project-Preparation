import { useEffect, useState, useCallback } from 'react';
import type { Cohort, CohortMember, WorkshopConfig } from '@shared/cohort-schema';
import { SAMPLE_COHORT, SAMPLE_MEMBERS } from '@/core/contexts/sample-cohort';

const STORAGE_KEY = 'oef.cohortSlug';

export type CohortMode = 'sample' | 'live';

export interface UseCohortResult {
  mode: CohortMode;
  loading: boolean;
  cohort: Cohort | null;
  members: CohortMember[];
  coordinatorSlug: string | null;
  refresh: () => Promise<void>;
  createCohort: (name: string) => Promise<void>;
  loadCohort: (slug: string) => Promise<void>;
  invite: (params: { orgName: string; neighborhood?: string; role?: 'priority' | 'alternate' }) => Promise<CohortMember | null>;
  unlockPhase: (memberIds: string[] | 'all', phase: number) => Promise<void>;
  saveWorkshops: (workshops: WorkshopConfig[]) => Promise<void>;
}

function readSlug(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function writeSlug(slug: string | null) {
  try {
    if (slug) localStorage.setItem(STORAGE_KEY, slug);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function useCohort(): UseCohortResult {
  // URL param `?coord=<slug>` overrides whatever's in localStorage so a
  // coordinator can switch devices by pasting their link.
  const [coordinatorSlug, setCoordinatorSlug] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const fromUrl = new URLSearchParams(window.location.search).get('coord');
    if (fromUrl) {
      writeSlug(fromUrl);
      return fromUrl;
    }
    return readSlug();
  });
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [loading, setLoading] = useState(false);

  const mode: CohortMode = coordinatorSlug ? 'live' : 'sample';

  const fetchCohort = useCallback(async (slug: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/cohort/${slug}`);
      if (!r.ok) {
        if (r.status === 404) {
          // Slug is dead — reset to sample mode.
          writeSlug(null);
          setCoordinatorSlug(null);
        }
        return;
      }
      const data = await r.json();
      setCohort(data.cohort);
      setMembers(data.members ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (coordinatorSlug) {
      fetchCohort(coordinatorSlug);
    } else {
      setCohort(SAMPLE_COHORT);
      setMembers(SAMPLE_MEMBERS as unknown as CohortMember[]);
    }
  }, [coordinatorSlug, fetchCohort]);

  const refresh = useCallback(async () => {
    if (coordinatorSlug) await fetchCohort(coordinatorSlug);
  }, [coordinatorSlug, fetchCohort]);

  const createCohort = useCallback(async (name: string) => {
    const r = await fetch('/api/cohort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) throw new Error('failed to create cohort');
    const { cohort } = await r.json();
    writeSlug(cohort.coordinatorSlug);
    setCoordinatorSlug(cohort.coordinatorSlug);
  }, []);

  const loadCohort = useCallback(async (slug: string) => {
    writeSlug(slug);
    setCoordinatorSlug(slug);
  }, []);

  const invite: UseCohortResult['invite'] = useCallback(async ({ orgName, neighborhood, role }) => {
    if (!coordinatorSlug) return null;
    const r = await fetch(`/api/cohort/${coordinatorSlug}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgName, neighborhood, role }),
    });
    if (!r.ok) return null;
    const { member } = await r.json();
    await refresh();
    return member;
  }, [coordinatorSlug, refresh]);

  const unlockPhase = useCallback(async (memberIds: string[] | 'all', phase: number) => {
    if (!coordinatorSlug) return;
    await fetch(`/api/cohort/${coordinatorSlug}/unlock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberIds, phase }),
    });
    await refresh();
  }, [coordinatorSlug, refresh]);

  const saveWorkshops = useCallback(async (workshops: WorkshopConfig[]) => {
    if (!coordinatorSlug) return;
    await fetch(`/api/cohort/${coordinatorSlug}/workshops`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workshops }),
    });
    await refresh();
  }, [coordinatorSlug, refresh]);

  return {
    mode, loading, cohort, members, coordinatorSlug,
    refresh, createCohort, loadCohort, invite, unlockPhase, saveWorkshops,
  };
}
