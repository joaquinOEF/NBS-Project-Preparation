// Web-Mercator tile arithmetic, shared by the chat's static map thumbnails.
//
// These cards render inside a transcript that persists and re-renders on every
// reload, so they are <img> tile mosaics rather than Leaflet instances — N live
// maps accumulating down a conversation is how the `_leaflet_pos` teardown
// crash got in. See CboSiteCard (pin, fixed zoom) and CboFootprintCard
// (polygon, zoom fitted to the shape).

export const TILE = 256;

export function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * 2 ** z;
}

export function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

/** World pixel coordinates at zoom `z`. */
export function toWorldPx(lat: number, lng: number, z: number): [number, number] {
  return [lngToTileX(lng, z) * TILE, latToTileY(lat, z) * TILE];
}
