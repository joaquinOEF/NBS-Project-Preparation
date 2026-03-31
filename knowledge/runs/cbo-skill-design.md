# CBO Intervention Profile — Skill Design

> Informed by COUGAR ecosystem assessment, NBS mapping criteria, and Y2 capacity building plan
> Date: 2026-03-31

---

## Context from COUGAR

The Pyxera Global ecosystem assessment mapped **50+ actors** in Porto Alegre's climate innovation ecosystem. Key organizations identified as "keystone initiatives":

| Organization | Focus | Status | Budget |
|---|---|---|---|
| CEA Bom Jesus | Waste management, energy transition | Fundraising | ~US$1M |
| Vila Flores | Climate adaptation, Várzea Lab | Funded | US$900K |
| Translab | Gardens, composting, rain gardens | Funded | US$160K |
| Misturaí (Regeneraí) | Environmental awareness, gardens | Active | Ongoing |
| CEASA Hub | Food waste reduction | Launched | Active |

These organizations need to document their interventions in a **standardized format** that can be:
1. Assessed against the COUGAR NBS Mapping Criteria (maturity scoring)
2. Aggregated into a portfolio for place-based transition funding
3. Plotted on a map alongside other interventions
4. Fed into the municipal BPJP concept note as evidence

## Skill Design: 5 Sections (COUGAR-aligned)

The sections map directly to the COUGAR NBS Mapping Criteria maturity assessment:

### 1. Organization & Team
*Maps to: Identifiable Org + Org Delivery Capacity + Team Technical Experience*

- Organization name and type (NGO, CBO, cooperative, association)
- Mission and history (years active, community context)
- Team: size, key people, paid vs volunteer
- Prior project experience (what have you delivered before?)
- Contact: name, role, email, phone
- **Auto-assess**: Org Delivery Capacity score (0-3) + Team Technical Experience score (0-3)

### 2. Site & Community
*Maps to: Site Control + Community Anchoring + showMap integration*

- **Map interaction**: User clicks/draws their intervention site on the map
- OSM overlay: nearby parks, waterways, roads, buildings
- Hazard grid overlay: flood/heat/landslide risk at the site
- Current conditions: what's there now (vacant lot, degraded stream, informal settlement)
- Community: who lives there, population, vulnerabilities
- Land tenure: public, private, informal, formal agreement
- Community engagement model: hub-based, collective, cooperative
- **Auto-assess**: Site Control score (0-3) + Community Anchoring score (0-3)

### 3. Intervention & Impact
*Maps to: Problem Clarity + NBS Impact + Solution Clarity*

- Problem statement: what climate/environmental problem does this address?
- NBS type: select from `_interventions/` knowledge (urban forest, wetland, bioswale, etc.)
- How it works: description of the approach, species, materials
- Scale: area (ha), beneficiaries, timeline
- Expected impact: climate benefits from `_co-benefits/` knowledge
- What's already done vs what's planned (milestones)
- **Auto-assess**: Problem Clarity (0-3) + Climate Impact (0-3) + Solution Clarity (0-3)

### 4. Resources & Needs
*Maps to: Basic Financial Thinking + Regulatory Awareness*

- Budget: what funding exists, what's needed, line items
- In-kind contributions (volunteer hours, donated materials, municipal support)
- Funding sources: where current funding comes from
- Financing gap: what's needed and for what
- Technical assistance needs (design, monitoring, species selection, engineering)
- Regulatory status: permits needed, conversations with authorities
- **Auto-assess**: Financial Thinking (0-3) + Regulatory Awareness (0-3)

### 5. Evidence & Deliverables
*Maps to: Priority Flags*

- Documents produced (plans, reports, maps)
- Data collected (baseline measurements, photos, surveys)
- Monitoring results (if ongoing)
- Community feedback / support letters
- Partnerships and co-financing (letters of support, municipal interest)
- Scalability potential: can this be replicated?
- **Auto-calculate**: Priority Flag count (land tenure, baseline data, gov interest, co-financing, scalability)

## File Drop Feature

At ANY point during the interview, the user can **drag and drop files** into the chat:
- PDFs, Word docs, images, spreadsheets
- Agent parses the content and extracts relevant information
- Files saved in the session's run folder: `knowledge/runs/{session}/uploads/`
- File content used as context for subsequent questions

### Implementation:
1. Drop zone in the chat panel (overlay on drag)
2. Upload to server → save to run folder
3. Parse content (mammoth for docx, pdf-parse for PDF, sharp for images)
4. Inject parsed content as context in the next agent turn
5. Agent says "I've read your document. I found [X, Y, Z] relevant to [section]."

## Maturity Scorecard (auto-generated)

After the interview, the agent produces a **COUGAR NBS Maturity Scorecard**:

```
┌──────────────────────────────────────────────────────┐
│  NBS MATURITY SCORECARD — CEA Bom Jesus               │
│  Comunidades do Futuro Project                        │
│                                                       │
│  Problem Clarity          ███████████░  3/3           │
│  Climate/NBS Impact       █████████░░░  2/3           │
│  Solution Clarity         ███████████░  3/3           │
│  Site Control             ██████░░░░░░  1/3           │
│  Org Delivery Capacity    ███████████░  3/3           │
│  Team Technical Exp.      █████████░░░  2/3           │
│  Financial Thinking       ██████░░░░░░  1/3           │
│  Community Anchoring      ███████████░  3/3           │
│  Regulatory Awareness     ██████░░░░░░  1/3           │
│                                                       │
│  TOTAL: 19/27 — Investment Ready with Conditions      │
│                                                       │
│  Priority Flags: ✅ Community governance               │
│                  ✅ Gov interest expressed              │
│                  ⬜ Land tenure (needs verification)    │
│                  ⬜ Baseline data (needs collection)    │
│                  ✅ Scalable model                      │
│                                                       │
│  Recommended next steps:                              │
│  1. Secure formal land agreement                      │
│  2. Collect baseline environmental data               │
│  3. Develop detailed cost breakdown                   │
└──────────────────────────────────────────────────────┘
```

## UX Flow: City vs CBO Entry Point

The project page should offer two paths:

```
┌──────────────────────────────────────────────────────┐
│  ✨ Create Concept Note with AI Agent                │
│     Municipal concept note (BPJP/C40 format)         │
│                                              →       │
├──────────────────────────────────────────────────────┤
│  🌱 Document Community Intervention                  │
│     CBO/NGO intervention profile for portfolio       │
│                                              →       │
└──────────────────────────────────────────────────────┘
```

Or a single entry with a choice:

```
Agent: "Welcome! Are you preparing a:
  A) City-level concept note for funders (BPJP/C40)
  B) Community intervention profile for the COUGAR portfolio"
```

## How CBO Profiles Feed Into the Municipal Concept Note

The portfolio of CBO profiles strengthens the municipal concept note:
- **Section 8** (Solution Description): "X community organizations are already implementing NBS interventions across Y sites..."
- **Section 11** (Inclusive Action): "Community-driven governance model demonstrated by [org]. Participatory processes documented in [N] intervention profiles."
- **Section 13** (Technical Capacity): "Ecosystem of [N] organizations with demonstrated delivery capacity (average maturity score: X/27)"
- **Section 20** (Replicability): "[N] intervention sites provide replication evidence across [types]"

## Portfolio Map View (Future)

All CBO profiles plotted on one map:
- Each site is a polygon/point with color = NBS type
- Click shows scorecard summary
- Filter by: type, maturity score, funding status
- Aggregate stats: total area, total population, intervention mix
- Export as portfolio document for funders

## Implementation Steps

1. Create CBO skill file (`.claude/commands/cbo-intervention.md`)
2. Create CBO schema (`shared/cbo-schema.ts` — 5 sections)
3. Copy + adapt agent service for CBO
4. Copy + adapt frontend page for CBO
5. Add file drop to both CBO and BPJP pages
6. Add maturity scorecard rendering
7. Add CBO banner to project page
8. Test with CEA Bom Jesus scenario
9. Later: portfolio aggregation map view
