// ============================================================================
// PROJECT CONTEXT — everything a project's organisations shared, in one read
// ============================================================================
// A project (shared/cohort-schema.ts → cohortProjects) is a bundle of cohort
// members with one shared chat. That chat has to open on what every member
// already told us — their records, their own words, their tests, their
// documents — or the first thing it does is ask what three organisations spent
// three encontros answering.
//
// Two products, both from the same read:
//   · the BRIEF (shared/project-brief.ts) — the card a person reads, derived
//   · the CONTEXT — the markdown the model reads on every project turn: the
//     brief, then each organisation's full context bundle and document text.
//
// Names are legitimate here. The cohort layer that reaches an organisation's
// own chat is an allowlist of counts (server/services/cohortContext.ts)
// because it crosses an organisation boundary; a project's members chose to
// be in a room together, and the room is the project.
// ============================================================================

import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { cohortMembers, cohortProjects, cohorts, type CohortProject } from '@shared/cohort-schema';
import { cboStates } from '@shared/cbo-db-schema';
import { synergyFactsFrom, type SynergyMember } from '@shared/w3-synergies';
import { parseTests } from '@shared/w3-tests';
import { buildProjectBrief, briefMarkdown, type ProjectBrief, type ProjectMemberFacts } from '@shared/project-brief';
import { parseChoices, buildProjectPlan, buildProjectNote, planMarkdown, type ProjectPlan, type ProjectNote } from '@shared/project-plan';
import type { CboState } from '@shared/cbo-schema';
import { buildDossier, portfolioState } from '@shared/w3-dossier';
import { listDocumentsForScope } from './documentPersistence';
import { buildContextMarkdown, type BundleDoc } from './contextBundle';
import { getCboMessages, getCboState, loadCboFromDb } from './cboAgent';

export async function findProjectByToken(token: string): Promise<CohortProject | null> {
  const [row] = await db.select().from(cohortProjects).where(eq(cohortProjects.capabilityToken, token)).limit(1);
  return row ?? null;
}

export async function findProjectById(id: string): Promise<CohortProject | null> {
  const [row] = await db.select().from(cohortProjects).where(eq(cohortProjects.id, id)).limit(1);
  return row ?? null;
}

export async function findProjectByStateId(cboStateId: string): Promise<CohortProject | null> {
  const [row] = await db.select().from(cohortProjects).where(eq(cohortProjects.cboStateId, cboStateId)).limit(1);
  return row ?? null;
}

const asRecord = (state: CboState | null, id: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(((state?.sections as any)?.[id]?.fields ?? {}) as Record<string, { value?: unknown }>)
      .map(([k, v]) => [k, String(v?.value ?? '')]),
  );

/**
 * The project's members, each with the facts the brief and the model need.
 * Reads the live state when the server holds it, the persisted one otherwise
 * — the same rule every document route follows.
 */
export async function loadProjectMembers(project: CohortProject): Promise<ProjectMemberFacts[]> {
  const ids = (project.memberIds ?? []).filter(Boolean);
  if (!ids.length) return [];
  const rows = await db.select().from(cohortMembers).where(inArray(cohortMembers.id, ids));
  // Keep the coordinator's order.
  const byId = new Map(rows.map(r => [r.id, r]));
  const out: ProjectMemberFacts[] = [];
  for (const id of ids) {
    const m = byId.get(id);
    if (!m) continue;
    let state: CboState | null = null;
    if (m.cboStateId) {
      state = getCboState(m.cboStateId) ?? (await loadCboFromDb(m.cboStateId).catch(() => null))?.state ?? null;
    }
    const site = asRecord(state, 'intervention_site');
    const type = asRecord(state, 'intervention_type');
    const areaM2 = Number(site.site_area_m2) || 0;
    const solutions = (type.chosen_solutions ?? '').split(',').map(v => v.trim()).filter(Boolean);
    const input = {
      site,
      org: asRecord(state, 'org_profile'),
      solutions,
      ...(areaM2 ? { areaM2 } : {}),
      w3: { ...type, ...asRecord(state, 'impact_monitoring'), ...asRecord(state, 'operations_sustain') },
    };
    let docs: Array<{ filename: string; purpose: string | null; summary: string | null; fullText: string | null }> = [];
    try {
      const rowsD = await listDocumentsForScope({ orgId: m.orgId, cboStateId: m.cboStateId });
      docs = rowsD.map((d: any) => ({ filename: d.filename, purpose: d.purpose ?? null, summary: d.summary ?? null, fullText: d.fullText ?? null }));
    } catch { /* a document store that will not answer costs one input */ }

    const facts = state ? synergyFactsFrom(state.sections) : null;
    const verdict = state && (solutions.length || site._site_lat || site.site_lat)
      ? portfolioState(buildDossier(input as any, 'pt').verdicts)
      : null;
    const worries = (site.site_worry ?? '').split(',').map(w => w.trim()).filter(Boolean);
    // ⚠️ Hand-assembled, like the synergy route's own mapping — a spread would
    // carry whatever lands on SynergyFacts next. Same list, same reason.
    const synergy: SynergyMember = {
      id: m.id,
      orgName: m.orgName,
      bairro: site.bairro || m.neighborhood || null,
      siteName: facts?.siteName ?? null,
      hasSite: !!facts?.hasSite,
      tenure: facts?.tenure ?? null,
      currentUse: facts?.currentUse ?? null,
      photoNotesPt: facts?.photoNotesPt ?? [],
      worry: worries[0] ?? null,
      familias: facts?.familias ?? [],
      solutions: facts?.solutions ?? [],
      roles: facts?.roles ?? [],
      priorCollaboration: site.prior_collaboration || null,
      priorCollaborationDetail: facts?.priorCollaborationDetail ?? null,
      nbsExperience: facts?.nbsExperience ?? null,
      fundingScale: facts?.fundingScale ?? null,
      biggestBudget: facts?.biggestBudget ?? null,
      maturityScore: state?.totalMaturityScore ?? 0,
      verdict,
      studyNeeds: facts?.studyNeeds ?? [],
      bodies: facts?.bodies ?? [],
      docCount: docs.length,
      ownWords: facts?.ownWords ?? { story: null, whyHere: null, baseline: null, dug: [], detail: null },
      areaM2: facts?.areaM2 ?? null,
      correctionsPt: facts?.correctionsPt ?? null,
      docs,
      approvalInstruments: facts?.approvalInstruments ?? [],
      fundingOpen: facts?.fundingOpen ?? [],
      fundingBlocked: facts?.fundingBlocked ?? [],
      started: !!state && Object.values(state.sections).some(s => Object.keys(s.fields ?? {}).length > 0),
      tested: facts?.tested,
      technicalNote: facts?.technicalNote ?? null,
    };
    out.push({
      memberId: m.id,
      orgName: m.orgName,
      bairro: site.bairro || m.neighborhood || null,
      input: input as any,
      tests: parseTests(type.solution_tests_json),
      technicalNote: type.technical_note || null,
      docNames: docs.map(d => d.filename),
      synergy,
    });
  }
  return out;
}

export async function projectBrief(project: CohortProject, lang: 'pt' | 'en' = 'pt'): Promise<ProjectBrief> {
  const members = await loadProjectMembers(project);
  return buildProjectBrief({ id: project.id, title: project.title }, members, lang);
}

/** The brief and the members it was built from — one read for the checkpoint's beats. */
export async function projectFacts(project: CohortProject, lang: 'pt' | 'en' = 'pt'): Promise<{ brief: ProjectBrief; members: ProjectMemberFacts[] }> {
  const members = await loadProjectMembers(project);
  return { brief: buildProjectBrief({ id: project.id, title: project.title }, members, lang), members };
}

/** The choices the project encontro wrote on the project's own state. */
async function projectChoices(project: CohortProject) {
  const st = getCboState(project.cboStateId) ?? (await loadCboFromDb(project.cboStateId).catch(() => null))?.state ?? null;
  return parseChoices(asRecord(st, 'intervention_type'));
}

/** The plan (what is shared, the money) from the live records and the encontro's choices. */
export async function projectPlan(project: CohortProject, lang: 'pt' | 'en' = 'pt'): Promise<ProjectPlan> {
  const { brief, members } = await projectFacts(project, lang);
  return buildProjectPlan(brief, members, await projectChoices(project), lang);
}

/** The multi-organisation note, rebuilt from the live records on every read. */
export async function projectNote(project: CohortProject, lang: 'pt' | 'en' = 'pt'): Promise<ProjectNote> {
  return buildProjectNote(await projectPlan(project, lang), lang);
}

/**
 * The model's CURRENT STATE for a project turn: the brief, then every
 * organisation's full bundle (the same `buildContextMarkdown` the coordinator
 * exports) and the text of every document. Capped per document so one
 * 40-page proposal cannot crowd the others out.
 */
export async function buildProjectContext(project: CohortProject, lang: 'pt' | 'en' = 'pt'): Promise<string> {
  const members = await loadProjectMembers(project);
  const brief = buildProjectBrief({ id: project.id, title: project.title }, members, lang);
  const L: string[] = [briefMarkdown(brief, lang), ''];
  // What the project encontro decided, when it has started — so the model
  // never re-asks a choice the room already made.
  const choices = await projectChoices(project);
  if (choices.whyTogether || choices.frame || choices.scenarios.length || choices.lead || choices.fundingMode) {
    L.push(planMarkdown(buildProjectPlan(brief, members, choices, lang), lang), '');
  }
  const generatedAt = new Date().toISOString().slice(0, 10);
  for (const m of members) {
    const row = (await db.select().from(cohortMembers).where(eq(cohortMembers.id, m.memberId)).limit(1))[0];
    const stateId = row?.cboStateId ?? null;
    const state = stateId ? (getCboState(stateId) ?? (await loadCboFromDb(stateId).catch(() => null))?.state ?? null) : null;
    const docs: BundleDoc[] = m.synergy.docs.map(d => ({
      filename: d.filename,
      kind: 'file',
      droppedInPhase: null,
      summary: d.summary ?? '',
      fullText: (d.fullText ?? '').slice(0, 12_000),
    })) as any;
    L.push(`---`, '', buildContextMarkdown({
      orgName: m.orgName,
      bairro: m.bairro ?? undefined,
      state,
      messages: stateId ? getCboMessages(stateId) : [],
      docs,
      generatedAt,
    }), '');
  }
  return L.join('\n');
}

/** The cohort a project belongs to, for the language override and the roster. */
export async function projectCohort(project: CohortProject) {
  const [row] = await db.select().from(cohorts).where(eq(cohorts.id, project.cohortId)).limit(1);
  return row ?? null;
}
