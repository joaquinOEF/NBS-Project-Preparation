/**
 * RoleProvider — see docs/ROLE-ARCHITECTURE.md
 *
 * Hydrates the current `AudienceRole` from (in order):
 *   1. `?role=` query param (wins if present; also persists it).
 *   2. `localStorage.nbs_user_role` (persisted prior selection).
 *   3. `null` — caller shows the landing-page gate.
 *
 * Consumers should prefer `useRoleConfig()` for config-driven UI rather
 * than branching on the role string directly.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ROLE_CONFIGS,
  parseRole,
  type AudienceRole,
  type RoleConfig,
} from '@shared/roles';

const STORAGE_KEY = 'nbs_user_role';
const QUERY_PARAM = 'role';

interface RoleContextValue {
  role: AudienceRole | null;
  setRole: (role: AudienceRole | null) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

function readInitialRole(): AudienceRole | null {
  if (typeof window === 'undefined') return null;
  const fromQuery = parseRole(new URLSearchParams(window.location.search).get(QUERY_PARAM));
  if (fromQuery) {
    // Persist so subsequent navigations keep the role even if the query param
    // is dropped by internal routing.
    try { window.localStorage.setItem(STORAGE_KEY, fromQuery); } catch { /* storage disabled */ }
    return fromQuery;
  }
  try {
    return parseRole(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<AudienceRole | null>(() => readInitialRole());

  const setRole = useCallback((next: AudienceRole | null) => {
    setRoleState(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, next);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch { /* storage disabled */ }
  }, []);

  // Re-sync from storage if another tab changes role — avoids inconsistent state.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setRoleState(parseRole(e.newValue));
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const value = useMemo(() => ({ role, setRole }), [role, setRole]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRoleContext(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRoleContext must be used inside a RoleProvider');
  return ctx;
}

/**
 * Returns the active `RoleConfig`, or `null` if no role has been chosen yet.
 * Most UI that is only rendered after a role is chosen can assert non-null
 * (e.g. `const config = useRoleConfig()!`); the landing-page gate handles
 * the null case.
 */
export function useRoleConfig(): RoleConfig | null {
  const { role } = useRoleContext();
  return role ? ROLE_CONFIGS[role] : null;
}
