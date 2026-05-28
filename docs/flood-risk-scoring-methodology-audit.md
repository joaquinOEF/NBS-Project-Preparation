# Flood risk scoring methodology audit

**Jira:** [ON-5679](https://openearth.atlassian.net/browse/ON-5679) (audit) · follow-on [ON-5680](https://openearth.atlassian.net/browse/ON-5680) (methodology)  
**Parent report:** [`data-risk-audit.md`](data-risk-audit.md) — data inventory (§2), cross-cutting risks (§3–§4), offline vs live (§5)  
**Product narrative:** [`flood-risk-scoring-methodology.md`](flood-risk-scoring-methodology.md) (v3 overview; some constants differ — noted below)  
**Related audits:** [`heat-risk-scoring-methodology-audit.md`](heat-risk-scoring-methodology-audit.md) · [`landslide-risk-scoring-methodology-audit.md`](landslide-risk-scoring-methodology-audit.md) · [index](risk-scoring-methodology-audit.md)  
**Status:** Draft — product/metric tables (§3–§4), maturity & roadmap (§8–§10), F1 critique (§7); metric refresh and formal citations deferred to ON-5680.

**How to use this doc:** Review **§3** (upstream products) and **§4** (metrics / score terms) row by row. **§2** is the composite formula; **§7** critiques May 2024 F1; **§8–§10** define appropriate use today, validation experiments, and strengthening paths (external validated hazard products + local validation).

---

## 1. Scope and references

**Goal (ON-5679 task 3):** Document the **canonical offline** flood scoring used in the shipped sample grid: upstream products, per-cell metrics, transforms, weights, hardcoded parameters, and methodology risks.

| Item | Value |
|------|--------|
| **Canonical scorer (offline)** | `scripts/recalc-scores-v3.ts` L94–142 — writes `flood_score` to `client/public/sample-data/porto-alegre-grid-250m.json` |
| **Grid builder** | `scripts/generate-grid-250m.ts` — samples rasters, inherits 1 km metrics, sets `in_flood_2024` |
| **Metric lineage (inventory)** | [`data-risk-audit.md` §2.2](data-risk-audit.md#22-per-cell-metrics-split-from-grid_metrics_) |
| **Live API path** | `server/services/gridService.ts` `computeCompositeScores` (~L429–445) — **different formula**; Site Explorer sample mode uses offline JSON |
| **Offline vs live diff** | [`data-risk-audit.md` §5](data-risk-audit.md#5-offline-sample-pipeline-vs-live-gridservice--diff-and-recommendation) |
| **Event portability note (`floodEvidence`)** | **§2.4** |
| **Appropriate use today (screening vs formal decisions)** | **§2.5** |
| **Hazard vs IPCC risk terminology** | **§2.6** |
| **Validation critique (F1 context + leakage risks)** | **§7** |
| **Maturity / official-use bar** | **§8** |
| **Minimum pre-presentation experiments** | **§9** |
| **Independent validation benchmarks** | **§9.0** |
| **Recommended path: external hazard products + local validation** | **§10** |
| **Validation threshold** | `FLOOD_THRESHOLD = 0.45` in `recalc-scores-v3.ts` L52 (F1 console only) |

**Audit legend:** **Justified (POC)** = stated intent in code/comments; **No source** = tuning without citation; **Doc drift** = mismatch vs `flood-risk-scoring-methodology.md`. Severity: **L** / **M** / **H** (impact on decisions if unmitigated).

---

## 2. Score model summary (`flood_score`)

**Role in product:** Primary blue risk layer on 250 m grid / pre-rendered tiles.

### 2.1 Primary path (HAND and/or FRI present)

`recalc-scores-v3.ts` L119–128:

```
handRisk      = hand_m != null ? clamp01(exp(-hand_m / 8)) : 0.3
friNorm       = clamp01(fri_raw / friMax)    // friMax = city max(fri_raw); see §3.1 — redundant vs FRI already ∈ [0,1]
floodEvidence = flood_depth_2024_cm != null ? clamp01(flood_depth_2024_cm / 150) : 0
lakesideRisk  = f(lng)                       // POA lake mask
deltaRisk     = f(lat, lng)                  // POA delta mask
runoffPotential = 1 - (soil_permeability ?? 0.5)
soilAmplifier = 1 + runoffPotential × 0.15

flood_score = clamp01((0.35×handRisk + 0.25×(friNorm ?? handRisk) + 0.15×floodEvidence
                        + 0.10×lakesideRisk + 0.10×deltaRisk + 0.05×runoffPotential)
                       × soilAmplifier)
```

### 2.2 Fallback path (no HAND and no FRI)

L129–134: weighted `river_prox_pct`, `low_lying_pct`, `flow_accum_pct`, `depression_pct`, flatness from `slope_mean`; combined with `max(physical, location×0.7)`, `location = 0.5×lakeside + 0.5×delta`.

### 2.3 Post-rules

- **Dynamic World** (L137–139): open water (`dw_class=0`), no HAND/FRI, low lakeside/river proximity → cap **0.15**.
- **Details per product and metric:** §3–§4 below.

### 2.4 Event-specific vs transferable components

Not all terms in §2.1 are **prospective susceptibility**. 

Some bake in **May 2024 Rio Grande do Sul** observations:

| Component | Transferable to another city/event? | Why |
|-----------|-------------------------------------|-----|
| `handRisk` (HAND) | **Yes** (with usual DEM/hydro caveats) | Static terrain / drainage proxy |
| `friNorm` (FRI 2024) | **Partial** — needs new FRI layer per year/scenario | Annual climate screen, not event hydrology |
| **`floodEvidence` (EMSN194 depth)** | **No** — without replacing the input | **Observed max water depth from the May 2024 disaster** (`flood_depth_2024_cm`, tile `flood_depth_2024`). Where depth > 0, score is **boosted**; where null, term = 0. This is **post-event evidence**, not a generic “standard of floodable zones.” |
| `lakesideRisk`, `deltaRisk` | **No** — POA constants only | Hardcoded geography |
| `runoffPotential` / soil | **Mostly yes** | SoilGrids-based; coverage gaps |

**What `floodEvidence` is in practice:** a **retrospective calibration term** — “Copernicus mapped standing water / depth here during this event.” It helps the POC align the map with where flooding **was observed** in May 2024. It is **not** a forward-looking inundation standard (that role belongs to HAND, low-lying proxies, FRI screening, etc.).

**Portability implication:** For another flood event, another city, or operational forecasting you must either:

**(a)** omit `floodEvidence` (set to 0 / drop the term), 
**(b)** swap in a new EMS or observed-depth layer for that event, or 
**(c)** relabel the product as “2024 event-informed susceptibility map,” not a reusable flood model.

### 2.5 Intended use today (screening vs formal decisions)

| Use case | Appropriate **today**? | Notes |
|----------|------------------------|-------|
| **Urban screening & prioritization** (hotspots, NBS siting workshops, internal OEF demos) | **Yes** — with disclosed limits | High-recall `flood_score` map is fit for “where to look first,” not “where to invest with legal weight.” |
| **Formal municipal investment / regulation / certified risk assessment** | **No** | Not independently validated; **15%** event depth in score ([§2.4](#24-event-specific-vs-transferable-components)); mixed effective resolution ([data-risk-audit §3](data-risk-audit.md#3-per-layer-risk-register)); no published uncertainty bands. |
| **Operational forecasting for a new event** | **No** | Requires `floodEvidence`-off or new depth layer + non-annual drivers. |

Full maturity bar and GFDRR-aligned path: **§8**. Minimum experiments before an official city presentation: **§9**.

### 2.6 Terminology: flood hazard vs IPCC flood risk

| IPCC-style term | Typical meaning | In this POC? |
|-----------------|-----------------|--------------|
| **Hazard** | Physical characteristics of the event (e.g. flood depth, extent, probability) | **Partially** — `flood_score`, FRI, HAND map **where flooding is more likely / occurred**, without a full probability model |
| **Exposure** | People, assets, infrastructure in hazard zones | **Not in score** — WorldPop, buildings, OSM layers exist elsewhere in the app, not multiplied into `flood_score` |
| **Vulnerability** | Susceptibility of exposed elements to harm | **Not in score** — no social, economic, or structural vulnerability index in the formula |

Official **flood risk** in the IPCC sense is closer to **Hazard × Exposure × Vulnerability** (often with capacity or response terms). What OEF ships here is better described as:

- **`flood_score`:** composite **flood hazard / inundation susceptibility** index (HAND + climate screen + event depth + POA geography).
- **OEF FRI:** **flood hazard screening** index (extreme rain + terrain), not a full risk metric.
- **Tiles / UI label `flood_risk`:** **Legacy naming** — audit recommends saying **“flood hazard map”** or **“inundation susceptibility (screening)”** in city-facing materials unless/until exposure and vulnerability are integrated.

**Why it matters:** Calling the layer “risk” without **E** and **V** can overstate alignment with municipal **risk assessments**, insurance, or IPCC reporting. Screening and prioritization ([§2.5](#25-intended-use-today-screening-vs-formal-decisions)) remain valid; the vocabulary should match the science.

---

## 3. Upstream products used in flood scoring

Each row is one **dataset or derived product** the offline pipeline feeds into `flood_score` (or fallback). Inventory IDs match [`data-risk-audit.md` §2.1](data-risk-audit.md#21-master-inventory-table).

| Inventory ID | Product | What it represents | Native resolution | How POC ingests | Role in flood model | Methodology / data risk | Sev | Show-to-city gate |
|--------------|---------|-------------------|-----------------|-----------------|---------------------|-------------------------|-----|-------------------|
| `oef_merit_hydro` (HAND) | MERIT Hydro HAND | Height above nearest drainage (m) | ~90 m | `generate-grid-250m.ts` z=13 centroid → `hand_m` | **Primary driver** — `handRisk` **35%**; exp(−HAND/8) | Strong hydrology concept; decay scale **8 m** and weight **No source**. Best sub-km flood driver in composite. | **L–M** | OK as main physical susceptibility layer; cite HAND literature (ON-5680). |
| `oef_fri_2024` | OEF Flood Risk Index 2024 | In-house **hazard screening** index (misnamed “risk” — [§2.6](#26-terminology-flood-hazard-vs-ipcc-flood-risk)): `clip(0.4×RX1n + 0.4×RX5n + 0.2×ElevRisk) × slope_penalty`, output band **`FRI_0_1`** already ∈ **[0, 1]** ([`basic_floods_model.ipynb`](../../CCRADiscovery/floods/basic_floods_model.ipynb)). RX1/RX5 = CHIRPS **annual** 2024, **polygon min–max** normalized—not per-grid climatology ([§3.1](#31-oef-fri--normalization-and-naming-product-detail)). | **~5.5 km** (CHIRPS 0.05°) | z=13 sample → `fri_raw`; scorer applies **redundant** `friNorm = fri_raw / friMax` ([§3.1](#31-oef-fri--normalization-and-naming-product-detail)) | **25%** as `friNorm`; falls back to `handRisk` if FRI null | **Not a flood model.** **Double normalization:** product already 0–1; city `friMax` rescale is unnecessary and AOI-dependent. Annual vs May 2024 label. Monthly FRI exists but **not used**. | **H** (method) **M** (data) | **Hazard screening only**; not IPCC risk. Do not claim “OEF flood model” or May 2024 forcing. |
| `oef_emsn194` | Copernicus EMSN194 max water depth | **Observed** max water depth during **May 2024** RS floods (cm) — disaster-specific EMS product | ~10–30 m | z=13 sample → `flood_depth_2024_cm` | **15%** `floodEvidence` | **Event input, not susceptibility standard.** Boosts score where depth was mapped for **this** event; dry cells → 0. Same disaster family as SkySat label → F1 leakage ([§7](#7-flood-validation-critique-f1--70)). **Model not portable** to other events without new depth layer or setting term to 0 ([§2.4](#24-event-specific-vs-transferable-components)). | **H** (portability) **M** (validation) | Do not call transferable “flood model.” For other events: drop term or replace EMS layer. Exclude from independent F1 runs. |
| SoilGrids (local JSON) | ISRIC clay/sand | Soil texture → permeability proxy | 250 m lookup | `generate-grid-250m.ts` → `soil_permeability` | **5%** `runoffPotential` + **×(1+runoff×0.15)** amplifier | ~64% coverage; default **0.5** if missing. Permeability formula **No source**. | **M** | Do not over-interpret soil without coverage map. |
| `oef_dynamic_world` | Dynamic World v1 2023 | Land cover class 0–8 | ~10 m | z=13 → `dw_class`; may override `imperv_pct` in grid build | **Post-rule** only: suppress open-water false positives (cap 0.15) | Appropriate for water mask; not a flood driver. | **L** | — |
| `porto-alegre-rivers.json`, `porto-alegre-surface-water.json`, DEM contours, D8 (1 km grid) | OSM + Copernicus DEM + MERIT flow | River/water distance, low-lying rank, flow accumulation, depression, slope | Vectors / 1 km inherited | `generate-sample-grid.ts` → inherited to 250 m | **Fallback path only** when HAND & FRI both null (~3% cells) | **1 km block-constant** on 250 m geometry — no intra-km variation ([data-risk-audit §3](data-risk-audit.md#3-per-layer-risk-register)). | **M** | Fallback rarely used; do not cite as primary POA flood logic. |
| _(computed)_ | POA geography masks | Lake Guaíba west shore + delta confluence | City-specific constants | Cell `lng`, `lat` in `recalc-scores-v3.ts` L21–23, L111–114 | **10% + 10%** `lakesideRisk`, `deltaRisk` | Hardcoded boundaries **No source**; not transferable. | **H** (hardcoding) | POA-only; recalibrate for other cities. |
| `flood_2024_extent` | Planet SkySat inundation | Observed polygons 2024-05-06 | ~3 m | Turf point-in-polygon → `in_flood_2024` | **Validation label only** — not in score sum | Correct use as label; paired with leaky depth input in score. | **L** (as label) | See §7. |

---

## 4. Grid metrics and score terms

Each row is a **field on `properties.metrics`** or an **intermediate term** in `recalc-scores-v3.ts`. Link to §3 for product context.

| Key / term | Type | Source product(s) §3 | Computation (offline) | In `flood_score` | Live API | Audit note | Sev |
|------------|------|----------------------|-------------------------|------------------|----------|------------|-----|
| `hand_m` | input | MERIT HAND | `generate-grid-250m.ts` sample | → `handRisk` **35%** | Not used | Core physical signal | **L** |
| `handRisk` | intermediate | `hand_m` | `exp(−hand/8)` or **0.3** default | **0.35** × | — | Default 0.3 **No source** | **M** |
| `fri_raw` | input | OEF FRI 2024 (`FRI_0_1`) | z=13 sample | Should feed **25%** directly; today via `friNorm` | Not used | Already **[0, 1]** from data team; see [§3.1](#31-oef-fri--normalization-and-naming-product-detail) | **H** (upstream RX norm) **M** (scorer double-norm) |
| `friMax` | intermediate | All cells | `max(fri_raw)` city, min 0.01 | Used only for `friNorm` | — | **Unnecessary** — redundant with product scale; **remove** | **M** |
| `friNorm` | intermediate | `fri_raw`, `friMax` | `fri_raw / friMax` | **0.25** × (or `handRisk`) | — | **Unnecessary second normalization**; use `fri_raw` instead ([§3.1](#31-oef-fri--normalization-and-naming-product-detail)) | **M** |
| `flood_depth_2024_cm` | input | EMSN194 | z=13 sample if > 0 | → `floodEvidence` **15%** | Not used | **May 2024 event only**; variable name encodes year | **H** |
| `floodEvidence` | intermediate | depth | `clamp01(depth/150)` | **0.15** × | — | **Retrospective event evidence**, not generic floodable-zone standard. See [§2.4](#24-event-specific-vs-transferable-components). Cap **150** vs doc **100** — reconcile ON-5680 ([§8.2](#82-bar-for-formal--official-city-use)) | **H** |
| `lakesideRisk` | intermediate | POA mask | `lng > −51.23`, /0.10° | **0.10** × | Not used | City-specific | **H** |
| `deltaRisk` | intermediate | POA mask | dist to (−30.05, −51.22), /20 km | **0.10** × | Not used | City-specific | **H** |
| `soil_permeability` | input | SoilGrids | sand-based formula in grid script | → runoff + amplifier | Not used | Defaults, coverage gaps | **M** |
| `runoffPotential` | intermediate | soil | `1 − permeability` | **0.05** × | Not used | — | **M** |
| `soilAmplifier` | intermediate | runoff | `1 + runoff×0.15` | Multiplies sum | Not used | **No source** | **M** |
| `river_prox_pct`, `low_lying_pct`, `flow_accum_pct`, `depression_pct`, `slope_mean` | input | OSM / DEM / D8 | 1 km grid → inherit | Fallback weights only | Partial (river, low_lying, imperv) | 1 km inherit artefact | **M** |
| `dw_class` | input | Dynamic World | z=13 sample | Water cap rule | Not used | — | **L** |
| `lng`, `lat` | geometry | Cell centroid | Grid properties | POA masks | Yes | — | — |
| `flood_score` | **output** | Composite §2 | L94–142 | Primary layer | Simplified formula L442 | Large offline/live gap ([§6](#6-live-api-divergence)) | **M** |
| `in_flood_2024` | **label** | SkySat | point-in-polygon | **Not in score** | Not computed | F1 ground truth §7 | — |

**Composite weights (primary path):** 0.35 / 0.25 / 0.15 / 0.10 / 0.10 / 0.05 — all **No source** in repo (POA tuning, `recalc-scores-v3.ts` L121–127).

---

## 5. Hardcoded parameters

### Disclaimer — weight tuning and fallback path

The **v3 flood composite** ([§2](#2-flood_score-v3-model)) was built as a **POC screening index**, not from a peer-reviewed hazard model fitted to Porto Alegre gauges, hydraulic simulations, or a published weighting scheme. 

The **primary-path weights** (e.g. HAND **35%**, FRI **25%**, depth evidence **15%**) reflect **subjective importance** assigned during iteration—analogous to “HAND and FRI matter most”—rather than coefficients estimated from data with documented uncertainty.

**Fallback physical weights** (`0.30 / 0.25 / 0.20 / 0.15 / 0.10` on `river_prox_pct`, `low_lying_pct`, `flow_accum_pct`, `depression_pct`, flatness in `recalc-scores-v3.ts` L132) are **especially difficult to justify scientifically**:

- They apply only when **both HAND and FRI are missing** (~3% of cells) but encode the same **informal** logic: river proximity and low terrain ranked above flow accumulation, depression, and flatness.
- There is **no calibration study**, sensitivity analysis in repo, or literature citation tying this vector to flood depth, return period, or observed inundation.
- In practice the values were chosen **ad hoc** by relative perceived importance of factors—**not** derived from a formal methodology with traceable assumptions from the start.

The **official calculation narrative** published with the repo is [`docs/risk-scoring-methodology.md`](https://github.com/joaquinOEF/NBS-Project-Preparation/blob/main/docs/risk-scoring-methodology.md) on `main` (combined flood/heat/landslide). This audit’s flood-specific product doc is [`flood-risk-scoring-methodology.md`](flood-risk-scoring-methodology.md). Neither document provides peer-reviewed justification for the numeric weights; they describe **what** is computed, not **why** each coefficient is defensible for official city use ([§8.2](#82-bar-for-formal--official-city-use)).

| Parameter | Value | Code ref | Justification / audit |
|-----------|-------|----------|------------------------|
| HAND decay scale | **8** m | L105 | **Justified (POC)** intent; scale **No source** |
| HAND missing default | **0.3** | L105 | **No source** |
| Primary weights | **0.35 / 0.25 / 0.15 / 0.10 / 0.10 / 0.05** | L121–127 | **No source** — subjective importance (HAND/FRI dominant); see disclaimer above |
| Flood depth cap | **150** cm | L108 | **Doc drift** — product doc uses **100** cm (`flood-risk-scoring-methodology.md`). **ON-5680:** pick one cap, document rationale (e.g. EMSN194 p95 in POA), align `recalc-scores-v3.ts` + product doc + §2.1 ([§8.2](#82-bar-for-formal--official-city-use)) |
| Lake boundary | **lng > −51.23** | L21, L111 | **No source** — POA |
| Lakeside decay | **0.10** ° lng | L111 | **No source** |
| Delta center | **(−30.05, −51.22)** | L22–23, L113 | **No source** |
| Delta decay | **20** km | L114 | **No source** |
| Soil amplifier | **×(1 + runoff×0.15)** | L117, L128 | **No source** |
| Fallback physical weights | **0.30 / 0.25 / 0.20 / 0.15 / 0.10** | L132 | **No scientific basis** — ad hoc ranking (river > low-lying > flow > depression > flatness); see [disclaimer](#disclaimer--weight-tuning-and-fallback-path) |
| Fallback location mix | **0.50 / 0.50**, ×**0.7** | L133–134 | **No source** — same informal tuning; lakeside/delta only |
| Flatness divisor | **50** ° | L131 | **No source** |
| Open-water cap | **0.15** | L139 | **No source** |
| `friMax` floor | **0.01** | L39 | **No source**; **unnecessary** if scorer uses `fri_raw` ([§3.1](#31-oef-fri--normalization-and-naming-product-detail)) |
| Elevation / low_lying / soil defaults | **p25** / **0.5** / **0.5** | L32, L68, L74, L83 | **No source** |
| `FLOOD_THRESHOLD` | **0.45** | L52 | F1 console only; doc uses **0.40** |

---

## 6. Live API divergence

| Topic | Offline (`recalc-scores-v3.ts`) | Live (`gridService.ts` L442) |
|-------|--------------------------------|------------------------------|
| Formula | §2 — HAND, FRI, depth, POA, soil | `0.45×river + 0.20×low_lying + 0.20×imperv + 0.15×river` |
| Products used | §3 table (rasters + POA) | OSM proxies only |
| Validation | `in_flood_2024` F1 | None |

Site Explorer **sample mode** serves offline JSON — live path is not the shipped demo score.

---

## 7. Flood validation critique (F1 ≈ 70%)

**Purpose (ON-5679 task 5):** Critique reported flood validation—not pass/fail. **~70% F1** can be acceptable for an internal POC with high recall if limitations are disclosed; not sufficient alone for city investment claims.

**Source of metrics:** 
- [`flood-risk-scoring-methodology.md`](flood-risk-scoring-methodology.md) (F1 at **0.40**). 
- Script default **`FLOOD_THRESHOLD = 0.45`**. 

### 7.1 Critical evaluation

| Aspect | Evidence | Risk | Read | Gate |
|--------|----------|------|------|------|
| **F1 ~0.70** | At thresh 0.40 | — | Plausible POC screening; not certification | No “independently validated” without §7.4 |
| **Recall ~91%** | High | Many FP | Good for hotspot screening | FP disclaimer |
| **Precision ~57%** | Moderate | Sensitive score | Not investment ledger | Field review for sizing |
| **Threshold drift** | 0.40 vs 0.45 | Different F1 | Fix one reporting threshold | Publish sweep |
| **Depth / `floodEvidence` in score** | EMSN194 May 2024 | **High** — leakage + event calibration | Not portable; overstates fit to 2024 | Evidence-off runs; [§2.4](#24-event-specific-vs-transferable-components) |
| **FRI in score** | Annual RX | **M** — temporal mismatch | Not May 2024 forcing | FRI-off baseline; §3 FRI row |
| **Single event** | POA May 2024 | No hold-out | No transfer claim | Scope to one event |
| **No baselines** | — | — | Weak uplift story | HAND-only, FRI-only, FRI-off |

**Summary:** Main gaps: 
- **(1)** depth leakage / **event-tied `floodEvidence`**, 
- **(2)** score not portable to other events as-is, 
- **(3)** annual FRI vs May label, 
- **(4)** F1 threshold drift (0.40 vs 0.45), 
- **(5)** **`floodEvidence` depth cap drift** (150 vs 100 cm — §8.2), 
- **(6)** no baselines—not the raw F1 alone.

### 7.2 Threshold sensitivity

Sweep: **0.25–0.60** (`recalc-scores-v3.ts` L258–271). Align doc + script on one **F1 classification threshold** (0.40 vs 0.45); attach sweep when grid JSON available. *(Separate from `floodEvidence` depth cap 150 vs 100 cm — [§8.2](#82-bar-for-formal--official-city-use).)*

### 7.3 Re-validation protocol

| Step | Action |
|------|--------|
| 1 | Score **without** `flood_depth_2024_cm` when measuring F1 |
| 2 | Fix threshold policy (not post-hoc max F1) |
| 3 | Publish full P/R/F1 sweep |
| 4 | Baselines: HAND-only, **evidence-off** (no EMSN194), FRI-only, FRI-off, majority-class |
| 5 | Spatial hold-out / buffer match |
| 6 | Second event or city when available |
| 7 | **Reconcile `floodEvidence` depth cap:** code uses **150** cm (`recalc-scores-v3.ts` L108); product doc uses **100** cm. Choose one value, record justification (e.g. max or p95 EMSN194 depth in POA bbox), update script + [`flood-risk-scoring-methodology.md`](flood-risk-scoring-methodology.md) §2 formula + §5 table |
| 8 | Update [`flood-risk-scoring-methodology.md`](flood-risk-scoring-methodology.md) + this audit §2–§5 for any other drift found in steps 1–7 |

### 7.4 Show-to-city gates

| Claim | Allowed? | Condition |
|-------|----------|-----------|
| Calibrated to May 2024 flooding | **POC only** | Disclose depth leakage |
| F1 = 70% validated model | **No** | Independent test required |
| High-recall consistency with 2024 event | **Caution** | FP disclaimer |
| **Urban screening / prioritization tool** | **Yes** | With §2.5 limits, legend, and §8–§9 roadmap |
| Official validated model for formal city decisions | **No** | §8 bar not met |
| “Flood risk” in IPCC sense (H × E × V) | **No** | Hazard-only — [§2.6](#26-terminology-flood-hazard-vs-ipcc-flood-risk) |
| OEF FRI proves May 2024 drivers | **No** | §3 FRI row — screening only |
| Reusable flood model for any future event | **No** | **15%** `floodEvidence` is May 2024 EMS depth ([§2.4](#24-event-specific-vs-transferable-components)); POA masks §5 |
| Transferable to any city | **No** | §5 POA constants |

**Related register:** [`data-risk-audit.md`](data-risk-audit.md) §2.1 (`flood_2024_extent`), §3–§4.

---

## 8. Maturity, official-use bar, and policy framing

### 8.1 What the product is today

The shipped layer is **`flood_score` v3** (§2)—a **composite** of HAND, annual FRI screening, May 2024 depth evidence, POA masks, and soil—not the standalone OEF FRI raster alone. Claims in external meetings must specify which layer is shown.

**Appropriate framing (audit agrees):** present as an **urban flood screening and prioritization** tool—useful for workshops, hotspot discussion, and early NBS targeting in Porto Alegre, **not** as an officially validated municipal flood model for binding decisions.

**Not yet appropriate:** regulatory-grade investment, insurance-style loss estimation, or “certified” risk ratings without completing the bar in §8.2.

### 8.2 Bar for formal / official city use

Before treating outputs as decision-grade, the audit recommends closing these gaps (extends ON-5679 / ON-5680):

| Gap | Why it matters | POC status |
|-----|----------------|------------|
| **Technical documentation** | Traceability from product → metric → weight → code | This doc + §3–§4; peer citations still draft |
| **Resolution consistency** | 250 m geometry ≠ 1 km inherited exposure/terrain for some inputs | **Open** — [data-risk-audit §3](data-risk-audit.md#3-per-layer-risk-register) |
| **Out-of-sample performance** | Prove skill on held-out events, cities, or time windows | **Open** — only in-sample May 2024 F1 (§7), leaky |
| **Uncertainty & limits of use** | Bands, sensitivity, explicit “do not use for …” | **Open** — gates in §7.5 / §2.5 only |
| **Event-independent score variant** | `floodEvidence`-off (and documented POA recalibration) for portability | **Not shipped** — required for generic susceptibility claims |
| **`floodEvidence` depth cap (doc/code)** | `floodEvidence = clamp01(depth / CAP)` — **CAP = 150** cm in `recalc-scores-v3.ts` L108; **CAP = 100** cm in [`flood-risk-scoring-methodology.md`](flood-risk-scoring-methodology.md). Different CAP changes the 15% evidence term (e.g. 120 cm → 0.8 vs 1.0). Reproducibility and external review require one published value + rationale. | **Open** — **ON-5680:** (1) summarize EMSN194 depth distribution in POA; (2) pick 100 or 150 cm (or data-driven p95); (3) align script, product doc, §2.1/§5 here; (4) re-run grid if CAP changes materially |
| **Offline vs live parity** | One canonical formula in app | **Open** — §6 |

### 8.3 GFDRR / World Bank framing (screening ≠ final analysis)

GFDRR-style urban flood risk work typically expects explicit stages: **hazard modelling**, **exposure**, **intervention appraisal**, and **project governance**. World Bank guidance treats **screening** as an **early** step—not the terminal state of analysis.

**Audit read for this POC:**

| Stage | POC coverage | Gap |
|-------|--------------|-----|
| Hazard (where can it flood?) | **Partial** — `flood_score` hazard layer only | No full hydrodynamic model; pluvial/lake dynamics simplified |
| Exposure (what is at risk?) | **Not in score** | Population/assets in separate app layers, not integrated vulnerability |
| Intervention / benefit | **Not in score** | Out of scope for v3 raster |
| Governance / uncertainty | **Documentation only** | No quantified uncertainty surface |

**Implication for OEF flood mapping:** prioritize externally documented hazard products with local validation, and treat legacy `flood_score` as transitional until ON-5680 decides whether to deprecate it or keep it as a secondary analytic layer (§10).

### 8.4 IPCC “risk” vs what this POC computes

See [§2.6](#26-terminology-flood-hazard-vs-ipcc-flood-risk). For GFDRR/World Bank conversations: position **`flood_score`** as **hazard screening** that can **inform** a full risk assessment once exposure and vulnerability are integrated (population, critical facilities, social vulnerability)—not as a substitute for a completed IPCC-style risk study.

---

## 9. Minimum validation experiments (before official presentation)

Four experiments were proposed for maturity testing. Below: **audit mapping** to what the POC actually ships, and **pass/fail intuition** for official use.

**Important:** Experiments aimed only at **FRI** do not suffice for **`flood_score`** claims—the app layer is the composite (§2). Run variants for **FRI alone**, **`flood_score` as shipped**, and **`flood_score` evidence-off** (no EMSN194).

### 9.0 Benchmarks and observations for credible validation

For a **more defensible** validation of **`flood_score` v3** (or any replacement hazard layer), the audit recommends contrasting the map against **three classes of independent reference**—not only the in-sample May 2024 SkySat label (§7). These benchmarks inform experiments **§9.1–§9.2** and the product-selection/validation strategy in **§10**.

#### 9.0.1 Fluvial hazard maps (hydraulic benchmark)

**JRC / CEMS [GloFAS](https://www.globalfloods.eu/) flood hazard** layers represent **fluvial** inundation along the river network for multiple **return periods** (e.g. 10–500 years), produced with **LISFLOOD** and **LISFLOOD-FP** hydraulic modelling.

| Audit use | Notes |
|-----------|--------|
| **External hydrologic–hydraulic benchmark** | Resolution (~**90 m** in catalog) is far finer than legacy global screening products; still **static** and **fluvial-centric**. |
| **Does not replace local validation** | GloFAS does not capture all **pluvial**, **urban drainage**, or **Guaíba lakeshore** mechanisms active in Porto Alegre ([§3](#3-upstream-products-used-in-flood-scoring)). |
| **POC today** | **Not ingested** in `flood_score`; strong candidate for §9.1 rank-correlation vs `flood_score` hotspots. |

#### 9.0.2 Satellite flood observations (event library)

**Observed inundation** from satellites is the primary way to build a **multi-event library** and test whether **`flood_score` ranking** aligns with real floods across dates—not only May 2024.

| Source | What it offers | Audit use |
|--------|----------------|-----------|
| **[NASA LANCE](https://www.earthdata.nasa.gov/)** global near-real-time flood products | ~**250 m**, **MODIS** and **VIIRS**; useful for **screening** and multi-date composites | Extend beyond single SkySat label; QC and compositing effort ([§10.4](#104-reference-data-for-redesign-or-validation)) |
| **[Copernicus Global Flood Monitoring (GFM)](https://www.globalfloods.eu/copernicus-global-flood-monitoring/)** | Systematic **Sentinel-1 SAR** processing; official docs cite production within **~8 hours** and monitoring resolution on the order of **~20 m**; strong for **cloud** and **night** | **High priority** for §9.1 event-to-event alignment and historic extent archive |

These layers are appropriate to validate **spatial ordering** (where the score is high vs where water was observed), not to prove hydrodynamic correctness of every POC term.

---

## 10. External flood-hazard products as the proposed path

This audit recommends a **strategy shift**: for city-facing flood mapping, prioritize **existing global flood-hazard products with established methodologies** instead of redesigning the in-platform `flood_score` formula. In practice, the platform should consume precomputed hazard layers and focus OEF effort on integration, interpretation, and local validation.

### 10.1 Proposed source products (instead of custom flood-score redesign)

| Product | Typical use in this proposal | Why it helps |
|---------|-------------------------------|--------------|
| **WRI Aqueduct Floods Hazard Maps v2** | Baseline hazard screening (river/coastal/pluvial contexts depending on layer) | Widely used external benchmark with documented global methodology |
| **GFPLAIN250m (Global 250m Floodplain Dataset)** | Floodplain susceptibility mask / exposure pre-filter | Global 250 m coverage, easy to intersect with assets/population |
| **Global Flood Database v1 (2000–2018)** | Historical observed flood occurrence and event footprint frequency | Empirical event history for spatial sanity checks |
| **JRC Global River Flood Hazard Maps v2.1** | Return-period fluvial benchmark (e.g., 10y/50y/100y/500y) | Independent hydraulic-fluvial reference for river-driven hazard |

**Design principle:** do not spend ON-5680 effort on inventing a new in-app flood formula first. Instead, use validated hazard products as the primary flood susceptibility signal, and keep any OEF composite logic as optional secondary analytics.

### 10.2 What changes in the platform workflow

| Current pattern | Proposed pattern |
|----------------|------------------|
| OEF computes `flood_score` with custom weights and POA-specific masks | OEF ingests and harmonizes external flood-hazard products |
| Validation burden on custom formula tuning | Validation burden on product fit-for-purpose and local agreement |
| “Can we justify each weight?” | “Does the selected external product agree with local observations?” |

**Operational implication:** the app becomes a consumer of flood-hazard products that already exist and are methodologically documented, rather than the place where flood physics are re-parameterized.

### 10.3 Local validation proposed for Porto Alegre

Even with external products, local validation remains mandatory. The recommendation is to validate against two complementary local references:

| Local reference | Validation role in this proposal |
|----------------|----------------------------------|
| **SkySat / Planet** (POC 2024 label) | High-resolution observed extent for footprint-level agreement checks (hit rate / omission / commission) |
| **EMSN194 depth** | Independent depth/severity context for ranked agreement (hazard class vs observed depth bins), **held out of predictor construction** |

**Important:** under this proposed path, `EMSN194 depth` should be used as **validation evidence**, not as an input term inside the score being validated.

### 10.4 Recommended validation protocol under this strategy

1. Select one or more external hazard products (table §10.1) as primary flood layer(s) for POA.
2. Harmonize resolution/extent to the platform analysis grid.
3. Compare product hazard ranking against:
   - SkySat/Planet observed extent (binary footprint agreement),
   - EMSN194 depth strata (severity consistency).
4. Report sensitivity by product and return period (where available), not a single tuned score.
5. Keep city-facing language as **hazard screening** unless exposure/vulnerability are explicitly integrated.
6. If a composite/ensemble flood score is created from §10.1 products, treat initial weights as **priors only** (not fixed constants).
7. Re-estimate and stress-test ensemble weights using a **multi-event validation set** (at minimum: one event for tuning, one independent event for hold-out evaluation; preferred: multiple years/events).
8. Publish the weight-calibration method (objective function, constraints, class-balance handling, uncertainty bands) and compare against equal-weight and single-product baselines.
9. Re-run calibration when porting to a new city or hazard regime; do not transfer POA-calibrated weights unchanged.

**Weight-governance rule (ON-5680):** any assigned weight vector must be justified by out-of-sample evidence, not by expert preference alone. If sufficient independent events are unavailable, keep product-level reporting (no weighted composite claim) until that evidence exists.

### 10.5 Audit position on this redesign choice

| Question | Audit position |
|----------|----------------|
| Redesign custom `flood_score` weights first? | **Not preferred** for this phase |
| Use precomputed, externally documented flood-hazard products? | **Preferred** |
| Keep local validation with SkySat + EMSN194? | **Required** |
| If ensemble weights are used, can they stay fixed without re-validation? | **No** — recalibrate/verify with independent flood events and publish uncertainty |
| Keep `floodEvidence` as predictor in validated score? | **No** — use as validation reference only |
| Communication label | **Flood hazard screening**, not full IPCC-style risk |

**Deferred to ON-5680:** product selection criteria (coverage, license, update cadence), ingestion implementation, and formal benchmark comparison report for Porto Alegre.

