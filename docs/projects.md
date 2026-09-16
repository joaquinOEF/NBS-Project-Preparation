# Projects — the unit of work after Encontro 3

From Encontro 3 on, the coordination stops working organisation by
organisation and starts working by **project**: a group of organisations the
coordination puts together (a territory, a shared mechanism, a programme line
from the synergy report) with **one shared conversation** and **one link**.

This file is the contract. `docs/w3-flow.md` covers the encontro each
organisation walks through on its own; this is what comes after it.

## What a project is

- A row in `cohort_projects` (`shared/cohort-schema.ts`): a title, the member
  ids in the order the coordinator chose, a capability token, and the id of
  its **own `cbo_state`** — the shared session.
- The shared session is an ordinary `cbo_state` with
  `metadata.project = { id, cohortId }`. That discriminator is what routes it:
  `cboAgent.ts` dispatches to `serveProjectCheckpoint` before any encontro
  checkpoint, loads the `projeto` skill instead of an encontro skill, and
  replaces the per-organisation `CURRENT STATE` with the **project context**.
- The session is created **with** the project (`POST
  /api/cohort/:coordinatorSlug/projects`), so the link always resolves. There
  is no "first opener creates it" race and no snapshot to keep in sync.
- Deleting a project removes the row; the session row stays (a transcript is a
  record). Archiving keeps the row and makes the link stop resolving.

## The link

`/cbo-profile?p=<token>` — the same page the organisations already know, with
the token as the credential (`GET /api/project/by-token/:token`). Everyone in
the project gets the **same** link; there is one session per project, by
decision (15 Sept 2026): the room is the unit, not the seat. What the page does
differently for a project:

- No welcome screen and no encontro strip. The door is the brief.
- The first turn on an empty transcript is the entry line ("Vamos começar o
  projeto."), sent as a system turn. The checkpoint answers it.
- The header shows the project title and its organisations, with a `Projeto`
  badge.

## The door (`server/services/cboProjectCheckpoint.ts`)

Templated, like every encontro door — the step is derived from saved fields on
the session (`_project_opened`, `_project_roster_pending`, `_project_roster_ok`
in `intervention_type`), so a reload or a return lands on the same question.

1. The welcome line, then `show_project_brief` (the card below), then
   *"Confere — são essas as organizações?"* — `Confere ✓` / `Falta gente`.
2. `Confere ✓` → *"Por onde querem começar?"* with three chips the model
   handles (what we have in common · what each one brings · something else).
   `Falta gente` → says the coordination adjusts the roster on the board, and
   ends on a question (a reload restores pending questions only from a
   trailing `ask_user`).
3. Everything after the door goes to the model with the `projeto` skill.

The brief is rebuilt from the members' **live** records on every open
(`projectBrief()`), so a roster change on the board is visible on reload.

## The brief (`shared/project-brief.ts`)

One block per organisation — its place, its worry, its own words, the scenarios
it tested in Encontro 3 with the reaction it gave each, the coordination's
technical reading when there is one, its files — then **what they share**, from
`analyseSynergies` over the members: groupings, pooled studies, pooled
instruments, pooled bodies, shared funding barriers, gaps. Every fact is
attributed to the organisation it came from; nothing on it is a decision.

The same object renders the chat card (`CboProjectBrief.tsx`), the printed
page (`GET /api/project/:id/brief`, `projectBriefPrint.ts`) and the head of
the model's context (`briefMarkdown`), so the three cannot disagree. The
written register applies to the printed page (`docs/document-register.md`).

## The model's context (`server/services/projectContext.ts`)

`buildProjectContext()` = the brief in markdown, then each organisation's
full `buildContextMarkdown` block (the same one its own session uses), then
the text of its documents, capped. Declared in `shared/context-sources.ts` as
the `projectChat` pass — what it uses and what it declines, with reasons.

## The board (`ProjectsView.tsx`)

`Organizações | Projetos` on the orchestrator (`?view=projects` in the URL, so
a reload lands where the coordinator was). The projects view: an empty state
that says what a project is and offers the one action; a card per project with
the link, the chat, the brief, archive and delete; and, when the synergy
report exists, its programme lines as suggestions — a line is a title and a
set of organisations, which is exactly what a project is made of.

Creating a project opens the share dialog straight away with the link and the
WhatsApp message (`projectGreetingMessage`): the link is the point.

## Not built yet (PR B)

The project's own encontro — a multi-organisation flow shaped like Encontro 3
(test, compare, detail) over the group's scenarios. Until then the shared
session reads and compares; it does not decide. The `projeto` skill says so.

## Operational

- `npm run db:push` is required before the first deploy that carries this
  (new table `cohort_projects`; a missing Drizzle table 500s every route that
  touches it).
- `e2e/cohort-projects.spec.ts` covers: create → link → by-token → brief; the
  door in the browser (brief card, roster confirm, reload lands on the same
  question); the board (empty state, create dialog, card).
