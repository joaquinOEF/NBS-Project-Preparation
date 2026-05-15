# E4 — Impacto · operações · sustentabilidade — Research notes

**Goal of this encontro**: Quantify the project's impact (ranges + assumptions, NOT point estimates) + design who operates it + design how it sustains past year 1. The encontro where an *idea* becomes *a serious project* — funders need this content. ~50 min of platform time.

By E4 both paths from E1 are long converged.

## What the research says

### Impact quantification — ranges, not point estimates

This is the single strongest signal from the lit review for E4 design.

[**MDPI Sustainability 2024 · Cooling Benefits of Urban Tree Canopy: A Systematic Review**](https://www.mdpi.com/2071-1050/16/12/4955) and the [**US Forest Service 2025 review (2018-2024 literature)**](https://research.fs.usda.gov/treesearch/69435) — meta-analyzed 115-182 studies. Two key takeaways:

1. **Cooling effects vary widely** — 0.5-5 °C air temperature reduction depending on canopy density, climate, urban morphology, and species. **A single point estimate is dishonest.**
2. **Land surface temp ≠ air temp** — researchers conflate them often; we should pick one and stick (air temp is what humans feel).

[**Nature Communications · Cooling efficacy of trees across cities (2024)**](https://www.nature.com/articles/s43247-024-01908-4): cooling per 10% canopy increase ranges 0.16-0.64 °C across cities. Climate + morphology + species matter more than headline numbers.

**Implication for E4**: every impact metric the calculator shows must be a **range with assumptions visible**, not a point estimate. *"Reduces local temperature by 1-2°C"* — with the assumptions ("assuming 50% canopy density on a 320 m² site, mixed-species, deciduous/evergreen blend") shown when the user taps "ver detalhes."

### Brazilian impact benchmarks (from our existing KB)

`knowledge/_evidence/impact-benchmarks.md` already has ground-truthed Brazilian numbers we can use:

**Cooling (urban trees)**
- Urban tree canopy expansion: 1-3 °C cooling in surrounding area
- Porto Alegre's urban forest sequesters 15.67 tonnes CO₂/year (whole-city)
- Health co-benefit: USD 50-200 per person/year reduced heat-related illness

**Flood**
- Urban park flood mitigation: **5% cheaper** than concrete equivalent (Curitiba data)
- Per household benefit: USD 500-2,000/year avoided flood damages
- Rain gardens: capture ~80% of stormwater from contributing impervious area

**Carbon sequestration (tCO2e/ha/year)**
- Atlantic Forest restoration: 5-15
- Wetland restoration: 2-8
- Urban tree planting: 0.5-2 per tree over lifetime
- Grassland restoration: 1-3

**Restoration costs** — already detailed by ecosystem + intervention type. Good as-is for the calculator's cost-range outputs.

### Operations sustainability — the literature, light

There's surprisingly little peer-reviewed research on community-led NBS operations longitudinally — most academic literature focuses on implementation, not the 3-5 year sustainability question. What we found:

[**ResearchGate · Financing and Implementing NBS in Urban Areas (Global South Local Actors Guide)**](https://www.researchgate.net/publication/380040380): emphasizes that **project developers must assess O&M costs alongside capital costs** and that community participation in maintenance is critical for sustainable infrastructure. *"Local actors may need to share responsibility for the NBS maintenance to provide more sustainable infrastructure."*

[**Wiley Global Change Biology · NBS critical for Brazil net-zero 2050**](https://onlinelibrary.wiley.com/doi/10.1111/gcb.16984): operationally, sustainable Brazilian NBS programs (Amazon Fund's *aglutinadores* model, Bolsa Floresta) rely on **intermediary organizations + PES schemes + community compensation** structures. Community-only is rare; mixed-financing is the norm.

[**Community Garden Management Toolkits (multiple — Milwaukee, Foodinneighborhoods, N2N Centre)**](https://foodinneighborhoods.org/wp-content/uploads/2020/07/CGMgtmtToolkit.pdf): operational patterns for community-managed green spaces follow 3 phases:
- **Year 1 — establishment**: ~3× the steady-state maintenance load. Volunteer fatigue is real here.
- **Year 2-3 — stabilization**: figuring out who's actually committed long-term. Many projects die in this phase.
- **Year 3+ — steady state**: stable team, predictable monthly load, possible revenue streams kick in.

**Implication for E4**: the Operations Designer should ask about all 3 phases separately, not just "monthly maintenance." Year 1 vs Year 3 are different beasts.

### Financial sustainability — the 5 patterns

Synthesizing literature + Brazilian context, community NBS projects sustain through one (or a mix) of 5 patterns:

| Pattern | How it works | Brazilian example |
|---|---|---|
| **Community fund** | Members + local supporters contribute monthly/yearly | Some CBOs in 4º Distrito |
| **Municipal cost-share** | Prefeitura covers a portion of O&M (often after demonstrating value) | Curitiba parks maintenance |
| **Fee-based** | Charges for services produced by the NBS (food, workshops, events) | Translab community gardens selling produce |
| **Grant cycles** | 3-5 year cycles of funded operations (e.g. BPJP, QCF, Caixa) | Vila Flores Várzea Lab (US$900K Caixa Federal) |
| **PES / payment for ecosystem services** | Government or insurer pays for measurable services (carbon, water) | Bolsa Floresta, Amazon Fund aglutinadores |
| **Mixed** | Combination of 2+ above | Most successful projects |

Most CBOs end up at **Mixed**. The pickability should encourage thinking about combinations, not a single source.

### Operations cost — Brazilian community-scale benchmarks

From our existing `_evidence/impact-benchmarks.md` + the operations-toolkit literature:

| Intervention | Year 1 OPEX | Year 2-3 OPEX | Year 3+ OPEX | Notes |
|---|---|---|---|---|
| Rain garden / bioswale | R$ 30-80/m²/yr | R$ 15-40/m²/yr | R$ 10-25/m²/yr | Year 1 = establishment + weed pressure |
| Urban forest | R$ 50-150/tree/yr | R$ 20-60/tree/yr | R$ 10-30/tree/yr | Year 1 = waterings, pruning of failures |
| Green corridor | R$ 25-70/m²/yr | R$ 12-35/m²/yr | R$ 8-20/m²/yr | Linear, includes paths/access |
| Green roof | R$ 40-120/m²/yr | R$ 20-50/m²/yr | R$ 15-40/m²/yr | Membrane checks, plant replacement |
| Flood park (wetland) | R$ 20-60/m²/yr | R$ 10-30/m²/yr | R$ 5-20/m²/yr | Sediment removal, plant management |

These get baked into the `_operations-templates/*.md` content (new authoring needed) and consumed by the Operations Designer for cost estimation.

## What we therefore do in E4

3 beats over ~50 min:

### Beat 1: Impacto (~20 min)

Agent opens:
```
No último encontro você desenhou 320 m² de jardim de chuva em Cascata. Vou abrir a calculadora pra você ver o impacto esperado.
```

Invokes the **Impact Calculator**. The calculator reads `_impact-coefficients/by-intervention.yaml` + the user's site + intervention parameters. Renders 3-4 indicator cards with **ranges + assumptions + source citations**:

```
🌊 Captação de água da chuva       1,800–3,200 m³/ano
🌡️ Resfriamento local               0.3–0.8 °C
🌱 Sequestro de carbono             0.4–1.2 tCO₂e/ano
👥 Pessoas atendidas diretamente    ~120 (3 quarteirões)
```

Each indicator has a `Ver assumptions →` link that expands to show: site size used, intervention type, climate context, source citation.

Agent narrates: *"Para sua área de 320 m² em zona urbana com clima subtropical, jardim de chuva captura entre 1.800 e 3.200 m³ de água por ano. A faixa varia conforme a intensidade da chuva — Porto Alegre tem chuva forte concentrada, isso te coloca na faixa de cima."*

User can ask for clarification, but no input needed at this beat — it's a computed display.

After the user confirms they've read it, agent asks one optional follow-up:
```
Você tem alguma forma de medir ou contar o impacto enquanto o projeto vai rolando? (Ex: fotos antes/depois, registro de chuvas, contagem de famílias)
```

This goes into `monitoring_plan` — feeds Climate NBS Impact scoring.

### Beat 2: Operações (~20 min)

Agent transitions:
```
Bom — agora vamos pensar em quem cuida do projeto depois de pronto. Isso é o que mais quebra projetos comunitários: implementação acontece, manutenção some.
```

Invokes the **Operations Designer**. 3 phases as separate sections:

**Ano 1 — Implementação + estabelecimento**
- Quem está no time? (free text + chip multi-select: volunteers / paid coordinator / external partners)
- Quantas horas/semana o time todo dedica? (chips: <5 / 5-15 / 15-40 / 40+)
- Custo estimado: auto-computed from area × Year 1 rate

**Ano 2-3 — Estabilização**
- Quem continua? (chips: same team / smaller core / new people / unsure)
- O que muda em relação ao Ano 1?
- Custo estimado: auto-computed from area × Year 2-3 rate

**Ano 3+ — Estado estável**
- Modelo de governança? (chips: rotação de voluntários / coordenação remunerada / cuidado da prefeitura / parceiros institucionais / outro)
- Custo estimado: auto-computed from area × Year 3+ rate

After all 3 phases captured, agent surfaces the **total OPEX over 5 years** as a sanity check.

### Beat 3: Como vai durar (~10 min)

Agent transitions:
```
Última parte: como o projeto se sustenta financeiramente? Não precisa ter resposta certinha — só queremos entender a ideia.
```

Invokes the **Sustainability Model Picker** — multi-select chips for the 5 patterns + a free-text "outro." Plus 2 short fields:

- *Quanto você acha que precisa por mês pra sustentar?* (R$ range)
- *De onde você imagina vir a maior parte do dinheiro?* (free text, 1-2 sentences)

User picks 1-3 patterns + a primary one + writes a short rationale. Feeds Financial Thinking scoring.

## Maturity scoring (silent, coordinator-side)

```
CLIMATE_NBS_IMPACT (0-3)
  Inputs: intervention_type + intervention_area_m2 + monitoring_plan + the agent's
          read of how confidently the impact estimate's assumptions match the site

  0  No impact narrative
  1  Generic ("vai ajudar com a enchente")
  2  Quantified range presented + monitoring plan vague ("vamos tirar fotos")
  3  Quantified range + clear monitoring plan with metrics + community participation
     in monitoring

FINANCIAL_THINKING (0-3)
  Inputs: ops_phase_1 + ops_phase_2_3 + ops_phase_3plus + total_opex_5yr +
          sustainability_model[] + primary_revenue_source

  0  No financial thinking
  1  Implementation cost only, no OPEX
  2  3-phase OPEX captured, sustainability model selected (single or multiple)
  3  3-phase OPEX + ≥2 sustainability models + named partners or
     concrete revenue stream described
```

## Microapps & improvements proposed by this research

### NEW · `ImpactCalculator` (the largest new component)

Deterministic computation engine, **NOT an LLM call**. Inputs: intervention type, area in m², bairro hazard profile, climate context. Outputs: 3-4 indicator cards with ranges + assumptions + sources.

- Reads from `_impact-coefficients/by-intervention.yaml` (new data file — structured)
- Cards: hazard-specific (water captured, °C cooling, tCO₂e, people served, area shaded, etc.)
- "Ver assumptions →" expands per card to show: site characteristics used, climate band, source citation
- Side-by-side "with vs without" comparison when possible
- ~200 lines React + a ~150-line YAML data file. **The data file is the hard part** — every coefficient must be sourced.

### NEW · `OperationsDesigner` (structured 3-phase form)

Three collapsible sections (Year 1 / Year 2-3 / Year 3+). Each captures:
- Team composition (chips + free text)
- Time commitment (chips: hours/week)
- Auto-computed cost (read from `_operations-templates/<intervention>.yaml`)

Bottom of the form: total 5-year OPEX as a sanity check.

~150 lines React + the operations-templates data files (new authoring, 6 templates).

### NEW · `SustainabilityModelPicker` (multi-select chips + 2 short fields)

5 chip options + "outro." User picks 1-3 + designates 1 as primary. 2 short text fields: monthly target + revenue source rationale.

~70 lines React. The pattern matches E2/E3's inline composers.

### IMPROVEMENT · Doc panel — add "Impacto + operações" card

Two new cards land on the Perfil tab after E4. Structure:
```
Impacto esperado: water captured, °C cooling, ...
Equipe: Ano 1 / Ano 2-3 / Ano 3+
Sustentabilidade: modelos + custo mensal alvo
```

## KB content to author

This is where E4 needs the most new content:

1. **`knowledge/_impact-coefficients/by-intervention.yaml`** — structured coefficient tables per intervention × per hazard. Every value sourced (cite the source URL or doc). Used by ImpactCalculator. ~150 lines YAML, but reflects deep lit work.

   Example structure:
   ```yaml
   bioswales-rain-gardens:
     stormwater_capture:
       value_range: [5.6, 10.0]  # m³ per m² of intervention per year
       assumptions: "subtropical climate, 80% impervious contributing area"
       source: "_evidence/impact-benchmarks.md + CNT Green Values Calculator"
     temperature_cooling:
       value_range: [0.1, 0.4]  # °C in 50m radius
       assumptions: "limited cooling — bioswales primarily for water, not heat"
       source: "MDPI Sustainability 2024 systematic review"
     # ...
   ```

2. **`knowledge/_operations-templates/*.md`** — 6 files, one per intervention type. Each covers Year 1 / Year 2-3 / Year 3+ ops patterns + cost ranges + common failure modes. ~200-300 words each.

3. **`knowledge/_sustainability-models/*.md`** — 5 files (community-fund, municipal-cost-share, fee-based, grant-cycles, PES). Each ~150 words: how it works, what's typical for Brazilian CBOs, where to look for partners. Plus a "mixed" overview.

## What we do NOT do at E4

- Funding need amount (specific R$) → E5
- Permits / regulatory → E5
- Final project pitch → E6

## Open questions

1. **The Impact Calculator's "people served" indicator** — for a bairro-scale site, "people served" could mean direct beneficiaries (within site footprint) or indirect (within 200m radius). Both? Show both with different labels. *Direct beneficiaries* are easier to defend; *indirect* are bigger numbers. Both serve different funder audiences.

2. **5-year OPEX horizon — or 10?** — BPJP / QCF funders usually ask 5-year horizons. Most CBOs can't plan past 3. Compromise: capture 3 phases explicitly (Year 1, 2-3, 3+), extrapolate to 5 years arithmetically.

3. **"Help me estimate"** — should the OperationsDesigner have a button that auto-fills with typical-for-this-intervention-type defaults? Yes — but make it clearly labeled as "estimate só pra começar, ajuste pra sua realidade."

4. **Carbon credit / PES eligibility flagging** — if the user's project scale crosses certain thresholds (e.g. >1 ha urban forest, >500 m² wetland), flag PES eligibility as an option. Probably E5-territory, not E4.

## Sources

### Internal KB
- `knowledge/_evidence/impact-benchmarks.md` — Brazilian-grounded cost + impact ranges
- `knowledge/_evidence/funded-projects-brazil.md` — funded project outcomes
- `knowledge/_co-benefits/*.md` — 6 files, structured co-benefit narratives
- `knowledge/_interventions/*.md` — each has climate_benefits + costs sections
- `knowledge/_cougar/nbs-mapping-criteria.md` — Climate NBS Impact + Financial Thinking rubrics

### External (impact)
- [MDPI Sustainability · Cooling Benefits of Urban Tree Canopy systematic review (2024)](https://www.mdpi.com/2071-1050/16/12/4955) — 115 studies
- [US Forest Service · Urban trees and cooling literature review 2018-2024](https://research.fs.usda.gov/treesearch/69435) — 182 studies
- [Nature Comm Earth & Environment · Cooling efficacy of trees across cities](https://www.nature.com/articles/s43247-024-01908-4) — per-canopy benchmarks
- [Wiley Global Change Biology · NBS for Brazil net-zero 2050](https://onlinelibrary.wiley.com/doi/10.1111/gcb.16984) — Brazilian context
- [CNT Green Values Calculator](https://cnt.org/tools/green-values-calculator) — community-scale benchmarks

### External (operations + sustainability)
- [ResearchGate · NBS Implementation Guide for Local Actors in Global South](https://www.researchgate.net/publication/380040380) — community O&M
- [Foodinneighborhoods · Community Garden Management Toolkit](https://foodinneighborhoods.org/wp-content/uploads/2020/07/CGMgtmtToolkit.pdf) — 3-phase operations pattern
- [N2N Centre · Community Garden Best Practices](https://www.n2ncentre.com/wp-content/uploads/2019/04/Community_Garden_Best_Practices_Toolkit.pdf) — volunteer model patterns
