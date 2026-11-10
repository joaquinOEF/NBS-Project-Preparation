import type { CboSiteCard as CboSiteCardPayload } from '@shared/cbo-schema';
import { TILE, lngToTileX, latToTileY } from './tile-math';
import { tileUrl } from '@/core/lib/basemaps';

// E2 linear flow — the site card (decision B1): what the org picked on the map.
// Served by the checkpoint right after the focused site session confirms; the
// confirm chips ride in the paired ask_user, not here (strips have no buttons).
//
// The card answers ONE question — "is this the right place?" — and it has to
// make that answerable. Two things it used to get wrong (JVP, 2026-08-03:
// "what is the user supposed to choose here? if the risks are ok? if the site
// is ok?"):
//
//  1. The place was often "Ponto marcado (-30.0577, -51.1936)". Nobody can
//     confirm a latitude. Now: a thumbnail centred on the pin, and a
//     reverse-geocoded street address as the headline.
//  2. Three risk bars — "No bairro, em média" Enchente/Calor/Deslizam. They
//     were our own bairro percentile of the ARVC RISCO composite, and what an
//     organisation sees about hazard must rest on OFFICIAL data so the
//     accountability is the municipality's (stance, PR #470; 10 Nov 2026).
//     Gone. In their place (JVP, 10 Nov 2026): the PLAC/ARVC AMEAÇA sampled at
//     the pin — Inundação (arroios), Calor, Deslizamento — classed server-side
//     the way the map classes it, under "Ameaça no ponto (PLAC)" with its
//     source; plus the Guaíba line when the pin is inside a contour the May
//     2024 flood reached, because the flood ameaça is fluvial only. No
//     "média", no bairro, no percentile. A card persisted before the change
//     still carries `risks`; it is ignored.
//
// i18n: in-component STRINGS + lang prop (never i18n.language in a leaf —
// pre-fetch race), same pattern as NbsFamiliaStrip.

const STRINGS = {
  pt: {
    eyebrow: 'O lugar que vocês marcaram',
    tipo: 'Tipo de lugar:',
    fromMap: '(pelo mapa)',
    hazardHead: 'Ameaça no ponto (PLAC)',
    hazardSource: 'Fonte: PLAC/ARVC, cenário 2050',
    hz: { flood: '🌊 Inundação (arroios)', heat: '🔥 Calor', landslide: '⛰️ Deslizamento' },
    mapAlt: 'Mapa do lugar marcado',
  },
  en: {
    eyebrow: 'The place you marked',
    tipo: 'Kind of place:',
    fromMap: '(from the map)',
    hazardHead: 'Hazard at this point (PLAC)',
    hazardSource: 'Source: PLAC/ARVC, 2050 scenario',
    hz: { flood: '🌊 River flooding (arroios)', heat: '🔥 Heat', landslide: '⛰️ Landslide' },
    mapAlt: 'Map of the marked place',
  },
};

// The tiles' own yellow→red ramp (shared/arvc-official HAZARD_TILE_RAMP), one
// colour per class, so the card and the tour speak the same colours. The
// lightest yellow is darkened for legibility as text.
const LEVEL_COLORS = ['#b8a400', '#d99a1e', '#e0702a', '#d23a1f', '#9e0020'];

// ── Static map thumbnail ────────────────────────────────────────────────────
// A CartoDB tile mosaic, not a Leaflet instance. This renders inside a chat
// transcript row that persists and re-renders on every reload, so a live map
// here would mean N map instances accumulating down the conversation — plus the
// teardown races that already cost us a `_leaflet_pos` crash. Plain <img> tiles
// are inert, cacheable and survive rehydration for free.
//
// 3×3, and the frame is capped — both follow from the same arithmetic. The pin
// sits at `px` inside the mosaic; to leave no uncovered gutter the frame width W
// needs `W/2 ≤ px ≤ MOSAIC − W/2`. With a 2×2 mosaic px only ranges over
// [128, 384], which caps W at 256 — narrower than the card, which is exactly why
// the first cut rendered a 512px strip floating in beige. 3×3 puts px in
// [256, 512] and covers any frame up to 512 on both axes.
const ZOOM = 16;
const SPAN = 3; // tiles per side
const MOSAIC = TILE * SPAN;
/** Frame cap — must stay ≤ MOSAIC − 2×(TILE/2) = 512. Also "a smaller version
 *  of the map", which is what the card is for: orient, don't explore. */
const FRAME_W = 360;
const FRAME_H = 132;

function SiteThumb({ lat, lng, alt }: { lat: number; lng: number; alt: string }) {
  const fx = lngToTileX(lng, ZOOM);
  const fy = latToTileY(lat, ZOOM);
  // Top-left tile of the block: the tile containing the point, minus one, so the
  // point's own tile is the centre of the 3×3.
  const x0 = Math.floor(fx) - 1;
  const y0 = Math.floor(fy) - 1;
  // Pin position within the mosaic — always in [TILE, 2×TILE] by construction.
  const px = (fx - x0) * TILE;
  const py = (fy - y0) * TILE;

  const tiles: Array<[number, number]> = [];
  for (let ty = 0; ty < SPAN; ty++)
    for (let tx = 0; tx < SPAN; tx++) tiles.push([tx, ty]);

  return (
    <div
      className='relative overflow-hidden rounded-lg border border-[#e2d9c4] dark:border-stone-700 bg-[#eee7d6]'
      style={{ width: '100%', maxWidth: FRAME_W, height: FRAME_H }}
      data-testid='cbo-site-thumb'
    >
      {/* The mosaic is translated so the pin sits at the centre of the frame. */}
      <div
        className='absolute'
        style={{
          width: MOSAIC,
          height: MOSAIC,
          left: `calc(50% - ${px}px)`,
          top: `calc(50% - ${py}px)`,
        }}
      >
        {/* Ground, then labels — two Esri services since CARTO started stamping
            "API KEY REQUIRED" across every tile it serves. The names matter
            here: this card asks "is this the right place?", and a grey square
            with a pin in it cannot be answered. See core/lib/basemaps.ts. */}
        {tiles.map(([tx, ty], i) => (
          <img
            key={`${tx}-${ty}`}
            src={tileUrl('light', ZOOM, x0 + tx, y0 + ty)}
            alt={i === 0 ? alt : ''}
            width={TILE}
            height={TILE}
            /* Not lazy: the card is one row in a transcript the user is looking
               at right now, and lazy left it rendering as an empty beige box. */
            draggable={false}
            className='absolute select-none max-w-none'
            style={{ left: tx * TILE, top: ty * TILE }}
          />
        ))}
        {tiles.map(([tx, ty]) => (
          <img
            key={`lbl-${tx}-${ty}`}
            src={tileUrl('light', ZOOM, x0 + tx, y0 + ty, true)}
            alt=''
            width={TILE}
            height={TILE}
            draggable={false}
            className='absolute select-none max-w-none'
            style={{ left: tx * TILE, top: ty * TILE }}
          />
        ))}
      </div>
      {/* Pin, dead centre. */}
      <div
        className='absolute -translate-x-1/2 -translate-y-full text-[20px] leading-none pointer-events-none'
        style={{ left: '50%', top: '50%' }}
        aria-hidden
      >
        📍
      </div>
    </div>
  );
}

export function CboSiteCard({ card, lang }: { card: CboSiteCardPayload; lang: 'pt' | 'en' }) {
  const s = STRINGS[lang];
  const hasCoords = typeof card.lat === 'number' && typeof card.lng === 'number';
  // Address wins the headline when we have one; the raw name (often the
  // coordinate placeholder) drops to a secondary line rather than vanishing —
  // it's still what the rest of the system stored.
  const headline = card.address || card.name;
  const showNameBelow = !!card.address && card.name !== card.address;
  const hazards = (card.pinHazard ?? []).filter(h => h.level >= 0 && h.level <= 4);

  return (
    <div
      className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] dark:bg-stone-900 dark:border-stone-700 overflow-hidden'
      data-testid='cbo-site-card'
    >
      <div className='px-3 pt-2 text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>
        {s.eyebrow}
      </div>
      <div className='px-3 pb-3 pt-1.5'>
        {hasCoords && (
          <div className='mb-2'>
            <SiteThumb lat={card.lat!} lng={card.lng!} alt={s.mapAlt} />
          </div>
        )}

        <div className='text-sm font-bold' data-testid='cbo-site-card-name'>
          📍 {headline}
        </div>
        <div className='text-[11px] text-muted-foreground'>
          {card.bairro}, Porto Alegre
        </div>
        {showNameBelow && (
          <div className='text-[10px] text-muted-foreground/80 mt-0.5'>
            {card.name}
          </div>
        )}

        {card.siteTypeLabel && (
          <div className='mt-2 rounded-lg border border-dashed border-[#e2d9c4] dark:border-stone-700 bg-white dark:bg-stone-950 px-2.5 py-1.5 text-[11.5px]'>
            {s.tipo} <span className='font-bold'>{card.siteTypeLabel}</span>{' '}
            <span className='text-muted-foreground'>{s.fromMap}</span>
          </div>
        )}

        {/* The Prefeitura's ameaça at the pin, already classed and worded by
            the server — or nothing, when the pin has no PLAC data. */}
        {(hazards.length > 0 || card.guaiba) && (
          <div
            className='mt-3 pt-2 border-t border-[#e2d9c4] dark:border-stone-700'
            data-testid='cbo-site-card-hazard'
          >
            <div className='text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400 mb-1'>
              {s.hazardHead}
            </div>
            {hazards.length > 0 && (
            <div className='flex gap-1.5'>
              {hazards.map(h => (
                <div
                  key={h.hazard}
                  className='flex-1 rounded-lg border border-[#e2d9c4] bg-white dark:bg-stone-950 dark:border-stone-700 px-2 py-1'
                  data-testid={`cbo-site-card-hazard-${h.hazard}`}
                >
                  <div className='text-[9.5px] font-semibold text-muted-foreground leading-tight'>{s.hz[h.hazard]}</div>
                  <div className='text-[11.5px] font-bold' style={{ color: LEVEL_COLORS[h.level] }}>
                    {lang === 'pt' ? h.pt : h.en}
                  </div>
                  <div className='h-[3px] rounded-full bg-[#eee7d6] dark:bg-stone-800 mt-1 overflow-hidden'>
                    <div
                      className='h-full rounded-full'
                      style={{ width: `${(h.level + 1) * 20}%`, background: LEVEL_COLORS[h.level] }}
                    />
                  </div>
                </div>
              ))}
            </div>
            )}
            {card.guaiba && (
              <div className='text-[11px] leading-snug mt-1.5' data-testid='cbo-site-card-guaiba'>
                🌊 {lang === 'pt' ? card.guaiba.pt : card.guaiba.en}{' '}
                <span className='text-[10px] text-muted-foreground'>— {card.guaiba.source}</span>
              </div>
            )}
            <div className='text-[10px] text-muted-foreground mt-1'>{s.hazardSource}</div>
          </div>
        )}
      </div>
    </div>
  );
}
