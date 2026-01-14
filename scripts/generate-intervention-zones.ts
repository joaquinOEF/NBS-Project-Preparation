import * as fs from 'fs';
import * as path from 'path';
import * as turf from '@turf/turf';

interface GridCell {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: {
    id: string;
    centroid: [number, number];
    metrics: {
      flood_score: number;
      heat_score: number;
      landslide_score: number;
      pop_density?: number;
      pop_density_raw?: number;
      building_density?: number;
      [key: string]: any;
    };
    coverage: Record<string, boolean>;
  };
}

interface GridData {
  cityLocode: string;
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  cellSizeMeters: number;
  totalCells: number;
  geoJson: {
    type: 'FeatureCollection';
    features: GridCell[];
  };
}

type HazardType = 'FLOOD' | 'HEAT' | 'LANDSLIDE';
type TypologyLabel = 
  | 'FLOOD' | 'HEAT' | 'LANDSLIDE' 
  | 'FLOOD_HEAT' | 'FLOOD_LANDSLIDE' | 'HEAT_LANDSLIDE'
  | 'LOW';

type InterventionType = 'sponge_network' | 'cooling_network' | 'slope_stabilization' | 'multi_benefit';

interface CellClassification {
  cellId: string;
  centroid: [number, number];
  flood: number;
  heat: number;
  landslide: number;
  population: number;
  typologyLabel: TypologyLabel;
  primaryHazard: HazardType | null;
  secondaryHazard: HazardType | null;
  dominanceGap: number;
  row: number;
  col: number;
}

interface Zone {
  zoneId: string;
  typologyLabel: TypologyLabel;
  primaryHazard: HazardType | null;
  secondaryHazard: HazardType | null;
  interventionType: InterventionType;
  meanFlood: number;
  meanHeat: number;
  meanLandslide: number;
  maxFlood: number;
  maxHeat: number;
  maxLandslide: number;
  populationSum: number;
  areaKm2: number;
  cellCount: number;
  cells: string[];
  geometry: any;
}

const T_ACTIVE = 0.30;
const T_COMBO = 0.10;
const MIN_CELLS = 8;
const TARGET_ZONES = 15;

function classifyCell(cell: GridCell, row: number, col: number): CellClassification {
  const m = cell.properties.metrics;
  const flood = m.flood_score ?? 0;
  const heat = m.heat_score ?? 0;
  const landslide = m.landslide_score ?? 0;
  const population = m.pop_density_raw ?? 0;
  
  const scores: [HazardType, number][] = [
    ['FLOOD', flood],
    ['HEAT', heat],
    ['LANDSLIDE', landslide],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  
  const [h1, v1] = scores[0];
  const [h2, v2] = scores[1];
  const dominanceGap = v1 - v2;
  
  let typologyLabel: TypologyLabel;
  let primaryHazard: HazardType | null = null;
  let secondaryHazard: HazardType | null = null;
  
  if (v1 < T_ACTIVE) {
    typologyLabel = 'LOW';
  } else if (dominanceGap <= T_COMBO) {
    const combo = [h1, h2].sort().join('_');
    typologyLabel = combo as TypologyLabel;
    primaryHazard = h1;
    secondaryHazard = h2;
  } else {
    typologyLabel = h1 as TypologyLabel;
    primaryHazard = h1;
    if (v2 >= T_ACTIVE * 0.8) {
      secondaryHazard = h2;
    }
  }
  
  return {
    cellId: cell.properties.id,
    centroid: cell.properties.centroid,
    flood,
    heat,
    landslide,
    population,
    typologyLabel,
    primaryHazard,
    secondaryHazard,
    dominanceGap,
    row,
    col,
  };
}

function getNeighbors(row: number, col: number, maxRow: number, maxCol: number): [number, number][] {
  const neighbors: [number, number][] = [];
  const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of deltas) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < maxRow && nc >= 0 && nc < maxCol) {
      neighbors.push([nr, nc]);
    }
  }
  return neighbors;
}

function findContiguousRegions(
  cells: Map<string, CellClassification>,
  gridPositions: Map<string, CellClassification>,
  maxRow: number,
  maxCol: number
): Map<string, string[]>[] {
  const visited = new Set<string>();
  const regions: { label: TypologyLabel; cells: string[] }[] = [];
  
  for (const cell of cells.values()) {
    if (visited.has(cell.cellId)) continue;
    
    const region: string[] = [];
    const queue = [cell];
    const label = cell.typologyLabel;
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.cellId)) continue;
      visited.add(current.cellId);
      region.push(current.cellId);
      
      const neighbors = getNeighbors(current.row, current.col, maxRow, maxCol);
      for (const [nr, nc] of neighbors) {
        const key = `${nr}_${nc}`;
        const neighbor = gridPositions.get(key);
        if (neighbor && !visited.has(neighbor.cellId) && neighbor.typologyLabel === label) {
          queue.push(neighbor);
        }
      }
    }
    
    regions.push({ label, cells: region });
  }
  
  return regions.map(r => new Map([[r.label, r.cells]]));
}

function hazardDistance(
  c1: { flood: number; heat: number; landslide: number },
  c2: { flood: number; heat: number; landslide: number }
): number {
  return Math.sqrt(
    Math.pow(c1.flood - c2.flood, 2) +
    Math.pow(c1.heat - c2.heat, 2) +
    Math.pow(c1.landslide - c2.landslide, 2)
  );
}

function getInterventionType(typologyLabel: TypologyLabel, primaryHazard: HazardType | null): InterventionType {
  if (typologyLabel === 'LOW') return 'multi_benefit';
  
  if (typologyLabel === 'FLOOD' || typologyLabel === 'FLOOD_HEAT' || typologyLabel === 'FLOOD_LANDSLIDE') {
    return 'sponge_network';
  }
  if (typologyLabel === 'HEAT') {
    return 'cooling_network';
  }
  if (typologyLabel === 'LANDSLIDE' || typologyLabel === 'HEAT_LANDSLIDE') {
    return 'slope_stabilization';
  }
  
  return 'multi_benefit';
}

function mergePolygons(cells: GridCell[]): any {
  if (cells.length === 0) return null;
  if (cells.length === 1) return cells[0].geometry;
  
  try {
    const features = cells.map(cell => turf.polygon(cell.geometry.coordinates));
    
    let merged: any = features[0];
    for (let i = 1; i < features.length; i++) {
      try {
        const unionResult = turf.union(turf.featureCollection([merged, features[i]]));
        if (unionResult) {
          merged = unionResult;
        }
      } catch (e) {
        continue;
      }
    }
    
    return merged.geometry;
  } catch (e) {
    console.warn('Failed to merge polygons, using bounding box fallback');
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const cell of cells) {
      const coords = cell.geometry.coordinates[0];
      for (const [lng, lat] of coords) {
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }
    
    return {
      type: 'Polygon',
      coordinates: [[
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ]],
    };
  }
}

function generateZones(gridData: GridData): Zone[] {
  const features = gridData.geoJson.features;
  const cellsById = new Map<string, GridCell>();
  const classificationsById = new Map<string, CellClassification>();
  const gridPositions = new Map<string, CellClassification>();
  
  const bounds = gridData.bounds;
  const cellSize = gridData.cellSizeMeters / 111000;
  
  let maxRow = 0, maxCol = 0;
  
  features.forEach((cell, idx) => {
    const [lng, lat] = cell.properties.centroid;
    const col = Math.floor((lng - bounds.minLng) / cellSize);
    const row = Math.floor((lat - bounds.minLat) / cellSize);
    maxRow = Math.max(maxRow, row + 1);
    maxCol = Math.max(maxCol, col + 1);
    
    cellsById.set(cell.properties.id, cell);
    const classification = classifyCell(cell, row, col);
    classificationsById.set(cell.properties.id, classification);
    gridPositions.set(`${row}_${col}`, classification);
  });
  
  const visited = new Set<string>();
  const rawRegions: { label: TypologyLabel; cellIds: string[]; cells: CellClassification[] }[] = [];
  
  for (const cell of classificationsById.values()) {
    if (visited.has(cell.cellId)) continue;
    
    const region: CellClassification[] = [];
    const queue = [cell];
    const label = cell.typologyLabel;
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.cellId)) continue;
      visited.add(current.cellId);
      region.push(current);
      
      const neighbors = getNeighbors(current.row, current.col, maxRow, maxCol);
      for (const [nr, nc] of neighbors) {
        const key = `${nr}_${nc}`;
        const neighbor = gridPositions.get(key);
        if (neighbor && !visited.has(neighbor.cellId) && neighbor.typologyLabel === label) {
          queue.push(neighbor);
        }
      }
    }
    
    rawRegions.push({ label, cellIds: region.map(c => c.cellId), cells: region });
  }
  
  rawRegions.sort((a, b) => b.cells.length - a.cells.length);
  
  const regionByCellId = new Map<string, number>();
  rawRegions.forEach((region, idx) => {
    region.cellIds.forEach(id => regionByCellId.set(id, idx));
  });
  
  const getRegionMeans = (region: { cells: CellClassification[] }) => ({
    flood: region.cells.reduce((s, c) => s + c.flood, 0) / region.cells.length,
    heat: region.cells.reduce((s, c) => s + c.heat, 0) / region.cells.length,
    landslide: region.cells.reduce((s, c) => s + c.landslide, 0) / region.cells.length,
  });
  
  const regionNeighbors = (regionIdx: number): Set<number> => {
    const neighbors = new Set<number>();
    const region = rawRegions[regionIdx];
    for (const cell of region.cells) {
      const cellNeighbors = getNeighbors(cell.row, cell.col, maxRow, maxCol);
      for (const [nr, nc] of cellNeighbors) {
        const key = `${nr}_${nc}`;
        const neighbor = gridPositions.get(key);
        if (neighbor) {
          const neighborRegion = regionByCellId.get(neighbor.cellId);
          if (neighborRegion !== undefined && neighborRegion !== regionIdx) {
            neighbors.add(neighborRegion);
          }
        }
      }
    }
    return neighbors;
  };
  
  const mergedRegions = [...rawRegions];
  const mergedInto = new Map<number, number>();
  
  const findRoot = (idx: number): number => {
    let current = idx;
    while (mergedInto.has(current)) {
      current = mergedInto.get(current)!;
    }
    return current;
  };
  
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < mergedRegions.length; i++) {
      const root = findRoot(i);
      if (root !== i) continue;
      
      const region = mergedRegions[root];
      if (region.cells.length >= MIN_CELLS) continue;
      
      const neighbors = regionNeighbors(root);
      if (neighbors.size === 0) continue;
      
      const regionMeans = getRegionMeans(region);
      let bestNeighbor = -1;
      let bestDistance = Infinity;
      
      for (const neighborIdx of neighbors) {
        const neighborRoot = findRoot(neighborIdx);
        if (neighborRoot === root) continue;
        
        const neighborMeans = getRegionMeans(mergedRegions[neighborRoot]);
        const dist = hazardDistance(regionMeans, neighborMeans);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestNeighbor = neighborRoot;
        }
      }
      
      if (bestNeighbor >= 0) {
        mergedRegions[bestNeighbor].cells.push(...region.cells);
        mergedRegions[bestNeighbor].cellIds.push(...region.cellIds);
        region.cellIds.forEach(id => regionByCellId.set(id, bestNeighbor));
        mergedInto.set(root, bestNeighbor);
        changed = true;
      }
    }
  }
  
  const finalRegions = mergedRegions.filter((_, idx) => !mergedInto.has(idx) || findRoot(idx) === idx);
  
  while (finalRegions.length > TARGET_ZONES) {
    finalRegions.sort((a, b) => a.cells.length - b.cells.length);
    const smallest = finalRegions[0];
    
    const smallestMeans = getRegionMeans(smallest);
    let bestIdx = -1;
    let bestDist = Infinity;
    
    for (let i = 1; i < finalRegions.length; i++) {
      const otherMeans = getRegionMeans(finalRegions[i]);
      const dist = hazardDistance(smallestMeans, otherMeans);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    
    if (bestIdx > 0) {
      finalRegions[bestIdx].cells.push(...smallest.cells);
      finalRegions[bestIdx].cellIds.push(...smallest.cellIds);
      finalRegions.shift();
    } else {
      break;
    }
  }
  
  const zones: Zone[] = finalRegions.map((region, idx) => {
    const cells = region.cells;
    const meanFlood = cells.reduce((s, c) => s + c.flood, 0) / cells.length;
    const meanHeat = cells.reduce((s, c) => s + c.heat, 0) / cells.length;
    const meanLandslide = cells.reduce((s, c) => s + c.landslide, 0) / cells.length;
    
    const maxFlood = Math.max(...cells.map(c => c.flood));
    const maxHeat = Math.max(...cells.map(c => c.heat));
    const maxLandslide = Math.max(...cells.map(c => c.landslide));
    
    const populationSum = cells.reduce((s, c) => s + c.population, 0);
    const areaKm2 = cells.length * Math.pow(gridData.cellSizeMeters / 1000, 2);
    
    const scores: [HazardType, number][] = [
      ['FLOOD', meanFlood],
      ['HEAT', meanHeat],
      ['LANDSLIDE', meanLandslide],
    ];
    scores.sort((a, b) => b[1] - a[1]);
    
    const [h1, v1] = scores[0];
    const [h2, v2] = scores[1];
    const gap = v1 - v2;
    
    let typologyLabel: TypologyLabel;
    let primaryHazard: HazardType | null = null;
    let secondaryHazard: HazardType | null = null;
    
    if (v1 < T_ACTIVE) {
      typologyLabel = 'LOW';
    } else if (gap <= T_COMBO) {
      const combo = [h1, h2].sort().join('_');
      typologyLabel = combo as TypologyLabel;
      primaryHazard = h1;
      secondaryHazard = h2;
    } else {
      typologyLabel = h1 as TypologyLabel;
      primaryHazard = h1;
      if (v2 >= T_ACTIVE * 0.7) {
        secondaryHazard = h2;
      }
    }
    
    const interventionType = getInterventionType(typologyLabel, primaryHazard);
    
    const cellGeometries = region.cellIds.map(id => cellsById.get(id)!);
    const geometry = mergePolygons(cellGeometries);
    
    return {
      zoneId: `zone_${idx + 1}`,
      typologyLabel,
      primaryHazard,
      secondaryHazard,
      interventionType,
      meanFlood,
      meanHeat,
      meanLandslide,
      maxFlood,
      maxHeat,
      maxLandslide,
      populationSum,
      areaKm2,
      cellCount: cells.length,
      cells: region.cellIds,
      geometry,
    };
  });
  
  return zones.sort((a, b) => {
    const aMax = Math.max(a.meanFlood, a.meanHeat, a.meanLandslide);
    const bMax = Math.max(b.meanFlood, b.meanHeat, b.meanLandslide);
    return bMax - aMax;
  });
}

async function main() {
  const gridPath = path.join(process.cwd(), 'client/public/sample-data/porto-alegre-grid.json');
  const outputPath = path.join(process.cwd(), 'client/public/sample-data/porto-alegre-zones.json');
  
  console.log('Loading grid data...');
  const gridData: GridData = JSON.parse(fs.readFileSync(gridPath, 'utf-8'));
  
  console.log(`Processing ${gridData.geoJson.features.length} cells...`);
  const zones = generateZones(gridData);
  
  console.log(`Generated ${zones.length} intervention zones:`);
  
  const summary = {
    sponge_network: 0,
    cooling_network: 0,
    slope_stabilization: 0,
    multi_benefit: 0,
  };
  
  zones.forEach(zone => {
    summary[zone.interventionType]++;
    console.log(`  ${zone.zoneId}: ${zone.typologyLabel} → ${zone.interventionType} (${zone.cellCount} cells, ${zone.areaKm2.toFixed(1)} km²)`);
  });
  
  console.log('\nIntervention summary:');
  console.log(`  Sponge Network (Flood): ${summary.sponge_network}`);
  console.log(`  Cooling Network (Heat): ${summary.cooling_network}`);
  console.log(`  Slope Stabilization (Landslide): ${summary.slope_stabilization}`);
  console.log(`  Multi-Benefit (Low risk): ${summary.multi_benefit}`);
  
  const output = {
    cityLocode: gridData.cityLocode,
    generatedAt: new Date().toISOString(),
    parameters: {
      T_ACTIVE,
      T_COMBO,
      MIN_CELLS,
      TARGET_ZONES,
    },
    totalZones: zones.length,
    interventionSummary: summary,
    geoJson: {
      type: 'FeatureCollection',
      features: zones.map(zone => ({
        type: 'Feature',
        geometry: zone.geometry,
        properties: {
          zoneId: zone.zoneId,
          typologyLabel: zone.typologyLabel,
          primaryHazard: zone.primaryHazard,
          secondaryHazard: zone.secondaryHazard,
          interventionType: zone.interventionType,
          meanFlood: zone.meanFlood,
          meanHeat: zone.meanHeat,
          meanLandslide: zone.meanLandslide,
          maxFlood: zone.maxFlood,
          maxHeat: zone.maxHeat,
          maxLandslide: zone.maxLandslide,
          populationSum: zone.populationSum,
          areaKm2: zone.areaKm2,
          cellCount: zone.cellCount,
        },
      })),
    },
    zones,
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nZones saved to ${outputPath}`);
}

main().catch(console.error);
