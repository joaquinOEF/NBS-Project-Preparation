import type { CboFootprintCard as CboFootprintCardPayload } from '@shared/cbo-schema';
import { areaComparison } from '@shared/area-comparison';
import { TILE, toWorldPx } from './tile-math';

// ============================================================================
// THE AREA THEY TRACED, SHOWN BACK AS A SHAPE
// ============================================================================
// JVP, 2026-09-07, on the E3 footprint step: "selected map section, but still
// sends this text … and not the map of what i selected".
//
// The room traced a footprint on satellite imagery and got back a paragraph of
// Encontro 2 hazard bands — no shape, and the one number they had just produced
// missing. This card is the read-back: the outline they drew, over the imagery
// they drew it on, with the area and a yardstick beside it.
//
// The yardstick is not decoration. A footprint traced on a zoomed-out map once
// produced a 9 986 500 m² rain garden; nobody can audit "9.986.500 m²", and
// everybody can audit "mais ou menos 1.400 campos de futebol".
//
// Static <img> tiles, not Leaflet: this row persists in the transcript and
// re-renders on every reload. See ./tile-math.ts.
// ============================================================================

const STRINGS = {
  pt: {
    eyebrow: 'A área que vocês desenharam',
    approx: 'aproximado, pelo contorno no mapa',
    alt: 'Mapa com a área desenhada',
  },
  en: {
    eyebrow: 'The area you traced',
    approx: 'approximate, from the outline on the map',
    alt: 'Map showing the traced area',
  },
};

const FRAME_W = 360;
const FRAME_H = 190;
const PAD = 22;
const MIN_ZOOM = 12;
const MAX_ZOOM = 19;

/** The closest zoom at which the whole outline still fits inside the frame. */
function fitZoom(points: Array<[number, number]>): number {
  for (let z = MAX_ZOOM; z > MIN_ZOOM; z--) {
    const px = points.map(([lat, lng]) => toWorldPx(lat, lng, z));
    const w = Math.max(...px.map(p => p[0])) - Math.min(...px.map(p => p[0]));
    const h = Math.max(...px.map(p => p[1])) - Math.min(...px.map(p => p[1]));
    if (w <= FRAME_W - 2 * PAD && h <= FRAME_H - 2 * PAD) return z;
  }
  return MIN_ZOOM;
}

function FootprintThumb({ points, alt }: { points: Array<[number, number]>; alt: string }) {
  const z = fitZoom(points);
  const px = points.map(([lat, lng]) => toWorldPx(lat, lng, z));
  const cx = (Math.max(...px.map(p => p[0])) + Math.min(...px.map(p => p[0]))) / 2;
  const cy = (Math.max(...px.map(p => p[1])) + Math.min(...px.map(p => p[1]))) / 2;
  // World-pixel origin of the frame, so both the tiles and the outline are
  // placed by the same arithmetic and cannot drift apart.
  const left = cx - FRAME_W / 2;
  const top = cy - FRAME_H / 2;

  const tiles: Array<{ x: number; y: number }> = [];
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + FRAME_W) / TILE); tx++)
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + FRAME_H) / TILE); ty++)
      tiles.push({ x: tx, y: ty });

  const ring = px.map(([x, y]) => `${(x - left).toFixed(1)},${(y - top).toFixed(1)}`).join(' ');

  return (
    <div
      className='relative overflow-hidden rounded-lg border border-[#e2d9c4] dark:border-stone-700 bg-[#3b3a35]'
      style={{ width: '100%', maxWidth: FRAME_W, height: FRAME_H }}
      data-testid='cbo-footprint-thumb'
    >
      {tiles.map((tile, i) => (
        <img
          key={`${tile.x}-${tile.y}`}
          // Esri World Imagery — the same basemap the footprint was traced on,
          // so the card shows the roof they recognised, not a street diagram.
          src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${tile.y}/${tile.x}`}
          alt={i === 0 ? alt : ''}
          width={TILE}
          height={TILE}
          draggable={false}
          className='absolute select-none max-w-none'
          style={{ left: tile.x * TILE - left, top: tile.y * TILE - top }}
        />
      ))}
      <svg
        className='absolute inset-0 pointer-events-none'
        width={FRAME_W}
        height={FRAME_H}
        viewBox={`0 0 ${FRAME_W} ${FRAME_H}`}
        aria-hidden
      >
        <polygon
          points={ring}
          fill='#8b5cf6'
          fillOpacity={0.32}
          stroke='#ffffff'
          strokeWidth={2.5}
          strokeLinejoin='round'
        />
      </svg>
    </div>
  );
}

export function CboFootprintCard({ card, lang }: { card: CboFootprintCardPayload; lang: 'pt' | 'en' }) {
  const s = STRINGS[lang];
  const points = (card.points ?? []).filter(
    p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]),
  ) as Array<[number, number]>;
  const m2 = card.areaM2.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US');
  const comparison = areaComparison(card.areaM2, lang);

  return (
    <div
      className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] dark:bg-stone-900 dark:border-stone-700 overflow-hidden'
      data-testid='cbo-footprint-card'
    >
      <div className='px-3 pt-2 text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>
        {s.eyebrow}
      </div>
      <div className='px-3 pb-3 pt-1.5'>
        {points.length >= 3 && (
          <div className='mb-2'>
            <FootprintThumb points={points} alt={s.alt} />
          </div>
        )}
        <div className='text-lg font-bold leading-tight' data-testid='cbo-footprint-area'>
          {m2} m²
        </div>
        {comparison && (
          <div className='text-[12px] font-semibold text-[#6b6350] dark:text-stone-300'>
            {comparison}
          </div>
        )}
        <div className='text-[10.5px] text-muted-foreground mt-0.5'>{s.approx}</div>
        {(card.siteName || card.bairro) && (
          <div className='text-[11px] text-muted-foreground mt-1.5'>
            📍 {[card.siteName, card.bairro].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}
