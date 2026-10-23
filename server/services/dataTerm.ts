// The data term's acceptances (shared/data-term.ts, docs/data-term.md).
//
// The gate is per ORGANISATION and per VERSION: an organisation is covered
// when it has a row for the current version. Rows are append-only.

import { createHash } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { dataTermAcceptances, type DataTermAcceptance, type CohortMember } from '@shared/schema';
import { DATA_TERM, DATA_TERM_VERSIONS, DATA_TERM_NAME_MAX, dataTermPlainText, type DataTermStatus } from '@shared/data-term';
import { isReplitDeployment } from './runtimeEnv';

const hashByVersion = new Map(DATA_TERM_VERSIONS.map(v => [v.version, createHash('sha256').update(dataTermPlainText(v)).digest('hex')]));
export const dataTermHash = (version: string = DATA_TERM.version) => hashByVersion.get(version) ?? '';

// ── Test seam ────────────────────────────────────────────────────────────
// The e2e suite opens the org page in ~100 specs that are about something
// else; `CBO_DATA_TERM_GATE=off` (Playwright's webServer env) lets them through
// as if accepted. Members registered by `/__test/data-term/require` see the
// gate anyway, so the term's own spec still walks it. A deployment ignores
// the flag, whatever secrets it received.
const forcedGate = new Set<string>();
export const requireGateForTest = (memberId: string) => { forcedGate.add(memberId); };
function gateOffForTests(memberId: string): boolean {
  return process.env.CBO_DATA_TERM_GATE === 'off' && !isReplitDeployment() && !forcedGate.has(memberId);
}

const toStatus = (row: DataTermAcceptance | undefined): DataTermStatus['accepted'] =>
  row ? { name: row.name, role: row.role, at: row.acceptedAt.toISOString() } : null;

/** Current-version acceptance for each member (latest row wins). */
export async function dataTermStatusByMember(memberIds: string[]): Promise<Map<string, DataTermStatus>> {
  const out = new Map<string, DataTermStatus>();
  if (!memberIds.length) return out;
  const rows = await db.select().from(dataTermAcceptances)
    .where(and(inArray(dataTermAcceptances.memberId, memberIds), eq(dataTermAcceptances.termVersion, DATA_TERM.version)))
    .orderBy(desc(dataTermAcceptances.acceptedAt));
  const latest = new Map<string, DataTermAcceptance>();
  for (const r of rows) if (!latest.has(r.memberId)) latest.set(r.memberId, r);
  for (const id of memberIds) out.set(id, { version: DATA_TERM.version, accepted: toStatus(latest.get(id)) });
  return out;
}

/** What the org page reads. The test seam reports "accepted" without a row. */
export async function dataTermStatusForOrgPage(memberId: string): Promise<DataTermStatus> {
  const status = (await dataTermStatusByMember([memberId])).get(memberId)!;
  if (!status.accepted && gateOffForTests(memberId)) {
    return { ...status, accepted: { name: '', role: '', at: new Date(0).toISOString() } };
  }
  return status;
}

/** Roster rows gain `dataTerm` — one query for the whole board. */
export async function attachDataTerm<T extends { id: string }>(members: T[]): Promise<(T & { dataTerm: DataTermStatus })[]> {
  const byId = await dataTermStatusByMember(members.map(m => m.id)).catch(() => new Map<string, DataTermStatus>());
  return members.map(m => ({ ...m, dataTerm: byId.get(m.id) ?? { version: DATA_TERM.version, accepted: null } }));
}

export type AcceptInput = { name?: unknown; role?: unknown; version?: unknown; agreed?: unknown };
export type AcceptResult = { ok: true; status: DataTermStatus } | { ok: false; status: number; error: string };

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

export async function recordAcceptance(member: CohortMember, input: AcceptInput, meta: {
  ip: string | null; userAgent: string | null; coordinatorSession: boolean;
}): Promise<AcceptResult> {
  // The version the page showed must be the current one: a term changed while
  // the gate was open must be read again, not accepted unseen.
  if (input.version !== DATA_TERM.version) return { ok: false, status: 409, error: 'term version changed' };
  if (input.agreed !== true) return { ok: false, status: 400, error: 'checkbox not ticked' };
  const name = clean(input.name);
  const role = clean(input.role);
  if (name.length < 2 || role.length < 2) return { ok: false, status: 400, error: 'name and role required' };
  if (name.length > DATA_TERM_NAME_MAX || role.length > DATA_TERM_NAME_MAX) return { ok: false, status: 400, error: 'too long' };

  const [row] = await db.insert(dataTermAcceptances).values({
    memberId: member.id,
    cohortId: member.cohortId,
    orgId: member.orgId ?? null,
    orgName: member.orgName,
    name,
    role,
    termVersion: DATA_TERM.version,
    textHash: dataTermHash(),
    ip: meta.ip?.slice(0, 64) ?? null,
    userAgent: meta.userAgent?.slice(0, 400) ?? null,
    coordinatorSession: meta.coordinatorSession,
  }).returning();
  return { ok: true, status: { version: DATA_TERM.version, accepted: toStatus(row) } };
}

// ── Export ───────────────────────────────────────────────────────────────

const csvCell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** Porto Alegre wall-clock, which is what Vila Flores will read the file in. */
const brt = (d: Date) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
}).format(d);

/** Default: one row per organisation on the board, pending ones included.
 *  `all`: every acceptance ever recorded for the cohort, with the evidence. */
export async function acceptancesCsv(cohortId: string, members: Array<{ id: string; orgName: string }>, all: boolean): Promise<string> {
  const rows = await db.select().from(dataTermAcceptances)
    .where(eq(dataTermAcceptances.cohortId, cohortId))
    .orderBy(desc(dataTermAcceptances.acceptedAt));
  const lines: string[][] = [];
  if (all) {
    lines.push(['organizacao', 'nome', 'funcao', 'data_hora_brt', 'versao_termo', 'hash_texto', 'ip', 'navegador', 'sessao_coordenacao']);
    for (const r of rows) {
      lines.push([r.orgName, r.name, r.role, brt(r.acceptedAt), r.termVersion, r.textHash, r.ip ?? '', r.userAgent ?? '', r.coordinatorSession ? 'sim' : 'não']);
    }
  } else {
    lines.push(['organizacao', 'situacao', 'nome', 'funcao', 'data_hora_brt', 'versao_termo']);
    const current = new Map<string, DataTermAcceptance>();
    for (const r of rows) if (r.termVersion === DATA_TERM.version && !current.has(r.memberId)) current.set(r.memberId, r);
    const sorted = [...members].sort((a, b) => a.orgName.localeCompare(b.orgName, 'pt'));
    for (const m of sorted) {
      const r = current.get(m.id);
      lines.push(r
        ? [m.orgName, 'aceito', r.name, r.role, brt(r.acceptedAt), r.termVersion]
        : [m.orgName, 'pendente', '', '', '', DATA_TERM.version]);
    }
  }
  // BOM so Excel opens the accents as UTF-8.
  return '﻿' + lines.map(l => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
