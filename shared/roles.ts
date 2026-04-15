/**
 * Role / Audience Architecture — see docs/ROLE-ARCHITECTURE.md
 *
 * A `role` is the audience persona of the current user. It is a cross-cutting
 * parameter that varies the app's behavior: which modules are visible, which
 * agent skill is primary, which funders are eligible, etc.
 *
 * Roles are distinct from **skills** (see docs/modular-agent-architecture.md).
 * A skill is what the agent does (e.g. `concept-note`, `cbo-profile`).
 * A role picks which skill is primary and how the rest of the app is framed.
 *
 * This file is the single source of truth for role-dependent behavior.
 * Consumers MUST read from `ROLE_CONFIGS[role]` rather than branching on the
 * role string in their own code.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AudienceRole = 'city' | 'cbo' | 'orchestrator';

/**
 * Keys for the project-preparation modules that appear on the project page.
 * Extend when a new module is added.
 */
export type ModuleKey =
  | 'funderSelection'
  | 'siteExplorer'
  | 'impactModel'
  | 'operations'
  | 'businessModel';

/**
 * Funder audience tag used on entries in `client/public/sample-data/climate-funds.json`
 * and for filtering in the funder-selection module.
 */
export type FunderAudience = 'city' | 'cbo' | 'both';

/**
 * Questionnaire step IDs in funder-selection. Kept as a string literal union
 * so `RoleConfig` can declare which subset of steps applies per role without
 * pulling in the component code.
 */
export type FunderQuestionnaireStepKey =
  | 'projectReadiness'
  | 'politicalAlignment'
  | 'financingNeeds'
  | 'institutionalSetup';

/**
 * Skill IDs from the agent framework (see docs/modular-agent-architecture.md).
 * Until skills are extracted, these map 1:1 to the current agent services
 * (`conceptNoteAgent.ts`, `cboAgent.ts`). The `portfolio` skill is a phase-3
 * placeholder for the orchestrator view and does NOT exist yet.
 */
export type SkillKey = 'concept-note' | 'cbo-profile' | 'portfolio';

/**
 * The contract every consumer reads from. Changes to this shape are
 * architecture changes — discuss in PR before extending.
 */
export interface RoleConfig {
  /** Role identifier. */
  id: AudienceRole;
  /** Display labels (shown on the landing page, header, etc.). */
  label: { en: string; pt: string };
  /** One-line description for the landing-page card. */
  tagline: { en: string; pt: string };
  /** Where to route after the role is chosen. */
  entryRoute: string;
  /**
   * If true, this role can use sample data without authenticating (CBO demo).
   * Phase 1 uses this for CBO; phase-3 orchestrator likely flips to false.
   */
  bypassAuth: boolean;
  /** Which project modules appear on the project page, in order. */
  visibleModules: ModuleKey[];
  /** Hero call-to-action on the project page (Concept Note vs CBO Profile vs …). */
  primaryCta: {
    /** Route to navigate to (sample-prefix is applied by caller if needed). */
    route: string;
    /** i18n key for the button label. */
    labelKey: string;
  };
  /** Which agent skill this role's primary CTA opens. */
  agent: {
    skillId: SkillKey;
  };
  /** How the funder-selection module behaves for this role. */
  funders: {
    /** Values to accept when filtering `climate-funds.json[].audience`. */
    audience: FunderAudience[];
    /** Subset of questionnaire steps shown. */
    questionnaireSteps: FunderQuestionnaireStepKey[];
    /**
     * Ranking weights applied on top of base fund ranking. Empty object means
     * use defaults. Concrete weights will land in phase 1.
     */
    rankingWeights: Record<string, number>;
  };
}

// ---------------------------------------------------------------------------
// ROLE_CONFIGS — populated in Phase 1
// ---------------------------------------------------------------------------

/**
 * Phase 0 scaffold. Fields marked `// TODO phase-1` are intentionally empty
 * or placeholder — they will be filled in as each module is role-enabled.
 * Consumers should NOT branch on `role === 'city'`; they should read the
 * relevant field from `ROLE_CONFIGS[role]`.
 */
export const ROLE_CONFIGS: Record<AudienceRole, RoleConfig> = {
  city: {
    id: 'city',
    label: { en: 'City', pt: 'Cidade' },
    tagline: {
      en: 'I work for a city government preparing a climate project.',
      pt: 'Trabalho em um governo municipal preparando um projeto climático.',
    },
    entryRoute: '/cities', // existing city selection flow
    bypassAuth: false,
    visibleModules: [
      'funderSelection',
      'siteExplorer',
      'impactModel',
      'operations',
      'businessModel',
    ],
    primaryCta: {
      route: '/concept-note', // TODO phase-1: confirm sample-prefix handling
      labelKey: 'project.primaryCta.city', // TODO phase-1: add to locales
    },
    agent: { skillId: 'concept-note' },
    funders: {
      audience: ['city', 'both'],
      questionnaireSteps: [
        'projectReadiness',
        'politicalAlignment',
        'financingNeeds',
        'institutionalSetup',
      ],
      rankingWeights: {}, // defaults
    },
  },

  cbo: {
    id: 'cbo',
    label: {
      en: 'Community-Based Organization',
      pt: 'Organização de Base Comunitária',
    },
    tagline: {
      en: 'We are a community organization building or running a nature-based project.',
      pt: 'Somos uma organização comunitária construindo ou mantendo um projeto de base natural.',
    },
    entryRoute: '/sample/project/sample-ada-1', // direct into NBS sample
    bypassAuth: true,
    visibleModules: [
      // TODO phase-1: confirm which modules make sense; operations + businessModel
      // are likely out-of-scope for CBO MVP.
      'funderSelection',
      'siteExplorer',
      'impactModel',
    ],
    primaryCta: {
      route: '/cbo-profile',
      labelKey: 'project.primaryCta.cbo', // TODO phase-1: add to locales
    },
    agent: { skillId: 'cbo-profile' },
    funders: {
      audience: ['cbo', 'both'],
      questionnaireSteps: [
        // TODO phase-1: confirm with Villa Flores which questionnaire steps
        // are meaningful for a CBO. politicalAlignment + institutionalSetup
        // are probably out.
        'projectReadiness',
        'financingNeeds',
      ],
      rankingWeights: {}, // TODO phase-1: prioritize grants, small ticket size
    },
  },

  orchestrator: {
    id: 'orchestrator',
    label: {
      en: 'Orchestrator',
      pt: 'Organização Articuladora',
    },
    tagline: {
      en: 'I coordinate several community organizations implementing nature-based projects.',
      pt: 'Coordeno várias organizações comunitárias implementando projetos de base natural.',
    },
    entryRoute: '/orchestrator', // phase-1 ships a "coming soon" stub here
    bypassAuth: true,
    // Phase 3 — real portfolio view. Listed empty until then; the stub page
    // ignores this field.
    visibleModules: [],
    primaryCta: {
      route: '/orchestrator', // stub self-route
      labelKey: 'project.primaryCta.orchestrator', // TODO phase-3
    },
    agent: { skillId: 'portfolio' }, // phase-3 skill, not yet implemented
    funders: {
      // Orchestrators likely want a union view — defer until phase 3.
      audience: ['city', 'cbo', 'both'],
      questionnaireSteps: [],
      rankingWeights: {},
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Narrow an unknown string (e.g. a URL query param) to a valid AudienceRole.
 * Returns `null` if the value isn't a known role.
 */
export function parseRole(raw: unknown): AudienceRole | null {
  if (raw === 'city' || raw === 'cbo' || raw === 'orchestrator') return raw;
  return null;
}
