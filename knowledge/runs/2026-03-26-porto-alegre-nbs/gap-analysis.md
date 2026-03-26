# Gap Analysis — POA Resiliente Verde

## Run: 2026-03-26-porto-alegre-nbs

---

## 1. Empty or Weak Sections

| Section | Status | Gap Description | Impact |
|---|---|---|---|
| 12.1 Articulação interna | Weak | No formal inter-secretaria agreement (GT, comitê) described. Auto-filled from stakeholder roles but lacks specific governance mechanism. | Medium — funders want to see formalized coordination |
| 13.1 Equipe técnica | Empty | No specific team composition or CVs. Generic institutional description only. | Medium — demonstrates implementation capacity |
| 13.2 Experiência prévia | Weak | Referenced Orla do Guaíba and Regenera Dilúvio but no quantified project delivery track record for NBS specifically. | Medium |
| 14 Apoio político | Weak | Strong post-flood momentum noted but no specific formal instruments (ofícios, resoluções, decretos) cited. | High — formal backing is a scoring criterion |
| 16.1-16.3 Custos detalhados | Medium | Cost estimates are ranges from literature, not engineering-level estimates. No line-item breakdown per zone. | High — funders expect detailed cost tables |
| 17.1 Disponibilidade orçamentária | Weak | "10-20% counterpart" stated but no specific budget lines, fund sources, or fiscal year allocations identified. | High — demonstrates fiscal commitment |
| 18.3 Experiência com financiamento | Empty | No CAPAG rating specified. No prior credit operation history described. | High — eligibility criterion for BNDES/Caixa |
| 22 Ponto focal | Partial | Institutional contact (SMAMUS) but no named individual with cargo/email/phone. | Medium |

## 2. Low-Confidence Data

| Data Point | Confidence | Issue | Recommendation |
|---|---|---|---|
| CO₂ sequestration (2,500-8,000 tCO₂e/yr) | Medium | Wide range; depends heavily on actual area and species mix. No site-specific biomass data. | Commission site-level carbon assessment using IPCC Tier 2 + i-Tree |
| Green jobs (500-1,500) | Medium | Literature-based estimate. Actual labor market and hiring pipeline not assessed. | Conduct local employment capacity study |
| Property value increase (5-20%) | Medium | Based on international studies. No Porto Alegre-specific hedonic pricing data. | Reference Orla do Guaíba property impact if available |
| Flood peak attenuation (20-40%) | Medium | Composite of intervention types. No integrated hydrological model for Porto Alegre multi-zone scenario. | Commission SWMM/HEC-HMS modeling with UFRGS/IPH |
| Stormwater capture (500K-3M m³/yr) | Low-Medium | Very wide range. Depends on actual sizing and rainfall patterns. | Narrow after detailed design |
| Heat mortality reduction (15-30%) | Low-Medium | Extrapolated from European city data (Lancet). Different climate, demographics, health infrastructure. | Use conservative lower bound (15%) or omit |

## 3. Missing Evidence / Citations

| Section | Missing Evidence | Source Needed |
|---|---|---|
| Territorial context | No quantified flood/heat risk per zone from hazard grid data | Run hazard grid analysis from `porto-alegre-grid.json` — could state "X% of population in high-flood-risk cells" |
| Problem diagnosis | No post-2024 damage assessment specific to NBS target zones | Municipal damage assessment reports (DMAE, Defesa Civil) |
| Cost estimates | No Porto Alegre-specific unit costs | Local construction cost database or Regenera Dilúvio feasibility study |
| Adaptation benefits | No localized flood modeling for NBS scenarios | UFRGS/IPH hydrological model outputs |
| Plan alignment | PDDUA revision text not yet final (March 2026) | Monitor Câmara Municipal proceedings |

## 4. Funder Misalignment Check

| Funder | Eligibility | Issue | Status |
|---|---|---|---|
| BNDES Fundo Clima (Desenvolvimento Urbano) | Municipalities with CAPAG A/B | **CAPAG rating not confirmed** | ⚠️ BLOCKER — must verify |
| BNDES Fundo Clima (Florestas Nativas) | Min R$10M, max R$250M/yr | Within range at R$250M total | ✅ OK |
| World Bank (co-financing P178072) | Must align with existing project scope | NBS components align; needs coordination with SMPAE/PIU | ✅ OK — needs coordination |
| GCF (via BNDES as AE) | Simplified approval ≤$25M; full proposal >$25M | Full proposal needed at ~$50M. Requires GCF PPF for preparation. | ⚠️ Needs PPF application |
| IDB (BR-L1598 alignment) | Social development + fiscal sustainability focus | NBS green jobs + community benefits fit; fiscal sustainability needs demonstration | ✅ OK — emphasize employment |
| KfW/AFD (Fundo Clima co-financing) | Via BNDES channel | Dependent on BNDES approval | ✅ OK — cascading |

## 5. Critical Next Steps

1. **Verify Porto Alegre's CAPAG rating** — blocker for BNDES access
2. **Obtain formal political backing** (ofício from Prefeito) — high-impact gap
3. **Commission integrated hydrological model** (UFRGS/IPH) — strengthens technical case
4. **Run hazard grid analysis** for quantified population-at-risk statements
5. **Name focal point contact** with full details
6. **Develop detailed cost breakdown** per zone with local unit costs
