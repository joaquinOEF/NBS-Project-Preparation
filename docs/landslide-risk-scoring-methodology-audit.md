# Landslide risk scoring methodology audit

**Jira:** [ON-5679](https://openearth.atlassian.net/browse/ON-5679) (audit) · follow-on [ON-5680](https://openearth.atlassian.net/browse/ON-5680) (methodology)  
**Parent report:** [`data-risk-audit.md`](data-risk-audit.md) — data inventory (§2), cross-cutting risks (§3–§4), offline vs live (§5)  
**Related audits:** [`flood-risk-scoring-methodology-audit.md`](flood-risk-scoring-methodology-audit.md) · [`heat-risk-scoring-methodology-audit.md`](heat-risk-scoring-methodology-audit.md) · [index](risk-scoring-methodology-audit.md)  
**Status:** Draft — formulas and constant tables complete; formal peer-reviewed citations deferred to ON-5680.

---

## 1. Scope and references

**Goal (ON-5679 task 3):** Document the **canonical offline** landslide scoring used in the shipped sample grid, including formulas, inputs, hardcoded parameters, and proxies.

| Item | Value |
|------|--------|
| **Canonical scorer (offline)** | `scripts/recalc-scores-v3.ts` L172–203 — writes `landslide_score` to `client/public/sample-data/porto-alegre-grid-250m.json` |
| **Metric inputs (provenance)** | [`data-risk-audit.md` §2.2](data-risk-audit.md#22-per-cell-metrics-split-from-grid_metrics_) |
| **Live API path** | `server/services/gridService.ts` `computeCompositeScores` (~L444) — **different formula** (canopy-only) |
| **Offline vs live diff** | [`data-risk-audit.md` §5](data-risk-audit.md#5-offline-sample-pipeline-vs-live-gridservice--diff-and-recommendation) |

**Audit legend (constants tables):** **Justified (POC)** = stated intent in code comments; **No source** = tuning without citation in repo.

---

## 2. Landslide (`landslide_score`)

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

**Related inventory / risk register:** [`data-risk-audit.md`](data-risk-audit.md) §2.2 (`landslide_score` inputs), §3–§4 (`landslide_score` rows).
