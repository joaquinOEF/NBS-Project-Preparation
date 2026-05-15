# E4 — Impacto · operações · sustentabilidade — Spec

**Status**: draft for review · **Builds on**: `research.md` in this folder · **Date**: 2026-05-15

## In one sentence

In ~50 min, the CBO sees the computed impact of their project (with ranges + assumptions), designs the 3-phase operations team, and picks a financial-sustainability model — generating two more maturity scores (Climate NBS Impact, Financial Thinking).

## Core design principle

**Show what's computable, ask what's not.** Impact is computed deterministically from a YAML — *not* an LLM call. Operations data only the CBO knows is asked. This separation is the reason the encontro can fit in 50 min and still produce funder-grade content.

## Flow — 3 beats

| Beat | What happens | Time | Microapp |
|---|---|---|---|
| 1. **Impacto** | Calculator computes 3-4 indicator ranges + assumptions + sources from intervention type + area + bairro hazard. One optional follow-up: monitoring plan. | ~20 min | `ImpactCalculator` (new) |
| 2. **Operações** | 3-phase operations form: Year 1 / Year 2-3 / Year 3+. Team composition + time commitment per phase + auto-computed cost. | ~20 min | `OperationsDesigner` (new) |
| 3. **Como vai durar** | Sustainability model picker: 5-pattern multi-select + primary designation + monthly target + revenue rationale. | ~10 min | `SustainabilityModelPicker` (new) |

## Data captured — every field justified

| Field | Type | Why | Skipping cost |
|---|---|---|---|
| `impact_indicators[]` | structured — array of `{indicator, value_range, units, assumptions, source}` | Computed by calculator; persisted so funder concept note can render it | Auto-captured |
| `monitoring_plan` | string (free text, 1 sentence) | **Climate NBS Impact** scoring input — how do they know it works? | Medium |
| `ops_y1_team` | structured — `{roles[], hours_per_week_band, paid_count, volunteer_count}` | Implementation-phase team | High |
| `ops_y2_3_team` | structured (same shape) | Stabilization phase | High |
| `ops_y3plus_team` | structured + `governance_model` enum | Steady-state phase | High |
| `ops_y1_cost_brl` | int (auto-computed from area × intervention's Year-1 rate) | Sanity check | Auto |
| `ops_y2_3_cost_brl` | int (auto) | Sanity check | Auto |
| `ops_y3plus_cost_brl` | int (auto) | Sanity check | Auto |
| `ops_5yr_total_brl` | int (derived) | Total OPEX over 5 years | Auto |
| `sustainability_models[]` | multi-chip: `community-fund`/`municipal-cost-share`/`fee-based`/`grant-cycles`/`PES`/`other` | **Financial Thinking** scoring input | High |
| `sustainability_primary` | enum (one of above) | What the user thinks is their main source | High |
| `monthly_target_brl_band` | enum: `<500`/`500-2000`/`2000-10000`/`>10000` | Sanity check against OPEX | Medium |
| `revenue_rationale` | string (free text, 1-2 sentences) | Why this model fits | Medium |

**Total: 13 fields, mostly structured.** The free text (`monitoring_plan`, `revenue_rationale`) is short — 1-2 sentences each.

## Maturity scoring (silent, coordinator-side)

```
CLIMATE_NBS_IMPACT (0-3)
  Inputs: intervention_area_m2 (from E3) + the impact_indicators[] computed +
          monitoring_plan field

  0  No impact narrative captured
  1  Calculator shown but monitoring_plan blank
  2  Calculator shown + monitoring_plan describes any method ("photos before/after")
  3  Calculator shown + monitoring_plan with specific metrics + community
     participation in monitoring (e.g. "registramos chuvas + fotos mensais com
     o grupo de jovens")

FINANCIAL_THINKING (0-3)
  Inputs: ops_*_team + ops_*_cost_brl + sustainability_models[] + revenue_rationale

  0  No financial thinking captured
  1  Year 1 OPEX only, no sustainability model
  2  3-phase OPEX captured + sustainability_models has ≥1 selection
  3  3-phase OPEX + ≥2 sustainability_models + revenue_rationale names
     concrete partners or revenue streams
```

## Microapps & improvements proposed by this research

### NEW · `ImpactCalculator`

The biggest new component of the whole curriculum. Deterministic computation engine — **not an LLM call**. Reproducible outputs.

**Inputs**:
- `intervention_type` (from E3)
- `intervention_area_m2` (from E3, sketched)
- `bairro` (from E2) — used for climate context lookup
- `primary_hazard` + `secondary_hazard` (from E2) — filter which indicators to show

**Outputs** — 3-4 indicator cards, each with:
- Indicator name + icon
- Value as a **range** (min, max)
- Units (m³/ano, °C, tCO₂e/ano, pessoas)
- "Ver assumptions →" → expands to: site characteristics used, climate band, source citation, "with vs without" comparison when possible

**Indicator catalog** (max 4 per project, filtered by hazard):
- 🌊 **Water captured** — m³/ano (always shown for flood-relevant interventions)
- 🌡️ **Local cooling** — °C in radius (always for heat-relevant)
- 🌱 **Carbon sequestration** — tCO₂e/ano (for vegetation-heavy interventions)
- 👥 **People served — direct** — count (always)
- 🏠 **People served — indirect** — count, within 200m (always)
- 🌳 **Canopy added** — m² (urban forest only)
- 🛣️ **Impervious area reduced** — m² (bioswale, flood park)

**Data source**: `_impact-coefficients/by-intervention.yaml` (new — to be authored). Structured per intervention × per indicator. Every value cites its literature source.

**Effort**: ~200 lines React for the component + ~150 lines YAML for the coefficient data file. The YAML is where the careful work is — every coefficient with citation. **Each coefficient should be reviewed by JVP before pilot launch.**

### NEW · `OperationsDesigner`

Three collapsible sections — Year 1 / Year 2-3 / Year 3+. Each section captures team composition, time commitment, and auto-computed cost.

**Per-section structure**:
- Team roles (chip multi-select + optional free text): voluntários · coordenador pago · parceiros externos · prefeitura · universidade · outro
- Hours/week from the team (chips: `<5` / `5-15` / `15-40` / `40+`)
- Auto-computed estimated cost: `area_m2 × intervention_year_rate × adjustment_for_team_intensity`
- Free text (optional): "Algo específico desse momento?"

**Bottom of the form**: live total **OPEX over 5 years** as a sanity check, plus a note: "É bastante? Tudo bem ajustar a equipe."

**Data source**: `_operations-templates/<intervention>.yaml` (new — one per intervention type). Year-rate ranges (R$/m²/year) per phase.

**Effort**: ~150 lines React + 6 YAML files (one per intervention).

### NEW · `SustainabilityModelPicker`

5-chip multi-select + 1 primary designation + 2 short fields.

**5 patterns** (chips):
- 🤝 Fundo da comunidade
- 🏛️ Apoio da prefeitura
- 💰 Receita do próprio projeto (venda, eventos)
- 📅 Ciclos de grant (3-5 anos)
- 🌱 Pagamento por serviços ambientais (PSA)
- + `Outro` (free text)

After selecting 1-3 chips, user designates 1 as primary (single-select). Then 2 short fields:
- *Quanto você acha que precisa por mês pra sustentar?* (range bands)
- *De onde você imagina vir a maior parte do dinheiro?* (free text, 1-2 sentences)

**Effort**: ~70 lines React.

## Doc panel layout for E4

Adds two cards after E3's layout:

```
┌─ Sua intervenção ─────────────────┐  ← E3
└───────────────────────────────────┘
┌─ Impacto esperado ────────────────┐  ← NEW (E4)
│ 🌊 Captação:  1.800–3.200 m³/ano   │
│ 🌡️ Resfriamento: 0.3–0.8 °C        │
│ 🌱 Carbono:   0.4–1.2 tCO₂/ano     │
│ 👥 Pessoas:   ~120 diretas         │
│              ~500 indiretas       │
│ Monitoramento: "Fotos mensais     │
│   + registro de chuvas com jovens"│
└───────────────────────────────────┘
┌─ Operações e sustentabilidade ────┐  ← NEW (E4)
│ Ano 1:    8 voluntárias + 1 pago  │
│           ~R$ 15k/ano             │
│ Ano 2-3:  Equipe menor (5)        │
│           ~R$ 7k/ano              │
│ Ano 3+:   Rotação + UFRGS         │
│           ~R$ 5k/ano              │
│ Total 5 anos:  ~R$ 39k            │
│ Modelo:   Fundo comunidade +      │
│           Apoio prefeitura        │
│ Alvo:     R$ 500-2.000/mês        │
└───────────────────────────────────┘
```

## Preamble screen

```
ENCONTRO 4 — Impacto · operações · sustentabilidade
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

O encontro onde o projeto vira sério. Hoje:

  · Ver o impacto esperado (com faixas, não
    números mágicos)
  · Pensar em quem cuida do projeto depois
    de pronto
  · Falar de dinheiro — como sustentar

Você vai usar:
  · Calculadora de impacto
  · Planejador de operações
  · Seletor de modelo de sustentabilidade

Tempo estimado: 45–60 min · Salva sozinho

                    [ Começar  → ]
```

## What ships when we build E4

**New components**
- `ImpactCalculator.tsx` (+ companion `_impact-coefficients/by-intervention.yaml`)
- `OperationsDesigner.tsx` (+ companion `_operations-templates/*.yaml` — 6 files)
- `SustainabilityModelPicker.tsx`
- `encontro-4-impacto-operacoes.md` agent skill

**Modified components**
- `cbo-profile.tsx` — register new agent events (`show_impact`, `ask_operations`, `ask_sustainability`)
- `cbo-schema.ts` — extend `impact_monitoring` + `operations_sustain` sections with the new fields

**KB content** — heavy authoring needed
- `_impact-coefficients/by-intervention.yaml` (new) — **the critical piece**, every coefficient cited
- `_operations-templates/*.yaml` (new, 6 files)
- `_sustainability-models/*.md` (new, 5 files explaining each pattern)

## Out of scope for E4

- Funding need amount (specific R$ ask, breakdown) → E5
- Permits, regulatory awareness → E5
- Partner identification (specific names) → E5
- Project pitch → E6

## Open decisions before building

1. **Coefficient review process** — every value in `by-intervention.yaml` should be reviewed by JVP (or an external NBS specialist) before pilot launch. This is the highest-stakes content in the platform. Suggest a structured review pass: 1 spreadsheet listing each coefficient + source URL + reviewer-OK column.

2. **"People served" — direct vs indirect** — show both? Show only direct (more defensible)? Show user-selectable? Recommended: show both, with clear labels (*"diretas" = na área de intervenção, "indiretas" = no raio de 200m*).

3. **5-year vs 3-year horizon** — captures 3 phases explicitly; the 5-year total is an arithmetic extrapolation. Worth flagging this to the user? Probably yes, in small text: *"estimativa pra 5 anos com base nas 3 fases. Pode mudar."*

4. **"Help me estimate" mode in OperationsDesigner** — pre-fills with typical-for-this-intervention values. Should be a button per section, clearly labeled "estimate só pra começar, ajuste pra sua realidade." Recommended yes — saves the user from staring at empty fields.

5. **PES eligibility flagging** — if intervention scale crosses thresholds (>1 ha forest, >500 m² wetland, etc.), the Sustainability picker could flag PES as a strong option. Recommended yes, with a small explanation card.
