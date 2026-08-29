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
