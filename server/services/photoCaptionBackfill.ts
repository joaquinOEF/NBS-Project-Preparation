// ============================================================================
// PHOTOS SENT BEFORE CAPTIONS EXISTED — captioned on boot, in the background
// ============================================================================
// #569 captioned photos from the moment it shipped; everything already stored
// kept its English, literal summary, and the Perfil Vila Flores prints for the
// technical visits showed it ("No visible text. Description: A street scene…",
// JVP, 25 Sept). A script someone has to remember to run against the right
// database is how that stays broken — so, like the bairro-risk repair, this
// runs on every boot, touches only photos whose summary is not a caption yet
// (`isPhotoCaption`), and says what it did in one line. Never blocks, never
// throws. SKIP_PHOTO_CAPTION_BACKFILL=1 turns it off.
// ============================================================================
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { documents } from '@shared/document-schema';
import { cboStates } from '@shared/cbo-db-schema';
import { isPhotoCaption } from '@shared/photo-caption';
import { captionImage } from './fileExtract';
import { getObject, blobEnabled } from './blobStorage';

export interface CaptionBackfillSummary {
  photos: number;
  alreadyCaptioned: number;
  captioned: Array<{ id: string; filename: string; before: string; after: string }>;
  failed: number;
  applied: boolean;
}

export async function backfillPhotoCaptions(opts: { apply?: boolean; concurrency?: number } = {}): Promise<CaptionBackfillSummary> {
  const apply = !!opts.apply;
  const rows = (await db.select().from(documents)).filter(d => d.kind === 'image' && d.storageKey);
  const out: CaptionBackfillSummary = { photos: rows.length, alreadyCaptioned: 0, captioned: [], failed: 0, applied: apply };
  const todo = rows.filter(d => {
    if (isPhotoCaption(d.summary, d.fullText)) { out.alreadyCaptioned++; return false; }
    return true;
  });
  const langOf = new Map<string, 'pt' | 'en'>();
  const lang = async (cboStateId: string | null): Promise<'pt' | 'en'> => {
    if (!cboStateId) return 'pt';
    if (!langOf.has(cboStateId)) {
      const [s] = await db.select({ metadata: cboStates.metadata }).from(cboStates).where(eq(cboStates.id, cboStateId));
      langOf.set(cboStateId, (s?.metadata as any)?.language === 'en' ? 'en' : 'pt');
    }
    return langOf.get(cboStateId)!;
  };
  const one = async (d: typeof rows[number]) => {
    try {
      const buf = await getObject(d.storageKey!);
      if (!buf) { out.failed++; return; }
      const caption = await captionImage(buf, d.filename, d.mimeType ?? undefined, await lang(d.cboStateId));
      if (!caption) { out.failed++; return; }
      out.captioned.push({ id: d.id, filename: d.filename, before: (d.summary ?? '').slice(0, 80), after: caption });
      if (apply) await db.update(documents).set({ summary: caption }).where(eq(documents.id, d.id));
    } catch { out.failed++; }
  };
  const n = Math.max(1, opts.concurrency ?? 2);
  for (let i = 0; i < todo.length; i += n) await Promise.all(todo.slice(i, i + n).map(one));
  return out;
}

export async function runPhotoCaptionBackfillAtBoot(): Promise<void> {
  if (process.env.SKIP_PHOTO_CAPTION_BACKFILL === '1') { console.log('[photo-captions] pulado (SKIP_PHOTO_CAPTION_BACKFILL=1)'); return; }
  // Test and local servers: a fake model, or no object store to read originals from.
  if (process.env.CBO_FAKE_MODEL === '1' || !blobEnabled()) { console.log('[photo-captions] pulado (sem armazenamento de originais ou modelo de teste)'); return; }
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) { console.log('[photo-captions] sem chave de visão — legendas antigas ficam ocultas no Perfil'); return; }
  try {
    const r = await backfillPhotoCaptions({ apply: true });
    console.log(`[photo-captions] ${r.photos} foto(s): ${r.alreadyCaptioned} já com legenda, ${r.captioned.length} legendada(s) agora${r.failed ? `, ${r.failed} sem original ou sem resposta` : ''}`);
    for (const c of r.captioned.slice(0, 10)) console.log(`[photo-captions]    ${c.filename}: ${c.after}`);
  } catch (err: any) {
    console.error('[photo-captions] não rodou (o servidor segue normalmente):', err?.message || err);
  }
}
