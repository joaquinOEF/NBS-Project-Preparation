import * as fs from 'fs';
import * as path from 'path';
import * as GeoTIFF from 'geotiff';
import { storage } from '../storage';

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

interface ElevationResult {
  cityLocode: string;
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  elevationData: {
    width: number;
    height: number;
    cellSize: number;
    minElevation: number;
    maxElevation: number;
  };
  contours: any;
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

function isTileMissing(tileId: string): boolean {
  return fs.existsSync(getCachePath(tileId) + '.missing');
}

async function downloadTile(tile: TileInfo): Promise<string> {
  ensureCacheDir();
  const cachePath = getCachePath(tile.id);
  
  if (isTileMissing(tile.id)) {
    throw new Error(`TILE_NOT_FOUND: ${tile.id}`);
  }
  
  if (isTileCached(tile.id)) {
    console.log(`📦 Tile ${tile.id} already cached`);
    return cachePath;
  }
  
  console.log(`📥 Downloading tile ${tile.id}...`);
  
  try {
    const response = await fetch(tile.url);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`❌ Tile ${tile.id} not found (ocean/void area)`);
        fs.writeFileSync(cachePath + '.missing', '');
        throw new Error(`TILE_NOT_FOUND: ${tile.id}`);
      }
      throw new Error(`Failed to download tile: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(cachePath, Buffer.from(buffer));
    console.log(`✅ Tile ${tile.id} downloaded (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);
    
    return cachePath;
  } catch (error: any) {
    if (error.message?.startsWith('TILE_NOT_FOUND')) {
      throw error;
    }
    console.error(`Error downloading tile ${tile.id}:`, error.message);
    throw error;
  }
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

function generateContours(
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  width: number,
  height: number,
  elevationData: number[][]
): any {
  const features: any[] = [];
  const lngStep = (bounds.maxLng - bounds.minLng) / width;
  const latStep = (bounds.maxLat - bounds.minLat) / height;

  let minElev = Infinity, maxElev = -Infinity;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const e = elevationData[row][col];
      if (e !== null && !isNaN(e) && e !== 0) {
        minElev = Math.min(minElev, e);
        maxElev = Math.max(maxElev, e);
      }
    }
  }

  if (minElev === Infinity || maxElev === -Infinity) {
    return { type: "FeatureCollection", features: [] };
  }

  const range = maxElev - minElev;
  let contourInterval = 10;
  if (range > 500) contourInterval = 50;
  else if (range > 200) contourInterval = 25;
  else if (range < 50) contourInterval = 5;
  else if (range < 20) contourInterval = 2;

  const startElev = Math.ceil(minElev / contourInterval) * contourInterval;
  let contourId = 0;

  for (let elev = startElev; elev <= maxElev; elev += contourInterval) {
    const segments: [number, number][][] = [];
    
    for (let row = 0; row < height - 1; row++) {
      for (let col = 0; col < width - 1; col++) {
        const tl = elevationData[row][col];
        const tr = elevationData[row][col + 1];
        const bl = elevationData[row + 1][col];
        const br = elevationData[row + 1][col + 1];

        if ([tl, tr, bl, br].some(v => v === null || isNaN(v) || v === 0)) continue;

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

    for (const segment of segments) {
      if (segment.length >= 2) {
        features.push({
          type: "Feature",
          properties: {
            id: `contour-${contourId++}`,
            elevation: elev,
            isMajor: elev % (contourInterval * 5) === 0,
          },
          geometry: {
            type: "LineString",
            coordinates: segment,
          },
        });
      }
    }
  }

  return { type: "FeatureCollection", features };
}

export async function getElevationData(
  cityLocode: string,
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  targetResolution: number = 90
): Promise<ElevationResult> {
  const cached = await storage.getElevationCache(cityLocode);
  if (cached) {
    console.log(`🏔️ Using cached elevation data for ${cityLocode}`);
    return {
      cityLocode: cached.cityLocode,
      bounds: cached.bounds,
      elevationData: cached.elevationData,
      contours: cached.contours,
    };
  }

  console.log(`🏔️ Loading elevation data for bounds:`, bounds);
  
  const tiles = getRequiredTiles(bounds);
  console.log(`📊 Need ${tiles.length} tiles for this area`);
  
  const tileDataMap = new Map<string, TileData>();
  
  for (const tile of tiles) {
    try {
      const cachePath = await downloadTile(tile);
      const tileData = await readTileData(cachePath);
      tileDataMap.set(tile.id, tileData);
    } catch (error: any) {
      if (error.message?.startsWith('TILE_NOT_FOUND')) {
        console.log(`⏭️ Skipping missing tile ${tile.id}`);
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
  
  const gridHeight = Math.min(Math.ceil(heightMeters / targetResolution), 500);
  const gridWidth = Math.min(Math.ceil(widthMeters / targetResolution), 500);
  
  console.log(`📐 Creating elevation grid: ${gridWidth}x${gridHeight}`);
  
  const grid: number[][] = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(0));
  
  const lngStep = lngSpan / gridWidth;
  const latStep = latSpan / gridHeight;
  
  let minElevation = Infinity, maxElevation = -Infinity;
  
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
          const value = elevation === -9999 ? 0 : elevation;
          grid[row][col] = value;
          
          if (value !== 0) {
            minElevation = Math.min(minElevation, value);
            maxElevation = Math.max(maxElevation, value);
          }
        }
      }
    }
  }

  if (minElevation === Infinity) minElevation = 0;
  if (maxElevation === -Infinity) maxElevation = 0;

  console.log(`📊 Elevation range: ${minElevation.toFixed(0)}m - ${maxElevation.toFixed(0)}m`);
  
  const contours = generateContours(bounds, gridWidth, gridHeight, grid);
  console.log(`📈 Generated ${contours.features.length} contour segments`);

  const result: ElevationResult = {
    cityLocode,
    bounds,
    elevationData: {
      width: gridWidth,
      height: gridHeight,
      cellSize: targetResolution,
      minElevation,
      maxElevation,
    },
    contours,
  };

  await storage.setElevationCache({
    cityLocode,
    bounds,
    elevationData: result.elevationData,
    contours: result.contours,
  });

  console.log(`✅ Cached elevation data for ${cityLocode}`);
  
  return result;
}
