# /concept-note — BPJP/C40 Concept Note Generator

Generate a complete, funder-aligned concept note by interviewing the user, grounded in curated knowledge folders. Follows the BPJP "Nota Conceitual de Projeto" template.

## Knowledge Base

All knowledge lives in `knowledge/` relative to this repo root:

```
knowledge/
├── _templates/concept-note-template.md   # Output template (BPJP format)
├── _funders/                             # Funder requirements and criteria
├── _financing-sources/                   # Brazilian financing programs
│   ├── brazilian-domestic.md             # BNDES, Caixa, FINEP, etc.
│   ├── international.md                  # GCF, WB, IDB, AFD, KfW
│   └── preparation-facilities.md         # C40 BPJP, GCF PPF, etc.
├── _interventions/                       # NBS types with costs, KPIs, evidence
├── _co-benefits/                         # Quantified ranges with sources
├── _evidence/                            # Funded project comparables
├── _success-cases/                       # Brazilian municipal precedents
├── _inclusive-action/                    # Participatory frameworks
├── {city}/                               # City-specific research
└── runs/                                 # Output from each skill run
```

## Execution Flow

### Phase 0: SETUP

1. Read the concept note template: `knowledge/_templates/concept-note-template.md`
2. Ask the user which city this concept note is for using AskUserQuestion:
   - List available city folders found in `knowledge/` (exclude folders starting with `_`)
   - Include option "New city" if they want to start fresh
3. Read ALL files in the city folder to load context
4. Create a run folder: `knowledge/runs/{YYYY-MM-DD}-{project-slug}/`
5. Save initial context to `knowledge/runs/{date}-{slug}/interview-responses.md`

### Phase 1: PROJECT IDENTIFICATION (Template sections 1-2)

Read city profile from `{city}/city-profile.md`. Then ask using AskUserQuestion:

**Q1: Project sector** — options based on BPJP sectors:
- Resíduos (waste)
- Mobilidade (mobility/transport)
- Soluções Baseadas na Natureza (NBS)
- Infraestrutura urbana resiliente
- Energia

**Q2: Adaptation, mitigation, or both?**

**Q3: Project name** — suggest one based on city + sector, let user refine

**Q4: Proponent institution** — ask for name and type (Prefeitura, Consórcio, Governo Estadual)

Auto-fill municipality and state from city profile.

### Phase 2: CONTEXT & DIAGNOSIS (Template sections 3-5)

Read from city folder:
- `{city}/climate-risks.md` → territorial context + problem diagnosis
- `{city}/existing-plans.md` → plan alignment context
- `{city}/baseline-data.md` → quantitative baseline

Present a summary of what the knowledge base says about the city's climate vulnerabilities and ask:

**Q5: Territorial scope** — present known risk areas from climate-risks.md, ask user to select/refine the specific area of intervention

**Q6: Problem definition** — present auto-drafted problem diagnosis with data from baseline + climate risks. Ask user to validate or refine. Offer brainstorm option: "Want to explore specific risk scenarios in more detail?"

**Q7: Strategic objective** — present options based on sector:
- For NBS: "Increase urban climate resilience through nature-based solutions" / "Reduce flood risk in vulnerable areas" / etc.
- Let user refine

**Q8: Expected results** — auto-draft from intervention KPIs in `_interventions/` matched to selected sector. Present for validation.

### Phase 3: SOLUTION DESIGN (Template sections 6-8)

Read from knowledge folders:
- `_interventions/*.md` → match to selected sector and hazard type
- `_evidence/funded-projects-brazil.md` → find comparable projects
- `_success-cases/brazilian-municipal.md` → find precedents
- `{city}/local-precedents.md` → local history

**Q9: Intervention type** — present matching NBS interventions from `_interventions/` with costs and KPIs. Let user select one or combine.

**Q10: Scale** — present comparable project scales from `_evidence/`, ask user to define target scale (ha, km, beneficiaries).

**Q11: Maturity stage** — options: ideação, estudo, análise de viabilidade, projeto básico, projeto executivo, piloto, implementação, escalabilidade

**Q12: Prior history** — ask what's been done before. Cross-reference with `{city}/local-precedents.md`.

Auto-generate:
- Specific objectives and physical targets from intervention data
- Performance indicators from intervention KPIs
- Technical alternatives assessment from `_interventions/` comparisons

### Phase 4: BENEFITS (Template sections 9-11)

Read from:
- `_co-benefits/*.md` → quantified ranges
- `_interventions/{selected}.md` → specific KPIs
- `{city}/baseline-data.md` → baseline for delta calculation

Auto-populate:
- CO2 reduction estimate (from `_co-benefits/carbon-sequestration.md` × scale)
- Adaptation benefits (from `_co-benefits/flood-risk-reduction.md` or `heat-island-mitigation.md`)
- Green jobs estimate (from `_co-benefits/economic-social.md`)
- Other pollutant reduction (from `_co-benefits/public-health.md`)

**Q13: Validate benefits** — present auto-calculated ranges with confidence levels. Ask user to validate assumptions or adjust.

For inclusive action (section 11):
**Q14: Vulnerable communities** — ask about target communities, participatory processes planned, specific groups considered. Present framework from `_inclusive-action/` if available.

### Phase 5: INSTITUTIONAL & POLITICAL (Template sections 12-15)

Read from:
- `{city}/stakeholders.md` → institutional landscape
- `{city}/existing-plans.md` → plan alignment
- `{city}/regulatory-context.md` → regulatory framework

**Q15: Institutional arrangement** — present known stakeholders, ask user to define roles (who leads, who operates, who maintains)

**Q16: Political support** — ask about formal backing (ofícios, resoluções, etc.)

**Q17: Plan alignment** — present known plans from `existing-plans.md`, ask user to confirm which ones align and how specifically

Auto-populate: technical capacity section from stakeholder data + prior experience question

### Phase 6: COSTS & FINANCING (Template sections 16-18)

Read from:
- `_interventions/{selected}.md` → cost ranges (CAPEX/OPEX per ha/unit)
- `_financing-sources/*.md` → matching financing options
- `_evidence/impact-benchmarks.md` → cost benchmarks
- `_evidence/funded-projects-brazil.md` → comparable budgets

Auto-calculate:
- CAPEX estimate = intervention cost/unit × scale
- OPEX estimate = maintenance cost/unit × scale × years
- Total project cost range

**Q18: Validate cost estimates** — present auto-calculated ranges with assumptions. Ask user to refine.

**Q19: Budget availability** — ask about own resources, contrapartida

Auto-populate:
- Financing need = total cost - own resources
- Matching financing sources from `_financing-sources/` based on eligibility, ticket size, sector
- Financial model options

### Phase 7: RISKS & REPLICABILITY (Template sections 19-20)

Auto-generate risk matrix from:
- Climate risks from `{city}/climate-risks.md`
- Technical risks from `_interventions/{selected}.md`
- Regulatory risks from `{city}/regulatory-context.md`
- Financial risks from financing structure

**Q20: Additional risks** — present auto-generated risks, ask user to validate and add any missing ones

**Q21: Land tenure** — ask about land ownership and any relocation needs

Auto-populate replicability from intervention characteristics and comparable projects.

### Phase 8: TECHNICAL ASSISTANCE & CONTACTS (Template sections 21-22)

**Q22: TA needs** — present typical needs for the maturity stage, ask user to select: diagnóstico, estudos, modelagem financeira, governança, licenciamento, participação social

**Q23: Timeline** — ask for key milestones

**Q24: Focal point** — ask for contact details (name, unit, cargo, email, phone)

### Phase 9: GAP ANALYSIS

After all questions are answered, scan the assembled concept note for:

1. **Empty or weak sections** — sections with no data or only auto-generated content
2. **Low-confidence data** — where knowledge folder data had low confidence
3. **Missing evidence** — sections without source citations
4. **Funder misalignment** — check against `_financing-sources/` eligibility criteria

Write gap analysis to `knowledge/runs/{date}-{slug}/gap-analysis.md`

Present gaps to user via AskUserQuestion:
- For each gap: explain what's missing and why it matters
- Offer to brainstorm or research specific gaps
- Ask user to provide missing data or accept assumptions

Write validated assumptions to `knowledge/runs/{date}-{slug}/assumptions.md`

### Phase 10: OUTPUT

1. Read the template from `knowledge/_templates/concept-note-template.md`
2. Fill every `{{placeholder}}` with collected data
3. Add confidence score per section (high/medium/low based on data sources)
4. Add evidence citations throughout (referencing knowledge folder files)
5. Populate the financing sources table from `_financing-sources/`
6. Populate the success cases table from `_success-cases/`
7. Write the final concept note to `knowledge/runs/{date}-{slug}/concept-note.md`
8. Write a summary of all interview responses to `knowledge/runs/{date}-{slug}/interview-responses.md`
9. Open the concept note file for the user to review

## Important Rules

- **ALWAYS ground answers in knowledge folder data** — never hallucinate numbers. If data isn't in the folders, say so and ask the user.
- **ALL questions use AskUserQuestion** with multiple-choice options where possible. Include "Other" implicitly.
- **Auto-fill first, ask second** — maximize pre-populated content from folders, only ask about genuine gaps.
- **Show your sources** — when presenting auto-filled data, cite which knowledge file it came from.
- **Confidence levels** — tag every auto-filled data point as high/medium/low confidence.
- **Save progress** — after each phase, append responses to interview-responses.md so nothing is lost.
- **Language** — the concept note output is in Portuguese (matching the BPJP template). Questions to the user can be in English or Portuguese based on user preference.
- **Currency** — costs in BRL (R$) for the concept note. Knowledge files may have USD — convert using approximate rate and note the conversion.
- **Geospatial data** — the NBS app has processed geospatial layers for Porto Alegre in `client/public/sample-data/` (elevation, landcover, rivers, water, forest, population, hazard grid with 1,036 cells). Reference `{city}/baseline-data.md` for the full layer inventory. The grid data enables quantified risk statements (flood/heat/landslide scores per zone). Use this data to strengthen the territorial context and problem diagnosis sections.

## Quick Start

When the user runs `/concept-note`:

1. Greet briefly: "Starting concept note preparation. Let me load the knowledge base."
2. Read template + list available city folders
3. Ask first question (which city?)
4. Proceed through phases sequentially
5. At the end, present the gap analysis and final output

## Arguments

- `/concept-note` — start fresh
- `/concept-note {city}` — start with a specific city (skip city selection)
- `/concept-note resume` — look for the most recent run folder and continue from where it left off
