# E6 — Portfólio · apresentação — Spec

**Status**: draft for review · **Builds on**: `research.md` in this folder · **Date**: 2026-05-15

## In one sentence

The celebration + handoff. Each CBO sees their project as part of a 10-project portfolio, leaves with a 1-page PDF card, practices their pitch, and knows what happens next. ~90 min in-room workshop with ~15-20 min of platform time per CBO during it.

## Structurally different from E1-E5

E6 is **communal**, not individual. The platform's job:
1. Render an **Aggregate Portfolio view** (orchestrator-side) for the coordinator to project
2. Generate the **1-page project card PDF** per CBO
3. Help each CBO prepare their **2-min pitch**
4. Produce a **Next Steps card** that sets `status = 'ready-for-review'` (BWB handoff)

No new maturity scores — the scorecard was completed at E5. E6 is presentation + handoff.

## Flow — 3 beats

| Beat | What happens | Mode | Microapp |
|---|---|---|---|
| 1. **Reveal** (~30 min) | Coordinator projects the AggregatePortfolioView to whole cohort. "Together, you 10 represent..." | In-room, communal | `AggregatePortfolioView` (new, orchestrator-side) |
| 2. **Card + pitch** (~50 min in-room, ~15 min platform per CBO) | Each CBO confirms their card + pitches in 2 min using the rendered card | Mixed | `ProjectCardPDF` + `PitchComposer` (new) |
| 3. **Next steps** (~10 min) | Coordinator presents what's next. Platform renders per-CBO NextStepsCard. | In-room + platform | `NextStepsCard` (new) |

## Data captured at E6

| Field | Type | Why |
|---|---|---|
| `pitch_line` | string (≤140 chars) | The elevator pitch |
| `pitch_talking_points[]` | string[] (exactly 3) | The 60s "what" + 60s "ask" structure |
| `results_evidence_photos[]` | file uploads | Final P5 evidence |
| `project_card_approved` | bool | User confirmed card content |
| `next_steps_acknowledged` | bool | Read the next-steps card |
| `status` | enum → `'ready-for-review'` | Hand off to BWB |

## Microapps & improvements proposed

### NEW · `ProjectCardPDF` — 1-page funder-grade card

Pulls from all phases. 5-6 sections:
1. **Header** — org name + bairro + 1-sentence mission (E1) + contact
2. **Site** — map thumbnail (E2/E3 polygon overlay) + bairro context
3. **Intervention** — type + size + 1-2 sentence justification (E3)
4. **Impact** — 3-4 indicator ranges (E4 ImpactCalculator output)
5. **Operations + Ask** — 3-phase OPEX (E4) + total ask + co-financing (E5)
6. **Footer** — pilot info + handoff date + COUGAR maturity score

Two flavors:
- **Preview** in the doc panel — editable inline before generation
- **PDF download** via the existing server-side PDF stack

Effort: ~200 lines React + reuse existing PDF infra.

### NEW · `PitchComposer` (inline composer)

Two structured inputs:
- **Pitch line** — 1 sentence, ≤140 chars. Pre-filled smart default: *"{intervention_label} em {bairro} pra resolver {primary_hazard} ao atender {beneficiaries}."*
- **3 talking points** — pre-filled smart defaults from earlier phases. User edits.

Optional: "ver exemplos" link → renders 2-3 real Brazilian community NBS pitches inline (from `_pitches/examples.md`).

Effort: ~70 lines React.

### NEW · `AggregatePortfolioView` (orchestrator-side)

New route `/orchestrator/portfolio`. Shows the whole cohort as a single portfolio:

```
┌────────────────────────────────────────────────────────────────┐
│ AGREGADO DO COHORT VILA FLORES        [Baixar PDF do portfólio]│
├────────────────────────────────────────────────────────────────┤
│ 10 projetos · 4.200 m² · R$ 750k–1.2M ask · ~3.500 pessoas    │
├──────────────────────────────────────────┬─────────────────────┤
│                                          │ Tipos de intervenção│
│   COHORT MAP                             │ ●●● Jardim de chuva │
│   (10 sites + intervention layer +       │ ●● Floresta urbana  │
│    risk overlay toggle)                  │ ● Corredor verde    │
│                                          │ ● Telhado verde     │
│                                          │ ● Parque inundável  │
│                                          │ ● Restauração úmida │
│                                          │                     │
│                                          │ Co-financiamento    │
│                                          │ R$ 82k leveraged    │
│                                          │                     │
│                                          │ Prontidão           │
│                                          │ 4 ready, 5 building │
│                                          │ 1 emerging          │
├──────────────────────────────────────────┴─────────────────────┤
│ Per-project mini-cards (grid)                                   │
│ [card] [card] [card] [card] [card]                             │
│ [card] [card] [card] [card] [card]                             │
└────────────────────────────────────────────────────────────────┘
```

Stats strip shows the **aggregate framing** funders care about: total m², total ask, total people, total leverage, readiness mix.

"Baixar PDF do portfólio" → bundles every project card + cover sheet + aggregate stats.

Effort: ~250 lines React + PDF bundling.

### NEW · `NextStepsCard` (small inline)

Per-CBO summary card rendered at the end of E6:
- Sua scorecard: X/27 · {band}
- Funders sugeridos: {list from GapReport}
- Próxima conversa: {date}
- BWB review: {date or "após piloto"}

Effort: ~50 lines, mostly read-only.

## KB content to author

1. **`knowledge/_pitches/examples.md`** — 2-3 real Brazilian pitch examples from our ecosystem (Vila Flores Várzea Lab, Translab Seeds of New Life, CEA Bom Jesus). Each ~150 words.

2. **`knowledge/_next-steps/post-encontro-6.md`** — what happens after the pilot. BWB review timeline, QCF €50K deployment, continuing support model.

## Doc panel layout for E6

E6 adds one card (Resultados + apresentação) and produces 2 artifacts (card PDF + portfolio PDF).

```
┌─ Resultados · apresentação ───────┐  ← NEW (E6)
│ Pitch line:                       │
│ "Jardins de chuva em Cascata pra  │
│  acabar com enchente que afeta    │
│  12 famílias toda chuva forte."   │
│                                   │
│ 3 pontos:                         │
│  1. Rua Flores alaga todo verão   │
│  2. 320m² jardim de chuva +       │
│     biorretenção                  │
│  3. Pedimos R$73-120k             │
│                                   │
│ Status: ✓ Pronto para BWB         │
└───────────────────────────────────┘

📄 [Baixar 1-página] [Ver portfólio do cohort]
```

## Preamble screen

```
ENCONTRO 6 — Portfólio · apresentação
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

O último. Hoje:

  · Ver o portfólio do cohort inteiro
  · Pegar seu cartão de 1 página
  · Apresentar seu projeto pra todos
  · Saber os próximos passos

Você vai usar:
  · Cartão do projeto (1 página)
  · Compositor de pitch (2 min)
  · Próximos passos personalizados

Tempo estimado: 15–20 min platform + apresentação ao vivo

                    [ Começar  → ]
```

## What ships when we build E6

**New components**
- `ProjectCardPDF.tsx` (preview + download)
- `PitchComposer.tsx` (inline composer)
- `AggregatePortfolioView.tsx` (orchestrator-side, new route)
- `NextStepsCard.tsx` (inline summary)
- `encontro-6-portfolio.md` agent skill

**Modified components**
- `cbo-profile.tsx` — register `show_project_card`, `ask_pitch`, `show_next_steps` events
- `cbo-schema.ts` — extend `results_evidence` section with new fields
- `orchestrator-landing.tsx` — add navigation to portfolio view

**KB content**
- `_pitches/examples.md` (new) — 2-3 Brazilian pitches
- `_next-steps/post-encontro-6.md` (new) — what happens post-pilot

## Out of scope for E6

- The funder application itself — happens post-pilot
- BWB review process — coordinator handles after the pilot
- Continuing support model — coordinator presents it; platform doesn't define it

## Open decisions before building

1. **PDF generation path**: server-side render via existing infra (cleaner, more layout control) or client-side print-stylesheet (simpler). Recommended: server-side via existing concept-note stack.
2. **Project card includes photos**: site photos (E2/E3 uploads) + intervention photo from verified manifest. Conditional render — only if photos are verified per curation standard.
3. **Pitch line character limit**: 140 chars (Twitter-era one-thought) vs 200 (more breathing room). Recommended: 140 with a "ver mais espaço" override.
4. **Aggregate portfolio: live or snapshot**: live by default, snapshot freezing after pilot for BWB handoff.
