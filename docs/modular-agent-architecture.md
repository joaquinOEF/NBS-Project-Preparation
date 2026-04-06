# Modular Agent Architecture

## The Problem

We have two agent systems that do 80% the same thing:

| Aspect | Concept Note Agent | CBO Agent |
|--------|-------------------|-----------|
| File | `conceptNoteAgent.ts` (939 lines) | `cboAgent.ts` (515 lines) |
| Client | `concept-note.tsx` (1,445 lines) | `cbo-profile.tsx` (706 lines) |
| Schema | `concept-note-schema.ts` (219 lines) | `cbo-schema.ts` (152 lines) |
| Purpose | Fill a BPJP concept note (27 sections) | Build a CBO intervention profile (5 sections + maturity) |
| **Total** | **~2,600 lines** | **~1,370 lines** |

Both systems share the **exact same patterns**:
- SDK loading (lazy import of `@anthropic-ai/claude-agent-sdk`)
- MCP tool creation (`sdkTool` + `sdkCreateMcpServer`)
- SSE streaming (`res.write` event stream with `pushEvent`)
- State stores (in-memory `Map<string, State>`)
- Tools: `update_section`, `flag_gap`, `set_phase`, `ask_user`, `open_map`, `read_knowledge`
- Knowledge loading (city context + knowledge folders)
- Client: chat UI, question rendering, keyboard nav, map microapp integration
- Client: `formatMapResult`, `handleSelectOption`, `QuestionCard` component

Every time we fix something (keyboard nav, map tooltips, zone data flow), we fix it in **both** files.

## The Vision

One agent engine. Multiple skills. Shared micro-apps.

```
                    ┌────────────────────────────────┐
                    │         Agent Engine            │
                    │  (SDK, streaming, state, tools) │
                    └──────────┬─────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        ┌─────┴─────┐   ┌─────┴─────┐   ┌──────┴──────┐
        │  Concept   │   │    CBO    │   │  Future:    │
        │  Note      │   │  Profile  │   │  Feasibility│
        │  Skill     │   │  Skill    │   │  Study Skill│
        └─────┬─────┘   └─────┬─────┘   └──────┬──────┘
              │                │                │
              └────────────────┼────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        ┌─────┴─────┐   ┌─────┴─────┐   ┌──────┴──────┐
        │    Map     │   │  Question │   │  Document   │
        │  Microapp  │   │  Microapp │   │  Panel      │
        └───────────┘   └───────────┘   └─────────────┘
```

## Architecture

### Layer 1: Agent Engine (shared core)

**What it does**: SDK loading, SSE streaming, state management, tool registration, message history.

**One file**: `server/services/agentEngine.ts`

```typescript
// The engine doesn't know about concept notes or CBOs.
// It knows how to run a skill with tools and stream results.

interface AgentEngineConfig {
  id: string;                          // Session ID
  skillDefinition: SkillDefinition;    // What the agent does
  state: AgentState;                   // Current document state
  knowledgePaths: string[];            // Which knowledge folders to load
}

interface SkillDefinition {
  name: string;                        // "concept_note" | "cbo_profile"
  systemPrompt: string;                // Full system prompt
  phases: PhaseDefinition[];           // Phase flow
  tools: ToolDefinition[];             // Which tools this skill uses
  sections: SectionDefinition[];       // Document schema
}

// The engine provides these tools to ALL skills:
// - update_section(sectionId, field, value, confidence, source)
// - flag_gap(sectionId, field, reason, severity)
// - set_phase(phase)
// - ask_user(questions)
// - open_map(params)
// - read_knowledge(folder, file)

// Skills can register ADDITIONAL tools:
// - CBO adds: score_maturity, set_priority_flag
// - Future skills add their own
```

### Layer 2: Skill Definitions (what varies)

Each skill is a **configuration object**, not a separate codebase. A skill defines:

| Property | Concept Note | CBO Profile | Notes |
|----------|-------------|-------------|-------|
| `name` | `concept_note` | `cbo_profile` | Used for MCP server name |
| `systemPrompt` | BPJP expert advisor | Friendly CBO advisor | Different personas + behavior rules |
| `sections` | 27 GCF sections | 5 profile sections | Document schema |
| `phases` | 10 phases | 6 phases | Interview flow |
| `extraTools` | _(none)_ | `score_maturity`, `set_priority_flag` | Skill-specific tools |
| `knowledgeFolders` | `_interventions`, `_co-benefits`, `_financing-sources`, `_evidence`, `_success-cases`, `_templates` | `_interventions`, `_co-benefits`, `_cougar` | Which knowledge to preload |
| `skillFlowFile` | `.claude/commands/concept-note.md` | `.claude/commands/cbo-intervention.md` | Phase-by-phase guide |
| `languageRules` | Content always in Portuguese | Content in Portuguese for BR orgs | i18n behavior |
| `questionStyle` | Professional, technical when needed | Simple, warm, encouraging | Tone of ask_user questions |

**File structure**:
```
server/
  skills/
    concept-note.skill.ts    # Skill definition (config + system prompt)
    cbo-profile.skill.ts     # Skill definition (config + system prompt)
    _shared-prompt.ts         # Shared prompt fragments (tool docs, map recipes, etc.)
```

### Layer 3: Micro-Apps (shared UI components)

Micro-apps are **parameterized UI components** that the agent invokes via tools. They already exist but aren't formally structured.

| Micro-App | Tool that invokes it | What it does | Parameters |
|-----------|---------------------|-------------|------------|
| **MapMicroapp** | `open_map` | Interactive map with zone/asset/sample selection | `selectionMode`, `layers`, `tileLayers`, `zoneSource`, `prompt` |
| **QuestionCard** | `ask_user` | Multiple-choice questions with keyboard nav | `questions[]`, `multiSelect`, `relatedSections` |
| **DocumentPanel** | _(always visible)_ | Shows document sections, fields, gaps, confidence | `sections[]`, `sectionDefinitions` |
| **MaturityScorecard** | `score_maturity` | Visual maturity radar + priority flags | `metrics[]`, `flags[]` |

**Key principle**: Micro-apps are **skill-agnostic**. The MapMicroapp doesn't know if it's being used by a concept note or a CBO. It receives parameters and returns structured results.

### Layer 4: Knowledge Base

Knowledge is organized by **scope**, not by skill:

```
knowledge/
  {city}/                      # City-specific context
    city-profile.md
    climate-risks.md
    stakeholders.md
    ...
  _interventions/              # NBS intervention details (shared)
    flood-parks.md
    green-corridors.md
    ...
  _co-benefits/                # Co-benefit evidence (shared)
  _financing-sources/          # Funding sources (concept note needs this)
  _evidence/                   # Climate evidence (shared)
  _success-cases/              # Case studies (shared)
  _cougar/                     # COUGAR/NBS mapping criteria (CBO needs this)
  _templates/                  # Output templates
```

**How skills access knowledge**:
1. **Preloaded context**: The engine loads city-specific + skill-relevant folders into the system prompt (truncated to ~1500 chars/file)
2. **On-demand**: The `read_knowledge` tool gives the agent access to the full content of any file
3. **Skill config**: Each skill declares which folders are relevant in `knowledgeFolders`

## Current Duplication Audit

### Server-side (what to extract into engine)

| Pattern | conceptNoteAgent.ts | cboAgent.ts | Action |
|---------|-------------------|-------------|--------|
| SDK loading | Lines 15-51 | Lines 18-37 | **Extract**: `agentEngine.ts` |
| State stores | Lines 53-70 | Lines 45-61 | **Extract**: generic `AgentStateStore<T>` |
| Tool: `update_section` | Lines 127-156 | Lines 80-105 | **Extract**: parameterized by section schema |
| Tool: `flag_gap` | Lines 159-172 | Lines 107-120 | **Extract**: identical |
| Tool: `set_phase` | Lines 174-187 | Lines 122-135 | **Extract**: identical |
| Tool: `ask_user` | Lines 189-213 | Lines 137-156 | **Extract**: identical |
| Tool: `open_map` | Lines 215-261 | Lines 158-205 | **Extract**: identical (same params, same description) |
| Tool: `read_knowledge` | Lines 263-283 | Lines 248-264 | **Extract**: identical |
| MCP server creation | Lines 285-290 | Lines 266-271 | **Extract**: engine creates server from skill tools |
| SSE streaming | Lines 308-382 | Lines 287-359 | **Extract**: generic `streamAgentChat()` |
| Knowledge loading | Lines 890-917 | Lines 400-435 | **Extract**: parameterized by folder list |
| System prompt | Lines 788-887 | Lines 391-500 | **Keep separate**: this IS the skill definition |
| Tool: `score_maturity` | _(n/a)_ | Lines 207-226 | **Keep in CBO skill**: skill-specific tool |
| Tool: `set_priority_flag` | _(n/a)_ | Lines 228-246 | **Keep in CBO skill**: skill-specific tool |

**Estimated reduction**: ~600 lines of duplicated server code becomes ~300 lines of shared engine + ~150 lines per skill definition.

### Client-side (what to extract into shared components)

| Pattern | concept-note.tsx | cbo-profile.tsx | Action |
|---------|-----------------|----------------|--------|
| `formatMapResult()` | Lines 18-30 | Lines 34-48 | **Extract**: shared utility (already nearly identical after today's fix) |
| `QuestionCard` component | Lines 1121-1220 | Lines 627-704 | **Extract**: shared `<AgentQuestionCard>` |
| Keyboard nav `useEffect` | Lines 233-310 | Lines 152-209 | **Extract**: shared `useAgentKeyboardNav()` hook |
| SSE event processing | Lines 350-500 | Lines 212-260 | **Extract**: shared `useAgentSSE()` hook |
| Chat message rendering | Lines 700-900 | Lines 370-440 | **Extract**: shared `<AgentChatMessages>` |
| Map microapp integration | Lines 950-1000 | Lines 540-570 | **Extract**: shared `<AgentMapPanel>` |
| Input form | Lines 1000-1050 | Lines 455-480 | **Extract**: shared `<AgentInput>` |
| Document panel | Lines 1050-1120 | Lines 490-625 | **Keep separate**: different section schemas, different rendering |

**Estimated reduction**: ~1,500 lines of duplicated client code becomes ~500 lines of shared components + ~200 lines per page.

## Migration Plan

### Phase 1: Extract Shared Components (client)

Low risk, high immediate value. Extract:

1. `client/src/core/components/agent/AgentQuestionCard.tsx`
   - Merge `QuestionCard` + `CboQuestionCard` into one component
   - Props: `question`, `selectedIdx`, `multiSelected`, `onSelect`, `onMultiToggle`, `onMultiConfirm`, `disabled`, `answeredValue`

2. `client/src/core/components/agent/useAgentKeyboardNav.ts`
   - Shared keyboard nav hook (arrow keys, Enter, Tab, letter keys)
   - Handles both single-select and multi-select

3. `client/src/core/components/agent/formatMapResult.ts`
   - Shared utility for formatting map selection results

4. Update `concept-note.tsx` and `cbo-profile.tsx` to import from shared

**Files**: 3 new, 2 modified. **Risk**: Low (pure refactor, no behavior change).

### Phase 2: Extract Agent Engine (server)

Medium risk, foundational.

1. `server/services/agentEngine.ts`
   - Generic SDK loading, state store, SSE streaming
   - Tool factory: `createCoreTool(name, schema, handler)`
   - Knowledge loader with configurable folder list
   - `streamAgentChat(config, userMessage, res)`

2. `server/skills/concept-note.skill.ts`
   - System prompt, section definitions, phase definitions
   - No tools of its own (uses only core tools)

3. `server/skills/cbo-profile.skill.ts`
   - System prompt, section definitions, phase definitions
   - Extra tools: `score_maturity`, `set_priority_flag`

4. Rewire `conceptNoteAgent.ts` and `cboAgent.ts` to be thin wrappers:
   ```typescript
   import { streamAgentChat } from './agentEngine';
   import { conceptNoteSkill } from '../skills/concept-note.skill';
   
   export async function streamConceptNoteChat(noteId, userMessage, res, state) {
     return streamAgentChat({ id: noteId, skill: conceptNoteSkill, state }, userMessage, res);
   }
   ```

**Files**: 3 new, 2 modified (thin wrappers). **Risk**: Medium (streaming behavior must be preserved exactly).

### Phase 3: Unified Client Page (optional, higher risk)

Replace `concept-note.tsx` and `cbo-profile.tsx` with a single `agent-workspace.tsx` that takes a skill type parameter. The document panel and micro-apps are configured by the skill.

This is the highest payoff but also highest risk — the pages have significant UI differences (concept note has section navigation, CBO has maturity scorecard). Worth doing only after Phase 1+2 prove stable.

**Approach**: Keep the pages separate but have them compose from shared agent components:
```tsx
// concept-note.tsx
<AgentWorkspace skill="concept_note" state={state}>
  <ConceptNoteDocumentPanel sections={state.sections} />
</AgentWorkspace>

// cbo-profile.tsx  
<AgentWorkspace skill="cbo_profile" state={state}>
  <CboDocumentPanel sections={state.sections} scorecard={state.maturityScores} />
</AgentWorkspace>
```

## Skill Definition Spec

A skill is a TypeScript object conforming to this interface:

```typescript
interface SkillDefinition {
  // Identity
  name: string;                        // "concept_note" | "cbo_profile"
  displayName: string;                 // "Concept Note" | "CBO Intervention Profile"
  mcpServerName: string;               // MCP server name for tool namespacing
  
  // Document
  sections: SectionDefinition[];       // { id, label, fields: FieldDef[] }
  
  // Interview flow
  phases: PhaseDefinition[];           // { number, name, description, autoFillHints }
  
  // Behavior
  systemPromptTemplate: string;        // Template with {{city}}, {{phase}}, {{orgName}} placeholders
  questionStyle: 'professional' | 'friendly';  // Affects ask_user tone guidance
  languageRule: 'content_pt' | 'follow_user';  // When to force Portuguese
  
  // Knowledge
  knowledgeFolders: string[];          // Which knowledge/ subdirs to preload
  skillFlowFile: string;              // Path to .claude/commands/ skill flow file
  
  // Extra tools (beyond the 6 core tools)
  extraTools?: ExtraToolDefinition[];  // { name, description, schema, handler }
  
  // Client
  documentPanelComponent: string;      // React component for the right panel
  scorecard?: ScorecardConfig;         // If skill has a maturity/scoring system
}
```

## Micro-App Parameter Spec

### MapMicroapp

Already well-parameterized via `OpenMapParams`:

```typescript
interface OpenMapParams {
  selectionMode: 'zones' | 'assets' | 'sample' | 'composite';
  layers?: string[];           // OSM layer IDs
  tileLayers?: string[];       // Tile overlay IDs
  spatialQueries?: string[];   // Pre-filter queries
  sampleLayers?: string[];     // For sample mode
  zoneSource?: 'neighborhood_zones' | 'intervention_zones' | 'neighborhoods';
  prompt: string;              // Instruction for the user
}
```

**Recipes** (agents should reference these by name):
- `neighborhood_selection`: composite + neighborhood_zones + osm layers
- `site_selection`: assets + osm layers + tile overlays
- `evidence_check`: sample + tile overlays
- `zone_overview`: zones only

### QuestionCard

```typescript
interface AgentQuestion {
  question: string;
  options: { label: string; description?: string; recommended?: boolean }[];
  multiSelect?: boolean;
  relatedSections?: string[];  // UI auto-scrolls document panel
}
```

### DocumentPanel

Configured by the skill's `sections` array. Each section has:
```typescript
interface SectionDefinition {
  id: string;
  label: string;                       // Display name
  fields: {
    name: string;
    type: 'text' | 'number' | 'select' | 'multiline';
    label: string;
    placeholder?: string;
  }[];
  group?: string;                      // For grouping in sidebar nav
}
```

## Knowledge Base Guidelines

### For skill authors

1. **City data** goes in `knowledge/{city}/`. One file per topic (climate-risks.md, stakeholders.md, etc.)
2. **Domain knowledge** goes in `knowledge/_topic/`. Shared across all skills that declare the folder.
3. **Files are markdown with YAML frontmatter**. The engine strips frontmatter before sending to the agent.
4. **Keep files under 4KB** for preloading. The engine truncates at 1,500 chars for system prompt context. Full content is available via `read_knowledge`.
5. **Name files descriptively** — the agent sees the filename when deciding whether to read it.

### For agents (in the system prompt)

The `read_knowledge(folder, file)` tool gives you access to detailed data files. Use it when:
- You need specific numbers (costs, areas, populations) for a section
- The user asks about something not in the preloaded context
- You're in a later phase and need evidence or financing details

Available folders are listed in your preloaded context under "Available in _{folder}/".

## Success Criteria

- [ ] Fix a bug in `QuestionCard` once, it works in both concept note and CBO
- [ ] Fix a bug in streaming/SSE once, it works everywhere
- [ ] Add a new skill (e.g., feasibility study) by creating a single `.skill.ts` file + document panel component
- [ ] Shared keyboard nav, map integration, question rendering — zero duplication
- [ ] Knowledge base is skill-agnostic; skills just declare which folders they need
- [ ] No regression in either concept note or CBO behavior

## What NOT to Unify

Some things should stay separate because they're genuinely different:

1. **System prompts** — persona, tone, behavior rules are the core of what makes each skill unique
2. **Document panels** — concept note has 27 sections with GCF structure; CBO has 5 sections + maturity scorecard. Different enough to warrant separate React components.
3. **Section schemas** — the fields are different, the validation is different
4. **Skill-specific tools** — CBO's `score_maturity` and `set_priority_flag` have no concept note equivalent
5. **Phase flows** — concept note has 10 phases, CBO has 6, with different logic in each
