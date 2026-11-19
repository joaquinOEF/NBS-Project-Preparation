# The synergy report's second input: what the coordination adds

**Status (Nov 2026):** first version built. Start here if you are picking this
up in a fresh session; everything needed is in this file and the code it names.

## Why

"Mapear sinergias" read one source: what each organisation did on the platform.
The coordination keeps a second one by hand, a spreadsheet of the solutions each
organisation **already has** and **wants**, updated at the in-person meetings.
It holds things nobody has tested on the platform yet. The coordination asked
(18 Nov 2026) to upload it and get a cross-analysis by solution family, with a
second tab that rates how far each solution reduces flooding, heat and
landslide.

The product decision that followed: the synergy report is a **multi-input
process**. Everything the platform knows, plus what the coordination adds from
outside, plus a few buttons and one sentence that say what a report should focus
on.

## What is built

| Piece | Where |
|---|---|
| Reading a sheet, proposing matches, counting the cross (pure, no model) | `shared/network-solutions.ts` |
| Spreadsheet/CSV → grids of cells | `server/services/networkFiles.ts` |
| Routes: list, upload, review, confirm, delete; the run takes the files | `server/routes/cohortRoutes.ts` ("THE COORDINATION'S FILES ABOUT THE NETWORK", and the synergy `POST`) |
| The narrative is handed the counted result | `server/services/synergyReport.ts` (`SynergyExtras`, `analysisForModel`) |
| New sections of the printed report | `server/services/synergyPrint.ts` (`outsideHtml`, `inputsHtml`) |
| The list under "Mapear sinergias" and the review dialog | `client/src/core/components/orchestrator/NetworkFiles.tsx` |
| The coordination's note in the organisation drawer | `coordinationNoteFor` in `shared/network-solutions.ts`, `CboProfileSummary.tsx` |
| The cross as a spreadsheet ("Cruzamento (planilha)" beside "Abrir relatório") | `server/services/synergyCrossXlsx.ts` |
| The same flow from a terminal | `scripts/network-file-report.ts` |
| What a run is asked to focus on | `shared/synergy-focus.ts` |
| Tests (invented organisations) | `e2e/network-solutions.spec.ts`, `e2e/synergy-focus.spec.ts` |

### The three steps

1. **Propose.** On upload, `proposeSolutionsTable` looks for a sheet shaped like
   "organisation × what it has / what it wants" and, optionally, a sheet that
   rates solutions per hazard. It matches typed names to the cohort's
   organisations and to the catalogue's solutions with string rules only:
   plurals, accents and filler words are ignored (`spelling`), a short list of
   other names is known (`synonym`), one name inside another is a **doubt**
   (`similar`), and anything else is kept as its own item (`outside`). It never
   guesses between two candidates.
2. **Confirm.** A coordinator reviews the doubts and confirms. Only the mapping
   can change (which organisation a row is, which solution a name is, which
   family an outside item sits in, or "ignore"). **Nothing is counted before
   this**: an unconfirmed table is read as text by the narrative and the report
   says so.
3. **Count.** `crossAnalysis` computes every table and sentence of the new
   sections from the confirmed table and the platform's record. The narrative
   model receives the result (`crossForModel`); it does not produce it.

This is the same rule as the rest of the product: the platform proposes, a
person confirms, a function decides.

### What the report gains

Added to the existing report, nothing removed. All of it prints only when a
confirmed table went into the run:

- **What went in**: the platform's records and each file of the coordination,
  with how it was used (counted / context / not confirmed yet).
- **Organisations by solution family**: cells say *Tem*, *Quer mais* (has it and
  wants more) and *Quer* in words; family totals sit in the column heads; a
  small device icon marks a solution the organisation also tested in Encontro 3
  or the technical visit recommended; `*` marks an item outside the catalogue.
  An organisation with no row is kept as a greyed line saying what exists.
- **Solution by solution**: who has it, who wants it, and the file's own
  ratings. Followed by a computed **reading** (how many wishes are for solutions
  that reduce the risk of that organisation's own site) and a cautious
  **suggestion** (simple-to-build solutions rated medium or strong for a risk
  the list does not cover; never one the organisation already rejected).
- **File and platform side by side**: in both, only in one, and what is worth a
  look (wanted in the file but "não é pra gente" in the Encontro 3 test; kept on
  the platform and absent from the file; the visit's recommendation).
- **What the lists do for each site's risks**: the official hazard level at the
  site (PLAC/ARVC 2050 ameaça, `arvcHazardAtPin`) beside the strongest rating
  among what the organisation wants. ▲ ◆ ● as well as colour.
- **How the file was read**: every non-exact match, so a reader can check.

The existing parts (programme lines, calculated groupings, shared studies,
approval routes, obstacles, gaps) are untouched, and the narrative schema is the
same, so the pre-portfolio board still gets its programme lines.

### The coordination's note on one organisation

In the organisation drawer, tab *Perfil*, a block "Segundo a planilha da
coordenação" lists what the newest confirmed table says that organisation
already has and wants (`coordinationNoteFor`, returned by
`GET …/member/:memberId/profile` as `coordination`).

It is **derived each time it is shown and never written to the organisation's
record**: the organisation did not say it on the platform, a newer file must
replace it with nothing to keep in sync, and removing the file removes the
note. It is not in `chosen_solutions`, the profile PDF, or any document the
organisation receives.

One model pass reads it: the **pre-portfolio's project narrative**
(`narrativeFacts` in `server/services/projectNarrative.ts`), as a line under
each organisation that says it came from the coordination. That page is the
coordination's own board. The joint Encontro 4 does **not** read it, by
decision: that session speaks to the organisations, who never said this on
the platform. Because the line is part of the facts, it is part of the
narrative's cache key: a newer file rewrites the narrative.

### Focus: what a report is asked for

Under the files there are five buttons and one optional sentence
(`shared/synergy-focus.ts`): *por família de solução*, *quem tem × quem quer*,
*arquivo × plataforma*, *por risco* (these four need a confirmed table and are
disabled without one) and *território, necessidades e aprovações em comum*
(everything the report computed before it had a second input). All are on by
default.

- The buttons decide **what prints**, so a report for one question is a few
  pages. They never decide what is read: the platform's whole record always
  goes in.
- The narrative **always** writes its programme lines, whatever the focus,
  because the pre-portfolio board starts from them. The focus and the sentence
  reach the model as "PEDIDO DA COORDENAÇÃO", which steers emphasis and adds no
  fact.
- The sentence (280 characters) is printed at the top of the report, so a
  reader knows what was asked.
- The request is stored on the run (`payload.request`). A report from before
  this existed has none and prints everything.

## Rules that are not obvious

- **The hazard-reduction ratings belong to the file.** They are shown credited
  to it and are **not** the platform's catalogue. Do not copy them into
  `shared/nbs-catalog.ts` or use them in Encontros 2–3 until the technical lead
  has reviewed them and their source is known. This was an explicit condition.
- **Official hazard data only.** The site level is the city's official ameaça
  map. Never the platform's own index.
- **Flood has gaps.** The official flood layer has no reading at many sites.
  When the city's maps place a site inside a Guaíba flood mark, the report shows
  the mark; a site with no official reading and a mark at or below 5.35 m (the
  level of May 2024, `GUAIBA_2024_M`) is treated as exposed. An official reading
  always wins over the mark.
- **One table per report.** With several confirmed tables, the newest is
  counted and the others are read as context.
- **A table inside a PDF or a photo is never counted.** Only `.xlsx`, `.csv`
  and `.tsv` produce grids; the first 500 rows and 30 columns of each sheet.
- **A file is data.** Text of a context file passes `neutraliseInjected` and the
  system prompt says a request inside a file is ignored.
- **No real data in this repository.** It is public. The coordination's real
  spreadsheet, real organisation names and the prototype made from them stay
  out; tests use invented organisations.
- **The test organisation and members who left** are not offered as matches and
  are not in the cross.

## Data model (no `db:push`)

- The file is a `documents` row: `orgId = 'rede:<cohortId>'` (a scope no
  organisation can have), `purpose = 'rede'`, `source = 'coordinator'`, full
  text extracted, original in object storage. Same intake as any upload.
- What was read out of it is `cohort.settings.networkFiles[docId] = { table }`,
  a `SolutionsTable` (`orgs`, `names`, `ratings`, `confirmedAt`, `confirmedBy`)
  or `null` for a file with no table.
- A run's `synergy_reports.payload` gains `outside` (the `OutsideCross`) and
  `inputs` (which files, how used). Older payloads have neither and print as
  before.
- Uploading a file with the **same name** replaces the older one, carries over
  what was decided about its names, and asks for confirmation again.

## API

All under the coordinator session; `:coordinatorSlug` routes are guarded per
network.

| | |
|---|---|
| `GET /api/cohort/:coordinatorSlug/network-files` | the list, each with `table: { orgs, hasRatings, doubts, confirmedAt } \| null` |
| `POST /api/cohort/:coordinatorSlug/network-files` | multipart `file`; returns the file and `replaced` |
| `GET …/network-files/:docId/table` | the table plus `members`, `solutions`, `familias` to choose from |
| `PUT …/network-files/:docId/table` | `{ orgs?: [{sheetName, memberId}], names?: [{key, solutionId?, familiaId?, ignore?}] }` → confirmed |
| `DELETE …/network-files/:docId` | removes the file and its table |
| `GET /api/cohort/:cohortId/synergies/cross.xlsx[?id=]` | the cross of the latest report (or of one run) as a workbook; 404 when that report counted no table |
| `POST /api/cohort/:cohortId/synergies` | body `{ fileIds?: string[], focus?: string[], note?: string }`. `fileIds` omitted = every file, `[]` = none; `focus` omitted or empty = everything |

## Using it

**On the screen:** Orchestrator → Projetos → "Mapear sinergias" → *Adicionar
arquivo*. A spreadsheet opens the review at once. Tick the files to use, run,
open the report, print to PDF.

**From a terminal** (any machine with the repo and a coordinator account):

```bash
export COUGAR_URL=https://<the deployment> COUGAR_COORD_EMAIL=… COUGAR_COORD_PASSWORD=…
npx tsx scripts/network-file-report.ts planilha.xlsx                 # dry: shows the proposal and the doubts
npx tsx scripts/network-file-report.ts planilha.xlsx --review r.json --confirm --run --out sinergias.html
```

`r.json` is the same body the review screen sends; the dry run prints each
doubtful name with its `key`. The file is stored on the server it is sent to.

**Tests:**

```bash
export DATABASE_URL=postgresql://localhost:5432/nbs_e2e   # Node 20 on macOS
npx playwright test e2e/network-solutions.spec.ts --project=chromium
```

## Decisions already taken with the product owner

Do not re-open these without a reason:

- Any file can be added as context; a solutions table gets the review step.
- Items outside the catalogue are kept under a family, not forced or dropped.
- Where the file and the platform differ, both are shown, tagged by source.
- The platform's own data is always all in; only outside files are ticked.
- The table says *Tem / Quer mais / Quer* in words rather than using a colour
  legend; totals in the column heads; a platform icon rather than a tick;
  asterisk and footnote for outside items; an empty organisation stays as a
  greyed row; light, print-first, Portuguese.
- The reading and the suggestion are computed, and the suggestion stays
  tentative in tone ("talvez valha…", "a validar com a coordenação técnica").

## Not built yet (next PRs, in this order)

1. **Adopting the ratings into the catalogue**, only after the technical review
   above.
2. **Show the focus in the list of past reports** (each stored run already
   carries `request`).

Also open: the narrative's time budget (`shared/model-pass-budgets.ts`,
`synergyReport`: cap 240 s, measured 72 s on 2026-09-04) has not been
re-measured with the larger prompt. The added block is small next to ten
organisations' records, but measure it live before trusting that.
