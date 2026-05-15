# E2 — Seu território · o que é NBS — Research notes

**Goal of this encontro**: Build a shared understanding of *what NBS is*, ground it in the bairro's actual risks, and let the CBO mark **where** they want to act. Two paths converge here: `has-idea` validates an existing site; `needs-help` discovers one. ~45 min of platform time inside a 90-min session.

## What the research says

### Brazilian framing of NBS for community audiences

CBOs are not the funder audience for whom NBS is a technical category. The Brazilian Portuguese ecosystem already has community-friendly framings worth borrowing.

[**Ekos Brasil — "Soluções Baseadas na Natureza"**](https://www.ekosbrasil.org/solucoes-baseadas-na-natureza/) frames NBS as *"intervenções inspiradas em ecossistemas saudáveis para enfrentar desafios urgentes da sociedade, especialmente nas grandes metrópoles"*. They lead with **concrete examples**, not the abstract category:

- corredor verde na cidade
- rooftop que vira jardim
- terreno baldio que vira horta
- encosta de um viaduto que se transforma em mini floresta vertical

[**WRI Brasil**](https://www.wribrasil.org.br/noticias/solucoes-baseadas-na-natureza-exemplos-implementados-por-cidades-brasileiras) goes further and shows the **three scales** (urban, neighborhood, landscape) with photographed Brazilian examples — Curitiba's Barigui parks, São Paulo's Tietê river restoration, Recife's hortas urbanas. These are the reference cases that *make NBS feel achievable* — they're not Singapore or Copenhagen.

[**USP GIPSBN**](https://sites.usp.br/gipsbn/en/solucoes-baseadas-na-natureza/) (Grupo de Interação à Pesquisa em SbN) emphasizes *"o envolvimento das comunidades locais e o respeito aos conhecimentos tradicionais"* — community knowledge is part of the NBS definition itself, not a participatory add-on.

**Implication for E2**: don't explain NBS as a category. Show **3-4 concrete Brazilian examples** as the educational moment. The category falls out of the examples, not vice versa.

### Participatory methodology — community-led site selection in informal settlements

The literature on participatory NBS in the Global South converges on a few patterns we should adopt.

[**Catalytic Communities — LEED-UP for favelas**](https://rioonwatch.org/?p=17816): A 4-step community-led process where (1) community identifies its own priorities, (2) technical partners help select strategies, (3) catalytic actions are designed, (4) supporting partners are mapped. Critical insight: **community goes first, technical comes second.** This maps directly to our path triage — `needs-help` runs the community-priorities-first arc; `has-idea` has already done its own priorities work.

[**Sustainable Favela Network — Asset-Based Community Development (ABCD)**](https://catcomm.org/sustainable-favela-network/): start from community **talents and assets**, not deficits. *"Focusing development strategies on talents available in each community."* Concrete shift: don't begin E2 with "your bairro has high flood risk"; begin with "tell us about this place that you know best."

[**Frontiers — Participatory NBS in the Global South**](https://www.frontiersin.org/journals/sustainable-cities/articles/10.3389/frsc.2022.956534/full): documents how **citizen science and serious games** shift outcomes for NBS — projects become "more integrated and site-specific" when communities co-produce.

[**ScienceDirect — Participatory approaches for NBS in flood-vulnerable landscapes**](https://www.sciencedirect.com/science/article/abs/pii/S1462901122003525): stakeholder mapping + iterative co-design is the empirical pattern that yields locally-grounded NBS designs.

**Implication for E2**: the map is a **canvas for community knowledge**, not a quiz. The agent's job is to ask *"what does this place mean to you?"* and overlay risk data *underneath* their narrative, not lead with it.

### Hazard prioritization — qualitative is enough at this stage

[**US Climate Resilience Toolkit — Step 2: Assess Vulnerability and Risks**](https://toolkit.climate.gov/content/step-2-assess-vulnerability-and-risks): for community-level assessment, *"qualitative methods… categorizing vulnerability and risk as low, medium, or high… is fairly quick and effective for identifying which assets represent the highest risk."* Quantitative scoring is reserved for design-stage feasibility, not workshop-stage prioritization.

[**UN-Habitat — Community Climate Risk Guide**](https://unhabitat.org/climate-change-vulnerability-and-risk-a-guide-for-community-assessments-action-planning-and): the participatory Community Risk Assessment is *"a participatory process where community members directly assess hazards, vulnerabilities, risks, and their coping capacities."* The output is a **ranked list of hazards**, not a CVI score.

[**NHESS 2025 — Community-driven natural hazard assessment in disaster-prone urban neighborhoods**](https://nhess.copernicus.org/articles/25/4451/2025/): peer-reviewed evidence that community-derived hazard rankings align well with technical assessments — communities are *correct* about their primary hazards. Don't second-guess their priority.

**Implication for E2**: a **3-chip rank (Enchente / Calor / Deslizamento)** drag-or-tap-ordered by what concerns them is the entire hazard-priority output. Overlay technical risk data to **inform** their ranking, not replace it.

### What our existing intervention docs lack for E2 use

Our `_interventions/*.md` files (6 of them) are funder-grade — USD/m² costs, engineering specs, climate-impact ranges with confidence intervals. Excellent for E3 (where the CBO picks an intervention) and E4 (where they design it), but **not appropriate for E2's educational moment**. We need lighter, photo-led "what it is and what it does" cards.

[**Curitiba Barigui parks**](https://www.wribrasil.org.br/noticias/solucoes-baseadas-na-natureza-exemplos-implementados-por-cidades-brasileiras) and [**São Paulo Tietê restoration**](knowledge/_success-cases/brazilian-municipal.md) are already in our KB but in pure-text form — they'd shine as 3-photo cards with 1-line each.

## What we therefore ask + show in E2

Synthesizing — the encontro flows in **3 beats**, with the order swapped between the two paths:

### Beat 1: Educational anchor (~10 min, Antônia/Julia-led offline + platform showcase)

In-room: facilitator introduces NBS using 3-4 photographed Brazilian examples. Coordinator-led, not platform-driven.

Platform: when the CBO opens E2, the chat surfaces a **"Exemplos no Brasil"** card with 3 cases visible inline (Curitiba parks · Tietê · Várzea Lab Vila Flores). Tappable, dismissible, optional reference during the encontro.

### Beat 2: Map + bairro context (~20 min on platform)

Path-aware framing:

**`has-idea` path** opens with: *"Conta sobre seu projeto atual — depois a gente abre o mapa pra você marcar onde fica."*
1. Free-text + file upload: what's the project, in your words?
2. Open map → site selection mode → CBO drops a pin / draws a small area
3. Site name (auto-suggest from OSM if available, accept user override)
4. Agent overlays the bairro's risk data: *"Esse ponto está em Cascata, numa zona de risco alto de enchente. Faz sentido com o que você vive ali?"*

**`needs-help` path** opens with: *"Vamos olhar o mapa do seu bairro juntos. As cores mostram o que mais afeta essa região."*
1. Map opens centered on CBO's `bairro_of_operation` from E1
2. Risk layers visible — agent narrates what the user sees (*"o vermelho é enchente, o laranja é calor extremo"*)
3. Dialogue: *"O que você vê aí parece com o que vocês vivem no dia a dia?"*
4. After the conversation grounds: *"Onde, no seu bairro, você acha que faz mais sentido a gente atuar?"* → site selection

### Beat 3: Hazard priority + site detail (~10 min, both paths)

After site is plotted, both paths converge:

1. **Risk Priority chips**: *"Vamos focar — desses três riscos, qual mais te preocupa?"* with 3 drag-rankable chips
2. **Land tenure**: *"Vocês têm acesso a esse espaço hoje?"* — chips: público / privado / misto / informal
3. **Community anchoring**: *"Como vocês se conectam com esse lugar? Quem da comunidade está envolvido?"* — free text + optional engagement-type chips

## Maturity scoring (silent, coordinator-side)

```
SITE_CONTROL (0-3)
  0  No site identified
  1  Site identified but no access (e.g. público sem permissão)
  2  Informal permission OR municipal alignment (e.g. SMAMUS knows)
  3  Formal agreement OR secure tenure (e.g. owned by org)

COMMUNITY_ANCHORING (0-3)
  0  No community involvement
  1  Beneficiaries identified but not engaged
  2  Community involved in design or implementation
  3  Community governance or cooperative ownership
```

Both inferred from the answers to the land-tenure + community-anchoring questions.

## Microapps & improvements proposed by this research

This is where the research drives concrete product decisions. Three are new, two are improvements.

### NEW · `NbsShowcaseCard` (inline in chat)
A 3-card horizontal scroller surfaced at the **start of E2** showing photographed Brazilian NBS cases. Tap a card → expands inline with a 4-line story. Reusable in E3 + E6 (pitch examples) too.

**Justification**: ABCD + WRI-Brasil framing says lead with examples, not concept. Without a way to show examples on the platform, the educational moment depends entirely on the facilitator's in-room delivery.

**Data**: a small JSON in `knowledge/_success-cases/_cards.yaml` with `{slug, title, place, year, hazard, photo, one_liner}` — pulled from existing case-study docs.

### NEW · `RiskPriorityChips` (inline in chat or as a small step in Site Explorer)
After the site is plotted, the agent renders 3 chips (Enchente · Calor · Deslizamento) the user **drag-orders** or taps in sequence. Output: `primary_hazard`, `secondary_hazard`, optional `tertiary_hazard`.

**Justification**: US Toolkit + NHESS 2025 say qualitative ranking is the right rigor for this stage. Inline chips beat a sub-microapp because the user is mid-thought after marking the site. We don't make them switch tabs.

**Implementation**: ~50 lines of React inside the chat-message rendering pipeline. New event type `ask_priority_rank` with `{question, items, defaultOrder?}`.

### NEW · Small "Community anchoring" structured composer (inline)
After the land tenure chip, agent invites a short structured response: *"Quem da comunidade está envolvido?"* with three free-text inputs scaffolded by labels: *"Líderes / Voluntários / Moradores diretamente"*. Optional engagement-type chips below: *"Assembleias · Oficinas · Mutirões · Conversas no dia a dia"*.

**Justification**: Per BPJP/C40 inclusive-action criteria + ABCD methodology, capturing *who* is anchored in the place matters as much as *where*. Free-text alone is too unstructured; chips alone miss nuance. Hybrid form is the sweet spot.

### IMPROVEMENT · `MapMicroapp` — simplification modes for community context
The existing `MapMicroapp` has composite (zone→assets) mode, draw tools, OSM layers, value tooltips — built for the BPJP municipal-grade use case. For E2's CBO context on mobile, **simpler interface needed**.

Proposed new params:
- `selectionMode: 'site'` — single-pin or small-polygon draw, no zone stepper. Default for E2.
- `selectionMode: 'browse-only'` — read-only mode for the `needs-help` path's opening map (no selection, just exploration). New mode.
- `hazardFilter: ['flood' | 'heat' | 'landslide']` — agent passes which hazard layers to show. Default: all three for `needs-help` start; just the bairro's top hazard for `has-idea`.
- `showLegendSimple: boolean` — collapses the 48-layer legend to 3 hazard swatches + 1 site-pin swatch.

**Justification**: Current map is "too much" for first-time community users. We don't remove power — we let the agent dial complexity down.

### IMPROVEMENT · Bairro autocomplete (carryover from E1)
The bairro autocomplete proposed in E1's spec gets used heavily here: the map opens centered on the CBO's `bairro_of_operation` from E1. If unset (E1 was skipped or `bairro_of_operation` was free-text), the agent asks at the start of E2.

## What we do NOT do at E2 (deliberate exclusions)

- Pick a specific intervention type → E3
- Size the intervention → E3
- Estimate impact → E4
- Discuss operations → E4
- Full equity diagnostic → already light-touched at E1, deepens later in E5 (regulatory awareness) + E6 (pitch)

## Open questions

1. **Map opens in chat? Or tabs immediately to map?** — On mobile, the existing mobile-tabs pattern auto-switches to the Mapa tab when `open_map` fires. On desktop, the right rail shows the map. Either way: when the user opens E2, the *first* agent message stays in chat; the map only opens on a subsequent agent turn after they've responded to the framing question. Pacing matters.
2. **The `needs-help` opening — map first or chat first?** — Research suggests starting with community knowledge ("what do you see in your day-to-day"), not with the data overlay. So: **chat first, map second.** Tested by JVP + Julia in a dry run before going live.
3. **Showcase cards: 3 or 6?** — 3 is the design default. If the user wants more after seeing 3 (rare in a 30-min slot), the agent can read additional examples from KB on request.

## Sources

### Internal KB
- `knowledge/_interventions/*.md` — 6 funder-grade intervention docs (good for E3, lighter version needed for E2)
- `knowledge/_success-cases/brazilian-municipal.md` — Curitiba + São Paulo + others
- `knowledge/_cougar/sample-cbo-vilaflores.md` — Várzea Lab as a POA reference
- `knowledge/_cougar/nbs-mapping-criteria.md` — Site Control + Community Anchoring rubrics
- `knowledge/_inclusive-action/participatory-frameworks.md` — BPJP/C40 community engagement criteria

### External (Brazilian framing)
- [Ekos Brasil · Soluções Baseadas na Natureza](https://www.ekosbrasil.org/solucoes-baseadas-na-natureza/) — accessible PT framing + concrete examples
- [WRI Brasil · Exemplos Brasileiros](https://www.wribrasil.org.br/noticias/solucoes-baseadas-na-natureza-exemplos-implementados-por-cidades-brasileiras) — photographed cases from Brazilian cities
- [USP GIPSBN](https://sites.usp.br/gipsbn/en/solucoes-baseadas-na-natureza/) — Brazilian academic grounding

### External (community methodology)
- [Catalytic Communities · LEED-UP](https://rioonwatch.org/?p=17816) — 4-step community-led upgrading
- [Sustainable Favela Network · ABCD](https://catcomm.org/sustainable-favela-network/) — asset-based development
- [Frontiers · Participatory NBS in Global South](https://www.frontiersin.org/journals/sustainable-cities/articles/10.3389/frsc.2022.956534/full) — citizen science + serious games
- [ScienceDirect · Participatory NBS in flood landscapes](https://www.sciencedirect.com/science/article/abs/pii/S1462901122003525) — empirical patterns

### External (hazard prioritization)
- [US Climate Resilience Toolkit · Step 2](https://toolkit.climate.gov/content/step-2-assess-vulnerability-and-risks) — qualitative is enough
- [UN-Habitat · Community Climate Risk Guide](https://unhabitat.org/climate-change-vulnerability-and-risk-a-guide-for-community-assessments-action-planning-and) — gold-standard CRA
- [NHESS 2025 · Community-driven hazard assessment](https://nhess.copernicus.org/articles/25/4451/2025/) — peer-reviewed evidence
