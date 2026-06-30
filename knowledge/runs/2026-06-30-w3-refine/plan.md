# Workshop 3 / Encontro 3 — "Desenhando sua intervenção" · Refine Plan

**Date**: 2026-06-30 · **Status**: refined plan, pre-build (no code yet) · **Sibling work**: W2 polish in parallel

> Companion to the 6-encontro spec at `knowledge/runs/2026-05-15-encontros-curriculum/curriculum.md`
> (see its E3 + E4 — this plan **lumps** them into one W3, matching the 5-encounter diagram and,
> as it turns out, the schema's existing 3a/3b/3c sub-phase structure).

## Summary

Author a dedicated `knowledge/_skills/encontro-3.md` skill (mirroring the composer-driven,
strict-ack E2 pattern) that runs all of phase 3 — **3a** select+size+construction, **3b**
expected impact, **3c** operations+sustainability — at full fidelity in one dense session,
scoring all four maturity metrics as it goes. Impact ships as KB-grounded narrative now, with a
clean swap-point reserved for a deterministic calculator later.

## Decisions made

- **Pacing → full depth, single encounter.** No internal phase split; one `encontro-3.md`
  covering 3a/3b/3c. Lean on composers (fast tapping, strict 3-word acks) to keep ~60-75 min
  tolerable, backed by the in-room facilitator.
- **Impact (3b) → hybrid.** Agent-narrated impact grounded in `_co-benefits/` + `_evidence/` +
  intervention specs now; the 3b beat is written so its impact step can swap to a deterministic
  `_impact-coefficients/by-intervention.yaml` calculator with **no restructuring**.

## What already exists (don't rebuild)

- `open_intervention_selector` composer — wired in `server/services/cboAgent.ts` (phase 3a),
  calibrates by `siteHazards`, pre-filters by W2's `inspiration_picks[]`.
- Schema: `intervention_type` (3a), `impact_monitoring` (3b), `operations_sustain` (3c) sections
  + the 4 metrics (`problem_clarity`, `solution_clarity`, `climate_nbs_impact`,
  `financial_thinking`) in `shared/cbo-schema.ts`.
- `NbsTypeStrip` (read-only, used in E2) and the 6 `knowledge/_interventions/*.md` KB specs
  (cost, timeline, maintenance, climate benefits).
- The monolithic system prompt in `cboAgent.ts` already narrates 3a→3b→3c — the new skill file
  **overrides** it for phase 3, same mechanism as E1/E2 (`loadEncontroSkill(3)`).

## The encounter, beat by beat

**Entry** — first tool call on phase 3 = `open_intervention_selector` (E2's analog of "first call
must be the strip"). No free-text intro; the preamble screen already framed it.

- **3a · Pick** — `open_intervention_selector({ siteHazards, preselect: inspiration_picks })`.
  Path-aware: `has-idea`/`has-project` go straight to confirming/refining their type; `needs-help`
  gets the "help me decide" guided walk. Mine docs first (`search_org_documents`) so it's
  confirm-not-ask.
- **3a · Size + construct** — *new composer (spec, no build yet)*: scale input (area m² / # units,
  seeded from W2 `site_area_m2`) + **construction model** chips: `mutirão/self-build`, `contractor`,
  `hybrid`, `municipal-partnership`. Optionally re-open `open_map` in draw mode if they want to
  sketch the footprint (computes `intervention_area_m2`). → score **problem_clarity** +
  **solution_clarity**.
- **3b · Impact** — agent reads KB, gives a qualitative impact narrative with ranges tied to a real
  case ("parecido com o DRENURBS, que reduziu…"). Captures `expected_impact`, `monitoring_plan`,
  `baseline_conditions`, `timeframe`. → score **climate_nbs_impact**. *Swap-point comment in the
  skill marks where the deterministic calculator slots in.*
- **3c · Operations** — *new composer (spec)*: Operations Designer — `ops_team`, `ops_frequency`,
  `annual_opex_brl`, `sustainability_model` (donations/fees/grants/mixed/municipal),
  `revenue_streams`. → score **financial_thinking**.
- **Close** — `update_section` for all three + the 4 `score_maturity` calls; closing message;
  **do NOT `set_phase(4)`** (coordinator gates it, same P-8 pattern as E2).

## Build steps (for when code starts)

1. [ ] **`knowledge/_skills/encontro-3.md`** — the skill, full 3a/3b/3c, strict-ack +
   every-turn-ends-in-tool-call rules, path branches, doc-mining, swap-point comment for the
   calculator. *(Core deliverable; everything else can lag.)*
2. [ ] **Scale + construction composer** — sizing input + construction-model chips. New tool in
   `cboAgent.ts` + component in `client/src/core/components/cbo/`.
3. [ ] **Operations Designer composer** — structured ops form (`shared/cbo-schema.ts` already has
   the fields).
4. [ ] **(Follow-on)** `_impact-coefficients/by-intervention.yaml` + deterministic Impact Calculator
   microapp — swapped into 3b's impact beat later.
5. [ ] KB content gap-check: `_sizing/intervention-rules.md` (reference scales) and
   `_operations-templates/` — author or stub.

## Dependencies & risks

- **⚠️ W2 handoff contract (being polished in the other tab).** 3a's selector calibration needs
  **finalized hazard ranking** (`primary_hazard`/`secondary_hazard`) from W2 — but the live E2
  currently *defers* priority/tenure/anchoring. If the W2 polish doesn't land hazard ranking, 3a
  falls back to an unfiltered type list. **This is the one thing the two tabs must agree on.** Also
  relies on `inspiration_picks[]` (only populated for `needs-help`) and W2 `site_area_m2` to seed
  sizing.
- **Length/fatigue** — full depth is ~60-75 min. Mitigation: composer-heavy (tapping > typing),
  strict acks, and design the 3a→3b boundary as a natural breath point even though it's one phase
  (so a facilitator *can* pause there without it being a hard split).
- **Impact reproducibility** — narrative ranges aren't funder-grade numbers. Mitigation: always cite
  the KB evidence source + the hybrid swap-point keeps the credible path open for the BWB handoff.

## Open seam to resolve with the W2 tab

Lock whether **hazard ranking finalizes in W2** (E2 Beat 3, currently deferred) **or moves into
W3's 3a**. The intervention selector keys off it either way — it just needs an owner.

## Success criteria

- [ ] A CBO leaves W3 with: a chosen+sized intervention, a construction model, an impact narrative,
  and an ops/sustainability plan.
- [ ] All 4 phase-3 metrics scored; `snapshotIntervention` + `intervention_area_m2` populated for
  the orchestrator card.
- [ ] `encontro-3.md` reads as cleanly as `encontro-2.md` (same guardrails) and overrides the
  monolith for phase 3.
- [ ] No `set_phase(4)` from the agent; coordinator-gated.

## Sources

- `shared/cohort-schema.ts` (DEFAULT_WORKSHOPS seed) · `shared/cbo-schema.ts` (3a/3b/3c sections + metrics)
- `server/services/cboAgent.ts` (composer tools, `open_intervention_selector`, phase narration)
- `server/services/encontroSkills.ts` (`loadEncontroSkill`) · `knowledge/_skills/encontro-2.md` (live pattern)
- `knowledge/runs/2026-05-15-encontros-curriculum/curriculum.md` (E3 + E4, the split this plan lumps)
- `docs/cbo-chat-composers.md` (composer persistence rules)
