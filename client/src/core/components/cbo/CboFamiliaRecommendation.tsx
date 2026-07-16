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
  pt: { eyebrow: 'Pra esse lugar, vale estudar', ex: 'ex.:' },
  en: { eyebrow: 'For this place, worth studying', ex: 'e.g.:' },
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
  return (
    <div
      className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] dark:bg-stone-900 dark:border-stone-700 px-3 py-2.5'
      data-testid='cbo-familia-reco'
    >
      <div className='text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400 mb-1.5'>
        {s.eyebrow} · {items.length} famílias
      </div>
      {intro && <p className='text-[11.5px] text-muted-foreground mb-1.5'>{intro}</p>}
      <div className='space-y-1.5'>
        {items.map((item, i) => {
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
    </div>
  );
}
