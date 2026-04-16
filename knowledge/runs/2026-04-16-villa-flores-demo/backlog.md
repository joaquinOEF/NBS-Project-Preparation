# Platform Backlog — Vila Flores × OEF Demo, 2026-04-16

Platform / product items only. Engagement commitments + narrative-deck work live in `README.md`. Sources reference speakers + timestamps from `raw/meeting-transcript.pdf`.

## Impact × Effort matrix

|  | **Low effort** | **Medium effort** | **High effort** |
|---|---|---|---|
| **High impact** | P-1, P-2, P-3, P-4 | P-5, P-6, P-7, P-8 | P-9, P-10, P-11 |
| **Medium impact** | P-12, P-13, P-14 | P-15, P-16, P-17 | — |
| **Low impact** | P-18, P-19, P-20 | — | — |

**Suggested pickup order (until the April 27 Kami visit)**: P-1 → P-2 → P-3 → P-4 → P-6 → P-8. All quick-wins + the highest-leverage medium-effort items that make the Kami/Clayton Will meeting demo materially stronger.

---

## HIGH impact × LOW effort — Quick wins

### P-1. Risk-aware site selection during Phase 2

**Source**: Joaquin 38:47, Julia 39:08.

When a CBO plots its site in Phase 2 (intervention_site), surface the risks already in our tile data even if the CBO didn't know about them. Julia explicitly asked: *"Can the platform offer us a diagnosis of a general type of diagnostics on the specific territory, on other kinds of things like health and education?"* — start with climate risk, extend in P-5.

Backend data already exists (the Porto Alegre 48 tile layers pipeline). This is a UI-surfacing task.

**Acceptance**: click anywhere on the site-explorer map inside Porto Alegre → a small "Risks at this location" panel shows flood / heat / landslide indicator values (1–3 chips, no overwhelm). Include a human-readable interpretation: *"Heat risk: moderate (3/5)."*

### P-2. Highest-risk neighborhoods layer

**Source**: Joaquin 11:04.

Joaquin proposed a map-layer toggle: *"Here is the map of Porto Alegre — these are the highest-risk neighborhoods, this is where I recommend you go find more organizations."* Proactive, not reactive.

Use the composite risk layer already processed for the geospatial-data repo. Renders as a choropleth or heatmap overlay on the neighborhood polygons.

**Acceptance**: toggle in the orchestrator + site-explorer maps that shades neighborhoods by composite risk score. Hover a neighborhood → tooltip with top hazard + population in risk area.

### P-3. Resilience-concept labels on projects

**Source**: Julia 15:38. *"We could maybe create labels on the concept of resilience and communities, like safe communities, we could have lots of projects on sewage, on draining, on NBS, different kinds of projects… so we can understand what the plans for the city are and which territory they cover."*

Add a `concept` tag to city projects + CBO initiatives — free-text enum for now: `drainage`, `nbs`, `tourism`, `housing`, `sanitation`, `social-services`, `cultural`, `transport`. Filterable on the orchestrator map.

**Acceptance**: each demo project carries one or more concept tags; orchestrator-map chip filter above the map toggles which tags show.

### P-4. Profile persistence UX clarity

**Source**: Julia 43:18. *"Does the profile save forever? It's not a conversation that whenever you leave the platform, it goes away."*

The profile is already saved (localStorage + DB via `project-context`). Users don't know it. Add a small "Saved" indicator near the profile form + a one-line reassurance on the CBO entry page.

**Acceptance**: visible "Auto-saved ✓" chip near the section header whenever the context has written; refresh-the-page test leaves state intact (existing behavior, just surfaced).

---

## HIGH impact × MEDIUM effort

### P-5. Territory diagnosis layer beyond climate

**Source**: Julia 39:35 + 40:43. *"Can the platform offer us… a general type of diagnostics on the specific territory, other kinds of things like health and education?"*

Load and render by-neighborhood data for: population, poverty rate, informal-settlements %, schools, parks, healthcare coverage. Render as a territory report alongside the map — Joaquin 39:55 already acknowledged *"You can see, you know, census by neighborhood… poverty rate by neighborhood"* is in the data, just hard to find.

**Acceptance**: open a neighborhood → side panel shows a structured "Territory profile" with the socio-economic indicators grouped by theme (People · Services · Infrastructure · Climate).

### P-6. Territory scorecard / report auto-generation

**Source**: Julia 40:43. *"Like your territory in this moment looks like this and that, like a scorecard or something like that you can offer for even the leadership and for us."*

After a CBO completes Phase 2 (site + neighborhood), generate a one-page "Territory & CBO readiness" report: the neighborhood's top risks, population served, the CBO's COUGAR maturity (already computed), missing priority flags, recommended NBS types. Exportable as a single markdown / PDF page.

**Acceptance**: "Generate territory report" button in the coordinator view; renders to a scroll-through page + `Download PDF` action.

### P-7. Mobile optimization for CBO profile flow

**Source**: Joaquin 34:29. *"You can also use your phone, of course, to complete this and it should be easy."*

Audit the CBO profile flow on iPhone-SE-width viewports. Fix tap targets, long forms, textarea resizing, and the intervention-selector micro-app (currently map-heavy, probably rough on mobile).

**Acceptance**: end-to-end profile completion on a 375px-wide viewport without horizontal scroll, truncated text, or unreachable buttons. A Palafita coordinator on a phone can finish Phases 1–3a in ≤15 minutes.

### P-8. Workshop-phased unlock (coordinator gating)

**Source**: Ana 42:04. *"The functionality for the communities is locked until the orchestrator review and liberate — okay, you're ready for the next phase."*

The CBO profile has 7 sections today (CBO_SECTIONS). Let the coordinator gate which sections are unlocked per CBO. Default cadence per Joaquin 42:56: "unlocked after each workshop." Add per-CBO phase locks keyed on `(orgId, sectionId) → unlocked: bool`.

**Acceptance**: coordinator view on each CBO card has an "Unlock next phase" action; CBO sees locked sections grayed with an explanation ("Your coordinator will unlock this after Workshop 2").

---

## HIGH impact × HIGH effort — Big rocks

### P-9. Dual-mode map: management view + public-facing org map

**Source**: Julia 12:40. *"Is it possible that this map has an online version open for everyone to see, or is this just management?"* Antônia 20:00 tied this to the **Pontos de Cultura** federal catalog as a model.

Two views over the same data:
- **Management** (today's orchestrator): all CBOs, all statuses, unlocks, notes.
- **Public**: curated subset, SEO-friendly URL, showcases community projects + their neighborhoods, readable without login.

The platform already has role infrastructure (`role-context.tsx`) — the public view is a new surface, not a role branch.

**Acceptance**: `/public/vila-flores` (or similar) renders a map + simplified org cards; coordinator can toggle per-CBO "Show publicly" on or off.

### P-10. Planned-funding overlay × risk (**highest-leverage single feature**)

**Source**: Julia 13:46 + 14:32 + Antônia 19:05.

Overlay on the orchestrator/public map showing where public money is planned by neighborhood — cross-referenced with risk layers so coordinators see **where the city is investing AND where it isn't**.

Data sources we already have access to:
- **POA Futura** (see `raw/poa-futura-revista.pdf`) — city-level line items by bairro (Cascata R$119.1M hillside containment; Arquipélago / Humaitá R$494.5M public-services complexes; etc.).
- **Plano Rio Grande / FUNRIGS** (see `raw/plano-rio-grande-investimentos.pdf`) — state-level reconstruction + adaptation portfolio.
- International (BID / World Bank / CAF / FONPLATA) — already in `climate-funds.json`; need per-project territorial breakdown from public filings.
- **ArcGIS Experience** dashboard — likely the live view of Plano Rio Grande data; backing feature services may be directly ingestible.

**This was the meeting's single strongest-signal product ask.** Julia: *"So we can even cross that with the risk areas, et cetera."* Antônia: *"Everybody talks about the same fund. We don't know how is this going to affect the community in a practical way."*

**Acceptance** (phased):
- **Phase A (ship for COP)**: static overlay with POA Futura line-items mapped to bairro polygons. Click a bairro → list of earmarked investments + totals. Toggle to overlay risk scores (delta view: *"Risk here = 4/5; planned investment = R$0. Uncovered."*).
- **Phase B**: add FUNRIGS + MDB projects; time-series (2025 → 2029 spend).
- **Phase C**: pipeline alerts (*"Fund X closes in 60 days, area Y not covered"*).

### P-11. Public organization registry (Pontos de Cultura–style)

**Source**: Antônia 20:00. *"I also wanted to tell that we have good examples in Brazil. The mapping of the Pontos de Cultura, which is a federal law. It's a very good example for the platform to have a look at because it works really well in the way you catastrate [catalog] organization[s] as a Ponte de Cultura."*

Distinct from P-9's public map: this is a **named catalog** of participating orgs, SEO-discoverable, with pages per org showing who they are, where they work, what they do, what they need. Cultivates network effects — other organizations self-nominate after seeing the catalog.

Build order is after P-9 because P-9 gives us the public-map primitive. P-11 adds the catalog surface over it.

**Acceptance**: a registry index page (searchable by neighborhood + intervention type) + one detail page per org. Coordinator gates "list in public registry" per org.

---

## MEDIUM impact × LOW effort

### P-12. Private vs public land filter on interventions

**Source**: Julia 47:58. *"Can you create a feature of if that can be implemented on private or public land? Because I understand that they have different levels of NBS that you can do, like in your own house and others that you are going to need to talk to [the city]."*

Add a `landTenure` tag to each intervention in `NBS_INTERVENTION_TYPES` (already in `shared/cbo-schema.ts`). Render a filter chip in the intervention selector.

**Acceptance**: intervention-selector micro-app shows a "Land tenure" filter with "Private / Public / Mixed" chips; interventions tagged accordingly.

### P-13. "Already doing" vs "Potential to do" filter in interventions

**Source**: Julia 47:01.

Two axes the user should be able to see:
- *"These are interventions I already do today at my site."*
- *"These are interventions that could work at my site given its hazards."*

Currently the intervention selector shows only the second (recommendation). Add a toggle for the first, let CBOs mark what they already do.

**Acceptance**: in the CBO profile Phase 3a, a user can flag interventions as "Already doing" (persisted on their profile) vs browse "Potential" (filtered by site hazards).

### P-14. Coordinator invitation / sharing link

**Source**: Antônia 42:04 + Julia 1:03:15 (*"We would just start with some coordinators from our Palafita program"*).

Coordinators generate a share link per CBO. The CBO opens, fills the profile, and the coordinator sees the result in their portfolio view without manual wiring.

**Acceptance**: "Invite a CBO" button in orchestrator → share URL + magic-link flow; coordinator sees new CBO card appear in the portfolio when the invited user starts their profile.

---

## MEDIUM impact × MEDIUM effort

### P-15. Richer intervention-info cards

**Source**: Joaquin 47:15. *"Here you can learn more about them… what's urban forest? These are things we need to finish translating… what do you need for it? How much does it cost?"*

Intervention cards today are one-liners. Add: typical cost range (BRL), primary climate benefits with magnitudes ("40–60% flood risk reduction at 2-ha scale"), land-tenure requirement, maintenance regime, typical timeline. Draws from `knowledge/_interventions/*.md` which already has most of this.

**Acceptance**: each intervention card flips or expands to reveal cost/benefits/requirements; data pulled from the knowledge files (not hardcoded).

### P-16. Adaptive question tuning from Vila Flores workshop goals

**Source**: Joaquin 45:11. *"We have a sort of recipe we give to the AI and the AI creates the questions based on the recipe. That recipe is very easy to change. Right. So once you start thinking about the workshops you want to do and the goal they want to achieve, we can change that recipe based on what we want."*

After Antônia sends the workshop agenda + goals (end of next week per commitment), update the CBO agent's prompt "recipe" to match the Palafita program's actual flow and learning goals.

**Acceptance**: prompt update in `server/services/cboAgent.ts` + `.claude/commands/cbo-intervention.md`. Tested end-to-end with a Palafita coordinator; their feedback recorded in a follow-up run log.

### P-17. Pixar scanning-criteria ingestion

**Source**: Fernanda 56:55. *"Andrew shared with me this Excel list. Is this something they have done? Because I'm not on those meetings."*

Andrew / Pixar shared an Excel with NBS project scanning criteria; Fernanda still needs to confirm whether it originated with Pixar or the platform team. Once confirmed, map those criteria onto the CBO profile fields so the scan is native.

**Acceptance**: documented mapping from Pixar's criteria → CBO profile fields; where gaps exist, new fields added. Scoring logic in place so a filled profile returns a pass/fail (or readiness score) on the Pixar criteria.

---

## LOW impact × LOW effort — Research / parking lot

### P-18. HubSPOA overlap research

**Source**: Fernanda 22:30. *"They have been advertising HubSPOA, which is like the community hubs POA."*

Research-only: what does HubSPOA do, who runs it, how does it overlap with Vila Flores' coordinator role and our platform? Document the delta.

### P-19. Koalizone / Phone Higgs review

**Source**: Fernanda 14:47. *"I think the Koalizone has something like that already, or Phone Higgs or something that we can look it up."*

Inspect whatever tool Fernanda is referring to (the transcription is ambiguous — Koalizone? Colabore? Phone Higgs?) and confirm whether it already does the funding-territory overlay we're planning. If yes, study the UX.

### P-20. Pontos de Cultura technical reference study

**Source**: Antônia 20:00.

Find the Pontos de Cultura federal catalog online; document its registry shape (schema, public view, org-self-nomination process). Inform P-11.

---

## Items explicitly NOT in the backlog

(captured so we don't re-litigate)

- **Village Flores-specific sample project** — already decided to reuse Porto Alegre sample per earlier /refine. Re-open if/when we get real Vila Flores site data.
- **Real orchestrator backend / multi-tenant auth** — Phase 3 per `docs/ROLE-ARCHITECTURE.md`.
- **Engagement, narrative, and deck work** — tracked in `README.md § Engagement commitments`, not here.
- **Funder ranking weights for CBO** — already scoped in Phase-1b TODO; waiting on real Vila Flores funder conversations.
