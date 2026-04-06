# Risk Scoring Methodology

## Overview

The NBS Project Preparation platform calculates three climate risk scores (flood, heat, landslide) for each grid cell covering Porto Alegre, Brazil. Version 2 integrates OEF's pre-computed satellite indices with high-resolution local terrain and land-use data.

## Data Sources

### Satellite-Derived Indices (sampled from S3 tile layers)

| Source | Resolution | What It Provides | Used In |
|--------|-----------|-----------------|---------|
| **OEF Flood Risk Index (FRI) 2024** | ~90m | Calibrated flood susceptibility index (0–1) derived from MERIT DEM, precipitation, hydrology | Flood score (55% weight) |
| **OEF Heatwave Magnitude (HWM) 2024** | ~9km (ERA5) | Cumulative °C·days above heatwave threshold | Heat score (regional multiplier) |
| **CHIRPS Rx1day 2024** | ~5km | Maximum 1-day precipitation intensity (mm) | Landslide trigger factor |
| **Dynamic World 2023** | 10m | Land use classification (9 classes: Water, Trees, Grass, Built, etc.) | All scores (imperviousness, vegetation) |

### Local GeoJSON Data (pre-processed)

| Source | Resolution | What It Provides | Used In |
|--------|-----------|-----------------|---------|
| **Copernicus DEM** | 30m | Elevation, slope (via contour lines) | Flood (low-lying), Landslide (slope) |
| **OSM Rivers** | Vector | Distance to nearest waterway | Flood (river proximity) |
| **OSM Surface Water** | Vector | Distance to lakes/wetlands | Flood (water proximity), Heat (cooling) |
| **GHSL Built-Up** | 30m | Building density per cell | Heat (UHI dominant factor) |
| **WorldPop** | 100m | Population density | Heat (human heat generation) |
| **OSM Forest** | Vector | Forest/canopy coverage | Heat (cooling), Landslide (root cohesion) |
| **ESA WorldCover** | 10m | Land cover classification | Flood (imperviousness), Heat (green deficit) |

### Data Processing Pipeline

```
Step 1: generate-sample-grid.ts
  Input: GeoJSON layers (elevation, rivers, water, landcover, forest, population, buildings)
  Process: Create 1km² grid, compute 28 metrics per cell via spatial intersection
  Output: porto-alegre-grid.json (1,036 cells)

Step 2: recalc-scores-v2.ts
  Input: porto-alegre-grid.json + S3 value tiles (FRI, HWM, CHIRPS, Dynamic World)
  Process: Sample raster tiles at each cell centroid (z=11), combine with local metrics
  Output: Updated porto-alegre-grid.json with enhanced flood/heat/landslide scores

Step 3: render-risk-maps.ts (validation)
  Input: porto-alegre-grid.json
  Process: Render color-coded PNG maps for visual inspection
  Output: scripts/output/*.png
```

## Score Formulas

### Flood Score v2

**Foundation**: OEF's Flood Risk Index (FRI) — a calibrated composite index that accounts for precipitation, terrain, and hydrology at ~90m resolution.

**Enhancement**: Local factors add urban-scale detail that the FRI's climate-grid resolution misses.

```
FRI_normalized = FRI_value / FRI_max   (normalize to 0–1 using city max)

physical_flood = (
  0.25 × flow_accumulation +    // D8 flow concentration (contour-derived)
  0.20 × depression_pct +       // Topographic depressions (pooling areas)
  0.20 × river_proximity +      // Percentile distance to rivers
  0.15 × low_lying_pct +        // Low elevation percentile
  0.10 × water_proximity +      // Distance to lakes/wetlands
  0.10 × flatness               // Slope inversion (flat = higher risk)
)

location_flood = (
  0.40 × lakeside_risk +        // Proximity to Lake Guaíba (-51.23° W)
  0.35 × low_elevation_risk +   // Absolute elevation < 40m
  0.25 × delta_risk             // Proximity to 4-river confluence
)

flood_score = clamp(0, 1,
  0.55 × FRI_normalized +       // Satellite-calibrated foundation
  0.25 × physical_flood +       // Local terrain/hydrology
  0.20 × location_flood         // Porto Alegre-specific geography
)
```

**Correlation with FRI**: r = 0.898 (865 cells with FRI coverage)

### Heat Score v2

**Foundation**: HWM (Heatwave Magnitude) has minimal spatial variation within a single city (~11 °C·days everywhere in Porto Alegre). It serves as a regional climate multiplier, not a local discriminator.

**Primary driver**: Urban Heat Island (UHI) factors derived from high-resolution land use and building data.

```
UHI_factor = (
  0.40 × building_density +     // GHSL built-up surface (dominant)
  0.30 × vegetation_deficit +   // 1 - max(canopy, green_pct)
  0.15 × imperviousness +       // DW-enhanced impervious surface
  0.10 × population_density +   // WorldPop normalized
  0.05 × water_cooling_deficit  // 1 - water proximity cooling
)

HWM_multiplier = 0.8 + (clamp(HWM / 15) × 0.4)   // Range: 0.8–1.2

heat_score = UHI_factor × HWM_multiplier

// Adjustments:
// - Vegetated areas (DW class 1,2,3,5) with vegetation > 50%: score × 0.5
// - Water bodies (DW class 0): score = 0
// - Cap at 0.90 (reserve 1.0 for extreme cases)
```

### Landslide Score v2

**No pre-computed satellite index available.** Uses terrain-based approach with precipitation trigger.

```
slope_risk = slope ≥ 5° ? clamp((slope - 3) / 12) : 0
  // Zero below 5°. Linear from 5° to 15°. Capped at 1.0.

precip_trigger = clamp((CHIRPS_Rx1day - 40) / 80)
  // Activates above 40mm/day. Saturates at 120mm.

bare_on_slope = (DW_class ∈ {Bare, Built} AND slope ≥ 5°) ? 0.2 : 0

landslide_score = slope_risk > 0 ? clamp(
  0.50 × slope_risk +                    // Terrain steepness (dominant)
  0.20 × precip_trigger × slope_risk +   // Rain on steep = trigger
  0.15 × vegetation_deficit × slope +    // No roots = less cohesion
  0.10 × elevation_factor × slope +      // Higher = more potential energy
  0.05 × bare_on_slope                   // Bare/built on steep terrain
) : 0
```

**Note**: Porto Alegre is predominantly flat (~95% of cells have slope < 5°). Landslide risk is concentrated in the Serra Geral foothills on the southern edge.

## Distribution (v2, 1036 cells)

| Risk | Average | Median | Max | Min | Dominant Cells |
|------|---------|--------|-----|-----|---------------|
| Flood | 0.443 | 0.448 | 0.78 | 0.17 | 595 |
| Heat | 0.374 | 0.364 | 0.90 | 0.00 | 425 |
| Landslide | 0.026 | 0.000 | 0.58 | 0.00 | 10 |

## Porto Alegre Geography Constants

```
Lake Guaíba western boundary: -51.23° longitude
Delta confluence center: (-30.05°, -51.22°)
Cell size: 1000m (v2), planned 250m (v3)
Elevation range: 0–312m (mostly <50m in urban areas)
```

## Known Limitations

1. **No ground truth validation** — scores are not yet compared against actual flood/heat/landslide events
2. **Coarse climate data** — CHIRPS (25km) and ERA5 (31km) provide the same value across many cells
3. **No soil permeability** — infiltration capacity not modeled (planned for v3 via SoilGrids 250m)
4. **Proxy-based heat** — UHI uses building density as proxy; actual surface temperature (Landsat 100m) planned for v3
5. **1km grid** — misses intra-neighborhood variation (planned 250m upgrade in v3)

## Planned Improvements (v3, Issue #61)

- 250m grid resolution (16K cells)
- EMSR720 2024 flood extent for validation
- SoilGrids 250m for soil permeability
- Landsat Surface Temperature 100m for heat
- CPRM/Defesa Civil official risk areas for validation

## References

- OEF Geospatial Data Catalog: https://github.com/Open-Earth-Foundation/geospatial-data
- CHIRPS v2.0: Funk et al. (2015) https://doi.org/10.1038/sdata.2015.66
- ERA5-Land: https://cds.climate.copernicus.eu/
- Dynamic World: Brown et al. (2022) https://doi.org/10.1038/s41597-022-01307-4
- MERIT Hydro: Yamazaki et al. (2019) https://doi.org/10.1029/2019WR024873
- Copernicus DEM GLO-30: https://spacedata.copernicus.eu/
- GHSL R2023A: https://human-settlement.emergency.copernicus.eu/

## Composite Hotspot Visualization

### Concept

The "Risk Hotspots" layer shows all three risks simultaneously as glowing islands on the map. Instead of coloring the entire city uniformly, it highlights only the TRUE danger zones — discrete neighborhood-level clusters that stand out against a clean base map.

### Color Encoding

| Risk | Color Channel | Example |
|------|--------------|---------|
| Flood | Blue | Blue glow on lakeside/river areas |
| Heat | Red | Red glow in dense urban core |
| Landslide | Amber (Red + Green) | Amber glow on hillsides/morros |
| Flood + Heat | Purple/Magenta | Overlap zones |
| Heat + Landslide | Orange | Built-up hillside areas |
| All three | White/bright | Extreme combined risk |

### Percentile Normalization

Each risk type has a different absolute value range:
- Flood: compressed (0.17–0.88, most cells between 0.35–0.50)
- Heat: wide spread (0.00–0.90)
- Landslide: bimodal (0 for flat areas, 0.46+ for hills)

To ensure equal visual weight, thresholds and max values are computed from the distribution:

```
threshold = percentile(non_water_values, 0.75)  // Only top 25% visible
max = percentile(non_water_values, 0.98)         // Normalization cap
normalized = (value - threshold) / (max - threshold)  // 0→1 range
```

Current thresholds (Porto Alegre):
- Flood: threshold=0.45, max=0.57
- Heat: threshold=0.53, max=0.90
- Landslide: threshold=0.45, max=0.74

### Exponential Alpha Falloff

```
alpha = pow(max_normalized_risk, 2.0) * 255
```

The exponent of 2.0 means:
- Risk at 50% of max → alpha = 25% (barely visible)
- Risk at 75% of max → alpha = 56% (moderate)
- Risk at 100% of max → alpha = 100% (bright)

This creates sharp "island" boundaries instead of a gradual wash.

### Water Exclusion

Cells classified as Water (Dynamic World class 0) are transparent. This prevents the lake and rivers from showing risk, keeping the visualization focused on land areas where interventions are needed.

### Tile Layers

| Layer | Path | Description |
|-------|------|-------------|
| Visual (individual) | `/tiles/{flood,heat,landslide}_risk/{z}/{x}/{y}.png` | Color-coded risk per type |
| Value (individual) | `/tiles_values/{flood,heat,landslide}_risk/{z}/{x}/{y}.png` | RGB-encoded scores (scale=1000) |
| Composite hotspot | `/tiles/composite_hotspot/{z}/{x}/{y}.png` | Additive RGB glow, all risks |

### UI Integration

- **Top bar**: "Hotspots" toggle enables/disables the composite layer
- **Sidebar**: Individual risk layers (Flood Risk 250m, Heat Risk 250m, Landslide Risk 250m) with hover decode
- Grid coloring selector (Flood/Heat/Landslide) when Grid is visible
