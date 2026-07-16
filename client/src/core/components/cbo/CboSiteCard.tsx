import type { CboSiteCard as CboSiteCardPayload } from '@shared/cbo-schema';

// E2 linear flow — the site card (decision B1): what the org picked on the
// map, the bairro's risk profile as three level bars, and the inferred kind
// of place when a name keyword gives it away. Served by the checkpoint right
// after the focused site session confirms; the confirm chips ride in the
// paired ask_user, not here (strips have no buttons).
//
// i18n: in-component STRINGS + lang prop (never i18n.language in a leaf —
// pre-fetch race), same pattern as NbsFamiliaStrip.

const STRINGS = {
  pt: {
    eyebrow: 'Seu lugar · resumo automático',
    flood: '🌊 Enchente',
    heat: '🔥 Calor',
    landslide: '⛰️ Deslizam.',
    levels: ['Baixo', 'Médio', 'Alto'] as const,
    tipo: 'Tipo de lugar:',
    fromMap: '(pelo mapa)',
  },
  en: {
    eyebrow: 'Your place · automatic summary',
    flood: '🌊 Flood',
    heat: '🔥 Heat',
    landslide: '⛰️ Landslide',
    levels: ['Low', 'Medium', 'High'] as const,
    tipo: 'Kind of place:',
    fromMap: '(from the map)',
  },
};

const LEVEL_COLORS = ['#7d9aa6', '#c98a2d', '#c2543c'];

function levelIdx(pct: number): 0 | 1 | 2 {
  return pct >= 66 ? 2 : pct >= 33 ? 1 : 0;
}

function RiskBar({ label, pct, levels }: { label: string; pct: number; levels: readonly [string, string, string] }) {
  const idx = levelIdx(pct);
  return (
    <div className='flex-1 rounded-lg border border-[#e2d9c4] bg-white dark:bg-stone-950 dark:border-stone-700 px-2 py-1.5'>
      <div className='text-[10px] font-semibold text-muted-foreground'>{label}</div>
      <div className='text-[13px] font-extrabold' style={{ color: LEVEL_COLORS[idx] }}>
        {levels[idx]}
      </div>
      <div className='h-1 rounded-full bg-[#eee7d6] dark:bg-stone-800 mt-1 overflow-hidden'>
        <div
          className='h-full rounded-full'
          style={{ width: `${Math.max(8, Math.min(100, pct))}%`, background: LEVEL_COLORS[idx] }}
        />
      </div>
    </div>
  );
}

export function CboSiteCard({ card, lang }: { card: CboSiteCardPayload; lang: 'pt' | 'en' }) {
  const s = STRINGS[lang];
  return (
    <div
      className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] dark:bg-stone-900 dark:border-stone-700 overflow-hidden'
      data-testid='cbo-site-card'
    >
      <div className='px-3 pt-2 text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>
        {s.eyebrow}
      </div>
      <div className='px-3 pb-3 pt-1'>
        <div className='text-sm font-bold'>📍 {card.name}</div>
        <div className='text-[11px] text-muted-foreground mb-2'>{card.bairro}, Porto Alegre</div>
        <div className='flex gap-1.5 mb-2'>
          <RiskBar label={s.flood} pct={card.risks.flood} levels={s.levels} />
          <RiskBar label={s.heat} pct={card.risks.heat} levels={s.levels} />
          <RiskBar label={s.landslide} pct={card.risks.landslide} levels={s.levels} />
        </div>
        {card.siteTypeLabel && (
          <div className='rounded-lg border border-dashed border-[#e2d9c4] dark:border-stone-700 bg-white dark:bg-stone-950 px-2.5 py-1.5 text-[11.5px]'>
            {s.tipo} <span className='font-bold'>{card.siteTypeLabel}</span>{' '}
            <span className='text-muted-foreground'>{s.fromMap}</span>
          </div>
        )}
      </div>
    </div>
  );
}
