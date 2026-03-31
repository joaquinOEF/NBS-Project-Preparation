# Modular Agentic Platform — Architecture Plan

> **Date**: 2026-03-31
> **Status**: Plan — not yet implemented
> **Context**: Extending the concept note agent to support multiple skill types

---

## Vision

A reusable agentic platform where **swapping a skill configuration** changes the entire use case — different interview flow, different sections, different output format — while the engine (chat UI, map, tools, persistence) stays the same. Improvements to the platform benefit all skills.

## Current State

Everything is in one monolithic module:
- `conceptNoteAgent.ts` — hardcoded BPJP system prompt, 23 sections, tool handlers
- `concept-note-schema.ts` — hardcoded BPJP section definitions
- `concept-note.tsx` — hardcoded BPJP document panel
- `ConceptNoteMap.tsx` — city map (already somewhat generic)

## Target Architecture

```
skills/                              ← SWAPPABLE CONFIGURATION
├── bpjp-concept-note/
│   ├── skill.md                     Interview flow (10 phases)
│   ├── sections.ts                  23 BPJP sections
│   ├── prompt-context.ts            System prompt builder
│   ├── template.md                  Output format
│   └── knowledge/                   Skill-specific knowledge
│       └── _financing-sources/      (BPJP-specific)
│
├── cbo-intervention/
│   ├── skill.md                     Interview flow (5 phases)
│   ├── sections.ts                  5 CBO sections
│   ├── prompt-context.ts            System prompt builder
│   ├── template.md                  Output format (portfolio-ready)
│   └── knowledge/                   Skill-specific knowledge
│       └── _org-assessment/         (CBO-specific frameworks)
│
└── [future skills...]
    ├── city-climate-plan/
    ├── project-feasibility/
    └── monitoring-report/

platform/                            ← SHARED ENGINE
├── agent-engine.ts                  SDK integration, MCP tools, SSE
├── interview-ui/                    Split-screen, chat, question cycling
├── document-panel/                  Dynamic section rendering
├── map-integration/                 Leaflet, zones, grid, OSM
├── persistence/                     Filesystem, resume, decision log
├── language/                        Detection, directive injection
└── export/                          Markdown, future PDF/DOCX

shared-knowledge/                    ← USED BY ALL SKILLS
├── porto-alegre/                    City data
├── _interventions/                  NBS types
├── _co-benefits/                    Quantified benefits
└── _evidence/                       Funded projects
```

## The Two Skills

### Skill 1: BPJP Concept Note (existing)

**User**: Municipal government official
**Goal**: Prepare a fundable concept note for BNDES/GCF/IDB
**Scope**: City-wide, multi-zone
**Sections**: 23 (BPJP template)
**Output**: Formal funder document in Portuguese
**Map use**: Multi-zone selection for territorial scope

### Skill 2: CBO Intervention Profile (new)

**User**: Community-based organization member
**Goal**: Document their single-site NBS intervention for portfolio aggregation
**Scope**: Single site, neighborhood-level
**Sections**: 5 (simplified)
**Output**: Structured profile that can be aggregated into a portfolio
**Map use**: Single site selection + OSM asset discovery (parks, buildings, streams)

#### CBO Sections

**1. Who We Are** (org_profile)
- Organization name and type (NGO, association, cooperative, informal group)
- Mission / purpose
- Team: how many people, key roles, volunteer vs paid
- Years active in the community
- Contact: name, role, email, phone
- Prior projects or experience (if any)

**2. Where We Work** (intervention_site)
- Site location: click on map to mark the area (polygon or point)
- Neighborhood / bairro
- Area (estimated ha or m²)
- Current site conditions: what's there now (vacant lot, degraded stream, etc.)
- Community: who lives nearby, how many people, key vulnerabilities
- Land ownership: public, private, mixed, informal
- OSM data overlay: nearby parks, buildings, waterways, roads

**3. What We're Doing** (intervention_plan)
- NBS intervention type (from _interventions/ knowledge)
- Description: what specifically are you building/restoring
- Approach: how (community planting days, professional contractors, hybrid)
- Scale: area covered, trees planted, structures built
- Timeline: when started, key milestones, expected completion
- What's already done vs what's planned

**4. What We Need** (needs_assessment)
- Technical help needed (design, engineering, monitoring, species selection)
- Financial gap: what funding is needed and for what
- Equipment / materials needed
- Partnerships sought (municipal support, academic, NGO, private sector)
- Training needs (team capacity gaps)

**5. Results & Evidence** (results_evidence)
- Documents produced (plans, reports, maps)
- Data collected (baseline measurements, photos, community surveys)
- Monitoring results (if project is ongoing)
- Community feedback / support letters
- Challenges encountered and lessons learned

#### CBO Interview Flow

Phase 1: **Organization** → ask_user for org details, auto-fill if known
Phase 2: **Site** → show map, user clicks location, overlay OSM data, describe conditions
Phase 3: **Intervention** → present matching NBS types from knowledge, user describes their approach
Phase 4: **Needs** → ask about gaps, match with available support programs
Phase 5: **Results** → ask what they've done/produced, flag what's missing for portfolio inclusion

#### CBO Map Interactions

The map is MORE important for CBOs than for the municipal concept note:
- **Site selection**: User draws/clicks their intervention area on the map
- **OSM overlay**: Show nearby features (waterways, parks, buildings, roads) from OpenStreetMap
- **Context**: Overlay the city's hazard grid to show why this site matters
- **Zoom level**: Neighborhood scale, not city scale
- **Photos**: Future — allow photo upload pinned to map locations

## Portfolio Aggregation (Future)

Multiple CBO profiles → combined into a portfolio view:
- Map showing all intervention sites (colored by type/status)
- Summary table: org, site, type, scale, status, budget
- Aggregate statistics: total area, total population, intervention mix
- This portfolio feeds into the municipal concept note as Section 11 evidence (community engagement) and Section 8 evidence (implementation precedents)

## How to Build the CBO Skill (Without Refactoring)

Since we're documenting the plan but building CBO first (before refactoring):

1. **Copy the concept-note approach** — create a new route `/cbo-profile`
2. **New skill file**: `.claude/commands/cbo-intervention.md`
3. **New schema**: `shared/cbo-schema.ts` with 5 sections
4. **New agent service**: `server/services/cboAgent.ts` (copy conceptNoteAgent, change system prompt + sections)
5. **New page**: `client/src/core/pages/cbo-profile.tsx` (copy concept-note, change sections)
6. **Reuse**: map component, question cycling, persistence, language detection — all reused as-is

This is a "copy and adapt" approach. It creates some duplication but lets us ship the CBO skill fast. The refactoring into a shared platform happens later when we have 2 working skills to compare.

## Refactoring Plan (Later)

After both skills work:

1. **Extract section registry** — move from hardcoded arrays to config files loaded at runtime
2. **Extract system prompt builder** — each skill provides its own prompt template
3. **Extract document panel** — SectionCard already works for any sections, just needs dynamic data
4. **Skill router** — `/skill/:skillId` route that loads the right config
5. **Shared agent engine** — one `agentEngine.ts` that takes a skill config and runs it
6. **Knowledge scoping** — each skill declares which knowledge folders it needs

## Open Questions

1. **CBO authentication**: Do CBOs need login? Or is it open access with a session token?
2. **Portfolio backend**: Where are CBO profiles stored? Same filesystem, or a database?
3. **Portfolio map**: New page that aggregates all CBO profiles on one map?
4. **Language**: CBOs will likely interact in Portuguese — the platform handles this already
5. **Offline**: CBOs may have poor internet — consider progressive web app features?
6. **Approval workflow**: Does someone review CBO profiles before they enter the portfolio?

## Implementation Priority

1. ✅ Document the plan (this file)
2. [ ] Create CBO skill file (`.claude/commands/cbo-intervention.md`)
3. [ ] Create CBO schema (`shared/cbo-schema.ts`)
4. [ ] Create CBO agent service (copy + adapt from conceptNoteAgent)
5. [ ] Create CBO page (copy + adapt from concept-note.tsx)
6. [ ] Add banner on project page for CBO entry point
7. [ ] Test with a real CBO scenario (Humaitá neighborhood association)
8. [ ] Later: refactor into shared platform
