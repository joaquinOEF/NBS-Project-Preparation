# Risk Scoring Methodology

## Overview

The NBS Project Preparation platform calculates three climate risk scores (flood, heat, landslide) for each 250m grid cell covering Porto Alegre, Brazil. Version 3 integrates OEF's pre-computed satellite indices with high-resolution local terrain, land-use, and soil data, validated against the May 2024 observed flood extent.

**Grid**: 16,576 cells at 250m resolution
**Validation**: Flood F1 = 70% against 2024 disaster (P=57%, R=91%)

## Data Sources

### Satellite/Raster (sampled from S3 at z=13)

| Source | Resolution | What It Provides | Used In |
|--------|-----------|-----------------|---------|
| **MERIT Hydro HAND** | 90m | Height Above Nearest Drainage (m) | Flood (35% weight — primary predictor) |
| **OEF Flood Risk Index (FRI) 2024** | ~90m | Calibrated flood susceptibility (0–1) | Flood (25% weight — secondary/backup) |
| **OEF Heatwave Magnitude (HWM) 2024** | ~9km | °C·days above heatwave threshold | Heat (regional multiplier) |
| **Copernicus EMSN194 2024** | ~10m | Observed flood depth from May 2024 (cm) | Flood (15% weight — evidence) |
| **CHIRPS Rx1day 2024** | ~5km | Max 1-day precipitation (mm) | Landslide trigger |
| **Dynamic World 2023** | 10m | Land use (9 classes) | All scores |

### Local/Processed

| Source | Resolution | What It Provides | Used In |
|--------|-----------|-----------------|---------|
| **MERIT Hydro (ELV, UPA)** | 90m | Elevation, upstream drainage area | Flood (terrain), Hydrology |
| **SoilGrids (ISRIC WCS)** | 250m | Clay/sand → soil permeability | Flood (runoff potential) |
| **Copernicus DEM contours** | 30m | Elevation, slope | Flood (low-lying), Landslide (slope) |
| **2024 Flood Extent (Planet SkySat)** | ~3m | 197 observed flood polygons | Validation ground truth |
| **OSM Rivers/Water** | Vector | Distance to waterways | Flood (proximity) |
| **GHSL Built-Up** | 30m | Building density | Heat (UHI dominant) |
| **WorldPop** | 100m | Population density | Heat (human heat generation) |

## Score Formulas

### Flood Score v3

**Foundation**: MERIT Hydro HAND (Height Above Nearest Drainage) — the strongest single predictor of pluvial/fluvial flood susceptibility in the literature. Cells near drainage channels (low HAND) are most flood-prone.

**Secondary**: OEF's FRI provides a calibrated composite; observed 2024 flood depth adds evidence.

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
   0.25 × FRI_normalized +      // FRI: calibrated composite (falls back to hand_risk)
   0.15 × flood_evidence +      // 2024 observed flood depth
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

### Heat Score v3

**Foundation**: HWM has minimal within-city variation (~11 °C·days everywhere). Serves as regional multiplier (0.8–1.2×), not local discriminator.

**Primary driver**: Urban Heat Island factors from building density and vegetation.

```
UHI_factor = (
  0.40 × building_density +
  0.30 × vegetation_deficit +   // 1 - max(canopy, green)
  0.15 × imperviousness +       // DW-enhanced
  0.10 × population_density +
  0.05 × water_cooling_deficit
)

HWM_multiplier = 0.8 + (clamp(HWM / 15) × 0.4)

heat_score = UHI_factor × HWM_multiplier

// Vegetated areas (DW trees/grass/shrub) with vegetation > 50%: × 0.5
// Water bodies (DW class 0): score = 0
// Capped at 0.90
```

### Landslide Score v3

**No pre-computed index.** Terrain-based with geotechnical best-practice thresholds.

**Slope thresholds** (geotechnical engineering standards):
- **< 15°**: generally stable — no risk
- **15–25°**: moderate susceptibility
- **25–35°**: high susceptibility
- **> 35°**: very high susceptibility

```
slope_risk = slope ≥ 15° ? clamp((slope - 15) / 20) : 0
  // Zero below 15°. Linear 15°→35°. Capped at 1.0.

precip_trigger = clamp((CHIRPS_Rx1day - 40) / 80)
  // Rainfall > 40mm/day triggers, saturates at 120mm

soil_cohesion = clamp(clay_pct / 40)
  // Clay = more cohesive (resists sliding)

bare_on_slope = (DW ∈ {Bare, Built} AND slope ≥ 15°) ? 0.2 : 0

landslide_score = slope_risk > 0 ? clamp(
  0.45 × slope_risk +
  0.20 × precip_trigger × slope_risk +
  0.15 × (1 - soil_cohesion) × slope_risk +
  0.10 × vegetation_deficit × slope_risk +
  0.05 × elevation_factor × slope_risk +
  0.05 × bare_on_slope
) : 0
```

**Note**: Slope is computed at 250m cell size: `atan(elevation_range / 250m)`. However, elevation_max and elevation_min are inherited from the 1km parent grid, so landslide risk has effective 1km blocky resolution. Future improvement: sample DEM directly at 250m.

## Distribution (v3, 16,576 cells)

| Risk | Average | Max | Dominant Cells |
|------|---------|-----|---------------|
| Flood | 0.423 | 0.88 | 10,299 |
| Heat | 0.268 | 0.90 | 5,325 |
| Landslide | 0.038 | 0.76 | 630 |
| Low risk (<0.25) | — | — | 322 |

## Composite Hotspot Visualization

### Concept

Shows all three risks simultaneously as glowing "islands" against a clean map. Only the TRUE hotspots are visible — medium risk fades to transparent via exponential falloff.

### Color Encoding

| Risk | Channel | Visual |
|------|---------|--------|
| Flood | Blue | Blue glow on lakeside/river areas |
| Heat | Red | Red glow in dense urban core |
| Landslide | Amber (R+G) | Amber glow on morros |
| Flood + Heat | Purple | Overlap zones |
| Heat + Landslide | Orange | Built-up hillsides |

### Percentile Normalization

Each risk has a different absolute value range. To ensure equal visual weight:

```
threshold = percentile(non_water_values, 0.75)  // Top 25% visible
max = percentile(non_water_values, 0.98)         // Normalization cap
normalized = (value - threshold) / (max - threshold)
```

Current thresholds (Porto Alegre):
- Flood: p75=0.45, p98=0.57
- Heat: p75=0.53, p98=0.90
- Landslide: p50=0.23, p98=0.65

### Exponential Alpha

```
alpha = pow(max_normalized_risk, 2.0) × 255
```

50% of max → 25% visible. 75% → 56%. 100% → full brightness.

### Water Exclusion

Dynamic World class 0 (Water) cells are transparent in the hotspot layer.

## Tile Layers

| Layer | Path | Description |
|-------|------|-------------|
| Visual (per risk) | `/tiles/{flood,heat,landslide}_risk/{z}/{x}/{y}.png` | Color-coded |
| Value (per risk) | `/tiles_values/{flood,heat,landslide}_risk/{z}/{x}/{y}.png` | RGB-encoded (scale=1000) |
| Composite hotspot | `/tiles/composite_hotspot/{z}/{x}/{y}.png` | Additive RGB glow |

Value tile decoding: `value = (R + 256×G) / 1000`

## Processing Pipeline

```bash
# 1. Generate 250m grid (subdivides 1km, samples rasters at z=13, ~5 min)
npx tsx scripts/generate-grid-250m.ts

# 2. Calculate scores + validate against 2024 flood extent
npx tsx scripts/recalc-scores-v3.ts

# 3. Generate tile pyramids (visual + value + composite hotspot)
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

1. **Slope at 1km effective resolution** — elevation_max/min inherited from 1km parent. Landslide risk is blocky. Fix: sample DEM at each 250m cell centroid.
2. **Coarse climate data** — CHIRPS (5km) and ERA5 (9km) have no intra-urban variation
3. **Proxy-based heat** — UHI uses building density as proxy. Fix: integrate Landsat LST 100m
4. **No official landslide validation** — CPRM risk area maps not yet integrated
5. **Soil coverage 64%** — SoilGrids doesn't cover all cells (edges of bbox)

## References

- OEF Geospatial Data: https://github.com/Open-Earth-Foundation/geospatial-data
- CHIRPS v2.0: Funk et al. (2015) https://doi.org/10.1038/sdata.2015.66
- Dynamic World: Brown et al. (2022) https://doi.org/10.1038/s41597-022-01307-4
- SoilGrids: Poggio et al. (2021) https://doi.org/10.5194/soil-7-217-2021
- MERIT Hydro: Yamazaki et al. (2019) https://doi.org/10.1029/2019WR024873
- Copernicus DEM GLO-30: https://spacedata.copernicus.eu/
- Landslide slope thresholds: Varnes (1978) classification; USGS Landslide Hazard Program
