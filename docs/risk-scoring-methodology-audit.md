# Risk scoring methodology audit — flood, heat, landslide

**Jira:** [ON-5679](https://openearth.atlassian.net/browse/ON-5679) (audit) · follow-on [ON-5680](https://openearth.atlassian.net/browse/ON-5680) (methodology)  
**Parent report:** [`data-risk-audit.md`](data-risk-audit.md) — data inventory (§2), cross-cutting risks (§3–§4), offline vs live (§5)  
**Product narrative:** [`risk-scoring-methodology.md`](risk-scoring-methodology.md) (v3 overview; some constants differ — noted below)  
**Status:** Draft — formulas, constant tables, and F1 validation critique (§6) complete pending metric refresh; formal peer-reviewed citations deferred to ON-5680.

---

## 1. Scope and references

**Goal (ON-5679 task 3):** Document the **canonical offline** scoring used in the shipped sample grid, including formulas, inputs, hardcoded parameters, proxies, and Porto Alegre–specific constants.

| Item | Value |
|------|--------|
| **Canonical scorer (offline)** | `scripts/recalc-scores-v3.ts` — writes `flood_score`, `heat_score`, `landslide_score` to `client/public/sample-data/porto-alegre-grid-250m.json` |
| **Metric inputs (provenance)** | [`data-risk-audit.md` §2.2](data-risk-audit.md#22-per-cell-metrics-split-from-grid_metrics_) |
| **Live API path** | `server/services/gridService.ts` `computeCompositeScores` (~L429–445) — **different formulas**; Site Explorer sample mode uses offline JSON, not this path |
| **Offline vs live diff** | [`data-risk-audit.md` §5](data-risk-audit.md#5-offline-sample-pipeline-vs-live-gridservice--diff-and-recommendation) |
| **F1 validation / leakage** | **§6** below |
| **Validation script constant** | `FLOOD_THRESHOLD = 0.45` in `recalc-scores-v3.ts` L52 (F1 printout only; **not** applied to cap scores in the grid) |

**Audit legend (constants tables):** **Justified (POC)** = stated intent in code comments or methodology doc; **No source** = tuning / city-specific without citation in repo; **Doc drift** = mismatch between `risk-scoring-methodology.md` and `recalc-scores-v3.ts`.

---

## 2. Flood (`flood_score`)

**Role in product:** Primary blue risk layer on 250 m grid / pre-rendered tiles; dominant hazard for many lakeside cells.

**Formula (offline, primary path)** — when `hand_m` and/or `fri_raw` present (`recalc-scores-v3.ts` L119–128):

```
handRisk     = hand_m != null ? clamp01(exp(-hand_m / 8)) : 0.3
friNorm      = clamp01(fri_raw / friMax)   // friMax = max(fri_raw) over city, min 0.01 (L38–39)
floodEvidence = flood_depth_2024_cm != null ? clamp01(flood_depth_2024_cm / 150) : 0
lakesideRisk = max(0, 1 - max(0, lng - (-51.23)) / 0.10)
deltaRisk    = max(0, 1 - dist_km(cell, (-30.05, -51.22)) / 20)   // dist_km uses ×111 on lng/lat deltas
runoffPotential = 1 - (soil_permeability ?? 0.5)
soilAmplifier = 1 + runoffPotential × 0.15

flood_score = clamp01((0.35×handRisk + 0.25×(friNorm ?? handRisk) + 0.15×floodEvidence
                       + 0.10×lakesideRisk + 0.10×deltaRisk + 0.05×runoffPotential) × soilAmplifier)
```

**Fallback path** — when both HAND and FRI null (L129–134): weighted `river_prox_pct`, `low_lying_pct`, `flow_accum_pct`, `depression_pct`, flatness from `slope_mean`, combined with `max(physical, location×0.7)` where `location = 0.5×lakeside + 0.5×delta`.

**Dynamic World rule** (L137–139): if open water (`dw_class=0`) with no HAND/FRI and low lakeside/river proximity → cap `flood_score` at **0.15**.

**Inputs consumed**

| Input | Metric key (§2.2) | Used in |
|-------|-------------------|---------|
| MERIT HAND | `hand_m` | Primary `handRisk` (35%) |
| OEF FRI 2024 | `fri_raw`, city `friMax` | Normalized FRI (25%); `friMax` is **city-wide** max, not literature |
| Copernicus EMSN194 depth | `flood_depth_2024_cm` | `floodEvidence` (15%) — **also** model input; see [§6 F1 / leakage](#6-flood-validation-critique-f1--70) |
| SoilGrids-derived | `soil_permeability` | `runoffPotential`, amplifier |
| OSM / 1 km inherited | `river_prox_pct`, `low_lying_pct`, `flow_accum_pct`, `depression_pct`, `slope_mean` | Fallback path only |
| Cell centroid | `lng`, `lat` | `lakesideRisk`, `deltaRisk` |
| Dynamic World | `dw_class` | Water suppression |

**Hardcoded constants, weights, and city-specific terms**

| Parameter | Value | Code ref | Justification / audit |
|-----------|-------|----------|------------------------|
| HAND decay scale | **8** (m) in `exp(-hand/8)` | L105 | **Justified (POC)** — comment cites HAND as #1 predictor; decay scale **No source** in repo (sensitivity not documented) |
| HAND missing default | **0.3** | L105 | **No source** — neutral-high prior when HAND null |
| Primary weights | **0.35 / 0.25 / 0.15 / 0.10 / 0.10 / 0.05** | L121–127 | **No source** — comment “HAND #1”; weights tuned for POA (script notes iterative tuning L11) |
| Flood depth cap | **150** cm | L108 | **Doc drift** — `risk-scoring-methodology.md` shows `/100`; code uses **150** |
| Lake west boundary | **lng > −51.23** | L21, L111 | **No source** — Porto Alegre Lake Guaíba mask; city-specific |
| Lakeside decay denom | **0.10** ° longitude | L111 | **No source** — city-specific distance ramp |
| Delta center | **(−30.05, −51.22)** | L22–23, L113 | **No source** — Guaíba–rivers confluence; city-specific |
| Delta decay | **20** km | L114 | **No source** |
| Soil amplifier | **×(1 + runoff×0.15)** | L117, L128 | **No source** |
| Fallback physical weights | **0.30 / 0.25 / 0.20 / 0.15 / 0.10** | L132 | **No source** |
| Fallback location mix | **0.50 / 0.50**, ×**0.7** on location | L133–134 | **No source** |
| Flatness slope divisor | **50** (degrees) | L131 | **No source** |
| Open-water cap | **0.15** | L139 | **No source** |
| `friMax` normalization | city max of `fri_raw` | L38–39, L67 | **Methodological (b)** — relative, not absolute FRI; changes if extent changes |
| `elevation` default | **p25** city elevation if null | L32, L68 | **No source** |
| `low_lying` default | **0.5** | L74 | **No source** |
| `soil_permeability` default | **0.5** | L83 | **No source** |
| Validation threshold | **0.45** (`FLOOD_THRESHOLD`) | L52 | **No source** — F1 reporting only; methodology doc cites F1 at **0.40** |

**Live API (`gridService.ts`)** — `flood_score = 0.45×river_prox + 0.20×low_lying + 0.20×imperv + 0.15×river_prox` (river double-counted). No HAND, FRI, soil, lake/delta, or 2024 depth.

**Methodology audit (flood)**

| Category | Severity | Finding | Show-to-city gate |
|----------|----------|---------|-------------------|
| (b) Methodological | **M** | Composite blends HAND literature concept with tuned weights and POA geography terms; acceptable for POC demo, not peer-signed. | External methodology sign-off requires weight sensitivity + literature comparison (ON-5680). |
| (c) Hardcoding | **H** | Lake/delta geometry and most weights **No source** in repo. | Do not claim national/global transferability without re-calibration. |
| (a) Data quality | **M** | `flood_depth_2024_cm` as **input** and `in_flood_2024` as **label** risks optimistic F1. | Do not cite F1 as independent validation until leakage resolved ([§6](#6-flood-validation-critique-f1--70)). |
| (d) Presentation | **L** | HAND/FRI maps can look more precise than km-smoothed fallback inputs. | Disclose driver mix in legend. |

**Peer-reviewed comparison (draft):** HAND-based flood susceptibility is widely used in hydrology; **specific weight vector and POA constants are in-house**. _Add formal citations in ON-5680._

---

## 3. Heat (`heat_score`)

**Formula (offline)** — `recalc-scores-v3.ts` L149–165:

```
UHI = 0.40×building_density + 0.30×(1−vegetation) + 0.15×imperv_pct
      + 0.10×pop_density + 0.05×(1−water_cooling)
hwmMultiplier = hwm_raw != null ? 0.8 + clamp01(hwm_raw/15)×0.4 : 1.0
heat_score = clamp01(UHI × hwmMultiplier)
if DW vegetated (classes 1,2,3,5) and vegetation > 0.5 → heat_score × 0.5
if DW water (class 0) → heat_score = 0
heat_score = min(heat_score, 0.90)
```

**Inputs consumed**

| Input | Metric key (§2.2) | Notes |
|-------|-------------------|--------|
| Built-up / impervious | `building_density`, `imperv_pct` | Often **1 km inherited** — limits real UHI detail |
| Vegetation | `vegetation_pct` (canopy/green/DW) | DW can boost at 250 m |
| Population | `pop_density` | WorldPop via 1 km pipeline |
| Water proximity | `water_cooling` | From OSM distances; **1 km inherited** |
| ERA5-Land HWM | `hwm_raw` | ~11 km; **regional multiplier**, little within-city spread |

**Hardcoded constants**

| Parameter | Value | Code ref | Justification / audit |
|-----------|-------|----------|------------------------|
| UHI weights | **0.40 / 0.30 / 0.15 / 0.10 / 0.05** | L149–154 | **No source** — UHI logic plausible; weights not cited |
| HWM scale | **15**; multiplier **0.8–1.2** | L158 | **No source** — matches methodology doc narrative |
| HWM missing | multiplier **1.0** | L158 | Neutral |
| Vegetation dampening | **×0.5** if veg **> 0.5** | L161 | **No source** |
| Water score | **0** | L162 | **Justified (POC)** — water not UHI |
| Cap | **0.90** | L163 | **No source** |
| DW vegetated classes | **1, 2, 3, 5** | L92, L161 | From Dynamic World legend |
| DW water class | **0** | L91, L162 | From Dynamic World legend |

**Live API** — `heat_score = 0.45×imperv + 0.35×pop_density + 0.20×(1−canopy)`; no HWM, building_density, water_cooling, or DW rules.

**Methodology audit (heat)**

| Category | Severity | Finding | Show-to-city gate |
|----------|----------|---------|-------------------|
| (a) Data quality | **H** | Exposure drivers (`building_density`, `pop_density`) often **1 km block-constant** ([data-risk-audit §3](data-risk-audit.md#3-per-layer-risk-register)) while score is on 250 m geometry. | No block-level heat **exposure** prioritization from current JSON. |
| (b) Methodological | **M** | HWM adds little local discrimination (~11 °C·days city-wide per methodology doc); score is mostly UHI proxies. | Label as “UHI-style index”, not microclimate model. |
| (c) Hardcoding | **M** | UHI weights and caps **No source**. | Recalibrate before comparing cities. |

**Peer-reviewed comparison (draft):** UHI literature supports built/impervious/vegetation drivers; **this linear mix and weights are POC-tuned**. _Formal refs ON-5680._

---

## 4. Landslide (`landslide_score`)

**Formula (offline)** — active only if `slope_mean ≥ 15°` (`recalc-scores-v3.ts` L177–201):

```
slopeRisk = clamp01((slope_mean - 15) / 20)   // 0 below 15°; 1 at 35°+
precipTrigger = rx1day != null ? clamp01((rx1day - 40) / 80) : 0.5
soilCohesion = clay_pct != null ? clamp01(clay_pct / 40) : 0.5
lackOfVeg = 1 - vegetation_pct
elevated = 1 - low_lying_pct
bareOnSlope = (dw_class in {6,7} and slope≥15) ? 0.2 : 0

landslide_score = clamp01(0.45×slopeRisk + 0.20×precipTrigger×slopeRisk
  + 0.15×(1−soilCohesion)×slopeRisk + 0.10×lackOfVeg×slopeRisk
  + 0.05×elevated×slopeRisk + 0.05×bareOnSlope)   // else 0
```

**Slope note:** `slope_mean` recomputed with **250 m** cell size (L59–62) but `elevation_min` / `elevation_max` are often **1 km inherited** — effective terrain detail is coarse ([data-risk-audit §3](data-risk-audit.md#3-per-layer-risk-register)).

**Inputs consumed**

| Input | Metric key (§2.2) | Notes |
|-------|-------------------|--------|
| Terrain | `slope_mean`, `low_lying_pct` | Slope artefact from 1 km elev range |
| CHIRPS | `precip_rx1day` | ~5 km; sampled at 250 m |
| SoilGrids | `clay_pct` | 250 m lookup |
| Cover | `vegetation_pct`, `dw_class` | Mixed 1 km / DW |

**Hardcoded constants**

| Parameter | Value | Code ref | Justification / audit |
|-----------|-------|----------|------------------------|
| Slope activation | **15°** minimum | L177 | **Justified (POC)** — geotechnical comment in code; not tied to local soil map |
| Slope ramp | **(slope−15)/20** | L177 | **No source** — linear to 35° |
| Component weights | **0.45 / 0.20 / 0.15 / 0.10 / 0.05 / 0.05** | L191–197 | **No source** |
| Precip trigger | **(rx1day−40)/80**, default **0.5** | L181 | **No source** — 40 mm and 120 mm saturation implicit |
| Clay cohesion scale | **/40** (%) | L184 | **No source** |
| `clay` default | **0.5** cohesion | L184 | **No source** |
| `precip` default | **0.5** trigger | L181 | **No source** |
| Bare/built bump | **0.2** on slope ≥15° | L187 | **No source** |
| DW bare/built | classes **6, 7** | L187 | Dynamic World |

**Live API** — `landslide_score = 0.15×(1−canopy)` only (`S=0`, `U=0` placeholders L439–440). **Not comparable** to offline v3.

**Methodology audit (landslide)**

| Category | Severity | Finding | Show-to-city gate |
|----------|----------|---------|-------------------|
| (a) Data quality | **H** | Slope from 1 km elevation range → **misleading fine-scale** landslide map. | Do not use for parcel-scale slope stability claims. |
| (b) Methodological | **M** | Simple index, not a geotechnical model (no lithology map, pore pressure, etc.). | Present as **susceptibility screen**, not engineering study. |
| (c) Hardcoding | **M** | Thresholds and weights **No source**. | Recalibrate with local geotech input for city decisions. |

**Peer-reviewed comparison (draft):** Slope–precipitation susceptibility screens are common in regional landslide mapping; **this weight set is POC-specific**. _Formal refs ON-5680._

---

## 5. Cross-hazard summary

| Hazard | Offline entry | Dominant drivers | Top hardcoding risk | Live API parity |
|--------|---------------|------------------|---------------------|-----------------|
| Flood | `recalc-scores-v3.ts` L94–142 | HAND, FRI, POA lake/delta | Lake/delta + weights **No source** | **No** — simplified river/imperv formula |
| Heat | L149–165 | UHI proxies (built, veg, pop) | UHI weights; **1 km exposure** | **No** — no HWM/DW |
| Landslide | L172–203 | Slope × precip × soil (if slope≥15°) | 15° threshold; **1 km slope** | **No** — canopy-only |

**Cross-cutting risks** (pipeline resolution, inventory) are in [`data-risk-audit.md`](data-risk-audit.md) §3–§5, not duplicated here.
---

## 6. Flood validation critique (F1 ≈ 70%)

**Purpose (ON-5679 task 5):** Critique the reported flood validation—not treat F1 as pass/fail. There is **no universal “acceptable F1”**; interpretation depends on class balance, spatial scale, baseline models, threshold choice, and whether features and labels are **independent**. A **~70% F1** can be **reasonable for an internal POC** with high recall if limitations are disclosed; it is **not sufficient alone** to claim independent scientific validation for city investment decisions.

**Source of reported metrics:** [`risk-scoring-methodology.md`](risk-scoring-methodology.md) (F1 at threshold **0.40**). **Script default:** `FLOOD_THRESHOLD = 0.45` in `scripts/recalc-scores-v3.ts` L52. **Audit note:** `client/public/sample-data/porto-alegre-grid-250m.json` was **not present** in the workspace at audit time; re-run `npx tsx scripts/recalc-scores-v3.ts` after regenerating the grid to refresh all numbers and the threshold sweep below.

### 6.1 Current validation setup

| Field | POC implementation |
|-------|---------------------|
| **Prediction** | Binary: `flood_score ≥ threshold` (continuous score from [§2](#2-flood-flood_score), `recalc-scores-v3.ts` L94–142) |
| **Label (ground truth)** | `in_flood_2024` — point-in-polygon vs **197** SkySat inundation polygons, 2024-05-06 (`client/public/sample-data/porto-alegre-flood-2024.json`, Zenodo [10.5281/zenodo.14662897](https://doi.org/10.5281/zenodo.14662897)) |
| **Grid** | 16,576 cells @ **250 m** (`porto-alegre-grid-250m.json` when generated) |
| **Metrics printed** | TP, FP, FN, TN → precision, recall, F1, accuracy; threshold sweep L258–271 |
| **Threshold in product doc** | **0.40** → F1 **≈ 70%**, P **≈ 57%**, R **≈ 91%** (`risk-scoring-methodology.md`) |
| **Threshold in script header** | **0.45** (`FLOOD_THRESHOLD`) — primary console block may differ from doc |
| **Score inputs tied to same event** | `flood_depth_2024_cm` (Copernicus EMSN194, May 2024) → `floodEvidence` term (**15%** weight); see [§2](#2-flood-flood_score) |

### 6.2 Critical evaluation

| Aspect | Evidence in POC | Leakage / bias risk | Statistical read (audit) | Show-to-city gate |
|--------|-----------------|---------------------|-------------------------|-------------------|
| **F1 magnitude (~0.70)** | Documented at thresh **0.40** | — | **Plausible for POC** susceptibility mapping with **high recall**; not an operational certification standard by itself | Do not cite as “independently validated” without §6.4 protocol |
| **High recall (~91%)** | Same | Few FN → misses less observed flooding | Good for **screening / don’t miss hotspots**; implies many FP | OK for exploratory prioritization with FP disclaimer |
| **Moderate precision (~57%)** | Same | ~43% of “predicted flooded” cells not in SkySat label | **Sensitive** score, not conservative; many cells flagged without observed inundation | Not for fine-grained investment sizing without field review |
| **Threshold 0.40 vs 0.45** | Doc vs `FLOOD_THRESHOLD` | Same model, different cut → **different F1** | F1 is **not intrinsic** to the model; must fix one reporting threshold + publish sweep | Publish single threshold + sensitivity table |
| **2024 depth in score** | `flood_depth_2024_cm` → score | **High** — same disaster family as label | Inflates agreement vs **fully independent** test; F1 may **overstate** generalization | **Do not** present F1 as proof until depth term excluded from validation runs |
| **Single event / city** | POA May 2024 only | No temporal/spatial hold-out | **0.70 does not transfer** to other cities or events | Scope claims to **Porto Alegre 2024 event** only |
| **Cell vs polygon geometry** | 250 m centroids vs SkySat polygons | Boundary misalignment → artificial FN/FP | Strict pixel–polygon F1 **penalizes** spatial offset; may understate “near miss” quality | Mention spatial tolerance in future validation |
| **No published baseline** | HAND/FRI-only F1 not in doc | Cannot judge uplift of composite | **70% without baseline** is weak evidence vs literature | Re-validation must include **HAND-only**, **FRI-only**, **majority-class** baselines |
| **Label ≠ score input** | `in_flood_2024` not in formula | Partial mitigation | SkySat label distinct from EMS depth raster—but **same event** | Still requires event-hold-out for strong claim |

**Interpretation summary:** The reported **~70% F1** reflects a **recall-oriented** cut (captures most observed 2024 flooding, accepts false alarms). That profile fits a **POC heat-map** more than a **precision investment ledger**. The main scientific gaps are **(1) leakage via 2024 flood evidence in the score**, **(2) threshold/doc drift**, **(3) no independent event or city**, **(4) no baseline comparison**—not the raw percentage alone.

### 6.3 Threshold sensitivity

The script evaluates thresholds **0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60** (`recalc-scores-v3.ts` L258–271). **Lower threshold** → higher recall, lower precision; **higher threshold** → opposite.

| Threshold | Reported / expected behaviour | Notes |
|-----------|--------------------------------|-------|
| **0.40** | F1 **≈ 70%**, P **≈ 57%**, R **≈ 91%** | Cited in `risk-scoring-methodology.md` |
| **0.45** | _Re-run script_ | Script default `FLOOD_THRESHOLD`; may differ from doc |
| **0.25–0.60** | Full sweep in script stdout | Use to show stability; avoid cherry-picking max F1 without operational rule |

**Recommendation:** Fix **one** reporting threshold (align doc + script). Attach sweep output as appendix when grid JSON is available.

### 6.4 Recommended re-validation protocol (before city-facing claims)

| Step | Action | Rationale |
|------|--------|-----------|
| 1 | **Hold-out event features:** Recompute `flood_score` **without** `flood_depth_2024_cm` (and any other May-2024-specific evidence) when measuring F1 vs `in_flood_2024` | Removes primary **leakage** path |
| 2 | **Fix threshold policy:** Choose threshold by agreed rule (e.g. maximize F1 on **spatial hold-out**, or minimize FN subject to P ≥ X)—not post-hoc “best looking” threshold | Reproducibility |
| 3 | **Report full sweep + P/R/F1 table** | ON-5679 threshold sensitivity |
| 4 | **Baselines:** HAND-only (`handRisk`), FRI-only (`friNorm`), v2 scores, predict-all-dry | Context for composite uplift |
| 5 | **Spatial generalization:** Hold out sub-basins or buffer-adjusted match (e.g. ±1 cell) | Fairness at 250 m vs polygon labels |
| 6 | **Temporal / external test:** Second flood event or city when data exist | Generalization beyond POA 2024 |
| 7 | **Document in** [`risk-scoring-methodology.md`](risk-scoring-methodology.md) **and** [§2](#2-flood-flood_score) constants table | Single source of truth post-audit |

### 6.5 Show-to-city gates (flood validation)

| Claim | Allowed today? | Condition |
|-------|----------------|-----------|
| “Scores calibrated against May 2024 observed flooding” | **Internal POC only** | Disclose depth-in-score leakage |
| “F1 = 70% validated model” | **No** | Misleading without independent test |
| “Map highlights areas consistent with 2024 event (high recall)” | **Caution** | With precision / FP disclaimer |
| “Transferable flood risk for any city” | **No** | POA-specific weights + geography ([§2](#2-flood-flood_score)) |

**Related inventory / risk register:** [`data-risk-audit.md`](data-risk-audit.md) §2.1 (`flood_2024_extent`), §3–§4 (`flood_score` rows).

