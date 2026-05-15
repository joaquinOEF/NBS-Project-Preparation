# E3 — Desenhando sua intervenção — Research notes

**Goal of this encontro**: The CBO picks a specific NBS intervention type (or 2 combined), sketches it on their site, sizes it, and articulates why this choice fits their context. ~50 min of platform time inside 90-min session.

By E3 the two paths from E1 have **converged**. `has-idea` orgs validate / refine the intervention they brought; `needs-help` orgs make their first design choice. Same flow.

## What the research says

### Intervention selection methodology

The literature converges on **multi-criteria decision frameworks** for NBS site / type selection — but they're built for technical practitioners, not community workshops.

[**ScienceDirect — Multi-criteria assessment of NbS for flood management**](https://www.sciencedirect.com/science/article/pii/S0048969725025884) systematic review: AHP + GIS-coupled MCDA is the academic gold standard. **Anti-pattern for us** — too heavy.

[**Nature Sustainability — NbS suitability for flood risk reduction**](https://www.naturebasedsolutionsinitiative.org/publications/planning-and-suitability-assessment-of-large-scale-nature-based-solutions-for-flood-risk-reduction/) proposes a 3-stage hierarchy: land suitability → socio-environmental risk → NBS benefits. Useful framing; the *order* matters — start with what the land can hold, then what risks matter, then which interventions deliver value.

[**World Bank — Nature-based Solutions for Disaster Risk Management**](https://documents1.worldbank.org/curated/en/253401551126252092/pdf/Booklet.pdf) gives a hazard → intervention mapping that's already encoded in our existing `InterventionSelector` component as `HAZARD_WEIGHTS`. Confirms our current 6-type taxonomy is reasonable.

[**C40 Knowledge Hub — NbS for cities**](https://www.c40knowledgehub.org/s/article/Nature-based-solutions-How-cities-can-use-nature-to-manage-climate-risks) maps interventions to multiple hazards. Validates our multi-select default — most community projects address ≥2 hazards (e.g. flood + heat).

**Implication for E3**: don't reinvent MCDA at community-workshop scale. Use **hazard-weighted recommendation** (which we already do) + **CBO's qualitative judgement on top**. The agent's job is to make the trade-offs legible, not optimize them.

### Sizing benchmarks for community-scale interventions

Sizing rules are the gap our existing intervention docs don't address well — they have cost ranges per m² but not "what size should this be for your site?"

[**Terra Brasil / Cronoshare**](https://terrabrasilnoticias.com/2025/08/como-jardins-podem-segurar-agua-da-chuva-e-prevenir-alagamentos/) on Brazilian rain gardens: **R$ 150–400/m²** for residential. Scales linearly to ~R$ 100–280/m² at community scale (200–500 m² projects). Sizing rule: each downspout ~50 m² catchment area.

[**Fresh Coast Guardians sizing tool**](https://www.freshcoastguardians.com/resources/services/green-infrastructure-sizing) — US municipal but transferable: a rain garden should be **5–10% of the contributing impervious area** (rooftops, paved areas). Bioretention cells: similar ratio.

[**CNT Green Values Calculator**](https://cnt.org/tools/green-values-calculator) gives community-scale benchmarks: 1 ha (10,000 m²) urban forest reduces local temperature by 1–2°C; 100 m² of bioretention captures ~80% of stormwater from a 1,000 m² contributing area.

[**Our existing `_interventions/bioswales-rain-gardens.md`**](knowledge/_interventions/bioswales-rain-gardens.md) has detailed cost matrices (USD/m²). Need a complementary "community sizing rules" doc with rough heuristics.

**Implication for E3**: a small **InterventionSizingHelper** microapp showing 3 ranges per intervention type — small (50–200 m²) / medium (200–1,000 m²) / large (1,000+ m²) — with typical cost + impact band. Lets the user pick a scale that matches what they drew on the map.

### Combinable interventions — the rule, not the exception

[**Springer City and Built Environment — Urban resilience review 2025**](https://link.springer.com/article/10.1007/s44213-025-00063-6): single-hazard NBS measures dominate literature, but **multi-hazard combinations** are what community projects actually need. Most Brazilian peripheral neighborhoods face flood + heat together; a rain garden alone doesn't solve heat.

[**Nature npj Urban Sustainability**](https://www.nature.com/articles/s42949-024-00162-z) on coupled social-ecological systems confirms: community-led NBS are typically **2–3 combinable interventions** (e.g. rain garden + green corridor + community garden), not a single type.

**Implication for E3**: multi-select is the right default (we already have it). The selector should make combinations visible — e.g. when the user picks "Urban Forest" for heat, surface "Want to add a Bioswale for flooding?" as a recommendation. Not a hard sell — a teaching moment.

### Sketching at community scale — UX research

There's not a deep UX literature for community-scale site sketching, but a few practical patterns from related domains:

- [**OpenStreetMap iD editor**](https://wiki.openstreetmap.org/wiki/ID): drag-corner polygon editing is the most natural primitive for "this is where it goes"
- **Google Maps area selection**: rectangle + freeform shapes both work; rectangle is faster, freeform is more accurate
- **Catalytic Communities / SFN community mapping**: peer-reviewed pattern is **single primitive at a time** (pin OR polygon, not both) — don't make the user choose tools

**Implication**: ship one mode — polygon draw with **drag-corner editing**. Pre-seed the polygon as a small rectangle centered on the E2 site pin; user adjusts corners to match. Auto-computes m².

## What we already have ✓

- `InterventionSelector.tsx` — sophisticated component already. 6 NBS types, hazard-weighted recommendations, multi-select, "I don't know" help mode, detail panel with 9 sections per type, PT/EN bilingual, case-study photos (3 wrong per the audit)
- 6 `_interventions/*.md` files with technical specs (cost, impact, site conditions, risks, Brazilian examples) — funder-grade content
- `MapMicroapp.tsx` with composite mode + custom draw tools — has the polygon-drawing capability but it's currently for site picking, not intervention area sketching
- `HAZARD_WEIGHTS` mapping in `InterventionSelector` — gives us the recommendation engine
- COUGAR/Pyxera maturity rubric for E3: **Problem Clarity (0-3)**, **Solution Clarity (0-3)** with concrete anchors

## What's missing for E3

1. **Sizing-rule benchmarks** — community-scale heuristics (small / medium / large bands per intervention type)
2. **Community-friendly intervention cards** — current docs are funder-grade
3. **Site Sketcher** — polygon-draw mode focused on intervention area (vs site selection)
4. **Justification capture** — structured "why this fits" answers feeding Solution Clarity score
5. **Combinable recommendations** — agent surfaces complementary intervention suggestions naturally
6. **Verified photos** — depends on the photo curation audit (PR #140 + #141)

## What we therefore do in E3

3 beats, ~50 min platform time:

### Beat 1: Choose the type (~20 min)

For `has-idea`: agent opens with *"No último encontro você marcou Cascata, com risco de enchente. Vou abrir a biblioteca de intervenções pra você confirmar (ou trocar) o tipo que tinha em mente."* Opens InterventionSelector with pre-filtered recommendations for `flood` hazard.

For `needs-help`: agent opens with *"Hora de escolher. Vou abrir a biblioteca — toca em qualquer card pra ver mais. Se tiver dúvida, escolhe 'Me ajude a decidir'."* Same selector, same hazard pre-filter.

After type selected: **if the user picked one type but a second is highly relevant (per HAZARD_WEIGHTS for their site's secondary hazard)**, agent surfaces: *"Boa escolha. Cascata também tem risco de calor. Quer combinar com uma intervenção pra isso? Florestas urbanas funcionam bem juntas com jardins de chuva."* → user can add a second type or move on.

### Beat 2: Size the intervention (~20 min)

Agent opens the **Site Sketcher** (new microapp, or extends MapMicroapp). Pre-seeded polygon = small rectangle centered on the E2 site pin. User drags corners to match the actual area. Auto-computes m².

After polygon confirmed, agent surfaces the **InterventionSizingHelper** inline: "Você desenhou 320 m². Para um jardim de chuva, isso é uma escala média — tipicamente R$ 50–110k pra implementar, atende uma área de captação de ~2.500 m². Faz sentido pra você?"

### Beat 3: Articulate why (~10 min)

The justification capture — 3 short structured fields:

1. *Por que esse tipo, pra esse local?* (free text, 1-2 sentences)
2. *O que essa intervenção vai mudar pra sua comunidade?* (free text)
3. *Como vocês imaginam construir essa intervenção?* (chips: mutirão comunitário / contratar empreiteira / parceria com universidade / outro)

These feed **Solution Clarity** scoring + the eventual project pitch (E6).

## Maturity scoring (silent, coordinator-side)

```
PROBLEM_CLARITY (0-3)
  0  No problem articulated
  1  Generic problem (e.g. "enchente é ruim")
  2  Local problem with specifics (which streets, frequency, who's affected)
  3  Local problem + data/photos + quantification

SOLUTION_CLARITY (0-3)
  0  No intervention chosen
  1  Type chosen but no implementation logic
  2  Type chosen with clear connection to problem + implementation idea
  3  Type chosen + sized + plan with steps + community involvement model
```

Problem Clarity uses E2's `hazard_priority_rationale` + the justification field 1. Solution Clarity uses the intervention choice + sketched area + justification fields 2-3.

## Microapps & improvements proposed by this research

### IMPROVEMENT · `InterventionSelector` — community-friendly content + pre-filter
The component exists and is sophisticated. Three concrete improvements:

- **Pre-filter by E2's primary_hazard** — when invoked, the agent passes `recommendedTypes` based on the site's hazard. Already supported by params; just need the cboAgent skill to pass them.
- **Use community-friendly card content** — current cards read from `_interventions/*.md` (funder-grade). Add a community-version section to each doc, or a separate `_interventions/_community/*.md` set, and have the selector fetch the right one based on a `tone: 'community' | 'funder'` param. Default to community.
- **Verified photos** — depends on PR #140 + #141. Until photos are sourced, render gradient + emoji placeholders.

### NEW · `SiteSketcher` (extends `MapMicroapp` polygon mode)
Reuse `MapMicroapp` with a new param `selectionMode: 'sketch-intervention-area'`. Pre-seeds a small editable polygon centered on the E2 site pin. Drag-corner editing. Confirms with computed m².

Implementation: ~80 lines added to `MapMicroapp.tsx` (most of the polygon draw infrastructure already exists for the custom-draw mode).

### NEW · `InterventionSizingHelper` (inline composer)
After polygon confirm, agent renders an inline card showing 3 sizing bands for the chosen intervention type:
- **Pequeno (50-200 m²)** — escala residencial / cantinho
- **Médio (200-1,000 m²)** — escala de quarteirão
- **Grande (1,000+ m²)** — escala de bairro / parque

Each band shows typical cost range (R$) and impact band ("captura ~X m³ de água"). User's polygon is highlighted in whichever band it lands. Agent confirms or invites adjustment.

Implementation: ~60 lines React + a new `_sizing/intervention-rules.yaml` data file.

### NEW · `JustificationComposer` (inline form)
Three labeled free-text fields + a chip multi-select for construction model. Same pattern as E2's `CommunityAnchoringComposer`. Lightweight.

Implementation: ~50 lines React.

## KB content to author

1. `knowledge/_interventions/_community/*.md` (6 files) — community-friendly companion to each intervention doc. Tone: less numbers, more "what it looks like + how it changes daily life." 1 page each.
2. `knowledge/_sizing/intervention-rules.yaml` — structured sizing bands per intervention type with cost ranges + impact estimates. Used by `InterventionSizingHelper`.
3. **Photo work** (already tracked in `docs/photo-curation.md`) — verified photos for each intervention type, replacing the 3 wrong ones.

## What we do NOT do at E3

- Compute impact in detail → E4
- Operations / sustainability plan → E4
- Funding amount → E5
- Permits → E5
- Project pitch → E6

## Sources

### Internal
- `client/src/core/components/concept-note/InterventionSelector.tsx` — existing 6-type selector
- `knowledge/_interventions/*.md` — 6 funder-grade intervention docs
- `knowledge/_cougar/nbs-mapping-criteria.md` — Problem Clarity + Solution Clarity rubrics
- `docs/photo-curation.md` — audit of intervention photos (3 wrong, must replace)

### External (intervention selection methodology)
- [ScienceDirect · Multi-criteria assessment of NbS for flood management](https://www.sciencedirect.com/science/article/pii/S0048969725025884) — academic MCDA gold standard (anti-pattern for us)
- [Nature Sustainability · NbS suitability framework](https://www.naturebasedsolutionsinitiative.org/publications/planning-and-suitability-assessment-of-large-scale-nature-based-solutions-for-flood-risk-reduction/) — 3-stage hierarchy
- [World Bank · NbS for Disaster Risk Management](https://documents1.worldbank.org/curated/en/253401551126252092/pdf/Booklet.pdf) — hazard→intervention mapping
- [C40 · NbS for cities](https://www.c40knowledgehub.org/s/article/Nature-based-solutions-How-cities-can-use-nature-to-manage-climate-risks) — multi-hazard validation
- [Springer · Urban resilience review 2025](https://link.springer.com/article/10.1007/s44213-025-00063-6) — combinable interventions

### External (sizing benchmarks)
- [Terra Brasil · Jardins de chuva no Brasil](https://terrabrasilnoticias.com/2025/08/como-jardins-podem-segurar-agua-da-chuva-e-prevenir-alagamentos/) — R$/m² ranges
- [Fresh Coast Guardians · GI sizing](https://www.freshcoastguardians.com/resources/services/green-infrastructure-sizing) — 5-10% of impervious area rule
- [CNT Green Values Calculator](https://cnt.org/tools/green-values-calculator) — community-scale benchmarks
