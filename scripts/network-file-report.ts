/**
 * The coordination's file → the enhanced synergy report, from a terminal.
 *
 * Does over HTTP what the coordinator screen does (docs/synergy-outside-documents.md):
 * upload a file about the network, show how its names were read, confirm, run
 * the report and save the printable page. Nothing is confirmed or run unless
 * asked — the default is a dry look at the proposal.
 *
 *     COUGAR_URL=https://… COUGAR_COORD_EMAIL=… COUGAR_COORD_PASSWORD=… \
 *       npx tsx scripts/network-file-report.ts <file.xlsx> [--review review.json] [--confirm] [--run] [--out report.html]
 *
 *   (no flag)   upload, print the proposed matches and what needs a look
 *   --review    a JSON `{ orgs?: [{sheetName, memberId}], names?: [{key, solutionId?, familiaId?, ignore?}] }`
 *               applied on confirm — the same body the review screen sends
 *   --confirm   confirm the table (with --review if given). Only then is it counted
 *   --run       run the synergy report with every file of the network and wait for it
 *   --out       where to save the printable report (default: sinergias.html)
 *
 * ⚠️ The file is stored on the server it is sent to, like a file added on the
 * screen. Real organisations' data goes to the production network only, and
 * never into this repository.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--review' && args[args.indexOf(a) - 1] !== '--out');
const flag = (name: string) => args.includes(name);
const value = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const BASE = (process.env.COUGAR_URL ?? '').replace(/\/$/, '');
if (!file || !BASE) { console.error('usage: COUGAR_URL=… COUGAR_COORD_EMAIL=… COUGAR_COORD_PASSWORD=… npx tsx scripts/network-file-report.ts <file> [--review review.json] [--confirm] [--run] [--out report.html]'); process.exit(1); }

async function main() {
  const login = await fetch(`${BASE}/api/coordinator/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.COUGAR_COORD_EMAIL, password: process.env.COUGAR_COORD_PASSWORD }) });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const cookie = (login.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ');
  const get = (u: string) => fetch(BASE + u, { headers: { cookie } });
  const mine = await (await get('/api/cohort/mine')).json();
  const cohort = mine.cohort; if (!cohort?.coordinatorSlug) throw new Error('this account has no network');
  const slug = cohort.coordinatorSlug;
  console.log(`network: ${cohort.name}`);

  const body = new FormData();
  body.append('file', new Blob([fs.readFileSync(file!)]), path.basename(file!));
  const up = await fetch(`${BASE}/api/cohort/${slug}/network-files`, { method: 'POST', headers: { cookie }, body });
  const upJson: any = await up.json();
  if (!up.ok) throw new Error(`upload failed: ${up.status} ${JSON.stringify(upJson)}`);
  const f = upJson.file;
  console.log(`uploaded: ${f.filename}${upJson.replaced ? ` (replaced ${upJson.replaced} older version)` : ''}`);

  if (!f.table) {
    console.log('no "organisation × has / wants" table found: the file is read as context by the narrative.');
  } else {
    const r: any = await (await get(`/api/cohort/${slug}/network-files/${f.id}/table`)).json();
    const member = (id: string | null) => r.members.find((m: any) => m.id === id)?.orgName ?? '— NOT MATCHED';
    const sol = (id: string | null) => r.solutions.find((s: any) => s.id === id)?.label;
    console.log(`\norganisations (${r.table.orgs.length} rows):`);
    for (const o of r.table.orgs) console.log(`  ${o.sheetName}  →  ${member(o.memberId)}${o.has.length || o.wants.length ? '' : '  (empty row)'}`);
    const used = new Set(r.table.orgs.flatMap((o: any) => [...o.has, ...o.wants]));
    console.log('\nnames to look at (key → proposal):');
    for (const n of r.table.names.filter((n: any) => used.has(n.key) && (n.how === 'similar' || n.how === 'outside')))
      console.log(`  [${n.how}] "${n.typed}"  key=${JSON.stringify(n.key)}  →  ${sol(n.solutionId) ?? `outside the catalogue (family: ${n.familiaId ?? 'none'})`}`);
    console.log(`\n${f.table.doubts} to look at · ratings sheet: ${f.table.hasRatings ? 'yes' : 'no'} · confirmed: ${f.table.confirmedAt ?? 'no'}`);

    if (flag('--confirm')) {
      const review = value('--review') ? JSON.parse(fs.readFileSync(value('--review')!, 'utf8')) : {};
      const put = await fetch(`${BASE}/api/cohort/${slug}/network-files/${f.id}/table`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(review) });
      if (!put.ok) throw new Error(`confirm failed: ${put.status}`);
      console.log('table confirmed.');
    } else {
      console.log('not confirmed (pass --confirm, with --review for corrections). An unconfirmed table is read as context only.');
    }
  }

  if (flag('--run')) {
    const started: any = await (await fetch(`${BASE}/api/cohort/${cohort.id}/synergies`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' })).json();
    process.stdout.write('running the report');
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, 4000)); process.stdout.write('.');
      const s: any = await (await get(`/api/cohort/${cohort.id}/synergies`)).json();
      if (s.id !== started.id || s.status === 'running') continue;
      if (s.status !== 'done') throw new Error(`\nthe report failed: ${s.error ?? s.status}`);
      const out = value('--out') ?? 'sinergias.html';
      fs.writeFileSync(out, await (await get(`/api/cohort/${cohort.id}/synergies/print`)).text());
      console.log(`\nfiles used: ${(s.report.inputs?.files ?? []).map((x: any) => `${x.name} (${x.use})`).join(', ') || 'none'}`);
      console.log(`narrative: ${s.report.narrative ? `${s.report.narrative.lines.length} programme line(s)` : `absent — ${s.report.narrativeReason}`}`);
      console.log(`saved ${out}`);
      return;
    }
    throw new Error('\nstill running after six minutes — open the coordinator screen to see it land');
  }
}
main().catch(e => { console.error(e.message ?? e); process.exit(1); });
