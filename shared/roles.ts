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
 * Bilingual label pair. `en` and `pt` track the app's current locale set.
 */
export interface LocalizedLabel {
  en: string;
  pt: string;
}

/**
 * The contract every consumer reads from. Changes to this shape are
 * architecture changes — discuss in PR before extending.
 */
export interface RoleConfig {
  /** Role identifier. */
  id: AudienceRole;
  /** Display labels (shown on the landing page, header, etc.). */
  label: LocalizedLabel;
  /** One-line description for the landing-page card. */
  tagline: LocalizedLabel;
  /** Where to route after the role is chosen. */
  entryRoute: string;
  /**
   * If true, this role can use sample data without authenticating (CBO demo).
   * Phase 1 uses this for CBO; phase-3 orchestrator likely flips to false.
   */
  bypassAuth: boolean;
  /** Which project modules appear on the project page, in order. */
  visibleModules: ModuleKey[];
  /**
   * Optional per-module label override. Roles can rebrand module names without
   * a fork — e.g. 'Funder Selection' → 'Funding & Grants' for CBOs. When a
   * module is not in this map, the module's default label is used.
   */
  moduleLabels?: Partial<Record<ModuleKey, LocalizedLabel>>;
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
  /**
   * Optional banner shown at the top of the project page. Used for the CBO
   * demo to set expectations that the sample data belongs to Porto Alegre.
   * `null` for roles that don't need a banner.
   */
  demoBanner: LocalizedLabel | null;
  /**
   * Sample action IDs that should be pre-initiated when this role is chosen
   * on the landing page. Needed for roles whose entryRoute lands directly on
   * a sample project, because the sample-data context only tracks projects
   * that went through the city-information "Start" click (which the CBO
   * demo bypasses). Without this, first-time CBO visitors see
   * "project not found" until they navigate elsewhere and back.
   */
  seedSampleProjects?: string[];
  /**
   * Override for the "Back" link on the project page. City uses the default
   * city-information route (derived from the project's cityId); CBO and
   * Orchestrator should go back to the landing gate instead, since they
   * didn't come through a city selection step.
   */
  projectBackRoute?: string;
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
      en: 'City government preparing a climate project for financing.',
      pt: 'Governo municipal preparando um projeto climático para financiamento.',
    },
    entryRoute: '/login', // OAuth + sample-mode picker lives here; Login auto-redirects to /cities after auth or sample-mode toggle
    bypassAuth: false,
    visibleModules: [
      'siteExplorer',
      'impactModel',
      'funderSelection',
      'operations',
      'businessModel',
    ],
    primaryCta: {
      route: '/concept-note',
      labelKey: 'project.primaryCta.city',
    },
    agent: { skillId: 'concept-note' },
    demoBanner: null,
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
      en: 'Community group building or running a nature-based project.',
      pt: 'Grupo comunitário construindo ou mantendo um projeto de base natural.',
    },
    entryRoute: '/sample/project/sample-ada-1',
    bypassAuth: true,
    // All 5 modules visible, reordered for CBO priority: funding + impact
    // lead (what CBOs care about most), site/operations/business-model trail.
    // Labels are role-branded below.
    visibleModules: [
      'funderSelection',
      'impactModel',
      'siteExplorer',
      'operations',
      'businessModel',
    ],
    moduleLabels: {
      funderSelection: {
        en: 'Funding & Grants',
        pt: 'Financiamento e Editais',
      },
      impactModel: {
        en: 'Our Impact',
        pt: 'Nosso Impacto',
      },
      siteExplorer: {
        en: 'Our Site',
        pt: 'Nosso Território',
      },
      operations: {
        en: 'How We Run It',
        pt: 'Como Gerenciamos',
      },
      businessModel: {
        en: 'Sustainability Model',
        pt: 'Modelo de Sustentabilidade',
      },
    },
    primaryCta: {
      route: '/cbo-profile',
      labelKey: 'project.primaryCta.cbo',
    },
    agent: { skillId: 'cbo-profile' },
    demoBanner: {
      en: 'Demo data based on Porto Alegre. Your project content will be different.',
      pt: 'Dados de demonstração baseados em Porto Alegre. O conteúdo do seu projeto será diferente.',
    },
    seedSampleProjects: ['sample-ada-1'],
    projectBackRoute: '/',
    funders: {
      audience: ['cbo', 'both'],
      questionnaireSteps: [
        // politicalAlignment + institutionalSetup omitted — those steps assume
        // sovereign / MDB-style approval pathways that don't apply to CBOs.
        'projectReadiness',
        'financingNeeds',
      ],
      rankingWeights: {}, // TODO phase-1b: prioritize grants, small ticket size
    },
  },

  orchestrator: {
    id: 'orchestrator',
    label: {
      en: 'Orchestrator',
      pt: 'Organização Articuladora',
    },
    tagline: {
      en: 'Organization coordinating several community-based projects.',
      pt: 'Organização articulando vários projetos de base comunitária.',
    },
    entryRoute: '/orchestrator', // phase-1 ships a "coming soon" stub here
    bypassAuth: true,
    // Phase 3 — real portfolio view. Listed empty until then; the stub page
    // ignores this field.
    visibleModules: [],
    primaryCta: {
      route: '/orchestrator',
      labelKey: 'project.primaryCta.orchestrator', // TODO phase-3
    },
    agent: { skillId: 'portfolio' }, // phase-3 skill, not yet implemented
    demoBanner: null,
    projectBackRoute: '/',
    funders: {
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
