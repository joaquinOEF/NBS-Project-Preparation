# Flood Risk Scoring Methodology

## Overview

The NBS Project Preparation platform calculates a **flood hazard / susceptibility score** (labeled `flood_score` and “flood risk” in tiles) for each 250 m grid cell covering Porto Alegre, Brazil. It is **not** an IPCC-style **risk** layer (Hazard × Exposure × Vulnerability)—exposure and vulnerability are not in the formula. See [audit §2.6](flood-risk-scoring-methodology-audit.md#26-terminology-flood-hazard-vs-ipcc-flood-risk).

**Grid**: 16,576 cells at 250 m resolution  
**Validation**: Flood F1 = 70% against 2024 disaster (P=57%, R=91%)

## Data Sources

### Satellite/Raster (sampled from S3 at z=13)

| Source | Resolution | What It Provides | Used In |
|--------|-----------|-----------------|---------|
| **MERIT Hydro HAND** | 90 m | Height Above Nearest Drainage (m) | Flood (35% weight — primary predictor) |
| **OEF Flood Risk Index (FRI) 2024** | ~5.5 km (CHIRPS 0.05°) | **Screening index** — annual RX1day + RX5day + low-elevation risk (not a flood model); see [audit §3 products](flood-risk-scoring-methodology-audit.md#3-upstream-products-used-in-flood-scoring) | Flood (25% weight — climate/terrain screen) |
| **Copernicus EMSN194 2024** | ~10 m | Observed flood depth from May 2024 (cm) | Flood (15% weight — evidence) |
| **Dynamic World 2023** | 10 m | Land use (9 classes) | Flood (water suppression) |

### Local/Processed

| Source | Resolution | What It Provides | Used In |
|--------|-----------|-----------------|---------|
| **MERIT Hydro (ELV, UPA)** | 90 m | Elevation, upstream drainage area | Flood (terrain), Hydrology |
| **SoilGrids (ISRIC WCS)** | 250 m | Clay/sand → soil permeability | Flood (runoff potential) |
| **Copernicus DEM contours** | 30 m | Elevation, slope | Flood (low-lying) |
| **2024 Flood Extent (Planet SkySat)** | ~3 m | 197 observed flood polygons | Validation ground truth |
| **OSM Rivers/Water** | Vector | Distance to waterways | Flood (proximity) |

## Flood Score v3

**Foundation**: MERIT Hydro HAND (Height Above Nearest Drainage) — the strongest single predictor of pluvial/fluvial flood susceptibility in the literature. Cells near drainage channels (low HAND) are most flood-prone.

**Secondary**: EMSN194 depth adds **May 2024 observed** evidence (`floodEvidence`, 15%) — event-specific, not a generic flood-zone standard. HAND remains the primary **prospective** driver; see [audit §2.4](flood-risk-scoring-methodology-audit.md#24-event-specific-vs-transferable-components).

```
// HAND risk: exponential decay — physically grounded
// h=0m → 1.0, h=5m → 0.54, h=10m → 0.29, h=20m → 0.08
hand_risk = exp(-HAND / 8)       // If HAND missing: default 0.3

FRI_normalized = FRI_value / FRI_max

flood_evidence = clamp(flood_depth_2024_cm / 100)  // Copernicus observed depth

lakeside_risk = f(distance to Lake Guaíba)
delta_risk    = f(distance to 4-river confluence)
runoff_potential = f(clay%, sand%)                  // SoilGrids

soil_amplifier = 1 + (runoff_potential × 0.15)

// Primary path: HAND and/or FRI available
flood_score = clamp(0, 1,
  (0.35 × hand_risk +           // HAND: #1 flood predictor (90m)
   0.25 × FRI_normalized +      // FRI: annual climate/terrain screening index (falls back to hand_risk)
   0.15 × flood_evidence +      // May 2024 observed depth (event evidence — not portable)
   0.10 × lakeside_risk +       // Lake proximity
   0.10 × delta_risk +          // River confluence
   0.05 × runoff_potential      // Soil permeability
  ) × soil_amplifier
)

// Fallback path: no HAND or FRI — uses physical terrain + location
// (rare: only ~3% of cells lack both)

// Water cells: only suppress deep open lake (no HAND, no FRI, far from shore)
// Flood-expanded water keeps its score — it IS the flood zone
```

**Validation**: F1 = 70% at threshold 0.40 (P=57%, R=91%) against May 2024 flood extent.

## Distribution (v3, 16,576 cells)

| Metric | Value |
|--------|-------|
| Flood average | 0.423 |
| Flood max | 0.88 |
| Dominant flood cells | 10,299 |

## Tile Layers

| Layer | Path | Description |
|-------|------|-------------|
| Visual | `/tiles/flood_risk/{z}/{x}/{y}.png` | Color-coded flood risk |
| Value | `/tiles_values/flood_risk/{z}/{x}/{y}.png` | RGB-encoded (scale=1000) |

Value tile decoding: `value = (R + 256×G) / 1000`

## Processing Pipeline

```bash
# 1. Generate 250m grid (subdivides 1 km, samples rasters at z=13, ~5 min)
npx tsx scripts/generate-grid-250m.ts

# 2. Calculate scores + validate against 2024 flood extent
npx tsx scripts/recalc-scores-v3.ts

# 3. Generate tile pyramids (visual + value)
npx tsx scripts/generate-risk-tiles.ts

# 4. Render PNG validation maps
npx tsx scripts/render-risk-maps-250m.ts

# 5. Analyze false negatives
npx tsx scripts/analyze-fn.ts
```

## Porto Alegre Geography

```
Lake Guaíba western boundary: -51.23° longitude
Delta confluence center: (-30.05°, -51.22°)
Cell size: 250m (v3), was 1000m (v1-v2)
Elevation range: 25–246m
```

## Known Limitations

1. **Event-specific depth in score (`floodEvidence`)** — EMSN194 May 2024 depth is **observed data from this disaster**, weighted 15%. It calibrates the map to where flooding occurred; it is **not** a forward-looking standard for “zones that could flood.” The model is **not replicable** to other events without removing this term or supplying a new depth layer. See [audit §2.4](flood-risk-scoring-methodology-audit.md#24-event-specific-vs-transferable-components) and [§7](flood-risk-scoring-methodology-audit.md#7-flood-validation-critique-f1--70).
2. **FRI is screening, not event hydrology** — OEF FRI 2024 combines **annual** CHIRPS RX1day/RX5day (~5.5 km) with low-elevation risk; it is not the rainfall or hydrology of the May 2024 event. See [audit §3](flood-risk-scoring-methodology-audit.md#3-upstream-products-used-in-flood-scoring) (FRI row) and [§4](flood-risk-scoring-methodology-audit.md#4-grid-metrics-and-score-terms) (`fri_raw` / `friNorm`).
3. **Doc/code drift** — flood depth cap is `/100` in this doc vs **150** cm in `recalc-scores-v3.ts`; F1 reported at threshold **0.40** vs script default **0.45**.
4. **Soil coverage 64%** — SoilGrids doesn't cover all cells (edges of bbox).
5. **POA-specific geography** — lake/delta terms are tuned for Porto Alegre; not transferable without re-calibration.
6. **Official-use bar not met** — suitable for urban screening ([audit §2.5](flood-risk-scoring-methodology-audit.md#25-intended-use-today-screening-vs-formal-decisions), [§8](flood-risk-scoring-methodology-audit.md#8-maturity-official-use-bar-and-policy-framing)); formal city decisions require §9 experiments and §8.2 gaps closed.
7. **“Risk” vs hazard** — UI/tiles say “flood risk” but the score is **hazard/susceptibility** only ([audit §2.6](flood-risk-scoring-methodology-audit.md#26-terminology-flood-hazard-vs-ipcc-flood-risk)).
8. **FRI normalization** — shipped FRI uses **city polygon min–max**; proposed upgrade is **per-grid climatology** ([audit §3.1](flood-risk-scoring-methodology-audit.md#31-oef-fri--normalization-and-naming-product-detail)).

## References

- OEF Geospatial Data: https://github.com/Open-Earth-Foundation/geospatial-data
- Dynamic World: Brown et al. (2022) https://doi.org/10.1038/s41597-022-01307-4
- SoilGrids: Poggio et al. (2021) https://doi.org/10.5194/soil-7-217-2021
- MERIT Hydro: Yamazaki et al. (2019) https://doi.org/10.1029/2019WR024873
- Copernicus DEM GLO-30: https://spacedata.copernicus.eu/

**Methodology audit:** [`flood-risk-scoring-methodology-audit.md`](flood-risk-scoring-methodology-audit.md) — §3 products, §4 metrics, §7 validation, **§8** intended use & official bar, **§9** experiments, **§10** strengthening.
