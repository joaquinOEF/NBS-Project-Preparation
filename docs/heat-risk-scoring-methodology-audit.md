# Heat risk scoring methodology audit

**Jira:** [ON-5679](https://openearth.atlassian.net/browse/ON-5679) (audit) · follow-on [ON-5680](https://openearth.atlassian.net/browse/ON-5680) (methodology)  
**Parent report:** [`data-risk-audit.md`](data-risk-audit.md) — data inventory (§2), cross-cutting risks (§3–§4), offline vs live (§5)  
**Related audits:** [`flood-risk-scoring-methodology-audit.md`](flood-risk-scoring-methodology-audit.md) · [`landslide-risk-scoring-methodology-audit.md`](landslide-risk-scoring-methodology-audit.md) · [index](risk-scoring-methodology-audit.md)  
**Status:** Draft — formulas and constant tables complete; formal peer-reviewed citations deferred to ON-5680.

---

## 1. Scope and references

**Goal (ON-5679 task 3):** Document the **canonical offline** heat scoring used in the shipped sample grid, including formulas, inputs, hardcoded parameters, and proxies.

| Item | Value |
|------|--------|
| **Canonical scorer (offline)** | `scripts/recalc-scores-v3.ts` L149–165 — writes `heat_score` to `client/public/sample-data/porto-alegre-grid-250m.json` |
| **Metric inputs (provenance)** | [`data-risk-audit.md` §2.2](data-risk-audit.md#22-per-cell-metrics-split-from-grid_metrics_) |
| **Live API path** | `server/services/gridService.ts` `computeCompositeScores` (~L443) — **different formula** |
| **Offline vs live diff** | [`data-risk-audit.md` §5](data-risk-audit.md#5-offline-sample-pipeline-vs-live-gridservice--diff-and-recommendation) |

**Audit legend (constants tables):** **Justified (POC)** = stated intent in code comments; **No source** = tuning without citation in repo.

---

## 2. Heat (`heat_score`)

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
| HWM scale | **15**; multiplier **0.8–1.2** | L158 | **No source** |
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
| (b) Methodological | **M** | HWM adds little local discrimination (~11 °C·days city-wide); score is mostly UHI proxies. | Label as “UHI-style index”, not microclimate model. |
| (c) Hardcoding | **M** | UHI weights and caps **No source**. | Recalibrate before comparing cities. |

**Peer-reviewed comparison (draft):** UHI literature supports built/impervious/vegetation drivers; **this linear mix and weights are POC-tuned**. _Formal refs ON-5680._

**Related inventory / risk register:** [`data-risk-audit.md`](data-risk-audit.md) §2.2 (`heat_score` inputs), §3–§4 (`heat_score` rows).
