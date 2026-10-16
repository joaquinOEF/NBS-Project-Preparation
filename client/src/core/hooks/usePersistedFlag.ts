import { useCallback, useEffect, useState } from 'react';

/**
 * A boolean remembered per browser (a folded panel, a hidden map). Storage can
 * be missing or throw — private windows, blocked site data — and then the flag
 * simply starts at its default every time.
 */
export function usePersistedFlag(key: string, initial: boolean): [boolean, (next: boolean | ((cur: boolean) => boolean)) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : raw === '1';
    } catch { return initial; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, value ? '1' : '0'); } catch { /* not remembered, still works */ }
  }, [key, value]);
  const set = useCallback((next: boolean | ((cur: boolean) => boolean)) => setValue(next), []);
  return [value, set];
}
