# The authored concept note

_Plan, 2026-09-02. Decisions taken with JVP; not built yet._

## The gap

> "the pdf and final proto concept note, it's mostly verbatim what the user
> shared. i would expect we use a smart agent to use all the context of what
> they shared, plus our knowledge base to prepare a concept note that is better
> than what they can prepare. that's the whole goal, not just capturing
> information." — JVP, 2026-09-02

He is right, and the audit of the same run shows it plainly. The document an
organisation downloads today is **their own answers, arranged**. Their site
description is their paragraph; the justification is their paragraph; the
baseline is the same paragraph again. What we add is a price band off a ficha, a
list of doors, and a route. Real, and not what the workshop is for: an
organisation that could already write those paragraphs gets back the paragraphs
it wrote.

The gain we are not taking is the one thing they cannot do: **argue the project
in the register a funder reads, from material they do not have** — the 27
fichas, the evidence base, the bairro's own numbers, what an approval actually
takes and how long.

## The shape

Two decisions, taken:

- **One document, written, with provenance.** Not a deterministic spine with
  authored patches, and not a second document beside the record. The concept
  note *is* the deliverable, written in prose, and every block keeps its
  `Fonte:` line.
- **The record, the fichas and the knowledge base — and nothing beyond them.**
  Precedent, approval timelines, bairro data and funder language may all enter,
  each cited. No claim about the organisation or the site that the record does
  not support, and **no inference** presented as fact (explicitly rejected: on a
  page that goes to a funder, a marked inference is still read as verified).

## The architecture

```
W3 record (state) ─┐
solution fichas   ─┼──▶ conceptNoteFacts()  ──▶ [authoring pass] ──▶ ConceptNote ──▶ HTML / PDF
knowledge slice   ─┘      pure · typed             model · schema      blocks + sources
                                    │                                        ▲
                                    └──────────── deterministic fallback ─────┘
```

Six rules, every one of them paid for by a defect this repo already has:

1. **The facts are computed; the prose is written.** `conceptNoteFacts()` is
   pure and testable, and the model receives *only* those facts plus knowledge
   excerpts — never the raw state. It cannot invent a number it was not handed.
2. **Every paragraph carries its sources.** A paragraph whose source list comes
   back empty does not ship. Same rule as `docs/document-register.md`, enforced
   rather than trusted.
3. **No constraint that can discard the whole reply.** The `orgNames.min(2)`
   lesson: a schema on a one-shot call makes every constraint a total-loss
   constraint. Validate after parsing, drop the bad paragraph, keep the rest.
4. **A deterministic floor.** No key, model failure, timeout → today's document,
   exactly as it is now. The authored note is an upgrade, never a dependency —
   the same contract the E3 checkpoint engine already honours.
5. **The register is fixed** — nota técnica, third person, their sentences as
   quotation. `docs/document-register.md` applies unchanged.
6. **The guard rides in `w3:fullsim`**: every authored paragraph has ≥1 source;
   no figure appears in the prose that is absent from the fact base; no second
   person; and the note still renders with the model disabled.

## The sections

Mapped from what a fundable concept note contains onto what W3 actually holds:

| | section | what makes it better than they could write |
|---|---|---|
| 1 | Resumo | the four lines a funder reads first, written last |
| 2 | A organização e o território | bairro data they have no access to, beside their own history |
| 3 | O problema | their words, quoted — plus the mechanism named from the evidence base |
| 4 | A intervenção proposta | solution, size, build model, in one paragraph instead of five fields |
| 5 | **Por que esta solução aqui** | the argued section: the ficha's mechanism against *this* site's conditions |
| 6 | Resultados esperados | the benefit figure with the scale honesty already written |
| 7 | O que o projeto exige | approvals, studies, and the timing that decides the calendar |
| 8 | Custo estimado e contrapartida | the band, what it excludes, what the organisation brings |
| 9 | Manutenção e recursos recorrentes | the gap that goes to the municipality, stated as a proposal |
| 10 | Pendências e próximos passos | as today, with owners |

⚠️ **Section 7 is where the knowledge base earns its place.** The audited run
closed `ready` on a solution whose ficha says a planting request filed after
August only comes through in **May of the following year** (backlog #42). No
organisation writes that sentence into its own concept note. It is the single
most decision-changing line on the page, and today it appears nowhere.

## Knowledge base — the honest constraint

The OEF KB lives behind an MCP server this app cannot call at runtime. So the
first version reads a **curated in-repo slice** in the same shape as the fichas:
approval routes and their real timings, precedent community projects, the
evidence base already used for the benefit figures, and the language funding
calls use. Naming that now avoids designing against a KB we cannot reach.

## Phases

1. **P1 — the fact base. ✅ shipped (PR #518).** `conceptNoteFacts()` + the ten
   sections, deterministic. `shared/concept-note.ts`, rendered by
   `server/services/conceptNotePrint.ts`, served at `/api/cbo/:id/concept-note`,
   printed per archetype by `npm run w3:fullsim`.
2. **P2 — write three sections. ✅ shipped (PR #518).** Resumo, *Por que esta
   solução aqui*, Resultados esperados. `server/services/conceptNoteAuthor.ts`
   fires at the close of Encontro 3 — fire-and-forget, like the advisor — and
   persists the accepted paragraphs to `_concept_note_json`. The download
   re-validates them against the facts as they stand at that moment.
3. **P3 — the rest, plus the knowledge slice**, section 7 first.
4. **P4** — a side-by-side of authored vs deterministic across the four
   `w3:fullsim` archetypes, read rather than asserted. `?plain=1` on the route
   serves the deterministic document for exactly that comparison.

### The guards, as built

Every one drops **a paragraph**, never the reply, and each is tested without a
model in `e2e/concept-note.spec.ts`:

| | |
|---|---|
| a numeral absent from the fact base | the paragraph goes — *"atende cerca de 437 crianças"* is indistinguishable from a sourced figure to whoever reads the page |
| second person | the register is not negotiable |
| a citation not in the closed source list | invented provenance is worse than none |
| a section outside the three | the other seven stay computed |
| nothing survives in a section | its assembled paragraphs stand — the document never gets shorter for having tried |
| the facts changed after the session | stored prose is re-validated on read, so a sentence quoting a corrected area is dropped |
| a count of OTHER organisations that no cohort line states | in words as well as digits — see below |

⚠️ **What no guard catches, and the prompt rule that answers it.** The number
guard checks whether a figure is IN the fact base, not whether it is being used
for what it is there for. The first live run over eight organisations produced
one instance, and it was fluent:

> *"Três unidades de horta representam uma intervenção de pequeno a médio porte,
> dentro das faixas regulamentadas pelo decreto municipal de 21 de julho de 2022
> — até 50 m² por unidade na faixa pequena, de 50 a 100 m² na faixa média."*

Every number there is real and sourced. The decree's bands describe what a
LICENCE covers; the paragraph used them to describe the project's size, for an
organisation whose record holds a count of three and no area at all. Rules 6 and
7 of the system prompt now say so — *"uma faixa que aparece no registro por outro
motivo descreve a REGRA, não este projeto"* — and the same organisation now
reads:

> *"O porte de cada uma das três unidades não foi definido no registro… Sem essa
> informação, não é possível aplicar as faixas de custo da ficha para chegar a um
> total, nem enquadrar cada unidade nas faixas regulamentares."*

The general lesson, worth carrying into any future pass: **a number is in the
record to answer a specific question, and using it to answer a different one is
invention even when the number is correct.**

⚠️ **The counts of other people, and a guard that only read digits.** The second
live run — the first with the cohort layer in the fact base — produced this:

> *"Outras oito organizações do mesmo grupo esbarram nas mesmas barreiras de
> financiamento identificadas para este projeto."*

The lines it was handed said seven on one and six on another. It added them, got
thirteen, and rounded the claim to eight; the cohort has eight organisations
total, so seven others is the ceiling. Nothing caught it, because *oito* has no
digits and the numeral guard reads `\d`.

`claimedOrgCounts()` now reads both forms and checks them against the cohort
lines alone — not against the fact base, where an `8` sitting in some unrelated
figure would have licensed the sentence anyway. It is deliberately narrow: it
matches counts of ORGANISATIONS and nothing else, because *"as duas soluções
combinadas atuam sobre essa superfície"* is a true, useful sentence and a
blanket word-number rule would throw it away. What cannot be loose is a count of
other people, on a page that goes to a funder and that those people never see.

And the prompt rule that fixed it then leaked into the prose — one note
explained on the page that the counts were *"não somáveis entre si"*. The rule
is ours. The reader wants the right number, not the rule that produced it
(`docs/document-register.md`, again).

## Risks

- **A fluent wrong sentence in a funder document.** The worst failure available
  here, and fluency makes it invisible. Mitigated by facts-only input,
  source-per-paragraph, and the fullsim figure check.
- **Latency at the close.** Fire the pass when the organisation taps the closing
  chip; the deterministic document renders immediately and the authored one
  replaces it when it lands. The download route already rebuilds from live
  state, so paper and screen cannot disagree.
- **Two organisations getting notes of different quality.** The deterministic
  floor is the answer: nobody gets less than today.
