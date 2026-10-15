# The pre-portfolio

The year-end deliverable (13 Oct 2026): the Rede's collective projects,
validated by Vila Flores and the communities. Built on the coordinator side,
in Projetos, as a board.

## Three layers, so a drag never waits on a model

1. **Per organisation** (`portfolioOrg`, `shared/preportfolio.ts`): the
   pre-note's solution, budget, risks, place, readiness and why — and its
   **links to the city's plans** (`server/services/planLinks.ts`, Opus 5.5,
   each with a literal passage; keyed by pre-note facts + corpus version,
   redone in the background).
2. **Per project, on every drop** (`projectCard`): members, risks, combined
   budget, readiness (the slowest member sets it), unpriced and unvisited
   members, the union of plan links. Pure.
3. **Per project, when the board settles** (`server/services/projectNarrative.ts`,
   Opus 5.5): a name, why together, what they do better together, what to
   watch. Facts-only guard; cached by member set + facts fingerprint.

## The board

Preferences (território / equilíbrio / tema · a framing risk · single-org
projects allowed?) → a deterministic suggestion, one reason per group → move
cards (drag, or "Mover para" on a phone). The draft saves itself in
`cohort.settings.preportfolio` (no table). Each column has Vila Flores's story
box. "Confirmar arranjo" turns groups into projects (or updates the one a
group became). Readiness is a first rule for Robson to set.

## The corpus

`knowledge/porto-alegre/plans/` — see its README: `.md` documents with front
matter, and `iniciativas.csv` (Vila Flores + Robson's sheet; contacts never
reach the model). Re-measure `planLinks` when it grows:
`scripts/plan-links-live.ts`.

## The page

`GET /api/cohort/:slug/preportfolio/print` — a cover with the whole, then one
page per project: reason, why together, synergies, the story, what each
organisation brings, plan connections with their passages, cautions, what
the Rede learned.
