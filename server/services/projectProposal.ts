// ============================================================================
// A PROJECT'S JOINT PROPOSAL — server half (shared/project-proposal.ts is the page)
// ============================================================================
// Reads every member's LIVE record and the project state, and hands Encontro 4
// what it needs to run inside the project's shared session:
//   · the joint record it reads (`jointSections`, members under, project on top);
//   · the place per member (J2): city-map facts per point, the census over the
//     union of the points (each tract once), the address geocode for a member
//     with no pin, and the write of a confirmed pin to THAT member's record;
//   · the page itself (`buildJointPrenote`).
// The same object serves the chat, the printed copy and the pre-portfolio, so
// the three read the same facts.
// ============================================================================

import { inArray } from 'drizzle-orm';
import { db } from '../db';
import { cohortMembers, type CohortProject } from '@shared/cohort-schema';
import type { CboState } from '@shared/cbo-schema';
import { prenoteInputFromSections, type Prenote, type PrenoteInput } from '@shared/e4-prenote';
import { parseChoices, buildProjectPlan, frameOptions } from '@shared/project-plan';
import { buildJointPrenote, jointSections, memberPinned, memberPlace, type JointInfo, type JointMember } from '@shared/project-proposal';
import type { E4Suggestion } from '@shared/e4-suggestions';
import type { E4ProjectHooks } from './cboE4Checkpoint';
import { cityMapFor, sitePoint } from './siteContext';
import { censusAroundMany } from './censusContext';
import { healSite } from './siteHealing';
import { suggestionsFor } from './e4Suggestions';
import { projectFacts } from './projectContext';
import { getCboState, setCboState, addCboMessage, getCboMessages, loadCboFromDb, writeSectionFields, flushNow } from './cboAgent';

type Lang = 'pt' | 'en';

interface LiveMember { memberId: string; orgName: string; stateId: string | null; state: CboState | null }

const siteOf = (state: CboState | null): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(((state?.sections as any)?.intervention_site?.fields ?? {}) as Record<string, { value?: unknown }>)
    .map(([k, v]) => [k, v?.value == null ? undefined : String(v.value)]));

/**
 * A member's state, in memory WITH its transcript — a write to a state the
 * server holds without its messages would show the organisation an empty chat
 * on its next open (GET /api/cbo/:id reads memory first).
 */
async function liveState(id: string): Promise<CboState | null> {
  const live = getCboState(id);
  if (live) return live;
  const persisted = await loadCboFromDb(id).catch(() => null);
  if (!persisted) return null;
  if (!getCboState(id)) {
    setCboState(id, persisted.state);
    if (!getCboMessages(id).length) for (const m of persisted.messages) addCboMessage(id, m);
  }
  return getCboState(id) ?? persisted.state;
}

async function loadMembers(project: CohortProject): Promise<LiveMember[]> {
  const ids = (project.memberIds ?? []).filter(Boolean);
  if (!ids.length) return [];
  const rows = await db.select().from(cohortMembers).where(inArray(cohortMembers.id, ids));
  const byId = new Map(rows.map(r => [r.id, r]));
  const out: LiveMember[] = [];
  for (const id of ids) {
    const m = byId.get(id);
    if (!m) continue;
    const state = m.cboStateId ? await liveState(m.cboStateId) : null;
    const orgName = String((state?.sections as any)?.org_profile?.fields?.org_name?.value ?? '').trim() || m.orgName;
    out.push({ memberId: m.id, orgName, stateId: m.cboStateId ?? null, state });
  }
  return out;
}

export interface JointContext {
  info: JointInfo;
  /** The joint record over the project state as it stands NOW. */
  sections(projectState: CboState): ReturnType<typeof jointSections>;
  /** City-map facts per point, census over all points — from the members' live pins. */
  extras(): Partial<PrenoteInput>;
  input(projectState: CboState): PrenoteInput;
  prenote(projectState: CboState, lang: Lang): Prenote;
  /** Encontro 4's hooks for this project (cboE4Checkpoint E4ProjectHooks). */
  hooks(lang: Lang): E4ProjectHooks;
}

/** Everything the joint proposal reads, for one project. */
export async function loadJointContext(project: CohortProject, projectState: CboState, lang: Lang = 'pt'): Promise<JointContext> {
  const live = await loadMembers(project);
  const fields = Object.fromEntries(Object.entries(((projectState.sections as any)?.intervention_type?.fields ?? {}) as Record<string, { value?: unknown }>)
    .map(([k, v]) => [k, String(v?.value ?? '')])) as Record<string, string>;
  const choices = parseChoices(fields);
  // What pooling saves and the frame's label — the project encontro's own reading.
  let pooled: string[] = [];
  let frameLabel: string | null = choices.frame;
  try {
    const { brief, members } = await projectFacts(project, lang);
    pooled = buildProjectPlan(brief, members, choices, lang).pooled;
    if (choices.frame) frameLabel = frameOptions(brief, lang).find(f => f.key === choices.frame)?.label ?? choices.frame;
  } catch (err) {
    console.warn(`[joint-proposal] project facts unavailable for ${project.id}:`, (err as Error).message);
  }
  const scen = new Map(choices.scenarios.map(s => [s.memberId, s.solutionIds]));
  const members: JointMember[] = live.map(m => ({
    memberId: m.memberId,
    orgName: m.orgName,
    // A getter: the record is live, so a pin confirmed this turn is read at once.
    get sections() { return m.state?.sections ?? {}; },
    scenarios: scen.get(m.memberId) ?? [],
  }));
  const info: JointInfo = { projectId: project.id, title: project.title, whyTogether: choices.whyTogether, frameLabel, pooled, lead: choices.lead, members };

  const extras = (): Partial<PrenoteInput> => {
    const cityMap: Array<{ text: string; source: string }> = [];
    const points: Array<{ lat: number; lng: number }> = [];
    for (const m of live) {
      const site = healSite(siteOf(m.state));
      const p = sitePoint(site);
      if (!p) continue;
      points.push(p);
      // The city's maps, per point, said of whose place (J2) — never one point for both.
      const where = memberPlace(m.state?.sections) || m.orgName;
      for (const f of cityMapFor(site)) cityMap.push({ text: `**${where}** (${m.orgName}): ${f.text}`, source: f.source });
    }
    return { cityMap, census: points.length ? censusAroundMany(points, { withNearby: true }) : null };
  };
  const input = (ps: CboState): PrenoteInput => ({ ...prenoteInputFromSections(jointSections(ps.sections, members, project.title)), ...extras() });

  return {
    info,
    sections: ps => jointSections(ps.sections, members, project.title),
    extras,
    input,
    prenote: (ps, l) => buildJointPrenote(input(ps), info, l),
    hooks: (l): E4ProjectHooks => ({
      members: () => live.map(m => ({ memberId: m.memberId, orgName: m.orgName, pinned: memberPinned(m.state?.sections), bairro: siteOf(m.state).bairro })),
      guesses: async () => {
        const out: Record<string, E4Suggestion> = {};
        for (const m of live) {
          if (!m.stateId || !m.state || memberPinned(m.state.sections)) continue;
          const all = await suggestionsFor(m.state, getCboMessages(m.stateId).map(x => ({ role: x.role, content: x.content }))).catch(() => [] as E4Suggestion[]);
          const place = all.find(x => x.key === 'lugar');
          if (place) out[m.memberId] = place;
        }
        return out;
      },
      writeMemberSite: (memberId, f) => {
        const m = live.find(x => x.memberId === memberId);
        if (!m?.stateId || !m.state) return;
        writeSectionFields(m.stateId, m.state, 'intervention_site', f, () => {}, 'user');
        void flushNow(m.stateId);
      },
      extras,
      census: () => (extras().census ?? null),
      prenote: (inp, lang2) => buildJointPrenote(inp, info, lang2),
    }),
  };
}

/** Whether a project state has closed its joint Encontro 4. */
export const jointClosed = (projectState: CboState | null | undefined): boolean =>
  String((projectState?.sections as any)?.intervention_type?.fields?._e4_closed?.value ?? '') === 'yes';

/** The joint proposal of a project, as it stands — for the print and the pre-portfolio. */
export async function jointPrenoteFor(project: CohortProject, lang: Lang = 'pt'): Promise<{ prenote: Prenote; context: JointContext; projectState: CboState } | null> {
  const projectState = await liveState(project.cboStateId);
  if (!projectState) return null;
  const context = await loadJointContext(project, projectState, lang);
  return { prenote: context.prenote(projectState, lang), context, projectState };
}

/** The member ids of a project, in its order, that are on a board (for J3). */
export async function projectMemberIds(project: CohortProject): Promise<string[]> {
  const ids = (project.memberIds ?? []).filter(Boolean);
  if (!ids.length) return [];
  const rows = await db.select({ id: cohortMembers.id }).from(cohortMembers).where(inArray(cohortMembers.id, ids));
  const ok = new Set(rows.map(r => r.id));
  return ids.filter(id => ok.has(id));
}
