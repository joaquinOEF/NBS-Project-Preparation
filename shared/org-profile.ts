// ============================================================================
// THE ORGANISATION'S PROFILE — everything it has shared so far, for a person
// ============================================================================
// Vila Flores, September 2026: "ter o pdf das etapas 1 e 2 impresso para que
// cada organização já possa visualizar o que colocou de informação na
// plataforma" — printed for the 30 Sept convening and carried on the technical
// visits of 30 Sept–1 Oct as the preliminary diagnosis of each territory.
//
// It is NOT the context bundle (that is written for a model) and NOT the
// Resumo do Projeto (that is an argument built from Encontro 3). It is the
// record, laid out for the organisation that gave it and the people it will
// show it to. Stage-aware: after Encontro 1 it is who they are; after
// Encontro 2, the place joins; after Encontro 3, what they tested. A section
// with nothing in it is absent, never an empty heading.
//
// Two rules make it trustworthy:
//   · labels and option values come from the bilingual field catalog
//     (shared/cbo-field-catalog.ts), never a raw id;
//   · NOTHING IS SILENTLY MISSING — every public answer the design does not
//     place lands in `alsoRecorded`, so a field added to an encontro next month
//     prints here without anybody remembering it (the failure
//     shared/field-destiny.ts was written for).
//
// Pure. The route assembles the input (server/services/orgProfilePrint.ts
// renders it). Written register on the page: docs/document-register.md.
// ============================================================================

import { CBO_SECTIONS, isInternalCboField, type CboState } from './cbo-schema';
import { cboFieldLabel, cboDisplayValue } from './cbo-field-catalog';
import { parseTests, seedTestsFromChosen } from './w3-tests';
import { buildComparison, verdictText } from './w3-comparison';
import type { W3Input } from './w3-dossier';

type Lang = 'pt' | 'en';

export interface ProfileFact { field: string; label: string; value: string }
export interface ProfilePhoto { docId: string; filename: string; caption: string | null }
export interface ProfileScenario { solutionId: string; label: string; familia: string; reaction: string | null; verdict: string; ready: boolean; unblockedBy: string; cost: string | null }

export interface OrgProfile {
  orgName: string;
  bairro: string | null;
  contact: string | null;
  lang: Lang;
  /** Which encontros have put something on this page. */
  stages: { e1: boolean; e2: boolean; e3: boolean };
  /** The lead paragraph: what the organisation is, in its own summary. */
  mission: string | null;
  activities: string | null;
  /** The facts grid — short values only. */
  facts: ProfileFact[];
  /** Longer answers about the organisation, each under its label. */
  about: ProfileFact[];
  place: null | {
    name: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    facts: ProfileFact[];
    /** Their own words about the place. */
    story: string | null;
    longer: ProfileFact[];
    /** Bairro-wide MEANS, 0–100 — not measured at this place, and labelled so. */
    risks: null | { flood: number; heat: number; landslide: number };
    areaM2: number | null;
  };
  photos: ProfilePhoto[];
  documents: string[];
  tested: ProfileScenario[];
  /** The coordination's technical reading (JVP, 21 Sept: it prints on the org's copy). */
  technicalNote: string | null;
  /** Encontro 3's closing beat — the visit and the room, in their words, one entry per line. */
  closingNotes: string[];
  /** Every public answer the layout above did not place, grouped by section. */
  alsoRecorded: Array<{ sectionId: string; title: string; rows: ProfileFact[] }>;
}

export interface OrgProfileInput {
  orgName: string;
  neighborhood?: string | null;
  state: CboState | null;
  docs?: Array<{ id: string; filename: string; kind?: string | null; summary?: string | null; hasOriginal?: boolean }>;
  lang?: Lang;
}

// What the design places, and where. Anything else goes to `alsoRecorded`.
const FACT_FIELDS = ['year_founded', 'legal_form', 'has_cnpj', 'team_size', 'paid_vs_volunteer', 'nbs_experience', 'funding_history', 'funded_project_count', 'biggest_project_budget', 'prior_project_scale'];
const ABOUT_FIELDS = ['groups_served', 'nbs_experience_detail', 'prior_projects', 'community_engagement_methods'];
const PLACE_FACTS = ['current_use', 'land_tenure', 'site_worry', 'nbs_interest', 'role_preference', 'prior_collaboration'];
const PLACE_LONGER = ['prior_collaboration_detail', 'site_access', 'site_history'];
/** OUR readings of the record, stored as fields. They are not something the organisation said, and do not print. */
const OUR_READINGS = new Set(['site_knowledge_depth']);
/** Yes/no answers stored as bare words. */
const YES_NO: Record<string, { pt: string; en: string }> = {
  sim: { pt: 'Sim', en: 'Yes' }, yes: { pt: 'Sim', en: 'Yes' }, nao: { pt: 'Não', en: 'No' }, 'não': { pt: 'Não', en: 'No' }, no: { pt: 'Não', en: 'No' },
};
/** The cost note's first sentence — the band. The caveats live on the comparison, which is the document about cost. */
const firstSentence = (s: string) => { const m = s.match(/^.*?[.!?](?=\s|$)/); return (m ? m[0] : s).trim(); };
const HEADER_FIELDS = ['org_name', 'contact_name', 'contact_role', 'mission_summary', 'mission', 'main_activities', 'bairro', 'site_name', 'site_address', 'site_story', 'site_area_m2'];
/** Contact details the organisation gave the coordination — not for a page that gets passed around. */
const PRIVATE_CONTACT = new Set(['contact_email', 'contact_phone', 'contact_whatsapp', 'whatsapp', 'phone', 'email']);
/** Encontro 3's own documents carry these; the profile lists what was TESTED and leaves the argument to them. */
const E3_CARRIED = new Set(['chosen_solutions', 'solution_tests_json', 'technical_note', 'closing_observations', 'concept_note_authored_json', 'dig_questions_json', 'dig_answers_json', 'dig_pairing_json', 'advisor_json']);

const SECTION_TITLE: Record<string, { pt: string; en: string }> = {
  org_profile: { pt: 'Sobre a organização', en: 'About the organisation' },
  intervention_site: { pt: 'Sobre o lugar', en: 'About the place' },
  intervention_type: { pt: 'Sobre a solução', en: 'About the solution' },
  impact_monitoring: { pt: 'Impacto e acompanhamento', en: 'Impact and monitoring' },
  operations_sustain: { pt: 'Operação e manutenção', en: 'Operation and upkeep' },
  needs_assessment: { pt: 'O que a organização precisa', en: 'What the organisation needs' },
  results_evidence: { pt: 'Resultados e evidências', en: 'Results and evidence' },
};

export function buildOrgProfile(input: OrgProfileInput): OrgProfile {
  const lang: Lang = input.lang ?? 'pt';
  const sections = (input.state?.sections ?? {}) as Record<string, { fields?: Record<string, { value?: unknown }> }>;
  const raw = (sec: string, k: string) => String(sections[sec]?.fields?.[k]?.value ?? '').trim();
  const shown = (sec: string, k: string) => {
    const v = raw(sec, k);
    if (!v) return '';
    const out = cboDisplayValue(sec, k, v, lang).trim();
    // The catalog's own wording wins ("Sim, temos CNPJ"); a bare stored word it does not know gets a plain yes/no.
    return out === v && YES_NO[v.toLowerCase()] ? YES_NO[v.toLowerCase()][lang] : out;
  };
  const placed = new Set<string>();
  const fact = (sec: string, k: string): ProfileFact | null => {
    const value = shown(sec, k);
    if (!value) return null;
    placed.add(`${sec}.${k}`);
    return { field: k, label: cboFieldLabel(k, lang), value };
  };
  const facts = (sec: string, keys: string[]) => keys.map(k => fact(sec, k)).filter((f): f is ProfileFact => !!f);
  for (const k of HEADER_FIELDS) { placed.add(`org_profile.${k}`); placed.add(`intervention_site.${k}`); }

  const ORG = 'org_profile', SITE = 'intervention_site', TYPE = 'intervention_type';
  const contactName = raw(ORG, 'contact_name');
  const contactRole = shown(ORG, 'contact_role');
  const mission = raw(ORG, 'mission_summary') || raw(ORG, 'mission') || null;

  // ── the place ────────────────────────────────────────────────────────────
  const lat = Number(raw(SITE, '_site_lat') || raw(SITE, 'site_lat'));
  const lng = Number(raw(SITE, '_site_lng') || raw(SITE, 'site_lng'));
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
  const siteName = raw(SITE, 'site_name') || null;
  const bairro = raw(SITE, 'bairro') || (input.neighborhood ?? '').trim() || null;
  const pct = (k: string) => { const n = parseInt(raw(SITE, k), 10); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; };
  const flood = pct('_bairro_flood_pct'), heat = pct('_bairro_heat_pct'), landslide = pct('_bairro_landslide_pct');
  const placeFacts = facts(SITE, PLACE_FACTS);
  const story = raw(SITE, 'site_story') || null;
  const hasPlace = !!(siteName || hasCoords || story || placeFacts.length);
  const areaM2 = Number(raw(SITE, 'site_area_m2')) || null;

  // ── what they tested ─────────────────────────────────────────────────────
  const siteRec = Object.fromEntries(Object.entries(sections[SITE]?.fields ?? {}).map(([k, v]) => [k, String(v?.value ?? '')]));
  const typeRec = Object.fromEntries(Object.entries(sections[TYPE]?.fields ?? {}).map(([k, v]) => [k, String(v?.value ?? '')]));
  const chosen = (typeRec.chosen_solutions ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const tests = seedTestsFromChosen(parseTests(typeRec.solution_tests_json), chosen);
  const technicalNote = (typeRec.technical_note ?? '').trim() || null;
  let tested: ProfileScenario[] = [];
  if (tests.length) {
    const w3Input: W3Input = {
      site: siteRec,
      org: Object.fromEntries(Object.entries(sections[ORG]?.fields ?? {}).map(([k, v]) => [k, String(v?.value ?? '')])),
      solutions: chosen,
      ...(areaM2 ? { areaM2 } : {}),
      w3: typeRec,
    };
    tested = buildComparison(w3Input, tests, lang, technicalNote).columns.map(c => ({
      solutionId: c.solutionId,
      label: c.label,
      familia: c.familia,
      reaction: c.reaction?.text ?? null,
      verdict: verdictText(c.card.verdict.state, lang),
      ready: c.card.verdict.state === 'ready',
      unblockedBy: c.card.verdict.unblockedBy.replace(/\.$/, ''),
      cost: c.card.cost?.note ? firstSentence(c.card.cost.note) : null,
    }));
  }

  const orgFacts = facts(ORG, FACT_FIELDS);
  const about = facts(ORG, ABOUT_FIELDS);
  const longer = facts(SITE, PLACE_LONGER);

  // ── nothing silently missing ─────────────────────────────────────────────
  const alsoRecorded: OrgProfile['alsoRecorded'] = [];
  for (const sec of CBO_SECTIONS) {
    const rows: ProfileFact[] = [];
    for (const k of Object.keys(sections[sec.id]?.fields ?? {})) {
      if (isInternalCboField(k) || PRIVATE_CONTACT.has(k) || OUR_READINGS.has(k) || placed.has(`${sec.id}.${k}`)) continue;
      if (sec.id === TYPE && E3_CARRIED.has(k)) continue;
      if (/_json$/.test(k)) continue;
      const value = shown(sec.id, k);
      if (!value) continue;
      rows.push({ field: k, label: cboFieldLabel(k, lang), value });
    }
    if (rows.length) alsoRecorded.push({ sectionId: sec.id, title: SECTION_TITLE[sec.id]?.[lang] ?? sec.title, rows });
  }

  const docs = input.docs ?? [];
  const photos = docs.filter(d => d.kind === 'image' && d.hasOriginal !== false).slice(0, 4)
    .map(d => ({ docId: d.id, filename: d.filename, caption: (d.summary ?? '').trim().slice(0, 220) || null }));

  const e1 = !!(mission || orgFacts.length || about.length || raw(ORG, 'main_activities'));
  return {
    orgName: input.orgName || raw(ORG, 'org_name') || (lang === 'pt' ? 'Organização' : 'Organisation'),
    bairro,
    contact: contactName ? `${contactName}${contactRole ? ` — ${contactRole}` : ''}` : null,
    lang,
    stages: { e1, e2: hasPlace, e3: tested.length > 0 },
    mission,
    activities: raw(ORG, 'main_activities') || null,
    facts: orgFacts,
    about,
    place: hasPlace ? {
      name: siteName,
      address: raw(SITE, 'site_address') || null,
      lat: hasCoords ? lat : null,
      lng: hasCoords ? lng : null,
      facts: placeFacts,
      story,
      longer,
      risks: flood != null || heat != null || landslide != null ? { flood: flood ?? 0, heat: heat ?? 0, landslide: landslide ?? 0 } : null,
      areaM2,
    } : null,
    photos,
    documents: docs.filter(d => d.kind !== 'image').map(d => d.filename),
    tested,
    technicalNote,
    closingNotes: (typeRec.closing_observations ?? '').split('\n').map(l => l.trim()).filter(Boolean),
    alsoRecorded,
  };
}

/**
 * A static map without a map library: the 3×3 block of web-mercator tiles
 * around the point, and where the pin sits inside it (0–1 on each axis). An
 * <img> grid prints the same in every browser; a JS map may not have finished
 * drawing when the print dialog opens.
 */
export function staticMapTiles(lat: number, lng: number, zoom = 17): { tiles: Array<{ x: number; y: number; z: number; col: number; row: number }>; pin: { left: number; top: number } } {
  const n = 2 ** zoom;
  const fx = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const tiles = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) tiles.push({ x: tx - 1 + col, y: ty - 1 + row, z: zoom, col, row });
  return { tiles, pin: { left: (fx - (tx - 1)) / 3, top: (fy - (ty - 1)) / 3 } };
}
