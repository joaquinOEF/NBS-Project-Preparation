# The register of what leaves the room

⚠️ **Read this before writing any string that reaches the hoja de ruta, the
dossier card, or anything else an organisation downloads.** It is a copy rule,
and it exists because the rule it replaces was invisible: every sentence it
removed was written deliberately, by someone who thought they were being kind.

## The defect

JVP, reading four simulated PDFs on 2026-09-02:

> it's talking like this exists for you to do this. This is not valid. The map
> doesn't lead. You are the one that leads. […] it is patronizing in a way and
> also sloppy. […] some of the decision making rules we talked about bleed into
> the language that then is used for the report.

That is exactly what had happened. Every block of the printed roadmap carried a
`↻` line, and most of those lines were **one of our own design principles,
narrated at the reader**:

| printed on the page | what it actually was |
|---|---|
| *"Essa parte é de vocês. Se a descrição não está certa, é ela que manda — não o nosso mapa."* | our rule *the map does not lead, the organisation does* |
| *"Dá pra trocar a qualquer momento — as 27 continuam abertas, e nada aqui fecha essa porta."* | our rule *nada fica descartado* |
| *"Se o dinheiro do ano que vem ficou em aberto, isso não é falha — é a conversa que a coordenação leva pra prefeitura."* | our rule *the gaps are not a report card* |
| *"Isso não é falha de vocês. É o próximo trecho do caminho…"* | the same rule again, at the foot of the page |
| *"O contorno é a dedo, arredondado de propósito."* | an implementation detail of the draw session |
| *"Uma foto com data vale mais do que essa frase"* | coaching |
| *"…dizer isso num edital é o que separa um projeto sério de um otimista"* | editorialising |

Each one is defensible on its own. Together they turn a project document into a
system explaining itself to the person holding it — and the reassurance
actively competes with the numbers it sits next to. Plain-language guidance for
technical documents says it directly: *avoid emotional or qualitative language
and keep the reader's focus on the measurable, verifiable information.*
"Isso não é falha de vocês" also invites a reader to wonder whose failing it is.

## Why it happened

**The copy was written for the conversation and reused in the document.** In the
chat, "essa parte é de vocês" is warm and correct — an agent saying it out loud,
in the middle of a workshop, to someone who just typed a paragraph. The same
sentence set in 11px grey type under a cost table, three weeks later, in front of
a funder, is something else entirely.

There is one more reason, and it is the durable one: **the principles we argue
about while building are vivid to us, so they read as insight rather than as
scaffolding.** A rule you spent an afternoon defending feels like something worth
saying to the user. It is not. It is a rule about how the thing was built.

## The rule

> **The workshop speaks. The document is written.**
>
> Anything an organisation downloads or prints is a **nota técnica in the third
> person**. It states what the project is, where each figure came from, and what
> would revise it. It does not address the reader, reassure them, or explain the
> reasoning behind its own construction.

In practice:

| | do | don't |
|---|---|---|
| **person** | third — "resposta da organização" | second — "resposta de vocês", "a gente atualiza" |
| **their words** | quoted and attributed — *O problema — descrito pela organização: “A praça vira lago quando chove.”* | paraphrased, or presented as ours |
| **provenance** | `Fonte: preço publicado na ficha × área desenhada` | `←` (our shorthand, legible to nobody in an assembly) |
| **what unblocks it** | `Revisar com: cotação de fornecedor` | *"Essa faixa existe pra vocês conseguirem pedir uma"* |
| **a caveat about a figure** | beside the figure, as a statement | in the review field, as consolation |
| **a gap** | named, in the Pendências list, with an owner in the steps | absolved — *"isso não é falha de vocês"* |
| **our principles** | in this repo | on their page |

Two consequences worth stating outright:

- **A chip is spoken; a document is written.** `who_maintains: nos` reads "A
  gente mesmo" on the chip someone taps mid-conversation and **A própria
  organização** in the report. `REPORT_LABEL` in `shared/w3-roadmap.ts` holds
  that translation, keyed on the option id so neither wording can drift.
- **The warmth did not disappear, it went where it belongs.** The agent's own
  `say()` lines around the card are untouched, and they already say these things
  — out loud, once, in the conversation, at the moment they help.

## The guard

`npm run w3:fullsim` fails on second person in any **authored** string that
reaches the page — block titles, `Fonte`, `Revisar com`, Pendências, step
titles, and the printed sheet's own headings and footer. The organisation's own
passages are stripped before matching, because they are quoted, and they are the
one place their voice belongs.

It is not a substitute for reading the page. Two of the five defects the same
simulation found in September were invisible to every check and obvious the
moment someone looked at the rendered sheet — see
[`building-for-the-journey.md`](building-for-the-journey.md).

## Still in this register elsewhere

The **dossier card** (`CboDossier.tsx`, and the verdict `why` strings in
`shared/w3-dossier.ts`) still speaks in the second person — *"o desenho cabe no
que vocês já sabem"*. That card sits inside the conversation rather than in the
download, so it is defensible where it is; it is listed here because the two
cards sit one above the other and a reader does not know which of them is the
document.
