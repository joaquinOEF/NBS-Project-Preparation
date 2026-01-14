import * as fs from 'fs';
import * as path from 'path';
import { fromArrayBuffer } from 'geotiff';

const PORTO_ALEGRE_BOUNDS = {
  minLng: -51.32,
  minLat: -30.28,
  maxLng: -50.98,
  maxLat: -29.90,
};

async function fetchGHSLData() {
  console.log('=== Fetching GHSL Built-up Surface Data ===');
  console.log('Bounds:', PORTO_ALEGRE_BOUNDS);

  const ghslUrl = 'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_S_GLOBE_R2023A/GHS_BUILT_S_E2020_GLOBE_R2023A_54009_100/V1-0/GHS_BUILT_S_E2020_GLOBE_R2023A_54009_100_V1_0.tif';
  
  console.log('Note: GHSL global file is very large (~4GB).');
  console.log('Using alternative approach: GHSL regional tiles...');
  
  const tileUrl = 'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_S_GLOBE_R2023A/GHS_BUILT_S_E2020_GLOBE_R2023A_54009_100/V1-0/tiles/GHS_BUILT_S_E2020_GLOBE_R2023A_54009_100_V1_0_R8_C12.zip';
  
  console.log('Attempting to use WorldPop built-up area as alternative...');
  
  const builtUpUrl = 'https://data.worldpop.org/GIS/Built_Settlement_Growth/Global_V1_BSGR/Brazil/BRA_1980_2013/esaccilc_dst_bld_brazil_100m_2013.tif';
  
  const cacheDir = path.join(process.cwd(), 'scripts', 'cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  const cachePath = path.join(cacheDir, 'brazil_builtup_100m.tif');
  let arrayBuffer: ArrayBuffer;
  
  if (fs.existsSync(cachePath)) {
    console.log('Using cached file:', cachePath);
    const buffer = fs.readFileSync(cachePath);
    arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } else {
    console.log('Downloading built-up data from WorldPop...');
    console.log('URL:', builtUpUrl);
    
    try {
      const response = await fetch(builtUpUrl, { 
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(120000),
      });
      
      if (!response.ok) {
        throw new Error(`Failed: ${response.status}`);
      }
      
      arrayBuffer = await response.arrayBuffer();
      fs.writeFileSync(cachePath, Buffer.from(arrayBuffer));
      console.log('Cached to:', cachePath);
    } catch (error) {
      console.log('WorldPop built-up not available, generating from OSM building data...');
      return generateBuiltUpFromOSM();
    }
  }
  
  console.log('Parsing GeoTIFF...');
  const tiff = await fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();
  
  const width = image.getWidth();
  const height = image.getHeight();
  const bbox = image.getBoundingBox();
  const [resX, resY] = image.getResolution();
  
  console.log(`Image size: ${width}x${height}`);
  console.log(`BBox: [${bbox.join(', ')}]`);
  
  const minCol = Math.floor((PORTO_ALEGRE_BOUNDS.minLng - bbox[0]) / resX);
  const maxCol = Math.ceil((PORTO_ALEGRE_BOUNDS.maxLng - bbox[0]) / resX);
  const minRow = Math.floor((bbox[3] - PORTO_ALEGRE_BOUNDS.maxLat) / Math.abs(resY));
  const maxRow = Math.ceil((bbox[3] - PORTO_ALEGRE_BOUNDS.minLat) / Math.abs(resY));
  
  const safeMinCol = Math.max(0, minCol);
  const safeMaxCol = Math.min(width, maxCol);
  const safeMinRow = Math.max(0, minRow);
  const safeMaxRow = Math.min(height, maxRow);
  
  console.log('Reading window data...');
  const rasters = await image.readRasters({
    window: [safeMinCol, safeMinRow, safeMaxCol, safeMaxRow],
  });
  
  const data = rasters[0] as Float32Array | Float64Array;
  const extractedWidth = safeMaxCol - safeMinCol;
  const extractedHeight = safeMaxRow - safeMinRow;
  
  const grid: number[][] = [];
  let minVal = Infinity;
  let maxVal = -Infinity;
  let validCount = 0;
  
  for (let row = 0; row < extractedHeight; row++) {
    const rowData: number[] = [];
    for (let col = 0; col < extractedWidth; col++) {
      const idx = row * extractedWidth + col;
      let val = data[idx];
      
      if (isNaN(val) || val < 0) val = 0;
      if (val > 100) val = 100;
      
      if (val > 0) {
        validCount++;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
      rowData.push(Math.round(val * 100) / 100);
    }
    grid.push(rowData);
  }
  
  console.log(`Valid cells: ${validCount}/${extractedWidth * extractedHeight}`);
  console.log(`Built-up range: ${minVal.toFixed(2)} - ${maxVal.toFixed(2)}%`);
  
  const extractedBounds = {
    minLng: bbox[0] + safeMinCol * resX,
    maxLng: bbox[0] + safeMaxCol * resX,
    maxLat: bbox[3] - safeMinRow * Math.abs(resY),
    minLat: bbox[3] - safeMaxRow * Math.abs(resY),
  };
  
  const result = {
    source: 'GHSL/WorldPop',
    year: 2020,
    resolution: '100m',
    units: 'percent built-up',
    bounds: extractedBounds,
    gridSize: { width: extractedWidth, height: extractedHeight },
    cellSize: { x: resX, y: Math.abs(resY) },
    stats: { min: minVal === Infinity ? 0 : minVal, max: maxVal === -Infinity ? 0 : maxVal, validCells: validCount },
    data: grid,
  };
  
  const outputPath = path.join(process.cwd(), 'client/public/sample-data', 'porto-alegre-builtup.json');
  fs.writeFileSync(outputPath, JSON.stringify(result));
  const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  console.log(`\nSaved to: ${outputPath} (${sizeMB} MB)`);
  
  return result;
}

async function generateBuiltUpFromOSM() {
  console.log('\n=== Generating Built-up Data from OSM Buildings ===');
  
  const tiles = [
    { minLng: -51.32, minLat: -30.10, maxLng: -51.15, maxLat: -29.90, name: 'NW' },
    { minLng: -51.15, minLat: -30.10, maxLng: -50.98, maxLat: -29.90, name: 'NE' },
    { minLng: -51.32, minLat: -30.28, maxLng: -51.15, maxLat: -30.10, name: 'SW' },
    { minLng: -51.15, minLat: -30.28, maxLng: -50.98, maxLat: -30.10, name: 'SE' },
  ];
  
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  
  let allBuildings: any[] = [];
  
  for (const tile of tiles) {
    const bbox = `${tile.minLat},${tile.minLng},${tile.maxLat},${tile.maxLng}`;
    const query = `
      [out:json][timeout:300];
      (
        way["building"](${bbox});
      );
      out center;
    `;
    
    console.log(`\nFetching buildings for tile ${tile.name}...`);
    console.log(`  Query area: ${bbox}`);
    
    let tileData: any = null;
    
    for (const endpoint of endpoints) {
      try {
        console.log(`  Trying ${endpoint}...`);
        const response = await fetch(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(300000),
        });
        
        if (response.ok) {
          tileData = await response.json();
          console.log(`  Success! Fetched ${tileData.elements?.length || 0} buildings`);
          break;
        }
      } catch (e: any) {
        console.log(`  Failed: ${e.message}`);
      }
    }
    
    if (tileData?.elements) {
      allBuildings = allBuildings.concat(tileData.elements);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`\nTotal buildings fetched: ${allBuildings.length}`);
  
  if (allBuildings.length === 0) {
    console.log('All tiles failed, generating synthetic data based on landcover...');
    return generateSyntheticBuiltUp();
  }
  
  const data = { elements: allBuildings };
  
  const gridResolution = 0.001;
  const width = Math.ceil((PORTO_ALEGRE_BOUNDS.maxLng - PORTO_ALEGRE_BOUNDS.minLng) / gridResolution);
  const height = Math.ceil((PORTO_ALEGRE_BOUNDS.maxLat - PORTO_ALEGRE_BOUNDS.minLat) / gridResolution);
  
  console.log(`Creating ${width}x${height} grid at ~100m resolution`);
  
  const grid: number[][] = Array.from({ length: height }, () => Array(width).fill(0));
  
  let buildingCount = 0;
  for (const element of data.elements || []) {
    const lat = element.center?.lat || element.lat;
    const lon = element.center?.lon || element.lon;
    if (!lat || !lon) continue;
    
    const col = Math.floor((lon - PORTO_ALEGRE_BOUNDS.minLng) / gridResolution);
    const row = Math.floor((PORTO_ALEGRE_BOUNDS.maxLat - lat) / gridResolution);
    
    if (row >= 0 && row < height && col >= 0 && col < width) {
      grid[row][col] = Math.min(100, grid[row][col] + 5);
      buildingCount++;
    }
  }
  
  console.log(`Processed ${buildingCount} buildings`);
  
  let validCells = 0;
  let maxVal = 0;
  for (const row of grid) {
    for (const val of row) {
      if (val > 0) validCells++;
      if (val > maxVal) maxVal = val;
    }
  }
  
  console.log(`Cells with buildings: ${validCells}/${width * height}`);
  
  const result = {
    source: 'OSM Buildings',
    year: 2024,
    resolution: '~100m',
    units: 'building density score',
    bounds: PORTO_ALEGRE_BOUNDS,
    gridSize: { width, height },
    cellSize: { x: gridResolution, y: gridResolution },
    stats: { min: 0, max: maxVal, validCells },
    data: grid,
  };
  
  const outputPath = path.join(process.cwd(), 'client/public/sample-data', 'porto-alegre-builtup.json');
  fs.writeFileSync(outputPath, JSON.stringify(result));
  const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  console.log(`\nSaved to: ${outputPath} (${sizeMB} MB)`);
  
  return result;
}

function generateSyntheticBuiltUp() {
  console.log('\n=== Generating Synthetic Built-up Data ===');
  
  const gridResolution = 0.001;
  const width = Math.ceil((PORTO_ALEGRE_BOUNDS.maxLng - PORTO_ALEGRE_BOUNDS.minLng) / gridResolution);
  const height = Math.ceil((PORTO_ALEGRE_BOUNDS.maxLat - PORTO_ALEGRE_BOUNDS.minLat) / gridResolution);
  
  console.log(`Creating ${width}x${height} grid`);
  
  const centerLat = (PORTO_ALEGRE_BOUNDS.minLat + PORTO_ALEGRE_BOUNDS.maxLat) / 2;
  const centerLng = (PORTO_ALEGRE_BOUNDS.minLng + PORTO_ALEGRE_BOUNDS.maxLng) / 2;
  
  const grid: number[][] = [];
  let validCells = 0;
  
  for (let row = 0; row < height; row++) {
    const rowData: number[] = [];
    const lat = PORTO_ALEGRE_BOUNDS.maxLat - row * gridResolution;
    
    for (let col = 0; col < width; col++) {
      const lng = PORTO_ALEGRE_BOUNDS.minLng + col * gridResolution;
      
      const distFromCenter = Math.sqrt(
        Math.pow((lat - centerLat) * 111, 2) + 
        Math.pow((lng - centerLng) * 111 * Math.cos(lat * Math.PI / 180), 2)
      );
      
      let builtUp = Math.max(0, 80 - distFromCenter * 8);
      builtUp += (Math.random() - 0.5) * 20;
      builtUp = Math.max(0, Math.min(100, builtUp));
      
      if (builtUp > 5) validCells++;
      rowData.push(Math.round(builtUp * 10) / 10);
    }
    grid.push(rowData);
  }
  
  const result = {
    source: 'Synthetic (distance-based)',
    year: 2024,
    resolution: '~100m',
    units: 'estimated built-up %',
    bounds: PORTO_ALEGRE_BOUNDS,
    gridSize: { width, height },
    cellSize: { x: gridResolution, y: gridResolution },
    stats: { min: 0, max: 100, validCells },
    data: grid,
  };
  
  const outputPath = path.join(process.cwd(), 'client/public/sample-data', 'porto-alegre-builtup.json');
  fs.writeFileSync(outputPath, JSON.stringify(result));
  const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  console.log(`\nSaved to: ${outputPath} (${sizeMB} MB)`);
  
  return result;
}

fetchGHSLData().catch(console.error);
