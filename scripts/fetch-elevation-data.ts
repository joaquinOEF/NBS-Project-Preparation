import * as fs from 'fs';
import * as path from 'path';
import * as GeoTIFF from 'geotiff';

const COPERNICUS_BASE_URL = 'https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com';
const CACHE_DIR = './dem_cache';

interface TileInfo {
  id: string;
  url: string;
  lat: number;
  lng: number;
}

interface TileData {
  data: Float32Array;
  width: number;
  height: number;
  bbox: number[];
}

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function formatCoord(value: number, isLat: boolean): string {
  const prefix = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  const absVal = Math.abs(value);
  const padded = isLat 
    ? absVal.toString().padStart(2, '0') 
    : absVal.toString().padStart(3, '0');
  return `${prefix}${padded}_00`;
}

function getTileId(lat: number, lng: number): string {
  const latFloor = Math.floor(lat);
  const lngFloor = Math.floor(lng);
  const latStr = formatCoord(latFloor, true);
  const lngStr = formatCoord(lngFloor, false);
  return `Copernicus_DSM_COG_10_${latStr}_${lngStr}_DEM`;
}

function getTileUrl(tileId: string): string {
  return `${COPERNICUS_BASE_URL}/${tileId}/${tileId}.tif`;
}

function getRequiredTiles(bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number }): TileInfo[] {
  const tiles: TileInfo[] = [];
  
  const minLatFloor = Math.floor(bounds.minLat);
  const maxLatFloor = Math.floor(bounds.maxLat);
  const minLngFloor = Math.floor(bounds.minLng);
  const maxLngFloor = Math.floor(bounds.maxLng);
  
  for (let lat = minLatFloor; lat <= maxLatFloor; lat++) {
    for (let lng = minLngFloor; lng <= maxLngFloor; lng++) {
      const tileId = getTileId(lat, lng);
      tiles.push({
        id: tileId,
        url: getTileUrl(tileId),
        lat,
        lng,
      });
    }
  }
  
  return tiles;
}

function getCachePath(tileId: string): string {
  return path.join(CACHE_DIR, `${tileId}.tif`);
}

function isTileCached(tileId: string): boolean {
  return fs.existsSync(getCachePath(tileId));
}

async function downloadTile(tile: TileInfo): Promise<string> {
  ensureCacheDir();
  const cachePath = getCachePath(tile.id);
  
  if (isTileCached(tile.id)) {
    console.log(`Tile ${tile.id} already cached`);
    return cachePath;
  }
  
  console.log(`Downloading tile ${tile.id}...`);
  
  const response = await fetch(tile.url);
  
  if (!response.ok) {
    if (response.status === 404) {
      console.log(`Tile ${tile.id} not found (ocean/void area)`);
      throw new Error(`TILE_NOT_FOUND: ${tile.id}`);
    }
    throw new Error(`Failed to download tile: ${response.status}`);
  }
  
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(cachePath, Buffer.from(buffer));
  console.log(`Tile ${tile.id} downloaded (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  
  return cachePath;
}

async function readTileData(tilePath: string): Promise<TileData> {
  const tiff = await GeoTIFF.fromFile(tilePath);
  const image = await tiff.getImage();
  
  const width = image.getWidth();
  const height = image.getHeight();
  const bbox = image.getBoundingBox();
  
  const rasters = await image.readRasters();
  const data = rasters[0] as Float32Array;
  
  return { data, width, height, bbox };
}

async function loadElevationGrid(
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  targetResolution: number = 90
) {
  const tiles = getRequiredTiles(bounds);
  console.log(`Required tiles: ${tiles.map(t => t.id).join(', ')}`);
  
  const tileDataMap = new Map<string, TileData>();
  
  for (const tile of tiles) {
    try {
      const cachePath = await downloadTile(tile);
      const tileData = await readTileData(cachePath);
      tileDataMap.set(tile.id, tileData);
    } catch (error: any) {
      if (error.message?.startsWith('TILE_NOT_FOUND')) {
        console.log(`Skipping missing tile ${tile.id}`);
        continue;
      }
      throw error;
    }
  }
  
  if (tileDataMap.size === 0) {
    throw new Error('No elevation data available for this area');
  }

  const latSpan = bounds.maxLat - bounds.minLat;
  const lngSpan = bounds.maxLng - bounds.minLng;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos((bounds.minLat + bounds.maxLat) / 2 * Math.PI / 180);
  
  const heightMeters = latSpan * metersPerDegreeLat;
  const widthMeters = lngSpan * metersPerDegreeLng;
  
  const gridHeight = Math.ceil(heightMeters / targetResolution);
  const gridWidth = Math.ceil(widthMeters / targetResolution);
  
  console.log(`Creating elevation grid: ${gridWidth}x${gridHeight} (${targetResolution}m resolution)`);
  
  const grid: number[][] = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(0));
  
  const lngStep = lngSpan / gridWidth;
  const latStep = latSpan / gridHeight;
  
  let minElev = Infinity, maxElev = -Infinity;
  
  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      const lng = bounds.minLng + (col + 0.5) * lngStep;
      const lat = bounds.maxLat - (row + 0.5) * latStep;
      
      const tileId = getTileId(lat, lng);
      const tileData = tileDataMap.get(tileId);
      
      if (tileData) {
        const { data, width, height, bbox } = tileData;
        const [tileMinLng, tileMinLat, tileMaxLng, tileMaxLat] = bbox;
        
        const tileCol = Math.floor((lng - tileMinLng) / (tileMaxLng - tileMinLng) * width);
        const tileRow = Math.floor((tileMaxLat - lat) / (tileMaxLat - tileMinLat) * height);
        
        if (tileCol >= 0 && tileCol < width && tileRow >= 0 && tileRow < height) {
          const idx = tileRow * width + tileCol;
          const elevation = data[idx];
          grid[row][col] = elevation === -9999 ? 0 : elevation;
          if (grid[row][col] > 0) {
            minElev = Math.min(minElev, grid[row][col]);
            maxElev = Math.max(maxElev, grid[row][col]);
          }
        }
      }
    }
  }
  
  return {
    data: grid,
    width: gridWidth,
    height: gridHeight,
    cellSize: targetResolution,
    bounds,
    minElevation: minElev === Infinity ? 0 : minElev,
    maxElevation: maxElev === -Infinity ? 0 : maxElev,
  };
}

function generateContours(grid: { data: number[][]; width: number; height: number; bounds: any }) {
  const { width, height, bounds, data } = grid;
  const features: any[] = [];

  const lngStep = (bounds.maxLng - bounds.minLng) / width;
  const latStep = (bounds.maxLat - bounds.minLat) / height;

  let minElev = Infinity, maxElev = -Infinity;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const e = data[row][col];
      if (e > 0) {
        minElev = Math.min(minElev, e);
        maxElev = Math.max(maxElev, e);
      }
    }
  }

  console.log(`Elevation range: ${minElev.toFixed(0)}m - ${maxElev.toFixed(0)}m`);

  const range = maxElev - minElev;
  let contourInterval = 10;
  if (range > 500) contourInterval = 50;
  else if (range > 200) contourInterval = 25;
  else if (range < 50) contourInterval = 5;

  console.log(`Using contour interval: ${contourInterval}m`);

  const startElev = Math.ceil(minElev / contourInterval) * contourInterval;
  
  let contourId = 0;
  for (let elev = startElev; elev <= maxElev; elev += contourInterval) {
    const segments: [number, number][][] = [];
    
    for (let row = 0; row < height - 1; row++) {
      for (let col = 0; col < width - 1; col++) {
        const tl = data[row][col];
        const tr = data[row][col + 1];
        const bl = data[row + 1][col];
        const br = data[row + 1][col + 1];

        if ([tl, tr, bl, br].some(v => v <= 0)) continue;

        const crossings: [number, number][] = [];
        
        if ((tl < elev && tr >= elev) || (tl >= elev && tr < elev)) {
          const t = (elev - tl) / (tr - tl);
          crossings.push([
            bounds.minLng + (col + t) * lngStep,
            bounds.maxLat - row * latStep
          ]);
        }
        
        if ((bl < elev && br >= elev) || (bl >= elev && br < elev)) {
          const t = (elev - bl) / (br - bl);
          crossings.push([
            bounds.minLng + (col + t) * lngStep,
            bounds.maxLat - (row + 1) * latStep
          ]);
        }
        
        if ((tl < elev && bl >= elev) || (tl >= elev && bl < elev)) {
          const t = (elev - tl) / (bl - tl);
          crossings.push([
            bounds.minLng + col * lngStep,
            bounds.maxLat - (row + t) * latStep
          ]);
        }
        
        if ((tr < elev && br >= elev) || (tr >= elev && br < elev)) {
          const t = (elev - tr) / (br - tr);
          crossings.push([
            bounds.minLng + (col + 1) * lngStep,
            bounds.maxLat - (row + t) * latStep
          ]);
        }

        if (crossings.length >= 2) {
          segments.push([crossings[0], crossings[1]]);
        }
      }
    }

    const mergedLines = mergeContourSegments(segments);
    const isMajor = elev % 50 === 0;
    
    for (const line of mergedLines) {
      if (line.length >= 2) {
        features.push({
          type: "Feature",
          properties: { id: `contour-${contourId++}`, elevation: elev, isMajor },
          geometry: { type: "LineString", coordinates: line },
        });
      }
    }
  }

  console.log(`Generated ${features.length} contour lines`);
  return { type: "FeatureCollection", features };
}

function mergeContourSegments(segments: [number, number][][]): [number, number][][] {
  if (segments.length === 0) return [];
  
  const epsilon = 0.0001;
  const lines: [number, number][][] = [];
  const used = new Set<number>();
  
  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    
    let line = [...segments[i]];
    used.add(i);
    
    let extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue;
        
        const seg = segments[j];
        const lineStart = line[0];
        const lineEnd = line[line.length - 1];
        
        if (Math.abs(lineEnd[0] - seg[0][0]) < epsilon && Math.abs(lineEnd[1] - seg[0][1]) < epsilon) {
          line.push(seg[1]);
          used.add(j);
          extended = true;
        } else if (Math.abs(lineEnd[0] - seg[1][0]) < epsilon && Math.abs(lineEnd[1] - seg[1][1]) < epsilon) {
          line.push(seg[0]);
          used.add(j);
          extended = true;
        } else if (Math.abs(lineStart[0] - seg[1][0]) < epsilon && Math.abs(lineStart[1] - seg[1][1]) < epsilon) {
          line.unshift(seg[0]);
          used.add(j);
          extended = true;
        } else if (Math.abs(lineStart[0] - seg[0][0]) < epsilon && Math.abs(lineStart[1] - seg[0][1]) < epsilon) {
          line.unshift(seg[1]);
          used.add(j);
          extended = true;
        }
      }
    }
    
    if (line.length >= 3) {
      lines.push(line);
    }
  }
  
  return lines;
}

const D8_DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],          [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

function computeD8FlowDirection(dem: number[][], width: number, height: number): number[][] {
  const flowDir: number[][] = Array.from({ length: height }, () => Array(width).fill(-1));
  
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const elev = dem[row][col];
      if (elev <= 0) continue;
      
      let maxDrop = 0;
      let bestDir = -1;
      
      for (let d = 0; d < 8; d++) {
        const [dr, dc] = D8_DIRECTIONS[d];
        const nr = row + dr;
        const nc = col + dc;
        
        if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
        
        const neighborElev = dem[nr][nc];
        if (neighborElev <= 0) continue;
        
        const dist = (dr !== 0 && dc !== 0) ? Math.SQRT2 : 1;
        const drop = (elev - neighborElev) / dist;
        
        if (drop > maxDrop) {
          maxDrop = drop;
          bestDir = d;
        }
      }
      
      flowDir[row][col] = bestDir;
    }
  }
  
  return flowDir;
}

function computeFlowAccumulation(flowDir: number[][], width: number, height: number): number[][] {
  const accum: number[][] = Array.from({ length: height }, () => Array(width).fill(1));
  const inDegree: number[][] = Array.from({ length: height }, () => Array(width).fill(0));
  
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const dir = flowDir[row][col];
      if (dir >= 0 && dir < 8) {
        const [dr, dc] = D8_DIRECTIONS[dir];
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
          inDegree[nr][nc]++;
        }
      }
    }
  }
  
  const queueData: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (inDegree[row][col] === 0 && flowDir[row][col] >= 0) {
        queueData.push(row * width + col);
      }
    }
  }
  
  let queueStart = 0;
  while (queueStart < queueData.length) {
    const idx = queueData[queueStart++];
    const row = Math.floor(idx / width);
    const col = idx % width;
    const dir = flowDir[row][col];
    
    if (dir >= 0 && dir < 8) {
      const [dr, dc] = D8_DIRECTIONS[dir];
      const nr = row + dr;
      const nc = col + dc;
      
      if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
        accum[nr][nc] += accum[row][col];
        inDegree[nr][nc]--;
        
        if (inDegree[nr][nc] === 0) {
          queueData.push(nr * width + nc);
        }
      }
    }
  }
  
  return accum;
}

function identifyDepressions(dem: number[][], flowDir: number[][], width: number, height: number): boolean[][] {
  const depressions: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (dem[row][col] <= 0) continue;
      
      if (flowDir[row][col] === -1) {
        let isLowest = true;
        for (const [dr, dc] of D8_DIRECTIONS) {
          const nr = row + dr;
          const nc = col + dc;
          if (nr >= 0 && nr < height && nc >= 0 && nc < width && dem[nr][nc] > 0) {
            if (dem[nr][nc] < dem[row][col]) {
              isLowest = false;
              break;
            }
          }
        }
        if (isLowest) {
          depressions[row][col] = true;
        }
      }
    }
  }
  
  return depressions;
}

async function main() {
  try {
    const boundaryPath = path.join(process.cwd(), 'scripts', 'porto-alegre-boundary.json');
    const boundaryData = JSON.parse(fs.readFileSync(boundaryPath, 'utf-8'));
    
    console.log("=== Fetching Elevation Data ===");
    console.log(`BBox: [${boundaryData.bbox.join(', ')}]`);
    
    const bounds = {
      minLng: boundaryData.bbox[0],
      minLat: boundaryData.bbox[1],
      maxLng: boundaryData.bbox[2],
      maxLat: boundaryData.bbox[3],
    };
    
    const grid = await loadElevationGrid(bounds, 90);
    console.log(`Grid size: ${grid.width}x${grid.height}`);
    console.log(`Elevation range: ${grid.minElevation.toFixed(0)}m - ${grid.maxElevation.toFixed(0)}m`);
    
    console.log("\n=== Generating Contours ===");
    const contours = generateContours(grid);
    
    console.log("\n=== Computing D8 Flow Direction ===");
    const flowDirection = computeD8FlowDirection(grid.data, grid.width, grid.height);
    console.log("Flow direction computed");
    
    console.log("\n=== Computing Flow Accumulation ===");
    const flowAccum = computeFlowAccumulation(flowDirection, grid.width, grid.height);
    let maxAccum = 0;
    for (const row of flowAccum) {
      for (const val of row) {
        if (val > maxAccum) maxAccum = val;
      }
    }
    console.log(`Max flow accumulation: ${maxAccum} cells`);
    
    console.log("\n=== Identifying Depressions ===");
    const depressions = identifyDepressions(grid.data, flowDirection, grid.width, grid.height);
    const depCount = depressions.flat().filter(d => d).length;
    console.log(`Found ${depCount} depression cells`);
    
    const elevationData = {
      cityLocode: 'BR POA',
      bounds,
      elevationData: {
        width: grid.width,
        height: grid.height,
        cellSize: grid.cellSize,
        minElevation: grid.minElevation,
        maxElevation: grid.maxElevation,
      },
      demGrid: grid.data,
      flowDirection,
      flowAccumulation: flowAccum,
      depressions,
      contours,
    };
    
    const outputPath = path.join(process.cwd(), 'client/public/sample-data', 'porto-alegre-elevation.json');
    fs.writeFileSync(outputPath, JSON.stringify(elevationData));
    const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
    console.log(`\nElevation data saved to: ${outputPath} (${sizeMB} MB)`);
    
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
