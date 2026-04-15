# Role / Audience Architecture

Status: contract established (Phase 0). Consumers being migrated in Phase 1.

## Why this document exists

The app serves multiple audiences — city governments, community-based organizations (CBOs), and organizations that coordinate CBOs ("orchestrators" such as Villa Flores). Each audience needs a different framing of the same underlying NBS project-preparation flow:

- Different primary goal (concept note for financing vs CBO maturity profile vs portfolio overview).
- Different funder universe (MDB loans vs small grants).
- Different module visibility (cities care about operating models and revenue stacks; CBOs mostly don't).
- Different entry path (OAuth + city picker vs direct-to-sample CBO demo).

We are **one product**, not three. Forking components / services / knowledge trees per audience would compound the same dedup problem already called out for agent skills in `docs/modular-agent-architecture.md`.

## The rule

> **Role is a cross-cutting parameter, not a code fork.**
>
> Behavior that varies by role lives in *config/data* — specifically in `shared/roles.ts` via `ROLE_CONFIGS[role]`. Components, agents, module pages, knowledge files, and tools are written **once** and parameterized by role.
>
> If you are about to write `if (role === 'cbo') <ComponentA /> else <ComponentB />`, stop and make it `<Component config={useRoleConfig()} />`.
> If you are about to add a `cityFunderSelection.tsx` alongside a `cboFunderSelection.tsx`, stop — extend `climate-funds.json` with an `audience` tag instead.

### Right way / wrong way

```tsx
// ❌ WRONG — role becomes a component-level conditional
function ProjectPageCTA() {
  const { role } = useRoleContext();
  if (role === 'city') return <Button href="/concept-note">Generate Concept Note</Button>;
  if (role === 'cbo')  return <Button href="/cbo-profile">Start CBO Profile</Button>;
  return null;
}

// ✅ RIGHT — role drives config; component is parameterized
function ProjectPageCTA() {
  const config = useRoleConfig();
  return (
    <Button href={config.primaryCta.route}>
      {t(config.primaryCta.labelKey)}
    </Button>
  );
}
```

```ts
// ❌ WRONG — two datasets, drift guaranteed
import cityFunds from './city-funds.json';
import cboFunds from './cbo-funds.json';
const funds = role === 'cbo' ? cboFunds : cityFunds;

// ✅ RIGHT — one dataset with an audience tag
import funds from './climate-funds.json';
const config = ROLE_CONFIGS[role];
const eligible = funds.filter(f =>
  f.audience.some(a => config.funders.audience.includes(a))
);
```

### Legitimate exceptions

Not every audience variation is a component conditional. Some are **genuinely different screens**:

- The orchestrator portfolio page is a dashboard, not a project page. It legitimately lives at a different route with a different top-level layout.
- The city landing flow starts on `/cities`; the CBO demo goes straight to `sample-ada-1`.

Even in those cases, shared primitives should still be reused: cards, badges, progress meters, the agent drawer. The line is at **page/screen composition**, not at primitive components.

## Relationship to `docs/modular-agent-architecture.md`

Roles and skills are **orthogonal**:

| Concept | What it answers | Source of truth | Examples |
|--------|-----------------|-----------------|----------|
| **Role** | Who is the user? | `shared/roles.ts` → `ROLE_CONFIGS` | `city`, `cbo`, `orchestrator` |
| **Skill** | What is the agent doing right now? | `server/skills/*.skill.ts` (future; see the skill doc) | `concept-note`, `cbo-profile`, future `feasibility-study` |

A role *picks a primary skill* via `RoleConfig.agent.skillId`, but a role is not a skill:
- A city user using the concept-note skill is different from a CBO user browsing a concept note — same skill, different framing.
- A future "feasibility study" skill could be available to both cities and CBOs.
- The orchestrator role maps to a future `portfolio` skill that doesn't exist yet.

**When in doubt**: if the variation is in "what the agent does," it belongs in the skill definition. If it's in "how the rest of the app is framed around the user," it belongs in the role config.

## The contract

See `shared/roles.ts` for the authoritative TypeScript. Summary:

```ts
interface RoleConfig {
  id: AudienceRole;
  label:  { en: string; pt: string };
  tagline:{ en: string; pt: string };
  entryRoute: string;           // where to go from the landing page
  bypassAuth: boolean;          // CBO demo can skip auth
  visibleModules: ModuleKey[];  // which cards show on the project page
  primaryCta: { route: string; labelKey: string };
  agent: { skillId: SkillKey };
  funders: {
    audience: FunderAudience[];                 // which funds are eligible
    questionnaireSteps: FunderQuestionnaireStepKey[];
    rankingWeights: Record<string, number>;
  };
}

const ROLE_CONFIGS: Record<AudienceRole, RoleConfig> = { city, cbo, orchestrator };
```

## Where role gets set

1. **URL query param `?role=cbo`** — wins if present. Shareable deep-links use this.
2. **`localStorage.nbs_user_role`** — persisted across sessions after first selection.
3. **Landing page** (`/` when role is unset) — user picks via a 3-card chooser, we set both localStorage and URL.

A single `RoleProvider` (Phase 1) hydrates the role from (1) → (2) → fallback to `null` (show the gate).

## File-layout conventions

| Where | What lives there |
|-------|------------------|
| `shared/roles.ts` | `AudienceRole`, `RoleConfig`, `ROLE_CONFIGS`, `parseRole()` |
| `client/src/core/contexts/role-context.tsx` | `RoleProvider`, `useRoleContext()`, `useRoleConfig()` (Phase 1) |
| `client/src/core/pages/role-selection.tsx` | Landing page with 3-card chooser (Phase 1) |
| `client/src/core/pages/orchestrator-landing.tsx` | Phase-1 "coming soon" stub |
| `client/public/sample-data/climate-funds.json` | Funds carry `audience: FunderAudience[]` |
| `client/src/core/locales/{en,pt}.json` | All role-facing strings |

## Migration plan

### Phase 0 — this PR (contract only, no behavior change)

- `shared/roles.ts` scaffold with stubbed `ROLE_CONFIGS`.
- This doc.
- Pointer from `CLAUDE.md`.

### Phase 1 — Villa Flores MVP

Ship the CBO path end-to-end using `ROLE_CONFIGS`. Every role-dependent call site reads from config.

- `RoleProvider` + `useRoleConfig()`.
- Landing page + orchestrator stub.
- Project page: CTA and module visibility driven by config.
- Funder-selection: filter by `config.funders.audience`; restrict questionnaire to `config.funders.questionnaireSteps`.
- `climate-funds.json`: add `audience` tag to every fund; add CBO-relevant grants (Teia da Sociobiodiversidade, Fundo Casa RS, GEF SGP, Petrobras NBS Urbano) in the same file.
- `conceptNoteAgent` / `cboAgent` stay as-is — their URLs are referenced via `config.primaryCta.route`.

### Phase 2 — agent framework unification

Follow `docs/modular-agent-architecture.md` exactly. `config.agent.skillId` starts pointing at real skill definitions instead of current forked services. Old agent routes become shims and are eventually deleted.

### Phase 3 — orchestrator

Real portfolio view + `portfolio` skill. Orchestrator's `RoleConfig` fields fill in; the same `useRoleConfig()` consumers work unchanged.

## Success criteria

- [ ] A new role-dependent behavior is added by editing `ROLE_CONFIGS` — zero new `if (role === …)` conditionals at call sites.
- [ ] Adding a new audience (e.g., academic researcher) is a ~1-file change: add an entry to `ROLE_CONFIGS`, add an entry on the landing page.
- [ ] A reviewer can reject any PR that forks a component per role by pointing at this doc.
- [ ] No parallel `cityX.ts` + `cboX.ts` files introduced after Phase 1.

## Anti-patterns to watch for in code review

- `if (role === 'city')` or `role === 'cbo'` checks in components. Push the variation into `RoleConfig`.
- New `*.json` data files keyed by role. Use tags / filters on a single file instead.
- New pages/routes whose name includes a role (`cbo-*.tsx`). The orchestrator dashboard is a legitimate exception because it's a different screen; most other cases aren't.
- Duplicated helpers (e.g., `rankFundsForCity` + `rankFundsForCbo`). Parameterize the helper with the role's config fields.

## Related

- `docs/modular-agent-architecture.md` — skill-level modularity (agent engine, micro-apps, knowledge base).
- `docs/callback-stability-patterns.md` — hydration / callback anti-patterns that interact with context.
- `client/src/core/hooks/useNavigationPersistence.ts` — JSDoc explains the persisted-state swap loop, a nearby concern that applies to any role-aware persistence we add.
