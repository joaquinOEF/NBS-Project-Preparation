import { useCallback, useEffect, useState } from 'react';

const NAV_STATE_PREFIX = 'nbs-nav-state';

export interface NavigationState {
  currentStep?: number;
  showResults?: boolean;
  additionalState?: Record<string, unknown>;
}

/**
 * Navigation persistence — remembers per-module UI state across reloads via localStorage.
 *
 * ⚠️ Anti-pattern to avoid: "persisted-state swap loop"
 * ----------------------------------------------------
 * Do NOT drive local component state FROM `navigationState` on every change.
 * If you also have a write-back effect that pushes local state INTO
 * `navigationState` (the usual pairing), the two effects will alternate
 * values on every commit — ~125 renders/sec, visible UI flicker.
 *
 *   ❌ // runs on every savedNavState reference change → loops with write-back
 *   useEffect(() => {
 *     if (navigationRestored && savedNavState) {
 *       setCurrentStep(savedNavState.currentStep ?? 0);
 *       setFoo(savedNavState.additionalState?.foo);
 *     }
 *   }, [navigationRestored, savedNavState]);
 *
 *   ✅ // restore ONCE when persistence finishes loading; latch with a ref
 *   const navRestoreAppliedRef = useRef(false);
 *   useEffect(() => {
 *     if (!navigationRestored || navRestoreAppliedRef.current) return;
 *     navRestoreAppliedRef.current = true;
 *     if (savedNavState) {
 *       setCurrentStep(savedNavState.currentStep ?? 0);
 *       setFoo(savedNavState.additionalState?.foo);
 *     }
 *   }, [navigationRestored, savedNavState]);
 *
 * After the one-shot restore, local state is the source of truth; the
 * persisted store becomes write-only for the rest of the session.
 *
 * Also applies to any effect that **reads** from `navigationState` in its
 * deps (e.g. an effect that calls `loadContext` gated on `savedNavState`).
 * Reference churn on every write-back cascades through `setContext` and
 * triggers every context subscriber — same class of loop, longer chain.
 *
 * Seen in: NBS funder-selection, April 2026. Fixed in PRs #114, #115.
 */

interface UseNavigationPersistenceOptions {
  projectId: string | undefined;
  moduleName: string;
  enabled?: boolean;
}

interface UseNavigationPersistenceReturn {
  navigationState: NavigationState | null;
  setNavigationState: (state: NavigationState) => void;
  updateNavigationState: (updates: Partial<NavigationState>) => void;
  navigationRestored: boolean;
  clearNavigationState: () => void;
}

export function useNavigationPersistence({
  projectId,
  moduleName,
  enabled = true,
}: UseNavigationPersistenceOptions): UseNavigationPersistenceReturn {
  const [navigationState, setNavigationStateInternal] = useState<NavigationState | null>(null);
  const [navigationRestored, setNavigationRestored] = useState(false);

  const getStorageKey = useCallback(() => {
    if (!projectId) return null;
    return `${NAV_STATE_PREFIX}_${moduleName}_${projectId}`;
  }, [projectId, moduleName]);

  const setNavigationState = useCallback((state: NavigationState) => {
    const key = getStorageKey();
    if (!key || !enabled) return;
    
    setNavigationStateInternal(state);
    localStorage.setItem(key, JSON.stringify(state));
  }, [getStorageKey, enabled]);

  const updateNavigationState = useCallback((updates: Partial<NavigationState>) => {
    const key = getStorageKey();
    if (!key || !enabled) return;
    
    setNavigationStateInternal(prev => {
      const updated = { ...prev, ...updates };
      localStorage.setItem(key, JSON.stringify(updated));
      return updated;
    });
  }, [getStorageKey, enabled]);

  const clearNavigationState = useCallback(() => {
    const key = getStorageKey();
    if (!key) return;
    
    localStorage.removeItem(key);
    setNavigationStateInternal(null);
  }, [getStorageKey]);

  useEffect(() => {
    if (!enabled || navigationRestored) return;
    
    const key = getStorageKey();
    if (!key) {
      // No key available yet (projectId undefined) - don't block, will retry when available
      return;
    }
    
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored) as NavigationState;
        setNavigationStateInternal(parsed);
      }
    } catch (e) {
      console.error(`Failed to restore navigation state for ${moduleName}:`, e);
    }
    
    setNavigationRestored(true);
  }, [getStorageKey, moduleName, enabled, navigationRestored, projectId]); // Include projectId to retry when it becomes available

  return {
    navigationState,
    setNavigationState,
    updateNavigationState,
    navigationRestored,
    clearNavigationState,
  };
}
