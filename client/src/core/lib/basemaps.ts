// ============================================================================
// BASEMAPS — one definition, because six copies is how they drift
// ============================================================================
// ⚠️ CARTO NOW REQUIRES AN API KEY, and the way it says so is the worst
// available: `basemaps.cartocdn.com` still answers 200 with a real tile, and
// stamps "API KEY REQUIRED · carto.com/basemaps/apikey" diagonally across the
// image. Nothing errors, nothing logs, no request fails — the words are simply
// painted over Porto Alegre, under the flood layer, on the coordinator's board
// (JVP, 2026-09-07). Verified by fetching a tile and looking at it.
//
// Esri's Canvas basemaps need no key, which is not a new dependency: the
// footprint step has been drawing on Esri World Imagery with no key since the
// map shipped. Two differences from CARTO, both handled below:
//
//   · Esri splits the ground from the LABELS. A light-grey base with no place
//     names is not a basemap anyone can orient in, so every consumer stacks the
//     matching reference layer over the base. Miss it and the map is legible in
//     screenshots and useless in the room.
//   · The base tiles come back as JPEG and the labels as PNG. Only matters if
//     something assumes an extension — the static thumbnails ask for the URL,
//     not for `.png`.
//
// The URL scheme is `{z}/{y}/{x}` — Y BEFORE X, the opposite of CARTO and OSM.
// ============================================================================

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

export interface Basemap {
  /** The ground. */
  url: string;
  /** Place names and roads, drawn OVER the ground. Absent for imagery. */
  labelsUrl?: string;
  attribution: string;
  /**
   * ⚠️ The last zoom Esri actually publishes for this basemap — NOT the map's
   * maxZoom. Measured over Porto Alegre, 2026-09-07: z16 returns 16 KB of real
   * tile, z17/18/19 return the same 2 521-byte blank, with a 200 every time. So
   * a layer given `maxZoom: 16` loses its ground entirely past 16, while
   * `maxNativeZoom: 16` keeps the last good tile and lets Leaflet upscale it.
   * The footprint step draws at z18–19, so this distinction is the difference
   * between tracing on a stretched map and tracing on a white void.
   */
  maxNativeZoom: number;
}

export const BASEMAPS: Record<'light' | 'dark' | 'satellite', Basemap> = {
  light: {
    url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labelsUrl: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri',
    maxNativeZoom: 16,
  },
  dark: {
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labelsUrl: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri',
    maxNativeZoom: 16,
  },
  satellite: {
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    attribution: 'Tiles &copy; Esri',
    maxNativeZoom: 19,
  },
};

/** A static tile URL for the <img> mosaics in the chat cards. */
export function tileUrl(kind: 'light' | 'satellite', z: number, x: number, y: number, labels = false): string {
  const b = BASEMAPS[kind];
  const template = labels ? (b.labelsUrl ?? b.url) : b.url;
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}
