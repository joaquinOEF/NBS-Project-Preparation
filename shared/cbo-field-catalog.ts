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
  'legal_form',
  'year_founded',
  'team_size',
  'paid_vs_volunteer',
  'prior_project_scale',
  'nbs_experience',
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
  paid_vs_volunteer: [
    { id: 'all-volunteer', pt: 'Todas voluntárias', en: 'All volunteers', aliases: ['todos voluntários', 'all volunteer'] },
    { id: 'mostly-volunteer', pt: 'Maioria voluntárias (1–2 pagas)', en: 'Mostly volunteers (1–2 paid)', aliases: ['maioria voluntárias', 'mostly volunteers'] },
    { id: 'half-half', pt: 'Metade e metade', en: 'Half and half', aliases: ['metade', '50/50', 'half half'] },
    { id: 'mostly-paid', pt: 'Maioria pagas', en: 'Mostly paid', aliases: ['maioria remuneradas', 'mostly paid staff'] },
  ],
  prior_project_scale: [
    { id: 'none', pt: 'Nenhum formal ainda', en: 'None formal yet', aliases: ['nenhum', 'none yet', 'no formal projects'] },
    { id: 'ad-hoc', pt: 'Atividades pontuais', en: 'Ad-hoc activities', aliases: ['adhoc', 'pontuais', 'one-off activities'] },
    { id: 'funded', pt: 'Projeto com financiamento', en: 'Funded project', aliases: ['projeto financiado', 'com financiamento'] },
    { id: 'partnership', pt: 'Parceria com órgão público / fundação', en: 'Partnership with public agency / foundation', aliases: ['parceria', 'partnership with public agency'] },
  ],
  nbs_experience: [
    { id: 'none', pt: 'Ainda não', en: 'Not yet', aliases: ['nenhuma', 'ainda nao'] },
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

/** groups_served is a multi-select stored as one string — split on the
 *  separators the agent/chips produce, map each item independently. */
const MULTI_FIELDS = new Set(['groups_served']);
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

/** Read path: render any stored form (including legacy machine ids already in
 *  the database) as the viewer-language label. */
export function orgProfileDisplayValue(field: string, stored: string, lang: 'pt' | 'en'): string {
  if (typeof stored !== 'string' || !ORG_PROFILE_ENUMS[field]) return stored;
  return mapValue(field, stored, opt => (lang === 'pt' ? opt.pt : opt.en));
}
