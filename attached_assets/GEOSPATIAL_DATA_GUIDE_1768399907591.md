# Geospatial Data Acquisition Guide

This document explains how to acquire elevation data from Copernicus DEM, city boundaries from OpenStreetMap/Nominatim, and generate contour lines. This guide is designed to help you replicate this functionality in another project.

---

## Table of Contents

1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Dependencies](#dependencies)
4. [Copernicus DEM Elevation Data](#copernicus-dem-elevation-data)
   - [Data Source](#data-source)
   - [Tile Naming Convention](#tile-naming-convention)
   - [Downloading Tiles](#downloading-tiles)
   - [Parsing GeoTIFF Files](#parsing-geotiff-files)
   - [Creating an Elevation Grid](#creating-an-elevation-grid)
   - [Handling Missing Tiles](#handling-missing-tiles)
5. [City Search and Boundaries](#city-search-and-boundaries)
   - [Nominatim API](#nominatim-api)
   - [Extracting City Boundaries](#extracting-city-boundaries)
   - [GeoJSON Boundary Handling](#geojson-boundary-handling)
6. [Contour Line Generation](#contour-line-generation)
   - [Marching Squares Algorithm](#marching-squares-algorithm)
   - [Segment Merging](#segment-merging)
7. [Complete Code Examples](#complete-code-examples)
8. [API Rate Limits and Best Practices](#api-rate-limits-and-best-practices)

---

## Overview

This guide covers three main data sources:

| Data Type | Source | Format | Resolution |
|-----------|--------|--------|------------|
| Elevation | Copernicus DEM GLO-30 | GeoTIFF (.tif) | 30 meters |
| City Boundaries | OpenStreetMap via Nominatim | GeoJSON | Variable |
| City Search | Nominatim Geocoding API | JSON | N/A |

---

## Project Structure

```
your-project/
├── server/
│   ├── copernicus-dem.ts    # Elevation data fetching and processing
│   ├── osm.ts               # City search and boundary fetching
│   └── hydrology.ts         # Contour generation (optional)
├── shared/
│   └── schema.ts            # TypeScript types/schemas
├── dem_cache/               # Local cache for downloaded DEM tiles
│   ├── Copernicus_DSM_COG_10_N34_00_W118_00_DEM.tif
│   └── ...
└── package.json
```

---

## Dependencies

Install these npm packages:

```bash
npm install geotiff zod
```

**Key dependencies:**
- `geotiff` - Parse GeoTIFF elevation files
- `zod` - Runtime type validation (optional but recommended)
- Native `fs` and `path` modules for file operations
- Native `fetch` for HTTP requests

---

## Copernicus DEM Elevation Data

### Data Source

Copernicus DEM GLO-30 is a free, global Digital Elevation Model at 30-meter resolution, hosted on AWS S3:

```
Base URL: https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com
```

**Key characteristics:**
- **Resolution:** 30 meters
- **Coverage:** Global (land areas only)
- **Format:** Cloud-Optimized GeoTIFF (COG)
- **Tile size:** 1° × 1° (latitude × longitude)
- **No authentication required** - publicly accessible

### Tile Naming Convention

Tiles are named based on their southwest corner coordinates:

```
Copernicus_DSM_COG_10_{LAT}_{LNG}_DEM
```

**Coordinate format:**
- **Latitude:** `N##_00` or `S##_00` (2 digits, zero-padded)
- **Longitude:** `E###_00` or `W###_00` (3 digits, zero-padded)

**Examples:**
| Location | Tile ID |
|----------|---------|
| Los Angeles (34°N, 118°W) | `Copernicus_DSM_COG_10_N34_00_W118_00_DEM` |
| Buenos Aires (34°S, 58°W) | `Copernicus_DSM_COG_10_S35_00_W059_00_DEM` |
| London (51°N, 0°W) | `Copernicus_DSM_COG_10_N51_00_W001_00_DEM` |
| Sydney (33°S, 151°E) | `Copernicus_DSM_COG_10_S34_00_E151_00_DEM` |

**Full URL pattern:**
```
https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/{TILE_ID}/{TILE_ID}.tif
```

### Downloading Tiles

```typescript
// server/copernicus-dem.ts

import * as fs from 'fs';
import * as path from 'path';

const COPERNICUS_BASE_URL = 'https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com';
const CACHE_DIR = './dem_cache';

interface TileInfo {
  id: string;
  url: string;
  lat: number;
  lng: number;
}

// Ensure cache directory exists
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

// Format coordinate for tile ID
function formatCoord(value: number, isLat: boolean): string {
  const prefix = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  const absVal = Math.abs(value);
  const padded = isLat 
    ? absVal.toString().padStart(2, '0') 
    : absVal.toString().padStart(3, '0');
  return `${prefix}${padded}_00`;
}

// Generate tile ID from coordinates
export function getTileId(lat: number, lng: number): string {
  const latFloor = Math.floor(lat);
  const lngFloor = Math.floor(lng);
  const latStr = formatCoord(latFloor, true);
  const lngStr = formatCoord(lngFloor, false);
  return `Copernicus_DSM_COG_10_${latStr}_${lngStr}_DEM`;
}

// Get download URL for a tile
export function getTileUrl(tileId: string): string {
  return `${COPERNICUS_BASE_URL}/${tileId}/${tileId}.tif`;
}

// Calculate all tiles needed to cover a bounding box
export function getRequiredTiles(bounds: {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}): TileInfo[] {
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

// Get local cache path for a tile
export function getCachePath(tileId: string): string {
  return path.join(CACHE_DIR, `${tileId}.tif`);
}

// Check if tile is already cached
export function isTileCached(tileId: string): boolean {
  return fs.existsSync(getCachePath(tileId));
}

// Download a single tile
export async function downloadTile(tile: TileInfo): Promise<string> {
  ensureCacheDir();
  const cachePath = getCachePath(tile.id);
  
  // Return cached path if already downloaded
  if (isTileCached(tile.id)) {
    console.log(`Tile ${tile.id} already cached`);
    return cachePath;
  }
  
  console.log(`Downloading tile ${tile.id} from ${tile.url}...`);
  
  try {
    const response = await fetch(tile.url);
    
    if (!response.ok) {
      if (response.status === 404) {
        // Tile doesn't exist (ocean or void area)
        console.log(`Tile ${tile.id} not found (ocean/void area)`);
        fs.writeFileSync(cachePath + '.missing', '');
        throw new Error(`TILE_NOT_FOUND: ${tile.id}`);
      }
      throw new Error(`Failed to download tile: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(cachePath, Buffer.from(buffer));
    console.log(`Tile ${tile.id} downloaded (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);
    
    return cachePath;
  } catch (error: any) {
    console.error(`Error downloading tile ${tile.id}:`, error.message);
    throw error;
  }
}
```

### Parsing GeoTIFF Files

```typescript
import * as GeoTIFF from 'geotiff';

interface TileData {
  data: Float32Array;
  width: number;
  height: number;
  bbox: number[]; // [minLng, minLat, maxLng, maxLat]
}

// Read elevation data from a GeoTIFF file
async function readTileData(tilePath: string): Promise<TileData> {
  const tiff = await GeoTIFF.fromFile(tilePath);
  const image = await tiff.getImage();
  
  const width = image.getWidth();
  const height = image.getHeight();
  const bbox = image.getBoundingBox(); // [minLng, minLat, maxLng, maxLat]
  
  const rasters = await image.readRasters();
  const data = rasters[0] as Float32Array;
  
  return { data, width, height, bbox };
}
```

**GeoTIFF structure for Copernicus DEM:**
- Each tile is ~3601 × 3601 pixels
- Elevation values in meters (Float32)
- NoData value: `-9999`
- Coordinate system: WGS84 (EPSG:4326)

### Creating an Elevation Grid

```typescript
interface ElevationGrid {
  data: number[][];      // 2D array of elevation values
  width: number;         // Number of columns
  height: number;        // Number of rows
  cellSize: number;      // Cell size in meters
  bounds: {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  };
}

export async function loadElevationGrid(
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  targetResolution: number = 30 // meters
): Promise<ElevationGrid> {
  const tiles = getRequiredTiles(bounds);
  
  // Download and read all required tiles
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
  
  // Calculate output grid dimensions
  const latSpan = bounds.maxLat - bounds.minLat;
  const lngSpan = bounds.maxLng - bounds.minLng;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos((bounds.minLat + bounds.maxLat) / 2 * Math.PI / 180);
  
  const heightMeters = latSpan * metersPerDegreeLat;
  const widthMeters = lngSpan * metersPerDegreeLng;
  
  const gridHeight = Math.ceil(heightMeters / targetResolution);
  const gridWidth = Math.ceil(widthMeters / targetResolution);
  
  console.log(`Creating elevation grid: ${gridWidth}x${gridHeight} (${targetResolution}m resolution)`);
  
  // Initialize output grid
  const grid: number[][] = Array.from({ length: gridHeight }, () => Array(gridWidth).fill(0));
  
  const lngStep = lngSpan / gridWidth;
  const latStep = latSpan / gridHeight;
  
  // Sample elevation for each grid cell
  for (let row = 0; row < gridHeight; row++) {
    for (let col = 0; col < gridWidth; col++) {
      // Calculate center coordinate of this cell
      const lng = bounds.minLng + (col + 0.5) * lngStep;
      const lat = bounds.maxLat - (row + 0.5) * latStep; // Note: rows go top-to-bottom
      
      // Find which tile contains this point
      const tileId = getTileId(lat, lng);
      const tileData = tileDataMap.get(tileId);
      
      if (tileData) {
        const { data, width, height, bbox } = tileData;
        const [tileMinLng, tileMinLat, tileMaxLng, tileMaxLat] = bbox;
        
        // Calculate pixel position within tile
        const tileCol = Math.floor((lng - tileMinLng) / (tileMaxLng - tileMinLng) * width);
        const tileRow = Math.floor((tileMaxLat - lat) / (tileMaxLat - tileMinLat) * height);
        
        if (tileCol >= 0 && tileCol < width && tileRow >= 0 && tileRow < height) {
          const idx = tileRow * width + tileCol;
          const elevation = data[idx];
          // Replace NoData with 0
          grid[row][col] = elevation === -9999 ? 0 : elevation;
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
  };
}
```

### Handling Missing Tiles

Some areas don't have elevation data (oceans, polar regions). Handle gracefully:

```typescript
// Create a marker file for missing tiles to avoid re-fetching
function isTileMissing(tileId: string): boolean {
  return fs.existsSync(getCachePath(tileId) + '.missing');
}

// Skip download if already marked as missing
export async function downloadTile(tile: TileInfo): Promise<string> {
  const cachePath = getCachePath(tile.id);
  
  if (isTileMissing(tile.id)) {
    throw new Error(`TILE_NOT_FOUND: ${tile.id}`);
  }
  
  // ... rest of download logic
}
```

---

## City Search and Boundaries

### Nominatim API

Nominatim is OpenStreetMap's geocoding service. It provides:
- **Search:** Find places by name
- **Boundaries:** GeoJSON polygons for cities, countries, etc.
- **Address details:** Country, state, city breakdown

**Base URL:** `https://nominatim.openstreetmap.org`

**Important:** Respect rate limits (1 request/second for free tier)

### Extracting City Boundaries

```typescript
// server/osm.ts

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

interface City {
  id: string;              // OSM ID (e.g., "osm-relation-123456")
  name: string;            // Short name
  displayName: string;     // Full display name with hierarchy
  centroid: [number, number]; // [lng, lat]
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  boundaryGeoJson: GeoJSON.Feature; // GeoJSON polygon/multipolygon
  countryCode?: string;    // ISO 3166-1 alpha-2 (e.g., "us", "gb")
}

// Search for cities and get their boundaries
export async function geocodeCities(query: string): Promise<City[]> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "5",
    polygon_geojson: "1",    // Include GeoJSON geometry
    addressdetails: "1",      // Include address breakdown
  });

  const response = await fetch(`${NOMINATIM_URL}/search?${params}`, {
    headers: {
      // Required: Identify your application
      "User-Agent": "YourAppName/1.0 (your@email.com)",
    },
  });

  if (!response.ok) {
    throw new Error(`Nominatim error: ${response.status}`);
  }

  const results = await response.json();
  if (results.length === 0) {
    return [];
  }

  const cities: City[] = [];
  
  for (const result of results) {
    // Create GeoJSON Feature from result
    let boundaryGeoJson: GeoJSON.Feature;
    
    if (result.geojson) {
      // Nominatim returned actual geometry
      boundaryGeoJson = {
        type: "Feature",
        properties: { name: result.display_name },
        geometry: result.geojson,
      };
    } else {
      // Fallback: create rectangle from bounding box
      // Note: result.boundingbox is [minLat, maxLat, minLng, maxLng]
      boundaryGeoJson = {
        type: "Feature",
        properties: { name: result.display_name },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [Number(result.boundingbox[2]), Number(result.boundingbox[0])], // SW
            [Number(result.boundingbox[3]), Number(result.boundingbox[0])], // SE
            [Number(result.boundingbox[3]), Number(result.boundingbox[1])], // NE
            [Number(result.boundingbox[2]), Number(result.boundingbox[1])], // NW
            [Number(result.boundingbox[2]), Number(result.boundingbox[0])], // SW (close ring)
          ]],
        },
      };
    }

    // Extract bounding box from geometry
    const bbox = extractBoundsFromGeoJSON(boundaryGeoJson.geometry);
    
    cities.push({
      id: `osm-${result.osm_type}-${result.osm_id}`,
      name: result.name || result.display_name.split(",")[0],
      displayName: result.display_name,
      centroid: [Number(result.lon), Number(result.lat)],
      bbox: bbox || [
        Number(result.boundingbox[2]),
        Number(result.boundingbox[0]),
        Number(result.boundingbox[3]),
        Number(result.boundingbox[1]),
      ],
      boundaryGeoJson,
      countryCode: result.address?.country_code,
    });
  }
  
  return cities;
}
```

### GeoJSON Boundary Handling

```typescript
// Extract bounding box from any GeoJSON geometry
function extractBoundsFromGeoJSON(geometry: any): [number, number, number, number] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let foundCoords = false;

  // Recursive coordinate processor
  function processCoordinate(coord: [number, number]) {
    const [lng, lat] = coord;
    if (typeof lng === 'number' && typeof lat === 'number' && !isNaN(lng) && !isNaN(lat)) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      foundCoords = true;
    }
  }

  function processCoordinates(coords: any) {
    if (!coords) return;
    
    if (Array.isArray(coords)) {
      // Check if this is a coordinate pair [lng, lat]
      if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        processCoordinate(coords as [number, number]);
      } else {
        // Nested array - recurse
        for (const item of coords) {
          processCoordinates(item);
        }
      }
    }
  }

  if (!geometry) return null;

  // Handle different geometry types
  switch (geometry.type) {
    case 'Point':
      processCoordinate(geometry.coordinates);
      break;
    case 'MultiPoint':
    case 'LineString':
      processCoordinates(geometry.coordinates);
      break;
    case 'MultiLineString':
    case 'Polygon':
      for (const ring of geometry.coordinates || []) {
        processCoordinates(ring);
      }
      break;
    case 'MultiPolygon':
      for (const polygon of geometry.coordinates || []) {
        for (const ring of polygon || []) {
          processCoordinates(ring);
        }
      }
      break;
    case 'GeometryCollection':
      for (const geom of geometry.geometries || []) {
        const bounds = extractBoundsFromGeoJSON(geom);
        if (bounds) {
          minLng = Math.min(minLng, bounds[0]);
          minLat = Math.min(minLat, bounds[1]);
          maxLng = Math.max(maxLng, bounds[2]);
          maxLat = Math.max(maxLat, bounds[3]);
          foundCoords = true;
        }
      }
      break;
  }

  if (!foundCoords) return null;
  
  return [minLng, minLat, maxLng, maxLat];
}
```

---

## Contour Line Generation

### Marching Squares Algorithm

Contour lines are generated by finding where elevation crosses threshold values:

```typescript
// server/hydrology.ts (or contours.ts)

interface ContourFeature {
  type: "Feature";
  properties: {
    id: string;
    elevation: number;
    isMajor: boolean;
  };
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

export function generateContours(
  grid: ElevationGrid,
  elevationData: number[][]
): GeoJSON.FeatureCollection {
  const { width, height, bounds } = grid;
  const features: GeoJSON.Feature[] = [];

  const lngStep = (bounds.maxLng - bounds.minLng) / width;
  const latStep = (bounds.maxLat - bounds.minLat) / height;

  // Find elevation range
  let minElev = Infinity, maxElev = -Infinity;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const e = elevationData[row][col];
      if (e !== null && !isNaN(e)) {
        minElev = Math.min(minElev, e);
        maxElev = Math.max(maxElev, e);
      }
    }
  }

  // Calculate contour interval based on elevation range
  const range = maxElev - minElev;
  let contourInterval = 10; // Default 10m
  if (range > 500) contourInterval = 50;
  else if (range > 200) contourInterval = 25;
  else if (range < 50) contourInterval = 5;
  else if (range < 20) contourInterval = 2;

  // Generate contours using marching squares
  const startElev = Math.ceil(minElev / contourInterval) * contourInterval;
  
  let contourId = 0;
  for (let elev = startElev; elev <= maxElev; elev += contourInterval) {
    const segments: [number, number][][] = [];
    
    // Scan for contour crossings in each grid cell
    for (let row = 0; row < height - 1; row++) {
      for (let col = 0; col < width - 1; col++) {
        // Get corner elevations (tl=top-left, tr=top-right, bl=bottom-left, br=bottom-right)
        const tl = elevationData[row][col];
        const tr = elevationData[row][col + 1];
        const bl = elevationData[row + 1][col];
        const br = elevationData[row + 1][col + 1];

        if ([tl, tr, bl, br].some(v => v === null || isNaN(v))) continue;

        // Check each edge for crossings
        const crossings: [number, number][] = [];
        
        // Top edge: interpolate if contour crosses
        if ((tl < elev && tr >= elev) || (tl >= elev && tr < elev)) {
          const t = (elev - tl) / (tr - tl); // Interpolation factor
          crossings.push([
            bounds.minLng + (col + t) * lngStep,
            bounds.maxLat - row * latStep
          ]);
        }
        
        // Bottom edge
        if ((bl < elev && br >= elev) || (bl >= elev && br < elev)) {
          const t = (elev - bl) / (br - bl);
          crossings.push([
            bounds.minLng + (col + t) * lngStep,
            bounds.maxLat - (row + 1) * latStep
          ]);
        }
        
        // Left edge
        if ((tl < elev && bl >= elev) || (tl >= elev && bl < elev)) {
          const t = (elev - tl) / (bl - tl);
          crossings.push([
            bounds.minLng + col * lngStep,
            bounds.maxLat - (row + t) * latStep
          ]);
        }
        
        // Right edge
        if ((tr < elev && br >= elev) || (tr >= elev && br < elev)) {
          const t = (elev - tr) / (br - tr);
          crossings.push([
            bounds.minLng + (col + 1) * lngStep,
            bounds.maxLat - (row + t) * latStep
          ]);
        }

        // If we found 2 crossings, create a line segment
        if (crossings.length >= 2) {
          segments.push([crossings[0], crossings[1]]);
        }
      }
    }

    // Merge connected segments into polylines
    const mergedLines = mergeContourSegments(segments);
    
    // Convert to GeoJSON features
    for (const line of mergedLines) {
      if (line.length >= 2) {
        features.push({
          type: "Feature",
          properties: {
            id: `contour-${contourId++}`,
            elevation: elev,
            isMajor: elev % (contourInterval * 5) === 0, // Every 5th is major
          },
          geometry: {
            type: "LineString",
            coordinates: line,
          },
        });
      }
    }
  }

  return { type: "FeatureCollection", features };
}
```

### Segment Merging

Connect individual segments into continuous polylines:

```typescript
// Merge disconnected segments into continuous polylines
function mergeContourSegments(segments: [number, number][][]): [number, number][][] {
  if (segments.length === 0) return [];
  
  // Round coordinates for matching (~0.1m precision)
  const roundCoord = (c: [number, number]): string => 
    `${Math.round(c[0] * 1000000)},${Math.round(c[1] * 1000000)}`;
  
  // Build endpoint lookup: maps endpoint string → segment indices
  const endpointToSegments = new Map<string, number[]>();
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const startKey = roundCoord(seg[0]);
    const endKey = roundCoord(seg[seg.length - 1]);
    
    if (!endpointToSegments.has(startKey)) endpointToSegments.set(startKey, []);
    if (!endpointToSegments.has(endKey)) endpointToSegments.set(endKey, []);
    endpointToSegments.get(startKey)!.push(i);
    endpointToSegments.get(endKey)!.push(i);
  }
  
  const used = new Set<number>();
  const result: [number, number][][] = [];
  
  // Process each unmerged segment
  for (let seedIdx = 0; seedIdx < segments.length; seedIdx++) {
    if (used.has(seedIdx)) continue;
    
    used.add(seedIdx);
    const polyline = [...segments[seedIdx]];
    
    // Try to extend from both ends
    let extended = true;
    while (extended) {
      extended = false;
      
      // Try to extend from end
      const endKey = roundCoord(polyline[polyline.length - 1]);
      const endNeighbors = endpointToSegments.get(endKey) || [];
      
      for (const neighborIdx of endNeighbors) {
        if (used.has(neighborIdx)) continue;
        
        const neighbor = segments[neighborIdx];
        const neighborStart = roundCoord(neighbor[0]);
        const neighborEnd = roundCoord(neighbor[neighbor.length - 1]);
        
        if (neighborStart === endKey) {
          // Append neighbor (skip first point - it's the shared endpoint)
          polyline.push(...neighbor.slice(1));
          used.add(neighborIdx);
          extended = true;
          break;
        } else if (neighborEnd === endKey) {
          // Append reversed neighbor
          polyline.push(...neighbor.slice(0, -1).reverse());
          used.add(neighborIdx);
          extended = true;
          break;
        }
      }
      
      // Try to extend from start (similar logic, prepending)
      const startKey = roundCoord(polyline[0]);
      const startNeighbors = endpointToSegments.get(startKey) || [];
      
      for (const neighborIdx of startNeighbors) {
        if (used.has(neighborIdx)) continue;
        
        const neighbor = segments[neighborIdx];
        const neighborStart = roundCoord(neighbor[0]);
        const neighborEnd = roundCoord(neighbor[neighbor.length - 1]);
        
        if (neighborEnd === startKey) {
          polyline.unshift(...neighbor.slice(0, -1));
          used.add(neighborIdx);
          extended = true;
          break;
        } else if (neighborStart === startKey) {
          polyline.unshift(...neighbor.slice(1).reverse());
          used.add(neighborIdx);
          extended = true;
          break;
        }
      }
    }
    
    result.push(polyline);
  }
  
  return result;
}
```

---

## Complete Code Examples

### Express API Routes

```typescript
// server/routes.ts
import express from 'express';
import { geocodeCities } from './osm';
import { loadElevationGrid } from './copernicus-dem';
import { generateContours } from './hydrology';

const app = express();
app.use(express.json());

// City search endpoint
app.post('/api/search_city', async (req, res) => {
  try {
    const { query } = req.body;
    const cities = await geocodeCities(query);
    res.json({ cities });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get elevation data and contours for a bounding box
app.post('/api/elevation', async (req, res) => {
  try {
    const { minLng, minLat, maxLng, maxLat, resolution = 90 } = req.body;
    
    const grid = await loadElevationGrid(
      { minLng, minLat, maxLng, maxLat },
      resolution
    );
    
    const contours = generateContours(grid, grid.data);
    
    res.json({
      elevation: {
        width: grid.width,
        height: grid.height,
        cellSize: grid.cellSize,
        bounds: grid.bounds,
      },
      contours,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(5000, '0.0.0.0', () => {
  console.log('Server running on port 5000');
});
```

### Frontend Map Integration (MapLibre GL)

```typescript
// client/src/components/Map.tsx
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

export function Map({ city, contours }) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: city.centroid,
      zoom: 11,
    });

    mapRef.current = map;

    map.on('load', () => {
      // Add city boundary
      map.addSource('city-boundary', {
        type: 'geojson',
        data: city.boundaryGeoJson,
      });

      map.addLayer({
        id: 'city-boundary-line',
        type: 'line',
        source: 'city-boundary',
        paint: {
          'line-color': '#3b82f6',
          'line-width': 2,
          'line-dasharray': [3, 2],
        },
      });

      // Add contour lines
      if (contours) {
        map.addSource('contours', {
          type: 'geojson',
          data: contours,
        });

        map.addLayer({
          id: 'contour-lines',
          type: 'line',
          source: 'contours',
          paint: {
            'line-color': [
              'case',
              ['get', 'isMajor'], '#8b5cf6', // Purple for major
              '#c4b5fd', // Light purple for minor
            ],
            'line-width': [
              'case',
              ['get', 'isMajor'], 1.5,
              0.75,
            ],
          },
        });
      }
    });

    return () => map.remove();
  }, [city, contours]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
```

---

## API Rate Limits and Best Practices

### Nominatim
- **Rate limit:** 1 request per second (free tier)
- **User-Agent:** Required - identify your application
- **Caching:** Cache results - boundaries rarely change
- **Alternatives:** Self-host Nominatim for high volume

```typescript
// Add delay between requests
async function rateLimitedFetch(url: string, options: RequestInit) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return fetch(url, options);
}
```

### Copernicus DEM
- **No rate limit:** Public S3 bucket
- **Caching:** Essential - tiles are large (~30MB each)
- **Parallel downloads:** Safe to download multiple tiles simultaneously

### Tile Caching Strategy

```typescript
// Implement LRU cache with size limit
const MAX_CACHE_SIZE_MB = 1000;

function cleanupCache() {
  const files = fs.readdirSync(CACHE_DIR)
    .filter(f => f.endsWith('.tif'))
    .map(f => ({
      name: f,
      path: path.join(CACHE_DIR, f),
      stats: fs.statSync(path.join(CACHE_DIR, f)),
    }))
    .sort((a, b) => a.stats.atimeMs - b.stats.atimeMs);

  let totalSize = files.reduce((sum, f) => sum + f.stats.size, 0);
  
  while (totalSize > MAX_CACHE_SIZE_MB * 1024 * 1024 && files.length > 0) {
    const oldest = files.shift()!;
    fs.unlinkSync(oldest.path);
    totalSize -= oldest.stats.size;
  }
}
```

---

## Summary

1. **Elevation Data (Copernicus DEM)**
   - Free, 30m resolution, global coverage
   - Download tiles based on bounding box
   - Parse GeoTIFF with `geotiff` library
   - Mosaic multiple tiles into single grid

2. **City Boundaries (Nominatim)**
   - Search by name, get GeoJSON polygons
   - Respect rate limits (1 req/sec)
   - Cache results

3. **Contour Lines**
   - Marching squares algorithm
   - Merge segments into polylines
   - Style by major/minor intervals

This architecture scales well - add more features (flow analysis, pooling detection) by building on the elevation grid foundation.
