// ============================================================================
// COHORT BUNDLE — a whole cohort, portable (docs/test-orgs.md → "A whole cohort")
// ============================================================================
// One snapshot per member (shared/state-snapshot.ts) plus what lives on the
// member row and the cohort rather than in the record: role, path, the
// inspiration picks, the drawn site, which phases were open, and the workshop
// calendar. Exported from production, imported on staging as a NEW cohort, so
// the pre-portfolio and the projects can be tried on what the real
// organisations said — without touching them.
//
// Contacts are stripped at export. A copy is for testing a flow, not for
// reaching a person, and a file that travels between environments is the
// wrong place for a phone number.
//
// Pure. The routes do the I/O (server/routes/cohortRoutes.ts).
// ============================================================================

import { parseSnapshot, stripContacts, type StateSnapshot } from './state-snapshot';
import type { CohortSettings, MemberSite } from './cohort-schema';

export const BUNDLE_KIND = 'cougar-cohort';
export const BUNDLE_VERSION = 1;

export interface BundleMember {
  snapshot: StateSnapshot;
  role: 'priority' | 'alternate' | null;
  path: 'has-project' | 'has-idea' | 'needs-help' | null;
  inspirationPicks: string[];
  unlockedPhases: number[];
  excludeFromPortfolio: boolean;
  /** The drawn site, minus its photographs — the files themselves do not travel. */
  site: MemberSite | null;
}

export interface CohortBundle {
  kind: typeof BUNDLE_KIND;
  version: number;
  exportedAt: string;
  cohortName: string;
  language: 'pt' | 'en' | null;
  /** The calendar and which workshops were opened — so the copy opens the same doors. */
  workshops: CohortSettings['workshops'];
  members: BundleMember[];
}

export function buildBundle(input: {
  cohortName: string;
  settings: CohortSettings | null | undefined;
  members: Array<Omit<BundleMember, 'snapshot' | 'site'> & { snapshot: StateSnapshot; site: MemberSite | null }>;
}): CohortBundle {
  const lang = input.settings?.language;
  return {
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    cohortName: input.cohortName,
    language: lang === 'pt' || lang === 'en' ? lang : null,
    workshops: input.settings?.workshops ?? [],
    members: input.members.map(m => ({
      ...m,
      snapshot: redactFreeText(stripContacts(m.snapshot)),
      site: m.site ? { ...m.site, photos: [] } : null,
    })),
  };
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// Brazilian phone shapes: (51) 99999-9999 · 51 9999 9999 · +55 51 999999999.
// Needs the 4+4 digit tail with an optional 9 — so prices (R$ 180.000), areas
// and years do not match.
const PHONE = /(?:\+?55\s?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g;

/**
 * Contacts also live in what people SAID and in their files — a WhatsApp number
 * typed into the chat, an e-mail at the foot of a proposal. The fields are
 * stripped by `stripContacts`; this blanks the same two shapes inside the
 * transcript and the documents' text, so the file can travel.
 */
export function redactFreeText(s: StateSnapshot): StateSnapshot {
  const clean = (t: string | null | undefined) => (t == null ? t : t.replace(EMAIL, '[e-mail]').replace(PHONE, '[telefone]'));
  return {
    ...s,
    messages: s.messages?.map(m => ({ ...m, content: clean(m.content) ?? '' })),
    docs: s.docs?.map(d => ({ ...d, summary: clean(d.summary), fullText: clean(d.fullText) })),
  };
}

/** True when the JSON is a cohort bundle rather than one organisation's snapshot. */
export function isBundle(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && (raw as any).kind === BUNDLE_KIND;
}

/** Throws a readable error for anything that is not a bundle. Every member's snapshot is validated too. */
export function parseBundle(raw: unknown): CohortBundle {
  const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!isBundle(o)) throw new Error('not a cohort file: expected kind "cougar-cohort"');
  if (o.version !== BUNDLE_VERSION) throw new Error(`not a cohort file: version ${o.version ?? '(none)'} — expected ${BUNDLE_VERSION}`);
  if (!Array.isArray(o.members)) throw new Error('not a cohort file: no members');
  const members: BundleMember[] = o.members.map((m: any, i: number) => {
    let snapshot: StateSnapshot;
    try { snapshot = parseSnapshot(m?.snapshot); }
    catch (e: any) { throw new Error(`member ${i + 1}: ${e?.message ?? e}`); }
    return {
      snapshot,
      role: m.role === 'alternate' ? 'alternate' : 'priority',
      path: ['has-project', 'has-idea', 'needs-help'].includes(m.path) ? m.path : null,
      inspirationPicks: Array.isArray(m.inspirationPicks) ? m.inspirationPicks.map(String) : [],
      unlockedPhases: Array.isArray(m.unlockedPhases) ? m.unlockedPhases.map(Number).filter((n: number) => Number.isFinite(n) && n >= 1) : [1],
      excludeFromPortfolio: m.excludeFromPortfolio === true,
      site: m.site && typeof m.site === 'object' ? { ...m.site, photos: [] } : null,
    };
  });
  return {
    kind: BUNDLE_KIND,
    version: BUNDLE_VERSION,
    exportedAt: String(o.exportedAt ?? ''),
    cohortName: String(o.cohortName ?? 'Coorte'),
    language: o.language === 'pt' || o.language === 'en' ? o.language : null,
    workshops: Array.isArray(o.workshops) ? o.workshops : [],
    members,
  };
}

/** What a bundle holds, for the confirmation line before anything is created. */
export function describeBundle(b: CohortBundle): { cohortName: string; members: number; messages: number; docs: number; byPhase: Record<number, number> } {
  const byPhase: Record<number, number> = {};
  for (const m of b.members) byPhase[m.snapshot.phase] = (byPhase[m.snapshot.phase] ?? 0) + 1;
  return {
    cohortName: b.cohortName,
    members: b.members.length,
    messages: b.members.reduce((n, m) => n + (m.snapshot.messages?.length ?? 0), 0),
    docs: b.members.reduce((n, m) => n + (m.snapshot.docs?.length ?? 0), 0),
    byPhase,
  };
}
