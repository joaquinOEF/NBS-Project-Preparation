# E5 — Necessidades · prontidão — Spec

**Status**: draft for review · **Builds on**: `research.md` in this folder · **Date**: 2026-05-15

## In one sentence

In ~50 min the CBO translates the project into a fundable **ask** — money needed, permits required, gap report — completing the COUGAR maturity scorecard (9 metrics × 0-3 + 6 priority flags) for the BWB handoff.

## Flow — 3 beats

| Beat | What happens | Time | Microapp |
|---|---|---|---|
| 1. **Necessidades** | 4-category funding need breakdown + co-financing question | ~20 min | `FundingNeedBreakdown` (new) |
| 2. **Prontidão regulatória** | Permit checklist (POA-specific) + government-interest + scalability questions | ~20 min | `PermitChecklist` (new) |
| 3. **Gap Report** | Auto-generated readiness diagnostic. CBO sees friendly version; coordinator sees funder-eligibility overlay. | ~10 min | `GapReport` (new) |

## Data captured — every field justified

| Field | Type | Why | Skipping cost |
|---|---|---|---|
| `funding_capex_brl` | int (band-derived or custom) | Implementation cost | High |
| `funding_opex_y1_brl` | int (pre-filled from E4) | First-year operating | Auto |
| `funding_ta_brl` | int (band) | Technical assistance | Medium |
| `funding_engagement_brl` | int (band) | Community engagement | Medium |
| `funding_total_brl` | int (derived) | The ask | Auto |
| `co_financing_amount_brl` | int (optional) | What's already covered | Medium — feeds priority flag |
| `co_financing_sources[]` | multi-chip + named partners | Where co-financing comes from | Medium |
| `permits[]` | array of `{permit_id, status, contact_name, notes}` | Regulatory readiness | High |
| `gov_interest_status` | enum: `none`/`informal`/`formal-conversation`/`written-support` | Local government engagement | High — priority flag |
| `scalability_assessment` | enum: `replicable-easy`/`replicable-with-adjust`/`maybe`/`unique` | Beyond-one-site potential | Medium — priority flag |
| `gap_report` | array of `{type, severity, message, next_step}` | Auto-generated synthesis | Auto |

**Total: 9 user-input fields + 2 derived/auto.** Most are chips or band-pickers; minimal free text.

## Maturity scoring (silent, coordinator-side)

```
REGULATORY_AWARENESS (0-3)
  Inputs: permits[].status across the bairro × intervention permit list

  0  Permit checklist skipped OR all permits "Não iniciado"
  1  Checklist completed, all "Não iniciado" (aware but no action)
  2  ≥1 permit "Em conversa" (preliminary contact with authorities)
  3  ≥1 permit "Em processo" or "Pronto" OR documented compliance plan
```

## Priority flag assessment (binary, all 6 set by end of E5)

| Flag | Source |
|---|---|
| Land tenure secure/likely secure | Inferred from E2 `land_tenure` (`private with ownership` or `formal agreement` → met) |
| Baseline environmental data exists | Inferred from E2/E3 uploads + E4 monitoring_plan presence |
| Local government expressed interest | E5 Beat 2 `gov_interest_status` (`informal` or higher → met) |
| Potential buyers/payors identified | Inferred from E4 `sustainability_models` (PES, fee-based, or municipal cost-share → met) OR E5 co_financing_sources includes municipal/state/utility |
| Co-financing possibility identified | E5 Beat 1 `co_financing_amount_brl > 0` OR `co_financing_sources` non-empty → met |
| Scalable beyond one site | E5 Beat 2 `scalability_assessment` (`replicable-easy` or `replicable-with-adjust` → met) |

After E5, the **COUGAR scorecard is complete**: 9 maturity scores + 6 priority flags. Total: 0-27 on maturity, 0-6 on flags. This is what hands off to BWB.

## Microapps & improvements proposed by this research

### NEW · `FundingNeedBreakdown`

4 collapsible category sections:
1. **Implementação** (capex) — installation, materials, equipment
2. **Operação primeiro ano** (opex Y1) — pre-filled from E4's `ops_y1_cost_brl`, user can override
3. **Assistência técnica** — consultoria, projetos, monitoramento
4. **Engajamento comunitário** — oficinas, comunicação, capacitação

Each section: choose a R$ band (low / mid / high / very-high) **or** enter a custom amount. Bands are intervention-type-aware (a rain garden's "high" ≠ urban forest's "high").

Auto-total at the bottom. Sanity-check warning if total is way off from E4's 5-year OPEX × scale factor.

Below the total: co-financing question — *"Você tem alguma parte que já consegue cobrir? Co-financiamento conta muito pra financiadores."* — band amount + multi-chip for sources (organização própria / parceiro local / municipal / outro) + free text for named partners.

Effort: ~80 lines React.

### NEW · `PermitChecklist`

KB-driven list. Reads `_permits/porto-alegre-map.md` (new) and filters by bairro + intervention type. Renders permits as a checklist:

```
☐ SMAMUS — Licença ambiental
   "Provavelmente isenta pra <500m² — verificar"
   Contato: licenciamentoambiental@portoalegre.rs.gov.br
   Status: [Não iniciado ▾]    Notas: [____]
   Pessoa que falou: [____]
```

Status enum: `Não iniciado` / `Em conversa` / `Em processo` / `Pronto`.

After the checklist, 2 priority-flag questions (chips):
- *"Você já conversou com alguém da prefeitura sobre esse projeto, mesmo informalmente?"*
- *"Esse modelo daria pra repetir em outros bairros?"*

Effort: ~100 lines React + new KB content authoring (`_permits/porto-alegre-map.md`).

### NEW · `GapReport`

Auto-generated, two views (one for CBO, fuller for coordinator).

**CBO view** — 3 sections:
1. **Pontos fortes** — what's at maturity score 2-3, priority flags met
2. **Pra fortalecer** — what's at 0-1, missing flags. Each with a concrete next-step suggestion pulled from `_gap-recommendations/rubric-to-action.yaml`.
3. **Próximos passos sugeridos** — top 3 actions ranked by impact-vs-effort

Tone: encouraging, not judgemental. *"Climate NBS Impact ainda 1 → fortalecer adicionando 2-3 métricas específicas de monitoramento."*

**Coordinator view** (on orchestrator) — adds:
- Funder-eligibility implications: *"sem orçamento detalhado, eligibilidade pra Teia comprometida"*
- Per-funder readiness rubric: which funders this project qualifies for now vs after addressing gaps
- Maturity-score grid (9 scores in a single visualization)
- Priority-flag matrix (6 flags × met/unmet)

Effort: ~120 lines React + 2 new KB files (`_gap-recommendations/rubric-to-action.yaml` + `_readiness-criteria/funder-checklists.md`).

## Doc panel layout for E5

Adds two cards after E4's layout:

```
┌─ Necessidades de funding ─────────┐  ← NEW (E5)
│ Implementação:   R$ 45-80k         │
│ Op. ano 1:       R$ 15k (de E4)    │
│ Assist. técnica: R$ 8-15k          │
│ Engajamento:     R$ 5-10k          │
│ ─────────────────────              │
│ Total ask:       R$ 73-120k        │
│ Co-financiamento: R$ 8k            │
│   (Fundação Cásper + voluntários)  │
└────────────────────────────────────┘
┌─ Prontidão regulatória ───────────┐  ← NEW (E5)
│ SMAMUS:        Em conversa (Clayton)│
│ SMOV:          Não iniciado         │
│ DMAE:          Não se aplica        │
│ Gabinete Inov.: Conversa marcada    │
│ Gov. interesse: Sim, conversa inform│
│ Escalável:     Com ajustes          │
└────────────────────────────────────┘
```

Plus the **Gap Report** opens as a full-screen view on tap (Perfil tab).

## Preamble screen

```
ENCONTRO 5 — Necessidades · prontidão
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hoje a gente traduz o projeto em pedido:

  · Quanto custa pra começar
  · Quais autorizações você precisa
  · Diagnóstico final de prontidão

Você vai usar:
  · Calculadora de orçamento
  · Lista de autorizações de POA
  · Relatório de prontidão

Tempo estimado: 45–60 min · Salva sozinho

                    [ Começar  → ]
```

## What ships when we build E5

**New components**
- `FundingNeedBreakdown.tsx`
- `PermitChecklist.tsx`
- `GapReport.tsx`
- `encontro-5-necessidades.md` agent skill

**Modified components**
- `cbo-profile.tsx` — register `ask_funding`, `ask_permits`, `show_gap_report` events
- `cbo-schema.ts` — extend `needs_assessment` section with the new fields
- `orchestrator-landing.tsx` — show the fuller coordinator gap-report view on each member card

**KB content to author**
- `_permits/porto-alegre-map.md` — POA department/permit mapping (critical for E5)
- `_readiness-criteria/funder-checklists.md` — per-funder rubrics
- `_gap-recommendations/rubric-to-action.yaml` — gap → suggested action mapping

## Out of scope for E5

- The actual project pitch / presentation → E6
- Submitting funding applications → after pilot
- Final BWB handoff → after pilot, but the *content* of the handoff is what E5 produces

## Open decisions before building

1. **R$ bands per category** — 4 bands (low/mid/high/very-high) intervention-type-aware. Recommended yes — saves typing, surfaces realistic ranges.
2. **Gap Report visibility** — show to CBO at end of E5 in friendly form, show coordinator a fuller version in the orchestrator. Recommended: both views, single source.
3. **Permits non-POA cities** — pilot is POA-only. The PermitChecklist needs a `city` param; data file is `_permits/<city>.md` once we expand.
4. **Co-financing breakdown structure** — recommended: separate fields for source-type (chips) + amount (band) + named-partners (free text). More structured = more usable on the funder handoff.
