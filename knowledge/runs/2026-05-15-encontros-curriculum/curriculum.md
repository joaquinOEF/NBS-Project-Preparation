# COUGAR · Vila Flores · 6-Encontro Curriculum & Build Spec

**Date**: 2026-05-15 · **Status**: design, pre-build · **Pilot start**: 2026-06-11 (Encontro 1)

## Goal

By the end of **Encontro 6**, the cohort has **10 community-scale NBS projects refined to portfolio-ready state**:

- Each project has: org profile, site + risk context, intervention design, impact estimate, operations plan, funding need, regulatory awareness, evidence/photos
- The orchestrator's **Aggregate Portfolio view** shows the cohort as a single investable proposition: total area, total impact, total ask, geographic distribution, intervention-type mix
- Each CBO leaves with a **1-page project card** they can use to talk to their community and to potential local partners
- The portfolio is handed to **BWB** for bankability review, with the **QCF** €50K deployment as the near-term funding trigger

Two paths converge into the same outcome:

| Path | What they bring to W1 | How the experience adapts |
|---|---|---|
| **"Já tenho uma ideia"** | Existing project concept (varying maturity) | Validate + refine + surface gaps |
| **"Quero ajuda"** | A community + a willingness to act | Educate + diagnose + co-design from scratch |

By Encontro 4, both paths sit on the same curriculum. The triage is set at Encontro 1 (explicit question, stored on the member), surfaced on the orchestrator card so VF/OEF know who needs more hand-holding mid-pilot.

> **Path divergence in detail**: see [`_paths/two-path-triage.md`](_paths/two-path-triage.md) for the cross-cutting authority — flow per encontro, the `RequestSupport` affordance, and path-switching mechanics.

---

## The 6 encontros at a glance

| # | Encontro | Pedagogical goal | Schema phases filled | Path-adaptive? |
|---|---|---|---|---|
| 1 | **Quem somos · diagnóstico** | Onboarding + capacity read + path triage | P1 (org_profile) + path field | — |
| 2 | **Seu território · o que é NBS** | Educate on NBS; map the bairro's risks; pick where to act | P2 (intervention_site) | Yes (idea: validate site; help: discover site) |
| 3 | **Desenhando sua intervenção** | Choose + size + justify the intervention | P3a (intervention_type) | Yes (idea: refine type; help: learn types, then pick) |
| 4 | **Impacto · operações · sustentabilidade** | Quantify impact; design ops + financial model | P3b + P3c | No (both paths converge) |
| 5 | **Necessidades · prontidão** | Funding need + permits + gap report | P4 (needs_assessment) | No |
| 6 | **Portfólio · apresentação** | Aggregate portfolio; project pitch; next steps | P5 (results_evidence) → status `ready-for-review` | No |

Each encontro is ~90 min in-room with VF facilitators. The platform is used live for 30-45 min mid-session; the rest is discussion, peer review, and educational segments.

---

## Per-encontro specification

For each encontro: pedagogical goal, in-room agenda, agent skill, microapps, KB grounding, data captured.

### Encontro 1 — Quem somos · diagnóstico

**Pedagogical goal**: Each CBO introduces itself; OEF/VF gets a capacity read; the two-path triage emerges.

**In-room agenda (90 min)**:
- 30 min — Round of intros (one-line: "what we do, where we work"). Coordinator presents the journey overview.
- 35 min — On the platform: complete the Quem Somos form (Phase 1 of profile)
- 25 min — Group discussion: "what climate challenge concerns you most in your bairro?" — sets up Encontro 2

**Agent skill**: `encontro-1-quem-somos.md`
- Captures (CBO profile P1):
  - `org_name`, `legal_form`, `year_founded`, `team_size`, `paid_vs_volunteer`, `primary_cause`, `bairro_of_operation`
  - **Maturity scores**: `org_delivery_capacity` (0-3), `team_technical_experience` (0-3)
- **Two-path triage** (NEW field on cohort_members):
  - Asks: *"Você já tem uma ideia de projeto NBS, ou quer ajuda para encontrar uma?"*
  - Stores: `path: 'has-idea' | 'needs-help'`
- Prior-project capture: any documents (proposals, reports, photos) uploaded here are parsed into Phase 1 evidence

**Microapps**: None (chat + file drop)

**KB grounding**:
- `_success-cases/brazilian-municipal.md` — show 1-2 brief examples of CBO-led NBS in Brazil
- *(new)* `_glossary/o-que-e-nbs-comunidade.md` — 1-paragraph community-friendly "what is NBS" used for "the NBS we'll talk about includes…"

**Orchestrator snapshot fields updated**:
- `snapshotPhase=1`, `snapshotSectionsComplete=1`, `path`, `capacity_band` (emerging/developing/building/mature)

---

### Encontro 2 — Seu território · o que é NBS

**Pedagogical goal**: CBOs learn what NBS *is*, the 6 types relevant to POA, the risks present in their specific bairro, and pick where they could act.

**In-room agenda (90 min)**:
- 25 min — Educational module: *O que é NBS, e por que importa para Porto Alegre*. Coordinator-led with the 6 intervention cards + case studies projected.
- 45 min — On the platform:
  - **`has-idea` path**: "Conta sobre seu projeto atual…" → describe + upload + pin existing site on map → platform overlays risk data on their site
  - **`needs-help` path**: "Vamos descobrir juntos…" → bairro picker → see the risk map → pick a target site
- 20 min — Small group: peer feedback on each other's site choices

**Agent skill**: `encontro-2-seu-territorio.md` (one skill, two-path branches)
- Captures (CBO profile P2):
  - `bairro`, `site_lat`, `site_lng`, `site_area_m2`, `site_name`, `land_tenure` (public/private/mixed/informal), `current_use`, `primary_hazard`, `secondary_hazard`
  - **Maturity scores**: `site_control` (0-3), `community_anchoring` (0-3)
- Path-specific intro message; rest of the flow unifies

**Microapps**:
- **Site Explorer** ✓ — already built; bairro polygons + risk grid + hover details
- **Risk Priority chips** *(new, small)* — after site is plotted, agent asks "rank by what concerns you" with 3 chips (flood/heat/landslide); stored as ordered preferences

**KB grounding**:
- All 6 `_interventions/*.md` files — agent reads relevant ones based on hazard
- `_success-cases/brazilian-municipal.md` — 1 case-per-hazard
- *(new)* `_glossary/tipos-de-nbs.md` — community-friendly summary of 6 NBS types

**Orchestrator snapshot fields**:
- `snapshotPhase=2`, `snapshotSectionsComplete=2`, `site_lat/lng`, `primary_hazard`

---

### Encontro 3 — Desenhando sua intervenção

**Pedagogical goal**: CBOs pick a specific NBS intervention type, sketch it on their site, and articulate why this choice fits their community.

**In-room agenda (90 min)**:
- 20 min — Deeper dive on the 6 intervention types: pros, cons, what's needed to deliver, who maintains them. Coordinator-led with the intervention library projected.
- 50 min — On the platform:
  - Intervention Selector → pick a type (or "help me decide" → guided walkthrough)
  - Site Sketcher → draw the area where it'll go on top of the bairro map
  - Agent asks the type-specific design questions (species for urban forests, dimensions for bioswales, etc.)
- 20 min — Peer review: each CBO shows their site + type + sketch to one other org, gets one piece of feedback

**Agent skill**: `encontro-3-desenhando.md`
- Captures (CBO profile P3a):
  - `intervention_type` (1 of 6), `intervention_area_m2` (from sketch), `intervention_scale` (e.g. # trees, m² of green roof), `intervention_justification` (free text)
  - **Maturity scores**: `problem_clarity` (0-3), `solution_clarity` (0-3)

**Microapps**:
- **Intervention Selector** ✓ — already built; library cards + case studies + "help me decide" guided walkthrough
- **Site Sketcher** *(new, medium)* — polygon/rectangle draw on the map; computes area in m²; persisted as GeoJSON

**KB grounding**:
- `_interventions/*.md` — full intervention specs (cost, climate benefits, land tenure, maintenance, timeline)
- *(new)* `_sizing/intervention-rules.md` — "1 ha urban forest reduces local temp by 1-2°C", reference scales for each intervention

**Orchestrator snapshot fields**:
- `snapshotPhase=3`, `snapshotSectionsComplete=3`, `snapshotIntervention`, `intervention_area_m2`

---

### Encontro 4 — Impacto · operações · sustentabilidade

**Pedagogical goal**: CBOs quantify the impact of their intervention, design who will operate it, and how it sustains past year 1. This is where the project becomes serious — funders need this.

**In-room agenda (90 min)**:
- 20 min — Educational: *O que importa para um financiador?* — Impact, operations, sustainability. Concrete examples of funded vs unfunded projects.
- 50 min — On the platform:
  - **Impact Calculator**: site + intervention + scale → impact ranges (flood-peak reduction %, canopy gain m², people served, CO₂e/yr). Ranges + assumptions visible. Agent contextualizes ("this is similar to ___ project in Curitiba which had ___ impact").
  - **Operations Designer**: who maintains it, frequency, estimated annual cost, financial model (donations / fees / grants / mixed / municipal)
- 20 min — Group: peer review of operations plans — "would this still work if your key volunteer left?"

**Agent skill**: `encontro-4-impacto-operacoes.md`
- Captures (CBO profile P3b + P3c):
  - P3b: `expected_impact` (structured), `monitoring_plan`, `baseline_conditions`, `project_timeframe_years`
  - P3c: `ops_team`, `ops_frequency`, `annual_opex_brl`, `sustainability_model`, `revenue_streams`
  - **Maturity scores**: `climate_nbs_impact` (0-3), `financial_thinking` (0-3)

**Microapps**:
- **Impact Calculator** *(new, medium)* — computes impact ranges deterministically from intervention library coefficients + site characteristics. NOT an LLM call — these need to be reproducible.
- **Operations Designer** *(new, small)* — structured form: roles × frequency × cost, with a sustainability-model picker

**KB grounding**:
- `_co-benefits/*.md` + `_evidence/*.md` — impact coefficients literature-grounded
- *(new)* `_impact-coefficients/by-intervention.yaml` — structured impact ranges per intervention type per hazard (used by Impact Calculator)
- *(new)* `_operations-templates/*.md` — operations templates per intervention type (e.g. "urban forest maintenance year 1 vs year 3")

**Orchestrator snapshot fields**:
- `snapshotPhase=3 (done sub-phases)`, `snapshotSectionsComplete=5`, `snapshotMaturityScore` (now includes climate + financial)

---

### Encontro 5 — Necessidades · prontidão

**Pedagogical goal**: CBOs articulate exactly what they need to make the project happen (money, permits, technical help, partners) and check whether their project is funding-ready. The encontro that translates an idea into an ask.

**In-room agenda (90 min)**:
- 25 min — Educational: *O panorama de financiamento* — types of funders, what counts as "ready", how the QCF + BWB flow works.
- 45 min — On the platform:
  - **Funding Need Breakdown**: capex / opex / technical assistance / community engagement — with amounts
  - **Permit Checklist**: based on bairro × intervention type, the platform suggests likely permits + which city department owns each
  - Gap report auto-generated: what's missing for funding-readiness
- 20 min — Group: each org names one specific blocker and the cohort brainstorms who could unblock it

**Agent skill**: `encontro-5-necessidades.md`
- Captures (CBO profile P4):
  - `funding_need_brl` (total + breakdown), `funding_categories` (capex/opex/ta), `permits_required`, `city_contacts_needed`, `other_blockers`
  - **Maturity score**: `regulatory_awareness` (0-3)
- Generates: gap report listing missing fields, low-maturity scores, unmet priority flags

**Microapps**:
- **Funding Need Breakdown** *(new, small)* — structured amounts per category, visualized as a pie/bar
- **Permit Checklist** *(new, KB-driven)* — bairro × intervention → list of likely permits + city contact; CBOs check off what they've started + add notes
- **Gap Report** *(new, small)* — read-only summary, exportable as PDF

**KB grounding**:
- `_financing-sources/*.md` — funder catalog (BPJP, QCF, BWB, BNDES, etc.)
- *(new)* `_permits/porto-alegre-map.md` — who in POA owns what permit (SMAMUS, SMOV, Innovation Office, etc.)
- *(new)* `_readiness-criteria/funder-checklists.md` — what funders look for

**Orchestrator snapshot fields**:
- `snapshotPhase=4`, `snapshotSectionsComplete=6`, `snapshotFlagsMet` (priority flags), `funding_need_brl`

---

### Encontro 6 — Portfólio · apresentação

**Pedagogical goal**: CBOs see their project as part of a larger portfolio, practice presenting it, and get clear next steps. This is the celebration encontro + the handoff to BWB.

**In-room agenda (90 min)**:
- 20 min — **Aggregate portfolio reveal**: orchestrator's Portfolio view projected — total area, total impact, total ask, intervention-type pie, geographic spread on map. *"Together, you 10 represent…"*
- 50 min — Each CBO does a 2-min pitch using their **1-page project card** (auto-generated). Cohort feedback.
- 20 min — Wrap-up: what happens next (BWB review timeline, QCF deployment in November, partner intros, continuing support model)

**Agent skill**: `encontro-6-portfolio.md`
- Captures (CBO profile P5):
  - `results_evidence` (photos, prior outcomes), `project_pitch_line` (1-sentence), `project_card_approved` (bool)
  - Marks `status = 'ready-for-review'` (handoff to BWB)
- Generates: 1-page project card PDF

**Microapps**:
- **Project Card PDF** *(new, medium)* — renders a 1-page summary (org · site · intervention · impact · ask) as PDF; uses brand styling. Server-side via existing PDF stack OR print-stylesheet on the document panel.
- **Aggregate Portfolio View** *(new, medium)* — orchestrator-side route `/orchestrator/portfolio`. Shows: cohort map with all 10 sites, total area/impact/ask, intervention-type breakdown, exportable as a single portfolio PDF.

**KB grounding**:
- *(new)* `_pitches/examples.md` — 3-5 good 2-min pitch examples
- *(new)* `_next-steps/post-encontro-6.md` — what happens after the pilot (BWB timeline, QCF, etc.)

**Orchestrator snapshot fields**:
- `snapshotPhase=5`, `snapshotSectionsComplete=7`, `status='ready-for-review'`, `project_card_url`

---

## Cross-cutting product features

### 1. Per-encontro pedagogical preamble (CBO surface)
Before each encontro's chat starts, a 1-screen preamble:

```
ENCONTRO 3 — Desenhando sua intervenção
————————————————————————————————————————
Hoje vamos:
  • Escolher o tipo de intervenção NBS para o seu projeto
  • Desenhar onde ele vai no seu sítio
  • Dimensionar a intervenção

Você vai usar:
  • A biblioteca de intervenções (com casos reais)
  • O mapa para desenhar a área

Tempo estimado: 20–30 min
                       [Começar →]
```

Dismissible, shows once per encontro on first visit. Pulls content from the workshop's `pedagogicalGoal` + `microapps` fields in cohort.settings.

### 2. Two-path UI affordances
- W1 captures `path` explicitly via an `ask_user` from the agent
- Stored on `cohort_members.path`
- Orchestrator card: small chip next to org name (`💡 idea` / `🤝 needs help`)
- Orchestrator filter: "show all / has-idea / needs-help"
- W2 + W3 skills branch on `path` for their opening message + flow ordering

### 3. Educational content surfacing (during chat)
Today the agent reads KB silently. For CBOs, *show* what they're learning:
- When agent reads an intervention spec → render the relevant card in the right rail
- When agent reads a case study → render a small "see how Curitiba did this" card
- When agent reads impact coefficients → show the source + range

This is a UI-side change in `cbo-profile.tsx` — render a "reading…" surface alongside the chat.

### 4. Aggregate Portfolio view (W6 deliverable)
New route `/orchestrator/portfolio` showing:
- Cohort map: all sites + intervention type as a layer
- Stats strip: # projects · total m² · total impact (composite) · total ask BRL
- Intervention-type breakdown (donut chart)
- Per-project mini-card grid
- "Download portfolio PDF" → bundles every project card + a cover sheet

### 5. Project Card PDF (W6 deliverable)
Per CBO, 1-page A4 PDF:
- Header: org logo + name + bairro
- Site map thumbnail + risk context
- Intervention type + sketch + size
- Impact (3 key metrics with ranges)
- Operations summary (1 line)
- Funding ask (total + breakdown)
- Footer: pilot + cohort name + handoff date

---

## What we already have ✓

- CBO profile schema (5 phases, 9 maturity metrics, 6 priority flags)
- `cbo-intervention.md` skill (sophisticated; we'll split it into 6 encontro skills)
- Site Explorer microapp + map
- Intervention Selector microapp with case studies
- File drop / parsing (handles existing-project uploads)
- Orchestrator: cohort + member cards + workshop cadence with states + risk layers
- CBO premium welcome + progress + locked-phase popovers + mobile layout
- Bulk invite + WhatsApp deep-link
- Singleton cohort + human-readable slugs + Reset
- KB: 6 intervention docs · success cases (BR) · financing sources · co-benefits · evidence

## What needs building, in priority order

### Phase A — Curriculum scaffold (small, foundational)
1. Update default workshop seed → 6 pedagogical encontro names (PT-first)
2. Extend `WorkshopConfig` with `skillId: string`, `pedagogicalGoal: string`, `microapps: string[]`
3. Add `path: 'has-idea' | 'needs-help' | null` to `cohortMembers`
4. Per-encontro skill files: split `cbo-intervention.md` into 6 encontro skill markdowns under `knowledge/skills/`
5. `cboAgent.ts` loads the right skill based on member's current phase
6. CBO page: per-encontro preamble screen (1 screen per encontro on first entry)
7. Orchestrator: path chip + filter on member cards

### Phase B — Encontro 4 microapps (the impact + ops deepening)
1. **Impact Calculator** microapp + `_impact-coefficients/by-intervention.yaml` data file
2. **Operations Designer** microapp + `_operations-templates/` content

### Phase C — Encontro 5 microapps (the readiness gate)
1. **Funding Need Breakdown** microapp
2. **Permit Checklist** microapp + `_permits/porto-alegre-map.md` KB content
3. **Gap Report** microapp

### Phase D — Encontro 6 deliverables (the W6 outputs)
1. **Project Card PDF** generator
2. **Aggregate Portfolio View** at `/orchestrator/portfolio`

### Phase E — KB content authoring (parallel, can run alongside A-D)
- `_glossary/o-que-e-nbs-comunidade.md` (E1)
- `_glossary/tipos-de-nbs.md` (E2)
- `_sizing/intervention-rules.md` (E3)
- `_operations-templates/*.md` (E4)
- `_permits/porto-alegre-map.md` (E5)
- `_readiness-criteria/funder-checklists.md` (E5)
- `_pitches/examples.md` (E6)
- `_next-steps/post-encontro-6.md` (E6)

### Phase F — Polish / educational surface
- "Reading from KB" UI in the chat right rail
- Site Sketcher (E3 polygon draw — if Intervention Selector's existing inputs aren't enough)
- Risk Priority chips (E2)
- "See how others did this" peer-card surface (E3 peer review)

---

## Sequencing recommendation

**Before May 25 stakeholder tour**: Phase A only — this lets us *show* the curriculum (encontro names, the 2-path triage, the preamble screens) on the platform during the tour. The tour audience sees "this is what June will look like."

**Between May 25 and June 11** (Encontro 1): Phase B + Phase E for E1-E2 KB content. Encontro 1 itself only needs Phase A + the E1 glossary.

**Mid-June to early-July**: Phase C as Encontros 4 + 5 approach. KB content for E4-E5 in parallel.

**Late July**: Phase D for Encontro 6. This is the only piece that needs to land relatively late since the portfolio view doesn't matter until there's content to show.

---

## Open questions (for later, not now)

1. Photo evidence: where do CBOs upload site photos? Currently we have file drop but no clear "this is a site photo" semantic. Could add an upload affordance per phase.
2. Peer-review surface: in-app or in-room? In-room is simpler; in-app is reach.
3. Coordinator notes per CBO: should JVP/Julia leave private notes per CBO on the orchestrator card? Probably yes, but separate scope.
4. Language flexibility within the cohort: VF runs in PT. If a CBO is more comfortable in Spanish (unlikely but possible), should the agent switch? The agent already detects language; this is auto-handled.

---

## Sources

- `_meetings/2026-04-08-cougar---vila-flores-open-earth-foundation.md`
- `_meetings/2026-04-16-cougar---vila-flores-oef.md` (the deep workshop discussion)
- `_meetings/2026-04-29-cougar-biweekly-oef-internal-check-in.md` (Pyxera framework)
- `_meetings/2026-05-05-cougar-pxg-oef-biweekly.md` (cohort + timing)
- `shared/cbo-schema.ts` (the existing 5-phase/9-metric data model)
- `.claude/commands/cbo-intervention.md` (existing skill to split)
- `knowledge/_interventions/*.md` (6 NBS type cards already authored)
