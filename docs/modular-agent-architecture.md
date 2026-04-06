# Modular Agent Architecture

## The Problem

We have two agent systems that do 80% the same thing:

| Aspect | Concept Note Agent | CBO Agent |
|--------|-------------------|-----------|
| Server | `conceptNoteAgent.ts` (939 lines) | `cboAgent.ts` (515 lines) |
| Client | `concept-note.tsx` (1,445 lines) | `cbo-profile.tsx` (706 lines) |
| Schema | `concept-note-schema.ts` (219 lines) | `cbo-schema.ts` (152 lines) |
| Purpose | Fill a BPJP concept note (27 sections) | Build a CBO intervention profile (5 sections + maturity) |
| **Total** | **~2,600 lines** | **~1,370 lines** |

Both share the **exact same patterns**:
- SDK loading (lazy import of `@anthropic-ai/claude-agent-sdk`)
- MCP tool creation (`sdkTool` + `sdkCreateMcpServer`)
- SSE streaming (`res.write` event stream with `pushEvent`)
- State stores (in-memory `Map<string, State>`)
- Core tools: `update_section`, `flag_gap`, `set_phase`, `ask_user`, `open_map`, `read_knowledge`
- Knowledge loading (city context + knowledge folders)
- Client: chat UI, question rendering, keyboard nav, map microapp integration, `formatMapResult`, `handleSelectOption`

Every fix (keyboard nav, map tooltips, zone data flow) requires changes in **both** files.

## The Vision

One engine. Multiple skills. Everything the user sees is a micro-app.

```
                    ┌─────────────────────────────────┐
                    │          Agent Engine             │
                    │   (SDK, streaming, state, tools)  │
                    └──────────┬──────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        ┌─────┴──────┐  ┌─────┴──────┐  ┌──────┴───────┐
        │  Concept    │  │    CBO     │  │   Future:    │
        │  Note Skill │  │  Profile   │  │  Feasibility │
        │  (.md+.ts)  │  │  Skill     │  │  Study Skill │
        └─────┬──────┘  └─────┬──────┘  └──────┬───────┘
              │                │                │
              └────────────────┼────────────────┘
                               │
        ┌──────────┬───────────┼───────────┬──────────┐
        │          │           │           │          │
   ┌────┴────┐ ┌───┴───┐ ┌────┴─────┐ ┌───┴────┐ ┌───┴───┐
   │   Map   │ │ Ques- │ │ Document │ │ Score- │ │ Chat  │
   │ Microapp│ │ tions │ │   Form   │ │  card  │ │  UI   │
   └─────────┘ └───────┘ └──────────┘ └────────┘ └───────┘
                     Micro-Apps
           (all parameterized, all skill-agnostic)
```

## Core Principle: Everything is a Micro-App

The agent doesn't render UI directly. It invokes **micro-apps** via tools, and the client renders them. Every piece of UI the user interacts with is a micro-app:

| Micro-App | Invoked by | What it does | Skill-agnostic? |
|-----------|-----------|-------------|----------------|
| **Map** | `open_map` tool | Spatial selection (zones, assets, sample) | Yes — parameterized by selection mode, layers, zone source |
| **Questions** | `ask_user` tool | Multiple-choice decisions with keyboard nav | Yes — parameterized by questions array, multiSelect |
| **Document Form** | Skill config (always visible) | Schema-driven section/field editor | Yes — parameterized by skill's `sections[]` schema |
| **Scorecard** | `score_maturity` tool (CBO only) | Maturity radar + priority flags | Yes — parameterized by metrics + flags |
| **Chat** | Engine (always visible) | Message stream + input | Yes — shared across all skills |

**Key insight**: The document panel is not special — it's a micro-app parameterized by the skill's section schema. The scorecard is another micro-app. A future skill could add a "timeline" or "budget calculator" micro-app without touching the engine.

## Architecture

### Layer 1: Agent Engine (shared core)

**What it does**: SDK loading, SSE streaming, state management, core tool registration, message history, knowledge loading.

**One file**: `server/services/agentEngine.ts`

```typescript
interface AgentEngineConfig {
  id: string;                          // Session ID
  skill: SkillDefinition;             // What the agent does
  state: AgentState;                   // Current state (generic)
}

// The engine provides 6 core tools to ALL skills:
// 1. update_section(sectionId, field, value, confidence, source)
// 2. flag_gap(sectionId, field, reason, severity)
// 3. set_phase(phase)
// 4. ask_user(questions[])
// 5. open_map(params)
// 6. read_knowledge(folder, file)

// Skills register ADDITIONAL tools via extraTools[]
// Engine creates the MCP server combining core + extra tools

async function streamAgentChat(config: AgentEngineConfig, userMessage: string, res: Response) {
  // 1. Load SDK (cached)
  // 2. Build system prompt from skill's .md template + knowledge
  // 3. Create MCP server with core tools + skill's extra tools
  // 4. Stream via sdk.query() with SSE pushEvent
  // 5. Process messages, dispatch to event handlers
}
```

### Layer 2: Skill Definitions (what varies)

Each skill is a **config object + a system prompt markdown file**. Not a separate codebase.

**File structure**:
```
server/
  skills/
    prompts/
      concept-note.system.md       # System prompt (persona, behavior, phases)
      cbo-profile.system.md        # System prompt (persona, behavior, phases)
      _shared/
        tool-docs.md               # Shared tool documentation
        map-recipes.md             # Map invocation recipes
        language-rules.md          # Language/i18n rules
        file-drop-rules.md         # How to handle document uploads
    concept-note.skill.ts          # Skill definition (config only)
    cbo-profile.skill.ts           # Skill definition (config only)
```

**Why markdown for prompts**: System prompts are the most frequently edited part of the system. Keeping them in `.md` files makes them easy to review, diff, and iterate on without touching TypeScript. Shared fragments (`_shared/`) are composed by the engine at runtime.

**Skill definition example**:
```typescript
// server/skills/cbo-profile.skill.ts
import { defineSkill } from '../services/agentEngine';

export const cboProfileSkill = defineSkill({
  // Identity
  name: 'cbo_profile',
  displayName: 'CBO Intervention Profile',
  mcpServerName: 'cbo',

  // System prompt — assembled from .md files
  promptFile: 'server/skills/prompts/cbo-profile.system.md',
  sharedPromptFragments: [
    'server/skills/prompts/_shared/tool-docs.md',
    'server/skills/prompts/_shared/map-recipes.md',
    'server/skills/prompts/_shared/language-rules.md',
    'server/skills/prompts/_shared/file-drop-rules.md',
  ],

  // Document schema (drives the Document Form micro-app)
  sections: [
    {
      id: 'org_profile',
      label: 'Organization Profile',
      fields: [
        { name: 'org_name', type: 'text', label: 'Organization Name' },
        { name: 'org_type', type: 'select', label: 'Type', options: ['NGO', 'CBO', 'Cooperative'] },
        { name: 'mission', type: 'multiline', label: 'Mission Statement' },
        // ...
      ],
    },
    // ... 4 more sections
  ],

  // Interview phases
  phases: [
    { number: 1, name: 'Who You Are', description: 'Organization identity and team' },
    { number: 2, name: 'Where You Work', description: 'Geography and community context' },
    { number: 3, name: 'What You Are Doing', description: 'Intervention details' },
    { number: 4, name: 'What You Need', description: 'Gaps, needs, support required' },
    { number: 5, name: 'What You Have Achieved', description: 'Results and evidence' },
    { number: 6, name: 'Maturity Assessment', description: 'Final scoring and recommendations' },
  ],

  // Knowledge
  knowledgeFolders: ['_interventions', '_co-benefits', '_cougar'],
  skillFlowFile: '.claude/commands/cbo-intervention.md',

  // Micro-apps this skill uses
  microApps: [
    { type: 'document-form', position: 'sidebar', config: { /* uses sections above */ } },
    { type: 'scorecard', position: 'sidebar-tab', config: {
      metrics: ['problem_clarity', 'climate_nbs_impact', 'solution_clarity', /* ... */],
      maxScore: 3,
      flags: ['existing_budget', 'government_support', 'community_engagement', /* ... */],
    }},
  ],

  // Extra tools (beyond the 6 core tools)
  extraTools: [
    {
      name: 'score_maturity',
      description: 'Score a COUGAR maturity metric (0-3)',
      schema: { metric: z.string(), score: z.number().min(0).max(3), justification: z.string() },
      handler: async (args, state, pushEvent) => { /* ... */ },
    },
    {
      name: 'set_priority_flag',
      description: 'Set a priority flag (met/not met)',
      schema: { flag: z.string(), met: z.boolean(), notes: z.string().optional() },
      handler: async (args, state, pushEvent) => { /* ... */ },
    },
  ],
});
```

### Layer 3: Micro-Apps (shared, parameterized UI)

Every micro-app follows the same contract:

```typescript
interface MicroApp<TParams, TResult> {
  type: string;                        // 'map' | 'questions' | 'document-form' | 'scorecard'
  position: 'overlay' | 'sidebar' | 'sidebar-tab' | 'inline';
  render(params: TParams): React.ReactNode;
  onResult?(result: TResult): void;    // Callback when user completes interaction
}
```

#### Map Micro-App
Already well-parameterized. No changes needed.

```typescript
// Invoked by: open_map tool
// Params: OpenMapParams (selectionMode, layers, tileLayers, zoneSource, prompt)
// Returns: MapSelectionResult (selectedAssets[], sampledPoints[])
// Position: overlay (replaces main content temporarily)
```

**Recipes** (named presets agents can reference):
| Recipe | Mode | Layers | Use case |
|--------|------|--------|----------|
| `neighborhood_selection` | composite | osm_parks, osm_schools, osm_wetlands + FRI, HWM | CBO Phase 2 |
| `site_selection` | assets | osm_parks, osm_wetlands + DW, FRI | CBO Phase 3 |
| `zone_overview` | zones | FRI, HWM | Concept Note Phase 2 |
| `evidence_check` | sample | FRI, HWM, DEM | Environmental analysis |

#### Questions Micro-App
Currently `QuestionCard` / `CboQuestionCard` — to be unified as `AgentQuestionCard`.

```typescript
// Invoked by: ask_user tool
// Params: AgentQuestion[] (question, options[], multiSelect, relatedSections)
// Returns: string (selected option label, or comma-joined for multiSelect)
// Position: inline (in chat flow)
```

#### Document Form Micro-App
Currently the concept note and CBO document panels — to be unified as a schema-driven renderer.

```typescript
// Invoked by: skill config (always visible)
// Params: SectionDefinition[] (from skill's sections)
// Renders: editable fields grouped by section, confidence badges, gap indicators
// Position: sidebar
// Events: update_section dispatches field_update events to update the form
```

The key insight: the form doesn't need to know about "GCF sections" or "CBO profiles." It receives a `sections[]` schema and renders fields. The field types (`text`, `number`, `multiline`, `select`) determine the input component. Confidence badges and gap markers are universal.

#### Scorecard Micro-App
Currently CBO-only. But could be useful for future skills (feasibility study maturity, project readiness score).

```typescript
// Invoked by: score_maturity tool (skill-specific)
// Params: ScorecardConfig (metrics[], maxScore, flags[])
// Renders: radar chart + flag checklist
// Position: sidebar-tab (tab next to document form)
```

### Layer 4: Knowledge Base

Organized by **scope**, not by skill:

```
knowledge/
  {city}/                      # City-specific (Porto Alegre, etc.)
    city-profile.md
    climate-risks.md
    stakeholders.md
    regulatory-context.md
    existing-plans.md
    local-precedents.md
    baseline-data.md
  _interventions/              # NBS intervention details (shared)
    flood-parks.md
    green-corridors.md
    bioswales-rain-gardens.md
    green-roofs-walls.md
    urban-forests.md
    wetland-restoration.md
  _co-benefits/                # Co-benefit evidence
  _financing-sources/          # Funding sources (concept note needs)
  _evidence/                   # Climate evidence
  _success-cases/              # Case studies
  _cougar/                     # COUGAR/NBS mapping criteria (CBO needs)
  _templates/                  # Output templates
```

**How skills access knowledge**:
1. **Preloaded**: Engine loads city + skill's `knowledgeFolders` into system prompt (truncated to ~1500 chars/file)
2. **On-demand**: `read_knowledge(folder, file)` tool gives full content
3. **Listing**: Available files are shown in system prompt so the agent knows what to request

**Guidelines for knowledge authors**:
- City data in `knowledge/{city}/`. One file per topic.
- Domain knowledge in `knowledge/_topic/`. Shared across skills that declare the folder.
- Markdown with YAML frontmatter. Engine strips frontmatter before sending.
- Keep under 4KB for efficient preloading.
- Name files descriptively — the agent sees filenames when deciding what to read.

## Current Duplication Audit

### Server-side

| Pattern | conceptNoteAgent.ts | cboAgent.ts | Action |
|---------|-------------------|-------------|--------|
| SDK loading | Lines 15-51 | Lines 18-37 | **Extract** to engine |
| State stores | Lines 53-70 | Lines 45-61 | **Extract** generic `AgentStateStore<T>` |
| Tool: `update_section` | Lines 127-156 | Lines 80-105 | **Extract** parameterized by sections |
| Tool: `flag_gap` | Lines 159-172 | Lines 107-120 | **Extract** identical |
| Tool: `set_phase` | Lines 174-187 | Lines 122-135 | **Extract** identical |
| Tool: `ask_user` | Lines 189-213 | Lines 137-156 | **Extract** identical |
| Tool: `open_map` | Lines 215-261 | Lines 158-205 | **Extract** identical |
| Tool: `read_knowledge` | Lines 263-283 | Lines 248-264 | **Extract** identical |
| MCP server creation | Lines 285-290 | Lines 266-271 | **Extract** engine creates from skill config |
| SSE streaming | Lines 308-382 | Lines 287-359 | **Extract** generic `streamAgentChat()` |
| Knowledge loading | Lines 890-917 | Lines 400-435 | **Extract** parameterized by folder list |
| System prompt | Lines 788-887 | Lines 391-500 | **Move** to `.md` files |
| Tool: `score_maturity` | _(n/a)_ | Lines 207-226 | **Keep** in CBO skill as `extraTool` |
| Tool: `set_priority_flag` | _(n/a)_ | Lines 228-246 | **Keep** in CBO skill as `extraTool` |

**Result**: ~600 lines of duplicated code becomes ~300 lines of engine + ~100 lines per skill definition.

### Client-side

| Pattern | concept-note.tsx | cbo-profile.tsx | Action |
|---------|-----------------|----------------|--------|
| `formatMapResult()` | Lines 18-30 | Lines 34-48 | **Extract** shared utility |
| `QuestionCard` | Lines 1121-1220 | Lines 627-704 | **Extract** `AgentQuestionCard` |
| Keyboard nav | Lines 233-310 | Lines 152-209 | **Extract** `useAgentKeyboardNav()` hook |
| SSE processing | Lines 350-500 | Lines 212-260 | **Extract** `useAgentSSE()` hook |
| Chat messages | Lines 700-900 | Lines 370-440 | **Extract** `AgentChatMessages` |
| Map integration | Lines 950-1000 | Lines 540-570 | **Extract** `AgentMapPanel` |
| Input form | Lines 1000-1050 | Lines 455-480 | **Extract** `AgentInput` |
| Document panel | Lines 1050-1120 | Lines 490-625 | **Unify** as schema-driven `DocumentForm` micro-app |

**Result**: ~1,500 lines of duplicated client code becomes ~600 lines of shared components. Each page becomes a thin composition of micro-apps.

## Migration Plan

### Phase 1: Extract Shared Client Components

**Risk**: Low. **Value**: High (immediate dedup, fixes apply once).

1. **`client/src/core/components/agent/AgentQuestionCard.tsx`**
   - Merge `QuestionCard` + `CboQuestionCard`
   - Props: `question`, `selectedIdx`, `multiSelected`, `onSelect`, `onMultiToggle`, `onMultiConfirm`, `disabled`, `answeredValue`

2. **`client/src/core/components/agent/useAgentKeyboardNav.ts`**
   - Arrow keys, Enter, Tab, letter keys
   - Handles single-select + multi-select + input focus transition

3. **`client/src/core/components/agent/formatMapResult.ts`**
   - Shared utility for formatting map selection into agent message
   - Handles `populationTotal` vs `populationSum`, poverty, priority, landslide

4. **`client/src/core/components/agent/AgentChatMessages.tsx`**
   - Message list rendering (thinking vs content, markdown, timestamps)

5. **`client/src/core/components/agent/AgentInput.tsx`**
   - Chat input form with file drop support

6. **Update** `concept-note.tsx` and `cbo-profile.tsx` to import shared components

**Deliverable**: Both pages work identically but share components. Any bug fix touches one file.

### Phase 2: Extract Agent Engine (server)

**Risk**: Medium. **Value**: Foundational (no more duplicated tools/streaming).

1. **`server/services/agentEngine.ts`**
   - `loadSdk()` — cached SDK loading
   - `AgentStateStore<T>` — generic in-memory state
   - `createCoreTools(id, state, pushEvent)` — 6 core tools
   - `buildSystemPrompt(skill, state)` — assemble from .md files + knowledge
   - `streamAgentChat(config, userMessage, res)` — SSE streaming loop

2. **`server/skills/prompts/`** — system prompts as markdown
   - `concept-note.system.md` — persona, behavior, phase guide
   - `cbo-profile.system.md` — persona, behavior, phase guide
   - `_shared/tool-docs.md` — tool documentation (shared)
   - `_shared/map-recipes.md` — map invocation recipes (shared)
   - `_shared/language-rules.md` — i18n rules (shared)

3. **`server/skills/concept-note.skill.ts`** — config only (~80 lines)
4. **`server/skills/cbo-profile.skill.ts`** — config + 2 extra tools (~120 lines)

5. **Thin wrappers** — existing agent files become 5-line imports:
   ```typescript
   // server/services/conceptNoteAgent.ts (after)
   import { streamAgentChat } from './agentEngine';
   import { conceptNoteSkill } from '../skills/concept-note.skill';

   export async function streamConceptNoteChat(noteId, userMessage, res, state) {
     return streamAgentChat({ id: noteId, skill: conceptNoteSkill, state }, userMessage, res);
   }
   ```

**Deliverable**: Both agents run through one engine. Adding a new skill = one `.skill.ts` + one `.system.md`.

### Phase 3: Schema-Driven Document Form + Unified Workspace

**Risk**: Medium-high. **Value**: True modularity.

1. **`client/src/core/components/agent/DocumentForm.tsx`**
   - Schema-driven section/field renderer
   - Field types: `text`, `number`, `multiline`, `select`
   - Confidence badges, gap indicators, user edit support
   - Section grouping and navigation

2. **`client/src/core/components/agent/ScorecardPanel.tsx`**
   - Radar chart + flag checklist (currently CBO-only, but reusable)

3. **`client/src/core/components/agent/AgentWorkspace.tsx`**
   - Unified page shell: chat panel + micro-app sidebar
   - Skill config determines which micro-apps appear in which positions
   ```tsx
   <AgentWorkspace skill={skill} state={state}>
     {/* Micro-apps auto-rendered based on skill.microApps config */}
   </AgentWorkspace>
   ```

4. **Reduce** `concept-note.tsx` and `cbo-profile.tsx` to route wrappers:
   ```tsx
   export default function ConceptNotePage() {
     const skill = useSkill('concept_note');
     return <AgentWorkspace skill={skill} />;
   }
   ```

**Deliverable**: Adding a new skill = `.skill.ts` + `.system.md`. No new page, no new components.

## Adding a New Skill (end state)

After all 3 phases, adding a "Feasibility Study" skill:

1. Create `server/skills/feasibility-study.skill.ts`:
   ```typescript
   export const feasibilityStudySkill = defineSkill({
     name: 'feasibility_study',
     displayName: 'Feasibility Study',
     promptFile: 'server/skills/prompts/feasibility-study.system.md',
     sections: [ /* cost-benefit, risk analysis, timeline, etc. */ ],
     phases: [ /* scoping, analysis, recommendations */ ],
     knowledgeFolders: ['_financing-sources', '_evidence', '_success-cases'],
     microApps: [
       { type: 'document-form', position: 'sidebar' },
       { type: 'scorecard', position: 'sidebar-tab', config: { metrics: ['financial_viability', 'technical_feasibility', ...] } },
     ],
     // No extra tools — uses only the 6 core tools
   });
   ```

2. Create `server/skills/prompts/feasibility-study.system.md` — the agent's persona and behavior

3. Add a route in `server/routes.ts`

4. Add a page entry (one-liner using `<AgentWorkspace>`)

**That's it.** No new streaming code, no new tool definitions, no new QuestionCard, no new keyboard nav.

## What Stays Separate (by design)

| Thing | Why |
|-------|-----|
| System prompts (.md files) | Persona, tone, behavior rules ARE the skill. This is the core differentiator. |
| Section schemas | Fields are fundamentally different per output document |
| Phase definitions | Interview flow is skill-specific |
| Extra tools | Only some skills need scoring/flagging |
| Knowledge folder selection | Different skills need different domain knowledge |

## Success Criteria

- [ ] Fix a bug in QuestionCard once → works in both concept note and CBO
- [ ] Fix a bug in SSE streaming once → works everywhere
- [ ] Fix a bug in map integration once → works everywhere
- [ ] Add a new skill by creating 2 files (`.skill.ts` + `.system.md`)
- [ ] Schema-driven document form renders any section structure
- [ ] Knowledge base is skill-agnostic; skills just declare folders
- [ ] No regression in concept note or CBO behavior
- [ ] Agent engine is <300 lines; skill definitions are <150 lines each
