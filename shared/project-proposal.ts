// ============================================================================
// THE JOINT PROPOSAL — a project's Encontro 4, one page for several organisations
// ============================================================================
// Decided 10 Nov 2026 (JVP — J1 C, J2 A, J3 A). A project (docs/projects.md) is
// a room of organisations with one shared session. Its encontro used to end on
// its own "project note", disconnected from Encontro 4 — and Encontro 4's
// proposta inicial is what the pre-portfolio and the publication read. Now the
// project runs Encontro 4 itself, on ONE joint solution, and the page it
// produces is the same `Prenote` an organisation produces, built by the same
// `buildPrenote`, plus one section: "As organizações e por que juntas".
//
// How, without forking Encontro 4:
//   · `jointSections` merges the members' live records UNDER the project
//     state's own fields into one record-shaped object. Encontro 4's checkpoint
//     reads it exactly as it reads an organisation's record, and writes go to
//     the project state (the overlay), never into a member's record — except a
//     member's own place, confirmed in the room (J2), which is THAT member's.
//   · `buildJointPrenote` is a thin wrapper over `buildPrenote`: the page in
//     the plural, the organisations named, why they are together in their words.
//
// The place (J2 A) is the members' own pins: the city-map facts are computed per
// point and the census over the union of the points, each tract once — done by
// the server (server/services/projectProposal.ts), handed in as `cityMap` and
// `census` like every pre-note's extras.
//
// Pure. Written register (docs/document-register.md).
// ============================================================================

import { buildPrenote, type Prenote, type PrenoteInput, type PrenoteLine, type PrenoteSection } from './e4-prenote';
import { testsOf } from './recorded-solutions';
import { getSolution } from './nbs-catalog';
import { readableSpeech } from './readable-speech';
import type { SolutionTest } from './w3-tests';

type Lang = 'pt' | 'en';
type Rec = Record<string, string | undefined>;

/** One member of the project, as the joint proposal reads it. */
export interface JointMember {
  memberId: string;
  orgName: string;
  /** The member's own record (its cbo_state sections), live. */
  sections: unknown;
  /** The solutions this member brought into the project (the project encontro's "cenários"). */
  scenarios: string[];
}

/** What the project encontro decided before Encontro 4 — the joint section reads it. */
export interface JointInfo {
  projectId: string;
  /** The project's name — the corridor, as the room named it. */
  title: string;
  whyTogether: string | null;
  frameLabel: string | null;
  /** What pooling saves (shared/project-plan.ts `pooled`), said once each. */
  pooled: string[];
  /** "Quem puxa o projeto" from a session that answered the old beat — printed when present. */
  lead?: string | null;
  members: JointMember[];
}

const rec = (sections: unknown, id: string): Rec =>
  Object.fromEntries(
    Object.entries((((sections as any)?.[id]?.fields) ?? {}) as Record<string, { value?: unknown }>)
      .map(([k, v]) => [k, v?.value == null ? undefined : String(v.value)]),
  );
const has = (v: string | undefined | null): v is string => typeof v === 'string' && v.trim() !== '';
const uniq = (xs: string[]) => Array.from(new Set(xs.map(x => x.trim()).filter(Boolean)));
const label = (id: string, lang: Lang) => { const s = getSolution(id); return s ? (lang === 'pt' ? s.pt.label : s.en.label) : id; };

/** Whether a member's record has a pin (the same rule as siteContext.sitePoint, without the box). */
export const memberPinned = (sections: unknown): boolean => {
  const s = rec(sections, 'intervention_site');
  return !!((s.site_lat || s._site_lat) && (s.site_lng || s._site_lng));
};

/** A member's place in words: the site's name, else the address it gave, with the bairro. */
export function memberPlace(sections: unknown): string {
  const s = rec(sections, 'intervention_site');
  const where = has(s.site_name) ? s.site_name.trim() : has(s.site_address) ? s.site_address.trim() : '';
  const bairro = (s.bairro ?? '').split(',')[0].trim();
  return [where, where.toLowerCase().includes(bairro.toLowerCase()) ? '' : bairro].filter(Boolean).join(', ');
}

/** The tests behind the scenarios the members brought — each solution once, the first member's test. */
export function jointTests(members: JointMember[]): SolutionTest[] {
  const out: SolutionTest[] = [];
  for (const m of members) {
    const t = rec(m.sections, 'intervention_type');
    const tests = testsOf({ solution_tests_json: t.solution_tests_json, chosen_solutions: t.chosen_solutions, solution_types: t.solution_types });
    for (const id of m.scenarios) {
      if (!getSolution(id) || out.some(x => x.solutionId === id)) continue;
      const own = tests.find(x => x.solutionId === id);
      // Brought into the project: it made sense to the room, whatever the first reaction was.
      out.push({ ...(own ?? { solutionId: id, testedAt: new Date(0).toISOString() } as SolutionTest), solutionId: id, reaction: 'faz-sentido' });
    }
  }
  return out;
}

/**
 * The record Encontro 4 reads for a project: the members' records merged
 * underneath, the project state's own fields on top. Values only where the
 * members AGREE (land tenure, current use) or where a union is honest (the
 * worries, the bairros); each member's partners named with the member.
 * No pin: the place is each member's, asked and confirmed per member.
 */
export function jointSections(projectSections: unknown, members: JointMember[], title: string): Record<string, { fields: Record<string, { value: string }> }> {
  const sites = members.map(m => rec(m.sections, 'intervention_site'));
  const types = members.map(m => rec(m.sections, 'intervention_type'));
  const same = (k: string) => {
    const v = sites.map(s => (s[k] ?? '').trim());
    return v.length && v.every(x => x && x === v[0]) ? v[0] : '';
  };
  const named = (k: string) => members
    .map((m, i) => (has(sites[i][k]) ? `${m.orgName}: ${sites[i][k]!.trim().replace(/[.;]+$/, '')}` : ''))
    .filter(Boolean).join('; ');
  const tests = jointTests(members);
  const ids = tests.map(t => t.solutionId);
  // The technical visit of a member, when it recommended a solution that entered the project.
  const visit = types.map(t => t._visit_json).find(v => {
    try { return has(v) && ids.includes(JSON.parse(v!).solutionId); } catch { return false; }
  });
  const base: Record<string, Rec> = {
    org_profile: { org_name: members.map(m => m.orgName).join(' e ') },
    intervention_site: {
      site_name: title,
      bairro: uniq(sites.flatMap(s => (s.bairro ?? '').split(','))).join(', '),
      site_worry: uniq(sites.flatMap(s => (s.site_worry ?? '').split(','))).join(','),
      land_tenure: same('land_tenure'),
      current_use: same('current_use'),
      prior_collaboration_detail: named('prior_collaboration_detail'),
      institution_contact_note: named('institution_contact_note'),
    },
    intervention_type: {
      // Every member is past Encontro 3 by the time a project runs Encontro 4.
      _e3_closed: 'yes',
      solution_tests_json: JSON.stringify(tests),
      chosen_solutions: ids.join(','),
      ...(visit ? { _visit_json: visit } : {}),
    },
    operations_sustain: {},
    impact_monitoring: {},
  };
  const out: Record<string, { fields: Record<string, { value: string }> }> = {};
  const own = (projectSections ?? {}) as Record<string, any>;
  for (const id of Array.from(new Set([...Object.keys(base), ...Object.keys(own)]))) {
    const fields: Record<string, { value: string }> = {};
    for (const [k, v] of Object.entries(base[id] ?? {})) if (has(v)) fields[k] = { value: v! };
    // The project's own answers win — including a cleared one ('').
    for (const [k, v] of Object.entries((own[id]?.fields ?? {}) as Record<string, { value?: unknown }>)) fields[k] = { value: v?.value == null ? '' : String(v.value) };
    out[id] = { ...(own[id] ?? {}), fields };
  }
  return out;
}

// The page speaks of several organisations. `buildPrenote` writes "a
// organização"; a joint page says it in the plural — exact phrases, longest
// first, so a verb agrees with its subject.
const PLURAL: Record<Lang, Array<[string, string]>> = {
  pt: [
    ['O que a organização quer ver mudar', 'O que as organizações querem ver mudar'],
    ['Com quem a organização já conversou', 'Com quem as organizações já conversaram'],
    ['com quem a organização já conversou', 'com quem as organizações já conversaram'],
    ['o que a organização já tem para colocar', 'o que as organizações já têm para colocar'],
    ['Falta a organização dizer', 'Falta as organizações dizerem'],
    ['Contrapartida da organização', 'Contrapartida das organizações'],
    ['a que fez sentido para a organização no Encontro 3', 'a que fez sentido no Encontro 3 para a organização que a testou'],
    ['escolhida pela organização', 'escolhida pelas organizações'],
    ['apontado pela organização', 'apontado pelas organizações'],
    ['segundo a organização', 'segundo as organizações'],
    ['estimativa da organização', 'estimativa das organizações'],
    ['a própria organização', 'as próprias organizações'],
    ['a organização, Encontro 4', 'as organizações, Encontro 4 do projeto'],
    ['(faz sentido para a organização)', '(fez sentido para a organização que a testou)'],
    ['testes da organização no Encontro 3', 'testes das organizações no Encontro 3'],
    ['No terreno da organização', 'Nos lugares das organizações'],
    // The census is over every member's point (J2), not one site.
    ['pessoas moram num raio de 300 m do lugar', 'pessoas moram a até 300 m dos lugares das organizações'],
    ['domicílios num raio de 300 m', 'domicílios a até 300 m dos lugares das organizações'],
  ],
  en: [
    ['What the organisation wants to see change', 'What the organisations want to see change'],
    ['Who the organisation has already talked to', 'Who the organisations have already talked to'],
    ['who the organisation has already talked to', 'who the organisations have already talked to'],
    ['what the organisation already has to put in', 'what the organisations already have to put in'],
    ['what the organisation wants to see change', 'what the organisations want to see change'],
    ["The organisation's contribution", "The organisations' contribution"],
    ['the one that made sense to the organisation in Encontro 3', 'the one that made sense in Encontro 3 to the organisation that tested it'],
    ['chosen by the organisation', 'chosen by the organisations'],
    ['the organisation names', 'the organisations name'],
    ['according to the organisation', 'according to the organisations'],
    ["the organisation's estimate", "the organisations' estimate"],
    ['the organisation itself', 'the organisations themselves'],
    ['the organisation, Encontro 4', "the organisations, the project's Encontro 4"],
    ["the organisation's tests in Encontro 3", "the organisations' tests in Encontro 3"],
    ['people live within 300 m of the site', "people live within 300 m of the organisations' places"],
    ['homes within 300 m', "homes within 300 m of the organisations' places"],
  ],
};
const SOURCE_ALONE: Record<Lang, [string, string]> = { pt: ['a organização', 'as organizações'], en: ['the organisation', 'the organisations'] };

const plural = (text: string, lang: Lang) => PLURAL[lang].reduce((t, [a, b]) => t.split(a).join(b), text);
const pluralSource = (src: string, lang: Lang) => (src.trim() === SOURCE_ALONE[lang][0] ? SOURCE_ALONE[lang][1] : plural(src, lang));

/** The section only a joint page has: who the organisations are and why they are together. */
export function jointSection(info: JointInfo, lang: Lang): PrenoteSection {
  const pt = lang === 'pt';
  const W = (text: string, source: string): PrenoteLine => ({ text, kind: 'written', source });
  const lines: PrenoteLine[] = [];
  for (const m of info.members) {
    const place = memberPlace(m.sections);
    const brought = m.scenarios.filter(id => getSolution(id)).map(id => label(id, lang));
    lines.push(W(
      pt
        ? `**${m.orgName}** — ${place || 'lugar ainda não marcado'}.${brought.length ? ` Traz ao projeto: ${brought.join(', ')}.` : ' Entra no projeto sem cenário próprio.'}`
        : `**${m.orgName}** — ${place || 'place not marked yet'}.${brought.length ? ` Brings to the project: ${brought.join(', ')}.` : ' Joins the project without a scenario of its own.'}`,
      pt ? 'registro da organização; encontro do projeto' : "the organisation's record; the project encontro",
    ));
  }
  if (has(info.frameLabel)) lines.push(W(pt ? `O que junta o projeto: ${info.frameLabel}.` : `What frames the project: ${info.frameLabel}.`, pt ? 'encontro do projeto' : 'the project encontro'));
  if (has(info.whyTogether)) lines.push({ text: `“${readableSpeech(info.whyTogether).trim()}”`, kind: 'quote', source: pt ? 'as organizações, encontro do projeto' : 'the organisations, the project encontro' });
  for (const p of info.pooled) lines.push(W(p, pt ? 'leitura cruzada dos registros' : 'cross-reading of the records'));
  if (has(info.lead)) lines.push(W(pt ? `Quem puxa o projeto: ${info.lead}.` : `Who leads the project: ${info.lead}.`, pt ? 'encontro do projeto' : 'the project encontro'));
  return {
    id: 'juntas',
    title: pt ? 'As organizações e por que juntas' : 'The organisations and why together',
    lines,
    missing: has(info.whyTogether) || has(info.frameLabel) ? null : (pt ? 'Falta dizer por que as organizações fazem o projeto juntas.' : 'Still missing: why the organisations do the project together.'),
  };
}

/**
 * The joint proposal: `buildPrenote` over the merged record, in the plural,
 * with "As organizações e por que juntas" first. Same sections, same budget
 * (the fichas at the joint size), same gaps.
 */
export function buildJointPrenote(input: PrenoteInput, info: JointInfo, lang: Lang = 'pt'): Prenote {
  const base = buildPrenote(input, lang);
  // The joint record carries no pin of its own — the place is each member's —
  // so the record's "no place marked" line is not true of the project when a
  // member has one. And the organisation block is the joint section's job.
  const pinned = info.members.some(m => memberPinned(m.sections));
  const noPlace = /^•?\s*(Sem lugar marcado|With no place marked)/;
  const sections = base.sections.filter(sec => sec.id !== 'organizacao').map(sec => ({
    ...sec,
    lines: sec.lines.filter(l => !(pinned && noPlace.test(l.text))).map(l => ({ ...l, text: plural(l.text, lang), source: pluralSource(l.source, lang) })),
    missing: sec.missing ? plural(sec.missing, lang) : null,
  }));
  return {
    ...base,
    sections: [jointSection(info, lang), ...sections],
    budget: base.budget.map(b => ({ ...b, label: plural(b.label, lang), value: plural(b.value, lang), source: pluralSource(b.source, lang) })),
    orgName: info.members.map(m => m.orgName).join(lang === 'pt' ? ' e ' : ' and '),
    place: info.title,
    joint: { projectId: info.projectId, title: info.title, members: info.members.map(m => ({ memberId: m.memberId, orgName: m.orgName })) },
  };
}
