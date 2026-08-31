# Encontro 3 — from a marked place to a scoped project

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
