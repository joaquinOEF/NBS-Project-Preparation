import * as turf from '@turf/turf';

export interface GridCell {
  id: string;
  geometry: any;
  centroid: [number, number];
  metrics: CellMetrics;
  coverage: CoverageFlags;
}

export interface CellMetrics {
  elevation_mean: number | null;
  elevation_min: number | null;
  elevation_max: number | null;
  slope_mean: number | null;
  low_lying_pct: number | null;
  dist_river_m: number | null;
  river_prox_pct: number | null;
  dist_water_m: number | null;
  floodplain_adj_pct: number | null;
  imperv_pct: number | null;
  green_pct: number | null;
  canopy_pct: number | null;
  built_pct: number | null;
  pop_density: number | null;
  flood_score: number | null;
  heat_score: number | null;
  landslide_score: number | null;
}

export interface CoverageFlags {
  elevation: boolean;
  landcover: boolean;
  surface_water: boolean;
  rivers: boolean;
  forest: boolean;
  population: boolean;
}

export interface GridResult {
  cityLocode: string;
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  cellSizeMeters: number;
  totalCells: number;
  cells: GridCell[];
  geoJson: any;
  coverage: {
    elevation: number;
    landcover: number;
    surface_water: number;
    rivers: number;
    forest: number;
    population: number;
  };
  metadata: {
    generatedAt: string;
    version: string;
  };
}

export function generateGrid(
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  cellSizeMeters: number = 250
): any {
  const bbox: [number, number, number, number] = [
    bounds.minLng,
    bounds.minLat,
    bounds.maxLng,
    bounds.maxLat,
  ];

  const cellSideKm = cellSizeMeters / 1000;
  const grid = turf.squareGrid(bbox, cellSideKm, { units: 'kilometers' });

  grid.features.forEach((feature, index) => {
    const centroid = turf.centroid(feature);
    feature.properties = {
      id: `cell_${index}`,
      centroid: centroid.geometry.coordinates,
      metrics: createEmptyMetrics(),
      coverage: createEmptyCoverage(),
    };
  });

  return grid;
}

function createEmptyMetrics(): CellMetrics {
  return {
    elevation_mean: null,
    elevation_min: null,
    elevation_max: null,
    slope_mean: null,
    low_lying_pct: null,
    dist_river_m: null,
    river_prox_pct: null,
    dist_water_m: null,
    floodplain_adj_pct: null,
    imperv_pct: null,
    green_pct: null,
    canopy_pct: null,
    built_pct: null,
    pop_density: null,
    flood_score: null,
    heat_score: null,
    landslide_score: null,
  };
}

function createEmptyCoverage(): CoverageFlags {
  return {
    elevation: false,
    landcover: false,
    surface_water: false,
    rivers: false,
    forest: false,
    population: false,
  };
}

export function computeElevationMetrics(
  grid: any,
  elevationData: any
): any {
  if (!elevationData?.contours?.features) return grid;

  const contourLines = elevationData.contours.features;

  for (const cell of grid.features) {
    const cellPolygon = cell;
    let elevations: number[] = [];

    for (const contour of contourLines) {
      if (!contour.geometry || !contour.properties?.elevation) continue;

      try {
        if (turf.booleanIntersects(cellPolygon, contour)) {
          elevations.push(contour.properties.elevation);
        }
      } catch (e) {
        continue;
      }
    }

    if (elevations.length > 0) {
      cell.properties.metrics.elevation_mean = elevations.reduce((a, b) => a + b, 0) / elevations.length;
      cell.properties.metrics.elevation_min = Math.min(...elevations);
      cell.properties.metrics.elevation_max = Math.max(...elevations);
      cell.properties.coverage.elevation = true;
    }
  }

  const allElevations = grid.features
    .filter((c: any) => c.properties.metrics.elevation_mean !== null)
    .map((c: any) => c.properties.metrics.elevation_mean);

  if (allElevations.length > 0) {
    const sortedElevations = [...allElevations].sort((a, b) => a - b);
    for (const cell of grid.features) {
      if (cell.properties.metrics.elevation_mean !== null) {
        const rank = sortedElevations.indexOf(cell.properties.metrics.elevation_mean);
        const percentile = rank / sortedElevations.length;
        cell.properties.metrics.low_lying_pct = 1 - percentile;
      }
    }
  }

  return grid;
}

export function computeLandcoverMetrics(
  grid: any,
  landcoverData: any
): any {
  if (!landcoverData?.geoJson?.features) return grid;

  const landcoverFeatures = landcoverData.geoJson.features;

  for (const cell of grid.features) {
    const cellPolygon = cell;
    let cellArea = 0;
    try {
      cellArea = turf.area(cellPolygon);
    } catch (e) {
      continue;
    }

    let impervArea = 0;
    let greenArea = 0;
    let hasData = false;

    for (const feature of landcoverFeatures) {
      if (!feature.geometry) continue;

      try {
        const intersection = turf.intersect(turf.featureCollection([cellPolygon, feature]));
        if (!intersection) continue;

        hasData = true;
        const intersectArea = turf.area(intersection);
        const props = feature.properties || {};
        const landuse = props.landuse || '';
        const natural = props.natural || '';

        if (landuse === 'residential' || landuse === 'commercial' || landuse === 'industrial' || landuse === 'retail') {
          impervArea += intersectArea;
        } else if (natural === 'wood' || landuse === 'forest' || landuse === 'grass' || natural === 'grassland' || natural === 'scrub') {
          greenArea += intersectArea;
        }
      } catch (e) {
        continue;
      }
    }

    if (hasData && cellArea > 0) {
      cell.properties.metrics.imperv_pct = Math.min(1, impervArea / cellArea);
      cell.properties.metrics.green_pct = Math.min(1, greenArea / cellArea);
      cell.properties.coverage.landcover = true;
    }
  }

  return grid;
}

export function computeRiverMetrics(
  grid: any,
  riversData: any
): any {
  if (!riversData?.geoJson?.features) return grid;

  const riverFeatures = riversData.geoJson.features.filter(
    (f: any) => f.geometry?.type === 'LineString' || f.geometry?.type === 'MultiLineString'
  );

  if (riverFeatures.length === 0) return grid;

  const allDistances: number[] = [];

  for (const cell of grid.features) {
    const centroid = cell.properties.centroid;
    if (!centroid) continue;

    let minDist = Infinity;

    for (const river of riverFeatures) {
      try {
        const pt = turf.point(centroid);
        const dist = turf.pointToLineDistance(pt, river, { units: 'meters' });
        if (dist < minDist) {
          minDist = dist;
        }
      } catch (e) {
        continue;
      }
    }

    if (minDist !== Infinity) {
      cell.properties.metrics.dist_river_m = minDist;
      cell.properties.coverage.rivers = true;
      allDistances.push(minDist);
    }
  }

  if (allDistances.length > 0) {
    const sortedDistances = [...allDistances].sort((a, b) => a - b);
    for (const cell of grid.features) {
      if (cell.properties.metrics.dist_river_m !== null) {
        const rank = sortedDistances.indexOf(cell.properties.metrics.dist_river_m);
        const percentile = rank / sortedDistances.length;
        cell.properties.metrics.river_prox_pct = 1 - percentile;
      }
    }
  }

  return grid;
}

export function computeWaterMetrics(
  grid: any,
  waterData: any
): any {
  if (!waterData?.geoJson?.features) return grid;

  const waterFeatures = waterData.geoJson.features;
  const allDistances: number[] = [];

  for (const cell of grid.features) {
    const centroid = cell.properties.centroid;
    if (!centroid) continue;

    let minDist = Infinity;

    for (const water of waterFeatures) {
      if (!water.geometry) continue;

      try {
        const pt = turf.point(centroid);
        if (water.geometry.type === 'Polygon' || water.geometry.type === 'MultiPolygon') {
          if (turf.booleanPointInPolygon(pt, water)) {
            minDist = 0;
            break;
          }
          const boundary = turf.polygonToLine(water);
          if (boundary.type === 'Feature' && boundary.geometry.type === 'LineString') {
            const dist = turf.pointToLineDistance(pt, boundary as any, { units: 'meters' });
            if (dist < minDist) minDist = dist;
          } else if (boundary.type === 'FeatureCollection') {
            for (const line of boundary.features) {
              if (line.geometry.type === 'LineString') {
                const dist = turf.pointToLineDistance(pt, line as any, { units: 'meters' });
                if (dist < minDist) minDist = dist;
              }
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    if (minDist !== Infinity) {
      cell.properties.metrics.dist_water_m = minDist;
      cell.properties.coverage.surface_water = true;
      allDistances.push(minDist);
    }
  }

  if (allDistances.length > 0) {
    const sortedDistances = [...allDistances].sort((a, b) => a - b);
    for (const cell of grid.features) {
      if (cell.properties.metrics.dist_water_m !== null) {
        const rank = sortedDistances.indexOf(cell.properties.metrics.dist_water_m);
        const percentile = rank / sortedDistances.length;
        cell.properties.metrics.floodplain_adj_pct = 1 - percentile;
      }
    }
  }

  return grid;
}

export function computeForestMetrics(
  grid: any,
  forestData: any
): any {
  if (!forestData?.geoJson?.features) return grid;

  const forestFeatures = forestData.geoJson.features;

  for (const cell of grid.features) {
    const cellPolygon = cell;
    let cellArea = 0;
    try {
      cellArea = turf.area(cellPolygon);
    } catch (e) {
      continue;
    }

    let forestArea = 0;
    let hasData = false;

    for (const feature of forestFeatures) {
      if (!feature.geometry) continue;

      try {
        const intersection = turf.intersect(turf.featureCollection([cellPolygon, feature]));
        if (!intersection) continue;

        hasData = true;
        forestArea += turf.area(intersection);
      } catch (e) {
        continue;
      }
    }

    if (hasData && cellArea > 0) {
      cell.properties.metrics.canopy_pct = Math.min(1, forestArea / cellArea);
      cell.properties.coverage.forest = true;
    }
  }

  return grid;
}

export function computePopulationMetrics(
  grid: any,
  populationData: any
): any {
  if (!populationData?.geoJson?.features) return grid;

  const popFeatures = populationData.geoJson.features;

  for (const cell of grid.features) {
    const cellPolygon = cell;
    let cellArea = 0;
    try {
      cellArea = turf.area(cellPolygon);
    } catch (e) {
      continue;
    }

    let builtArea = 0;
    let hasData = false;

    for (const feature of popFeatures) {
      if (!feature.geometry) continue;

      try {
        const intersection = turf.intersect(turf.featureCollection([cellPolygon, feature]));
        if (!intersection) continue;

        hasData = true;
        builtArea += turf.area(intersection);
      } catch (e) {
        continue;
      }
    }

    if (hasData && cellArea > 0) {
      cell.properties.metrics.built_pct = Math.min(1, builtArea / cellArea);
      cell.properties.metrics.pop_density = builtArea / cellArea;
      cell.properties.coverage.population = true;
    }
  }

  return grid;
}

export function computeCompositeScores(grid: any): any {
  for (const cell of grid.features) {
    const m = cell.properties.metrics;

    const A = m.river_prox_pct ?? 0;
    const E = m.low_lying_pct ?? 0;
    const I = m.imperv_pct ?? 0;
    const R = m.river_prox_pct ?? 0;
    const C = m.canopy_pct ?? 0;
    const P = m.pop_density ?? 0;
    const S = 0;
    const U = 0;

    m.flood_score = 0.45 * A + 0.20 * E + 0.20 * I + 0.15 * R;
    m.heat_score = 0.45 * I + 0.35 * P + 0.20 * (1 - C);
    m.landslide_score = 0.55 * S + 0.30 * U + 0.15 * (1 - C);
  }

  return grid;
}

export function calculateCoverageSummary(grid: any): { [key: string]: number } {
  const totalCells = grid.features.length;
  if (totalCells === 0) return { elevation: 0, landcover: 0, surface_water: 0, rivers: 0, forest: 0, population: 0 };

  const counts = { elevation: 0, landcover: 0, surface_water: 0, rivers: 0, forest: 0, population: 0 };

  for (const cell of grid.features) {
    const cov = cell.properties.coverage;
    if (cov.elevation) counts.elevation++;
    if (cov.landcover) counts.landcover++;
    if (cov.surface_water) counts.surface_water++;
    if (cov.rivers) counts.rivers++;
    if (cov.forest) counts.forest++;
    if (cov.population) counts.population++;
  }

  return {
    elevation: Math.round((counts.elevation / totalCells) * 100),
    landcover: Math.round((counts.landcover / totalCells) * 100),
    surface_water: Math.round((counts.surface_water / totalCells) * 100),
    rivers: Math.round((counts.rivers / totalCells) * 100),
    forest: Math.round((counts.forest / totalCells) * 100),
    population: Math.round((counts.population / totalCells) * 100),
  };
}
