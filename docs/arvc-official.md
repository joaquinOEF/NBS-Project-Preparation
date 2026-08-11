# The official ARVC rasters

On **2026-08-11** SMAMUS sent the source rasters behind the climate risk analysis
in Porto Alegre's Plano de Ação Climática. This documents what arrived, what we
did with it, and — the part worth your time — **how it compares to the layers the
CBO flow and the orchestrator view use today**.

Nothing in this change touches those two surfaces. The official layers are Site
Explorer reference layers, added so we can look before deciding what to promote.

---

## What arrived

62 GeoTIFFs, `float32`, continuous 0–1, **29.13 m**, **EPSG:31997**.

Two things in that line are worth pausing on:

- The report's prose says SIRGAS 2000; the files are **SIRGAS 1995** (31997, not
  31982). The realisations differ by centimetres, so nothing downstream changes,
  but the `.prj` is the authority and our request email had assumed 31982.
- The ISO 19115 sidecars declare EPSG:4326 while the rasters are projected. The
  raster wins; the metadata field is wrong.

| what | count | note |
|---|---|---|
| Threat (ameaça) | 18 | 6 hazards × 3 periods |
| Risk (risco) | 18 | 6 hazards × 3 periods |
| Vulnerability | 6 | one per hazard, **no period** — it is static |
| Exposure | 2 | total population, black population — **no hazard dimension** |
| 4º Distrito clips (`_bC`) | 18 | same data, smaller window — we ignore these |

**We got more than the report published.** The report presents ameaça for drought,
arbovirus and storm only as tables, and our request email asked whether those
existed spatially at all. They do — all three are here as rasters, for all three
periods. We also received the historical (1995–2014) and 2030 windows, where the
main report publishes only 2050.

We reproduced their own method as a check: `R = ∛(A × E × V)` regenerates the
delivered risk rasters to a **mean absolute error of 0.0035 (r = 0.997)**. The
components and the composite are mutually consistent.

---

## How they compare to what we use now

Run it yourself:

```bash
.venv-geo/bin/python scripts/compare-arvc-sources.py
```

Comparison is done **per bairro**, because that is the granularity the product
actually uses — the CBO flow and orchestrator read `meanFlood`/`meanHeat`/
`meanLandslide` off `porto-alegre-neighborhood-zones.json` and rank on them. A
cell-level correlation would answer a question nobody asks.

### The headline

| layer | our column nonzero | Spearman ρ (area-weighted) | top-15 bairro overlap |
|---|---|---|---|
| heat hazard | 94/94 | **0.69** | 8/15 |
| heat risk | 94/94 | **0.69** | 6/15 |
| flood hazard | 53/94 | 0.15 | 4/15 |
| landslide hazard | 35/94 | 0.15 | 2/15 |
| flood risk | 50/94 | −0.01 | 2/15 |
| landslide risk | 32/94 | −0.02 | 1/15 |

**Heat is where the two sources broadly agree.** Everything else barely
correlates — but read the first column before concluding we are wrong.

### Why the flood and landslide rows mean less than they look

Our flood risk is **zero in 44 of 94 bairros** and our landslide risk is **zero in
62 of 94**. The official layers score essentially every populated cell. So the low
correlation is not two methods disagreeing about the same quantity; it is largely
**our layers declining to answer** across most of the city.

There is a second trap here, and it inverted a conclusion during this analysis.
The official flood raster is masked to the floodplain, so its zonal mean answers
*"how bad is it where it floods"*, while our column answers *"how much flood risk
does this bairro carry"*. Comparing those two directly produced a spurious
**ρ = −0.50** — a headline that would have read "our flood ranking is backwards".
Area-weighting both sides moves it to ≈ 0. The script now reports both, labelled.

### Flood: the two sources model different mechanisms

Ours puts **Arquipélago, Farrapos, Humaitá, Floresta** at the top. Theirs puts
**Auxiliadora, Jardim Botânico, Cidade Baixa, Jardim Itu**. Almost disjoint.

Neither is wrong. ARVC models **inundação fluvial** — arroio and river flooding.
The May 2024 catastrophe was the Guaíba rising, which is a different mechanism.
Checked against the observed 2024 extent already in the repo
(`porto-alegre-flood-2024.json`, Planet SkySat, 2024-05-06), clipped to the
municipality:

- **58.6%** of what actually flooded is inside ARVC's fluvial-flood layer
- **41.4%** of the observed event lies **outside** it — largely the Guaíba margin

*(Do this clip properly. Against the raw raster window — which is a bounding box
covering Canoas and Eldorado do Sul — the same calculation returns 16%, because it
counts flooding outside Porto Alegre against a Porto Alegre-only layer.)*

**Consequence:** swapping our flood layer for theirs would lose most of the 2024
signal. If we ever integrate ARVC flood, it belongs *alongside* ours, labelled as
fluvial, not as a replacement.

### The official risk composites barely distinguish one hazard from another

Cross-correlation of the six official risk surfaces across the 94 bairros:

|  | flood | landsl | heat | storm | drought | arbo |
|---|---|---|---|---|---|---|
| **flood** | 1.00 | 0.82 | 0.84 | 0.85 | 0.77 | 0.91 |
| **landslide** | 0.82 | 1.00 | 0.84 | **0.96** | 0.87 | 0.84 |
| **heat** | 0.84 | 0.84 | 1.00 | 0.85 | 0.81 | 0.82 |
| **storm** | 0.85 | 0.96 | 0.85 | 1.00 | 0.88 | 0.87 |
| **drought** | 0.77 | 0.87 | 0.81 | 0.88 | 1.00 | 0.80 |
| **arbovirus** | 0.91 | 0.84 | 0.82 | 0.87 | 0.80 | 1.00 |

Mean off-diagonal **0.85**; landslide↔storm **0.96**.

Exposure is one shared surface across all six hazards and vulnerability is static,
so `∛(A × E × V)` is dominated by the two terms every hazard has in common. The
hazard term is barely moving the ranking. **Practical reading: the official "risk"
maps are close to a single social-vulnerability map re-coloured six times.** Where
we need to tell hazards apart — which is the whole basis of recommending an
intervention type — the official *ameaça* layers are more informative than the
official *risco* layers.

This is visible without any statistics: put official heat risk and official
landslide risk side by side and they are nearly the same picture.

**One correction to carry forward.** PR #451 states that our own layers are
similarly exposure×vulnerability-dominated, at 0.82. That number came from the PDF
reconstruction, before this data existed. Measured now at bairro level, our three
composites are *not* comparable on this axis — two of the three are zero across
most of the city, which makes the correlation meaningless rather than low. The
claim needs re-deriving against the catalog cells before it is repeated.

### Footprint

Official risk rasters are masked to populated cells (~19% of the raster window;
flood 7.5%). Ours are computed across the whole municipal window. So in our
layers *"no risk"* and *"nobody lives here"* are the same colour, and in theirs
they are different — one of the concrete reasons the rasters are better than the
figures, and the reason our overlays extend visibly into Canoas and Viamão while
theirs stop at the municipal line.

---

## How the layers are built and served

```bash
.venv-geo/bin/python scripts/build-arvc-official.py
```

One **8-bit paletted PNG per layer** in EPSG:3857, in `client/public/arvc-official/`,
drawn with `L.imageOverlay`. 44 layers, 5.7 MB total, largest 356 KB.

Design notes, each of which was forced by something concrete:

- **Image overlay, not a tile pyramid.** Porto Alegre fits in one ~350 KB image at
  full 29 m detail. A pyramid would be thousands of files for no visible gain.
- **Paletted, not RGBA.** This repo's `CLAUDE.md` records PNGs over ~500 KB causing
  `git push` to fail with HTTP 400; RGBA put the largest layer at 648 KB. Indexed
  colour also makes the pixel *be* the value.
- **No separate values file.** `value = paletteIndex / 254`, index 255 = nodata. A
  parallel JSON would have cost ~4 MB and been one more artifact to keep in step.
- **Their palettes, not ours.** Read from the `.qml` files shipped with the
  rasters, so a screenshot from the explorer is recognisably the same map as the
  one printed in the plan. Note the threat ramp runs teal (low) → olive (high),
  the opposite polarity to everything else in this app. That is theirs.

### Validation gates

Both run over all 44 layers and both pass:

1. **Encoding** — decode the shipped PNG, compare to the warp that produced it.
   Worst error **0.001969**, exactly half the 1/254 quantisation step. Footprints
   match pixel-for-pixel.
2. **Fidelity** — warped mean vs source mean. Worst difference **0.000144**.

### The one thing the PNG cannot do

A browser canvas returns expanded RGBA, not palette indices, so client-side
readout has to invert colour → value. That inversion is **not unique at the top of
the scale**: WayCarbon's ramps define no stop above 0.8, so ~51 of the 255 indices
share one colour. This is faithful to the published legend, where `[0.8:1.0]` is a
single class.

`decodeArvcFromRgb` therefore returns the *interval* a colour is consistent with,
and the tooltip renders `índice ≈ 0.63` where the ramp is injective and
`índice ≥ 0.80` where it is not — rather than inventing precision the official
palette never carried.

---

## What the reconstruction got right, and wrong

`shared/arvc.ts` holds the surfaces recovered by colour-matching the PDF figures
before this data existed. It stays, so the homework is checkable. Measured against
the official rasters on the same 250 m grid:

| hazard | r | slope | within one class |
|---|---|---|---|
| heat | 0.90 | 0.85 | 99.3% |
| landslide | 0.90 | 0.86 | 99.6% |
| storm | 0.89 | 0.85 | 99.3% |
| drought | 0.90 | 0.84 | 99.9% |
| arbovirus | 0.86 | 0.81 | 99.8% |
| **flood** | **0.73** | 0.73 | 92.4% |

Two systematic errors, both now written into the `pdf-to-geojson` skill:

1. **Range compression.** Every hazard came back at ≈ 0.85 × official. Recovering
   a value from a discrete colour bin biases toward the bin's interior, and the
   error compounds at the ends of the ramp.
2. **The pale end is lost.** Flood is the outlier because we recovered only 1,259
   of the 2,001 cells the official raster scores — **37% of the flood footprint
   missing**. The lightest ramp steps are the ones that get confused with page
   background, and a sparse layer is mostly lightest steps.

For screening, "99% within one named class" held up. For anything citable, it did
not — which is exactly why the rasters were worth asking for.

---

## Provenance

Plano de Ação Climática de Porto Alegre (PLAC), produto **P3 — Análise de Riscos e
Vulnerabilidades Climáticas** (2023). Prepared by **WayCarbon** with **ICLEI
América do Sul**, **Ludovino Lopes Advogados** and **Ecofinance**, for the
Prefeitura Municipal de Porto Alegre and the **Banco Mundial**. Climate input from
ESGF (CMIP6, SSP3-7.0); socioeconomic input from IBGE.

Rasters supplied by **SMAMUS** on 2026-08-11 following the COUGAR meeting of
2026-08-10. Attribution is carried in `manifest.json`, in `ARVC_OFFICIAL_NOTE`,
and in every layer tooltip.
