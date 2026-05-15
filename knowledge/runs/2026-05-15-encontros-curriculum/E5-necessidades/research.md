# E5 — Necessidades · prontidão — Research notes

**Goal of this encontro**: Translate the project into a fundable **ask** — money needed + permits required + gap report. By the end, the orchestrator (and BWB) has enough to triage the project. ~50 min platform time.

This is the encontro where the COUGAR maturity scoring + priority flags get assessed comprehensively. After E5, every metric and flag has a value.

## What the research says

### Brazilian funding landscape for community NBS (from our KB)

Our existing `knowledge/_financing-sources/cbo-grants.md` already covers what's directly accessible to small CBOs. Key sources matched to typical project sizes:

| Funder | Amount | Eligibility | Notes |
|---|---|---|---|
| **Teia da Sociobiodiversidade** (Fundo Casa + Caixa) | Up to R$100k | Nonprofits, budget ≤ R$500k. Prioritizes women, youth, traditional communities | R$20M program · 400 projects nationally. Recurring. |
| **Fundo Casa Reconstruir RS** | Up to R$40k | RS-based, flood-affected | First round closed Mar 2026; may recur |
| **Periferias Verdes Resilientes** (Ministério das Cidades) | Variable, R$25M program | CSOs in peripheral neighborhoods | NBS is the explicit focus |
| **GEF Small Grants Programme — Brazil** | Up to US$50k (~R$275k) | Well-organized CBOs | More competitive |
| **BPJP** (Brazil RFP — C40 / Bloomberg) | Larger amounts via municipal channels | City-led, but community projects can be sub-grantees | Most COUGAR projects' likely path |
| **QCF (Quayside Climate Fund)** | €50k catalytic for project preparation | Specifically targets pre-feasibility stage | The pilot's near-term funding trigger (Nov 2026) |
| **BNDES Fundo Clima** | R$100k-R$5M | Mid-large NGOs with track record | More demanding but bigger ticket |

**Implication for E5**: The funding ask range we should support is **R$10k to R$2M** — covers everything from a small Teia grant to a BNDES Fundo Clima ticket. The Funding Need Breakdown microapp should accept inputs across this range without making R$50k projects feel small or R$1M projects feel implausible.

### What funders actually look for — grant readiness literature

[**Instrumentl · The Grant Readiness Checklist**](https://www.instrumentl.com/blog/is-your-nonprofit-grant-ready) and [**Contour Strategies · What Funders Want**](https://www.contourstrategies.com/blog/grantreadinesschecklist) converge on 6 components:

1. **Strategic alignment** — clear connection between project and funder priorities (E1's mission summary + E3's justification cover this)
2. **Financial readiness** — sound financial statements, annual budget, program budget, audited finances for larger grants
3. **Program design & evaluation** — logic model with objectives + methods + measurable outcomes (E3-E4 cover this)
4. **Reporting capacity** — ability to deliver financial + programmatic reports
5. **Track record** — 3+ years of successful programs (captured in E1's prior project history)
6. **Organizational capacity** — staff, procedures, technology (E1's team + E4's operations cover this)

[**FundRobin · Grant Fit Score Framework**](https://fundrobin.com/articles/how-to-guide/funding-application-foundations/grant-fit-score-framework-nonprofits/): "most grant applications fail due to fundamental misalignment between the nonprofit's project and the funder's stated priorities, along with failing to meet eligibility criteria, ignoring application guidelines, submitting unrealistic budgets, and lacking a clear sustainability plan."

**Implication for E5**: the Gap Report shouldn't just say "you're missing X" — it should map gaps to which specific funders this affects. E.g., *"sem orçamento detalhado, não dá pra aplicar pra Teia. Mas pra Fundo Casa Reconstruir, o que você tem já basta."*

### Porto Alegre permits + city departments

[**Prefeitura de Porto Alegre · SMAMUS**](https://prefeitura.poa.br/smamus): the Secretaria Municipal de Meio Ambiente, Urbanismo e Sustentabilidade owns environmental + urbanism permits. As of 2024, they moved to a digital platform ([Portal de Licenciamento](https://licenciamento.procempa.com.br/)).

Key insight from the SMAMUS page: **small low-impact activities are exempt from licensing.** A 320 m² community rain garden in a public square likely fits — but the org needs to verify with SMAMUS.

[**SMAMUS · Tipos de Requerimento**](https://prefeitura.poa.br/smamus/tipos-de-requerimento) lists what they handle:
- **Licença de Instalação (LI)** — for construction-phase impacts
- **Licença Prévia (LP)** — for project-stage feasibility
- **Licença de Operação (LO)** — for operation-phase
- **Autorização de Supressão Vegetal** — if tree removal involved

For community NBS in public spaces, additional involvement often needed from:
- **SMOV** (Secretaria Municipal de Obras e Viação) — for any construction in public right-of-way
- **DMAE** (Departamento Municipal de Água e Esgotos) — for projects affecting drainage
- **Gabinete de Inovação · Luis Carlos / Clayton** (per our COUGAR meeting notes) — for innovation-framed projects that need cross-department coordination
- **Secretaria de Cultura** — if the project has a cultural-heritage component (relevant for Vila Flores complex itself)

**Implication for E5**: a Permit Checklist needs to be **bairro × intervention-type aware**. A rain garden in a public park triggers SMAMUS + SMOV + DMAE. A green roof on a private CBO building might trigger only SMAMUS (and maybe none if exempt). The KB needs `_permits/porto-alegre-map.md` with this mapping.

### The COUGAR criteria — full assessment at E5

By the end of E5, every COUGAR metric + flag should have a value. From `_cougar/nbs-mapping-criteria.md`:

**9 maturity metrics (0-3 each)** — by E5, all should be scored:
- Org Delivery Capacity → E1 ✓
- Team Technical Experience → E1 ✓
- Site Control → E2 ✓
- Community Anchoring → E2 ✓
- Problem Clarity → E3 ✓
- Solution Clarity → E3 ✓
- Climate NBS Impact → E4 ✓
- Financial Thinking → E4 ✓
- **Regulatory Awareness → E5 NEW**

**6 priority flags** — by E5, all assessed:
- Land tenure secure or likely secure → can infer from E2's `land_tenure`
- Baseline environmental data exists → infer from E2/E3 uploads
- Local government expressed interest → asked at E5 (new)
- Potential buyers/payors identified → infer from E4's sustainability_models + E5 new
- Co-financing possibility identified → asked at E5 (new)
- Scalable beyond one site → asked at E5 (new)

**Implication for E5**: the encontro should include a lightweight pass through the priority flags. Not a full survey — just 3-4 questions that fill the gaps.

## What we therefore do in E5

3 beats over ~50 min:

### Beat 1: Necessidades (~20 min)

Agent opens:
```
Você desenhou o projeto, sabe o impacto, sabe quem cuida. Hoje a gente traduz isso em pedido — quanto você precisa pra fazer acontecer.
```

Invokes **FundingNeedBreakdown** microapp. Four categories:

- **Implementação (capex)** — installation, materials, equipment
- **Operação primeiro ano (opex Y1)** — pré-preenchido com `ops_y1_cost_brl` de E4
- **Assistência técnica** — consultoria, projetos, monitoramento
- **Engajamento comunitário** — oficinas, comunicação, capacitação

Each category has a `R$ band` selector (low / mid / high) instead of asking for exact numbers. User can also type a custom amount if they have a quote.

Auto-totals at bottom. Sanity check: compare with E4's 5-year OPEX to flag wild discrepancies.

After total, agent asks:
```
Esse valor é o que você precisa pra começar. Você tem alguma parte que já consegue cobrir por conta própria, ou de parceiros já confirmados? (Co-financiamento conta muito pra financiadores.)
```

→ captures `co_financing_amount_brl` + `co_financing_source` (free text). Feeds 1 priority flag.

### Beat 2: Prontidão regulatória (~20 min)

Agent transitions:
```
Agora a parte chata mas importante: que autorizações você precisa antes de começar? E quem você precisa conversar na prefeitura?
```

Invokes **PermitChecklist** microapp. Reads `_permits/porto-alegre-map.md` and filters by bairro + intervention type. Renders a list:

```
☐ SMAMUS — Licença Ambiental (provavelmente isenta pra <500m², verificar)
   Contato: licenciamentoambiental@portoalegre.rs.gov.br
☐ SMOV — Autorização para obra em via pública
   Contato: ___
☐ DMAE — Anuência sobre impacto em drenagem (se aplicável)
   Contato: ___
☐ Gabinete de Inovação — coordenação cross-departamento
   Contato: Luis Carlos / Clayton (via Pyxera Global)
```

Each item: checkbox for status (Não iniciado / Em conversa / Em processo / Pronto), free-text field for notes, optional name of person they've talked to.

After the checklist, agent asks 2 priority-flag questions:
```
Você já conversou com alguém da prefeitura sobre esse projeto? Mesmo informalmente. (Sim / Não / Não lembro)

Você acha que esse modelo daria pra repetir em outros bairros? (Sim, fácil / Sim, com ajustes / Talvez / Esse é único)
```

→ captures `gov_interest_status`, `scalability_assessment`. Feeds 2 more priority flags.

### Beat 3: Gap Report (~10 min)

Agent transitions:
```
Última parte: vou te mostrar o "diagnóstico de prontidão" do projeto. Não tem nota — só pra você saber o que ainda falta e ter clareza pros próximos passos.
```

Invokes **GapReport** microapp. **Auto-generated** from:
- All 9 maturity scores (sorted by lowest)
- All 6 priority flags (sorted by missing first)
- Required-but-missing fields from any phase
- Funder-specific gaps (which funder eligibilities fail because of what)

Rendered as 3 sections:
1. **Pontos fortes** — what's at score 2-3, flags met
2. **Pra fortalecer** — what's at score 0-1, missing flags, with concrete next-step suggestions
3. **Próximos passos sugeridos** — top 3 actions, ranked

The CBO sees this view. **The coordinator sees a fuller version on the orchestrator** with funder-eligibility implications.

After they read the gap report, agent closes:
```
Tudo bem se tem coisas pra fortalecer — é normal. No próximo encontro a gente vai falar de como apresentar isso pra parceiros e financiadores, e ver com quem vocês podem conversar pra fechar essas pontas.
```

## Maturity scoring + flag assessment

```
REGULATORY_AWARENESS (0-3)
  Inputs: permit_checklist completion + actions taken

  0  Skipped permit checklist OR everything marked "Não iniciado"
  1  Checklist completed but no actions ("aware but no action")
  2  ≥1 permit marked "Em conversa" (preliminary conversations with authorities)
  3  ≥1 permit "Em processo" or "Pronto" OR compliance plan documented

PRIORITY FLAGS (binary — met or not met)
  Flag                                          | Inferred or asked at E5
  ----------------------------------------------|-------------------------
  Land tenure secure/likely secure              | Infer from E2 land_tenure
  Baseline environmental data exists            | Infer from E2/E3 uploads
  Local government expressed interest           | Asked at E5 (Beat 2)
  Potential buyers/payors identified            | Infer from E4 sustainability_models + co_financing
  Co-financing possibility identified           | Asked at E5 (Beat 1)
  Scalable beyond one site                      | Asked at E5 (Beat 2)
```

After E5, the maturity scorecard is **complete**: 9 metrics × 0-3 + 6 flags. Total maturity score 0-27. This is what gets handed to BWB.

## Microapps & improvements proposed by this research

### NEW · `FundingNeedBreakdown` (structured form)

4-category breakdown with band-based amount inputs (low / mid / high) plus a "custom" override. Auto-totals at the bottom. Pre-fills the Year-1 OPEX category from E4 so the user doesn't re-enter it.

Sanity check: total ÷ project lifespan compared to E4's 5-year OPEX. If wildly off, surface it.

Effort: ~80 lines React.

### NEW · `PermitChecklist` (KB-driven list)

Renders a permits list filtered by `bairro × intervention_type`. Data from `_permits/porto-alegre-map.md` (new). Each item:
- Permit name + department
- Status dropdown (Não iniciado / Em conversa / Em processo / Pronto)
- Notes (free text)
- Contact email/person field

Plus 2 priority-flag questions at the bottom (chip-style answers).

Effort: ~100 lines React + new KB content authoring.

### NEW · `GapReport` (auto-generated review)

Reads `state.maturityScores`, `state.priorityFlags`, and key state fields. Renders 3 sections (Pontos fortes / Pra fortalecer / Próximos passos sugeridos). Concrete next-step suggestions are mapped from the rubric — e.g. *"Climate NBS Impact at 1 → strengthen by adding specific monitoring metrics"*.

For the coordinator (on the orchestrator), a fuller view with funder-eligibility implications: *"orçamento muito agregado → eligibilidade pra Teia comprometida"*.

Effort: ~120 lines React + a `_gap-recommendations/rubric-to-action.yaml` mapping file.

## KB content to author

1. **`knowledge/_permits/porto-alegre-map.md`** — POA city departments + which permits they own + contact info + when each is needed. Critical for PermitChecklist.

2. **`knowledge/_readiness-criteria/funder-checklists.md`** — what BPJP, QCF, BWB, Teia, Fundo Casa, etc. specifically want. Per-funder readiness rubric. Used by GapReport for funder-eligibility-implication overlay.

3. **`knowledge/_gap-recommendations/rubric-to-action.yaml`** — structured mapping of "score X on metric Y → suggested next action." Used by GapReport.

## What we do NOT do at E5

- The actual pitch / presentation → E6
- Submitting funding applications → after pilot
- Final BWB handoff → after pilot

## Open decisions before building

1. **R$ band size design** — should each category have 3 bands (low/mid/high), or 4 (low/mid/high/very-high)? Recommended 4, because R$50k vs R$500k vs R$2M are very different conversations. The bands could be intervention-type-specific (a rain garden's "high" is different from an urban forest's "high").

2. **Gap Report — show to CBO or coordinator only?** — Recommended: show to both with different framings. CBO sees the encouraging "aqui está o que falta" view. Coordinator sees the funder-eligibility view.

3. **Permit checklist — what if the user is in a different city?** — For pilot, hard-code Porto Alegre. Post-pilot, the checklist becomes city-pluggable (the KB has bairro-level mapping but city-level for permits).

4. **Co-financing question at Beat 1** — currently asks both amount + source in free text. Could split into structured: source-type (donations / org budget / partner / municipal / other) + amount band + named partner. More structured = more usable by the coordinator. Recommended: split.

## Sources

### Internal KB
- `knowledge/_financing-sources/cbo-grants.md` — Brazilian funders accessible to CBOs
- `knowledge/_financing-sources/brazilian-domestic.md` — larger Brazilian sources
- `knowledge/_financing-sources/international.md` — international funders
- `knowledge/_financing-sources/preparation-facilities.md` — preparation/feasibility facilities
- `knowledge/_cougar/nbs-mapping-criteria.md` — Regulatory Awareness rubric + 6 priority flags

### External (funding readiness)
- [Instrumentl · Grant Readiness Checklist](https://www.instrumentl.com/blog/is-your-nonprofit-grant-ready) — 12 questions
- [Contour Strategies · What Funders Want](https://www.contourstrategies.com/blog/grantreadinesschecklist) — 6 components
- [FundRobin · Grant Fit Score Framework](https://fundrobin.com/articles/how-to-guide/funding-application-foundations/grant-fit-score-framework-nonprofits/) — alignment + eligibility patterns

### External (POA permits)
- [Prefeitura de Porto Alegre · SMAMUS](https://prefeitura.poa.br/smamus) — main environmental licensing office
- [SMAMUS · Tipos de Requerimento](https://prefeitura.poa.br/smamus/tipos-de-requerimento) — permit types
- [Portal de Licenciamento POA](https://licenciamento.procempa.com.br/) — digital platform (2024+)
