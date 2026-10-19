// Why did the pre-note writer write nothing? Re-runs the authoring pass on
// stored records and prints the REASON the pass gives (timeout, provider
// failure, nothing survived the guards — and which guard).
//
//   set -a; . ./.env; set +a
//   DATABASE_URL=… npx tsx scripts/prenote-author-why.ts <cboStateId> [...]
import { loadCboFromDb } from '../server/services/cboAgent';
import { prenoteInputFor } from '../server/services/prenoteContext';
import { prenoteSolution, conceptInputFor } from '../shared/e4-prenote';
import { buildConceptNote } from '../shared/concept-note';
import { authorConceptNote } from '../server/services/conceptNoteAuthor';

async function main() {
  for (const id of process.argv.slice(2)) {
    const p = await loadCboFromDb(id);
    if (!p) { console.log(id, 'not found'); continue; }
    const input = await prenoteInputFor(id, p.state.sections, 'pt', { cohortLines: async () => [], photoUrl: x => x });
    const sol = prenoteSolution(input);
    const org = String((p.state.sections as any).org_profile?.fields?.org_name?.value ?? '?');
    if (!sol) { console.log(org, '→ no solution'); continue; }
    const note = buildConceptNote(conceptInputFor(input, sol), 'pt');
    const t0 = Date.now();
    const out = await authorConceptNote(note, 'pt', process.env.PRENOTE_AUTHOR_MODEL || 'claude-opus-5-5');
    console.log(`${org} · ${sol.id} · ${Date.now() - t0}ms → accepted ${out.accepted}, rejected ${out.rejected.length}${out.reason ? ` · reason: ${out.reason}` : ''}`);
    for (const r of out.rejected) console.log(`    ✗ ${r.why}`);
  }
  process.exit(0);
}
main();
