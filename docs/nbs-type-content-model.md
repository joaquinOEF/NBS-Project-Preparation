# NBS type cards — illustration & content model

**Last updated**: 2026-07-10 · **Status**: decided, pre-implementation
**Surfaces**: `NbsTypeStrip` (E2 Beat 1, pre-posted on phase entry) → `NbsTypeSheet` ("Saber mais")
**Related**: [`photo-curation.md`](./photo-curation.md) · [`cbo-chat-composers.md`](./cbo-chat-composers.md) · E2 spec in `knowledge/runs/2026-05-15-encontros-curriculum/E2-seu-territorio/`

This is the decision record for what the six NBS type cards *show* and what they *say*. It exists because the six cards are the first thing a CBO leader sees in Encontro 2 — the platform pre-posts the strip on phase entry (`cboAgent.ts:998`) — and until now they were six emoji, two of which were wrong.

---

## Frozen — do not change

Two things in this system are settled and are **not** open for revision by anything in this document or the research behind it:

1. **The six NBS types.** Their `id`s, their English labels, and their Portuguese labels in `NBS_INTERVENTION_TYPES` (`shared/cbo-schema.ts`) stay exactly as they are. They are the join key across the schema, the agent tools (`show_intervention_types`), the knowledge files, the E3 selector, and the impact model.
   *Specifically rejected:* plain-language guidance proposed shortening the card title "Biovaletas e Jardins de Chuva" to "Jardim de chuva". A card title is not a place to rename a type. See the vocabulary rule below — we teach the real term, we do not replace it.
2. **The twelve croquis.** The chosen compositions and their rendered files under `client/public/assets/nbs/types/` are final. Copy is written *to* the drawings. If a sentence and a drawing disagree, the sentence changes.

Everything below is about what surrounds them.

---

## Who we are writing for

Leaders of community-based organisations in peripheral Porto Alegre. Many lived the May 2024 Guaíba flood. They run associations, negotiate with the prefeitura, convene assembleias, and organise mutirões. Several will know how water actually moves through their bairro better than the technician they are about to meet.

They are also reading on a phone, in Portuguese, often on a slow connection, and Brazilian functional-literacy data is real: only 12% of Brazilians aged 15–64 read at the *proficiente* level, 30% are functionally illiterate, and 34% sit at *elementar* ([INAF 2018](https://acaoeducativa.org.br/publicacoes/indicador-de-alfabetismo-funcional-inaf-brasil-2018/)).

**Both of these are true at once, and the design rule follows from holding them together:**

> **Plain syntax, full substance.** Short sentences, concrete verbs, active voice, no bureaucratic fog. And simultaneously: real numbers, real cost ranges, real tenure rules, the actual name of the department you must talk to, and an honest answer about mosquitoes. We simplify the grammar. We never simplify the content.

What gets cut is obscurity, not information. A leader who cannot get a straight answer about what a thing costs and who has to approve it has been failed, however readable the prose.

### The vocabulary rule (a correction)

Plain-language guidance would tell us to replace *biovaleta* with *canaleta com plantas* and drop *infiltração* altogether. **We do not.** E2's stated purpose is `criar repertório` — to give a CBO leader the words to make their case to a technician at SMAMUS. Removing the technical term defeats the beat.

- **Teach the term, then gloss it once.** "Biovaleta — uma canaleta com plantas que faz a água da chuva entrar na terra."
- Thereafter use the real term. They will hear it in every meeting that follows.
- Bureaucratic abstractions with no technical payload (*implantação*, *execução*, *quando da ocorrência*) get replaced with plain verbs. Technical nouns that name a real thing are taught, not hidden.

### Testing is not optional

[Lei 15.263/2025](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15263.htm) (Política Nacional de Linguagem Simples) obliges public-facing administration to write plainly **and to test comprehension with the target audience**. Before launch, read the six cards and one full sheet section aloud with 3–5 actual OBC leaders and cut whatever they re-read.

---

## Part 1 — The illustrations

### D1 · Register: hand-drawn croqui

Twelve croquis — ink linework, watercolour wash, entourage figures, white-paper margins. The register a Brazilian architect uses to present a proposal to a neighbourhood association.

**Why.** A croqui reads in the future conditional. A photograph asserts *this exists, here, now*; a sketch asserts *this is what it could look like* — which is exactly the pedagogical intent. The register is also culturally native: ATHIS / assessoria técnica practice under [Lei 11.888/2008](http://www.planalto.gov.br/ccivil_03/_ato2007-2010/2008/lei/l11888.htm) routinely presents proposals to residents as croquis, and teaches residents to read them.

**Rejected.** Photographs of real projects (documentary accuracy and category legibility pull apart — see D3 rationale); flat isometric diagrams (colder, loses the entourage figures that carry community scale); stock photography (banned by `photo-curation.md`, and it keeps importing US/European cues).

**Open risk.** These are AI-generated. See D2 and the *Open items* at the foot of this document.

### D2 · `photo-curation.md` gains two registers

The existing standard bans AI-generated images. Its stated rationale is impersonation: *"a community leader who knows Curitiba can spot a fake Parque Barigui, and trust drops the moment they do."* That rationale is about **documentary photography of named places**. A generic croqui of a biovaleta impersonates nothing.

`photo-curation.md` must be amended in the same PR that ships these images, or the standard and the codebase contradict each other in writing:

- **Register 1 — documentary photography of a named place.** Never synthetic. No exceptions.
- **Register 2 — explanatory croqui of a generic category.** May be synthetic, provided it names no real place, no real person, no landmark; is reviewed by a domain expert for physical plausibility; and is recorded in the manifest with `register`, `subject_scope`, `synthetic`, `expert_reviewer`, `expert_reviewed_at`.

### D3 · The drawing type follows where the mechanism lives

Not all six want the same kind of drawing. Split by where the thing being taught physically is:

| Type | Drawing | Because |
|---|---|---|
| `bioswales-rain-gardens` | **Subsurface cutaway** | The mechanism is underground. A surface view of a rain garden is a flowerbed. |
| `green-roofs-walls` | **Edge cutaway** | The mechanism is inside the assembly. The cut shows how *thin* the build-up is — which is the feasibility argument on a self-built laje. |
| `flood-parks` | **Before / after** | The mechanism is temporal and constructional. You have to see the bowl get dug. |
| `wetland-restoration` | **Before / after** | "Restauração" is a verb. Before/after is how you draw a verb. |
| `green-corridors` | **Surface perspective, from above** | The mechanism is geometric: a line connecting two green patches. Read *along*. |
| `urban-forests` | **Surface perspective, eye-level** | The mechanism is geometric: a mass you stand *inside*. Read *into*. |

The corridor/forest viewpoint contrast is doing pedagogical work. It is the only thing stopping the two "trees" cards from collapsing into each other, which is the most likely confusion in the set.

**Evidence that this matters:** `wetland-restoration.jpg` (the photo we are replacing) is *documentarily correct* — it really is DRENURBS Parque Primeiro de Maio. It also shows concrete retaining walls, open water and zero emergent vegetation. As a teaching image for "Restauração de Áreas Úmidas" it depicts a detention basin. A true photo can be a false lesson.

### D4 · Before/after means before the *work*, not before the *rain*

The first flood-park pair showed the same terraced bowl on a dry day and a rainy day. Nothing had been built between the panels; only the weather changed. That teaches multifunctionality but says nothing about what a community actually commissions.

**All before/after pairs sit on the intervention axis, under the same conditions.** The flood-park "antes" is a dead-flat praça shedding its water into the street and into people's doorways; the "depois" is the same site regraded into a bowl that holds the storm while the houses stay dry. Same camera, same houses, same tree, same rain. The only difference is that somebody dug the bowl.

### D5 · Blue is reserved for water

Across all six drawings, blue appears **only** where the type genuinely has water, and the presence/absence is meaningful rather than decorative:

| Type | Water |
|---|---|
| `bioswales-rain-gardens` | Thin, transient — arrows infiltrating downward. Never standing. |
| `flood-parks` | Held temporarily. A sheet in a bowl, with dry terraces above the line. |
| `wetland-restoration` | Permanent, threaded with emergent taboa and junco. |
| `green-roofs-walls` | A rain arrow in, a much smaller runoff arrow out. |
| `green-corridors` | **None.** |
| `urban-forests` | **None.** |

A learner can triangulate the whole set on water alone. This is the single strongest disambiguation device we have, and it costs nothing.

### D6 · Community scale, always

Every drawing depicts what an OBC could plausibly reach: one street corner, one lot, one house, one grassed bowl. Never Parque Barigui. Grounded in WRI Brasil's local/community tier and in self-efficacy research on community environmental education — belief that one can act predicts pro-environmental behaviour more strongly than concern does.

Enforced cheaply by the recurring background module: exposed-brick alvenaria, flat lajes with rebar stubs and blue caixas d'água, concrete poles with tangled wires, muros with metal gates. The same bairro recurs behind all six. This is also what stops the set reading as North American — the previous `bioswales.jpg` was a Portland, Oregon streetscape.

---

## Part 2 — The content

### D7 · The card triages; the sheet teaches

The card's job is identification and elimination, not instruction. Secondary text on cards is routinely skipped during scanning ([NN/g, *Cards*](https://www.nngroup.com/articles/cards-component/)), and attribute overload suppresses decisions outright ([Iyengar & Lepper 2000](https://faculty.washington.edu/jdb/345/345%20Articles/Iyengar%20&%20Lepper%20(2000).pdf) — 24 jams → 3% purchase, 6 jams → 30%).

So the card gets taller (~240 × 300) but **the height goes to the drawing, not to prose.**

```
┌────────────────────────────┐
│  croqui band  (~120 px)    │   the "depois" drawing
├────────────────────────────┤
│  Biovaletas e Jardins      │   title, ≤ 4 words
│  de Chuva                  │
│                            │
│  A chuva entra na terra    │   one benefit line, ≤ 12 words
│  em vez de correr pra rua. │
│                            │
│  [enchente] [calor]        │   ≤ 2 hazard chips  — filters primary_hazard
│  [mutirão]                 │   1 delivery chip   — see D8
│                            │
│  Saber mais →              │   loud, always visible
└────────────────────────────┘
```

Body text under ~20 words. The strongest element on the card is the **Saber mais** affordance, not a fatter paragraph.

### D8 · The third chip names the real gate, not the price

People filter on one to three salient attributes, then consult everything else after narrowing. For an OBC with a small grant, the sharpest filter is **not price**. The Porto Alegre research is blunt about this:

> The binding constraint is almost never money — it is permitting capacity, land tenure standing, and a credible maintenance owner.

At the R$20k–300k band, *all six* are affordable at community scale. What kills a project is a dead champion, no watering in the first two summers, or a permit that stalls. So the chip names **who has to say yes, and who has to keep it alive.**

| Chip | Meaning | Types | The real gate |
|---|---|---|---|
| `mutirão` | The community builds it | `bioswales-rain-gardens`, `green-roofs-walls`, `urban-forests` | Maintenance in the first two years |
| `parceria` | Needs a municipal partner | `flood-parks`, `green-corridors` | SMAMUS chooses species and site; DMAE reviews drainage |
| `licença ambiental` | Environmental licensing | `wetland-restoration` | APP. Frame it as *recuperação*, never *construção* |

**Correction, on the record.** An earlier draft of this document put `flood-parks` and `wetland-restoration` under `obra pública`, on the strength of `flood-parks.md`'s 0.5 ha minimum and 1.5–4 year timeline. Those are **municipal-scale** numbers. At community scale a flood park is an open grassed dry detention basin of **200–1,000 m²**, sized at 5–10% of the impervious catchment it drains, at roughly **R$60k–150k for 500 m²** — inside the grant band, and adoptable by an associação de bairro under the Termo de Adoção (Lei 12.583/2019). The chip was wrong and is now `parceria`.

Cost, time, area and maintenance move into the sheet — they are deliberation attributes, consulted after a shortlist exists.

### D8b · Porto Alegre institutions (verified 2026-07)

> ⚠️ **DEP no longer exists.** Porto Alegre's Departamento de Esgotos Pluviais was **extinguished in 2017 (LC 817/2017)**. Drainage now sits with **DMAE**. The legacy DEP *Manual de Drenagem* is still the technical reference, and many sources online still say "DEP" — they are stale. A 2025 administrative reform (LC 1.037/2025) reorganised every secretaria.

| Body | Owns |
|---|---|
| **SMAMUS** | All tree planting/pruning authorisation (public *and* private), environmental licensing, APP analysis, praças. Species and location on public land are chosen by SMAMUS, not the applicant. |
| **DMAE** | Water, sewage **and stormwater drainage**, flood protection, detention basins. Not DEP. |
| **SMSurb** | Executes public-tree pruning and removal that SMAMUS authorises. |
| **SMP** | Runs "Adote uma Praça" — the Termo de Adoção. Associações de bairro are explicitly eligible. |
| **SEMA-RS** | State escalation for APP / native-vegetation suppression. |

Two facts every proposal should use: street-tree planting **legally cannot be done by a community without SMAMUS authorisation** (LC 65/81, Decreto 8.186/83), and **~45% of citizen planting requests are denied** — so co-design with SMAMUS first. Requests arriving after August are, as a rule, only served the following May.

### D8c · The mosquito answer

A CBO will ask. Both `flood-parks.md` and `wetland-restoration.md` list mosquito breeding as a real failure mode. Omission is dishonest; hand-waving is worse. The answer is a design rule:

> **Aedes eggs need roughly three days of standing water to hatch. A basin that drains within 48 hours cannot breed dengue.**

Make **"seca em 48 horas"** a design and funder condition — it is the single best-evidenced actionable rule in the whole research. Separately: *Aedes aegypti* breeds in small, clean, artificial containers near houses; a large vegetated wetland with fish and moving water is poor habitat for it. The nuisance risk in a neglected wetland is *Culex*, and it comes from stagnant, organically polluted, trash-blocked water — a maintenance failure, not an inherent trait.

Residents' fear is **correct for a degraded banhado and false for a healthy one.** Do not dismiss it. Say exactly that.

### D9 · Sheet section structure

Ordered recognition → benefit → feasibility → boundary. Every section fully expanded; **no accordions** (card → sheet → six sections is already three levels of progressive disclosure; a collapsible "mais detalhes" makes four, and NN/g advises against accordions when users need most of the content and uninterrupted reading matters).

```
1  Heading                     type name
2  "Antes" drawing + caption   ≤ 12 words. The problem, concrete.
3  "Depois" drawing + caption  ≤ 12 words. Parallel to the antes caption.
4  O que muda                  3 bullets, each ≤ 10 words
5  O que é preciso             espaço · dono do terreno · dinheiro · tempo · quem cuida
6  Custo e prazo               band + one rounded range + realistic timeline
7  Quando não funciona         the honest failure mode, including mosquitoes
8  Não é isso                  names the sibling type most confused with it
```

Target ~150–200 words per section. Serrell's exhibit-label research puts interpretive labels at 20–75 words with only ~25–30% of visitors reading thoroughly ([Serrell](https://serrellassociates.com/writings)) — we run longer because rows 5–7 are *reference*, scanned not read, and because withholding them would be the patronising move.

Row 7 exists because a CBO **will** ask about mosquitoes, and both `flood-parks.md` and `wetland-restoration.md` list mosquito breeding as a real failure mode. The answer is honest and specific: well-designed wetlands with flow and fish are not significant Aedes habitat; stagnant, badly-drained ones are. Say that. Do not omit it and do not soften it.

Row 8 uses the confusion pairs the drawings were composed around:

| Type | Não é isso |
|---|---|
| `bioswales-rain-gardens` | não é o banhado — aqui a água passa e some no chão, não fica |
| `flood-parks` | não é o banhado — o parque fica seco quase o ano todo, e tem quadra e caminho |
| `green-corridors` | não é a floresta urbana — o corredor é uma linha que liga dois verdes |
| `urban-forests` | não é o corredor verde — a floresta é um bloco onde você entra |
| `wetland-restoration` | não é o parque de retenção — aqui a água fica sempre, com taboa e junco |
| `green-roofs-walls` | é o único que não fica no chão |

### D10 · Money

`custo por m²` is banned from user-facing copy. It demands a multiplication and is meaningless without knowing an area.

- Rounded ranges with the scale word: **`R$ 2 mil a R$ 5 mil`**, never `R$ 2.000–R$ 5.000`.
- Always attached to a **named, typical size** — "para uma faixa de 20 metros na frente de casa".
- Plus a three-band ordinal chip: **baixo / médio / alto**.
- And who pays: "dá pra fazer em mutirão" versus "precisa de obra pública".

---

## Part 3 — Interaction

Full spec and an operable prototype live alongside this doc. In brief:

- **Vertical scroll through all six types**, opening scrolled to the type that was tapped. Not a horizontal carousel: NN/g puts the practical ceiling near five slides (we have six), dots are a weak mobile cue, and swipe collides with the iOS back-gesture.
- **Stacked before/after at full width.** Not a drag-divider wipe: it shows half of each image at any instant, and nesting a horizontal drag inside a horizontal pager inside a vertically-draggable sheet gives three handlers fighting for one finger (this is why embla ships `watchDrag`).
- **vaul sheet, `handleOnly`**, one full-height snap point, `data-vaul-no-drag` on the figures, `scrollLockTimeout` to survive an overshoot at the top.
- **Not a carousel in ARIA either.** Six real headings in a scroll region; screen-reader users navigate by heading.
- **Language arrives as a prop**, never `i18n.language` read in the component — see `cbo-ux-audit-backlog.md:11`, which records `NbsTypeStrip.tsx:111` rendering English to a PT cohort in a pre-fetch race.

---

## Open items

1. **No domain expert has reviewed the two cutaways.** The first biovaleta render drew a rain garden that was not recessed below the sidewalk — which does not retain water. It was caught only because the drainage manuals had been read first. Ten minutes from WRI Brasil or a municipal engineer before a live cohort sees these. This is a *condition* of D2, not a nicety.
2. **No 2026 Brazilian cost table exists for any of these.** Every `R$` figure now in the copy is either taken from a Brazilian source or IPCA-inflated from a 2011–2022 study. **Inferred figures carry a visible `estimado` marker in the UI** — no unmarked placeholder ships. Commission a fresh SINAPI / SEINFRA-RS orçamento at design time.
3. **No community-led precedent exists in Porto Alegre or RS** for bioswales, flood pocket-parks, green roofs or banhado restoration. The nearest community-led builds are in Belo Horizonte (Barreiro), São Paulo (Grajaú), Rio (Teto Verde Favela) and Santa Catarina. This is an honest gap — and it is also the pitch: an OBC doing this would be **first in RS**. The local analogue that *does* exist is POA's 16–22 resident-run hortas comunitárias.
4. **Policy tailwind, cite it in every proposal.** POA's new Plano Diretor explicitly names jardins de chuva, telhados verdes, pavimentos permeáveis and post-flood corredores verdes as structuring projects prioritising the May-2024 flood-hit bairros, plus a community-planting programme. `LC 974/2023` also grants a 3–10% IPTU discount for green roofs and façades.
4. **Comprehension test not run.** Required by Lei 15.263/2025 and by decency. 3–5 OBC leaders, read aloud.
5. **Accepted imperfections in the drawings.** The biovaleta carries a baked-in `30 cm` dimension (locale-neutral, outside the card crop). Forest and corridor drew *jerivá* rather than *butiá* — jerivá is native to RS, so it stands.
6. **Out of scope, still broken.** `InterventionSelector` renders a construction-crane emoji for green roofs and a photograph of a Portland, Oregon bioswale labelled as Brazilian NBS. `role-selection.tsx` advertises a `slope-stabilization` typology the app never teaches and omits green roofs. Separate PRs.
