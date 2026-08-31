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
0  recap          the place W2 marked, named — never asked for again
1  a solução      show_solution_options → ficha → quem precisa dizer sim
2  o tamanho      footprint map (per-m² solutions only) → area → price range
3  por que aqui   free text / voice
4  linha de base  free text / voice
5  quem cuida     → frequência → dinheiro recorrente
6  o dossiê       show_dossier
```

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
- `scripts/w3-cohort-sim.ts` — four organisations end to end, then the
  portfolio pass over what W3 actually wrote. No browser, no model, no DB.

## What six simulations found

`scripts/w3-sim-run.ts` drives six organisations through the real engine — no
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

## What a four-organisation cohort simulation found

`scripts/w3-sim-run.ts` drives one organisation at a time and stops at its hoja
de ruta. `scripts/w3-cohort-sim.ts` runs **four with deliberately different
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
