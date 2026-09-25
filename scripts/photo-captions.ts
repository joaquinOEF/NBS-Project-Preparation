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
//   # 2 · backfill (the server also runs this on every boot): stored photos whose summary is not a caption yet
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
  // Same service the server runs on every boot (server/services/photoCaptionBackfill.ts).
  const { backfillPhotoCaptions } = await import('../server/services/photoCaptionBackfill');
  const r = await backfillPhotoCaptions({ apply });
  console.log(`${r.photos} stored photos · ${r.alreadyCaptioned} already captioned · ${r.captioned.length} ${apply ? 'captioned now' : 'would be captioned (dry run — add --apply)'} · ${r.failed} failed`);
  for (const c of r.captioned) console.log(`  · ${c.filename}\n      antes: ${c.before}\n      agora: ${c.after}`);
  process.exit(0);
}

if (flag('--backfill')) backfill(flag('--apply'));
else if (opt('--dir')) checkDir(opt('--dir')!.replace(/^~/, process.env.HOME ?? '~'), Number(opt('--runs') ?? 1));
else { console.error('usage: --dir <folder> [--runs N]  |  --backfill [--apply]'); process.exit(1); }
