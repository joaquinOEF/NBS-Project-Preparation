# COUGAR Platform Backlog — Refresh, 2026-05-14

Consolidates the April 16 Vila Flores demo backlog (`../2026-04-16-villa-flores-demo/backlog.md`) with new context from the April 21 internal alignment, the April 29 OEF internal check-in, the May 5 PxG↔OEF biweekly, and a fresh round of ideas surfaced by Vila Flores between meetings.

**Use this file** as the working backlog. The April 16 file is preserved as history — references below use the same P-IDs so we don't lose continuity.

---

## What changed since April 16

1. **Convening series launches week-of June 8** (second week of June, avoids the Brazilian holiday). The platform must be **active from day one of convening** — not as a follow-on tool (decision, May 5 PxG biweekly).
2. **Dedicated Vila Flores platform refinement session scheduled for the week of May 18–20** with Julia (VF coordinator) — last working window to finalize tool requirements + onboarding flow before convening.
3. **Stakeholder showcase tour week of May 25 → June 1** (Regenera, Innovation Office, MAMM/SMAMUS, possibly Secretary of Planning). Demo will be in **Portuguese**, customized per stakeholder, with Julia attending at least one session. AR leads slide consolidation; JVP trains AR on the demo.
4. **Two-stage pipeline workflow formalized**: Stage 1 = PxG/Vila Flores first filter (eligibility + maturity, ~10 priority + 10 alternate orgs by mid-June). Stage 2 = NBS Project Builder readiness/bankability assessment. NBS expert (PxG hire) sources additional projects outside the 10-org cohort. Final selection is **human** — platform supports decision-making, doesn't make decisions.
5. **November 2026 = hard milestone** for QCF €50K catalytic deployment.
6. **Three Pyxera framework misalignments still outstanding** (to resolve May 21): (a) Vila Flores not listed as Project Builder user in PxG↔VF contract, (b) "platform" terminology conflates NBS Project Builder with Transition Fund Studio, (c) "municipal feedback loop" framing is too passive vs OEF's intended co-design.
7. **Pyxera restructuring**: Kami Taylor replaces Fernanda Scur as day-to-day ops lead; FS pivots to network mobilization + VF convening support.

## Critical-path summary

| Window | What ships | Owner |
|---|---|---|
| **By May 20** | P-8, P-1, P-4, P-22, P-7 ready for the VF refinement session. Demo polish for the showcase tour. | JVP |
| **By May 25** | Stakeholder-customized demo flows (P-23). AR trained on demo. | JVP + AR |
| **By June 8** | Coordinator gating (P-8), invite/share flow (P-14), territory scorecard MVP (P-6), profile-progress (P-22), impact calc v1 (P-24). Platform usable end-to-end by the 10-org cohort. | JVP |
| **By mid-July** | Phase A of funding-overlay (P-10), public org registry MVP (P-11 lite), richer intervention cards (P-15), adaptive recipe tuned to Palafita (P-16). | JVP |
| **By November** | Bankability assessment loop with BWB; QCF deployment-ready. | JVP + BWB |

---

## New items (added 2026-05-14)

### P-23. Stakeholder-segmented demo flows
**Source**: May 5 PxG biweekly (Fernanda + Ana). Stakeholder showcase tour is one platform, multiple audiences: Innovation Office (community + innovation framing), MAMM/SMAMUS (regulatory + city-territory framing), Regenera (state fund alignment), Secretary of Planning (portfolio + bankability framing). Each lands differently.

Define 3–4 saved demo entry points that pre-load the relevant view (risk map for SMAMUS; orchestrator+CBO flow for Innovation; portfolio aggregation + funding-overlay placeholder for Planning) and skip the cold-start setup. Add a presenter-mode that hides scaffolding.

**Acceptance**: from a single URL or sample switcher, the presenter picks the audience → the platform opens on the right view with sample data already loaded; ≤2 clicks to the headline screen.

### P-24. Automatic impact calculation by selected area *(your idea #4)*
**Source**: April 16 transcript (Joaquin 41:42 *"since you selected this site, we know that the impact of what you will do would be this"*) + your message 2026-05-14.

When a CBO selects an intervention site + an intervention type, auto-compute estimated impact ranges from the 250m risk grid + intervention library (typical effect sizes per `knowledge/_interventions/*.md`). Examples: m² of canopy added → flood-peak reduction %; permeable area → infiltration capacity; tree count → cooling Δ°C. Report as bounded ranges, not point estimates, with the assumptions visible.

This is the *funder-facing* artifact: feeds the concept note's impact section and the territory scorecard (P-6).

**Acceptance**: after Phase 3a (intervention selection), the right-side panel shows "Estimated impact" with 2–4 indicators (flood/heat/canopy/people-served), each with a source + uncertainty range. Reproducible from the intervention library.

### P-25. Risk-area × planned-investment "uncovered territory" view *(your idea #1)*
**Source**: Julia (April 16) + your message 2026-05-14. **Note**: this is a refinement of P-10, not a new item — but framing matters. The original P-10 acceptance is the *overlay*; this expands it to an explicit **gap map**: a derived layer that highlights neighborhoods where risk is high *and* planned investment is low/zero. That's the layer Vila Flores wants to weaponize for the Innovation Office conversation: *"these are the territories nobody is funding."*

Merge into P-10 Phase A acceptance criteria.

**Acceptance**: in P-10 Phase A, the bairro-detail panel includes a "Coverage gap score" = f(risk, planned R$/capita). A separate map toggle "Show uncovered territory" shades only bairros where gap-score ≥ threshold.

### P-26. Educational territory scorecard (printable, didactic format) *(your idea #5)*
**Source**: Julia (April 16, 40:43) + your message 2026-05-14. **Refines P-6**, not new. The original P-6 acceptance was a coordinator-facing report. This adds a **second output**: an educational, plain-language version organizations can hand to their leadership / community members. Less data, more narrative; designed for a non-technical reader.

**Acceptance**: P-6 generates two artifacts from the same data — (a) coordinator scorecard (existing P-6 acceptance), (b) community-facing 1-pager with simple icons, plain-language risk explanations, and the org's planned interventions framed as "your contribution." Both export to PDF.

### P-27. NBS expert + Bankers-Without-Boundaries handoff surface
**Source**: April 29 internal + May 5 PxG biweekly. The platform now needs to receive projects sourced by the PxG-hired NBS expert (outside the 10-org cohort) for readiness assessment, and to hand finalized projects to BWB for bankability. Today nothing in the UI handles either.

Lightweight v1: a "submit external project" entry point (for the NBS expert, possibly a different role) that fills the same CBO schema; and a "ready for bankability review" status that surfaces the project to BWB-role users with the readiness scoring + gap list. Defer multi-tenant auth (still Phase 3 per ROLE-ARCHITECTURE.md) — for the pilot, use share-link gating + a status field.

**Acceptance**: NBS-expert can drop a project via a single-page intake (or upload a doc the agent extracts from); orchestrator sees it alongside CBO-sourced projects with an `origin` chip. A BWB-ready filter exists in the orchestrator view.

---

## New items (added 2026-05-19 — surfaced during live E1/E2 testing)

### P-28. Preserve ask_user question text in chat scrollback
**Source**: 2026-05-19 live testing (JVP). After PR #208 cut agent ack text on chip turns, the chat scrollback now shows a column of user-side chip answers (`Joaquin`, `Coordinator/Director`, `Huertas comunitárias`, `Coletivo informal`, `2010-2015`, `6-15 pessoas`, `Maioria pagas`, …) with NO record of what each was answering. Each `ask_user` event renders the question in the chip composer area only; when the user answers, the composer is replaced by the next question, and the previous Q+A pair leaves no trace in the message history.

The skill's strict-ack rule is correct (speed > warmth), but the UI assumed the agent's chat text would carry the question context. Now that text is intentionally absent, the chip composer needs to drop a compact Q+A record into the message stream when answered — something like a single-line bubble: `Forma jurídica: Coletivo informal`.

**Acceptance**:
- After every chip selection, the chat scrollback contains a compact bubble showing question label + user's chosen answer (or typed free-text)
- The bubble is visually distinct from full chat messages (smaller, no avatar, perhaps a subtle "Q:" prefix)
- Scrollback at end of E1 shows the full record: 14 Q+A pairs in order

### P-29. set_path not called when user picks "I'd like help finding one"
**Source**: 2026-05-19 live testing (JVP). At E1 closing, the user clicked the path-triage chip `🤝 I'd like help finding one` → the closing message rendered ("Profile complete — thank you Joaquin, …") but the right-panel `Path` field still showed *"Path not yet chosen"*. The `set_path` tool was never invoked.

The chip label *"I'd like help finding one"* maps to the `needs-help` enum value per `cboAgent.ts:257-260` (`set_path` tool: `path: z.enum(["has-idea", "needs-help"])`). The skill at `encontro-1.md:143-148` describes the path triage but does not explicitly tell the agent to call `set_path(<value>)` when the user selects either chip — the rule lives only in the Closing section.

Likely root cause: when the user selects the path chip mid-flow (it's one of the substantive E1 questions, not the closing), the agent doesn't always call `set_path` because the rule is filed under Closing.

**Acceptance**:
- Move the `set_path(<value>)` instruction from Closing to right next to the path-triage question itself (Question 13)
- After this fix: invite a CBO, walk E1, pick `needs-help` → `member.path` in DB is `'needs-help'`, right panel shows `Path: Help finding one`
- Same for `has-idea` selection

### P-30. E2 show_examples — user saves favorites but no clear "I'm ready" CTA
**Source**: 2026-05-19 live testing (JVP). On entering E2 (needs-help path), the agent invoked `show_examples({mode: 'favorites', intro: 'Salve 1 ou 2 que te chamam atenção.'})`. The user saved 2 examples (Parques do Barigui, Rua Gonçalo de Carvalho — marked with the bookmark icon), then waited. Nothing happened. No CTA to "continue", no auto-transition to the next step, no chip to confirm the selection.

Skill at `encontro-2.md:69-79` ("needs-help opening") says *"Wait for them to engage. Don't rush. If they save nothing after a couple of turns, gently nudge…"*. But the skill doesn't define the affordance the user uses to signal *"I'm done picking, what's next?"*. The showcase strip is decorative once saved.

Two ways to fix:
- **Option A (UI)**: add a "Pronto, vamos seguir" button to the showcase strip when ≥1 favorite is saved → sends a hidden message to the agent like `Favoritos salvos: [example_ids]` → triggers the next tool call (`open_map`)
- **Option B (skill)**: after the showcase renders, the agent's NEXT turn should be an `ask_user` chip turn ("Salvou? Vamos pro mapa?") instead of waiting indefinitely. The agent currently has no signal to wait *for*

Option A is the cleaner UX (no extra chip turn). Option B is the smaller change. Either way the dead-end has to go.

**Acceptance**:
- On the needs-help E2 path: user saves favorites → ≤5 seconds later sees an unambiguous next step (button or chip)
- Clicking that next step transitions to `open_map` (Beat 2a — browse-only mode)
- Has-idea path is unaffected (it goes straight to map without dwelling on favorites)

---

## Status of April 16 items (re-prioritized for June convening)

### Must-ship for June 8 convening

- **P-8 — Workshop-phased unlock** *(your idea #2)*. Confirmed in April 16 + May 5 meetings as the *workflow primitive* that ties platform progress to workshop cadence. Highest sequencing priority — convening series can't run without it.
- **P-4 — Profile persistence UX clarity**. Trivial. Ship.
- **P-22 — Profile-completion progress indicator**. Trivial. Ship.
- **P-1 — Risk-aware site selection during Phase 2**. UI surfacing on data we already have. Needed for the May 25 stakeholder demos.
- **P-14 — Coordinator invitation / sharing link**. Convening cohort can't self-onboard without this.
- **P-7 — Mobile optimization for CBO flow**. Palafita coordinators will use phones — gating user experience.
- **P-12 — Public vs private land filter on interventions** *(your idea #3)*. Cheap. Ship.
- **P-6 — Territory scorecard auto-generation** (now P-6 + P-26). MVP version for the coordinator; community-facing variant can follow.
- **P-24 — Automatic impact calculation v1** *(your idea #4, new)*. Even rough ranges raise the credibility of the demo for SMAMUS + Planning audiences.
- **P-23 — Stakeholder-segmented demo flows** (new). Required for the May 25 → June 1 tour.

### Ship by mid-July (Phase A of pipeline assessment)

- **P-10 — Planned-funding overlay × risk** *(your idea #1, refined by P-25)*. **The single highest-leverage feature** per April 16. Phase A only: POA Futura earmarks × risk × uncovered-territory layer. The April 16 backlog already has the source PDFs archived in `raw/`.
- **P-11 — Public organization registry (lite)**. SEO catalog of participating CBOs. The shared component library (`@oef/components`) should make this fast.
- **P-15 — Richer intervention info cards**. Material for SMAMUS / city-engineering audiences.
- **P-16 — Adaptive question tuning from VF workshop goals**. Wait for Antônia's workshop agenda; then update the cboAgent recipe.
- **P-13 — "Already doing" vs "Potential" filter**. Useful once CBOs are filling profiles in week 1 of convening.
- **P-9 — Dual-mode map (management + public)**. Pre-req for P-11 public registry.
- **P-21 — Sector-based platform segmentation** (Community / Government / Funding). Drives info architecture once P-10 + P-11 land.

### Q3 / portfolio phase

- **P-27 — NBS expert + BWB handoff surface** (new). Needed before September when the PxG NBS expert starts producing project leads outside the cohort.
- **P-17 — Pyxera scanning-criteria ingestion**. Now blocked on resolving the framework alignment (May 21 meeting) — the criteria list Andrew shared in April is the input.
- **P-5 — Territory diagnosis beyond climate** (poverty rate, schools, healthcare overlays). Becomes important when stakeholder conversations turn from risk to equity.

### Park (research only, no work this quarter)

- **P-18 HubSPOA overlap research** — defer; if Innovation Office references HubSPOA in the May 25 meeting, revisit.
- **P-19 Koalizone / PoaHabitat / PontosdeCultura UX study** — light week of work, pair with P-11 design.
- **P-20 Pontos de Cultura registry schema** — informs P-11.

---

## Open coordination questions (need PxG / VF answers)

1. **Vila Flores user role** in the PxG↔VF contract — must be resolved May 21 before we onboard Julia onto the platform. Without it, who is paying for VF's time on the platform?
2. **Workshop agenda + goals** from Antônia (was due "end of next week" per April 16; check status). Required to tune the cboAgent recipe (P-16) and to lock the unlock cadence (P-8).
3. **NBS expert job posting date** (mid-May target per May 5). Affects when P-27 needs to be ready.
4. **POA Futura / FUNRIGS territorial data** — Julia mentioned the city has the data; need a written hand-off so we can stop scraping the PDFs for P-10.
5. **Public-view publication rights** — for P-9/P-11, who signs off that an organization's profile can be public? Default: coordinator (Vila Flores) with per-org opt-out, but confirm with Antônia.

---

## Out of scope (explicit non-goals, captured to avoid re-litigation)

- **Real orchestrator backend / multi-tenant auth** — still Phase 3 per `docs/ROLE-ARCHITECTURE.md`. For the June pilot, share-link gating + role config are enough.
- **Automated portfolio selection** — confirmed April 29 + May 5: humans (VF + OEF + BWB) make the call; the platform supports the decision with scoring/readiness, doesn't replace it.
- **Community-owned fund design** — explicitly deferred until pipeline + financing needs are identified (MW response to FS, April 29). "Cart before the horse."
- **Engagement + narrative-deck work** — tracked in the Pyxera harmonized framework document + meeting notes, not here.

## Sources

- `_meetings/2026-04-08-cougar---vila-flores-open-earth-foundation.md` (initial framing)
- `_meetings/2026-04-16-cougar---vila-flores-oef.md` (P-1 through P-22 feature surface)
- `_meetings/2026-04-21-cougar-internal-alignment.md` (stakeholder strategy)
- `_meetings/2026-04-29-cougar-biweekly-oef-internal-check-in.md` (framework misalignments, Transition Studio scope, two-stage pipeline)
- `_meetings/2026-04-30-cougar-pxg-oef-biweekly.md` (PxG framework v1)
- `_meetings/2026-05-05-cougar-pxg-oef-biweekly.md` (timelines, NBS expert, convening week, May 18–20 VF session, May 25 stakeholder tour)
- `knowledge/runs/2026-04-16-villa-flores-demo/backlog.md` (P-1..P-22 detailed acceptance)
- `knowledge/runs/2026-04-16-villa-flores-demo/raw/poa-futura-revista.pdf` (P-10 data source)
- `knowledge/runs/2026-04-16-villa-flores-demo/raw/plano-rio-grande-investimentos.pdf` (P-10 data source)
