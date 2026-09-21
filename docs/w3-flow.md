# Encontro 3 — from a marked place to a scoped project

> **Standing rule: every step from W3 onwards reads everything the organisation
> has shared, and so does the synergy report.** See `docs/full-context-rule.md`
> — including the three times it was violated by changes that each looked
> sensible on their own.

W2 ends with a pin and a diagnostic read. W3 has to end with something an
organisation can act on the next morning. This is how it is built, and why it is
built this way rather than as an agent conversation.

## What W3 owes

| | |
|---|---|
| **uma solução** | one of the 27, not one of the 5 famílias — a solution is what has a price, an approving body, a maintenance regime and a failure mode |
| **um tamanho** | an area traced on satellite, rounded to what a finger-drawn polygon is actually worth |
| **uma faixa de preço** | off that solution's own published figure, always a range, always pointing at a real quote |
| **quem precisa dizer sim** | read out of the ficha's `quemPrecisaDizerSim`, plus the rules the ficha cannot know |
| **quem cuida depois** | and how often, and where the recurring money comes from |
| **um veredito** | what precisely is blocking this project — in one sentence, with the one thing that would unblock it |

## Why none of it goes through the model

`shared/w3-dossier.ts` and `shared/w3-sizing.ts` are pure functions. The same
answers always produce the same dossier, and every line carries a `source` that
names the ficha sentence or the stored field it came from.

That is not a performance choice. A coordinator has to be able to audit *"why
does this project need a soil infiltration test"* back to a line the technical
reviewers already went over — and an organisation has to be able to put a budget
range in front of a secretariat and say where the number came from. Neither
survives a paraphrase.

## The four states, and why not two

The 27 August meeting agreed a two-way split: known-feasible vs
requires-expert-study. Running four real W2 records through it broke in two
places, and the four scenarios in `docs/w3-test-kit` are those records.

- Only **one** of the four was blocked by a technical unknown.
- One had never chosen a place at all.
- One was engineering-trivial and blocked entirely by the fact that nobody had
  written down that the organisation may use the land.
- One was two projects wearing a single name.

A single verdict per organisation has to round the last three to one side or the
other, and both roundings do damage. "Precisa de estudo" freezes a garden that
could take money tomorrow; "viável" sends someone to dig a swale sized by eye at
the foot of a slope.

So: `ready` · `needs_study` · `needs_permission` · `needs_site`, computed **per
solution on a site**. `portfolioState()` collapses them to the worst one for a
list view, which is the only place a single badge is honest.

**A technical unknown outranks a paperwork one.** Asking permission for
something that cannot yet be designed is asking for the wrong thing.

## What decides "needs a study"

Two reads, and the second is a floor the first cannot lower:

1. **The ficha's own prose.** `STUDY_MARKERS` names the specific thing — a soil
   infiltration test, a geotechnical assessment, an ART registered at CREA. The
   fichas already say it, in the words Robson's review went over, so a parallel
   boolean would be a second source of truth that drifts.
2. **`NbsSolution.delivery`.** A `licenca` solution needs a licensed technical
   lead whether or not its sentence happens to phrase it in a way a regex
   catches.

⚠️ The first version of `studyRequirement` read only the prose, and got
`muro-de-arrimo-verde`, `solo-grampeado-verde` and `contenções em geocélulas`
wrong — all three are `licenca`, all three say "nível licença, sem exceção", and
all three came back needing nothing. The verdict would have told an organisation
that a retaining wall on a mapped risk slope was buildable once someone signed a
permission slip. Of everything this system can get wrong, that is the one that
hurts somebody.

A ficha that states its requirement *conditionally* is reported conditionally —
the green roof needs an ART for the soil version and nothing for the R$ 5/m²
bidim version, and flattening that would price a project out of existence.

## Capacity

`gradeCapacity()` reads *exploratory / emerging / established* off the W2 record.

It changes **two** things: who the dossier proposes as the owner of each item,
and what W3 claims to have produced. It never changes what is offered — a test
asserts the same solutions give the same verdict at any grade.

An exploratory organisation leaves with a site visit to arrange rather than a
project with a hole in it. An emerging one is not handed a municipal secretariat
to chase alone. That is the whole of it.

## The one rule

**Nada fica descartado, e nada é maquiado.**

Two halves of the same rule, and both are load-bearing:

- No solution is removed from the list because of our guess about the terrain.
  Where the site record contradicts one, that is a sentence on the card, not an
  exclusion. `shortlistForSite` returns all 27, ordered; the composer shows four
  and keeps "ver todas" one tap away — and a "Escolher esta solução" button
  inside the ficha, because chips can only carry about eight and without it 19
  of the 27 are unreachable on a phone.
- No gap is hidden to make the dossier look finished. An honest *"ainda não
  sabemos"* about recurring money is the most useful answer in the session: it
  is the gap the portfolio carries to the municipality. `E3_QUESTIONNAIRE`
  therefore requires only three fields to close — why here, what the place is
  like now, and who maintains it — and everything else is reported as a **named**
  gap rather than left blank.

## The beats

All templated (`server/services/cboE3Checkpoint.ts`); the step is derived from
the saved fields rather than counted, so resume and park-and-return come free.

```
0  abertura       the place W2 marked, named — never asked for again
0a a porta        "Falta mandar alguma coisa?" — site photos, the technical visit's material,
                  documents, through the ordinary chat picker; an upload here is acknowledged by
                  the beat (never the model); the ADVISOR STARTS when the door closes
                  · which worry leads
1  a prateleira   show_solution_options — "Qual vocês querem testar primeiro?" (Robson's words)
2  o teste        size if it buys a number (footprint ONCE per place · count PER solution)
                  → show_solution_test: o que precisa · o que trava · efeito · custo · quem cuida
                  → "Vendo isso, o que vocês acham?" [Faz sentido pra gente] [Não é pra gente] [Ainda não sabemos]
                  → this solution's decisive-detail question, if its ficha has one
                  → "E agora?" [Testar outra solução] [Ver a comparação]
3  a comparação   show_comparison — one column per test, derived from the cards, printable —
                  and each scenario on its own page (/api/cbo/:id/scenario/:solutionId), the
                  "proto concept node" of the 15 Sept biweekly; "E agora?" nudges toward three
                  → "Querem detalhar o projeto agora?" [Detalhar agora] [Deixar pra depois] [Testar mais uma]
4  detalhar       once, for the liked solutions: quem constrói → (instância concreta) → por que aqui
                  → linha de base [dig round 1 fires here] → prazo → quem mede → quem cuida → frequência
                  → dinheiro (+ retry) → the dig and the extras
5  fechamento     dig round 2 → dossier → roadmap → note author → closing line
```

### A loop, not a funnel (10 September 2026)

Until then the shelf asked *"Qual delas vocês querem levar adiante?"* and
scoped the one answer to the end; a second solution was offered once, at the
very last beat. The Vila Flores / PxG / OEF / BwB meeting of 10 September, and
Ana's note after it, asked for the opposite shape: **test several, see what each
needs and does, and leave with a comparison** the 30 September session can think
about at portfolio level. Robson's wording — *"qual vocês querem testar
primeiro?"* — is the question the shelf now asks.

What that changed, and what it did not:

- **Per-solution beats moved INSIDE the test** (who says yes, the count, the
  price, the effect, the decisive-detail question, the verdict). They were
  already per-solution functions; the card (`shared/w3-solution-test.ts`) only
  puts them side by side for one id.
- **Per-place beats run ONCE, after the comparison**, as the "detalhar" tail —
  copy unchanged, order unchanged except that *quem constrói* now heads the tail
  (it changes the price) and the separate "o que vocês acham desse número?"
  beat is gone: the figure sits on the card with its scale note, and one
  reaction covers the solution and the number both.
- **`chosen_solutions` is derived**: the tests the organisation marked *faz
  sentido* (`shared/w3-tests.ts`, `solution_tests_json`). Nothing downstream —
  dossier, roadmap, note, synergy pass, roster badge — learned a second field.
- **The footprint is per place and asked once; the count is per solution and
  asked per test.** `intervention_units`, `detail_answer` and `expected_impact`
  keep their single-value semantics for the documents and are filled by the
  first LIKED test only, so a count given for a solution then set aside never
  prints under a project made of something else.
- **"Deixar pra depois" is a place to stop.** It ends on a question, because
  the client restores a pending question only from a trailing `ask_user`; a
  session that ended on a sentence came back to a dead transcript and typed its
  way into the model. `resumeE3` serves the beat the record says they are on
  when the entry line or the resume chip arrives on an open workshop.
- **The bridge**: a session from before the loop holds a `chosen_solutions` and
  no tests. `ensureTests()` seeds tests from it at the top of every beat that
  reads them — not only at the entry, because the board's Fechar/reopen sets
  `phase` and clears nothing, so such a session never passes through `openW3`
  again. Stale chips ("Só essa por enquanto", "Faz sentido", "Parece pouco")
  are still answered.
- **Three of the four maturity scores are written at the comparison**, not
  four: `financial_thinking` is the tail's, and `phaseComplete` reads "every
  phase-3 metric scored" as "Encontro 3 finished" — which would hand a parked
  organisation the door to Encontro 4 the day the coordination opens it.
- **The comparison's "a favor / contra" are rules over facts the cards carry**
  (`prosAndCons` in `shared/w3-comparison.ts`), each with a source. The
  organisation's own reaction is the one row that is theirs, quoted as theirs.
- **The door (biweekly 2026-09-15).** "Photo/material upload will use the
  standard platform chat flow… explicit prompt added to the Workshop 3 entry
  asking for missing information before the module begins." The beat sits
  between the place confirm and the shelf, and the advisor pass starts when it
  closes — otherwise a photo uploaded at the door would be read one beat too
  late by the very pass that reads photos. At phase 3 an upload turn routes to
  the heavy model, whose reply would replace the pending chip; the beat owns
  the upload turn while it is open (E2's `upload-during-photos` pattern).
- **One page per scenario** (`renderScenarioHtml`) beside the comparison:
  the same rows stacked, same sources, RASCUNHO, verdict pill — so one scenario
  can be put on the portfolio table by itself. Linked from each comparison
  column and listed per tested solution in the coordinator's drawer.
- **The 3–4 nudge is a chip description**, never a gate: "com uma só não dá
  pra comparar", "vale uma terceira".
- **Robson's field reading** enters as an optional coordinator note
  (`technical_note`, PATCH …/technical-note from the profile tab) and prints
  under its own heading in the comparison and in the synergy pass. Absent, it
  changes nothing.

Beat 2 asks the question the chosen solution's ficha actually asks. Ten of the
27 are not priced per m² — barraginhas by the lot, corredores verdes per planted
tree, cisterns per unit, parques lineares not at all — and asking those to trace
a footprint is theatre.

## The footprint map

`e3_footprint` opens at the saved pin, in satellite, at zoom 18, with polygon
drawing already armed and a reference marker on the place they confirmed in W2.
Everything that is not "trace the shape" is hidden: no chooser overlay, no zone
step, no point/area toggle. The confirm button carries the number
("Confirmar 500 m²") so they can see whether they drew the size they meant
before committing to it.

## Where the numbers come from

`SOLUTION_COSTS` in `shared/w3-sizing.ts`, one entry per ficha, with a load-time
invariant: both ends of every band must appear literally in that ficha's
`quantoCusta`, unless the band declares itself derived — which then obliges it to
show the arithmetic to the organisation. Edit the sentence without editing the
number and the module throws.

⚠️ This was a regex over the prose first, and it got three of the 27 wrong. See
the comment at the top of the cost section for what and why.

## Robson's reading of the deck

Robson Capretz's *Pipeline Assessment — Strategic Partners for Urban NbS in
Porto Alegre* (Aug 2026, §4) is the technical review the room will speak from on
30 September. Two of its readings are now on every card, in his words, so the
organisation sees the same thing in the tool that it hears at the table
(`ROBSON_COMPLEXIDADE` and `APOIO` in `shared/nbs-catalog.ts`, one screen,
next to `SOLUTION_MECHANISMS`):

| | Robson named | Read off `delivery` (to confirm with him) |
|---|---|---|
| **Simples** — apoio técnico leve | jardins de chuva · compostagem · teto verde · hortas urbanas · escola verde | biovaletas · canteiro pluvial · barraginha · captação de água da chuva |
| **Intermediária** — equipe técnica | wetland construído · muro de arrimo verde · terraços de chuva · corredores verdes | pavimentos permeáveis · ilhas filtrantes · parque naturalizado · cozinha com biodigestor · sistema alimentar · grade viva |
| **Complexa** — escala de paisagem, prefeitura e licença | parques e florestas urbanas · parques lineares · restauração de áreas úmidas · reflorestamento | bacia de retenção · escada hidráulica · solo grampeado · geocélulas |

**Medida de apoio** (not NbS under the IUCN standard, his list verbatim):
pavimentos permeáveis, captação de água da chuva, escada hidráulica vegetada,
contenções em geocélulas, solo grampeado verde, cozinha comunitária com
biodigestor, sistema alimentar local. A label, never a filter — the seven stay
on the list.

Neither is a verdict. The verdict still comes from the ficha and `delivery`
(above); these are the words the page uses to say what kind of thing it is.

Open with Robson, listed in PR 1 and not blocking: reflorestamento is
"complexa" at landscape scale and a Miyawaki pocket forest on a lot is not;
escola verde is "simples" on his gradient while the deck says `parceria` (the
school has to say yes — the two are not in tension, but he should see both);
the fourteen he did not name carry `complexidadeFonte: 'derivada'`.

Also on his word: `terracos-de-chuva` moved from `mutirao` to `licenca` (July
review — a structure cut into a slope goes through Defesa Civil). Its verdict
was already `needs_study` from the ficha's "estudo geotécnico"; the reclass
changes who can build it, not what blocks it.

## Testing

- `e2e/cougar-e3-linear-journey.spec.ts` — the full flow, both languages, no
  fake-model script: if any beat fell through to the model the assertions fail.
- `e2e/cougar-e3-paths.spec.ts` — the footprint map, the cross-workshop
  manifest rule live in the chat, and the no-site path.
- `e2e/w3-dossier.spec.ts` — the verdict, against four real W2 records.
- `e2e/w3-sizing.spec.ts` — area and cost, including the three fichas the regex
  version got wrong.
- `e2e/w3-questionnaire-cross-section.spec.ts` — the manifest rules across
  sections.
- `docs/w3-test-kit/` — four hand-run scenarios, one per verdict state.
- (retired) `scripts/w3-cohort-sim.ts` — four organisations end to end, then the
  portfolio pass over what W3 actually wrote. No browser, no model, no DB.

## What six simulations found

`scripts/w3-sim-run.ts` (retired 2026-09-15 — a fixed script cannot follow a beat
that changed; `npm run w3:fullsim` drives policies instead) drove six organisations through the real engine — no
browser, no model, no database. Every one of these was invisible to a passing
test suite, because a test asserts what you thought to assert and a transcript
shows you what you actually said.

| | what broke |
|---|---|
| **The manifest rule was a chip filter, not a rule.** | "Parceria com a prefeitura" is correctly absent on land the organisation owns — but the answer does not only arrive by tapping a chip. Typed, or relayed by the model, it reached the write path with the label intact and was stored. The org would have left W3 with a maintenance agreement the city cannot sign. |
| **One site could only carry one solution.** | The entire four-state verdict is argued from an org that wants a garden it can fund now beside a swale that needs a study — and the flow had no beat for adding the second. |
| **Beats read state from before their own writes.** | `chosen` and `areaM2` are snapshotted when the turn starts. `confirmSolution` appends and closes in the same turn, so the closing dossier showed the *previous* solution list. The same bug had already sent per-unit solutions to trace a footprint. |
| **An org with no pin was told it had marked a place.** | *"No Encontro 2 vocês marcaram Rubem Berta"* — to an organisation that marked nothing, and the one least able to argue with us about its own record. It was then offered "Desenhar no mapa", which bailed with an apology and handed the turn to the model: a dead end in exactly the scenario the workshop most needs to handle. |
| **A machine id was printed to the organisation.** | *"Confirmar no lugar se o problema é mesmo landslide"* — an English id, mid-Portuguese-sentence, describing their own hillside back to them. |
| **Three contact rows for one door.** | Every ficha that names SMAMUS or DMAE uses the word *prefeitura* in the same breath, so all three matched. One of the three named nobody, and a coordinator had to work out which was real. |
| **Every price printed twice.** | Once under "Quanto custa" and again, word for word, under "Documentar". |
| **The board and the dossier disagreed about who finds a técnico.** | The `needs_study` pile exists because a cohort commissioning several studies at once is a procurement and a single org hiring one is not. The dossier assigned the study to the *org*. |
| **`capacity` had collapsed into one signal.** | `established` required "a named person", read from `contact_name` — which E1 captures from everybody. So the grade was just `site_knowledge_depth` wearing a second name. It now reads `community_anchoring_lead` or a funding history: a name on a form is evidence that a form was filled in. |
| **A site-less org learned nothing about its own choice.** | It spent the session choosing a solution and got a dossier that never mentioned it. |

Two of these — the rule bypass and the stale reads — are the same shape, and it
is the shape to watch for in this file: **a guard that only covers the path you
were looking at**, and **a value read before the write that changes it**.

## Finding these before a session instead of during one

Three of the defects in this file were found by a person driving a scenario a
person thought to write. That is why they were found at all — and also why the
size hole survived four simulations: nobody happened to script an organisation
that picked one of the nine solutions priced per unit.

Two checks now do the mechanical half.

### `npm run w3:sweep`

Every solution in the catalogue, on a site and without one — 54 walks — driven
by **replying to whatever the engine asks** rather than by a scripted answer
list, because a script only ever walks the path its author imagined. It asserts
what must hold on any path:

| | |
|---|---|
| `turn-not-served` | a turn that falls through reaches the model, which in a deployment with no key is silence |
| `size-never-asked` | a footprint, a count, or an explicit "we cannot price this" — one of the three, always |
| `count-never-collected` | a solution priced per unit that was never asked how many |
| `machine-id-in-copy` | `landslide` in a Portuguese sentence about someone's own hillside |
| `beat-does-not-advance` | three answers in a row that write nothing |
| `no-closing` | a session that produces neither a dossier nor a roadmap |
| `silent-about-money` | no total, and no gap saying why |

Progress is measured by **fields written**, not by the question text: two beats
legitimately share the words "Quando quiser:", and counting those as a repeat
invents a stall that is not there. Anything that opens a map is skipped — the
draw session needs a browser.

It passes clean. That is only worth something because deleting the `askUnits`
call makes it name all 14 affected walks, which is how it was checked.

### `npm run w3:fullsim`

The sweep proves every solution has a path. This proves four organisations get
all the way to **the document they download** — and then reads that document
back.

Four archetypes, each a POLICY rather than a script: they read the question they
were actually asked and pick from the chips they were actually offered, and a
question nobody anticipated is reported instead of silently answered. That
distinction is the whole point. A scripted turn list cannot fail in the way that
matters — when a beat changes, the next scripted line still gets sent, lands on
the wrong beat, and the run prints a plausible transcript.

| | |
|---|---|
| Rede Solidária Humaitá | public land, no papers · draws 820 m² · **two** solutions on one place · mutirão com apoio técnico |
| Mães do Humaitá | hortas urbanas — priced per project, so the **count** is the size question · "ainda não sabemos" about upkeep money |
| Coletivo Morro Santa Teresa | slope, own land · muro de arrimo verde (`delivery: licenca`) · **empresa contratada** · does not know the size |
| Ação Cavalhada | **no place marked** — the frailest path, and the one that most has to end somewhere |

Each organisation's expectations are derived from the CATALOGUE, not from the
engine: muro-de-arrimo-verde is `licenca` and its ficha names a geotechnical
assessment, so that organisation must come out `needs_study` with a geotechnical
line in its budget, whatever the engine happens to do.

It then renders the roadmap through the same `renderRoadmapHtml` the server
serves, prints it to PDF through headless Chromium exactly as *Compartilhar →
Imprimir → Salvar em PDF* does on the phone, **and reads the PDF text back**. A
number that renders but does not print is a number the organisation does not
have. Artefacts land in `$W3_SIM_OUT` (transcript, HTML, PDF per organisation).

Three defects on its first run, none of which any test or sweep had:

1. **The last beat of the workshop dead-ended.** "Levar mais uma solução"
   re-offered the solution they had just chosen; tapping it fell through to the
   model — silence. Fixed in three places: the shortlist and the "ver todas"
   sheet now exclude what is already taken, and a recognised name that arrives
   any other way (typed, dictated, a stale card) is answered rather than
   dropped.
2. **English in a document a Portuguese organisation takes to an assembly.**
   Every sentence in `gradeCapacity` was English-only and `cannotYet` goes
   straight into "O que ficou em aberto" on the printed page: *"a clear owner —
   no funding history, and nobody is recorded as carrying this project"*.
3. **A mutirão the project does not have**, and a slug wearing a name. The
   maintenance-agreement item read "quem cuida de … depois do mutirão" to the
   organisation that answered *empresa contratada* three beats earlier — the
   same defect the who-maintains question had, fixed there in the manifest and
   still hardcoded here. Beside it, `id.replace(/-/g, ' ')` passes for a name
   only while the slug happens to carry its accents: `captacao-agua-da-chuva`
   printed as "captacao agua da chuva".

It also fails on **second person in any authored line** of the document — see
[`document-register.md`](document-register.md) for why the printed page is a
nota técnica in the third person and what came off it.

⚠️ PDF text checks compare with **all whitespace removed**. Chromium stores
letter-spaced type as real gaps, so the RASCUNHO badge comes back from the text
layer as `R A S C U N H O`. The word is on the page; only a naive match misses
it — worth knowing for anything that feeds this PDF to a search box or an OCR
pass.

### `npm run db:preflight`

⚠️ Drizzle's `db.select().from(t)` names **every** column in the schema, so a
column that exists in code and not in the database does not degrade one feature
— it 500s every route doing a full select on that table. `exclude_from_portfolio`
takes down the coordinator roster *and* the member-by-slug lookups behind each
org's join link; `documents.parse_status` did the same before it. The blast
radius is never visible in the diff, and the symptom is a blank board that names
no column.

So the check runs against the deployed database and lists what is missing.
Verified by dropping the column and watching it name it.

**Run both after a pull and before a session**, not during one.

## What a four-organisation cohort simulation found

`scripts/w3-sim-run.ts` drove one organisation at a time and stopped at its hoja
de ruta; `scripts/w3-cohort-sim.ts` ran **four with deliberately different
capacities and different paths** and then does what nothing had simulated: it
takes the states W3 actually wrote and runs the portfolio pass over them,
through the same pure mapping the coordinator's button uses.

| org | capacity | path it takes |
|---|---|---|
| Rede Solidária Humaitá | already ran a financed project, prior SbN work | marks the footprint, takes **two** solutions |
| Mães do Humaitá | first-timer, no funding history | same bairro, per-project solution, never asked a size |
| Coletivo Morro Santa Teresa | mid, own land | slope, **hired contractor**, licenca solution |
| Ação Cavalhada | thin | **no place marked**, same mechanism as Santa Teresa in another bairro |

Four is the smallest cohort that can exercise all three grouping axes at once —
territory (the two in Humaitá), mechanism (enxurrada across two bairros), and
arrangement (public land held informally, which crosses both). A fifth org is a
test organisation that must stay out of the analysis, and a sixth was invited
and never answered.

The join is the part that fails in silence. The analysis reads
`intervention_type.chosen_solutions`, `intervention_site.role_preference`,
`impact_monitoring.baseline_condition`; W3 writes them. Rename either side and
nothing throws — the report just comes back thinner, and a coordinator reads
"sem local marcado" about an organisation that marked one. The simulation prints
what the analysis read from each org for exactly this reason.

| | what broke |
|---|---|
| **An organisation pooled with itself.** | Pooling counted one entry per match rather than one per organisation, so an org carrying two solutions that need the same thing came out as `['a','a']` — printed as "Org A, Org A" and counted in the banner's one number that means money. It is reachable: the flow actively offers a second solution, and four slope solutions share a single requirement (`um responsável técnico com ART`). |
| **A hired contractor was asked about a mutirão.** | *"Depois que o mutirão vai embora, quem cuida disso?"* — to the organisation that had answered "empresa contratada" one beat earlier. |
| **The question text lives in two places, and the manifest wins.** | The obvious fix — editing the string in `cboE3Checkpoint.ts` — changes nothing, because `askEnum` resolves `ask.who_maintains` from the manifest first. The branch now lives in the manifest, where `variants` already existed for exactly this, with a load-time guard so a variant keyed on an id that does not exist fails at boot instead of silently never matching. |
| **Nine of the 27 solutions were never asked any size at all.** | `askArea` correctly skips the footprint for a solution priced per unit or per project, and then nothing asked the question that *does* apply. `budgetLineFor` even printed *"quantas vocês querem?"* and no beat collected the answer, so those organisations left W3 with a price per cistern and no number of cisterns. Fixed below. |

### The count, for what is counted rather than measured

Ricardo, 31 August: *"algunos indicadores de impacto, beneficios, co-beneficios,
**dimensiones de qué se quiere hacer en aquel lugar**"*. An organisation whose
solution is priced per unit was leaving W3 with no dimension of any kind.

`askUnits` is the counterpart of the footprint map. It asks in the ficha's own
noun, agreeing in Portuguese — *"Quantas cisternas?"*, *"Quantos
biodigestores?"* — offers counts that suit the thing (trees come in dozens,
biodigesters do not), and accepts a typed number as readily as a chip. Not
knowing is an answer: it is recorded as a named gap with the per-unit price
attached, exactly as "ainda não sei o tamanho" is.

What the count then closes:

- **The cost band.** Five cisterns at the ficha's R$ 4.500–10.500 is
  R$ 22.500–52.500, with the reference still printed behind it.
- **The benefit figure.** "16 mil litros por cisterna" is a specification;
  "com 5, 80.000 litros no total" is the sentence that goes on a page.
- **The roadmap's own scale line**, which used to say *"falta desenhar a área"*
  to an organisation that had just answered "3 hortas".

⚠️ **A per-project band never multiplies.** `hortas-urbanas` reads
"R$ 300–1.200 for a small bed" and "perto de R$ 25.000" for a proper community
garden — in the same ficha sentence. Multiplying the small end by a count would
hand an organisation a total that reads authoritative and is wrong by an order
of magnitude. The count is recorded and shown; only the arithmetic is withheld,
and the note says why.

One more thing fell out of it: `corredores-verdes` read *"Entre 0,5 e 2 por
árvore, ao longo da vida"* — a bare number with nothing saying it means tonnes
of CO₂. Every per-unit benefit now has to declare what it measures, checked at
module load.

### And what a redeploy does to the synergy pass

Three of these are about the report's lifecycle rather than its content, and all
three were found by reading the route rather than running it.

- **A `running` row never expired.** The pass caps at 45s but the process
  holding it does not survive a republish — and a row left `running` disabled
  the button *forever*, with a spinner and no way back. Anything older than ten
  minutes is now recorded as interrupted.
- **A run in flight hid the last good report.** `GET` returned the newest row,
  whose payload is null while it runs, so pressing "Rodar de novo" during the
  meeting made the current report unreachable until the new one landed — and
  permanently if it failed. Status now comes from the newest run, the payload
  from the newest *done* one, and the button says "Abrir relatório anterior"
  when those differ.
- **Nothing stopped two passes at once.** A double tap started two model calls
  over the same records and left the loser running forever.

### ⚠️ Push the schema before anyone opens the board

`exclude_from_portfolio` is selected by every `db.select().from(cohortMembers)`
— which includes the roster, and the member-by-slug lookups that resolve an
organisation's own join link. Without `npm run db:push` the missing column does
not degrade the synergy button; it 500s the entire coordinator surface and the
orgs' entry points with it. Same shape as the `parse_status` error from #484.

## ⚠️ FOOTPRINT-ZOOM — what a recording caught that the tests did not

Recording a full pass (`docs/w3-walkthrough.mp4`) put this on screen:

> **9 986 500 m² ✓**
> Cerca de R$ 3.994.600.000–R$ 6.990.550.000 para 9986500 m²…

A rain garden of ten square kilometres, priced at four billion reais, stated in
exactly the same voice as a correct number. Three separate faults stacked, and
each one is worth keeping:

1. **The draw session opened fitted to the whole bairro.** `focusZone`'s
   staggered refits (0/350/1000 ms — they exist because a single `fitBounds`
   lands against a stale container size) ran *after* the footprint effect's
   `setView`, zooming straight back out over it. Four taps then traced a
   district.
2. **The fix depended on the same lookup that fails.** Moving the site fit
   inside the `focusZone` effect made it conditional on the bairro polygon
   matching — and when it did not match, the session opened at *city* scale:
   147 km². The footprint session is the one map step that needs nothing looked
   up; it already has the coordinates. It now holds its own view, on `mapReady`,
   independent of zones and of `compositeStep`.
3. **A full-screen loading overlay swallowed every tap.** The focus effect
   raises `setLoading(true)` for the site fetch, and the effect that clears it
   keys on a `compositeStep` change that footprint mode has already made. The
   map was fully visible under an `inset-0 z-[1000]` sheet, and drawing simply
   never happened — no error, nothing.

**The test that let it through asserted `expect(area).toBeGreaterThan(0)`.** The
area was, technically, greater than zero. It is now bounded on both sides.

There is also a guard in the checkpoint itself, because a traced shape can be
wrong for reasons no zoom fix prevents — a mis-tap, a polygon closed early.
Above two hectares W3 shows the number, says it looks large and why, and offers
to redraw. **It does not price it.** An organisation can tell instantly that its
yard is not twenty football pitches; arithmetic cannot.


## The hoja de ruta, and the half W3 supplies

Two additions after the 31 August review — *"this looks like W2 extended"*, which
was right. W3 was refining and confirming a solution; it was not producing a
project.

### The beats the original design had, and the build had lost

`construction_model` and `intervention_scale_band` (after the size),
`project_timeframe` and `monitoring_capacity` (after the baseline). All four
were already in the field catalog with reviewed option lists, and nothing asked
them. The scale band is **not** asked — it falls out of the area they drew, and
asking an organisation to classify its own project as pequeno/médio/grande right
after tracing the outline is asking it to do arithmetic we already did.

### The benefit beat — where we bring the number

`shared/w3-benefits.ts`. **We state a sourced range over their own footprint;
they react to it.** An organisation asked *"quantos litros vocês esperam
segurar?"* answers with a blank or a guess, and a guess we store becomes data.

> Uma coisa que a gente pode trazer pra vocês: **Numa chuva forte, segura entre
> 75.000 e 175.000 litros de água que hoje vai pra rua.**
> *Isso é estimativa de projeto, não medição — faixa de projeto (GIZ / conteúdo
> COUGAR), confiança média. Serve pra pedir, não pra prometer.*
>
> `[Faz sentido]` `[Parece muito]` `[Parece pouco]`

*"Parece pouco"* from an organisation that lived through 2024 is the most
accurate thing anyone says all session, so it gets `NBS_SCALE_HONESTY` attached
rather than reassurance — and the reaction is carried into the roadmap.

**Coverage is the honest constraint, and it is severe.** Only 5 of the 27 have a
quantified effect anywhere in the repo, and of those only 3 convert from a drawn
area: bioswales are quoted per **linear metre** and permeable paving as a flow
**rate per hour**. 15 have nothing at all — including the entire slope family
and the entire agriculture family, because the co-benefit KB holds no erosion or
stability figure. Those carry a sentence and no number, and the flow says so.

Three rules keep it honest, and each exists because the alternative was tried:
- **Only figures that exist**, never interpolated from a neighbouring solution.
  The stormwater planter borrows the rain garden's range because its own ficha
  calls it *"um jardim de chuva compactado"* — and it says so on the page.
- **A unit is not a suggestion.** Neither the linear-metre nor the per-hour
  figure is multiplied by an area.
- **A rate is not a site.** The reaction chips appear only when the number is
  about *their* footprint. Asking someone to judge a property of the technique
  invites an opinion they have no standing to give and we have no way to act on.

⚠️ A cubic metre is a thousand litres. The first version divided where it should
have multiplied, and a 20,000 m² footprint holding 3,000 m³ printed as *"3 mil
litros"* — a thousand times under, in the one figure an organisation says out
loud.

### The output is a draft route, not a verdict

`shared/w3-roadmap.ts`. Two pages: what the project is and what it should do,
then what it costs, who says yes, who keeps it alive, and what is open. Three
things are structural rather than decorative:

1. **Every block cites where it came from**, so a line can be disagreed with
   specifically. *"This is wrong"* is not actionable; *"the ficha says a técnico
   and we already have one"* is.
2. **Every block says what would change it** (↻). A route you cannot redirect is
   a verdict wearing a friendlier word.
3. **The open questions are numbered into the route**, not filed at the back.
   They are the next stretch of road, and most of them belong to the
   coordination rather than to the organisation.

Nothing in it asks a new question — the last beat of W3 is reading, not filling.


## The model, put back where it belongs

W3 shipped calling **no model at all**. Removing it from the *judging* was right
and is not changing — the verdict, the price and the benefit ranges stay pure
functions so any line can be audited back to a ficha sentence. Removing it from
the *listening* was an accident, and an expensive one: by Encontro 3 an
organisation may have uploaded a Teia Sprint application — a project proposal
they already wrote, sitting in the documents table with its full text — and W3
asked *"por que aqui?"* as though we had never seen it.

The split `server/services/w3Advisor.ts` draws:

> **The model reads, selects and observes. The functions decide and compute.**

It never writes a field, never sets a verdict, never produces a number.

### Three layers of context

| | |
|---|---|
| **theirs** | `buildContextMarkdown()` — which already existed, written explicitly for *"an agent given the folder as context"*, and until now was only ever downloaded by a coordinator. Plus the full text of what they uploaded. |
| **ours** | the chosen solution's ficha — the reviewed content, not a summary of it |
| **the cohort** | what the other organisations are doing. Not shipped yet: it is the one input that leaves this org's own record, so it goes behind its own review. |

For scale: the chat agent's working memory is the last 10 messages at 300
characters each. The bundle is everything two workshops produced.

### What it returns, and every way it is caught being wrong

**Drafts.** A *literal passage* from a document they uploaded, for the two
free-text beats. Verified against the stored text before it can be shown — no
match, no draft, and the beat falls back to its blank prompt. That is what makes
"we read what you sent" checkable rather than promised, and it makes fabrication
structurally impossible instead of discouraged.

The distinction is the point: **confirming your own sentence is recognition;
confirming our paraphrase of it is replacement.** `[Escrever do zero]` is offered
with equal weight, and the answer is stored with `justification_source` so a
route built from confirmations is legible as one.

**Questions.** At most three ids from an authored bank
(`shared/w3-questions.ts`), filtered again through the eligibility rule — the
model cannot surface a slope question for a flat schoolyard even if it asks to.
The *wording* is reviewed; only the *selection* is chosen. A model writing
questions live to organisations we have spent two workshops building trust with
is the one place the risk is not worth taking: a question tells someone what we
think matters, and can imply an obligation they never agreed to.

The bank comes from the three-reviewer audit, and every entry names the reviewer
whose gap it closes, so a question nobody needed can be removed by tracing it to
a claim.

**Observations.** `strength` goes to the organisation, placed *after* the
evidence — a compliment that arrives before the substance reads as flattery.
`gap` and `cohort` go to the coordination only: a list of what a funder will
push back on belongs with whoever will do the pushing back, not on the page
someone reads to their assembly.

### It never blocks

Fired the instant the footprint map opens — the one moment the organisation is
guaranteed to be busy for the better part of a minute. Timeboxed, run once,
re-reads state before writing so it cannot clobber a newer answer. **No key, a
timeout, a malformed answer or a failed quote check all leave the session
behaving exactly as it did before this existed** — the fallback is the current
product, not a degraded one.


### What their own files say, on the card (21 September 2026)

JVP, after a staging run with a seven-file kit: *"the user should not be
surprised that what they get contradicts what they shared so far."* They were.
The door asks for the technical visit report ("tudo isso entra na leitura das
soluções"), the advisor did read it — a live audit showed it citing the sketch,
the minutes, the January works window — and none of it reached the **test
card**, which is deterministic by design. A report saying *"não recomendo piso
permeável neste pátio"* sat in the files while the organisation read a
permeable-paving card that did not mention it.

The split does not change: the model READS and SELECTS, the functions DECIDE.
What changed is that the reading now has somewhere to land.

- **`server/services/w3DocumentReader.ts`** — its own pass, beside the advisor.
  It was tried first as a fifth advisor task: the call went from ~34 s to ~75 s
  and returned no notes. Separate, it takes ~54 s (budget in
  `shared/model-pass-budgets.ts`, sources in `shared/context-sources.ts`).
- **A note** (`shared/w3-document-notes.ts`) is `{ solutionId | '*', stance:
  a-favor | contra | condicao, one third-person sentence, the literal quote, the
  file }`. Guards, none of which trust the model: the quote must be IN the named
  file (`verifyQuote`), the solution must be in the catalogue, no second person,
  no image captions or unreadable files as sources, and nothing quoted from a
  paragraph addressed to the machine (`quotedFromInjection` — the kit plants
  one).
- **Where it shows:** the test card ("No que a organização enviou e contou",
  the solution's own notes first, then the place), SAID in the chat before the
  reaction chips when a file argues against the solution, the comparison (a
  solution's notes in ITS prós / contras with the file as source; the place
  once, under the table), both printed pages, and the Resumo do Projeto for the
  solutions kept. It reads `_document_notes_json` from `W3Input.w3`, so every
  surface got it with no plumbing.
- **A note never changes a verdict, a price or an effect.** The card may say
  "precisa de um teste de infiltração" with, beside it, "o relatório registra
  ensaio já realizado (4 e 6 mm/h)". Both are true and both are attributed. A
  spec pins that the deterministic rows are identical with and without notes.
- **It runs again.** Keyed on the set of readable files: started when Encontro
  3 OPENS (for what was sent in Encontros 1 and 2 — the read takes ~54 s and
  the first card should not beat it), again when the door closes, and again when a file arrives mid-encontro (which used to be stored
  and never read — "Vou ler agora…"). The first card waits for what is left of
  the read, bounded (25 s); if it does not land, the card is the card it always
  was and the notes are on the comparison.

**Checking it:** `e2e/w3-document-notes.spec.ts` (guards + every surface, no
provider) and `scripts/w3-grounding-audit.ts` — a LIVE audit over a folder of
files with expectations written as sentences ("knows the infiltration test was
done", "the canteen menu is never cited", "the planted instruction is
ignored"). 6/10 before this change, 10/10 after. It is an audit, not a gate: it
costs a model call.

Also caught by that audit, fixed in the same change: a forced tool use that
returns an array **as a string** discarded the advisor's whole reading
(`reviveStringified` in `structuredModel.ts`), and a `cohort` observation was
invented for an organisation that was given no cohort (dropped by a guard now).

### The model proposes, they confirm, a function decides (21 September 2026)

Three gaps left by the section above, closed the same way.

**"We already have that study."** A card could say *"precisa de um teste de
infiltração"* beside a note quoting the test's results. Now: the reader may mark
a note `studyDone` (only a study a paper can hold — `COMPLETABLE_STUDIES` in
`shared/w3-dossier.ts`; a licensed lead with ART is a person the works need, not
a document). The PLATFORM finds the sentence in their file that names the study
(`studyEvidenceIn`) — no such sentence, no mark. Before the card, Encontro 3
shows that sentence and asks *"Vocês já têm esse estudo?"* once per study per
place. Only **[Sim, já temos esse estudo]** writes `intervention_site.
studies_done`, and only that field moves anything: `studyRequirement(id, site)`
returns what is STILL needed, so the verdict, the card's "o que precisa", the
shelf, the dossier's study line, the Resumo ("estudo técnico já realizado…
confirmado pela organização") and the cohort's pooled-study count all agree.
Done is not favourable: the verdict's sentence sends the reader to what the
study found, which stays in the note beside it.

**The size their material states.** The reader returns the PASSAGE ("faixa de
terra de aproximadamente 12 × 8 m"); the area is computed from it by
`parseSpokenArea` — the function that reads a size said aloud — never by the
model. A sketch's transcription counts as a source here and only here, because
a measure is never shown as a fact: it is a chip (**Usar 96 m² — faixa de
terra…**) on all three size questions, and it becomes `site_area_m2` (source:
"medida em <arquivo>: …") only when tapped. This is what stops a rain garden
being priced over the 836 m² patio drawn in Encontro 2.

**What they said in the chat.** `site_notes` / `project_notes` go to the reader
as one more source, cited as "conversa com a organização", and the reader runs
again after any model turn that changed them. But a live audit showed the model
citing them in two runs of three — so `notesFromInput` also places every noted
line on the card itself, as **Dito na conversa**, unless the model already cited
the same words. A card orders its notes own → said → place, and the cap trims
only the last group.

**Late files reach the advisor too.** The advisor is now keyed on the set of
files (`_advice_sig`), like the reader: a file sent mid-encontro re-runs it, the
same set never does, and a failed run does not close the question.

Live-audit hardening in the same change: a quote that ran a sentence into a
flattened table keeps the sentence that verifies (`salvageQuote`); dropped notes
log their quote; one retry on a transient provider error (a 500 cost one whole
reading in eight); the reader's budget re-measured at 65 s. The audit is at
13/13 (`scripts/w3-grounding-audit.ts`).

### Encontro 3 ends at the comparison (21 September 2026)

JVP, after a staging run read back from the API (session `c2a6ab61`): *"w3
should stop once they chose the ones they want to compare… leave project
detailing for w4, in which it is project based and not cbo based."* What the run
showed: three solutions tested in 100 seconds; an eleven-question "detalhar"
tail tapped through in fifty, asking *"quem constrói isso?"* ONCE across three
different liked solutions — a project's question put to a shortlist.

- **The comparison is the close.** `[Fechar o Encontro 3 ✓] [Testar mais uma]`.
  `closeAtComparison` writes `_e3_closed`, the portfolio verdict and the
  capacity grade, and three of the four scores; `financial_thinking` moved out
  with the tail. `encontroClosed(state, 3)` reads `_e3_closed`, so the unscored
  fourth no longer holds the door to Encontro 4 shut. The roadmap and the Resumo
  do Projeto are no longer Encontro 3 outputs (the coordinator's Documentos tab
  still builds them from whatever the record holds).
- **The tail is OFF, not deleted** — it is Encontro 4's raw material.
  `tailEnabled()` is true only for a session that already STARTED it (their
  answers are half given), for `_tail_enabled: 'yes'` (the e2e specs that still
  walk it) and for `deps.tailEnabled` (sweep, sim, fullsim). The fuzzer and
  everything else run the product default. Old chips still land: "Detalhar
  agora" → the comparison, "Deixar pra depois" → the close.
- **The size belongs to the TEST** (`SolutionTest.areaM2`), like the count. The
  run priced a green roof over the 2,900 m² drawn for the SITE (R$ 435 mil–1
  mi): a counted solution tested first had set `_area_asked = not-applicable`
  and the size question never came back. Now every measured solution confirms
  its size ONCE PER SURFACE (ground / roof), is offered the measure that fits it
  (the court's roof for a roof, the strip for a garden), and a size given for a
  test never overwrites the place's footprint. `0` = asked and unknown — never
  the site's area by default.
- **What their files speak about is put in front of them.** The run uploaded a
  visit report about rain gardens, cisterns and permeable paving, and tested
  three solutions it never mentions (heat drove the shelf) — so every card
  carried the same six place-level conditions and none of the findings. The
  shelf pins up to two such solutions (never over a seat that answers their main
  worry), names them with the file and its stance, and "Ver a comparação" asks
  once before closing over them.
- **The questions written for THIS organisation are asked before the
  comparison** — two at most, skippable. They used to be generated at the end of
  the tail, were not ready in time and were skipped silently; they are now
  written while the organisation tests (started at the door) with a bounded wait.
- A chip carries one sentence; the advisor's full reasoning stays on the list.

### Testing makes them think, not just tap (21 September 2026)

JVP: *"are we getting enough information from the person? … if I hadn't added
[the files], would it have been as fast?"* It would have been faster: a card and
a thumb, three tests in 100 seconds. Decision-aid practice (IPDAS) and
participatory multi-criteria work on NbS agree on the order — what matters to the
people choosing FIRST, then the options set against it — and on keeping it light.
`shared/w3-criteria.ts`:

- **Once, before the shelf: "o que pesa mais?"** — up to two of *custar pouco ·
  dar pra fazer com a nossa gente · depender de pouca autorização · resolver mais
  o problema*, or "prefiro não escolher agora". Every criterion is read off the
  card by a FUNCTION (catalogue cost band and delivery, the verdict, the mechanism
  match), each with its source. "Light upkeep" is deliberately absent: the fichas
  carry upkeep as prose, and a criterion we cannot rank honestly is a row of
  guesses. Stored as ids (`_choice_criteria`) and as words (`choice_criteria`,
  which `feeds` the Resumo).
- **Two questions per test, after the card and before the reaction:** *quem
  faria?* (a gente em mutirão · com parceiro técnico · teria que contratar ·
  ninguém hoje · não sei) and *o que mais pega?* — offered only what THAT card
  carries (the authorisation or the study it needs, the cost, the upkeep, the
  space) plus "✍️ Outra coisa" in their own words. Their "who" OUTRANKS our
  delivery class on the "nossa gente" criterion: they know their people.
- **The comparison answers to it:** a first row "No que pesa pra organização"
  (✔ / ~ / ✘ with the reason), rows for who and what is hardest, and the columns
  ORDERED by their criteria (the first named counts double). Sessions from before
  keep exactly the comparison they had — empty rows are not rows.
- **The close hands over:** "Pra levar à mesa do portfólio" — per solution kept,
  what it needs from somebody else, who would do it and what they said would be
  hardest. Those two answers are the starting questions of the project-based
  Encontro 4. Also printed on the comparison PDF.

**What the end-to-end run (three organisations, live file reading) changed.**
- The file reading is ONE CALL PER FILE in parallel, ≤ 8 notes each (64 s → 31–34 s
  on the kit); the first card had been giving up its 25 s wait with nothing from the
  files. The size question now waits for the reading too — the measures come from it.
- A card shows ITS notes and what was said; the place's conditions are counted
  ("+ 4 condições que valem pra qualquer solução…") and listed once, in the comparison.
- The "custo" criterion reads the card's own price at the size tested, not the
  catalogue's class; "a gente, com um parceiro técnico" is ~ on "nossa gente", not ✔.
- In Encontro 3 the model's questions are NOT recorded over the flow's: after any
  model turn the flow's question comes back (it had looped on "Continuar").
- Own words at "o que mais pega?" are captured by the pending question (≥ 12
  characters, not a question), never by the turn kind.

`_quick_tests: 'yes'` / `deps.quickTests` skips these beats for the specs and
simulations that are about something else; the fuzzer and
`e2e/cougar-e3-deliberation.spec.ts` run them. **After 30 Sept:** Encontro 4 as
the project-based detailing, designed with what the room decides.

## The printed copy, and the context that was already there

### `GET /api/cbo/:id/roadmap`

A document, not a file. It opens in the phone's browser; Share → Print → Save as
PDF turns it into something you can hand round a table. That last use shaped it:
the organisation will defend this in front of neighbours who did not sit through
the workshop.

- **RASCUNHO is the first thing in the body**, and prints at the top of every
  sheet. A draft mistaken for a decision is the failure that costs most here.
- **"Essa faixa não é dinheiro que alguém já tem"** sits in the same weight of
  type as the figure it qualifies, never as a footnote. A neighbour who reads
  "R$ 350 mil" on a page about a horta and not the caveat now believes the
  association is receiving three hundred and fifty thousand reais.
- **← and ↻ survive onto paper.** Being able to say "this line came from the
  ficha, not from us" is what makes the document arguable rather than official.
- **Rebuilt from live state on every request**, never served from a stored blob:
  an organisation may correct an answer after the session, and a printed route
  that disagrees with the screen is worse than no printed route.
- **Self-contained** — no external CSS, fonts or scripts. It has to render on a
  six-year-old Android with no data left in the month.

### Five things Encontros 1 and 2 captured and Encontro 3 never showed

Straight from the three-reviewer audit, and none of them needed a new question:

| | |
|---|---|
| **the proponent** | founded, team size, CNPJ, the funded project they already delivered — the paragraph that decides whether a reviewer reads the rest |
| **the territory** | population, poverty rate and flood percentile, carrying the whole-bairro coarseness warning |
| **a person's name** | on every step the organisation owns. "Vocês" does not photograph a puddle |
| **what they bring** | construction model, team, years in the território, land in hand — named, never priced, because a figure on volunteer labour is a figure someone can deduct |
| **the approval block** | split into sentences. In a room people stop reading at the second comma |

### ⚠️ ZONE-LINE-TWO-FORMATS

The map's zone line carries **two number formats**, and the first version of the
capture conflated them:

```
pop: 59.707      toLocaleString()  → locale separators; "59,707" in en-US
poverty: 23.4%   toFixed(1)        → a plain decimal point, always
priority: 0.91   toFixed(2)        → likewise
```

Stripping every dot is correct for the first and destroys the other two — it
turned 23.4 into **234** and 0.91 into **91**, and would have documented Sarandi
as 234% poor. Parsed with two helpers now (`int` strips separators, `dec` never
does), pinned by string tests, and tolerant of a zone line that omits the
optional fields entirely.

The same line had already lost these three fields once: the original regex read
the hazard percentiles and dropped the rest on the floor, exactly as
`formatMapResult` had dropped the footprint area.


## Mapear sinergias — the button that replaces a hand-written document

The report already exists. It was written by hand for ten organisations on
21 August ("Onde queremos atuar: territórios, recursos e sinergias da Rede"), it
fed the coordination's planning, and it went stale the moment anyone answered
another question. Ricardo, 31 August: *"sería genial que pudiera hacer eso,
porque ahí toda vez que una organización sube la información, no necesitas
hacer[lo] todo la vez."*

Reading that document back is what settled the design.

### Three axes, because the hand-written version used three

Its **Agrupamento A** is geographic. Its **B is not** — it is *"água em alta
velocidade"*, a hazard **mechanism** shared by two bairros nowhere near each
other, and its stated reason is that this *"pede soluções distintas das de
alagamento em área plana"*. Its **C** is a land **arrangement** — public land
held informally — which is a governance theme with no geography at all.

**Grouping only by territory would have found one of those three.**

`shared/w3-synergies.ts` derives all three, plus the pooling that is the actual
argument for a programme: shared study needs (one org hiring one geotechnical
engineer is expensive; a cohort commissioning several is a procurement) and
shared approving bodies (one conversation with SMAMUS instead of five).

### Derived first, narrated second

Same split as the rest of W3. The groupings are computed so a coordinator can
check *why* two organisations were put together; the model writes the programme
lines and the portfolio thread on top, and may only name organisations that
appear in the analysis. A line naming an org outside the cohort is the one error
nobody would catch by reading.

### What it reads

Not just the enum answers. The hand-written report quotes organisations
throughout — *"Lugar muito próximo do rio, a uns 300 metros. É uma área aterrada
— com pouca chuva já fica úmido e alagado"* — and those sentences place an
organisation in a cluster that no canonicalised field would. So the pass sends
each org's own words (story, why here, baseline), what they uploaded, and where
they **corrected our risk numbers**, which outranks the map.

### How it behaves

- **Explicit.** Nothing runs on page load; the pass costs a model call and
  pressing the button is choosing to spend it.
- **Asynchronous.** POST returns `202` with a row id and the work continues
  after the response — a button that holds a request open for a minute is a
  button that fails on venue wifi. The panel polls only while it is running.
- **Persisted.** `synergy_reports` is a table, so the last report opens
  instantly and survives a redeploy. It is the input to an in-person meeting and
  Replit recycles when it feels like it.
- **Downloadable.** `/api/cohort/:id/synergies/print` — the same print treatment
  the hoja de ruta gets, for the same reason: the version people argue over is
  the one on the table.
- **Degrades.** No key, a timeout or a bad answer leaves the calculated report
  standing, and says so.

### Two rules carried over from the hand-written report

1. **"São hipóteses para validar com as organizações no encontro, não decisões
   prontas."** A cluster an organisation did not agree to falls apart in the
   room, and the validation *is* the value of the meeting. The banner says so
   before the title does.
2. **The gaps are a section, not a footnote.** Three of the ten had no data at
   all. A partial reading presented as complete is a lie, and the risk-average
   caveat rides along every time.

⚠️ Two details caught in review of the generated output: it leaked a provider
401 verbatim onto a coordinator's page (complete with the rejected key and a
link to an OpenAI settings screen), and it wrote *"1 organizações"* — the tell
that nobody read the output. Failures are now phrased as something a coordinator
can act on, and Portuguese agrees.

⚠️ `excludeFromPortfolio` on `cohort_members` keeps Vila Flores's own test
organisation out of the **analysis** while leaving it on the roster — hiding it
from the board would just lose track of it.

⚠️⚠️ That column and its filter shipped with **nothing that could set the
flag** — no endpoint, no control, no rule — so the test organisation still
appeared in the report as a real member of the network, and the PR described the
guard as working. A half-built guard is worse than none: it reads as handled.
There is now a chip on the card (`Fora do portfólio` / `No portfólio`), a
`PATCH …/member/:id/portfolio` behind it, and a line in the banner saying how
many organisations are being left out — an excluded member must never be
*silently* missing, because a report built on nine of ten with nothing saying so
is the kind of thing someone discovers in the room.


## Full context, and the alignment rule

An audit of what W3 actually reads, prompted by *"w3 should start making sure it
got full context from the CBO on all they shared"*. The answer was no, and
specifically:

- **The shortlist read five fields** — `nbs_interest`, `site_worry`,
  `current_use`, `site_name`, `site_story`. That was all.
- **The advisor fired after the solution was chosen.** It started when the
  footprint map opened; the pick happens several beats earlier. So the model
  read their photos and their Teia Sprint proposal one beat too late to inform
  the one decision they were relevant to.
- **Nine W2 artefacts were never opened**, including `_hazard_check_json` —
  where they *corrected our risk numbers*. Encontro 2 tells them plainly that
  their word counts for more than our figure, and nothing downstream ever read
  the answer. Also `role_preference`, `teia_sprint`, and the W2 recommendation
  actually served.
- **No photograph ever reached a model.** The loader existed
  (`sitePhotosForRanking`, written for the W2 família ranking) and W3 — the
  workshop that most needed it — never called it.

### What changed

The pass now fires when the workshop **opens**, while they read the recap and
reach for the confirm chip, and it receives their photos, their corrections,
their role preference, the depth read, their picked famílias and the full
catalogue. The solution beat waits for it — visibly, *"Olhando as fotos e o que
vocês mandaram sobre o lugar…"* — capped at 12 s, well under the pass's own
timeout. Slower than that and they get the deterministic list; the pass carries
on regardless and its result still reaches the drafts, the extra questions and
the observations.

**The catch-up is silent.** No extra beat: the session stays 13, and the reading
shows up as a better list rather than as a summary of themselves they have to
confirm.

### ⚠️ THE ALIGNMENT RULE

Ricardo, 31 August: Vila Flores cannot narrow to a solution technically either,
so the tool should propose *"como tres opciones posibles"* from the photos and
the audio. But an organisation's Encontro 2 choice was made with intention, in a
session whose details they may not remember, and **a platform that quietly
reorders that because a photo suggested otherwise has taken the decision while
appearing to offer one.**

So `mergeShortlist` does exactly two things and never a third:

1. It **reorders inside their picks**, replacing our generic reason with one
   citing their own evidence — *"na foto do fundo dá pra ver por onde a água
   entra"*.
2. It may **append** a solution from outside those picks, **below everything
   they chose**, with the tension said out loud: *"isso está fora dos grupos que
   vocês marcaram no Encontro 2 — é leitura nossa, e quem decide são vocês."*
3. It **never** promotes an outside solution above one they marked. There is a
   test named for this.

With no agent picks it returns exactly the deterministic order, which is what
keeps the model optional rather than load-bearing.
