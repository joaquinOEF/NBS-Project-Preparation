# Recovering the ARVC climate-risk surfaces from a PDF

Porto Alegre's Climate Action Plan (PLAC) includes a full climate risk and
vulnerability analysis — the **ARVC**, *Análise de Riscos e Vulnerabilidade
Climáticas* — produced by WayCarbon, ICLEI, Ludovino Lopes and Ecofinance for
the municipality, financed by the World Bank.

It is the only official source that covers **heat** in Porto Alegre. SGB/CPRM is
a geological service: it maps landslides and floods and nothing thermal. So if
we want a municipal heat-risk layer, the ARVC is where it lives.

The problem: the ARVC results were published **only as map figures inside a
201-page PDF**. The underlying rasters live in WayCarbon's proprietary MOVE
platform and were never released. DataPOA's open-data portal has 56 datasets and
none of them are risk layers; SMAMUS publishes shapefiles for APP, AEIS and
bairros but nothing climatic.

This document describes how those figures were turned back into data, how
accurate the result is, and — importantly — what it may not be used for.

---

## TL;DR

| | |
|---|---|
| **What we produced** | Six climate-risk surfaces (flood, landslide, heat, drought, arbovirus vectors, storms), 2050 horizon, on a shared 250 m grid |
| **Georeferencing error** | ≤ 16 m (about half a pixel), fitted from each figure's own printed graticule |
| **Value accuracy** | 98% of pixels within one named risk class; mean error ~6% of the range |
| **Status** | ⚠️ **Reconstruction, not the official dataset.** Fine for screening and comparison. Not citable as "the ARVC says X". |
| **Regenerate** | `python3 scripts/extract-arvc-figures.py && python3 scripts/combine-arvc-grid.py` |

---

## Why this was tractable at all

The usual objection to digitising a map from a PDF is that georeferencing is
guesswork. Here it isn't, for one reason: **every ARVC figure carries a printed
coordinate graticule**, labelled every 5 km, and states its CRS in the margin —
`SRC: SIRGAS 2000, Elipsoide: GRS 1980`, which for Porto Alegre is UTM zone 22S,
**EPSG:31982**.

That turns georeferencing from an eyeballing exercise into a least-squares fit
with checkable residuals.

```
Risco - Ondas de Calor - 2050
6685000 ─┐
6680000 ─┤     ← printed tick labels give exact control points
6675000 ─┤
         └──┬──────┬──────┬──
         470000 475000 480000
```

## The method

### 1. Extract the figure at native resolution

`pdfimages` pulls the embedded raster (~1213 × 1758 px). Rendering the *page* at
higher DPI gains nothing — it just upsamples the same pixels.

### 2. Fit the affine from the graticule

The tick labels are baked into the raster, not the PDF text layer, and there is
no OCR in this pipeline. Instead:

1. Find the map frame (the long dark rows/columns).
2. Find the axis-label text blocks in the strips just outside the frame. They
   are uniform in size and evenly spaced, so their centres are the tick
   positions.
3. Take the **longest evenly-spaced run** of those centres — see the bug note
   below on why "longest" matters.
4. Spacing → scale. Each tick is 5 km, so `m/px = 5000 / px_per_tick`.
5. Solve the absolute offset by projecting the official municipal boundary
   through each candidate origin and scoring how many of its vertices land on a
   dark pixel — i.e. on the outline the figure actually draws.

Result for the heat figure: **33.25 m/px east, 29.90 m/px north, max residual
14.3 m**. Note that east and north scales differ by ~11% — the image was placed
in the PDF with a non-uniform aspect. An affine handles that exactly; assuming a
square pixel would not.

### 3. Verify the fit independently

Project the official municipal boundary (`porto-alegre-boundary.json`) onto the
figure and look at it. It traces the drawn coastline exactly — every inlet, the
Ilha da Pintada archipelago, the southern peninsula.

Automated equivalent, run for every figure before its output is trusted:

- **outline-hit** — share of projected boundary vertices landing on a drawn dark
  pixel (~87% across all six)
- **data-inside** — share of pixels inside the boundary that are not the
  "Não se Aplica" grey (~99%)
- **grey-outside** — share of *Não se Aplica* pixels that fall outside the
  boundary (~99%). Grey is the neighbouring municipalities' land, so this one is
  genuinely discriminating.

### 4. Read the values back off the colours

The legend is a 10-step ColorBrewer **Reds** ramp with five printed labels
(*Muito Baixa* … *Muito Alta*) sitting on alternate steps — so each named class
spans two ramp steps. The exact swatch RGBs are sampled from the figure's own
legend bar, not assumed.

Four further categories are painted over the choropleth and are **not** risk
values: *Não se Aplica*, *Água*, *Parques•Praças•UCs*, *Áreas Verdes*. These
decode to null. A cell the ARVC masked out is **not** low risk — it was excluded
at source.

### 5. Aggregate to a 250 m grid

Each figure pixel is ~30 m; a 250 m cell averages ~62 of them. The grid matches
the one `poa_flood_risk` / `poa_heat_risk` already use, so ARVC surfaces sit
directly comparable beside our own.

All six hazards share one grid with stable cell ids, so the payload is one
geometry file plus six `{cellId: value}` maps — ~890 KB for all six, versus
~5.3 MB if each were a self-contained GeoJSON (this server has no gzip
middleware).

---

## Why *not* census sectors

The first version of this pipeline recovered onto IBGE 2010 census sectors, on
the assumption that the ARVC was a choropleth over them. **The data rejected
that.** Colour purity inside a sector averaged only 50% — the published map
varies *within* sectors. Zooming to native resolution shows block-and-street
texture, and the report itself says the index was built by map algebra on
rasters:

> Todas as variáveis explicativas selecionadas para construção do Índice de
> Risco foram georreferenciadas, além de convertidas para o formato raster
> (*.tif) […] e reescalonadas (escaladas de 0 a 1)

Elsewhere it cites 30 × 30 m. Our fitted pixel is 33 × 30 m, so the figure is
essentially at the source raster's own resolution. Census sectors were never the
mapping unit — a grid is the honest target.

---

## How accurate is it

Re-rendering the recovered grid pixel-aligned against the published figure, over
125,233 comparable pixels on the heat map:

| Agreement | |
|---|---|
| Exact ramp step (1 of 10) | 54.9% |
| Within 1 step | 91.7% |
| **Within 2 steps (= 1 named class)** | **98.3%** |
| Mean absolute error | 0.56 of 9 steps (~6% of range) |

### An independent check

Figure 44 of the report publishes WayCarbon's own list of *bairros mais
críticos* for heat in 2050. Our top four bairros by recovered mean — **Vila São
José, Bom Jesus, Vila João Pessoa, Vila Jardim** — are all on that list, and 10
of their 11 appear in our ranking of 93.

Median rank of their eleven is 23 of 93, not 5, and that is expected: their
selection is a contiguous eastern cluster, not a pure mean ranking. *Jardim do
Salso* is visibly pale in their own figure yet included. So treat the **values**
as validated and their **bairro selection** as answering a different question.

---

## What this may not be used for

The output is a reconstruction. We read numbers off a picture.

- ✅ Prioritisation and screening
- ✅ Comparing against our own H×E×V layers
- ✅ Showing an organisation the shape of municipal risk in their territory
- ❌ **Citing to a funder as "the ARVC says X"** — that attributes to WayCarbon
  and ICLEI a number we inferred
- ❌ Any use where being one class out changes a decision irreversibly

Every payload carries a `provenance.headline` saying so, `shared/arvc.ts`
exports `ARVC_DERIVED_NOTE`, and the site-explorer tooltip repeats it on every
hover. Keep it that way.

To get the real thing, the municipal technical meeting is still the route — the
ask is now specific: **the ARVC rasters, and the PMRR subsector geometry.**

---

## A finding worth knowing: ARVC and our own layer disagree

Sampling the recovered ARVC heat risk and our `poa_heat_risk` onto the same
250 m cells:

- Spearman ρ = **+0.34**
- Top-decile agreement = **7%** — i.e. at chance

They agree that the built-up north is hotter than the rural south. They do not
agree on where the worst places are.

That is not necessarily an error in either. The ARVC builds heat vulnerability
from *déficit habitacional*, *população idosa* and *área impermeável* against
*renda média*, *áreas verdes* and *acesso à água*, and projects to 2050. Ours is
present-day H×E×V on different inputs, and is visibly smoother — consistent with
what `shared/site-knowledge.ts` already documents, that two of the three factors
in every risk score are bairro constants.

**Practical consequence:** if an organisation picks a site using our map and a
funder checks it against the municipal plan, the two will rank it differently.
Decide deliberately which one anchors the conversation.

This is one comparison and should be treated as provisional — we have not
isolated how much of the gap is the 2050 horizon versus the different inputs.

---

## Two bugs, and what they teach

Both were caught by checks, not by looking at output that seemed fine.

**1. A QA metric that measured nothing.** The first verification asked "what
fraction of everything outside the boundary is grey?". Most of "outside" is the
Guaíba and the white page margin, so the answer was ~28% for a *correct* fit,
and all six figures were flagged. Replaced with "what fraction of grey pixels
fall outside the boundary" — grey is specifically other municipalities' land,
which makes it discriminating. A check that fails on known-good input is worse
than no check: it trains you to ignore it.

**2. A tick anchor that silently shifted.** The evenly-spaced-run finder always
started at index 0. On the flood figure a stray text block in the left margin
came first, so the whole anchor moved: the municipality landed kilometres south
and 93% of cells pinned to 0.0. Fixed by searching every starting index. The
*scale* was never wrong — the flood figure is simply rendered smaller (1155 vs
1213 px for the same extent), so 34.9 m/px is correct for it.

The flood layer legitimately has fewer cells than the others (1,271 vs ~3,070):
that figure masks far more of the city as *áreas verdes*.

---

## Files

| Path | What |
|---|---|
| `scripts/extract-arvc-figures.py` | Per-figure georeferencing, palette matching, QA gate |
| `scripts/combine-arvc-grid.py` | Merges the six onto one shared grid |
| `knowledge/official-risk/porto-alegre/arvc-poa.json` | The committed payload |
| `shared/arvc.ts` | Types, ramp, class mapping, the derived-data notes |
| `server/routes/officialRiskRoutes.ts` | Serves it at `/api/official-risk/arvc-poa` |

## Source

*P3 — Análise de Riscos e Vulnerabilidade Climáticas*, Plano de Ação Climática
de Porto Alegre (2023). WayCarbon, ICLEI, Ludovino Lopes Advogados, Ecofinance.
[PDF](https://prefeitura.poa.br/sites/default/files/usu_doc/sites/smamus/PMPOA23A_231116_P3_Relatorio_ARVC_V2.0_logos%20(1).pdf)
