# Site Explorer Data Audit

## Table of Contents

1. [Overview](#overview)
2. [Evidence Layer Data Sources](#evidence-layer-data-sources)
3. [Risk Grid Calculation](#risk-grid-calculation)
4. [Intervention Zone Creation](#intervention-zone-creation)
5. [Zone Priority and Classification](#zone-priority-and-classification)
6. [Known Risks and Limitations](#known-risks-and-limitations)

---

## Overview

The Site Explorer is the geospatial analysis module of the NBS Project Builder. It overlays multiple environmental data layers on a city map, computes hazard risk scores per grid cell, clusters those cells into intervention zones, and lets users assign Nature-Based Solution (NBS) interventions to each zone. The output feeds into the Impact Model and Business Model modules downstream.

There are two operating modes:

| Mode | Data Origin | When Used |
|------|-------------|-----------|
| **Sample mode** | Pre-computed JSON files for Porto Alegre (`/sample-data/porto-alegre-*.json`) | Demo/sandbox |
| **Live mode** | Real-time API calls to OSM Overpass, Copernicus DEM, etc. | Authenticated projects |

---

## Evidence Layer Data Sources

### 1. City Boundary

| Attribute | Detail |
|-----------|--------|
| **Source** | OpenStreetMap Nominatim / Overpass API |
| **Resolution** | Vector polygons (admin boundary level) |
| **Service** | `server/services/osmService.ts` → `getCityBoundary()` |
| **Caching** | In-memory storage layer |
| **What it provides** | City boundary GeoJSON polygon, centroid coordinates, bounding box |

**Known risks:**
- OSM boundary completeness varies by city; some municipalities have incomplete or disputed admin boundaries.
- The bounding box derived from the boundary is used to scope all subsequent data fetches, so a wrong boundary cascades errors to every layer.

---

### 2. Elevation / Terrain

| Attribute | Detail |
|-----------|--------|
| **Source** | Copernicus DEM GLO-30 (30m resolution Digital Surface Model) |
| **Access** | Public S3 bucket: `copernicus-dem-30m.s3.eu-central-1.amazonaws.com` |
| **Format** | Cloud-Optimized GeoTIFF tiles (1° x 1°) |
| **Service** | `server/services/copernicusService.ts` → `getElevationData()` |
| **Caching** | Local filesystem (`./dem_cache/*.tif`) + storage layer for processed contours |
| **Processing** | Downloads required tiles, resamples to target resolution (default 90m), generates contour lines using marching-squares algorithm |

**What it provides:**
- Elevation grid (width x height array)
- Contour line GeoJSON (auto-interval: 2m–50m depending on terrain range)
- Per-cell metrics: `elevation_mean`, `elevation_min`, `elevation_max`

**Known risks:**
- Copernicus DEM is a Digital Surface Model (DSM), not a Digital Terrain Model (DTM). It includes buildings, trees, and structures. In dense urban areas, "elevation" includes building heights, inflating slope estimates and distorting low-lying detection.
- Missing tiles are marked as `.missing` and skipped silently. Coastal or island cities may have gaps (ocean tiles return 404).
- The resampling grid is capped at 500x500 cells (`Math.min(..., 500)` in code, line 310-311 of `copernicusService.ts`), which reduces effective resolution for large cities.
- Elevation values of exactly 0 are treated as no-data (`if (value !== 0)` check on line 343). This is incorrect for cities genuinely at sea level (e.g., Amsterdam, Venice, New Orleans).
- The no-data sentinel `-9999` from the GeoTIFF is converted to 0 (line 340), which then gets excluded from elevation statistics, meaning voids are silently ignored.
- The contour generation algorithm processes cell-by-cell crossings, producing individual line segments rather than connected contour rings, resulting in visual fragmentation at the rendering stage.

---

### 3. Land Cover

| Attribute | Detail |
|-----------|--------|
| **Declared source** | ESA WorldCover 10m (in schema metadata) |
| **Actual source** | OpenStreetMap Overpass API (`landuse=*`, `natural=*` tags) |
| **Resolution** | OSM feature-level (variable) |
| **Service** | `server/services/worldcoverService.ts` → `getLandcoverDataFromOSM()` |
| **Overpass query** | All `way["landuse"]`, `way["natural"]`, `relation["landuse"]`, `relation["natural"]` within bbox |

**What it provides:**
- Land use polygons classified into: residential, commercial, industrial, forest, grassland, water, wetland, etc.
- Per-cell metrics: `imperv_pct` (impervious surface fraction), `green_pct` (vegetation fraction)

**Known risks:**
- **Source mismatch**: The schema/UI declares the source as "ESA WorldCover 10m" but the actual implementation fetches from OpenStreetMap. OSM land use tagging is crowd-sourced, inconsistent across regions, and often incomplete — especially in developing countries.
- OSM does not distinguish actual impervious surface from zoned land use. A `landuse=residential` area may contain gardens and parks, but is counted as fully impervious.
- Large queries in dense cities can timeout (60s Overpass timeout).
- No temporal dimension — OSM shows current state, not historical trends.

---

### 4. Surface Water Bodies

| Attribute | Detail |
|-----------|--------|
| **Declared source** | JRC Global Surface Water (in schema metadata) |
| **Actual source** | OpenStreetMap Overpass API |
| **Service** | `server/services/surfaceWaterService.ts` → `getSurfaceWaterFromOSM()` |
| **Overpass query** | `natural=water`, `water=*`, `waterway=riverbank` |

**What it provides:**
- Water body polygons (lakes, reservoirs, ponds)
- Classification: permanent, seasonal, ephemeral (based on OSM `intermittent` and `seasonal` tags)
- Per-cell metrics: `dist_water_m` (distance to nearest water body), `floodplain_adj_pct` (proximity percentile)

**Known risks:**
- **Source mismatch**: Declared as JRC Global Surface Water but actually sourced from OSM. JRC provides satellite-derived water occurrence statistics (1984–present); OSM provides manually mapped features. These are fundamentally different datasets.
- OSM water body mapping is incomplete in rural/peri-urban areas.
- Seasonal/intermittent classification depends on OSM contributors adding correct tags, which is rare.
- No historical flooding extent data is used — only static water body positions.

---

### 5. Rivers and Waterways

| Attribute | Detail |
|-----------|--------|
| **Source** | OpenStreetMap Overpass API |
| **Declared source** | "HydroSHEDS / OSM" (in schema metadata) |
| **Service** | `server/services/riversService.ts` → `getRiversFromOSM()` |
| **Overpass query** | `waterway=river`, `stream`, `canal`, `drain`, `ditch` |

**What it provides:**
- River/stream LineString geometries
- Total waterway length (km), major river names
- Per-cell metrics: `dist_river_m` (distance to nearest waterway), `river_prox_pct` (proximity percentile)

**Known risks:**
- **Source mismatch**: Declared as "HydroSHEDS / OSM" but only OSM is used. HydroSHEDS provides hydrologically-conditioned drainage networks; OSM provides mapped waterways. HydroSHEDS would be more scientifically rigorous for flood modeling.
- Distance-to-river is calculated from cell centroid, not cell boundary. A cell touching a river but with centroid 200m away gets a 200m distance reading.
- All waterway types (river, stream, ditch) are treated equally. A major river and a roadside ditch produce the same proximity signal.
- The percentile-based normalization (`river_prox_pct`) is relative to the city — a cell far from rivers in a river-poor city scores the same as a cell far from rivers in a river-rich city.

---

### 6. Forest / Canopy Cover

| Attribute | Detail |
|-----------|--------|
| **Declared source** | Hansen Global Forest (in schema metadata) |
| **Actual source** | OpenStreetMap Overpass API |
| **Service** | `server/services/forestService.ts` → `getForestCanopyFromOSM()` |
| **Overpass query** | `natural=wood`, `landuse=forest`, `natural=tree_row` |

**What it provides:**
- Forest/woodland polygon geometries
- Per-cell metrics: `canopy_pct` (fraction of cell covered by forest features)

**Known risks:**
- **Source mismatch**: Declared as "Hansen Global Forest" (satellite-derived 30m resolution tree cover) but actually uses OSM. Hansen provides pixel-level tree cover percentage derived from Landsat imagery; OSM provides manually-drawn forest boundaries. OSM often misses individual trees, street trees, small green patches, and private gardens.
- `canopy_pct` is computed as the area fraction of forest polygons overlapping each grid cell (via `turf.intersect` + `turf.area`). While it is technically continuous (0.0–1.0), it only counts areas mapped as `natural=wood` or `landuse=forest` in OSM. Street trees, private gardens, small parks with tree cover, and scattered trees are absent from this metric.
- The name "canopy cover" implies a continuous vegetation density measure (as Hansen provides), but this is really a binary-source area fraction — a cell is either inside a mapped forest polygon or not, with partial overlap producing fractional values only at forest edges.

---

### 7. Population Density

| Attribute | Detail |
|-----------|--------|
| **Declared source** | WorldPop 100m raster (shown in UI tooltip) |
| **Actual source** | OpenStreetMap Overpass API (residential proxy) |
| **Service** | `server/services/populationService.ts` → `getPopulationFromOSM()` |
| **Overpass query** | `landuse=residential`, `building=residential`, `building=apartments`, `building=house` |

**What it provides:**
- Residential area polygons and building footprints
- Estimated population: `(houses × 3) + (apartment buildings × 30)`
- Per-cell metrics: `pop_density` (built-area fraction as proxy), `built_pct`

**Known risks:**
- **Source mismatch**: UI shows "WorldPop 100m raster" as the source, but the actual data comes from OSM building/residential queries. WorldPop provides modeled population counts per 100m grid cell; OSM provides building footprints.
- The population estimate formula (`houses × 3 + apartments × 30`) is extremely crude. Actual household sizes, building heights, and occupancy rates vary enormously.
- OSM building coverage varies dramatically by city. Cities with strong OSM communities (e.g., European cities) have near-complete building data; others may have <10% coverage.
- There is no distinction between occupied and vacant buildings.

---

### 8. Building Density

| Attribute | Detail |
|-----------|--------|
| **Declared source** | "GHSL Built-Up" (in schema), "OSM building footprints" (in tooltip) |
| **Actual source** | Derived from OSM residential/building data (same as population layer) |

**Known risks:**
- Same data as population layer, just visualized differently.
- Does not use GHSL (Global Human Settlement Layer) satellite-derived built-up data despite declaring it.

---

## Risk Grid Calculation

### Grid Generation

The city bounding box is divided into a regular square grid using Turf.js:

- **Default cell size**: 250m × 250m (configurable)
- **Library**: `@turf/turf` `squareGrid()` function
- **Service**: `server/services/gridService.ts` → `generateGrid()`

Each cell gets a unique ID (`cell_0`, `cell_1`, ...) and empty metric/coverage slots.

### Per-Cell Metric Computation

Evidence layers are overlaid onto the grid cells in sequence. For each cell, spatial intersection or distance calculations produce normalized metrics:

| Metric | Computation Method | Range |
|--------|-------------------|-------|
| `elevation_mean/min/max` | Average/min/max of contour lines intersecting the cell | meters |
| `low_lying_pct` | Inverse percentile rank of elevation (lower elevation = higher value) | 0–1 |
| `slope_mean` | Not computed in live mode (only in sample data) | m/km |
| `dist_river_m` | Minimum distance from cell centroid to any waterway LineString | meters |
| `river_prox_pct` | Inverse percentile rank of river distance (closer = higher) | 0–1 |
| `dist_water_m` | Minimum distance from cell centroid to any water body polygon | meters |
| `floodplain_adj_pct` | Inverse percentile rank of water body distance | 0–1 |
| `imperv_pct` | Fraction of cell area covered by impervious land use | 0–1 |
| `green_pct` | Fraction of cell area covered by vegetation land use | 0–1 |
| `canopy_pct` | Fraction of cell area covered by forest polygons | 0–1 |
| `pop_density` | Fraction of cell area covered by residential buildings (proxy) | 0–1 |
| `built_pct` | Same as pop_density | 0–1 |

### Composite Hazard Score Formulas

After all per-cell metrics are computed, three hazard scores are calculated in `computeCompositeScores()` (gridService.ts, lines 429–448). The exact code is:

```typescript
const A = m.river_prox_pct ?? 0;     // river proximity percentile
const E = m.low_lying_pct ?? 0;      // low-lying elevation percentile
const I = m.imperv_pct ?? 0;         // impervious surface fraction
const R = m.river_prox_pct ?? 0;     // BUG: duplicate of A (river proximity again)
const C = m.canopy_pct ?? 0;         // forest canopy fraction
const P = m.pop_density ?? 0;        // population density proxy (built area fraction)
const S = 0;                         // slope — HARDCODED TO ZERO
const U = 0;                         // soil instability — HARDCODED TO ZERO

flood_score     = 0.45 × A + 0.20 × E + 0.20 × I + 0.15 × R
heat_score      = 0.45 × I + 0.35 × P + 0.20 × (1 − C)
landslide_score = 0.55 × S + 0.30 × U + 0.15 × (1 − C)
```

Since `A` and `R` are both assigned `m.river_prox_pct`, and `S` and `U` are both 0, the effective formulas simplify to:

```
flood_score     = 0.60 × river_prox_pct + 0.20 × low_lying_pct + 0.20 × imperv_pct
heat_score      = 0.45 × imperv_pct + 0.35 × pop_density + 0.20 × (1 − canopy_pct)
landslide_score = 0.15 × (1 − canopy_pct)
```

### Critical Issues with Composite Scores

1. **Flood score double-counts river proximity**: `river_prox_pct` appears in both the A term (weight 0.45) and the R term (weight 0.15), giving it a combined weight of 0.60 out of 1.0. This was likely a copy-paste error (variable `A` and `R` are both assigned `river_prox_pct`).

2. **Landslide score is effectively non-functional**: Both `S` (slope) and `U` (soil instability) are hardcoded to 0 in the live code, making the formula reduce to:
   ```
   landslide_score = 0.15 × (1 − canopy_pct)
   ```
   This means the maximum possible landslide score is 0.15, and it only measures absence of forest cover — not actual slope, geology, or soil conditions. The formula cannot meaningfully identify landslide risk.

3. **No flow accumulation**: The sample data includes advanced hydrological metrics (`flow_accum`, `flow_accum_pct`, `is_depression`, `depression_pct`, `lakeside_risk`, `delta_risk`, `low_elev_risk`, `water_cooling`) that are **not computed by the live code**. The sample data was generated by a more advanced pipeline that is no longer present in the codebase.

4. **All metrics are relative, not absolute**: Percentile-based normalization means scores are relative to the specific city. A "high risk" cell in a low-risk city might score equally to a "low risk" cell in a high-risk city. Cross-city comparison is meaningless.

5. **Missing climate data**: No actual climate data is used — no precipitation records, temperature data, historical flood events, or climate projections. The scores are purely based on physical geography proxies.

### Live Coverage Flags vs. Sample Coverage Flags

The live code defines 6 coverage flags in `CoverageFlags`: `elevation`, `landcover`, `surface_water`, `rivers`, `forest`, `population`.

The sample data includes 8 coverage flags: `elevation`, `flow`, `landcover`, `surface_water`, `rivers`, `forest`, `population`, `buildings`.

The `flow` and `buildings` coverage flags do not exist in the live `CoverageFlags` interface or any live compute function.

### Sample Data vs. Live Code Discrepancy

The pre-computed sample data for Porto Alegre contains **12 additional metrics** not computed by the live grid service:

| Sample-Only Metric | Description | Risk Implication |
|---------------------|-------------|------------------|
| `flow_accum` / `flow_accum_pct` | Hydrological flow accumulation | Absent in live = flood risk underestimated |
| `is_depression` / `depression_pct` | Terrain depression detection | Absent in live = ponding risk missed |
| `lakeside_risk` | Proximity to large water bodies | Absent in live |
| `delta_risk` | River delta/confluence risk | Absent in live |
| `low_elev_risk` | Low elevation coastal risk | Absent in live |
| `water_cooling` | Water body cooling effect | Absent in live = heat risk less nuanced |
| `vegetation_pct` | Continuous vegetation index | Absent in live |
| `building_density` | Normalized building density | Absent in live |
| `pop_density_raw` | Absolute population density (people/km²) | Absent in live |
| `slope_mean` | Terrain slope | Absent in live = landslide score broken |

This means the sample/demo experience is significantly more accurate than what a live user would get for their own city.

---

## Intervention Zone Creation

### How Zones are Defined (Sample Data)

The sample zones file (`porto-alegre-zones.json`) contains pre-computed zones with these generation parameters:

```json
{
  "T_ACTIVE": 0.3,
  "T_COMBO": 0.1,
  "MIN_CELLS": 8,
  "TARGET_ZONES": 15
}
```

| Parameter | Meaning |
|-----------|---------|
| `T_ACTIVE` | Minimum hazard score threshold — cells below this are classified as LOW risk |
| `T_COMBO` | Minimum secondary hazard score to create a combined typology (e.g., FLOOD_HEAT) |
| `MIN_CELLS` | Minimum number of contiguous cells required to form a zone (prevents tiny zones) |
| `TARGET_ZONES` | Target number of output zones (controls clustering granularity) |

### Zone Clustering Algorithm

The zone generation (used for sample data) follows this pipeline:

1. **Hazard classification per cell**: Each cell is classified based on which hazard score exceeds `T_ACTIVE` (0.3):
   - If `flood_score ≥ 0.3` and `heat_score ≥ 0.1` → `FLOOD_HEAT`
   - If `flood_score ≥ 0.3` and `landslide_score ≥ 0.1` → `FLOOD_LANDSLIDE`
   - If `heat_score ≥ 0.3` and `landslide_score ≥ 0.1` → `HEAT_LANDSLIDE`
   - If `flood_score ≥ 0.3` → `FLOOD`
   - If `heat_score ≥ 0.3` → `HEAT`
   - If `landslide_score ≥ 0.3` → `LANDSLIDE`
   - Otherwise → `LOW`

2. **Spatial clustering**: Cells with the same typology label that are spatially adjacent are merged into contiguous zones. Zones smaller than `MIN_CELLS` (8) are dissolved into neighboring zones.

3. **Zone merging**: If the number of zones exceeds `TARGET_ZONES` (15), smaller zones are merged with their nearest same-typology neighbor until the target count is reached.

4. **Geometry construction**: Grid cells within each zone are dissolved into a single MultiPolygon geometry using polygon union operations.

### Zone Properties

Each zone gets these computed properties:

| Property | Description | Computation |
|----------|-------------|-------------|
| `zoneId` | Unique identifier | `zone_1`, `zone_2`, etc. |
| `typologyLabel` | Hazard classification | Based on thresholds above |
| `primaryHazard` | Dominant hazard | Hazard with highest mean score |
| `secondaryHazard` | Secondary hazard (if combo) | Second-highest hazard |
| `interventionType` | Recommended NBS category | Mapped from typology (see below) |
| `meanFlood` | Average flood score of all cells | Arithmetic mean |
| `meanHeat` | Average heat score of all cells | Arithmetic mean |
| `meanLandslide` | Average landslide score of all cells | Arithmetic mean |
| `maxFlood/Heat/Landslide` | Maximum scores in zone | Maximum across cells |
| `areaKm2` | Zone area | Cell count (each cell ≈ 1 km²) |
| `cellCount` | Number of grid cells | Count |
| `populationSum` | Total estimated population | Sum of cell population estimates |

---

## Zone Priority and Classification

### Typology → Intervention Type Mapping

| Typology | Assigned Intervention Type | Description |
|----------|---------------------------|-------------|
| `FLOOD` | `sponge_network` | Flood storage & delay solutions |
| `FLOOD_HEAT` | `sponge_network` | Prioritizes flood over heat |
| `FLOOD_LANDSLIDE` | `sponge_network` | Prioritizes flood over landslide |
| `HEAT` | `cooling_network` | Urban cooling & shade solutions |
| `HEAT_LANDSLIDE` | `cooling_network` | Prioritizes heat over landslide |
| `LANDSLIDE` | `slope_stabilization` | Slope stabilization solutions |
| `LOW` | `multi_benefit` | Hybrid/multi-benefit solutions |

### Intervention Categories and Eligible NBS Types

Each intervention category defines which zone typologies it applies to:

| Category | Applicable Typologies | Example Interventions |
|----------|----------------------|----------------------|
| **Flood Storage & Delay** | FLOOD, FLOOD_HEAT, FLOOD_LANDSLIDE | Floodable parks, sponge squares, bioswales, retention fields |
| **Urban Cooling & Shade** | HEAT, FLOOD_HEAT, HEAT_LANDSLIDE | Street trees, cool roofs, pocket forests, shade structures |
| **Slope Stabilization** | LANDSLIDE, FLOOD_LANDSLIDE, HEAT_LANDSLIDE | Terracing, vetiver grass, retaining walls, slope forests |
| **Multi-Benefit** | FLOOD_HEAT, FLOOD_LANDSLIDE, HEAT_LANDSLIDE, LOW | Constructed wetlands, green corridors, urban forests |

### Zone Priority Ranking

Zones are displayed in the UI sorted by **maximum risk score** (descending):

```
maxRisk = max(meanFlood, meanHeat, meanLandslide)
```

This means zones with the highest average hazard score in any category appear first, guiding users to prioritize the most at-risk areas.

### Porto Alegre Sample Zones Summary

| Zone | Typology | Intervention | Flood | Heat | Landslide | Cells | Area |
|------|----------|-------------|-------|------|-----------|-------|------|
| zone_12 | HEAT | cooling_network | 0.43 | **0.62** | 0.03 | 103 | 103 km² |
| zone_8 | FLOOD_HEAT | sponge_network | **0.60** | 0.60 | 0.01 | 30 | 30 km² |
| zone_14 | FLOOD | sponge_network | **0.56** | 0.26 | 0.00 | 173 | 173 km² |
| zone_1 | LANDSLIDE | slope_stabilization | 0.35 | 0.28 | **0.48** | 14 | 14 km² |
| zone_9 | FLOOD_HEAT | sponge_network | **0.45** | 0.48 | 0.05 | 39 | 39 km² |
| zone_15 | FLOOD | sponge_network | **0.46** | 0.23 | 0.02 | 303 | 303 km² |
| ... | ... | ... | ... | ... | ... | ... | ... |

---

## Known Risks and Limitations

### Data Quality Risks

| Risk | Severity | Description |
|------|----------|-------------|
| **Source attribution mismatch** | High | UI and metadata declare authoritative sources (WorldPop, Hansen Forest, JRC Water, HydroSHEDS, ESA WorldCover, GHSL) but all layers except elevation actually use OpenStreetMap. Users may make decisions believing they are using satellite-derived scientific datasets. |
| **OSM coverage variability** | High | OSM data completeness varies enormously by region. Cities in sub-Saharan Africa, South Asia, or Central America may have minimal building, land use, or water mapping. |
| **No actual climate data** | High | No precipitation, temperature, or historical event data is used. Risk scores are based entirely on geographic proxies (proximity to water, impervious surface, etc.). |
| **Sample data ≠ live data** | Medium | The sample demo uses 12+ additional metrics from a richer pipeline. Live users get a simpler, less accurate analysis. |
| **Elevation = DSM not DTM** | Medium | Copernicus DEM includes structures, inflating elevation in urban areas and distorting slope/low-lying calculations. |

### Algorithmic Risks

| Risk | Severity | Description |
|------|----------|-------------|
| **Flood score double-counts river proximity** | High | River proximity has 60% weight instead of intended ~45% due to duplicate variable assignment (`A` and `R` both = `river_prox_pct`). |
| **Landslide score is non-functional** | Critical | Slope and soil instability are hardcoded to 0. The score only reflects absence of forest (max 0.15). Cities with genuine landslide risk will not see it reflected. |
| **Relative normalization prevents comparison** | Medium | All percentile-based metrics are city-relative. A high-risk score in a safe city ≠ a high-risk score in a dangerous city. |
| **No uncertainty quantification** | Medium | Scores are presented as precise percentages with no confidence intervals or data quality indicators. |
| **Cell size assumes square Earth** | Low | Turf.js `squareGrid` uses kilometer-based squares which become trapezoidal at high latitudes. For tropical cities this is negligible but matters above ~50° latitude. |

### Operational Risks

| Risk | Severity | Description |
|------|----------|-------------|
| **Overpass API rate limiting** | Medium | Multiple concurrent layer fetches can trigger rate limits (HTTP 429) from the public Overpass API. |
| **Overpass API timeout** | Medium | Large cities with dense OSM data may timeout on the 60-second query limit. |
| **No data freshness tracking** | Low | Cached data has no automatic expiry (except OSM assets at 7 days). Elevation tiles persist indefinitely. |
| **No validation of input bounds** | Low | Extremely large bounding boxes (e.g., entire countries) are not rejected, potentially causing out-of-memory errors. |

### Recommendations for Improvement

1. **Fix flood score formula**: Replace duplicate `A` and `R` variables — use `flow_accum_pct` or `floodplain_adj_pct` for the second term.
2. **Implement slope calculation**: Derive slope from the Copernicus DEM grid to make landslide scores functional.
3. **Align source attribution**: Either update metadata/UI to truthfully say "OpenStreetMap" or implement actual connections to declared sources (WorldPop, Hansen, JRC, GHSL).
4. **Add data quality indicators**: Show coverage percentages per layer and warn users when coverage is below thresholds.
5. **Port sample data pipeline**: Bring the richer metrics (flow accumulation, depression detection, building density, etc.) from the sample data generator into the live code.
6. **Add climate data integration**: Incorporate precipitation return periods, historical flood events, or climate projection data for scientifically grounded risk assessment.

---

*Generated: February 2026*
*Codebase version: Current main branch*
