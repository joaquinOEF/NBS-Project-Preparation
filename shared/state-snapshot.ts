// ============================================================================
// STATE SNAPSHOT — an organisation's record, portable (docs/test-orgs.md)
// ============================================================================
// Testing an encontro realistically means starting where a real organisation
// stands when it opens: Encontro 3 on a record with a full Encontro 1 and 2
// behind it — their words, their place, their documents — not on sample data
// with field ids nobody has used since July.
//
// A snapshot is that record as JSON. It can be
//   · exported from one environment (production) and imported into another
//     (staging), so a real organisation can be replayed without touching it;
//   · cloned in place, to fork a test copy of an organisation;
//   · TRIMMED to the end of an encontro, so the copy lands exactly where the
//     original stood when the next one opened.
//
// Pure. The routes do the I/O (server/routes/cohortRoutes.ts).
// ============================================================================

import { CBO_SECTIONS, E2_CLOSE_MARKERS, type CboState } from './cbo-schema';

export const SNAPSHOT_VERSION = 1;

export interface SnapshotField { value: string; confidence?: string; source?: string }
export interface SnapshotMessage { role: string; content: string; messageType?: string | null; timestamp?: string }
export interface SnapshotDoc {
  filename: string;
  kind?: string | null;
  purpose?: string | null;
  droppedInPhase?: number | null;
  summary?: string | null;
  fullText?: string | null;
}

export interface StateSnapshot {
  version: number;
  exportedAt: string;
  /** Where it came from, for the person pasting it — never used for routing. */
  from?: { orgName?: string; neighborhood?: string | null; cohortName?: string | null };
  orgName: string;
  neighborhood: string | null;
  phase: number;
  language: 'pt' | 'en' | null;
  sections: Record<string, Record<string, SnapshotField>>;
  maturityScores: Array<{ metric: string; score: number; justification?: string }>;
  priorityFlags: Array<{ flag: string; met: boolean; notes?: string }>;
  /** Optional. The transcript the advisor reads; documents as TEXT (no originals). */
  messages?: SnapshotMessage[];
  docs?: SnapshotDoc[];
}

export type AsOf = 'as-is' | 'end-of-e2';

const SECTION_PHASE = new Map(CBO_SECTIONS.map(s => [s.id as string, s.phase]));

/** The four scores Encontro 3 writes — a record at the end of Encontro 2 has none of them. */
const E3_METRICS = new Set(['problem_clarity', 'solution_clarity', 'climate_nbs_impact', 'financial_thinking']);
/** Private flags Encontro 3 leaves on the SITE section. The footprint itself is E2's too, and stays. */
const E3_SITE_FLAGS = new Set(['_area_asked', '_area_deferred', '_area_pending', '_worry_focus_pending', '_worry_focus_done', '_worry_focus']);
/** Contact details that must not travel between environments. */
const CONTACT_FIELDS = new Set(['contact_email', 'contact_phone', 'contact_whatsapp', 'whatsapp', 'phone', 'email']);

export function buildSnapshot(input: {
  state: CboState;
  orgName: string;
  neighborhood?: string | null;
  cohortName?: string | null;
  messages?: SnapshotMessage[];
  docs?: SnapshotDoc[];
}): StateSnapshot {
  const sections: StateSnapshot['sections'] = {};
  for (const [id, sec] of Object.entries(input.state.sections ?? {})) {
    const fields: Record<string, SnapshotField> = {};
    for (const [k, f] of Object.entries((sec as any)?.fields ?? {})) {
      const v = String((f as any)?.value ?? '');
      if (!v) continue;
      fields[k] = { value: v, confidence: (f as any)?.confidence, source: (f as any)?.source };
    }
    if (Object.keys(fields).length) sections[id] = fields;
  }
  const lang = input.state.metadata?.language;
  return {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    from: { orgName: input.orgName, neighborhood: input.neighborhood ?? null, cohortName: input.cohortName ?? null },
    orgName: input.orgName,
    neighborhood: input.neighborhood ?? null,
    phase: input.state.phase ?? 1,
    language: lang === 'pt' || lang === 'en' ? lang : null,
    sections,
    maturityScores: (input.state.maturityScores ?? []).map(s => ({ metric: s.metric, score: s.score, justification: s.justification })),
    priorityFlags: (input.state.priorityFlags ?? []).map(f => ({ flag: f.flag, met: !!f.met, notes: f.notes })),
    messages: input.messages,
    docs: input.docs,
  };
}

/** Throws a readable error for anything that is not a snapshot. */
export function parseSnapshot(raw: unknown): StateSnapshot {
  const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!s || typeof s !== 'object') throw new Error('not a snapshot: expected a JSON object');
  const o = s as any;
  // A bare cbo_states.state column (the SQL route out of production) is
  // accepted too: it has `sections` whose entries carry `fields`.
  if (!o.version && o.sections && Object.values(o.sections).some((x: any) => x && typeof x === 'object' && 'fields' in x)) {
    return buildSnapshot({ state: o as CboState, orgName: String(o.orgName || 'Organização'), neighborhood: null });
  }
  if (o.version !== SNAPSHOT_VERSION) throw new Error(`not a snapshot: version ${o.version ?? '(none)'} — expected ${SNAPSHOT_VERSION}`);
  if (!o.sections || typeof o.sections !== 'object') throw new Error('not a snapshot: no sections');
  return o as StateSnapshot;
}

/**
 * The record as it stood when Encontro 2 closed and Encontro 3 had not begun.
 *
 * Sections from phase 3 on are emptied; Encontro 3's scores and its private
 * flags on the site go; the transcript is cut at the line that opened
 * Encontro 3; documents dropped from Encontro 3 on are left behind. The phase
 * is 2 with Encontro 2 marked closed — so, with phase 3 unlocked, the copy
 * sees the same "Começar Encontro 3" a real organisation sees on the day.
 */
export function trimToEndOfE2(s: StateSnapshot): StateSnapshot {
  const sections: StateSnapshot['sections'] = {};
  for (const [id, fields] of Object.entries(s.sections)) {
    const phase = SECTION_PHASE.get(id) ?? 99;
    if (phase >= 3) continue;
    const kept: Record<string, SnapshotField> = {};
    for (const [k, f] of Object.entries(fields)) {
      if (id === 'intervention_site' && E3_SITE_FLAGS.has(k)) continue;
      kept[k] = f;
    }
    sections[id] = kept;
  }
  // Encontro 2 must read as closed, whichever marker the original carried.
  const site = (sections.intervention_site ??= {});
  if (!E2_CLOSE_MARKERS.some(k => site[k]?.value === 'yes')) site._e2_closed = { value: 'yes', confidence: 'high', source: 'snapshot' };

  const E3_ENTRY = /^\s*(vamos come[çc]ar o encontro 3|let'?s start encontro 3|\[skip to phase:3)/i;
  let messages = s.messages;
  if (messages?.length) {
    const cut = messages.findIndex(m => m.role === 'user' && E3_ENTRY.test(m.content ?? ''));
    if (cut >= 0) messages = messages.slice(0, cut);
  }
  return {
    ...s,
    phase: 2,
    sections,
    maturityScores: s.maturityScores.filter(m => !E3_METRICS.has(m.metric)),
    messages,
    docs: s.docs?.filter(d => (d.droppedInPhase ?? 0) < 3),
  };
}

/** Blank the contact details — a copy is for testing a flow, not for reaching a person. */
export function stripContacts(s: StateSnapshot): StateSnapshot {
  const sections: StateSnapshot['sections'] = {};
  for (const [id, fields] of Object.entries(s.sections)) {
    sections[id] = Object.fromEntries(Object.entries(fields).filter(([k]) => !CONTACT_FIELDS.has(k)));
  }
  return { ...s, sections };
}

/** What a snapshot holds, for the confirmation line in the import dialog. */
export function describeSnapshot(s: StateSnapshot): { fields: number; sections: string[]; messages: number; docs: number; hasSite: boolean } {
  const ids = Object.keys(s.sections).filter(id => Object.keys(s.sections[id]).length);
  const site = s.sections.intervention_site ?? {};
  return {
    fields: ids.reduce((n, id) => n + Object.keys(s.sections[id]).filter(k => !k.startsWith('_')).length, 0),
    sections: ids,
    messages: s.messages?.length ?? 0,
    docs: s.docs?.length ?? 0,
    hasSite: !!(site._site_lat?.value || site.site_lat?.value || site.site_name?.value),
  };
}
