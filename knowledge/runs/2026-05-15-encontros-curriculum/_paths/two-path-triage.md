# Two-path triage — cross-cutting design

**Date**: 2026-05-15 · **Scope**: cross-cutting design across E1-E6. Source of truth for how `has-idea` vs `needs-help` paths diverge and re-converge.
**Status**: draft for review

## In one sentence

We onboard two kinds of CBOs — those who already have a project idea, and those who don't — through one curriculum. The paths diverge at E2-E3 (where "I have a site + idea to refine" looks very different from "I need to discover what's possible"), then converge at E4 where both have a site + intervention + justification and the rest of the journey is identical.

## Why this matters

The COUGAR ecosystem assessment found roughly half the CBOs in our Vila Flores cohort fall into each bucket. A single linear flow that assumes everyone has an idea fails the `needs-help` group (they bail at E2 when asked *"where do you want to put it?"*). A flow that assumes nobody has an idea fails the `has-idea` group (they get bored sitting through inspirational examples they don't need). The triage at E1 lets us serve both.

## Audit of where each spec stands today

| Encontro | Path-aware status today | Gap |
|---|---|---|
| **E1** | ✓ Captures `path` field as last question | None — already split-aware |
| **E2** | ⚠ Has a 3-row "Path-aware flow" table in spec, but only Beat 2 differs (map mode); examples + chips don't adapt | needs-help path under-specified; no "I want to explore more before committing" affordance |
| **E3** | ⚠ Spec says *"By E3 both paths converge"* — handwaved. `InterventionSelector` has a vague "help mode" but no actual divergence designed | Biggest gap. needs-help folks see 6 cards for the first time at E3 — they need browse + favorite + compare, not "pick now" |
| **E4** | ✓ Genuinely converges — by here both have site + intervention | None |
| **E5** | ✓ Converges | None |
| **E6** | ✓ Converges | None |

**Cross-cutting gap**: no "pedir apoio" / "talk to the coordinator" affordance. Both paths benefit but `needs-help` folks especially need this — they may want to escalate to a real human at any point.

## The two paths — operational definitions

### `path = 'has-idea'`
The CBO arrives with a specific intervention idea (or close enough — *"we want a community garden in the empty lot on Rua X"*). The platform's job: validate, refine, formalize, get it BWB-ready.

Characteristics:
- Has a specific site in mind, often with land tenure clarity
- Has a rough sense of the intervention (even if not the formal NBS name)
- Wants forward motion, not inspiration

### `path = 'needs-help'`
The CBO arrives wanting to act on something (climate, neighborhood, equity) but doesn't have a specific project in mind. The platform's job: help them discover a fit between their bairro, their capacity, and what NBS can do.

Characteristics:
- May know the bairro but no specific site yet, or vice versa
- Has hazard awareness but no intervention vocabulary
- Wants to see options before committing

**Crucially**: `needs-help` is *not* "less serious" or "less capable." Many strong CBOs arrive without a fixed idea because they're trying to do this right.

## Per-encontro divergence

### E1 — Quem somos · diagnóstico

**No divergence here.** Identical flow. Triage happens at the **last question**:

> "Você já tem uma ideia de projeto NBS em mente, ou quer descobrir uma com a gente?"
> 
> [ Já tenho ideia ] [ Quero descobrir ]

Stored as `state.path`. Path is changeable at any time later via settings (see "Path change" below).

The card on the doc panel updates to show `⭢ Já tenho uma ideia` or `⭢ Quero descobrir`.

### E2 — Seu território · o que é NBS

**Biggest divergence after triage.** Beat 1 (educational anchor) + Beat 2 (map + site) diverge meaningfully. Beat 3 (priorities + tenure + anchoring) re-converges.

#### `has-idea` flow at E2

Linear, forward-leaning:

1. **Opening** (~2 min) — Agent: *"Vamos olhar 2 exemplos rápidos antes do mapa."* NbsShowcaseCards rendered inline as a horizontal scroll. CBO can skim or skip.
2. **Site** (~15 min) — Agent: *"Conta sobre seu projeto atual — onde fica?"* → opens Map (`selectionMode: 'site'`) centered on their E1 bairro → CBO drops pin / draws polygon → agent overlays risk for that site.
3. **Priorities + anchoring** (~10 min) — RiskPriorityChips + land tenure + CommunityAnchoringComposer. (Identical to needs-help path.)

Total: ~25 min platform time.

#### `needs-help` flow at E2

Discovery-mode, with permission to wander:

1. **Opening + extended examples** (~10 min) — Agent: *"Antes de abrir o mapa, vamos ver alguns exemplos pra criar repertório."* NbsShowcaseCards rendered inline. Agent asks the user to tap through and pick the 1-2 that resonate. Persists as `inspiration_picks[]` — used by E3 to pre-filter.
2. **Hazard browse** (~10 min) — Agent: *"Vamos ver onde os perigos estão no seu bairro."* Opens Map (`selectionMode: 'browse-only'`) with the 3 hazard layers (flood / heat / landslide) visible. Agent narrates colors. **No site commitment yet.** User can ask questions about what they see.
3. **Save-the-spot prompt** (~5 min) — Agent: *"Algum lugar onde sua organização atua ou tem laços te chama atenção?"* Two options:
   - [ Já sei onde ] → transitions to `selectionMode: 'site'` (same as has-idea step 2)
   - [ Quero conversar com a coordenadora ] → triggers `RequestSupport` (see cross-cutting affordance below) and saves state as `path: 'needs-help' · awaiting-support`. **They can pause E2 here and resume later.** The orchestrator card flags this CBO for follow-up.
4. **Priorities + anchoring** — Same Beat 3 as has-idea, once a site is selected.

Total: ~30-45 min platform time (highly variable — they may pause and resume).

**Key design choice**: the `needs-help` path **must allow exit-without-site**. We don't force a pin drop. The encontro can end in an in-between state — "explored, talked to coordinator, still deciding" — and they re-enter the same flow next week with fresh context.

### E3 — Desenhando sua intervenção

**Medium divergence.** The current E3 spec says "by E3 both paths converge" — that's wrong. They converge at the *output* of E3 (chosen intervention + sketch + justification), but the *path through* E3 differs because needs-help folks are encountering the intervention vocabulary for the first time.

#### `has-idea` flow at E3 — *Confirm + refine*

1. **Selector opens pre-filtered** — Agent invokes `InterventionSelector` with:
   - `mode: 'confirm'`
   - `recommendedTypes` filtered by E2's `primary_hazard`
   - **Best-guess pre-selection** from E2 narrative (if user mentioned "jardim de chuva" or "horta", that card is pre-checked)
2. **Confirm or swap** (~5 min) — *"É isso mesmo? Posso mostrar alternativas se quiser."* If they confirm, skip to sketch. If they want alternatives, switch to browse mode (next path).
3. **Sketch + size + justify** — As currently specified in E3 spec.

#### `needs-help` flow at E3 — *Discover + decide*

1. **Selector opens in browse mode** — `mode: 'browse'`. All 6 intervention types visible, but `inspiration_picks[]` from E2 are highlighted first. No pre-selection.
2. **Browse + compare** (~10-15 min) — User taps through cards. Each card has:
   - Photo (verified) + 1-line description
   - "Bom para": which hazards
   - "Tamanho típico": ranges
   - "Já feito em": which Brazilian city / org example
   - "Salvar pra comparar" button (toggle)
3. **Compare drawer** — Once 2+ saved, a "Comparar" sticky button appears. Opens a side-by-side mini-table (hazard fit · size band · effort).
4. **Decide or escalate** — Agent: *"Qual ou quais te chamam atenção? Você pode escolher 1 ou 2, ou conversar com a coordenadora se ficar travada."*
   - [ Escolho essa(s) ] → joins has-idea flow from "Confirm or swap" onwards
   - [ Quero conversar ] → `RequestSupport` (see below)
5. **Sketch + size + justify** — As specified.

**Key design choice**: the `needs-help` E3 flow uses **save + compare** as the bridge between "I'm encountering this for the first time" and "I'm committing to a choice." It mimics the way humans actually shop for unfamiliar things: browse → save a few → compare → decide.

### E4-E6 — Convergence

Once a CBO has site + intervention + justification, the rest is identical. Both paths use the same ImpactCalculator, OperationsDesigner, FundingNeedBreakdown, ProjectCardPDF, etc.

The only difference: in coordinator-side scoring, the orchestrator card surfaces *which path the CBO took* — useful context for the coordinator when reviewing maturity scorecards (a `needs-help` CBO scoring 16/27 at E5 traveled a much further distance than a `has-idea` CBO who already had a partnership).

## Cross-cutting affordance — `RequestSupport`

Available on every encontro's chat header for both paths. More prominent for `needs-help` folks. The minimum viable form:

```
┌─ Pedir apoio ─────────────────────────────────────┐
│ Selecione o tipo de apoio:                        │
│  ◯ Conversa com a coordenadora                    │
│  ◯ Pergunta técnica pra equipe OEF                │
│  ◯ Conexão com outro CBO que já fez algo parecido │
│  ◯ Algo sobre finanças / parceiros               │
│                                                   │
│ Mensagem (opcional):                              │
│ [____________________________________]            │
│                                                   │
│              [ Cancelar ]    [ Enviar pedido ]   │
└───────────────────────────────────────────────────┘
```

On submit: writes a `support_requests[]` entry to `member_state`, raises a notification on the orchestrator dashboard, and (optionally) posts to a Slack channel for the OEF/Vila Flores team.

The CBO sees an inline confirmation:
> Pedido enviado. {coordinator_name} vai entrar em contato em até 2 dias úteis. Você pode continuar trabalhando aqui no platform — quando ela responder, você vai ver aqui no chat.

The orchestrator-side `CohortMembersTable` (P-8 work item) gains a column "🟡 1 pendência" / "✅ atendido" for support requests.

Effort: ~120 lines (form + dialog + server route + orchestrator-side surface).

## Path change — letting people switch

A `needs-help` CBO who discovers a clear idea mid-stream (e.g., at E2 after the hazard browse) might want to switch to `has-idea`. And vice versa: a `has-idea` CBO who realizes their initial plan doesn't fit the bairro's actual hazards might want to switch to `needs-help` for a re-do.

**Mechanism**: settings option *"Mudar caminho"*. Switching:
- Updates `state.path`
- The current encontro re-renders with the new path's flow
- Already-collected data is preserved (e.g. site pin from has-idea path is kept when switching to needs-help — it just stops being treated as a commitment)

**No path-locking.** This is a self-service decision.

## Scoring impact

Path does NOT affect maturity scoring directly. The 9 COUGAR criteria are identical regardless of path — what changes is *how the data is collected*, not *what counts as evidence*.

However, the **`band` interpretation** in E5's GapReport can mention path context:

> *"Sua jornada começou com 'quero descobrir' — você chegou de 7 → 18 em 5 encontros. Isso é distância significativa pra construir."*

This humanizes the score without distorting the underlying metric.

## What ships when we build this

**New components**
- `RequestSupport.tsx` (dialog + form + chat header button)
- `InterventionSelector` — new `mode: 'browse' | 'confirm'` param + save-favorites state + compare drawer
- `MapMicroapp` — already has `'browse-only'` mode planned in E2 spec; expand its narration UX

**Modified components**
- `cbo-profile.tsx` — render path-aware skill loading; surface "Pedir apoio" button
- `cbo-schema.ts` — add `inspiration_picks[]` (E2), `intervention_browse_favorites[]` (E3), `support_requests[]`
- `cboAgent.ts` — load encontro skills with `path` context; pass to skill markdown for branching
- Settings screen — "Mudar caminho" toggle

**Modified skill prompts (E1-E3)**
- E1 skill — already has triage; no change
- E2 skill — explicit two-flow branching; add `RequestSupport` trigger
- E3 skill — replace handwaved "converged" intro with the confirm-vs-browse split spelled out here

**Orchestrator-side**
- `CohortMembersTable` — path chip + support-request indicator
- `RequestSupport` admin view — see incoming requests, mark as resolved

**KB content**
- Already-planned (NbsShowcaseCards, intervention cards, etc.) — no new KB needed for path support itself

## Open decisions

1. **Path switching mid-encontro vs at session boundaries** — recommendation: anytime via settings, but the agent doesn't proactively offer the switch (avoids decision fatigue).
2. **`RequestSupport` notification channel** — Slack for v1 (fits team's existing comms), email later. Coordinator-side dashboard surface is non-negotiable.
3. **Should the agent ever auto-suggest `RequestSupport`?** Recommendation: yes, on signal detection — repeated "não sei", visible struggle (e.g. 3+ tries on a single question), explicit *"não tenho certeza"*. Soft suggestion, not modal interruption.
4. **`inspiration_picks[]` cardinality** — limit to 3 to force prioritization, or unlimited? Recommendation: limit to 3 with override.

## Out of scope here

- Cohort-level reflection sessions (cross-CBO discussion) — coordinator runs these in-room, no platform surface
- Synchronous chat with coordinator (just async `RequestSupport`)
- Translation between paths' data shapes (they share schema — just collected differently)

## See also

- [`E1-quem-somos/spec.md`](../E1-quem-somos/spec.md) — where triage is captured
- [`E2-seu-territorio/spec.md`](../E2-seu-territorio/spec.md) — has-idea Beat 2 flow
- [`E3-desenhando/spec.md`](../E3-desenhando/spec.md) — to be updated per this doc (still in PR #142)
- [`_mobile/mobile-tabs-spec.md`](../_mobile/mobile-tabs-spec.md) — how `RequestSupport` button surfaces on mobile (lives in chat header; tap to open dialog)
