# E1 — Quem somos · diagnóstico — Spec

**Status**: draft for review · **Builds on**: `research.md` in this folder · **Date**: 2026-05-15

## In one sentence

In ~30 min of platform time, capture the CBO's identity + a 2-metric capacity diagnostic + the two-path triage, then end with the CBO feeling welcomed (not surveyed).

## Data captured — every field justified

| Field | Type | Why we ask | Skipping cost |
|---|---|---|---|
| `org_name` | string | Project card, funder handoff | Can't address the org |
| `contact_name` | string | Funder/coordinator handoff | Can't reach back out |
| `contact_role` | string | Calibrate context of answers | Minor |
| `mission_summary` | string (1 sentence) | Qualitative, project card | Low — but used in pitch |
| `legal_form` | enum: `ngo`/`associação`/`cooperativa`/`informal`/`other` | Identifiable Org gate; informal flagged for follow-up | High if missing — funder eligibility |
| `year_founded` | int | Org Delivery Capacity scoring input | Medium |
| `team_size` | enum: `1-2`/`3-5`/`6-15`/`16+` | Delivery capacity scoring | Medium |
| `paid_vs_volunteer` | structured: `% paid`, `% volunteer` (ranges OK) | Sustainability signal for E4 | Medium |
| `prior_project_scale` | enum: `none`/`ad-hoc`/`funded`/`partnership` | **Org Delivery Capacity** primary input | High — main scoring signal |
| `prior_project_evidence` | files[] | Triangulates the scale claim | Optional but accelerates score 2→3 |
| `nbs_experience` | enum: `none`/`env-education`/`gardens-and-greening`/`implemented-nbs` | **Team Technical Experience** primary input | High |
| `path` | enum: `has-idea` / `needs-help` | **Branches E2-E3 experience** | Required |
| `groups_served` | multi-select chips (8 options) | Equity baseline; consumed by E2's community_anchoring | Medium — can be filled later |
| `proud_moment` | string (free text, optional) | Trust + qualitative evidence | None — optional |
| `bairro_of_operation` | string (suggest from a POA bairro list) | Pre-fills E2's site explorer | Medium — saves time in E2 |

**Total: 14 fields** (12 substantive + 1 optional + 1 derived). The chip-heavy design means most are 1-tap answers, not free text.

## What gets scored (0-3) and how

```
ORG_DELIVERY_CAPACITY (0-3)
  Inputs: prior_project_scale + team_size + year_founded + evidence files

  Score 0  prior_project_scale = 'none' AND legal_form = 'informal'
  Score 1  prior_project_scale = 'ad-hoc'  OR  (formal org with no funded projects)
  Score 2  prior_project_scale = 'funded' AND team_size ≥ '3-5' AND (today − year_founded) ≥ 2y
  Score 3  prior_project_scale = 'partnership' OR funded project ≥ BRL 100k OR uploaded evidence triangulates

TEAM_TECHNICAL_EXPERIENCE (0-3) — NBS-specific
  Inputs: nbs_experience + evidence files

  Score 0  nbs_experience = 'none'
  Score 1  nbs_experience = 'env-education'
  Score 2  nbs_experience = 'gardens-and-greening'
  Score 3  nbs_experience = 'implemented-nbs' (corroborated by evidence)
```

Scores are written into `state.maturityScores[]` and surfaced on the orchestrator card. The CBO does not see numerical scores — they see a friendly "Diagnóstico concluído ✓".

## Doc panel layout — 4 grouped sections

The right-rail document panel (existing surface) renders as 4 cards filling in live:

```
┌─ Quem somos ──────────────────────────┐
│ Nome:        Horta Comunitária Cascata│
│ Fundação:    2018                     │
│ Forma legal: Associação               │
│ O que faz:   "Cultivamos hortas       │
│              urbanas no bairro Cascata"│
└───────────────────────────────────────┘

┌─ Equipe ──────────────────────────────┐
│ Tamanho:     6-15 pessoas             │
│ Composição:  2 pagos · 8 voluntários  │
└───────────────────────────────────────┘

┌─ Histórico ───────────────────────────┐
│ Escala anterior: Projetos financiados │
│ Experiência NBS: Hortas e jardins     │
│ Documentos:                           │
│   • proposta-2023.pdf                 │
│   • relatorio-final.pdf               │
└───────────────────────────────────────┘

┌─ Caminho ─────────────────────────────┐
│ ⭢ Já tenho uma ideia                  │
│ Comunidades servidas:                 │
│   mulheres · jovens · negras          │
└───────────────────────────────────────┘
```

Each card is editable on hover (existing `EditableField` component handles this).

## Out of scope for E1

Explicitly deferred:

- Full equity diagnostic → E2 (community_anchoring) + later phases
- Site selection → E2
- Intervention type → E3
- Detailed financials → E4
- Permits → E5

## Preamble screen (CBO entry)

1 screen, shown on first entry to E1 only:

```
ENCONTRO 1 — Quem somos
━━━━━━━━━━━━━━━━━━━━━━━━

Hoje queremos conhecer sua organização.
A gente vai conversar sobre:

  · Quem vocês são e o que vocês fazem
  · Sua equipe e suas experiências
  · Se você já tem uma ideia de projeto
    NBS, ou se quer descobrir uma com a
    gente

Tempo estimado: 20–30 min · Salva sozinho

                    [ Começar  → ]
```

## Open decisions before building

1. **Bairro suggester** — should we ship a POA bairro autocomplete now (uses the IBGE GeoJSON we already have in `client/public/sample-data/porto-alegre-neighborhood-zones.json`), or accept free text and validate later? Suggestion: **autocomplete** — small lift, big UX win, prepares E2.
2. **File upload framing** — currently we have "drop anything." Should E1's evidence question say "Want to share past project documents? It helps us understand your work."? Suggestion: **yes**, and make it the only place files are surfaced visibly until E3.
3. **The chip set for `groups_served`** — should it match the 7 BPJP groups exactly? Suggestion: **yes, plus "comunidade do bairro" as a catch-all** so orgs aren't forced into demographic framing if they don't want to.

## What ships when we build this

- New cohort_member field: `path: 'has-idea' | 'needs-help' | null`
- New CBO profile fields (added to `cbo-schema.ts`): `paid_vs_volunteer`, `groups_served`, `proud_moment`, `bairro_of_operation`
- Per-encontro skill loading in `cboAgent.ts` (E1 loads `encontro-1-quem-somos.md`)
- Preamble screen component (reusable across all encontros)
- Doc panel: E1-specific 4-card layout
- Orchestrator card: path chip + filter

No new microapps. The work is mostly schema + skill + UI surface.
