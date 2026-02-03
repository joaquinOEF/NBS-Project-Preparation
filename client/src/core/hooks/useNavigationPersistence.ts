import { useCallback, useEffect, useState } from 'react';

const NAV_STATE_PREFIX = 'nbs-nav-state';

export interface NavigationState {
  currentStep?: number;
  showResults?: boolean;
  additionalState?: Record<string, unknown>;
}

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
