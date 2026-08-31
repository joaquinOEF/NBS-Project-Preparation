// ============================================================================
// DB PREFLIGHT — what this build needs that the database does not have
// ============================================================================
// ⚠️ Drizzle's `db.select().from(t)` names EVERY column in the schema, so a
// column that exists in code and not in the database does not degrade one
// feature — it 500s every route that does a full select on that table. On this
// repo that means `exclude_from_portfolio` on cohort_members takes down the
// coordinator roster AND the member-by-slug lookups behind each org's join
// link. `documents.parse_status` did the same thing before it.
//
// The blast radius is never visible in the diff, and the symptom (a blank
// board) never names the column. So: check before testing, not during.
//
//   npx tsx scripts/db-preflight.ts     # exits non-zero if anything is missing
//
// Run it on the deployment after a pull and before a session. If it reports
// anything, `npm run db:push`.
// ============================================================================
import { getTableConfig } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { db } from '../server/db';

import * as cohortSchema from '../shared/cohort-schema';
import * as cboDbSchema from '../shared/cbo-db-schema';
import * as cboEventSchema from '../shared/cbo-event-schema';
import * as orgSchema from '../shared/org-schema';
import * as coordinatorSchema from '../shared/coordinator-schema';
import * as docSchema from '../shared/document-schema';
import * as coreSchema from '../shared/core-schema';
import * as knowledgeSchema from '../shared/knowledge-schema';
import * as workspaceSchema from '../shared/workspace-schema';
import * as geospatialSchema from '../shared/geospatial-schema';
import * as rootSchema from '../shared/schema';

// Every module that declares a pg table. A schema file missing from this list
// is a table this check silently does not cover, so the count printed below is
// deliberately loud about how many it found.
const MODULES: Record<string, any> = {
  'cohort-schema': cohortSchema,
  'cbo-db-schema': cboDbSchema,
  'cbo-event-schema': cboEventSchema,
  'org-schema': orgSchema,
  'coordinator-schema': coordinatorSchema,
  'document-schema': docSchema,
  'core-schema': coreSchema,
  'knowledge-schema': knowledgeSchema,
  'workspace-schema': workspaceSchema,
  'geospatial-schema': geospatialSchema,
  'schema': rootSchema,
};

type Missing = { table: string; column: string; from: string };

async function main() {
  // Every pg table the app declares, wherever it is declared.
  const declared: Array<{ table: string; columns: string[]; from: string }> = [];
  for (const [from, mod] of Object.entries(MODULES)) {
    for (const value of Object.values(mod)) {
      let cfg: ReturnType<typeof getTableConfig>;
      try { cfg = getTableConfig(value as any); } catch { continue; }
      if (!cfg?.name || !cfg.columns?.length) continue;
      declared.push({ table: cfg.name, columns: cfg.columns.map(c => c.name), from });
    }
  }

  const live = await db.execute(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const rows = (live as any).rows ?? live;
  const byTable = new Map<string, Set<string>>();
  for (const r of rows as Array<{ table_name: string; column_name: string }>) {
    const set = byTable.get(r.table_name) ?? new Set<string>();
    set.add(r.column_name);
    byTable.set(r.table_name, set);
  }

  const missingTables: string[] = [];
  const seenTable = new Set<string>();
  const missing: Missing[] = [];
  for (const d of declared) {
    const have = byTable.get(d.table);
    if (!have) {
      if (!seenTable.has(d.table)) { seenTable.add(d.table); missingTables.push(`${d.table}  (${d.from})`); }
      continue;
    }
    for (const c of d.columns) if (!have.has(c)) missing.push({ table: d.table, column: c, from: d.from });
  }

  // Schema modules re-export each other, so the same table shows up more than
  // once. Count what is distinct, or the header reads like half the database is
  // missing when nothing is.
  const distinct = new Set(declared.map(d => d.table));
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`DB PREFLIGHT — ${distinct.size} tables declared, ${byTable.size} present in the database`);
  console.log('═'.repeat(72));

  if (!missingTables.length && !missing.length) {
    console.log('\n✅ the database has everything this build reads.\n');
    return;
  }
  if (missingTables.length) {
    console.log(`\n❌ TABLES MISSING — every query against these throws:`);
    for (const t of missingTables) console.log(`   · ${t}`);
  }
  if (missing.length) {
    console.log(`\n❌ COLUMNS MISSING — these 500 every route doing a full select on the table:`);
    const byT = new Map<string, Missing[]>();
    for (const m of missing) byT.set(m.table, [...(byT.get(m.table) ?? []), m]);
    for (const [table, ms] of byT) {
      console.log(`   · ${table}: ${Array.from(new Set(ms.map(m => m.column))).join(', ')}`);
    }
  }
  console.log(`\n→ npm run db:push, then run this again.\n`);
  process.exitCode = 1;
}
main().then(() => process.exit(process.exitCode ?? 0));
