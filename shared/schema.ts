// Main schema barrel. Re-exports grouped by which product surface owns them
// (audit DS-8) — the legacy tables are NOT dropped (prod still holds old demo
// data and the legacy pages behind ENABLE_LEGACY_ROUTES still read them);
// this grouping just stops new workshop code from reaching for them by
// accident.

// ── WORKSHOP (COUGAR — live product) ────────────────────────────────────────
export * from './org-schema';          // organizations (spine: type, maturity tier)
export * from './coordinator-schema';  // coordinator accounts + sessions
export * from './cohort-schema';       // cohorts, members, workshops, sites
export * from './cbo-db-schema';       // cbo_states + cbo_messages (chat truth)
export * from './document-schema';     // uploaded evidence / documents

// ── SHARED (both surfaces) ──────────────────────────────────────────────────
export * from './sample-constants';

// ── LEGACY (city prototype — server half behind ENABLE_LEGACY_ROUTES) ──────
export * from './core-schema';         // users/cities/projects (OAuth city flow)
export * from './workspace-schema';    // project workspace + block state machine
export * from './block-schemas';       // per-block zod payloads
export * from './models/chat';         // ChatDrawer conversations/messages
export * from './knowledge-schema';    // fake-vector knowledge store (legacy agent)
