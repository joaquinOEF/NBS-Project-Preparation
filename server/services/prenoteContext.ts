// ============================================================================
// THE PRE-NOTE'S WHOLE INPUT — and the summary written over it
// ============================================================================
// `buildPrenote` is pure; the record lives partly outside the state — the
// photographs (documents) and the cohort counts (other organisations). Every
// path that builds a pre-note goes through `prenoteInputFor`, so the chat card,
// the drawer and both printed copies read the SAME facts. ⚠️ That matters for
// more than consistency: the written summary is re-validated against the facts
// at print time (`applyStoredAuthoring`), and a sentence written with the
// cohort counts but printed without them is dropped for citing a number
// "nobody handed it". Same rule the concept note learned (cboAgent.ts).
// ============================================================================

import { isPhotoCaption } from '@shared/photo-caption';
import { buildConceptNote } from '@shared/concept-note';
import { prenoteInputFromSections, prenoteSolution, conceptInputFor, type PrenoteInput } from '@shared/e4-prenote';
import { listDocumentsForScope, getOrgIdForCboState } from './documentPersistence';
import { authorConceptNote } from './conceptNoteAuthor';
import { cityMapFor } from './siteContext';
import { censusForSite } from './censusContext';
import { healSite } from './siteHealing';

export const PRENOTE_AUTHOR_MODEL = process.env.PRENOTE_AUTHOR_MODEL || 'claude-opus-5-5';

export async function prenoteInputFor(
  cboStateId: string,
  sections: unknown,
  lang: 'pt' | 'en',
  opts: { photoUrl: (docId: string) => string; cohortLines: (cboId: string, lang: 'pt' | 'en') => Promise<string[]>; orgId?: string | null },
): Promise<PrenoteInput> {
  const raw = prenoteInputFromSections(sections);
  // The bairro figures for where the pin is (siteHealing.ts) — read, never written back.
  const base = { ...raw, site: healSite(raw.site) };
  const orgId = opts.orgId ?? (await getOrgIdForCboState(cboStateId).catch(() => null));
  const docs = await listDocumentsForScope({ cboStateId, ...(orgId ? { orgId } : {}) }).catch(() => [] as any[]);
  // Only a CAPTION travels — never the literal description an old upload
  // carries (shared/photo-caption.ts). A photo without one waits for the backfill.
  const photos = (docs as any[])
    .filter(d => d.kind === 'image' && d.storageKey && isPhotoCaption(d.summary, d.fullText) && String(d.summary ?? '').trim())
    .slice(0, 3)
    .map(d => ({ src: opts.photoUrl(d.id), caption: String(d.summary).trim().slice(0, 220) }));
  const cohort = await opts.cohortLines(cboStateId, lang).catch(() => [] as string[]);
  // What the city's own maps say about the marked site — the same lines for the
  // card, the drawer, the print and the summary, so the authored paragraphs
  // validate against what prints.
  const cityMap = cityMapFor(base.site);
  // Who lives around it (2022 Census) — Território's census lines, documents only.
  const census = censusForSite(base.site);
  return { ...base, photos, cohort, cityMap, census };
}

/**
 * The pre-note's written summary — the concept note's authoring pass (same
 * prompt, same guards: every number and source checked against the facts),
 * over the ONE solution of the pre-note, on the strongest model. Returns the
 * authored paragraphs to store as `_prenote_authored_json`, or null.
 */
export async function authorPrenote(input: PrenoteInput, lang: 'pt' | 'en'): Promise<{ stored: string; accepted: number; rejected: number } | null> {
  const sol = prenoteSolution(input);
  if (!sol) return null;
  const note = buildConceptNote(conceptInputFor(input, sol), lang);
  const out = await authorConceptNote(note, lang, PRENOTE_AUTHOR_MODEL);
  // The reason, said — "nada escrito" alone hid a reply cut off at its token cap.
  if (!out.accepted) { console.warn(`[prenote-author] nothing accepted for ${sol.id}: ${out.reason ?? 'no reason given'}`); return null; }
  const authored = out.note.sections
    .filter(sec => sec.paragraphs.some(p => p.authored))
    .map(sec => ({ section: sec.id, paragraphs: sec.paragraphs.filter(p => p.authored).map(p => ({ text: p.text, sources: p.sources })) }));
  return { stored: JSON.stringify(authored), accepted: out.accepted, rejected: out.rejected.length };
}
