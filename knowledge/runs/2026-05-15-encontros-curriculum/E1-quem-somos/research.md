# E1 — Quem somos · diagnóstico — Research notes

**Goal of this encontro**: capture enough about each CBO that we can (a) score the two **Phase-1 maturity metrics** required by the COUGAR mapping criteria, (b) set the **two-path triage**, and (c) build trust with the community leader. ~30-40 min of platform time inside a 90-min session.

## What the literature + frameworks say

### COUGAR/Pyxera NBS Mapping Criteria (already in our KB)
The Phase-1 metrics with concrete 0-3 anchors (`knowledge/_cougar/nbs-mapping-criteria.md`):

| Metric | 0 (Lowest) | 1 | 2 | 3 (Highest) |
|---|---|---|---|---|
| **Org Delivery Capacity** | No prior experience | Limited small project experience | Demonstrated project management | Proven multi-stakeholder/funded project track record |
| **Team Technical Experience** | No relevant experience | General environmental experience | Pilot-scale similar experience | Proven track record in this NBS type |

**Exclusion filters** also matter — disqualifies pure advocacy, research-only, projects <6 months old, projects with unresolved land conflict. We screen for these via free-text "what does your organization do" answers and the path-triage answer.

### Real-world POA benchmarks (`_cougar/ecosystem-assessment-summary.md`)
The Pyxera ecosystem assessment mapped 50+ POA actors and gives us calibration:

- **Mature (score 3 territory)**: CEA Bom Jesus (~$1M fundraising, innovation hub, city-wide network); Vila Flores (US$900K secured Caixa Federal, 12-yr track record, 40+ initiatives at the hub)
- **Developing (score 2 territory)**: Translab ($160K Regenera RS, multiple sites)
- **Emerging (score 1 territory)**: Misturaí — grassroots, Black-woman-led, environmental awareness + community gardens, no formal funding history yet
- **Early (score 0 territory)**: informal groups, no contracting entity (would fail the "Identifiable Org" eligibility gate)

These benchmarks become the agent's reference points: *"orgs at your level typically have X budget and Y team size."*

### CCAT / OCAT — what NOT to copy
[CCAT](https://www.tccgrp.com/product/core-capacity-assessment-tool-ccat/) and [McKinsey OCAT](https://www.americorps.gov/sites/default/files/document/09102021_OrganizationalCapacityAssessmentTool-508_ORE.pdf) are the industry standard org-capacity tools. They have **146 questions, 30-45 min** to complete and are designed for board members + senior leaders, not field workshops.

**Don't replicate them.** Those tools serve a different purpose (long-term capacity-building consulting). For E1 we have a single workshop slot to: triage, score 2 metrics, build trust. **5-8 questions max.**

What we borrow from them: the *framing* of capacity as multi-dimensional (governance, programs, finance, evaluation) — we collapse this into a single "delivery capacity" score in COUGAR, which is appropriate at our scale.

### IUCN Global Standard for NbS (Edition 2, Oct 2025)
[The Global Standard](https://iucn.org/our-work/topic/iucn-global-standard-nature-based-solutions) has 8 criteria + 28 indicators, but they're **project-level not org-level**. Relevant later (E3-E4) but not at E1. The October 2025 second edition put Indigenous peoples and local communities more centrally — reinforces our equity-baseline question.

### UNEP / Adaptation Fund — what funders ask CBOs upfront
[UNEP AFCIA grants ($50k-$250k for CBOs)](https://www.unep.org/news-and-stories/story/new-fund-leverages-nature-adapt-climate-change) require eligibility as a registered NGO/CSO/CBO in a developing country and ask about scaling potential. The implication: even early-stage CBOs get heard, but they need a **legal contracting entity**. The "Identifiable Org" gate in COUGAR is the same gate.

### BPJP/C40 participatory frameworks (`_inclusive-action/participatory-frameworks.md`)
For Vila Flores' Brazilian context, BPJP/C40 explicitly score on inclusive action. The 7 vulnerable groups they ask about (mulheres, idosos, pessoas com deficiência, comunidades tradicionais, jovens, pessoas negras, povos indígenas) deserve a **single light-touch acknowledgment question at E1**: "Quem você atende?" with optional multi-select chips. NOT the full equity diagnostic (which lives in E2's community_anchoring + the Phase-4 inclusive-action questions in the existing concept-note skill).

## What we therefore ask at E1

Synthesizing the above — a **lean diagnostic that produces a defensible 0-3 score on 2 metrics + path triage + light context + trust-building**:

| # | Question | Captures | Maps to |
|---|---|---|---|
| 1 | "Como se chama sua organização e quem fala com a gente hoje?" | org_name, contact_name, contact_role | identity |
| 2 | "Em uma frase — o que sua organização faz?" | mission_summary | identity + qualitative |
| 3 | "Há quanto tempo vocês existem e como vocês são organizados?" (chips: ONG/associação/cooperativa/grupo informal + year) | legal_form, year_founded | exclusion filter ("Identifiable Org") |
| 4 | "Quantas pessoas estão envolvidas e como? (núcleo pago / equipe ampliada / voluntários)" | team_size, paid_vs_volunteer | Org Delivery Capacity input |
| 5 | "Que tipo de projetos vocês já realizaram?" (chips: nenhum / atividades pontuais / projetos com financiamento / projetos com parceria pública or *"upload a doc"*) | prior_project_scale, evidence | both Phase-1 metrics |
| 6 | "Qual a sua experiência com soluções baseadas na natureza ou meio ambiente?" (chips: nenhuma / educação ambiental / hortas/jardins / projetos NBS já implementados) | nbs_experience | Team Technical Experience |
| 7 | **Path triage**: "Você já tem uma ideia de projeto NBS, ou quer ajuda para encontrar uma?" (idea / needs-help) | path | branches E2-E3 |
| 8 | (Optional trust-build) "Tem algo que sua organização fez que vocês têm orgulho? Pode contar?" | qualitative narrative | trust + qualitative evidence |
| 9 | "Quem sua organização atende?" (multi-select chips on the 7 BPJP vulnerable groups + "comunidade geral do bairro") | groups_served | E2 equity baseline |

That's **8 substantive + 1 optional**. With multi-choice + free-text mix and the auto-fill from any uploaded docs (the existing file-drop already does this), **20-30 min realistic completion**.

## Maturity scoring — how the agent infers 0-3

The agent reads the answers and the existing rubric to score:

**Org Delivery Capacity (0-3)**:
- 0: "nenhum" prior projects AND informal organization
- 1: "atividades pontuais" OR ONG/associação with no funded projects
- 2: "projetos com financiamento" AND team_size ≥ 3 AND year_founded ≤ today - 2yr
- 3: "projetos com parceria pública" OR documented multi-stakeholder track record OR uploaded evidence of past funded grant > BRL 100k

**Team Technical Experience (0-3)** (NBS-specific, not generic delivery):
- 0: nbs_experience = "nenhuma"
- 1: nbs_experience = "educação ambiental"
- 2: nbs_experience = "hortas/jardins" OR existing rain garden / urban forest activities (uploads can corroborate)
- 3: nbs_experience = "projetos NBS já implementados" with evidence

Score is shown to the **coordinator (orchestrator)**, not the CBO — we don't want the CBO to feel graded. The CBO sees a simple "diagnóstico concluído" + their answers visible in the doc panel.

## Path triage — what each path actually looks like at E2

Captured here, branched in E2's skill:

**`has-idea`** path: E2 starts with *"Conta sobre seu projeto atual — onde você quer trabalhar e o que tem em mente?"* Agent guides into the existing-idea framing, asks for any documents/photos, then uses the risk-map to overlay risk on what they describe.

**`needs-help`** path: E2 starts with *"Vamos descobrir juntos."* Agent opens the Site Explorer with the bairro pre-selected (from E1's bairro_of_operation), walks them through the risk overlays, and asks "qual desses riscos te preocupa mais?"

## What we do NOT do at E1 (deliberate exclusions)

These are deferred to keep E1 a **30-min experience that builds confidence**, not a survey:

- Full equity diagnostic (BPJP section 11) → E2's community_anchoring + later phases
- Site selection (E2)
- Intervention type (E3)
- Impact estimates (E4)
- Operations / financial model (E4)
- Funding need or permits (E5)
- Detailed governance / decision-making (could be E4-5)

## Microapps for E1

**None.** Chat + file drop + a doc panel showing the 4 grouped fields filling in:

1. **Quem somos** — org_name, year_founded, legal_form, mission_summary
2. **Equipe** — team_size, paid_vs_volunteer
3. **Histórico** — prior_project_scale, uploaded files list, nbs_experience
4. **Caminho** — path (idea / needs-help) + groups_served

The doc panel is the existing right-rail panel; this is just a content layout change for E1, not a new microapp.

## Open questions

1. **Year founded for informal groups** — what do we accept? Default: ask for "year started doing this work" rather than legal registration. Document the choice in the spec.
2. **Multiple-contact orgs** — should we capture more than one contact? Probably yes (1 primary + 1 secondary) for funder handoff, but optional at E1.
3. **Score calibration** — the rubric should be tuned against the 4 POA reference orgs (Vila Flores=3, Translab=2, Misturaí=1, hypothetical informal=0). After the first 2-3 real diagnostics in June, recalibrate.

## Sources

- `knowledge/_cougar/nbs-mapping-criteria.md` — COUGAR 2.0 NBS Mapping Criteria (the rubric)
- `knowledge/_cougar/ecosystem-assessment-summary.md` — Pyxera POA ecosystem benchmarks
- `knowledge/_cougar/sample-cbo-vilaflores.md` — calibration example (Vila Flores = score 3)
- `knowledge/_inclusive-action/participatory-frameworks.md` — BPJP/C40 equity criteria
- [IUCN Global Standard for NbS](https://iucn.org/our-work/topic/iucn-global-standard-nature-based-solutions) — 8 criteria, project-level (validates we're scoping E1 correctly to org-level)
- [TCC Core Capacity Assessment Tool (CCAT)](https://www.tccgrp.com/product/core-capacity-assessment-tool-ccat/) — 146 questions, 30-45 min (anti-pattern for us)
- [McKinsey/AmeriCorps OCA Tool](https://www.americorps.gov/sites/default/files/document/09102021_OrganizationalCapacityAssessmentTool-508_ORE.pdf) — heavier than appropriate
- [UNEP AFCIA grants](https://www.unep.org/news-and-stories/story/new-fund-leverages-nature-adapt-climate-change) — CBO eligibility validates our "identifiable org" gate
