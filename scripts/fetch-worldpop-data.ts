import * as fs from 'fs';
import * as path from 'path';
import { fromArrayBuffer } from 'geotiff';

const PORTO_ALEGRE_BOUNDS = {
  minLng: -51.32,
  minLat: -30.28,
  maxLng: -50.98,
  maxLat: -29.90,
};

async function fetchWorldPopData() {
  console.log('=== Fetching WorldPop Population Density ===');
  console.log('Bounds:', PORTO_ALEGRE_BOUNDS);

  const worldPopUrl = 'https://data.worldpop.org/GIS/Population_Density/Global_2000_2020_1km_UNadj/2020/BRA/bra_pd_2020_1km_UNadj.tif';
  
  console.log('Downloading Brazil population density raster (this may take a moment)...');
  
  const cacheDir = path.join(process.cwd(), 'scripts', 'cache');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  const cachePath = path.join(cacheDir, 'bra_pd_2020_1km.tif');
  let arrayBuffer: ArrayBuffer;
  
  if (fs.existsSync(cachePath)) {
    console.log('Using cached file:', cachePath);
    const buffer = fs.readFileSync(cachePath);
    arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } else {
    console.log('Downloading from WorldPop...');
    const response = await fetch(worldPopUrl);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }
    arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(cachePath, Buffer.from(arrayBuffer));
    console.log('Cached to:', cachePath);
  }
  
  console.log('Parsing GeoTIFF...');
  const tiff = await fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();
  
  const width = image.getWidth();
  const height = image.getHeight();
  const bbox = image.getBoundingBox();
  const [originX, originY] = image.getOrigin();
  const [resX, resY] = image.getResolution();
  
  console.log(`Image size: ${width}x${height}`);
  console.log(`BBox: [${bbox.join(', ')}]`);
  console.log(`Resolution: ${resX}, ${resY}`);
  
  const minCol = Math.floor((PORTO_ALEGRE_BOUNDS.minLng - bbox[0]) / resX);
  const maxCol = Math.ceil((PORTO_ALEGRE_BOUNDS.maxLng - bbox[0]) / resX);
  const minRow = Math.floor((bbox[3] - PORTO_ALEGRE_BOUNDS.maxLat) / Math.abs(resY));
  const maxRow = Math.ceil((bbox[3] - PORTO_ALEGRE_BOUNDS.minLat) / Math.abs(resY));
  
  const windowWidth = maxCol - minCol;
  const windowHeight = maxRow - minRow;
  
  console.log(`Window: col ${minCol}-${maxCol}, row ${minRow}-${maxRow} (${windowWidth}x${windowHeight})`);
  
  if (minCol < 0 || minRow < 0 || maxCol > width || maxRow > height) {
    console.log('Porto Alegre extends beyond raster bounds, adjusting...');
  }
  
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
      
      if (val < 0 || isNaN(val) || val > 100000) {
        val = 0;
      } else {
        validCount++;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
      rowData.push(Math.round(val * 100) / 100);
    }
    grid.push(rowData);
  }
  
  console.log(`Valid cells: ${validCount}/${extractedWidth * extractedHeight}`);
  console.log(`Population density range: ${minVal.toFixed(2)} - ${maxVal.toFixed(2)} people/km²`);
  
  const extractedBounds = {
    minLng: bbox[0] + safeMinCol * resX,
    maxLng: bbox[0] + safeMaxCol * resX,
    maxLat: bbox[3] - safeMinRow * Math.abs(resY),
    minLat: bbox[3] - safeMaxRow * Math.abs(resY),
  };
  
  const result = {
    source: 'WorldPop',
    year: 2020,
    resolution: '1km',
    units: 'people per km²',
    bounds: extractedBounds,
    gridSize: { width: extractedWidth, height: extractedHeight },
    cellSize: { x: resX, y: Math.abs(resY) },
    stats: { min: minVal, max: maxVal, validCells: validCount },
    data: grid,
  };
  
  const outputPath = path.join(process.cwd(), 'client/public/sample-data', 'porto-alegre-population-worldpop.json');
  fs.writeFileSync(outputPath, JSON.stringify(result));
  const sizeMB = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
  console.log(`\nSaved to: ${outputPath} (${sizeMB} MB)`);
  
  return result;
}

fetchWorldPopData().catch(console.error);
