# E6 — Portfólio · apresentação — Research notes

**Goal of this encontro**: The celebration + handoff. Each CBO sees their project as part of a larger portfolio, leaves with a 1-page project card, practices their pitch, and gets clear next steps (BWB review timeline, QCF deployment in November). ~90 min in-room, ~20 min platform time per CBO.

This is the encontro that's **structurally different**: it's communal, not individual. The platform's job is to produce the deliverables (project card, portfolio view) and help the CBO prepare their pitch — most of the actual workshop happens in-person.

## What the research says

### Nonprofit pitch decks — community context

[**Beautiful.ai · Pitching for Good**](https://www.beautiful.ai/blog/pitching-for-good-creating-nonprofit-pitch-decks-for-donors-volunteers-and-government) on community-focused pitches: 3 things to lead with —
1. **Alignment with funders** — explicitly map what you're doing to the funder's strategy
2. **Community voices** — *"there's nothing more powerful than the voices of the people you're working with"*
3. **Clear messaging** — your why + vision + why your team is trusted to deliver

[**Storydoc · Nonprofit Pitch Deck Templates**](https://www.storydoc.com/templates/nonprofit-pitch-deck): community-org pitches converge on 5 slides — mission · challenge · solution · impact · ask. Some templates add a 6th: team/credibility.

[**CAST Digital Toolkit · Pitch Presentation**](https://digitoolkit.wearecast.org.uk/tools/vBvLxhEM8x9zydQY9iBtSY/6-pitch-presentation/7zcKzpUxghveu93weKJGit): for 2-minute pitches, the trick is **one big idea per minute** — 60s of "what we're doing and why," 60s of "what we need to make it happen."

**Implication for E6**: the 1-page project card needs to map cleanly to a 2-min pitch. 5-6 sections, each speakable in 20-30 seconds. The card *is* the pitch script, not separate from it.

### What the card needs to contain — funder perspective

The COUGAR scorecard data (collected through E1-E5) is the source of truth. The card surfaces:

- **Header**: org name · bairro · 1-sentence mission
- **Site map thumbnail**: where (E2 site + bairro context)
- **Intervention + sketch**: what (E3 type + drawn area)
- **Impact**: 3-4 indicators with ranges (E4 ImpactCalculator output)
- **Operations summary**: who maintains it, 1 line (E4 OperationsDesigner output)
- **Ask**: total funding need + co-financing (E5 FundingNeedBreakdown output)
- **Footer**: pilot context (Vila Flores · COUGAR · handoff date · contact)

This is roughly the BPJP/C40 concept-note template compressed onto a single page. Funders who see lots of project pitches will recognize this structure.

### The aggregate portfolio view — what funders actually care about

For BWB review of a 10-project portfolio, the right framing is **the cohort as a single investable proposition**, not 10 separate projects:

- **Total area** under intervention (m² across all projects)
- **Total ask** (BRL aggregated)
- **Geographic distribution** — where in POA
- **Intervention-type mix** — how many of each type
- **Aggregate impact** (with appropriate caveats — sums of ranges aren't always meaningful)
- **Co-financing total** — meaningful for funders who care about leverage
- **Readiness mix** — how many in each maturity band

[**Conservation International · Green-Gray Community of Practice**](https://www.conservation.org/projects/global-green-gray-community-of-practice) notes that portfolio-scale framings unlock different funding instruments than single-project asks (impact bonds, blended finance, multi-grantor pools). The orchestrator portfolio view should be designed for funder consumption.

### Brazilian community pitch examples — what's actually used

From the COUGAR ecosystem assessment + our case study KB, three relevant patterns:

- **Vila Flores Várzea Lab** — pitched as "5 laboratórios em 2 anos no 4º Distrito" — caught Caixa Federal's attention. The framing was "rede de iniciativas" not "single project."
- **Translab · Seeds of New Life** — pitched as "hortas + jardins de chuva em escala municipal" — got Regenera RS funding. Framing was clear scale ambition.
- **CEA Bom Jesus** — pitched as "the most advanced sorting unit + innovation hub for energy transition" — Translab-scale credibility framing. Combining hard infrastructure + innovation language.

**Implication for E6**: provide 2-3 pitch examples in the KB, drawn from these real Brazilian community NBS pitches. CBOs see how other groups successfully framed similar work.

## What we therefore do in E6

3 beats, ~90 min total in-room workshop + 20 min platform time per CBO:

### Beat 1: Aggregate portfolio reveal (~30 min, communal)

The coordinator (Julia/Antônia) projects the **Aggregate Portfolio view** (orchestrator-side) to the whole cohort:

- Cohort map: all 10 sites marked, intervention types as colored layers
- Stats strip: 10 projects · X total m² · R$ Y total ask · ~Z people served (range)
- Intervention-type donut: how many rain gardens, urban forests, etc.
- Co-financing total: R$ X leveraged
- Readiness band breakdown: how many "investment-ready" vs "developing"

Then: *"Together, you 10 represent..."* — the framing that turns 10 small projects into a portfolio that BWB / QCF / BNDES can consider as one.

This is presentation-led, not platform-led. The platform's job is to render the view well.

### Beat 2: Project card + pitch (~50 min in-room, ~15 min platform per CBO)

For each CBO (rotating):

**Platform side** (~15 min before their turn):
- Agent invokes `show_project_card` → renders the 1-page card
- Agent asks the user to confirm/edit the **pitch line** (1 sentence) and **3 talking points**
- Agent generates the PDF and offers download

**In-room side** (~5 min per CBO × 10 = 50 min):
- Each CBO presents using their 1-page card projected
- 2-min pitch + 1-2 min Q&A from cohort
- Coordinators take notes for follow-up

The platform's job in this beat:
1. Render a beautiful, funder-grade 1-page card
2. Help the CBO articulate their pitch line + talking points
3. Generate the PDF

### Beat 3: Next steps + closing (~10 min, communal)

Coordinator presents what happens next:
- BWB review timeline (after pilot ends)
- QCF €50K deployment trigger (November 2026)
- Continuing support model (if any)
- Partner intros — who from city / funders the coordinator plans to introduce them to

Platform-side: agent renders a "Próximos passos" card for each CBO summarizing what they get + what's expected of them. Sets the status to `'ready-for-review'`.

## Data captured at E6

| Field | Type | Why |
|---|---|---|
| `pitch_line` | string (1 sentence, ≤140 chars) | The elevator pitch |
| `pitch_talking_points` | string[] (3 bullets) | The 60s "what we're doing" + 60s "what we need" structure |
| `results_evidence_photos` | uploaded files[] | Final P5 evidence — site photos, prior outcomes |
| `project_card_approved` | bool | User confirmed the card content |
| `next_steps_acknowledged` | bool | User read the next-steps card |
| `status` | enum → `'ready-for-review'` | Handoff to BWB |

No new maturity scores at E6 — the scorecard was completed at E5. E6 is about presentation + handoff.

## Microapps & improvements proposed by this research

### NEW · `ProjectCardPDF` (server-side render)

A 1-page A4 PDF generator. Reads all phases of the CBO profile + computed values, renders a clean layout. Two flavors:
- **Preview** — rendered as HTML in the doc panel, editable inline (the "confirm before generating" view)
- **PDF download** — server-side render via the existing PDF stack (or print-stylesheet → "Save as PDF" if simpler)

Sections (5-6):
1. Header — org logo placeholder + name + bairro + contact
2. Site — map thumbnail (E2/E3 polygon overlay)
3. Intervention — type + sketch + size
4. Impact — 3-4 indicators with ranges (E4 ImpactCalculator output)
5. Operations + Ask — 3-phase OPEX + total funding need + co-financing
6. Footer — pilot info + handoff date + scorecard total (e.g. *"COUGAR maturity: 17/27 · Building"*)

Effort: ~200 lines React component for preview + the existing PDF stack for export.

### NEW · `PitchComposer` (inline form)

A short structured form for the pitch line + 3 talking points. Pre-fills with smart defaults derived from earlier phases (E1's mission summary + E3's justification + E5's funding ask):

```
Pitch line (1 sentence, ~120 chars):
"Cultivamos jardins de chuva em Cascata pra acabar com a enchente
 que afeta 12 famílias toda chuva forte."

Pontos pra falar (3):
  1. O problema: Rua Flores alaga todo verão (12 famílias)
  2. A solução: 320m² de jardim de chuva + biorretenção
  3. O que pedimos: R$ 73-120k pra implementação + Y1 ops
```

Optional: "ver exemplos" link → renders 2-3 real Brazilian pitches inline for inspiration.

Effort: ~70 lines React.

### NEW · `AggregatePortfolioView` (orchestrator-side)

New route `/orchestrator/portfolio`. Shows the whole cohort as a single portfolio:

- **Cohort map** (left, ~60%): all sites + intervention-type layer + heat overlay
- **Stats strip** (top): 4 cards — # projects, total area, total ask, total people served
- **Intervention type donut** (right): visual breakdown of how many of each type
- **Co-financing summary**: total R$ leveraged
- **Per-project mini-cards** (bottom grid): name + bairro + intervention + maturity score
- **Download portfolio PDF** → bundles every project card + cover sheet + aggregate stats

Effort: ~250 lines React + the PDF bundling utility.

### NEW · `NextStepsCard` (small, inline)

After E6 wraps, the agent renders a summary card per CBO:

- "Sua scorecard: X/27 · {band}"
- "Funders sugeridos: {list from gap report}"
- "Próxima conversa com Vila Flores: {date}"
- "Quando saberemos sobre BWB review: {date or 'após o piloto'}"

Effort: ~50 lines, mostly read-only.

## KB content to author

1. **`knowledge/_pitches/examples.md`** — 2-3 real Brazilian community NBS pitches. Pulled from our ecosystem assessment (Vila Flores Várzea Lab, Translab, CEA Bom Jesus). Each ~150 words showing how a similar project got framed.

2. **`knowledge/_next-steps/post-encontro-6.md`** — what happens after the pilot. BWB review timeline, QCF €50K deployment trigger, continuing support model. Reusable as the "Next Steps" content the card pulls from.

## What we do NOT do at E6

- New maturity scoring (scorecard complete at E5)
- Major data capture (E6 is about presentation + handoff)
- Detailed funder application — that happens post-pilot

## Open decisions before building

1. **PDF generation — server-side or client-side?** The existing platform stack has PDF generation infra for the concept-note module. Reuse it. Server-side gives us proper layouts; client-side print-stylesheet is the fallback if server PDF turns out too complex.

2. **Project card includes photos?** Site photos (uploaded in E2/E3) + a small intervention photo from the verified manifest would warm the card up. Conditional: render only if photos are available + verified per the curation standard.

3. **Aggregate Portfolio view: live or snapshot?** Recommended: live — reads current state from cohort_members. After E6, coordinator can manually freeze a snapshot for the BWB handoff.

4. **Pitch line character limit** — 120 or 200 chars? Recommended 140 (matches the Twitter-era "one thought") — forces the CBO to be punchy. Can override with "ver mais espaço" link.

## Sources

### Internal KB
- `knowledge/_cougar/ecosystem-assessment-summary.md` — Brazilian pitch examples (Vila Flores, Translab, CEA Bom Jesus)
- `knowledge/_cougar/sample-cbo-vilaflores.md` — reference for what a "mature" community project looks like
- All E1-E5 deliverables — the data sources for the project card

### External (pitch framing)
- [Beautiful.ai · Pitching for Good](https://www.beautiful.ai/blog/pitching-for-good-creating-nonprofit-pitch-decks-for-donors-volunteers-and-government) — community pitch principles
- [Storydoc · Nonprofit Pitch Deck Templates](https://www.storydoc.com/templates/nonprofit-pitch-deck) — 5-slide structure
- [CAST · Pitch Presentation toolkit](https://digitoolkit.wearecast.org.uk/tools/vBvLxhEM8x9zydQY9iBtSY/6-pitch-presentation/7zcKzpUxghveu93weKJGit) — 2-min structure

### External (portfolio framing)
- [Conservation International · Green-Gray CoP](https://www.conservation.org/projects/global-green-gray-community-of-practice) — portfolio-scale funding instruments
