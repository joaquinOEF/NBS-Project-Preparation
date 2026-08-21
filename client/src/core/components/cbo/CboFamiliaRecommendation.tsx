import type { FamiliaRecoItem } from '@shared/cbo-schema';
import { getFamilia, getSolution } from '@shared/nbs-catalog';

// E2 linear flow closing — "famílias pra estudar" (decision C2 + C1's ranking
// and why lines): each recommended família as a ranked row with its croqui
// thumbnail, a one-line why tied to the org's own data, and concrete example
// variants ("ex.: jardim de chuva"). Always ≥2 — an invitation to study, never
// a single verdict (Robson/Ana rule: agent recommends the FAMÍLIA, the org
// picks the variante — that selection happens in E3). Read-only strip; the
// Faz sentido / Quero ajustar chips ride in the paired ask_user.

const STRINGS = {
  pt: {
    eyebrow: 'Pra esse lugar, vale estudar',
    ex: 'ex.:',
    weak: 'sem sinal forte pra esse lugar — mas dá pra explorar',
  },
  en: {
    eyebrow: 'For this place, worth studying',
    ex: 'e.g.:',
    weak: 'no strong signal for this place — but you can explore them',
  },
};

export function CboFamiliaRecommendation({
  items,
  intro,
  lang,
}: {
  items: FamiliaRecoItem[];
  intro?: string;
  lang: 'pt' | 'en';
}) {
  const s = STRINGS[lang];
  // Every família ships; the ones with nothing behind them are grouped rather
  // than ranked, so the list can carry all five without implying the last two
  // were reasoned into position.
  const strong = items.filter(i => !i.weak);
  const weak = items.filter(i => i.weak);
  return (
    <div
      className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] dark:bg-stone-900 dark:border-stone-700 px-3 py-2.5'
      data-testid='cbo-familia-reco'
    >
      <div className='text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400 mb-1.5'>
        {s.eyebrow} · {items.length} grupos
      </div>
      {intro && <p className='text-[11.5px] text-muted-foreground mb-1.5'>{intro}</p>}
      <div className='space-y-1.5'>
        {strong.map((item, i) => {
          const familia = getFamilia(item.familiaId as any);
          if (!familia) return null;
          const examples = (item.exampleSolutionIds ?? [])
            .map(id => getSolution(id as any)?.[lang]?.label)
            .filter(Boolean)
            .slice(0, 2);
          return (
            <div
              key={item.familiaId}
              className='flex items-center gap-2.5 rounded-lg border border-[#e2d9c4] dark:border-stone-700 bg-white dark:bg-stone-950 p-2'
              data-testid={`familia-reco-${item.familiaId}`}
            >
              <span className='shrink-0 w-5 h-5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[11px] font-extrabold flex items-center justify-center'>
                {i + 1}
              </span>
              <img
                src={familia.croqui}
                alt=''
                className='w-16 h-12 rounded-md object-cover shrink-0'
                loading='lazy'
              />
              <div className='min-w-0'>
                <div className='text-[12.5px] font-extrabold leading-tight'>
                  {familia.emoji} {familia[lang].label}
                </div>
                <div className='text-[10.5px] text-muted-foreground leading-snug'>{item.why}</div>
                {examples.length > 0 && (
                  <div className='text-[10px] text-emerald-800 dark:text-emerald-300 font-medium mt-0.5'>
                    {s.ex} {examples.join(' · ')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {weak.length > 0 && (
        <div className='mt-2 pt-2 border-t border-[#e2d9c4] dark:border-stone-700' data-testid='familia-reco-weak'>
          <div className='text-[9.5px] uppercase tracking-wide text-[#8a7d5c] dark:text-stone-400 mb-1'>
            {s.weak}
          </div>
          <div className='flex flex-wrap gap-1.5'>
            {weak.map(item => {
              const familia = getFamilia(item.familiaId as any);
              if (!familia) return null;
              return (
                <span
                  key={item.familiaId}
                  className='text-[11px] rounded-full border border-[#e2d9c4] dark:border-stone-700 bg-white/70 dark:bg-stone-950 px-2.5 py-1 text-muted-foreground'
                  data-testid={`familia-reco-weak-${item.familiaId}`}
                >
                  {familia.emoji} {familia[lang].label}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
