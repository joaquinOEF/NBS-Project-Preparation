# Orchestrator Page Backlog — 2026-05-14

Scope: items that ship as changes to `/orchestrator` (`client/src/core/pages/orchestrator-landing.tsx`). Everything else stays in the broader backlog (`./backlog.md`).

## What Vila Flores said the coordinator view is *for*

Three jobs, in their words:

1. **Manage the cohort** — "see what they've done so far, have they actually completed their sections, have they shared the information, have they chosen a site or not" (JVP 8:30).
2. **Recruit proactively** — "this is the map of Porto Alegre, these are the highest-risk neighborhoods, this is where I recommend you go find more organizations" (JVP 11:04).
3. **Coordinate with the city** — "show the amount of money planned to be invested in specific parts of the city, which parts are not covered yet, cross that with the risk areas" (Julia 13:46); "how the platform will be divided in these sectors — community projects, government projects, who fills the platform" (Antônia 30:50).

Today's page does (1) well-ish. Doesn't do (2) or (3) at all. The gap is what this backlog closes.

## Layout direction

Today: 60% map + 40% cards.

Proposed evolution: top-level **sector tabs** (Community / Government / Funding), each with the same split-screen shell but different map layers + right-rail content. Plus a thin **convening-cadence header strip** (workshop dates → which phase each unlocks).

That structure is what most items below assume.

---

## Items

### O-1. Phase-unlock controls on each CBO card
**Source**: Ana 42:04. *"Functionality for communities locked until the orchestrator review and liberate — okay, you're ready for the next phase."*
**What to add**: "Unlock next phase" button on each card; CBO sees grayed sections with a "Coordinator will unlock after Workshop 2" tooltip on their side. Bulk action in the cohort header (see O-2). Default state on invite: Phase 1 unlocked, Phases 2–5 locked.
**Today**: nothing — CBOs can skip to any phase via the strip in `cbo-profile.tsx:471`.
**Acceptance**: per-card "Unlock Phase 2 (Where we work)" action; persisted; CBO page enforces the lock visually and in the agent flow.

### O-2. Bulk-unlock action tied to workshop cadence
**Source**: April 16 + workshop-cadence framing throughout.
**What to add**: a "Workshops" strip at the top of the page — "Workshop 1 · May 28 ✓ · Phase 1 unlocked" / "Workshop 2 · June 5 → Unlock Phase 2 for all". Coordinator clicks once per workshop; cohort moves together. Per-CBO override (O-1) handles stragglers.
**Today**: no concept of "workshop" in the data model.
**Acceptance**: cadence strip lists 5–6 workshops with dates; each has a one-click bulk unlock; per-CBO state still wins if explicitly set.

### O-3. CBO status pill (drafting / in-review / ready-for-bankability / submitted)
**Source**: April 29 (MW + JVP) — *"humans make selection, platform supports."* PxG: 10 priority + 10 alternate cohort, then handoff to BWB.
**What to add**: a 4-state status pill on each card the coordinator can advance manually; filterable in the cohort list.
**Today**: only `currentPhase` + `sectionsComplete`. No notion of "ready to hand off."
**Acceptance**: pill on each card; "Advance status" menu (drafting → coordinator-review → ready-for-bankability → submitted); list filter by status.

### O-4. Invite-a-CBO flow + share link
**Source**: Antônia 1:03:15. *"Share this with three or four more people coordinating Palafita."*
**What to add**: "Invite CBO" button in the page header → form for org name + neighborhood → generates a share-link slug. New card appears in the cohort once the invited org opens the link and starts their profile.
**Today**: hardcoded DEMO_PROJECTS, no mechanism to add a CBO.
**Acceptance**: coordinator can add a CBO from the page; share URL works; new card shows the link state ("Invited · not yet started") until profile begins.

### O-5. Alternates list (10 priority + 10 alternate)
**Source**: May 5 PxG biweekly — *"10 priority + 10 alternate organizations with justification, criteria assessment, recommended themes."*
**What to add**: a "Cohort" / "Alternates" split inside the right rail (or a tab). Alternates have the same card shape but visually de-emphasized. "Promote to cohort" action swaps an alternate up when a priority CBO drops out.
**Today**: flat list of 4 demo CBOs.
**Acceptance**: two grouped lists with a clear visual hierarchy; promote/demote actions; status preserved on swap.

### O-6. External-origin chip (NBS expert pipeline)
**Source**: April 29 + May 5 — PxG-hired NBS expert sources projects *outside* the 10-org cohort.
**What to add**: an `origin: cohort | external` field on each project; small chip on the card and a filter ("Show external projects from NBS expert"). External projects skip O-2's workshop unlock cadence — they come in already at later phases.
**Today**: implicit assumption that everything is CBO-cohort-sourced.
**Acceptance**: chip visible; filter works; external projects don't get auto-locked by O-1/O-2.

### O-7. Generate territory report (PDF) action per card
**Source**: Julia 40:43 — *"your territory in this moment looks like this, like a scorecard you can offer for even the leadership and for us."*
**What to add**: per-card action "Generate territory report" → opens the scorecard preview → "Download PDF" with coordinator + community variants (the community variant is plain-language).
**Today**: nothing.
**Acceptance**: button on card; preview page; both PDFs export.

### O-8. Highest-risk-neighborhoods layer toggle on the map
**Source**: JVP 11:04 — *"these are the highest-risk neighborhoods, this is where I recommend you go find more organizations."*
**What to add**: layer toggle in the map's top-right; choropleth shading of bairro polygons by composite risk score. Hover a bairro → top hazard + population in risk area. Data already exists in `geospatial-data` repo + 250m grid.
**Today**: blank map with CartoDB Positron tiles + markers.
**Acceptance**: toggle works; hover tooltips show risk + pop; can coexist with markers.

### O-9. Planned-funding × risk overlay + "uncovered territory" gap map
**Source**: Julia 13:46 + Antônia 19:05 — *"the amount of money planned to be invested in specific parts of the city, which parts are not covered yet."* **The single strongest-signal product ask from April 16.**
**What to add**: second layer toggle showing POA Futura earmarks by bairro (we already have `raw/poa-futura-revista.pdf` archived). Click a bairro → list of earmarked investments. Third toggle "Uncovered territory" shades only bairros where risk ≥ threshold AND planned R$/capita ≤ threshold.
**Today**: no funding data anywhere in the UI.
**Acceptance**: Phase A only — static POA Futura mapping + risk-overlap gap layer. Click for line-item list.

### O-10. Territory-diagnosis side panel on bairro click
**Source**: Julia 44:32 — *"diagnosis of the territory on health, education… like a scorecard offer for the leadership."*
**What to add**: click a bairro on the map → right-rail flips to a "Territory profile" panel: population, poverty rate, informal-settlement %, schools, parks, top risks. IBGE + OSM data already in repo.
**Today**: bairros are non-clickable.
**Acceptance**: click → panel; panel has a "Recruit here" call-to-action (kicks off O-4 pre-filled with the bairro).

### O-11. Resilience-concept filter chips
**Source**: Julia 15:38 — *"labels on the concept of resilience — drainage, NBS, housing, sanitation, social services, cultural, transport."*
**What to add**: chip row above the map (or above the right rail): drainage / NBS / housing / sanitation / social / cultural / transport. Filters both map markers and the cohort list. Coordinator can mark each CBO with one or more concepts.
**Today**: no tagging.
**Acceptance**: chip filter; CBO tagging UI in the card; persists.

### O-12. Sector segmentation (top-level tabs)
**Source**: Antônia 30:50 — *"how the platform will be divided in these sectors, like the community projects portfolio is one sector, government projects, who is going to fill the platform."*
**What to add**: three top-level tabs: **Community projects** (today's view) / **Government projects** (POA Futura + FUNRIGS earmarks) / **Funding opportunities** (active and closing funds). Same split-screen shell per tab; map layers + right-rail content differ.
**Today**: only "Community projects" exists implicitly.
**Acceptance**: three working tabs; each loads its own data shape; map state survives tab switch where appropriate.

### O-13. Per-CBO "Show publicly" toggle
**Source**: Julia 12:40 — *"is it possible that this map has an online version open for everyone to see?"* + Antônia 20:00 referencing the Pontos de Cultura federal catalog.
**What to add**: per-card toggle "List in public registry." Feeds a downstream `/public/vila-flores` surface (out of scope for this backlog — see P-9 / P-11 in the parent backlog). Coordinator controls visibility per org.
**Today**: nothing.
**Acceptance**: toggle persists; off by default; rendering of the public view itself is parent-backlog work.

### O-14. Replace `DEMO_PROJECTS` with persistence-backed cohort
**Source**: implicit. June pilot has 10 real CBOs filling profiles; today's page reads a hardcoded array.
**What to add**: cohort list reads from the same persistence layer the CBO profile writes to (localStorage in sample mode, DB in API mode). CBO profile updates → orchestrator cohort reflects them on next visit.
**Today**: 4 hardcoded projects.
**Acceptance**: orchestrator + CBO profile share state; sample mode + API mode both work; new CBOs from O-4 appear without code changes.

---

## Suggested build order (May 14 → June 8)

Tied to the two real deadlines:

**By May 20 — VF refinement session with Julia**:
- **O-14** (persistence wiring — foundation for everything else)
- **O-1** (per-card phase unlock)
- **O-2** (workshop cadence header + bulk unlock)
- **O-4** (invite flow + share link)

That gives Julia a working coordinator surface to react to.

**By May 25 — stakeholder showcase tour**:
- **O-8** (risk neighborhoods layer — visible win for SMAMUS / Innovation Office audience)
- **O-11** (concept filter — gives Innovation Office their "innovation" framing)
- **O-9 Phase A** (POA Futura overlay — gives Secretary of Planning the "uncovered territory" framing) — if time permits

**By June 8 — convening series launch**:
- **O-3** (status pill — needed once cohort is real)
- **O-6** (external-origin chip — NBS expert ramps up mid-June)
- **O-7** (territory report — community-facing scorecard for first workshop)
- **O-10** (bairro click → territory panel) — supports recruitment between workshops

**Post-June, July:**
- **O-5** (alternates list — kicks in if a priority CBO drops)
- **O-9 Phase B** (FUNRIGS + MDBs)
- **O-12** (sector tabs — once Government + Funding views have content)
- **O-13** (public toggle — once a public-view surface exists)

---

## Out of scope for this backlog

- The public-facing surface itself (`/public/...`) — that's parent backlog P-9 / P-11.
- Multi-coordinator support (Antônia 1:03:15 — *"share with 3-4 more Palafita coordinators"*). For the pilot, single-coordinator (Julia) is fine. Multi-coordinator = Phase 3 multi-tenant auth.
- Bankability scoring logic — lives in `cbo-schema.ts` / agent, not on this page. This page just shows the result.
- Replacing the chat-based CBO flow — coordinator stays on `/orchestrator`, CBOs stay on `/cbo-profile`.

## Sources

- `_meetings/2026-04-08-cougar---vila-flores-open-earth-foundation.md`
- `_meetings/2026-04-16-cougar---vila-flores-oef.md` (most asks above)
- `_meetings/2026-04-29-cougar-biweekly-oef-internal-check-in.md` (status pill, external pipeline)
- `_meetings/2026-05-05-cougar-pxg-oef-biweekly.md` (alternates, NBS expert timing)
- `knowledge/runs/2026-04-16-villa-flores-demo/backlog.md` (P-1..P-22)
- `./backlog.md` (parent backlog, P-23..P-27)
- `client/src/core/pages/orchestrator-landing.tsx` (current state)
