// Canonical catalog for the E1 org_profile enum fields.
//
// Field trip that motivated this (Ana, 2026-07-07): the agent extracted a news
// article and stored the skill spec's machine ids ("funded",
// "gardens-and-greening") — which the doc panel rendered raw, in English. The
// skill spec defines machine enums, the system prompt demands Portuguese
// values, and the chip flow stores whatever label the user tapped, so storage
// was a lottery. This catalog is the single source of truth that reconciles
// the three: writes are canonicalized to the human chip label (the value every
// consumer — panel, coordinator drawer, decision log, exports — actually
// wants), and reads map any legacy id to the viewer-language label.
//
// Values that don't match any option (e.g. the richer chip "Projeto financiado
// (R$ 50k+)", or free text) pass through untouched — never destroy user input.

export type CboEnumOption = {
  /** Machine id from the E1 skill spec (knowledge/_skills/encontro-1.md). */
  id: string;
  /** Portuguese chip label — the canonical stored form for pt sessions. */
  pt: string;
  en: string;
  /** Extra spellings the agent has plausibly produced. Matched normalized. */
  aliases?: string[];
};

/** The complete org_profile field set from the E1 skill spec. update_section
 *  rejects anything else for this section — inventing field names (e.g.
 *  "current_leadership") is how facts end up in chat but not on the document. */
export const ORG_PROFILE_FIELDS = [
  'org_name',
  'contact_name',
  'contact_role',
  'mission_summary',
  // Questionnaire v2 (Vila Flores field feedback 2026-07-08): activities got
  // their own field (they were being squashed into mission_summary, which is
  // why the mission question silently disappeared from the flow), CNPJ is
  // asked before org type, and the single prior_project_scale question became
  // funding_history → funded_project_count + biggest_project_budget.
  'main_activities',
  'has_cnpj',
  'legal_form',
  'year_founded',
  'team_size',
  'paid_vs_volunteer',
  'funding_history',
  'funded_project_count',
  'biggest_project_budget',
  // Legacy — no longer asked; kept so sessions recorded before v2 still
  // validate, display, and feed the delivery-capacity rubric.
  'prior_project_scale',
  'nbs_experience',
  'nbs_experience_detail',
  'bairro_of_operation',
  'groups_served',
  'proud_moment',
] as const;

export function isKnownOrgProfileField(field: string): boolean {
  return (ORG_PROFILE_FIELDS as readonly string[]).includes(field);
}

export const ORG_PROFILE_ENUMS: Record<string, CboEnumOption[]> = {
  legal_form: [
    { id: 'ngo', pt: 'ONG / Associação', en: 'NGO / Association', aliases: ['associação', 'associacao', 'association', 'ong'] },
    { id: 'cooperativa', pt: 'Cooperativa', en: 'Cooperative', aliases: ['cooperative', 'coop'] },
    { id: 'informal', pt: 'Coletivo informal', en: 'Informal collective', aliases: ['coletivo', 'informal collective', 'grupo informal'] },
    { id: 'social-enterprise', pt: 'Empresa social', en: 'Social enterprise' },
    { id: 'implementer', pt: 'Empresa / estúdio / escritório técnico', en: 'Company / studio / technical office', aliases: ['empresa', 'company', 'studio', 'estúdio', 'escritório técnico'] },
    { id: 'other', pt: 'Outra', en: 'Other', aliases: ['outro'] },
  ],
  year_founded: [
    { id: 'starting', pt: 'Começando agora', en: 'Just starting', aliases: ['começando', 'starting now'] },
    { id: 'lt-2', pt: 'Menos de 2 anos', en: 'Less than 2 years', aliases: ['<2 anos', 'less than 2'] },
    { id: '2-5', pt: '2 a 5 anos', en: '2–5 years', aliases: ['2-5 anos', '2 to 5 years'] },
    { id: '5-10', pt: '5 a 10 anos', en: '5–10 years', aliases: ['5-10 anos', '5 to 10 years'] },
    { id: 'gt-10', pt: 'Mais de 10 anos', en: 'More than 10 years', aliases: ['10+ anos', '10+ years', 'more than 10 years'] },
  ],
  team_size: [
    { id: '1-2', pt: '1–2', en: '1–2', aliases: ['1-2 pessoas', '1 a 2'] },
    { id: '3-5', pt: '3–5', en: '3–5', aliases: ['3-5 pessoas', '3 a 5'] },
    { id: '6-15', pt: '6–15', en: '6–15', aliases: ['6-15 pessoas', '6 a 15'] },
    { id: '16+', pt: '16+', en: '16+', aliases: ['16+ pessoas', 'mais de 16'] },
  ],
  // Questionnaire v2: "(1–2 pagas)" dropped from the mostly-volunteers label
  // (it wrongly excluded orgs with 3+ paid among many volunteers) and "Todas
  // pagas" added. Old labels stay as aliases so legacy stored values re-render.
  paid_vs_volunteer: [
    { id: 'all-volunteer', pt: 'Todas voluntárias', en: 'All volunteers', aliases: ['todos voluntários', 'all volunteer'] },
    { id: 'mostly-volunteer', pt: 'Maioria voluntárias', en: 'Mostly volunteers', aliases: ['maioria voluntárias (1–2 pagas)', 'mostly volunteers (1–2 paid)'] },
    { id: 'half-half', pt: 'Metade e metade', en: 'Half and half', aliases: ['metade', '50/50', 'half half'] },
    { id: 'mostly-paid', pt: 'Maioria pagas', en: 'Mostly paid', aliases: ['maioria remuneradas', 'mostly paid staff'] },
    { id: 'all-paid', pt: 'Todas pagas', en: 'All paid', aliases: ['todas remuneradas', 'all paid staff'] },
  ],
  main_activities: [
    { id: 'hortas-alimentar', pt: 'Hortas e segurança alimentar', en: 'Gardens and food security', aliases: ['hortas', 'segurança alimentar', 'food security', 'gardens'] },
    { id: 'arborizacao', pt: 'Arborização e áreas verdes', en: 'Tree planting and green areas', aliases: ['arborização', 'áreas verdes', 'green areas', 'tree planting'] },
    { id: 'resiliencia-climatica', pt: 'Resiliência climática (enchentes, calor)', en: 'Climate resilience (floods, heat)', aliases: ['resiliência climática', 'climate resilience'] },
    { id: 'educacao-ambiental', pt: 'Educação ambiental', en: 'Environmental education', aliases: ['env education'] },
    { id: 'cultura-comunitaria', pt: 'Cultura e organização comunitária', en: 'Culture and community organizing', aliases: ['cultura', 'organização comunitária', 'community organizing'] },
    // VF feedback 2026-07-14: an "Others" escape chip. The skill treats it as
    // a doorway (tap → free-text follow-up, store the org's own words — the
    // multi-field passes unlisted items through untouched); this entry exists
    // so a tapped "Outras" canonicalizes across languages instead of failing
    // the exact-label guard while the follow-up is still in flight.
    { id: 'other', pt: 'Outras', en: 'Others', aliases: ['other', 'outros'] },
  ],
  has_cnpj: [
    { id: 'yes', pt: 'Sim, temos CNPJ', en: 'Yes, we have a CNPJ', aliases: ['sim', 'yes', 'tem cnpj', 'com cnpj'] },
    { id: 'no', pt: 'Ainda não', en: 'Not yet', aliases: ['não', 'nao', 'no', 'sem cnpj'] },
    { id: 'not-sure', pt: 'Não temos certeza', en: 'Not sure', aliases: ['não sei', 'nao sei', 'not sure', 'não tenho certeza'] },
  ],
  funding_history: [
    { id: 'yes', pt: 'Sim, já recebemos', en: 'Yes, we have', aliases: ['sim', 'yes', 'já recebemos', 'ja recebemos'] },
    { id: 'no', pt: 'Ainda não', en: 'Not yet', aliases: ['não', 'nao', 'no', 'nunca recebemos'] },
  ],
  funded_project_count: [
    { id: 'one', pt: '1 projeto', en: '1 project', aliases: ['um projeto', 'one project', '1'] },
    { id: '2-5', pt: '2 a 5 projetos', en: '2–5 projects', aliases: ['2-5 projetos', '2 to 5 projects'] },
    { id: 'gt-5', pt: 'Mais de 5 projetos', en: 'More than 5 projects', aliases: ['5+ projetos', '5+ projects', 'mais de 5'] },
  ],
  biggest_project_budget: [
    { id: 'lt-10k', pt: 'Até R$ 10 mil', en: 'Up to R$ 10k', aliases: ['ate 10 mil', 'menos de 10 mil', 'up to 10k'] },
    { id: '10-50k', pt: 'R$ 10 a 50 mil', en: 'R$ 10–50k', aliases: ['10 a 50 mil', '10-50k'] },
    { id: '50-200k', pt: 'R$ 50 a 200 mil', en: 'R$ 50–200k', aliases: ['50 a 200 mil', '50-200k'] },
    { id: 'gt-200k', pt: 'Mais de R$ 200 mil', en: 'More than R$ 200k', aliases: ['mais de 200 mil', '200k+'] },
  ],
  prior_project_scale: [
    { id: 'none', pt: 'Nenhum formal ainda', en: 'None formal yet', aliases: ['nenhum', 'none yet', 'no formal projects'] },
    { id: 'ad-hoc', pt: 'Atividades pontuais', en: 'Ad-hoc activities', aliases: ['adhoc', 'pontuais', 'one-off activities'] },
    { id: 'funded', pt: 'Projeto com financiamento', en: 'Funded project', aliases: ['projeto financiado', 'com financiamento'] },
    { id: 'partnership', pt: 'Parceria com órgão público / fundação', en: 'Partnership with public agency / foundation', aliases: ['parceria', 'partnership with public agency'] },
  ],
  // Questionnaire v2: the chips are now Sim / Ainda não / Não temos certeza,
  // with the specifics captured in the free-text follow-up
  // (nbs_experience_detail). The old activity-flavored options stay so legacy
  // sessions keep displaying — and they still read as a "yes" in the rubric.
  nbs_experience: [
    { id: 'yes', pt: 'Sim', en: 'Yes', aliases: ['sim, já trabalhamos', 'ja trabalhamos'] },
    { id: 'none', pt: 'Ainda não', en: 'Not yet', aliases: ['nenhuma', 'ainda nao', 'não', 'nao', 'no'] },
    { id: 'not-sure', pt: 'Não temos certeza', en: 'Not sure', aliases: ['não tenho certeza', 'nao tenho certeza', 'not sure', 'não sei'] },
    { id: 'env-education', pt: 'Educação ambiental', en: 'Environmental education', aliases: ['env education', 'educação ambiental'] },
    { id: 'gardens-and-greening', pt: 'Hortas / arborização', en: 'Gardens and greening', aliases: ['hortas', 'arborização', 'hortas e arborização', 'gardens', 'greening'] },
    { id: 'implemented-nbs', pt: 'Já implementamos SbN', en: 'Already implemented NbS', aliases: ['já implementamos', 'implementamos', 'implemented nbs'] },
  ],
  groups_served: [
    { id: 'mulheres', pt: 'Mulheres', en: 'Women', aliases: ['women'] },
    { id: 'idosos', pt: 'Idosos', en: 'Elderly', aliases: ['elderly', 'seniors', 'pessoas idosas'] },
    { id: 'pessoas-com-deficiencia', pt: 'Pessoas com deficiência', en: 'People with disabilities', aliases: ['people with disabilities', 'pcd', 'disabled people'] },
    { id: 'comunidades-tradicionais', pt: 'Comunidades tradicionais', en: 'Traditional communities', aliases: ['traditional communities'] },
    { id: 'jovens', pt: 'Jovens', en: 'Youth', aliases: ['youth', 'young people', 'juventude'] },
    { id: 'pessoas-negras', pt: 'Pessoas negras', en: 'Black people', aliases: ['black people'] },
    { id: 'povos-indigenas', pt: 'Povos indígenas', en: 'Indigenous peoples', aliases: ['indigenous', 'indigenous peoples'] },
    { id: 'comunidade-do-bairro', pt: 'Comunidade do bairro', en: 'Neighborhood community', aliases: ['neighborhood community', 'comunidade em geral', 'comunidade do bairro em geral'] },
  ],
};

// Accent/punctuation-insensitive full-string match ("Educação ambiental" ≡
// "educacao ambiental" ≡ "env-education"). Digits and '+' survive so team-size
// buckets ("3–5", "16+") normalize distinctly.
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim();
}

function matchOption(field: string, raw: string): CboEnumOption | null {
  const options = ORG_PROFILE_ENUMS[field];
  if (!options) return null;
  const n = norm(raw);
  if (!n) return null;
  for (const opt of options) {
    if (norm(opt.id) === n || norm(opt.pt) === n || norm(opt.en) === n) return opt;
    if (opt.aliases?.some(a => norm(a) === n)) return opt;
  }
  return null;
}

// Containment fallback for DOCUMENT-sourced extractions (field report
// 2026-07-08: a link produced "categories related to ours but not exactly
// them"). A model reading an article writes phrases like "Associação
// comunitária de moradores" — no exact match, but exactly one option's tokens
// ("associação") appear in it. Match only when precisely ONE option is
// contained; two hits = ambiguous = no match (the caller then asks the user).
// Never used for user-typed values — exact matching stays the only path there.
function matchOptionFuzzy(field: string, raw: string): CboEnumOption | null {
  const options = ORG_PROFILE_ENUMS[field];
  if (!options) return null;
  const rawTokens = norm(raw).split(' ').filter(Boolean);
  if (rawTokens.length === 0) return null;
  const contains = (needle: string): boolean => {
    const toks = norm(needle).split(' ').filter(Boolean);
    return toks.length > 0 && toks.every(t => rawTokens.includes(t));
  };
  const hits = options.filter(opt =>
    contains(opt.pt) || contains(opt.en) || (opt.aliases ?? []).some(contains),
  );
  return hits.length === 1 ? hits[0] : null;
}

/** groups_served / main_activities are multi-selects stored as one string —
 *  split on the separators the agent/chips produce, map each item
 *  independently. */
const MULTI_FIELDS = new Set(['groups_served', 'main_activities']);
const MULTI_SEPARATOR = /\s*[,;·|]\s*|\s+e\s+(?=[A-ZÀ-Ú])/;

function mapValue(field: string, raw: string, pick: (opt: CboEnumOption) => string, fuzzy = false): string {
  const resolve = (s: string) => matchOption(field, s) ?? (fuzzy ? matchOptionFuzzy(field, s) : null);
  if (MULTI_FIELDS.has(field)) {
    return raw
      .split(MULTI_SEPARATOR)
      .filter(part => part.trim().length > 0)
      .map(part => {
        const opt = resolve(part);
        return opt ? pick(opt) : part.trim();
      })
      .join(', ');
  }
  const opt = resolve(raw);
  return opt ? pick(opt) : raw;
}

/** Write path: turn whatever the agent produced (machine id, English label,
 *  chip label) into the canonical human label for the session language.
 *  Unrecognized values pass through unchanged. `fuzzy` adds the containment
 *  fallback — pass it ONLY for document-sourced extractions. */
export function canonicalizeOrgProfileValue(field: string, raw: string, lang: 'pt' | 'en' = 'pt', fuzzy = false): string {
  if (typeof raw !== 'string' || !ORG_PROFILE_ENUMS[field]) return raw;
  return mapValue(field, raw, opt => (lang === 'pt' ? opt.pt : opt.en), fuzzy);
}

/** True when `field` is one of the closed-list (enum) org_profile fields. */
export function isEnumOrgProfileField(field: string): boolean {
  return !!ORG_PROFILE_ENUMS[field];
}

/** True when `value` already sits on the closed list for `field` (multi-select:
 *  every part must). Used to REJECT document-sourced off-list values at the
 *  write path — the agent is told to ask the user with chips instead. */
export function isCanonicalOrgProfileValue(field: string, value: string): boolean {
  if (!ORG_PROFILE_ENUMS[field] || typeof value !== 'string') return true;
  if (MULTI_FIELDS.has(field)) {
    const parts = value.split(MULTI_SEPARATOR).filter(p => p.trim().length > 0);
    return parts.length > 0 && parts.every(p => matchOption(field, p) !== null);
  }
  return matchOption(field, value) !== null;
}

/** The chip labels for an enum field in one language — for tool-error messages
 *  that teach the model the exact allowed list. */
export function orgProfileOptionLabels(field: string, lang: 'pt' | 'en' = 'pt'): string[] {
  return (ORG_PROFILE_ENUMS[field] ?? []).map(o => (lang === 'pt' ? o.pt : o.en));
}

/** Resolve any form of an enum value (stable id, pt/en label, alias) to its
 *  stable option id — the representation the questionnaire manifest rules use.
 *  Null when the field isn't an enum or the value doesn't sit on the list. */
export function resolveOrgProfileOptionId(field: string, raw: string): string | null {
  if (typeof raw !== 'string' || !ORG_PROFILE_ENUMS[field]) return null;
  return matchOption(field, raw)?.id ?? null;
}

/** Re-ask guard support (COUGAR Perfect Demo 2026-07-14: the model re-asked
 *  "How is your team structured?" right after it was answered). ask_user
 *  carries no field id, so the guard infers which enum field(s) a chip list
 *  plausibly targets: a field qualifies when at least 2 of the labels — and at
 *  least 70% of them — resolve to its options. Generic yes/no chip sets match
 *  several fields (has_cnpj / nbs_experience share "Sim"/"Ainda não"); the
 *  caller must treat the result as a duplicate only when EVERY returned field
 *  is already answered. */
export function enumFieldsMatchingOptions(labels: string[]): string[] {
  const real = labels.filter(l => typeof l === 'string' && l.trim().length > 0);
  if (real.length < 2) return [];
  const fields: string[] = [];
  for (const field of Object.keys(ORG_PROFILE_ENUMS)) {
    const hits = real.filter(l => matchOption(field, l) !== null).length;
    if (hits >= 2 && hits >= Math.ceil(real.length * 0.7)) fields.push(field);
  }
  return fields;
}

/** Labels (in `lang`) for a subset of an enum field's option ids — for guard
 *  messages that must name the allowed chips exactly. */
export function orgProfileLabelsForIds(field: string, ids: string[], lang: 'pt' | 'en' = 'pt'): string[] {
  return (ORG_PROFILE_ENUMS[field] ?? [])
    .filter(o => ids.includes(o.id))
    .map(o => (lang === 'pt' ? o.pt : o.en));
}

/** Read path: render any stored form (including legacy machine ids already in
 *  the database) as the viewer-language label. */
export function orgProfileDisplayValue(field: string, stored: string, lang: 'pt' | 'en'): string {
  if (typeof stored !== 'string' || !ORG_PROFILE_ENUMS[field]) return stored;
  return mapValue(field, stored, opt => (lang === 'pt' ? opt.pt : opt.en));
}

// ═══════════════════════════════════════════════════════════════════════════
// BEYOND org_profile — the rest of the document
// ═══════════════════════════════════════════════════════════════════════════
//
// JVP, 2026-08-06: "some fields in the doc (titles etc) in the tab of the CBO
// are written in English, can you review?"
//
// Everything above solved exactly this, for section 1, and stopped there. So
// the Documento tab rendered section 2 onward two ways at once:
//
//   LABELS — the panel does `t('cbo.fields.' + key, key.replace(/_/g,' '))`,
//   and i18n's fallback chain is pt→pt (never pt→en), so a key missing from
//   pt.json renders that English `defaultValue` verbatim. Of the 39 fields the
//   agent actually writes, 37 had no key: "site worry", "current use",
//   "community anchoring lead". Meanwhile pt.json carried ~20 names nothing
//   writes — `neighborhood` (agent writes `bairro`), `current_conditions`
//   (`current_use`), `baseline` (`baseline_condition`) — which is why the tab
//   looked half-translated rather than plainly broken.
//
//   VALUES — `orgProfileDisplayValue` is applied ONLY to org_profile
//   (cbo-profile.tsx), so everywhere else the raw machine id reached the
//   screen: `private-owned`, `aguas-pluviais`, `under-construction`.
//
// The Portuguese already existed in every case — the chips the user tapped are
// built from these very tables. The document simply never consulted them. So
// this is wiring, not translation, and the tables move HERE (out of
// cboAgent.ts) precisely so the chip, the panel, the coordinator drawer and
// the export cannot drift apart again.
//
// ⚠️ Adding a field the agent can write? Add it to CBO_FIELD_LABELS. The locale
// files still win when they define a key (nothing was deleted), but this is the
// source of truth, and it is the only one the SERVER can read — the markdown
// export has no i18next.

/** current_use — what the place is today (E2 chips). */
export const E2_CURRENT_USE: CboEnumOption[] = [
  { id: 'vegetated', pt: 'Vegetação (área verde, mato, árvores)', en: 'Vegetation (green area, brush, trees)' },
  { id: 'paved', pt: 'Pavimentado / impermeabilizado', en: 'Paved / sealed' },
  { id: 'mixed', pt: 'Misto (vegetação + pavimentação)', en: 'Mixed (vegetation + paving)' },
  { id: 'abandoned', pt: 'Abandonado / degradado', en: 'Abandoned / degraded' },
  { id: 'under-construction', pt: 'Em construção', en: 'Under construction' },
];

/** land_tenure — what access the organization actually has. */
export const E2_TENURE: CboEnumOption[] = [
  { id: 'private-owned', pt: 'Sim, somos donas do terreno', en: 'Yes, we own the land' },
  { id: 'formal-agreement', pt: 'Sim, com acordo formal', en: 'Yes, with a formal agreement' },
  { id: 'public-informal', pt: 'É da prefeitura, mas a gente usa', en: "It's the city's, but we use it" },
  { id: 'public-no-access', pt: 'É público mas não temos acesso garantido', en: "It's public but access isn't guaranteed" },
  { id: 'mixed', pt: 'Misto / não sei certinho', en: 'Mixed / not sure' },
];

/** role_preference — the role the org wants to play (multi-pick). */
export const E2_ROLES: CboEnumOption[] = [
  { id: 'ser-consultada', pt: 'Ser consultada (dar opinião)', en: 'Be consulted (give input)' },
  { id: 'escrever-projeto', pt: 'Escrever o projeto', en: 'Write the project' },
  { id: 'receber-administrar', pt: 'Receber e administrar recursos', en: 'Receive and manage the funds' },
  { id: 'executar', pt: 'Executar / implementar', en: 'Implement on the ground' },
  { id: 'articular-parceiros', pt: 'Articular parceiros', en: 'Coordinate partners' },
];

/** The five NBS famílias, by id. Mirrors shared/nbs-catalog.ts labels. */
const E2_FAMILIAS: CboEnumOption[] = [
  { id: 'aguas-pluviais', pt: 'Gestão de Águas Pluviais', en: 'Stormwater Management' },
  { id: 'verde-urbano', pt: 'Infraestrutura Verde Urbana', en: 'Urban Green Infrastructure' },
  { id: 'agricultura-urbana', pt: 'Agricultura Urbana', en: 'Urban Agriculture' },
  { id: 'encostas-e-solo', pt: 'Estabilização de Encostas e Solo', en: 'Slope & Soil Stabilization' },
  { id: 'recuperacao-ecossistemas', pt: 'Recuperação de Ecossistemas Naturais', en: 'Ecosystem Restoration' },
];

/** The three hazards, as stored by the priority ranking and the worry chips. */
const E2_HAZARDS: CboEnumOption[] = [
  { id: 'flood', pt: 'Alagamento', en: 'Flooding', aliases: ['inundação', 'enchente'] },
  { id: 'heat', pt: 'Calor', en: 'Heat' },
  { id: 'landslide', pt: 'Deslizamento', en: 'Landslide', aliases: ['barranco', 'encosta'] },
  { id: 'other', pt: 'Outra coisa', en: 'Something else' },
];

/** Enum tables per section+field, for every section past org_profile. */
export const SECTION_ENUMS: Record<string, Record<string, CboEnumOption[]>> = {
  intervention_site: {
    current_use: E2_CURRENT_USE,
    land_tenure: E2_TENURE,
    role_preference: E2_ROLES,
    nbs_interest: E2_FAMILIAS,
    site_worry: E2_HAZARDS,
    primary_hazard: E2_HAZARDS,
    secondary_hazard: E2_HAZARDS,
    tertiary_hazard: E2_HAZARDS,
    site_photo_intent: [
      { id: 'sent', pt: 'Enviou fotos', en: 'Sent photos' },
      { id: 'later', pt: 'Vai enviar depois', en: 'Will send later' },
      { id: 'skip', pt: 'Preferiu pular', en: 'Chose to skip' },
    ],
    // Written by computeSiteKnowledgeDepth — a coordinator-facing read, and it
    // renders on the org's own document too, so it cannot stay in English.
    site_knowledge_depth: [
      { id: 'thin', pt: 'Pouco detalhe', en: 'Thin' },
      { id: 'partial', pt: 'Detalhe parcial', en: 'Partial' },
      { id: 'strong', pt: 'Bem detalhado', en: 'Strong' },
    ],
  },
};

/**
 * Human labels for the fields the agent writes, in both languages.
 *
 * Only the ones the panel can actually show — `_`-prefixed internals are hidden
 * by isInternalCboField and deliberately absent.
 */
export const CBO_FIELD_LABELS: Record<string, { pt: string; en: string }> = {
  // ── 2. Onde atuamos (E2) ──────────────────────────────────────────────────
  bairro: { pt: 'Bairro', en: 'Neighborhood' },
  site_name: { pt: 'Lugar', en: 'Place' },
  site_type_user: { pt: 'Tipo de lugar', en: 'Type of place' },
  current_use: { pt: 'Como é o lugar hoje', en: 'What the place is like today' },
  land_tenure: { pt: 'Acesso ao terreno', en: 'Access to the land' },
  site_worry: { pt: 'O que mais preocupa', en: 'Main worry' },
  site_story: { pt: 'Nas palavras de vocês', en: 'In your own words' },
  site_photo_intent: { pt: 'Fotos do lugar', en: 'Photos of the place' },
  site_knowledge_depth: { pt: 'Profundidade do que sabemos', en: 'Depth of what we know' },
  primary_hazard: { pt: 'Risco principal', en: 'Main hazard' },
  secondary_hazard: { pt: 'Risco secundário', en: 'Secondary hazard' },
  tertiary_hazard: { pt: 'Terceiro risco', en: 'Third hazard' },
  nbs_interest: { pt: 'Grupos de interesse', en: 'Grupos of interest' },
  role_preference: { pt: 'Papel que querem ter', en: 'Role they want to play' },
  site_lat: { pt: 'Latitude', en: 'Latitude' },
  site_lng: { pt: 'Longitude', en: 'Longitude' },
  site_area_m2: { pt: 'Área (m²)', en: 'Area (m²)' },
  community_anchoring_lead: { pt: 'Quem puxa o trabalho', en: 'Who leads the work' },
  community_volunteers: { pt: 'Voluntárias e voluntários', en: 'Volunteers' },
  community_beneficiaries: { pt: 'Pessoas beneficiadas', en: 'People served' },
  community_engagement_methods: { pt: 'Como mobilizam a comunidade', en: 'How they mobilize the community' },
  // ── 3a/3b/3c ──────────────────────────────────────────────────────────────
  intervention_types: { pt: 'Tipos de solução', en: 'Solution types' },
  intervention_scale: { pt: 'Escala da intervenção', en: 'Scale of the intervention' },
  intervention_area_m2: { pt: 'Área da intervenção (m²)', en: 'Intervention area (m²)' },
  construction_model: { pt: 'Como será construído', en: 'How it will be built' },
  species_preference: { pt: 'Espécies preferidas', en: 'Preferred species' },
  substrate_type: { pt: 'Tipo de substrato', en: 'Substrate type' },
  justification_why_here: { pt: 'Por que aqui', en: 'Why here' },
  baseline_condition: { pt: 'Situação de partida', en: 'Starting condition' },
  monitoring_capacity: { pt: 'Capacidade de monitorar', en: 'Monitoring capacity' },
  maintenance_frequency: { pt: 'Frequência de manutenção', en: 'Maintenance frequency' },
  project_timeframe: { pt: 'Prazo do projeto', en: 'Project timeframe' },
  opex_estimate_year1: { pt: 'Custo de operação (ano 1)', en: 'Operating cost (year 1)' },
  who_maintains: { pt: 'Quem faz a manutenção', en: 'Who maintains it' },
  // ── 4 / 5 ─────────────────────────────────────────────────────────────────
  online_presence: { pt: 'Presença online', en: 'Online presence' },
  documents: { pt: 'Documentos', en: 'Documents' },
  government_interest: { pt: 'Interesse do poder público', en: 'Government interest' },
  co_financing: { pt: 'Contrapartida / cofinanciamento', en: 'Co-financing' },
  scalability: { pt: 'Potencial de replicar', en: 'Potential to scale' },
};

/** The label for a field key, in the viewer's language. Falls back to the
 *  humanized key — which is what every missing entry used to render. */
export function cboFieldLabel(field: string, lang: 'pt' | 'en' = 'pt'): string {
  const entry = CBO_FIELD_LABELS[field];
  if (entry) return lang === 'pt' ? entry.pt : entry.en;
  return field.replace(/_/g, ' ');
}

/**
 * Render a stored value for ANY section, in the viewer's language.
 *
 * Multi-pick fields are stored comma-joined (`nbs_interest`, `role_preference`,
 * `site_worry`), so each part is mapped on its own — a single lookup of
 * "aguas-pluviais, verde-urbano" would miss and fall through to the raw ids.
 * Anything unrecognized passes through untouched: free text is the user's, and
 * a half-translated sentence is worse than an honest one.
 */
export function cboDisplayValue(
  sectionId: string,
  field: string,
  stored: string,
  lang: 'pt' | 'en' = 'pt',
): string {
  if (typeof stored !== 'string' || !stored) return stored;
  if (sectionId === 'org_profile') return orgProfileDisplayValue(field, stored, lang);
  const options = SECTION_ENUMS[sectionId]?.[field];
  if (!options) return stored;
  const label = (raw: string): string => {
    const n = norm(raw);
    const hit = options.find(
      o => norm(o.id) === n || norm(o.pt) === n || norm(o.en) === n ||
           (o.aliases ?? []).some(a => norm(a) === n),
    );
    return hit ? (lang === 'pt' ? hit.pt : hit.en) : raw;
  };
  return stored.split(',').map(part => label(part.trim())).filter(Boolean).join(', ');
}

/** Maturity metric names — the Placar reads these from pt.json, but the export
 *  runs on the server where there is no i18next. Same strings, one place. */
Object.assign(CBO_FIELD_LABELS, {
  org_delivery_capacity: { pt: 'Capacidade de Execução', en: 'Delivery Capacity' },
  team_technical_experience: { pt: 'Experiência Técnica', en: 'Technical Experience' },
  site_control: { pt: 'Controle do Local', en: 'Site Control' },
  community_anchoring: { pt: 'Ancoragem Comunitária', en: 'Community Anchoring' },
  problem_clarity: { pt: 'Clareza do Problema', en: 'Problem Clarity' },
  solution_clarity: { pt: 'Clareza da Solução', en: 'Solution Clarity' },
  climate_nbs_impact: { pt: 'Impacto Climático / SbN', en: 'Climate / NBS Impact' },
  financial_thinking: { pt: 'Planejamento Financeiro', en: 'Financial Thinking' },
  regulatory_awareness: { pt: 'Consciência Regulatória', en: 'Regulatory Awareness' },
});

/** Section titles. CBO_SECTIONS carries English literals (they double as ids in
 *  the prompt), and the client resolves them through `cbo.sections.*`; the
 *  export had no such route and printed "## 2. Where We Work" on a pt document. */
export const CBO_SECTION_TITLES: Record<string, { pt: string; en: string }> = {
  org_profile: { pt: '1. Quem Somos', en: '1. Who We Are' },
  intervention_site: { pt: '2. Onde Atuamos', en: '2. Where We Work' },
  intervention_type: { pt: '3a. O Que Estamos Construindo', en: "3a. What We're Building" },
  impact_monitoring: { pt: '3b. Impacto Esperado', en: '3b. Expected Impact' },
  operations_sustain: { pt: '3c. Operação e Sustentabilidade', en: '3c. Operations & Sustainability' },
  needs_assessment: { pt: '4. O Que Precisamos', en: '4. What We Need' },
  results_evidence: { pt: '5. Resultados e Evidências', en: '5. Results & Evidence' },
};

/** Priority-flag sentences, keyed by the English flag text the agent stores. */
export const CBO_PRIORITY_FLAG_LABELS: Record<string, { pt: string; en: string }> = {
  'Land tenure secure or likely secure': { pt: 'Posse da terra segura ou provável', en: 'Land tenure secure or likely secure' },
  'Baseline environmental data exists': { pt: 'Dados ambientais de referência existem', en: 'Baseline environmental data exists' },
  'Local government expressed interest': { pt: 'Governo local expressou interesse', en: 'Local government expressed interest' },
  'Potential buyers/payors identified': { pt: 'Compradores/pagadores potenciais identificados', en: 'Potential buyers/payors identified' },
  'Co-financing possibility identified': { pt: 'Possibilidade de cofinanciamento identificada', en: 'Co-financing possibility identified' },
  'Scalable beyond one site': { pt: 'Escalável além de um local', en: 'Scalable beyond one site' },
};

/**
 * Write path for a MANUAL edit in the document panel.
 *
 * Now that the panel shows "É da prefeitura, mas a gente usa" instead of
 * `public-informal`, that label is what a person edits — and what would be
 * saved back over the id. The E2 checkpoint machine keys off ids
 * (`pickedFamilias.includes(f.id)`, `E2_ROLES.find(r => …)`), so a label in
 * `nbs_interest` would silently make the multi-pick loop re-offer famílias the
 * org already chose.
 *
 * ⚠️ The two halves of the document canonicalize in OPPOSITE directions, and
 * that is deliberate: org_profile stores the human chip label (see this file's
 * header — the panel, the drawer and the exports all want it), while
 * intervention_site stores machine ids because the checkpoint machine compares
 * against them. So this dispatches rather than picking one rule.
 *
 * Unrecognized input passes through untouched — free text is the user's.
 */
/** The enum options for any section+field, or null when the field is free
 *  text. One lookup for both halves of the document — org_profile and the
 *  SECTION_ENUMS sections — so callers don't have to know which is which. */
export function cboFieldEnumOptions(sectionId: string, field: string): CboEnumOption[] | null {
  if (sectionId === 'org_profile') return ORG_PROFILE_ENUMS[field] ?? null;
  return SECTION_ENUMS[sectionId]?.[field] ?? null;
}

/** True when `value` sits on the closed list for section+field (multi-select:
 *  every part must). Free-text fields are always valid.
 *
 *  ⚠️ Guards the MANUAL edit path. canonicalizeCboFieldValue deliberately lets
 *  unrecognized input pass through — that is right for free text, but on a
 *  closed list it let the profile tab store anything, so the orchestrator could
 *  no longer compare orgs against standard categories (Ana, W2). Callers that
 *  accept a user-supplied value for an enum field must reject on false. */
export function isCanonicalCboFieldValue(sectionId: string, field: string, value: string): boolean {
  const options = cboFieldEnumOptions(sectionId, field);
  if (!options || typeof value !== 'string') return true;
  if (!value.trim()) return true; // clearing a field is allowed
  if (sectionId === 'org_profile') return isCanonicalOrgProfileValue(field, value);
  const parts = value.split(',').map(p => p.trim()).filter(Boolean);
  return parts.length > 0 && parts.every(part => {
    const n = norm(part);
    return options.some(
      o => norm(o.id) === n || norm(o.pt) === n || norm(o.en) === n ||
           (o.aliases ?? []).some(a => norm(a) === n),
    );
  });
}

/** The labels a manual editor should offer for section+field, in one language.
 *  Empty when the field is free text. */
export function cboFieldOptionLabels(sectionId: string, field: string, lang: 'pt' | 'en' = 'pt'): string[] {
  return (cboFieldEnumOptions(sectionId, field) ?? []).map(o => (lang === 'pt' ? o.pt : o.en));
}

/** Multi-select fields store several values in one string. */
export function isMultiValueCboField(sectionId: string, field: string): boolean {
  if (sectionId === 'org_profile') return MULTI_FIELDS.has(field);
  return field === 'nbs_interest' || field === 'site_worry';
}

export function canonicalizeCboFieldValue(sectionId: string, field: string, raw: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return raw;
  if (sectionId === 'org_profile') return canonicalizeOrgProfileValue(field, raw);
  const options = SECTION_ENUMS[sectionId]?.[field];
  if (!options) return raw;
  return raw
    .split(',')
    .map(part => {
      const n = norm(part.trim());
      const hit = options.find(
        o => norm(o.id) === n || norm(o.pt) === n || norm(o.en) === n ||
             (o.aliases ?? []).some(a => norm(a) === n),
      );
      return hit ? hit.id : part.trim();
    })
    .filter(Boolean)
    .join(',');
}
