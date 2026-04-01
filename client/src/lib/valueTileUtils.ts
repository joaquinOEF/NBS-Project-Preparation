// Utilities for decoding OEF value tiles (RGB → numeric/categorical).
// Ported from Bike-lanes-project-preparation/app/client/src/lib/valueTileUtils.ts

// ── Value-tile encoding spec (matches geospatial-layers.ts) ─────────────────
// Formula for numeric: value = (R + 256*G + 65536*B + offset) / scale
// Formula for categorical: class_id = R (G=B=0)
export interface ValueTileEncoding {
  type: "numeric" | "categorical";
  scale?: number;
  offset?: number;
  unit?: string;
  urlTemplate?: string;
  classes?: Record<number, string>;
}

// ── Lat/lng → tile coordinate + pixel offset ─────────────────────────────────
export function latLngToTilePixel(lat: number, lng: number, z: number) {
  const n = Math.pow(2, z);
  const latR = (lat * Math.PI) / 180;
  const mercY = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2;

  const tileX = Math.floor(((lng + 180) / 360) * n);
  const tileY = Math.floor(mercY * n);

  const px = Math.floor((((lng + 180) / 360) * n - tileX) * 256);
  const py = Math.floor((mercY * n - tileY) * 256);

  return {
    tileX: Math.max(0, Math.min(n - 1, tileX)),
    tileY: Math.max(0, Math.min(n - 1, tileY)),
    px: Math.max(0, Math.min(255, px)),
    py: Math.max(0, Math.min(255, py)),
  };
}

// ── Tile image cache (keyed by proxied URL) ───────────────────────────────────
const tileCache = new Map<string, ImageData | null>();
const pendingTiles = new Map<string, Promise<ImageData | null>>();

export async function fetchTilePixels(tileUrl: string): Promise<ImageData | null> {
  if (tileCache.has(tileUrl)) return tileCache.get(tileUrl)!;
  if (pendingTiles.has(tileUrl)) return pendingTiles.get(tileUrl)!;

  const proxyUrl = `/api/geospatial/proxy-tile?url=${encodeURIComponent(tileUrl)}`;

  const promise = new Promise<ImageData | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) { tileCache.set(tileUrl, null); resolve(null); return; }
      ctx.drawImage(img, 0, 0, 256, 256);
      const data = ctx.getImageData(0, 0, 256, 256);
      tileCache.set(tileUrl, data);
      resolve(data);
    };
    img.onerror = () => { tileCache.set(tileUrl, null); resolve(null); };
    img.src = proxyUrl;
  });

  pendingTiles.set(tileUrl, promise);
  const result = await promise;
  pendingTiles.delete(tileUrl);
  return result;
}

// ── Sample a single pixel from an ImageData ───────────────────────────────────
export function samplePixel(imgData: ImageData, px: number, py: number): [number, number, number, number] {
  const i = (py * 256 + px) * 4;
  return [imgData.data[i], imgData.data[i + 1], imgData.data[i + 2], imgData.data[i + 3]];
}

// ── Decode OEF value tile pixel → number (or null for nodata) ─────────────────
export function decodePixelNumeric(
  r: number, g: number, b: number, alpha: number,
  encoding: ValueTileEncoding
): number | null {
  if (alpha < 10) return null;

  if (encoding.type === "categorical") {
    return r; // class id
  }

  const raw = r + 256 * g + 65536 * b;
  const scale = encoding.scale ?? 100;
  const offset = encoding.offset ?? 0;
  const value = (raw + offset) / scale;
  return isFinite(value) ? value : null;
}

// ── Decode pixel to human-readable string ─────────────────────────────────────
export function decodePixelDisplay(
  r: number, g: number, b: number, alpha: number,
  encoding: ValueTileEncoding
): string | null {
  if (alpha < 10) return null;

  if (encoding.type === "categorical") {
    const classId = r;
    const className = encoding.classes?.[classId];
    return className ?? `Class ${classId}`;
  }

  const value = decodePixelNumeric(r, g, b, alpha, encoding);
  if (value === null) return null;

  if (encoding.unit === "index 0–1") return value.toFixed(3);
  if (encoding.unit?.includes("°C")) return value.toFixed(1);
  return value.toFixed(1);
}

// ── Sample raster value at a lat/lng point ───────────────────────────────────
export async function sampleRasterAtPoint(
  lat: number,
  lng: number,
  encoding: ValueTileEncoding,
  z = 11
): Promise<number | null> {
  if (!encoding.urlTemplate) return null;

  const { tileX, tileY, px, py } = latLngToTilePixel(lat, lng, z);

  const tileUrl = encoding.urlTemplate
    .replace("{z}", String(z))
    .replace("{x}", String(tileX))
    .replace("{y}", String(tileY));

  try {
    const imgData = await fetchTilePixels(tileUrl);
    if (!imgData) return null;
    const [r, g, b, a] = samplePixel(imgData, px, py);
    return decodePixelNumeric(r, g, b, a, encoding);
  } catch {
    return null;
  }
}

// ── Geometry centroid helpers ─────────────────────────────────────────────────
// Returns [lat, lng] centroid of a GeoJSON geometry (coordinates are [lng, lat]).
export function geometryCentroid(geometry: any): [number, number] | null {
  if (!geometry) return null;

  let coords: [number, number][] = [];

  const collect = (geom: any): void => {
    switch (geom.type) {
      case "Point":
        coords.push(geom.coordinates);
        break;
      case "MultiPoint":
      case "LineString":
        coords.push(...geom.coordinates);
        break;
      case "MultiLineString":
      case "Polygon":
        for (const ring of geom.coordinates) coords.push(...ring);
        break;
      case "MultiPolygon":
        for (const poly of geom.coordinates)
          for (const ring of poly) coords.push(...ring);
        break;
      case "GeometryCollection":
        for (const g of geom.geometries) collect(g);
        break;
    }
  };

  collect(geometry);
  if (coords.length === 0) return null;

  const sumLng = coords.reduce((s, c) => s + c[0], 0);
  const sumLat = coords.reduce((s, c) => s + c[1], 0);
  return [sumLat / coords.length, sumLng / coords.length]; // [lat, lng]
}
