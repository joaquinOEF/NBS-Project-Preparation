# Neighborhood-Based Intervention Zones

## Overview

The NBS Project Preparation platform assigns intervention types to Porto Alegre's **94 IBGE census neighborhoods** (bairros), replacing the earlier system of synthetic zones (zone_1..zone_N).

Each neighborhood receives:
- **Risk scores** aggregated from the 250m v3 grid (HAND-driven flood, UHI heat, slope landslide)
- **Vulnerability factor** combining census poverty, infrastructure gaps, and population density
- **Priority score** = hazard × (1 + vulnerability) — equity-weighted ranking
- **Intervention type** based on dominant hazard (sponge/cooling/slope/multi-benefit)

## Why Neighborhoods Instead of Synthetic Zones

The original zone system used flood-fill clustering on grid cells to create ~15 algorithmically defined zones. While technically sound:

1. **"zone_14" means nothing to a city official** — neighborhoods like "Restinga" or "Centro Histórico" are immediately recognizable
2. **Misaligned with city admin boundaries** — the city operates through bairros for planning, budgeting, and service delivery
3. **Census data is per-neighborhood** — poverty, income, infrastructure access maps directly to bairros
4. **CBO concept notes become actionable** — when the agent says "deploy sponge network in Arquipélago," the city knows exactly where

## Data Pipeline

```
┌─────────────────────────────────────────────────────┐
│  scripts/generate-neighborhood-zones.ts              │
├─────────────────────────────────────────────────────┤
│  INPUT:                                              │
│  ├── porto-alegre-grid-250m.json (16,576 cells)     │
│  │   └── flood_score, heat_score, landslide_score   │
│  │       (HAND-driven v3 scoring)                   │
│  └── porto-alegre-ibge-indicators.json (94 bairros) │
│      └── poverty_rate, pct_formal_sewage,           │
│          pop_density_km2, boundaries                │
│                                                      │
│  PROCESS:                                            │
│  1. Point-in-polygon: cell centroid → bairro         │
│  2. Aggregate: mean/max risk scores per bairro       │
│  3. Classify: dominant hazard → typology + type      │
│  4. Vulnerability: poverty × 0.5 + infra × 0.3      │
│     + exposure × 0.2                                 │
│  5. Priority: hazard × (1 + vulnerability)           │
│                                                      │
│  OUTPUT:                                             │
│  └── porto-alegre-neighborhood-zones.json            │
│      └── 94 neighborhoods with risk + priority       │
└─────────────────────────────────────────────────────┘
```

## Vulnerability-Weighted Priority

### Rationale (Climate Justice)

Two neighborhoods with identical flood risk shouldn't necessarily get equal priority for NBS investment. A low-income neighborhood with poor sewage infrastructure is more vulnerable — it has less capacity to absorb and recover from climate shocks.

The BPJP/C40 funding criteria explicitly reward equity-informed prioritization. By weighting priority scores with census vulnerability data, the platform surfaces the neighborhoods where NBS investment would deliver the most social benefit.

### Formula

```
vulnerability_factor = clamp(0, 1,
  0.50 × poverty_rate +                    // Income deprivation (biggest driver)
  0.30 × (1 - pct_formal_sewage) +         // Infrastructure gap (flood amplifier)
  0.20 × pop_density / max_pop_density      // Exposure (more people at risk)
)

priority_score = dominant_hazard_score × (1 + vulnerability_factor)
```

### Weight Justification

| Weight | Factor | Why |
|--------|--------|-----|
| 50% | Poverty rate | Strongest predictor of climate vulnerability — determines recovery capacity, insurance access, and ability to relocate |
| 30% | Infrastructure gap (1 - sewage) | Directly amplifies flood risk — inadequate drainage turns moderate rain into flooding; also correlates with other infrastructure deficits |
| 20% | Population density (normalized) | More people exposed per km² means more people at risk; also correlates with heat island intensity |

### Effect on Rankings

A neighborhood with 20% poverty and 40% sewage gap gets:
- `vulnerability = 0.50 × 0.20 + 0.30 × 0.60 + 0.20 × 0.5 = 0.38`
- `priority = hazard × 1.38` (38% boost)

A wealthy neighborhood with similar hazard exposure gets:
- `vulnerability = 0.50 × 0.03 + 0.30 × 0.05 + 0.20 × 0.3 = 0.09`
- `priority = hazard × 1.09` (9% boost)

The high-poverty neighborhood ranks significantly higher for intervention, even with identical hazard scores.

## Hazard Classification

Same thresholds as the previous zone system for consistency:

| Parameter | Value | Meaning |
|-----------|-------|---------|
| T_ACTIVE | 0.30 | Hazard below this is "inactive" — neighborhood classified as LOW |
| T_COMBO | 0.10 | If top two hazards are within this gap, it's a multi-hazard zone |

### Typology → Intervention Mapping

| Typology | Intervention | Description |
|----------|-------------|-------------|
| FLOOD, FLOOD_HEAT, FLOOD_LANDSLIDE | `sponge_network` | Floodable parks, detention basins, bioswales |
| HEAT | `cooling_network` | Tree corridors, green roofs, pocket parks |
| LANDSLIDE, HEAT_LANDSLIDE | `slope_stabilization` | Reforestation, terraces, riparian buffers |
| LOW | `multi_benefit` | Connectivity corridors, incremental resilience |

## Spatial Join Details

### Method: Point-in-Polygon

Each 250m grid cell's centroid is tested against all 94 neighborhood polygon boundaries using Turf.js `booleanPointInPolygon`.

### Edge Cell Handling

Grid cells whose centroids fall outside all neighborhood polygons (typically over Lake Guaíba or beyond city limits) are assigned to the **nearest neighborhood centroid** as a fallback. These are mostly water cells with zero heat score, so they don't significantly affect neighborhood-level aggregations.

Typical stats for Porto Alegre:
- ~54% cells assigned via point-in-polygon
- ~46% via nearest-centroid fallback (water/edge cells)
- 0 unassigned

## Output Schema

Each neighborhood in `porto-alegre-neighborhood-zones.json`:

```typescript
{
  zoneId: string;                // Slugified name (e.g. "santo_antonio")
  neighbourhoodName: string;     // Display name (e.g. "Santo Antônio")
  neighbourhoodNumber: string;   // IBGE census code
  typologyLabel: TypologyLabel;  // FLOOD | HEAT | ... | LOW
  primaryHazard: HazardType;     // FLOOD | HEAT | LANDSLIDE | null
  secondaryHazard: HazardType;   // Secondary hazard or null
  interventionType: InterventionType;
  meanFlood: number;             // 0-1 average flood score
  meanHeat: number;
  meanLandslide: number;
  maxFlood: number;              // Peak cell score in neighborhood
  maxHeat: number;
  maxLandslide: number;
  populationTotal: number;       // Census population
  povertyRate: number;           // 0-1 decimal
  pctFormalSewage: number;       // 0-1 decimal
  pctLowIncome: number;          // % in lowest income bracket
  areaKm2: number;
  popDensityKm2: number;
  cellCount: number;             // 250m grid cells in this neighborhood
  vulnerabilityFactor: number;   // 0-1 composite
  priorityScore: number;         // hazard × (1 + vulnerability)
}
```

## Porto Alegre Results (April 2026)

### Distribution

| Intervention | Count | % |
|-------------|-------|---|
| Cooling Network (Heat) | 61 | 65% |
| Sponge Network (Flood) | 24 | 26% |
| Multi-Benefit (Low) | 8 | 9% |
| Slope Stabilization | 1 | 1% |

### Top 5 Priority Neighborhoods

| Neighborhood | Hazard | Priority | Poverty | Intervention |
|-------------|--------|----------|---------|-------------|
| Bom Fim | HEAT | 1.20 | 8.0% | Cooling Network |
| Bom Jesus | HEAT | 1.17 | 27.1% | Cooling Network |
| Vila Ipiranga | HEAT | 1.15 | 4.0% | Cooling Network |
| Cristo Redentor | HEAT | 1.14 | 6.0% | Cooling Network |
| Vila Jardim | HEAT | 1.13 | 13.7% | Cooling Network |

### Flood-Dominant Neighborhoods

| Neighborhood | Flood Score | Priority | Poverty |
|-------------|------------|----------|---------|
| Arquipélago | 0.58 | 0.85 | 12.5% |
| Farrapos | 0.58 | 0.82 | 21.2% |
| Humaitá | 0.58 | 0.73 | 8.5% |

## Usage

### Regenerate zones

```bash
npx tsx scripts/generate-neighborhood-zones.ts
```

Requires the 250m grid file (run `generate-grid-250m.ts` first if missing). Falls back to 1km grid if 250m not available.

### In the app

The neighborhood zones are loaded as the default zone source throughout:
- **ConceptNoteMap**: Zone boundaries with neighborhood names as labels
- **MapMicroapp**: Default `zoneSource` is `neighborhood_zones`
- **Site Explorer**: "Neighborhood Zones" layer with risk-colored boundaries
- **CBO Agent**: References neighborhoods by name in conversation
- **Concept Note**: Section B/C include neighborhood names and intervention types

## Known Limitations

1. **MAUP**: Large bairros (e.g. Arquipélago at 66 km²) average out intra-neighborhood variation. The `secondaryHazard` field partially addresses this.
2. **Water cell dilution**: Coastal neighborhoods absorb water grid cells via fallback, slightly lowering mean risk scores.
3. **Heat dominance**: 65% of neighborhoods classify as heat-dominant because UHI factors (building density, impervious surfaces) are pervasive across urban areas. Flood risk is more localized.
4. **Static vulnerability**: Census data is a point-in-time snapshot. Poverty rates and infrastructure change over time.
5. **No landslide neighborhoods**: Only 1 neighborhood (Cascata) has enough slope to classify as landslide-dominant. Porto Alegre's morros are spread across multiple bairros at moderate levels.
