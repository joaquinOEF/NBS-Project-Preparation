// ============================================================================
// PHOTO CAPTIONS — check them live, and backfill the photos sent before them
// ============================================================================
// A site photo's caption is what the Perfil PDF prints under it, and Vila
// Flores prints that PDF for the technical visits (24 Sept). It used to be the
// first 280 characters of the vision model's literal description — in English
// whenever the photo had no text. Since this change the same vision call ends
// with one line in the session's language about the SITE (fileExtract.ts,
// `captionRule`). A model-facing prompt is believed only after it has been read
// live, several times — so:
//
//   # 1 · read captions for a folder of photos (runs the real vision model)
//   npx tsx scripts/photo-captions.ts --dir ~/Downloads/cougar-kit-teste-e3-caldas-junior [--runs 3]
//
//   # 2 · backfill: stored photos whose summary is not a caption yet
//   npx tsx scripts/photo-captions.ts --backfill            # dry run: old → new
//   npx tsx scripts/photo-captions.ts --backfill --apply    # writes documents.summary
//
// Needs AI_INTEGRATIONS_OPENAI_* (Replit); --backfill also DATABASE_URL and the
// blob store the originals live in.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { captionImage } from '../server/services/fileExtract';

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
const IMAGE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

async function checkDir(dir: string, runs: number) {
  const files = fs.readdirSync(dir).filter(f => IMAGE.test(f));
  if (!files.length) { console.error(`no images in ${dir}`); process.exit(1); }
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    console.log(`\n■ ${f}`);
    for (let i = 0; i < runs; i++) {
      const c = await captionImage(buf, f, undefined, 'pt').catch(e => `ERRO: ${e?.message ?? e}`);
      console.log(`  ${i + 1}. ${c ?? '(sem legenda — a página usaria a descrição literal)'}`);
    }
  }
}

async function backfill(apply: boolean) {
  const { db } = await import('../server/db');
  const { documents } = await import('../shared/document-schema');
  const { cboStates } = await import('../shared/cbo-db-schema');
  const { getObject } = await import('../server/services/blobStorage');
  const { eq } = await import('drizzle-orm');
  const rows = (await db.select().from(documents)).filter((d: any) => d.kind === 'image' && d.storageKey);
  console.log(`${rows.length} stored photos${apply ? '' : ' (dry run — add --apply to write)'}`);
  let changed = 0;
  for (const d of rows as any[]) {
    const buf = await getObject(d.storageKey).catch(() => null);
    if (!buf) { console.log(`  · ${d.filename}: original not available — skipped`); continue; }
    let lang: 'pt' | 'en' = 'pt';
    if (d.cboStateId) {
      const [s] = await db.select().from(cboStates).where(eq(cboStates.id, d.cboStateId));
      if ((s as any)?.metadata?.language === 'en') lang = 'en';
    }
    const caption = await captionImage(buf, d.filename, d.mimeType ?? undefined, lang).catch(() => null);
    if (!caption) { console.log(`  · ${d.filename}: no caption returned — left as is`); continue; }
    console.log(`  · ${d.filename}\n      antes: ${(d.summary ?? '').slice(0, 110)}\n      agora: ${caption}`);
    if (apply) { await db.update(documents).set({ summary: caption }).where(eq(documents.id, d.id)); changed++; }
  }
  if (apply) console.log(`\n${changed} captions written.`);
  process.exit(0);
}

if (flag('--backfill')) backfill(flag('--apply'));
else if (opt('--dir')) checkDir(opt('--dir')!.replace(/^~/, process.env.HOME ?? '~'), Number(opt('--runs') ?? 1));
else { console.error('usage: --dir <folder> [--runs N]  |  --backfill [--apply]'); process.exit(1); }
