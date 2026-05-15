# E3 — Spec addendum · two-path divergence

**Date**: 2026-05-15 · **Status**: addendum to be merged into `E3-desenhando/spec.md` (PR #142) once that PR lands
**Supersedes**: the line in the current E3 spec that says *"By E3 both paths converge. Same flow for has-idea (validating their plan) and needs-help (making first choice)"* — this is the corrected design.

## What this addendum changes

The current E3 spec is mostly correct for the `has-idea` path. It under-specifies the `needs-help` path. They converge **at the output** (chosen intervention + sketch + justification), but the path **through Beat 1** differs.

## Replace Beat 1 (Escolha) with this two-path version

### `has-idea` Beat 1 — *Confirm + refine* (~5-10 min)

1. **Selector opens pre-filtered.** Agent invokes `InterventionSelector` with:
   ```
   mode: 'confirm'
   recommendedTypes: ['<filtered by E2 primary_hazard>']
   preSelected: '<best guess from E1+E2 narrative>'
   ```
2. **Confirm or swap.** Agent: *"Pelo que conversamos, parece que **{type}** faz sentido pro seu projeto. É isso mesmo? Posso mostrar alternativas se quiser."*
   - [ É isso ] → joins Beat 2 (sketch)
   - [ Quero ver alternativas ] → switches selector to `mode: 'browse'` (joins needs-help flow at step 2 below)

### `needs-help` Beat 1 — *Discover + decide* (~10-20 min)

1. **Selector opens in browse mode.** Agent invokes `InterventionSelector` with:
   ```
   mode: 'browse'
   recommendedTypes: ['<filtered by E2 primary_hazard>']
   highlightFromInspiration: state.inspiration_picks
   preSelected: null
   ```
2. **Browse through cards.** All 6 types visible. Cards from E2's `inspiration_picks[]` highlighted with a *"você marcou em E2"* badge. Each card shows:
   - Photo (verified) + 1-line description
   - "Bom para": hazard chips (matches E2's primary_hazard get a 🎯 marker)
   - "Tamanho típico": small/medium/large ranges
   - "Já feito em": real Brazilian city/org example with link to the case
   - **"Salvar pra comparar"** toggle (per-card)
3. **Compare drawer.** Once 2+ saved, a sticky "Comparar X intervenções" button appears at bottom of selector. Opens a side-by-side mini-table:
   ```
   ┌────────────────┬───────────────┬───────────────┐
   │                │ Jardim de     │ Floresta      │
   │                │ chuva         │ urbana        │
   ├────────────────┼───────────────┼───────────────┤
   │ Bom para       │ 🎯 Enchente   │ Calor         │
   │ Tamanho típico │ 50-1000 m²    │ 500-5000 m²   │
   │ Esforço Y1     │ Médio         │ Alto          │
   │ Manutenção     │ Baixa         │ Média         │
   └────────────────┴───────────────┴───────────────┘
   ```
4. **Decide or escalate.** Agent: *"Qual ou quais te chamam atenção? Você pode escolher 1 ou 2, ou conversar com a coordenadora se ficar travada."*
   - [ Escolho essa(s) ] → joins Beat 2 (sketch)
   - [ Quero conversar ] → triggers `RequestSupport` and pauses E3 in `awaiting-support` state

**Key design choice**: the `needs-help` E3 flow uses **save + compare** as the bridge between "I'm encountering this for the first time" and "I'm committing to a choice." Mimics how people actually shop for unfamiliar things.

## Beats 2 + 3 unchanged

Beat 2 (sketch + size) and Beat 3 (justification) are identical regardless of path. Both paths produce the same output:
- `intervention_types[]`
- `intervention_area_geojson` + `intervention_area_m2`
- `justification_why_here` + `justification_what_changes`
- `construction_model[]`

E4 onwards: fully converged. No more path branching.

## `InterventionSelector` — required new params

| Param | Type | Default | What it does |
|---|---|---|---|
| `mode` | `'browse' \| 'confirm'` | `'browse'` | `confirm` shows preSelected with confirm/swap CTAs. `browse` shows all cards with multi-favorite. |
| `preSelected` | `NbsInterventionTypeId \| null` | `null` | Pre-check this card on open (confirm mode) |
| `highlightFromInspiration` | `NbsShowcaseCardId[]` | `[]` | Cards matching these E2 inspiration picks get a *"você marcou em E2"* badge |
| `recommendedTypes` | `NbsInterventionTypeId[]` | `[]` | Show these cards first, others below a divider |
| `allowFavorites` | `boolean` | `true` | Render the per-card save toggle (false for confirm-only flows) |
| `maxFavorites` | `number` | `3` | Soft cap; over this, oldest favorite drops |

When `mode: 'confirm'` and `preSelected` is set, the card grid is **collapsed by default** with only `preSelected` visible plus a "ver alternativas" link that expands to browse mode.

## New data fields for E3

| Field | Type | Why |
|---|---|---|
| `intervention_browse_favorites` | `NbsInterventionTypeId[]` | Persists user's favorites across page reloads + back-button navigation |
| `intervention_compare_viewed` | `boolean` | Telemetry — did needs-help users actually use the compare drawer? |

## Skill prompt — branching pseudocode

```
// At E3 start:
if (state.path === 'has-idea') {
  agent.say("Pelo que conversamos, parece que {pred} faz sentido. É isso?")
  agent.invoke('open_intervention_selector', {
    mode: 'confirm',
    preSelected: predict(state),
    recommendedTypes: filterByHazard(state.primary_hazard)
  })
} else {  // 'needs-help'
  agent.say("Vamos olhar as opções. Salva 1 ou 2 que te chamam atenção.")
  agent.invoke('open_intervention_selector', {
    mode: 'browse',
    recommendedTypes: filterByHazard(state.primary_hazard),
    highlightFromInspiration: state.inspiration_picks,
    allowFavorites: true
  })
}

// On user confirm:
state.intervention_types = chosen
proceed to Beat 2 (sketch)

// On user request support:
trigger RequestSupport()
pause E3
```

## Preamble screen — path-aware wording

```
// has-idea
ENCONTRO 3 — Desenhando sua intervenção
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hoje vamos formalizar sua ideia:
  · Confirmar o tipo de intervenção
  · Desenhar onde vai e quanto vai ocupar
  · Falar do por quê

Tempo estimado: 40 min · Salva sozinho
                    [ Começar  → ]

// needs-help
ENCONTRO 3 — Desenhando sua intervenção
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hoje vamos descobrir o que cabe no seu bairro:
  · Conhecer as 6 opções de SbN
  · Salvar 1-2 que te chamam atenção
  · Comparar e escolher
  · Desenhar e falar do por quê

Tempo estimado: 50-60 min · Salva sozinho
                    [ Começar  → ]
```

## What ships when we build E3 (updated)

Adds to the existing E3 spec's "What ships":

**Modified components**
- `InterventionSelector` — `mode`, `preSelected`, `highlightFromInspiration`, `allowFavorites`, `maxFavorites` params + compare drawer UI
- `cboAgent.ts` — branches skill behavior on `state.path` at E3 start

**New components**
- `InterventionCompareDrawer.tsx` — side-by-side mini-table, ~80 lines

**KB content**
- Already-planned community-tone intervention cards (no new content needed for paths)

## Open decisions

1. **Confirm-mode swap into browse**: when has-idea user clicks "quero alternativas", do we keep the original `preSelected` checked or clear it? Recommendation: keep it checked, surface as one of the cards with "sua escolha original" badge.
2. **Compare drawer max items**: 3 or 4? Recommendation: **3** — forces prioritization, fits comfortably on mobile.
3. **What happens if needs-help user saves 0 favorites and tries to advance?** Recommendation: agent gently nudges *"Salve pelo menos 1 antes de avançar — ou conversa com a coordenadora se nenhum encaixa."*

## See also

- [`../_paths/two-path-triage.md`](../_paths/two-path-triage.md) — cross-cutting design (this addendum implements its E3 section)
- [`../E2-seu-territorio/spec.md`](../E2-seu-territorio/spec.md) — `inspiration_picks` source
- E3 main spec — still in PR #142; merge this addendum into it after #142 lands
