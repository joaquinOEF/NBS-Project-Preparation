// ============================================================================
// QUESTIONNAIRE MANIFESTS — the enforceable contract layer per workshop.
// ============================================================================
//
// The encontro skills (knowledge/_skills/encontro-N.md) are prose the model
// follows; shared/cbo-field-catalog.ts holds the enum options code can
// canonicalize against. What neither expressed was questionnaire STRUCTURE:
// which option lists depend on an earlier answer, and which fields must be
// captured before an encontro may close. Both used to be prompt-level rules —
// and prompt-level rules leak (field report 2026-07: a CNPJ-less org was
// offered "ONG"; editing a late answer let the model close E1 without ever
// asking the project-status triage).
//
// A manifest declares that structure once, and three existing chokepoints in
// cboAgent.ts enforce it deterministically:
//   1. ask_user       — options inconsistent with a stored dependency answer
//                       are filtered out before the composer renders.
//   2. update_section — a value outside the currently-allowed subset is
//                       rejected (same contract as the off-list document rule).
//   3. score_maturity — the closing scores refuse while required fields (or
//                       the set_path triage) are missing, returning the list
//                       so the model asks exactly those.
//
// E2–E6 opt in by adding a manifest to QUESTIONNAIRES — no new code. All
// values in rules are stable option IDS from ORG_PROFILE_ENUMS, never labels,
// so label copy edits and language never break a rule.

import { ORG_PROFILE_ENUMS, cboFieldEnumOptions, resolveOrgProfileOptionId } from './cbo-field-catalog';

/** The option list for `field` is a function of an earlier answer:
 *  allow[<dependency option id>] = the option ids offerable for `field`. */
export interface OptionRule {
  dependsOn: string;
  /**
   * Section the dependency lives in, when it is not this manifest's own.
   *
   * Real dependencies cross workshops: what an organisation may do in W3
   * depends on what it answered in W2. `who_maintains` (operations_sustain)
   * turns on `land_tenure` (intervention_site) — a city maintenance partnership
   * is only on the table for land the city owns. Without this the validator
   * looked the dependency up in the wrong section, found no ids, and threw at
   * module load.
   */
  dependsOnSection?: string;
  allow: Record<string, string[]>;
}

/** The exact words to ask a field with.
 *
 *  W2 showed why this cannot live in the model's memory. Two orgs answered
 *  nbs_experience = "Ainda não". Desabafa got the right follow-up ("vocês têm
 *  alguma iniciativa que acham que pode estar relacionada com SbN?"); Periferia
 *  Feminista got the yes-presuming one ("que tipo de solução baseada na
 *  natureza vocês JÁ TRABALHARAM?") — the exact wording the skill tells it not
 *  to use on that branch. Same input, different output, and hers cost a real
 *  answer: she used the turn to correct the previous question instead.
 *
 *  `variants` selects by the stored option id of `dependsOn`, so a branch's
 *  wording is data rather than something recalled correctly most of the time. */
export interface AskCopy {
  pt: string;
  en: string;
  /** Wording that depends on an earlier answer, keyed by that answer's id. */
  variants?: {
    dependsOn: string;
    /** Section the dependency lives in, when it is not this manifest's own. */
    dependsOnSection?: string;
    by: Record<string, { pt: string; en: string }>;
  };
}

/** A field that must be filled before the encontro closes. `requiredIf` makes
 *  it conditional on another field's answer (by option id); `orField` accepts
 *  a legacy/alternate field as satisfying the requirement. */
export interface RequiredEntry {
  field: string;
  orField?: string;
  /** `section` names where the dependency lives when it is not this manifest's. */
  requiredIf?: { field: string; section?: string; isAnyOf?: string[]; isNoneOf?: string[] };
}

export interface QuestionnaireManifest {
  workshop: string;
  /** The phase whose close this manifest gates. */
  phase: number;
  sectionId: string;
  optionRules: Record<string, OptionRule>;
  /** Canonical question copy per field. Optional: a field with no entry keeps
   *  today's behaviour exactly, so this can be adopted field by field. */
  ask?: Record<string, AskCopy>;
  requiredToClose: (string | RequiredEntry)[];
  /** The E1 triage (set_path) must have run before closing. */
  requiresPath?: boolean;
}

export const E1_QUESTIONNAIRE: QuestionnaireManifest = {
  workshop: 'e1',
  phase: 1,
  sectionId: 'org_profile',
  optionRules: {
    // Ana's mapping (field report 2026-07): "is kinda weird to say they have
    // a CNPJ and then have 'Coletivo informal' as an option" — and an org
    // without one can't be an empresa or formal NGO.
    legal_form: {
      dependsOn: 'has_cnpj',
      allow: {
        'yes': ['ngo', 'cooperativa', 'social-enterprise', 'implementer', 'other'],
        'no': ['informal', 'other'],
        'not-sure': ['ngo', 'cooperativa', 'informal', 'other'],
      },
    },
  },
  // The words E1 asks with. Sourced from knowledge/_skills/encontro-1.md so the
  // skill and the manifest cannot drift — the skill remains the place the flow
  // is explained; this is the place the wording is enforced.
  //
  // ONLY the fields whose wording actually went wrong in W2. Everything else
  // is unlisted on purpose and keeps the model's own phrasing.
  //
  // I first listed five, including paid_vs_volunteer and legal_form — fields
  // nobody had complained about. That silently rewrote questions three existing
  // specs assert on ("Como é a estrutura da equipe?"), which is the tell: if
  // taking a field over changes what an org is asked without a report behind it,
  // the manifest is being used to standardise rather than to fix.
  ask: {
    nbs_experience: {
      pt: 'Vocês já trabalharam com alguma solução baseada na natureza?',
      en: 'Have you already worked with any nature-based solution?',
    },
    // The branch that broke. "Ainda não" must never be answered with a
    // question that presumes a yes.
    nbs_experience_detail: {
      pt: 'Que tipo de solução baseada na natureza vocês já trabalharam?',
      en: 'What kind of nature-based solution have you worked with?',
      variants: {
        dependsOn: 'nbs_experience',
        by: {
          'not-sure': {
            pt: 'Me conta um pouco da iniciativa que vocês acham que pode ser SbN.',
            en: 'Tell me a bit about the initiative you think might be an NbS.',
          },
          // A clean "Ainda não" should not reach this field at all — the
          // requiredToClose rule excludes it. Worded defensively anyway, so
          // that if it is ever asked it is not asked as a yes.
          'none': {
            pt: 'Tem alguma iniciativa de vocês que vocês acham que pode estar relacionada com SbN? Ou é bem nova essa exploração?',
            en: 'Is there anything you do that you think might relate to NbS? Or is this exploration new for you?',
          },
        },
      },
    },
  },
  requiredToClose: [
    'org_name', 'contact_name', 'contact_role', 'mission_summary',
    'main_activities', 'has_cnpj', 'legal_form', 'year_founded', 'team_size',
    'paid_vs_volunteer', 'nbs_experience', 'groups_served',
    // Legacy sessions captured prior_project_scale instead of the v2
    // funding_history split — either satisfies.
    { field: 'funding_history', orField: 'prior_project_scale' },
    { field: 'funded_project_count', requiredIf: { field: 'funding_history', isAnyOf: ['yes'] } },
    { field: 'biggest_project_budget', requiredIf: { field: 'funding_history', isAnyOf: ['yes'] } },
    // Detail is asked for "Sim" AND "Não temos certeza" (and the legacy
    // yes-flavored ids) — only a clean "Ainda não" skips it.
    { field: 'nbs_experience_detail', requiredIf: { field: 'nbs_experience', isNoneOf: ['none'] } },
  ],
  requiresPath: true,
};

/** Manifests by the phase they close. E2+ get entries as their skills gain
 *  enforceable structure. */

/**
 * Encontro 3 — scoping one solution onto one site.
 *
 * Deliberately short. W3's job is a defensible project, and three answers are
 * what make a project defensible in words: why this solution here, what the
 * place is like before anything is built, and who looks after it afterwards.
 * Everything else W3 captures — the footprint, the cost band, the timeframe —
 * either falls out of a drawing or is allowed to stay open.
 *
 * That is not laxity. `shared/w3-dossier.ts` reports every unanswered thing as
 * a named gap rather than a blank, and an honest "ainda não sabemos" on money
 * is the single most useful answer in the session: it is the gap the portfolio
 * carries to the municipality. Requiring it to close would turn it into a
 * guess.
 */
export const E3_QUESTIONNAIRE: QuestionnaireManifest = {
  workshop: 'e3',
  phase: 3,
  sectionId: 'operations_sustain',
  optionRules: {
    // Straight out of the rain-garden ficha: "quem cuida é a associação de
    // moradores ou a prefeitura, dependendo de quem é o dono do terreno." On
    // land the organisation owns, a city maintenance partnership is not on the
    // table — offering it invites an agreement nobody can sign.
    who_maintains: {
      dependsOn: 'land_tenure',
      dependsOnSection: 'intervention_site',
      allow: {
        'private-owned': ['nos', 'voluntarios', 'contratada', 'indefinido'],
        'formal-agreement': ['nos', 'voluntarios', 'contratada', 'indefinido'],
        'public-informal': ['nos', 'voluntarios', 'parceria-prefeitura', 'indefinido'],
        'public-no-access': ['nos', 'voluntarios', 'indefinido'],
        'mixed': ['nos', 'voluntarios', 'parceria-prefeitura', 'contratada', 'indefinido'],
      },
    },
  },
  ask: {
    who_maintains: {
      pt: 'Depois que o mutirão vai embora, quem cuida disso no dia a dia?',
      en: 'After the mutirão goes home, who looks after this day to day?',
    },
    baseline_condition: {
      pt: 'Antes de qualquer obra: como é o lugar hoje? Isso é o que vai mostrar depois que mudou alguma coisa.',
      en: 'Before any work: what is the place like today? This is what will show that anything changed.',
    },
  },
  requiredToClose: ['justification_why_here', 'baseline_condition', 'who_maintains'],
};

export const QUESTIONNAIRES: Record<number, QuestionnaireManifest> = {
  1: E1_QUESTIONNAIRE,
  3: E3_QUESTIONNAIRE,
};

/** Raw stored value of a field, or undefined — the caller adapts its state shape. */
export type FieldReader = (field: string) => string | undefined;

/** Resolve a stored value (id, label or alias) to its option id, in any section. */
function optionIdIn(sectionId: string, field: string, raw: string): string | null {
  if (sectionId === 'org_profile') return resolveOrgProfileOptionId(field, raw);
  const opts = cboFieldEnumOptions(sectionId, field);
  if (!opts) return raw.trim() || null; // free text stands for itself
  const norm = (v: string) => v.trim().toLowerCase();
  const n = norm(raw);
  const hit = opts.find(
    o => norm(o.id) === n || norm(o.pt) === n || norm(o.en) === n || (o.aliases ?? []).some(a => norm(a) === n),
  );
  return hit ? hit.id : null;
}

function storedId(read: FieldReader, field: string, sectionId: string): string | null {
  const raw = read(field);
  if (raw == null || String(raw).trim() === '') return null;
  return optionIdIn(sectionId, field, String(raw));
}

/** The option ids currently offerable for `field`, or null when unconstrained
 *  (no rule, or the dependency hasn't been answered / doesn't resolve). */
export function allowedOptionIds(
  manifest: QuestionnaireManifest,
  field: string,
  read: FieldReader,
): string[] | null {
  const rule = manifest.optionRules[field];
  if (!rule) return null;
  const dep = storedId(read, rule.dependsOn, rule.dependsOnSection ?? manifest.sectionId);
  if (!dep) return null;
  return rule.allow[dep] ?? null;
}

/** Write-path check: is `value` (any form — id, label, alias) allowed for
 *  `field` given the stored dependency answer? */
export function checkOptionRule(
  manifest: QuestionnaireManifest,
  field: string,
  value: string,
  read: FieldReader,
): { ok: true } | { ok: false; dependsOn: string; allowedIds: string[] } {
  const allowed = allowedOptionIds(manifest, field, read);
  if (!allowed) return { ok: true };
  const id = optionIdIn(manifest.sectionId, field, value);
  // Unresolvable values are someone else's problem (the canonicalization /
  // off-list rules) — this rule only rejects a KNOWN option that the
  // dependency answer excludes.
  if (!id || allowed.includes(id)) return { ok: true };
  return { ok: false, dependsOn: manifest.optionRules[field].dependsOn, allowedIds: allowed };
}

/** ask_user guard: if this option list is recognizably a rule-governed enum
 *  question (≥2 options resolve to the same ruled field), drop the options the
 *  dependency answer excludes. Returns null when no rule applies. */
export function filterRuledOptions(
  manifest: QuestionnaireManifest,
  options: { label: string }[],
  read: FieldReader,
): { field: string; kept: { label: string }[]; droppedLabels: string[] } | null {
  for (const field of Object.keys(manifest.optionRules)) {
    const resolved = options.map(o => resolveOrgProfileOptionId(field, o.label));
    if (resolved.filter(Boolean).length < 2) continue;
    const allowed = allowedOptionIds(manifest, field, read);
    if (!allowed) return null; // it IS the ruled question, but nothing to filter by
    const kept: { label: string }[] = [];
    const droppedLabels: string[] = [];
    options.forEach((o, i) => {
      const id = resolved[i];
      if (id && !allowed.includes(id)) droppedLabels.push(o.label);
      else kept.push(o);
    });
    return { field, kept, droppedLabels };
  }
  return null;
}

/** The fields still blocking the encontro's close (plus the path triage when
 *  required). Field names are returned as-is so the caller can name them to
 *  the model. `hasPath` = the set_path triage already ran; pass null when the
 *  session has no cohort member (standalone) — the path requirement is then
 *  skipped, since set_path can't persist there. */
export function missingRequiredForClose(
  manifest: QuestionnaireManifest,
  read: FieldReader,
  hasPath: boolean | null,
): string[] {
  const filled = (field: string) => {
    const v = read(field);
    return v != null && String(v).trim() !== '';
  };
  const missing: string[] = [];
  for (const entry of manifest.requiredToClose) {
    const req: RequiredEntry = typeof entry === 'string' ? { field: entry } : entry;
    if (req.requiredIf) {
      const dep = storedId(read, req.requiredIf.field, req.requiredIf.section ?? manifest.sectionId);
      if (!dep) continue; // dependency itself unanswered → reported on its own line
      if (req.requiredIf.isAnyOf && !req.requiredIf.isAnyOf.includes(dep)) continue;
      if (req.requiredIf.isNoneOf && req.requiredIf.isNoneOf.includes(dep)) continue;
    }
    if (filled(req.field) || (req.orField && filled(req.orField))) continue;
    if (!missing.includes(req.field)) missing.push(req.field);
  }
  if (manifest.requiresPath && hasPath === false) missing.push('path triage (ask the project-status question, then set_path)');
  return missing;
}

// Sanity: every id referenced by a rule must exist in the catalog — a typo'd
// id would silently never match. Fails fast at module load in dev/tests.
// Resolve through the section the manifest actually gates. The first version
// of this read ORG_PROFILE_ENUMS directly, which made the header's promise —
// "E2–E6 opt in by adding a manifest, no new code" — untrue in practice: any
// manifest for another section found zero ids and threw at module load.
for (const m of Object.values(QUESTIONNAIRES)) {
  for (const [field, rule] of Object.entries(m.optionRules)) {
    const ids = new Set((cboFieldEnumOptions(m.sectionId, field) ?? []).map(o => o.id));
    const depSection = rule.dependsOnSection ?? m.sectionId;
    const depIds = new Set((cboFieldEnumOptions(depSection, rule.dependsOn) ?? []).map(o => o.id));
    for (const [dep, allowed] of Object.entries(rule.allow)) {
      if (!depIds.has(dep)) throw new Error(`cbo-questionnaire: ${m.workshop}.${field} rule keys unknown ${rule.dependsOn} id "${dep}"`);
      for (const id of allowed) {
        if (!ids.has(id)) throw new Error(`cbo-questionnaire: ${m.workshop}.${field} allow-list has unknown ${field} id "${id}"`);
      }
    }
  }
}

/** The canonical wording for a field, in one language, resolving any branch
 *  variant against what the org has already answered.
 *
 *  Null when the manifest declares no copy for the field — the caller then
 *  keeps whatever it was going to do, which is how this stays adoptable field
 *  by field rather than as a flag day. */
export function askCopyFor(
  manifest: QuestionnaireManifest,
  field: string,
  read: FieldReader,
  lang: 'pt' | 'en',
): string | null {
  const entry = manifest.ask?.[field];
  if (!entry) return null;
  const v = entry.variants;
  if (v) {
    const dep = storedId(read, v.dependsOn, v.dependsOnSection ?? manifest.sectionId);
    if (dep && v.by[dep]) return v.by[dep][lang];
  }
  return entry[lang];
}

/** Same, across every manifest, for callers that only know a field name. */
export function askCopyForField(
  field: string,
  read: FieldReader,
  lang: 'pt' | 'en',
): string | null {
  for (const m of Object.values(QUESTIONNAIRES)) {
    const copy = askCopyFor(m, field, read, lang);
    if (copy) return copy;
  }
  return null;
}

