import fs from 'fs/promises';
import path from 'path';

// ============================================================================
// OFFICIAL RISK LAYERS — Serviço Geológico do Brasil (SGB/CPRM)
// ============================================================================
// Two things live here, both public and both about Porto Alegre:
//
//   1. Setorização de Risco — 145 field-surveyed polygons, served as vector
//      GeoJSON. Same cache ladder as the OSM reference layers: committed
//      snapshot → in-memory → live ArcGIS query. Replit autoscale gives every
//      container its own ephemeral disk, so a per-container cache is cold on
//      each deploy; the snapshot is what actually makes this fast.
//
//   2. Susceptibility rasters — SGB's own WMS, reprojected on the fly into XYZ
//      tiles by officialRiskRoutes so they drop into the existing tile pipeline
//      with no new client code path.
//
// Only inundação and movimento de massa are exposed. SGB also publishes
// enxurrada and corrida de massa, and both were checked against a Porto Alegre
// bbox: they return an entirely empty image. Those are serra phenomena and the
// municipality is outside their mapped extent — an empty toggle in the layer
// list is worse than no toggle.
// ============================================================================

export const CITY_SLUG = 'porto-alegre';

/** IBGE municipality code for Porto Alegre — the SGB `cd_geocmu` filter. */
export const POA_IBGE_CODE = '4314902';

const SGB_ARCGIS =
  'https://geoportal.sgb.gov.br/server/rest/services/gestaoterritorial/risco/MapServer/0/query';

export interface OfficialRiskSource {
  id: string;
  label: string;
  /** Fully-formed request URL for the live source. */
  url: string;
  /** Human-readable attribution, echoed to the client with the GeoJSON. */
  attribution: string;
}

export const OFFICIAL_RISK_SOURCES: OfficialRiskSource[] = [
  {
    id: 'sgb-setorizacao',
    label: 'Setorização de Risco (SGB/CPRM)',
    url:
      `${SGB_ARCGIS}?where=${encodeURIComponent(`cd_geocmu='${POA_IBGE_CODE}'`)}` +
      '&outFields=*&returnGeometry=true&outSR=4326&f=geoJSON',
    attribution: 'Serviço Geológico do Brasil (SGB/CPRM) — Setorização de Risco',
  },
];

// ── SGB WMS (mapproxy) ──────────────────────────────────────────────────────
// The ArcGIS equivalents of these were tried first and rejected: the enxurrada
// MapServer 503s on export, and the tiled caches 404 over Porto Alegre. The
// mapproxy endpoint serves EPSG:3857 reliably and is itself a tile cache.

export const SGB_WMS_ENDPOINT =
  'https://geoservicos.sgb.gov.br/mapproxy/gestao-territorial/service';

/** Our layer id → the WMS layer name. Only ids listed here are proxied. */
export const SGB_WMS_LAYERS: Record<string, string> = {
  sgb_suscet_inundacao: 'suscet_inundacao',
  sgb_suscet_mov_massa: 'suscet_movimento_de_massa',
};

/** XYZ tile → EPSG:3857 bbox, for WMS 1.1.1 GetMap. */
export function tileBbox3857(z: number, x: number, y: number): string {
  const R = 20037508.342789244;
  const span = (2 * R) / 2 ** z;
  const minX = -R + x * span;
  const maxY = R - y * span;
  return [minX, maxY - span, minX + span, maxY].join(',');
}

export function wmsTileUrl(wmsLayerName: string, z: number, x: number, y: number): string {
  const q = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: wmsLayerName,
    styles: '',
    srs: 'EPSG:3857',
    bbox: tileBbox3857(z, x, y),
    width: '256',
    height: '256',
    format: 'image/png',
    transparent: 'true',
  });
  return `${SGB_WMS_ENDPOINT}?${q.toString()}`;
}

// ── Snapshots ───────────────────────────────────────────────────────────────

export function snapshotDir(city: string = CITY_SLUG): string {
  return path.join(process.cwd(), 'knowledge', 'official-risk', city);
}

export function snapshotPath(layerId: string, city: string = CITY_SLUG): string {
  return path.join(snapshotDir(city), `${layerId}.json`);
}

const memo = new Map<string, any>();

/** Committed snapshot, memoized. Returns null when the file is missing. */
export async function readSnapshot(layerId: string): Promise<any | null> {
  if (memo.has(layerId)) return memo.get(layerId);
  try {
    const raw = await fs.readFile(snapshotPath(layerId), 'utf-8');
    const parsed = JSON.parse(raw);
    memo.set(layerId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/** Live query against SGB. Slow and occasionally down — the fallback, not the path. */
export async function fetchLive(source: OfficialRiskSource): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: { Accept: 'application/geo+json, application/json' },
    });
    if (!res.ok) throw new Error(`SGB responded ${res.status}`);
    const geojson = await res.json();
    if (!geojson?.features?.length) throw new Error('SGB returned no features');
    return geojson;
  } finally {
    clearTimeout(timeout);
  }
}

export function logSnapshotStatus(layerId: string, hit: boolean): void {
  if (hit) return;
  console.warn(
    `[official-risk] No committed snapshot for '${layerId}' — falling back to a live ` +
      `SGB query. Run \`npm run official-risk:refresh\` to commit one.`
  );
}
