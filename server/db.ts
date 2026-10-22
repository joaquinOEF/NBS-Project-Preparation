import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ⚠️ Postgres may close an IDLE pooled connection at any time — a compute
// restart or scale-down sends "terminating connection due to administrator
// command" (57P01). Without a listener, node-postgres re-emits that as an
// unhandled 'error' on the pool and the whole server exits: prod went down
// this way on 22 Oct 2026. The pool already discards the dead client and opens
// a new one on the next query, so logging is all that is needed here.
pool.on('error', (err: Error & { code?: string }) => {
  console.error(`[db] idle connection dropped (${err.code ?? 'no code'}): ${err.message}`);
});
export const db = drizzle(pool, { schema });
