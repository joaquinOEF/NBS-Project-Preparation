# NBS Concept Note Module — Architecture & Vision

> **Date**: 2026-03-27
> **Author**: JVP + Claude
> **Status**: Working prototype on Replit
> **Repo**: https://github.com/joaquinOEF/NBS-Project-Preparation

---

## What Is This

An AI-guided interactive tool that helps city officials prepare **BPJP/C40 concept notes** for Nature-Based Solutions projects. Split-screen interface: AI chat advisor on the left, live concept note document on the right, with an integrated geospatial map for site selection.

The tool is grounded in a **curated knowledge base** of 26 research files covering Porto Alegre's climate risks, NBS interventions, co-benefits, financing sources, and funded project comparables.

## Why It Exists

Cities like Porto Alegre need to prepare concept notes to access climate finance (BNDES Fundo Clima, GCF, World Bank, IDB). These notes require:
- Detailed climate risk analysis
- Quantified NBS intervention design
- Cost estimates grounded in evidence
- Financing structure matching
- Institutional and political context

Most city officials don't have the expertise to fill all 23 sections of the BPJP template. This tool guides them through an interview, auto-fills what it can from research data, and asks targeted questions for the rest.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React)                           │
│  ┌───────────────────┐  ┌────────────────────────────────────┐  │
│  │   CHAT PANEL       │  │   DOCUMENT / MAP PANEL             │  │
│  │                     │  │                                    │  │
│  │  AI advisor         │  │  [Document]  [Map]                 │  │
│  │  MC questions       │  │                                    │  │
│  │  Thinking steps     │  │  23 section cards (table + prose)  │  │
│  │  Phase navigation   │  │  Progress bar, confidence dots     │  │
│  │  Free text input    │  │  Hover edit, source citations      │  │
│  │                     │  │  OR                                │  │
│  │                     │  │  Leaflet map with 1km risk grid    │  │
│  │                     │  │  15 clickable intervention zones   │  │
│  └───────────────────┘  └────────────────────────────────────┘  │
└─────────────────────┬────────────────────────────────────────────┘
                      │ SSE (Server-Sent Events)
┌─────────────────────┼────────────────────────────────────────────┐
│              EXPRESS SERVER                                        │
│                     │                                             │
│  ┌──────────────────▼──────────────────────────────────────────┐ │
│  │  Claude Agent SDK (TypeScript)                               │ │
│  │  V2 persistent sessions (primary)                            │ │
│  │  V1 continue: true (fallback)                                │ │
│  │  Anthropic API direct (fallback)                             │ │
│  │                                                              │ │
│  │  Custom MCP Tools:                                           │ │
│  │  ├── update_section  → pushes SSE → document panel updates   │ │
│  │  ├── ask_user        → pushes SSE → MC buttons render        │ │
│  │  ├── set_phase       → pushes SSE → phase indicator updates  │ │
│  │  ├── flag_gap        → pushes SSE → gap warning renders      │ │
│  │  └── read_knowledge  → reads from knowledge/ folder          │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  knowledge/  (26 curated research files)                          │
│  .claude/commands/concept-note.md  (skill flow guide)             │
└───────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Claude Agent SDK, Not Raw API

We use the Claude Agent SDK (which runs Claude Code as a subprocess) rather than calling the Anthropic Messages API directly. This gives us:
- **Persistent sessions** (V2) — no restart between turns, context preserved
- **Autonomous reasoning** — the agent can adapt to unexpected user behavior
- **Tool use** — same mechanism as Claude Code CLI

We considered switching to the raw Messages API for predictability and speed, but realized that **real users go off-script** — they ask "what is NBS?", skip phases, challenge data, paste documents. The agent needs to handle this conversationally, which requires Claude Code-level intelligence.

### 2. Pre-Baked Knowledge, Not Runtime File Reading

The system prompt includes:
- **City knowledge** — all 7 city files pre-loaded (~15K tokens, cached after first load)
- **Skill instructions** — the full `/concept-note` skill embedded
- **Available file list** — so the agent knows what `read_knowledge` can access

This eliminates the 30-40 second startup delay where the agent was reading files. The agent starts immediately with auto-fill + questions.

### 3. Guardrails, Not Restrictions

The agent has access to `read_knowledge` (scoped to the knowledge/ folder) but NOT to generic Read/Glob/Grep (which let it explore source code). This means:
- It can look up deeper data when needed (e.g., specific intervention costs)
- It cannot waste time reading `conceptNoteAgent.ts` to "understand its tools"
- New knowledge files are automatically accessible

### 4. Adaptive Pacing

The agent adapts to the user:
- **Municipal secretary**: explains concepts, moves at their pace
- **Political advisor**: moves fast, auto-fills aggressively, minimal questions
- **Technical expert**: accepts their data as authoritative, recalculates dependents
- **Phase jumping**: users can click phase numbers or type "skip to costs"

### 5. Map as Answer Interface

When questions involve spatial decisions (zone selection, territorial scope), the right panel auto-switches to a Leaflet map showing Porto Alegre with:
- 1km risk grid (flood/heat/landslide color-coded)
- 15 intervention zones (clickable to select)
- Zone stats on hover (risk scores, population, area)
- Confirm sends rich aggregated data to the agent

## Knowledge Base Structure

```
knowledge/
├── _templates/              # Output template + city scaffold
├── _interventions/ (6)      # NBS types with costs, KPIs, evidence
├── _co-benefits/ (6)        # Quantified ranges with citations
├── _financing-sources/ (3)  # Brazilian + international funders
├── _evidence/ (2)           # Funded projects + benchmarks
├── _success-cases/ (1)      # Brazilian municipal precedents
├── _inclusive-action/ (1)   # Participatory frameworks
├── porto-alegre/ (7)        # City profile, risks, plans, stakeholders, etc.
└── runs/                    # Session outputs (concept notes, gap analysis)
```

Adding a new city: clone `_templates/city-folder-template/`, fill with research, the agent auto-detects it.

## How It Works for Users

1. Navigate to `/concept-note` → split-screen loads
2. Click "Start Interview" → agent reads knowledge, auto-fills municipality/state
3. Phase 1: agent presents 4 questions as clickable buttons (sector, climate type, name, proponent)
4. User answers → agent fills sections, moves to Phase 2
5. Phase 2: agent auto-fills territorial context + diagnosis from knowledge, asks user to validate
6. If user says "show me on the map" → right panel switches to map with risk grid
7. User selects zones → rich data (risk scores, population) sent to agent
8. Continues through 8 phases → gap analysis → final concept note

At any point the user can:
- Type free-text responses instead of using MC buttons
- Ask "what does this mean?" → agent explains
- Say "skip to costs" → agent jumps to Phase 6
- Provide their own data → agent updates and recalculates
- Click the edit pencil on any field → trigger cascade analysis

## Technical Stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind, shadcn/ui, Leaflet
- **Backend**: Express.js, Claude Agent SDK (TypeScript)
- **AI**: Claude Opus 4.6 via Agent SDK (V2 persistent sessions)
- **Storage**: Filesystem (knowledge/runs/) + localStorage for session ID
- **Deployment**: Replit (auto-deploy from main branch)
- **Knowledge**: 26 markdown files with YAML frontmatter

## What's Working Well

- Knowledge base quality (well-researched, sourced, structured)
- CLI skill (excellent in Claude Code)
- Map integration (grid overlay, zone selection, data aggregation)
- Document panel (table layout for short fields, prose for long)
- Question cycling (one at a time, keyboard nav, Tab to cycle)
- Persistence (survives page reload, resume button)
- Session highlight (auto-scroll + pulse on related sections)

## Known Limitations & Open Backlog

### Agent Behavior
- First turn still takes ~15-20s (subprocess startup)
- Agent occasionally writes questions as text instead of using ask_user tool
- Language consistency (Portuguese creeps into chat messages)

### UX
- No collaborative editing (single user per session)
- No authentication (anyone can access)
- Mobile not supported (desktop split-screen)
- No undo on user edits

### Skill Improvements (GitHub Issues #16-26)
- Ask CAPAG rating explicitly (#16)
- Ask for formal political instruments (#17)
- Restructure gap review with grouped questions (#18)
- Stream knowledge loading per phase (#20)
- Respect user community scope (#22)
- Define branching logic for "Explore" options (#24)

## Scaling to Other Cities

1. Create `knowledge/{city-name}/` folder from template
2. Research and populate 7 city files
3. The shared folders (`_interventions/`, `_co-benefits/`, etc.) work across all cities
4. Agent auto-detects city folder and loads context
5. Map would need city-specific boundary + grid data

## Next Steps (Recommended Priority)

1. **Test with real users** — get a SMAMUS official to try it, observe behavior
2. **Prompt tuning** — based on real user behavior, refine the system prompt
3. **Speed optimization** — explore prompt caching for the API fallback path
4. **Multi-city** — add Bogotá or Nairobi as second city to test scalability
5. **Export quality** — improve the markdown → PDF export pipeline
6. **Authentication** — add user login before opening to external users
