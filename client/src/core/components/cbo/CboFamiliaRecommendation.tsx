import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { FamiliaRecoItem } from '@shared/cbo-schema';
import type { NbsFamiliaId } from '@shared/nbs-catalog';
import { getFamilia, getSolution, solutionsForFamilia } from '@shared/nbs-catalog';
import { NbsFamiliaSheet } from './NbsFamiliaSheet';

// E2 linear flow closing — "famílias pra estudar" (decision C2 + C1's ranking
// and why lines): each recommended família as a ranked row with its croqui
// thumbnail, a one-line why tied to the org's own data, and concrete example
// variants ("ex.: jardim de chuva"). Always ≥2 — an invitation to study, never
// a single verdict (Robson/Ana rule: agent recommends the FAMÍLIA, the org
// picks the variante — that selection happens in E3). The Faz sentido / Quero
// ajustar chips ride in the paired ask_user.
//
// Each row expands into that família's solutions via NbsFamiliaSheet, the same
// surface NbsFamiliaStrip opens from its cards. Ana's W2 feedback: the summary
// offered only a jump to real cases, when what she asked for was to open the
// solutions behind the família. Expanding does NOT answer the question — the
// chips still do, exactly like the "ver casos reais" secondary control.
//
// ⚠️ testids here must not start with `familia-reco-`: cougar-e2-linear-journey
// counts `[data-testid^="familia-reco-"]` to assert how many famílias shipped,
// and `familia-expand-*` already belongs to NbsFamiliaCard, which can sit in the
// same transcript. Hence `reco-expand-*`.

const STRINGS = {
  pt: {
    eyebrow: 'Pra esse lugar, vale estudar',
    ex: 'ex.:',
    weak: 'sem sinal forte pra esse lugar — mas dá pra explorar',
    options: (n: number) => `Ver as ${n} opções`,
  },
  en: {
    eyebrow: 'For this place, worth studying',
    ex: 'e.g.:',
    weak: 'no strong signal for this place — but you can explore them',
    options: (n: number) => `See the ${n} options`,
  },
};

export function CboFamiliaRecommendation({
  items,
  intro,
  lang,
  worries = [],
}: {
  items: FamiliaRecoItem[];
  intro?: string;
  lang: 'pt' | 'en';
  /** The mechanisms the org named, so the variants inside an opened família
   *  lead with what answers their problem (backlog #24). Ordering only. */
  worries?: string[];
}) {
  const s = STRINGS[lang];
  const [openFamiliaId, setOpenFamiliaId] = useState<NbsFamiliaId | null>(null);
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
        {s.eyebrow} · {items.length} famílias
      </div>
      {intro && <p className='text-[11.5px] text-muted-foreground mb-1.5'>{intro}</p>}
      <div className='space-y-1.5'>
        {strong.map((item, i) => {
          const familia = getFamilia(item.familiaId as any);
          if (!familia) return null;
          const count = solutionsForFamilia(item.familiaId as any).length;
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
                {count > 0 && (
                  <button
                    type='button'
                    onClick={() => setOpenFamiliaId(item.familiaId as NbsFamiliaId)}
                    className='mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10.5px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950'
                    data-testid={`reco-expand-${item.familiaId}`}
                  >
                    {s.options(count)}
                    <ArrowRight className='h-2.5 w-2.5' />
                  </button>
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
              // "nada fica descartado" — the weak ones open the same sheet, so
              // exploring them is a tap, not a request back to the assistant.
              return (
                <button
                  key={item.familiaId}
                  type='button'
                  onClick={() => setOpenFamiliaId(item.familiaId as NbsFamiliaId)}
                  className='text-[11px] rounded-full border border-[#e2d9c4] dark:border-stone-700 bg-white/70 dark:bg-stone-950 px-2.5 py-1 text-muted-foreground transition-colors hover:bg-white hover:text-foreground dark:hover:bg-stone-900'
                  data-testid={`familia-reco-weak-${item.familiaId}`}
                >
                  {familia.emoji} {familia[lang].label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <NbsFamiliaSheet
        worries={worries}
        openFamiliaId={openFamiliaId}
        onClose={() => setOpenFamiliaId(null)}
        lang={lang}
      />
    </div>
  );
}
