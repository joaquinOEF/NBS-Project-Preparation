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

## The project encontro (`serveProjectCheckpoint`, `shared/project-plan.ts`, `shared/project-proposal.ts`)

Started from the door with **Montar o projeto** (or the line "Vamos começar o
encontro do projeto."). Templated beats, the step derived from fields on the
project's own state, every turn ending on a question. Since 10 Nov 2026
(JVP — J1 C, J2 A, J3 A) the encontro ends on Encontro 4's **proposta
inicial**, one page for the organisations together, not on a page of its own:

1. **A moldura** — *"por que essas organizações fazem esse projeto juntas?"*
   in their words (free text or voice; skippable), then the frame, offered
   from what the brief found in common (`frameOptions`: one per grouping
   axis, plus the first pooled study) — never a frame the records do not
   support; "Outra coisa" writes their own.
2. **Os cenários** — one organisation at a time, over what IT tested in
   Encontro 3 (first-era `chosen_solutions` included): each tested solution
   as a chip (liked ones say so), "Todas que fizeram sentido" when more than
   one did, "Nenhuma desta vez". An organisation that never reached Encontro
   3 is told so and joins without a scenario; it is never asked what it tested.
3. **Encontro 4, for the joint solution** — `serveE4ForProject`, the SAME
   checkpoint an organisation walks (`cboE4Checkpoint.ts`), with
   `deps.project` set. It reads the **joint record** (`jointSections`: the
   members' records underneath — the scenarios as tests, the worries and
   bairros as a union, tenure / current use only where every member agrees,
   each member's partners named with the member — and the project state's own
   answers on top) and writes to the project state only. The beats: which
   scenario becomes the proposal and its size · **the place of each member**
   · the problem · the draft · the gaps (quem é atingido, o que querem ver
   mudar, quem faz, quem cuida, contrapartida, parceiros) · the one check.
   The close shows the card again, so the chat **ends on the proposal card**
   (`CboPrenoteCard`, the one the organisations see); its PDF link is
   `/api/cbo/<project state>/prenote` (also `/api/project/:id/prenote`).

### The place is the members' own (J2)

There is no "project pin". City-map facts are computed **per point** and
printed with whose place they are; the census ("Quem mora perto", the
"quem é atingido" anchor, the indicator reference) is the union of the
points, each tract once (`censusAroundMany`, nearby places merged by name).
A member with no pin is asked by name inside the project's Encontro 4: the
address-geocode suggestion when it has an address (`É aqui?` — e.g. Ksa Rosa,
"Voluntários da Pátria 1039, Floresta"), else the map, else "Seguir sem o
lugar". Confirming writes **that member's** record (`_site_lat/_lng`,
`_site_from_address`). "Mudar algo" never offers to clear a member's pin from
the shared room. The corridor is named in words — the project's title and
the room's "por que juntas" — never drawn.

### The page (`buildJointPrenote`)

`buildPrenote` over the joint record, plus **"As organizações e por que
juntas"** first: each organisation with its place and what it brought, the
frame, why together in their words, what pooling saves (one conversation with
a body, one instrument request, one study). The rest of the page is said in
the plural ("segundo as organizações"); the budget is the fichas at the joint
size, like any pre-note. The written register applies.

### What happened to beats 3–5

"O que se compartilha", "o dinheiro" and "o documento" are **folded into the
joint proposal**: the pooling lines print in its joint section; the money is
its budget (one solution at one size — the old sum of every scenario's band
added up alternatives as though all would be built); the document IS the
proposal. "Quem puxa o projeto" is no longer asked; a session that answered
it still prints it. The old chip handlers stay so a session mid-way on
10 Nov is not stranded, and `/api/project/:id/note` still prints the old note.

After the encontro the model's context still gains "O projeto — o que o
encontro definiu" (`planMarkdown`), so the model never re-asks a decision the
room made; after a model turn inside the joint Encontro 4 the encontro's own
question is put back (`reaskE3IfSilent`, project branch).

### The pre-portfolio (J3)

Once the joint proposal is **closed**, the project enters the board as ONE
unit (`jointPortfolioUnit`, `PortfolioOrg.unit.kind === 'joint'`) keyed by its
first member's id: the joint solution and budget, the census over both points.
Its members leave the board as separate cards; their own proposals are kept
as `unit.background` (shown, linked, never summed). See docs/preportfolio.md.

## Not built yet

- Per-scenario "who looks after it" beyond the ficha's upkeep sentence (each
  part follows the organisation that brought it, by default).
- A project-level maturity score. The organisations' own scores are untouched.
- The written summary over the joint proposal (an organisation's proposal gets
  one from the concept-note author at its close; the joint one does not yet).
- One board with three kinds of card (org alone · grouping · joint project):
  the data model carries `unit`, the board UI only badges the joint unit.

## Operational

- `npm run db:push` is required before the first deploy that carries this
  (new table `cohort_projects`; a missing Drizzle table 500s every route that
  touches it).
- `e2e/cohort-projects.spec.ts` covers: create → link → by-token → brief; the
  door in the browser (brief card, roster confirm, reload lands on the same
  question); the board (empty state, create dialog, card); the project
  encontro through the joint Encontro 4's draft card with reloads mid-way;
  the skip paths. `e2e/project-joint-e4.spec.ts` walks the real prod shapes
  (Ksa Rosa without a pin, Cooperativa 20 de Novembro at Garagem Popéia) to
  the closed joint proposal, Ksa Rosa's pin from her address, the prints, and
  the pre-portfolio counting the project once.
