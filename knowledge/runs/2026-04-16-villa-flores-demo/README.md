# Villa Flores × OEF — Demo Session, 2026-04-16

## Contents of this folder

- `raw/meeting-transcript.pdf` — 32-page meeting transcript (Fireflies.ai output).
- `raw/poa-futura-revista.pdf` — Porto Alegre "POA Futura" investment-program brochure (16 pages, Dec 2025).
- `raw/poa-futura-landing.html` — snapshot of <https://prefeitura.poa.br/poafutura>.
- `raw/plano-rio-grande-investimentos.pdf` — Rio Grande do Sul state investment plan (41 pages, 16 Sep 2024, v2).
- `backlog.md` — product/platform backlog extracted from the meeting (impact × effort matrix).
- Also referenced but not archived (interactive/JS-rendered): **ArcGIS Experience** at <https://experience.arcgis.com/experience/5372c6e0d53f4728b505017845625001> — open live; likely a Plano Rio Grande monitoring dashboard (follow-up: inspect layers + data sources).

## Meeting at a glance

- **Date**: 16 Apr 2026, 14:00 BRT · ~65 min.
- **Participants**: Ana Radzevicius, Martin Wainstein, Fernanda Scur (OEF); Julia Caon Froeder, Antônia Wallig (Vila Flores); Joaquin van Peborgh (OEF).
- **Format**: Demo + co-design discussion + government-engagement strategy.

### Strategic outcomes reached

- **Anchor city partner** = Porto Alegre's **Office of Innovation** (contact: Clayton Will; Sherpa: Luis Carlos). SMAMUS (environment) comes *through* Innovation, not as the primary convener.
- **Secondary target**: Secretariat of Planning & Management, which administers the **R$7B "PO Futura" fund** (Ezra Shirmer is the money lead). Meeting with Planning once the narrative deck is ready.
- **End goal**: Present a community-anchored NBS pipeline at **COP end-of-year 2026** under the banner "Porto Alegre, the most climate-community-advanced city in the world." Target scale: **$1M → $10M** aggregated portfolio.
- **Operating mode going forward**: next working meetings in **Portuguese**, without Joaquin/Martin, after Vila Flores tests the platform with 3–4 Palafita coordinators.

### Engagement commitments (tracked here; NOT in `backlog.md` per scope decision)

| Who | What | When |
|---|---|---|
| OEF (Fernanda + Martin) | Narrative deck (PT) for government meetings | Before 27 Apr |
| OEF (Fernanda) | Reconnect with Kami / Luis Carlos / Andrew | Week of **27 Apr 2026** (Kami visits POA) |
| OEF (Ana) | Google Doc w/ link + comment sections for VF async feedback | Immediately |
| OEF (Fernanda) | Internal NBS project screening for pipeline | Ongoing |
| Vila Flores (Antônia) | 20-org Palafita roster + 4 districts + workshop agenda | End of next week |
| Vila Flores | Invite 3–4 Palafita coordinators to test the platform | Week of 27 Apr |
| OEF (Fernanda) | Confirm origin of Andrew/Pixar scanning-criteria Excel | TBD |

### External references / integrations flagged during the meeting

- **HubSPOA** ("Hubs Comunitários de Porto Alegre") — existing community-hubs program run by the Office of Innovation. Possibly competing / adjacent; research before proposing our tool.
- **Koalizone / Phone Higgs** — Fernanda mentioned it has "something like" the funding-by-territory overlay. Worth inspecting.
- **Pontos de Cultura** (Brazilian federal law) — catalog of recognized cultural hubs. Cited by Antônia as the exemplar for our public-registry ambition.
- **Pacto Alegre** — universities coalition at city level. Engagement vector via Julia.

## Shared materials, summarized

### 1. POA Futura — Program brochure (Dec 2025, 16 pp)

Glossy public-facing brochure announcing Prefeitura de Porto Alegre's investment program. Structured around 4 *Eixos*:

| Eixo | Scope | Selected investments |
|---|---|---|
| **Qualidade de Vida** | Education, health, sport, culture, tourism, descentralized services | CRAS/CREAS R$152.9M · Unidades de Saúde R$412.7M · Saúde Mental R$23.2M · Maternidade Restinga R$50M · **Complexos de Serviços Públicos R$494.5M in Sarandi, Farrapos/Humaitá, Ponta Grossa, Centro Histórico, Arquipélago** · Rede de Museus R$125M |
| **Resiliência e Proteção** | Sanitation, drainage, arroios, Defesa Civil | Macrodrenagem (casas de bombas) **R$2.1 bi** · Recuperação de Arroios R$628.2M · **Contenção de Encostas R$119.1M in Glória, Morro Santana, São José, Cascata** · Diques e Comportas R$108.4M · Defesa Civil R$10.5M |
| **Gestão Digital e Integrada** | Digital governance, interoperability | Portal Único do Cidadão + geospatial platforms R$147.4M · Interoperabilidade R$144M |
| (4th Eixo — mobility / revitalization, not extracted here) | — | — |

**Why this matters to the platform**: POA Futura earmarks investments specifically in **Cascata, Arquipélago, and Humaitá** — the three neighborhoods we used for our demo CBOs. That's the exact data Julia asked for in backlog item **P-10** (planned-funding overlay × risk), and it's already public.

### 2. POA Futura — Landing page

<https://prefeitura.poa.br/poafutura> — Prefeitura's program landing. HTML archived in `raw/` for offline access.

### 3. Plano Rio Grande — Investment Plan (16 Sep 2024, 41 pp, v2)

**State-level** investment plan from Governo do RS. Anchored in **Lei Complementar 206/2024**, which lets the state postpone union-debt payments and redirect those funds into reconstruction + adaptation after the May 2024 floods. Creates **FUNRIGS (Fundo Rio Grande)**.

Four Eixos: (1) *Atuação Emergencial*, (2) *Resiliência*, (3) *Preparação*, (4) *Reconstrução*.

Key framing:
- **84% of RS municipalities** declared calamity.
- **2,826 disaster events** across **495 of 497** RS municipalities, 2013–2023; 32% flood-related.
- **World Weather Attribution (2024)** cited: floods now 2× more probable, 6–9% more intense with climate change.
- Cooperation with **BID, World Bank, CEPAL** explicit.

**Why it matters**: FUNRIGS is exactly the kind of multilateral-funded pool Julia wants mapped against risk territories in backlog item **P-10** — the "international funds" side of the same overlay. Page 5 of this PDF lists the base legal framework (LC 206, Lei 12.608, Lei 12.983, Lei 16.134, Decreto 57.647, etc.) — useful when wiring the data layer.

### 4. ArcGIS Experience (interactive dashboard)

<https://experience.arcgis.com/experience/5372c6e0d53f4728b505017845625001> — Esri Experience Builder app, likely tied to Plano Rio Grande monitoring. JS-rendered, didn't yield scrapable content. **Follow-up task**: open live, screenshot layers, identify data sources; if the backing feature services are public, they're ingestible directly into our map.

## Things to do from here

- Work backlog in `backlog.md`; quick-wins first.
- Feed the "Cascata / Arquipélago / Humaitá" POA Futura earmarks into the demo narrative — the CBOs in those neighborhoods are literally in line for city investment already.
- Manually inspect the ArcGIS Experience and add its layer list to this README once known.

---

Source-of-truth for quotes + timestamps: `raw/meeting-transcript.pdf`. Citations in `backlog.md` use speaker + timestamp (e.g. `Julia 13:46`).
