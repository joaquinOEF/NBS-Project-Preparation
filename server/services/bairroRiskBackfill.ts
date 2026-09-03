// ============================================================================
// THE REPAIR, RUN AT BOOT
// ============================================================================
// See shared/bairro-risk.ts for what went wrong. This is the one implementation
// of the fix — the CLI (`npm run backfill:bairro-risk`) and the server's own
// startup both call it, because a repair that exists twice drifts, and this one
// is about drift.
//
// ⚠️ It WRITES at boot, on purpose. The alternative is a script someone has to
// remember to run against the right database, and the whole failure being
// repaired is a number nobody noticed for a month. Three properties make that
// safe rather than reckless:
//
//   · it only ever writes a record whose stored percentile disagrees with the
//     published rank, so a healthy database is untouched;
//   · it is idempotent — the second boot finds nothing, and says so in one line;
//   · it cannot fail the boot. Every path is caught; the server serves.
//
// SKIP_RISK_BACKFILL=1 turns it off for a deployment that wants to look before
// it writes.
// ============================================================================
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { cboStates } from '@shared/cbo-db-schema';
import { riskDrift, correctedRiskFields, bairroRisk, type RiskDrift } from '@shared/bairro-risk';
import type { CboSectionState } from '@shared/cbo-schema';

export interface BackfillSummary {
  scanned: number;
  clean: number;
  /** A bairro name the table cannot resolve. Never guessed at, never written. */
  unknown: number;
  repaired: Array<{ id: string; orgName: string; bairro: string; changes: RiskDrift[] }>;
  applied: boolean;
}

export async function backfillBairroRisk(opts: { apply?: boolean } = {}): Promise<BackfillSummary> {
  const apply = !!opts.apply;
  const rows = await db
    .select({ id: cboStates.id, orgName: cboStates.orgName, sections: cboStates.sections })
    .from(cboStates);

  const out: BackfillSummary = { scanned: 0, clean: 0, unknown: 0, repaired: [], applied: apply };

  for (const row of rows) {
    const sections = (row.sections ?? {}) as Record<string, CboSectionState>;
    const site = sections.intervention_site;
    if (!site?.fields) continue;
    const fields = Object.fromEntries(
      Object.entries(site.fields).map(([k, v]) => [k, String((v as any)?.value ?? '')]),
    );
    if (!fields.bairro?.trim()) continue;
    out.scanned++;

    if (!bairroRisk(fields.bairro)) { out.unknown++; continue; }
    const changes = riskDrift(fields);
    if (!changes.length) { out.clean++; continue; }

    out.repaired.push({
      id: row.id,
      orgName: row.orgName || row.id,
      bairro: changes[0].bairro,
      changes,
    });
    if (!apply) continue;

    const corrected = correctedRiskFields(fields);
    const next: Record<string, CboSectionState> = {
      ...sections,
      intervention_site: {
        ...site,
        fields: {
          ...site.fields,
          ...Object.fromEntries(
            Object.entries(corrected).map(([k, v]) => [
              k,
              // Everything else the field carried is kept; only the value moves,
              // and `source` records that this was a repair, not an answer.
              { ...((site.fields as any)[k] ?? {}), value: v, confidence: 'high', source: 'backfill' },
            ]),
          ),
        },
      },
    };
    await db.update(cboStates).set({ sections: next }).where(eq(cboStates.id, row.id));
  }
  return out;
}

/**
 * Boot hook. Repairs, logs one line, and never throws.
 *
 * Fire-and-forget: it runs after the server is already listening, so a slow or
 * unavailable database delays nothing and breaks nothing.
 */
export async function runBairroRiskBackfillAtBoot(): Promise<void> {
  if (process.env.SKIP_RISK_BACKFILL === '1') {
    console.log('[bairro-risk] pulado (SKIP_RISK_BACKFILL=1)');
    return;
  }
  try {
    const r = await backfillBairroRisk({ apply: true });
    if (!r.repaired.length) {
      console.log(`[bairro-risk] ${r.clean} registro(s) conferem com o publicado${r.unknown ? `, ${r.unknown} com bairro desconhecido` : ''}`);
      return;
    }
    // ⚠️ Named, not counted. These numbers decide which solutions an
    // organisation is offered, so a coordinator reading the boot log should see
    // WHOSE record changed and by how much.
    console.log(`[bairro-risk] ⚠️ ${r.repaired.length} registro(s) corrigidos (percentis anteriores ao fix de 2026-08-03):`);
    for (const item of r.repaired.slice(0, 20)) {
      const moves = item.changes
        .map(c => `${c.field.replace('_bairro_', '').replace('_pct', '')} ${c.stored ?? '—'}→${c.correct}`)
        .join(' · ');
      console.log(`[bairro-risk]    ${item.orgName} (${item.bairro}): ${moves}`);
    }
    if (r.repaired.length > 20) console.log(`[bairro-risk]    … e mais ${r.repaired.length - 20}`);
  } catch (err: any) {
    // The server serves. A repair that cannot run is a log line, never a boot
    // failure — the records it would have fixed are wrong either way.
    console.error('[bairro-risk] não rodou (o servidor segue normalmente):', err?.message || err);
  }
}
