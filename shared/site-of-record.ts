import type { MemberSite } from './cohort-schema';

/**
 * Where an organisation's place is: ONE answer, read from its record.
 *
 * The place used to live twice — `cohort_members.site` (written once, by the
 * Encontro 2 map) and the record's pin (`intervention_site._site_lat/_lng`,
 * written by Encontro 2, Encontro 4's geocode, the coordination's form). Every
 * document reads the record; the board's map read the member row. When Vila
 * Flores corrected its address in Encontro 4 ("Não é Rua Garça-Moura, é Rua
 * São Carlos, 759"), the proposal moved and the coordinator's map did not —
 * and nothing on the board could move it (Aline, WhatsApp, 9 Nov 2026).
 *
 * The record wins. The member row keeps what only it holds (photos, a drawn
 * polygon while it is still the same place); a pin that moved replaces the
 * point and the name. Pure: no write, so every existing record heals on read.
 */
type SiteFields = Record<string, unknown>;

const num = (v: unknown): number | null => {
  const s = v == null ? '' : String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** ~11 m: under this the two copies are the same place. */
const SAME_PLACE_DEG = 0.0001;

export function recordPin(fields: SiteFields): { lat: number; lng: number } | null {
  // `||`, as siteContext: an empty site_lat must not hide _site_lat.
  const lat = num(fields.site_lat) ?? num(fields._site_lat);
  const lng = num(fields.site_lng) ?? num(fields._site_lng);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function siteOfRecord(memberSite: MemberSite | null, fields: SiteFields): MemberSite | null {
  const pin = recordPin(fields);
  if (!pin) return memberSite;
  const name = String(fields.site_name ?? '').trim();
  if (memberSite && Array.isArray(memberSite.coordinates)) {
    const [lat, lng] = memberSite.coordinates;
    if (Math.abs(lat - pin.lat) < SAME_PLACE_DEG && Math.abs(lng - pin.lng) < SAME_PLACE_DEG) {
      // Same place: only the name may have been corrected since.
      return name && name !== memberSite.name ? { ...memberSite, name } : memberSite;
    }
  }
  return {
    name: name || memberSite?.name || `Ponto marcado (${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)})`,
    kind: 'custom',
    coordinates: [pin.lat, pin.lng],
    geometry: { type: 'Point', coordinates: [pin.lng, pin.lat] },
    source: 'record',
    areaM2: memberSite?.areaM2 ?? null,
    neighborhood: String(fields.bairro ?? '').trim() || memberSite?.neighborhood || null,
    photos: memberSite?.photos ?? [],
    savedAt: memberSite?.savedAt ?? new Date(0).toISOString(),
  };
}

/**
 * The place as a short key — what a summary written about it was written
 * about. The written summary of the proposal is authored once, when Encontro 4
 * closes; a place corrected afterwards left it saying "O endereço ainda não
 * foi marcado no mapa" under a page whose map showed the pin (Vila Flores,
 * prod, 9 Nov 2026). A summary keyed to another place is not shown; the
 * deterministic page is, until the next close writes a new one.
 */
export function placeKey(fields: SiteFields): string {
  const pin = recordPin(fields);
  return pin ? `${pin.lat.toFixed(4)},${pin.lng.toFixed(4)}` : '';
}
