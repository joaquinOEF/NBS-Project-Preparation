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

## The project encontro (`serveProjectCheckpoint`, `shared/project-plan.ts`)

Started from the door with **Montar o projeto** (or the line "Vamos começar o
encontro do projeto."). Five templated beats, the step derived from fields on
the project's own state, every turn ending on a question:

1. **A moldura** — *"por que essas organizações fazem esse projeto juntas?"*
   in their words (free text or voice; skippable), then the frame, offered
   from what the brief found in common (`frameOptions`: one per grouping
   axis, plus the first pooled study) — never a frame the records do not
   support; "Outra coisa" writes their own.
2. **Os cenários** — one organisation at a time, over what IT tested in
   Encontro 3: each tested solution as a chip (liked ones say so), "Todas
   que fizeram sentido" when more than one did, "Nenhuma desta vez". An
   organisation that never reached Encontro 3 is told so and joins without a
   scenario; it is never asked what it tested.
3. **O que se compartilha** — `show_project_plan`: the scenarios per
   organisation with their verdicts and cost notes, what pooling saves (a
   study contracted once for N, one conversation with a body, one instrument
   request), the summed band, the gaps. Then *"Quem puxa o projeto?"* (the
   organisations, the coordination, not yet).
4. **O dinheiro** — the sum of the scenarios' bands, what has no band named,
   and how the funding is sought (one line for everything · each seeks its
   own with the project as the argument · not yet).
5. **O documento** — `show_project_note` + `GET /api/project/:id/note`: as
   organizações · por que juntas · a intervenção (one bullet per scenario) ·
   o que exige e o que se compartilha · custo e caminho do recurso (with the
   aggregation argument at the project's own number) · quem cuida ·
   pendências. Then *"E agora?"* — adjust the scenarios (re-asks beat 2
   onwards) or keep talking.

The choices live on the project state under private names (`PROJECT_FIELDS`
in `shared/project-plan.ts`): the project state is not an organisation's
record, and the project note is the document that carries every one of them.
After the encontro the model's context gains "O projeto — o que o encontro
definiu" (`planMarkdown`), so the model never re-asks a decision the room made;
the `projeto` skill sends any "decide for us" request back to the encontro.

Every figure on the plan and the note comes from the same fichas and
`budgetLineFor` the organisations' own comparison cards use — a number on the
project note cannot disagree with a number on an organisation's document.

## Not built yet

- Per-scenario "who looks after it" beyond the ficha's upkeep sentence (each
  part follows the organisation that brought it, by default).
- A project-level maturity score. The organisations' own scores are untouched.

## Operational

- `npm run db:push` is required before the first deploy that carries this
  (new table `cohort_projects`; a missing Drizzle table 500s every route that
  touches it).
- `e2e/cohort-projects.spec.ts` covers: create → link → by-token → brief; the
  door in the browser (brief card, roster confirm, reload lands on the same
  question); the board (empty state, create dialog, card); the project
  encontro end to end with a reload mid-way, the note card and the printed
  note; the skip paths.
