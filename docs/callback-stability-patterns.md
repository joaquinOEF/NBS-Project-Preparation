# Callback Stability & Hydration Jitter Patterns

## Problem: useCallback Identity Cascade Causes Hydration Jitter

### Summary

When a `useCallback` depends on `context` (or any frequently-changing state), its identity changes on every state update. If that callback is used as a dependency in a `useEffect`, the effect re-runs on every state change — even if the intent was to run it only once (e.g., on mount).

This causes **hydration jitter**: the effect re-fetches data from the DB, which may not yet reflect a just-applied local change, snapping the UI back to stale state.

### The Cascade Chain

```
User action (e.g., click lens button)
  → handleUpdate({ selectedLens: 'neutral' })
    → setLocalData(updated)           // immediate — UI shows 'neutral'
    → updateModule('impactModel', updated)
      → setContext(newRef)            // context reference changes
      → localStorage.setItem(...)     // immediate
      → syncModuleToDatabase(...)     // async PUT (in-flight)

Context change triggers:
  → updateModule gets new identity    (depends on [context])
  → hydrateFromDB gets new identity   (depends on [updateModule])
  → mount useEffect re-runs           (depends on [hydrateFromDB])
    → hydrateFromDB() fires async GET
    → GET races against PUT — may return OLD DB data
    → setLocalData(staleData)          // SNAP BACK to 'financial'!
```

### Symptoms

- User changes a setting (lens, toggle, selection)
- UI briefly shows the new value, then snaps back to the old value
- Console shows repeated `[Module] Hydrated from database` logs
- Happens more with slow network (wider race window between PUT and GET)

### Root Cause

```typescript
// BAD: updateModule depends on context — changes every render
const updateModule = useCallback((...) => {
  // uses `context` from closure
}, [context, syncModuleToDatabase]);

// BAD: hydrateFromDB depends on updateModule — also changes every render
const hydrateFromDB = useCallback(async () => {
  // ...
  updateModule('impactModel', data, { skipDbSync: true });
}, [projectId, isSampleMode, isSampleRoute, updateModule]); // ← unstable!

// BAD: mount effect re-runs whenever hydrateFromDB changes
useEffect(() => {
  loadContext(projectId);
  hydrateFromDB(); // re-fetches from DB on every context change!
}, [projectId, loadContext, hydrateFromDB]); // ← re-runs!
```

### Fix: Stabilize with useRef

Use a `useRef` to hold the latest version of the unstable callback, and call it via the ref inside the stable callback:

```typescript
// GOOD: Ref always points to latest updateModule without affecting deps
const updateModuleRef = useRef(updateModule);
updateModuleRef.current = updateModule;

// GOOD: hydrateFromDB is now stable — only changes when projectId changes
const hydrateFromDB = useCallback(async () => {
  // ...
  updateModuleRef.current('impactModel', data, { skipDbSync: true });
}, [projectId, isSampleMode, isSampleRoute]); // ← stable!

// GOOD: mount effect only runs when projectId changes
useEffect(() => {
  loadContext(projectId);
  hydrateFromDB();
}, [projectId, loadContext, hydrateFromDB]); // ← stable!
```

### Where This Pattern Applies

Any module page that:
1. Has a `hydrateFromDB` callback that calls `updateModule`
2. Uses `hydrateFromDB` in a `useEffect` dependency array
3. Allows user interactions that update context (which changes `updateModule` identity)

Currently fixed in:
- `client/src/core/pages/impact-model.tsx` (Feb 2026)

Should be audited in:
- Any other module pages with similar hydration patterns (site-explorer, operations, business-model, funder-selection)

### Related: skipDbSync Flag

When hydrating FROM the database, always pass `{ skipDbSync: true }` to `updateModule` to prevent a write-back loop:

```typescript
updateModuleRef.current('impactModel', freshData, { skipDbSync: true });
```

Without this flag, hydrating from DB → updateModule → syncModuleToDatabase → writes the same data back to DB (wasteful and can cause race conditions).

### Prevention Checklist

When writing new `useCallback` + `useEffect` patterns:
- [ ] Does the callback depend on `context` or `updateModule`? If so, use a ref.
- [ ] Is the callback used as a `useEffect` dependency? If so, ensure it's stable.
- [ ] Does the effect fire async operations that race with user actions? If so, stabilize.
- [ ] When calling `updateModule` from a hydration path, always pass `{ skipDbSync: true }`.
