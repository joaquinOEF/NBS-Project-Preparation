// NbsFamiliaCard — the leaf card for one of the 5 famílias from the Rede SCbN
// POA deck: croqui cover (the register rule: croqui teaches the CATEGORY, the
// deck photo documents the EXAMPLE — variants keep the photos), família color
// accent, name, one-line description and an option count. Headless like
// NbsTypeCard — fills whatever cell the parent gives it (chat strip snap item,
// desktop grid track).
//
// The two-level rule this card exists for: the agent recommends the FAMÍLIA;
// the organization picks the variante inside NbsFamiliaSheet.
//
// Design record: biweekly taxonomy proposal (2026-07-15)

import { ArrowRight } from 'lucide-react';
import type { NbsFamiliaId } from '@shared/nbs-catalog';
import { getFamilia, solutionsForFamilia } from '@shared/nbs-catalog';

const OPTIONS_LABEL = {
  pt: (n: number) => `Ver as ${n} opções`,
  en: (n: number) => `See the ${n} options`,
};
const COUNT_LABEL = {
  pt: (n: number) => `${n} opções`,
  en: (n: number) => `${n} options`,
};

export function NbsFamiliaCard({
  id,
  lang,
  onOpen,
  onOpenCroqui,
}: {
  id: NbsFamiliaId;
  lang: 'pt' | 'en';
  onOpen: (id: NbsFamiliaId) => void;
  /** Tap on the cover enlarges the croqui (the 104px crop hides most of it). */
  onOpenCroqui?: (id: NbsFamiliaId) => void;
}) {
  const familia = getFamilia(id);
  if (!familia) return null;
  const loc = familia[lang];
  const count = solutionsForFamilia(id).length;

  const cover = (
    <>
      <img
        src={familia.croqui}
        alt=''
        aria-hidden='true'
        loading='lazy'
        decoding='async'
        className='h-full w-full object-cover'
      />
      <div
        aria-hidden='true'
        className='absolute inset-x-0 bottom-0 h-1'
        style={{ background: familia.color }}
      />
    </>
  );

  return (
    <div
      className='flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-emerald-500/60'
      data-testid={`familia-card-${id}`}
    >
      {onOpenCroqui ? (
        <button
          type='button'
          onClick={() => onOpenCroqui(id)}
          className='relative h-[104px] w-full shrink-0 overflow-hidden bg-muted'
          aria-label={loc.label}
          data-testid={`familia-cover-croqui-${id}`}
        >
          {cover}
        </button>
      ) : (
        <div className='relative h-[104px] w-full shrink-0 overflow-hidden bg-muted'>
          {cover}
        </div>
      )}

      <div className='flex flex-1 flex-col gap-1.5 p-3'>
        <h4 className='text-sm font-semibold leading-tight tracking-tight'>
          <span aria-hidden='true' className='mr-1'>
            {familia.emoji}
          </span>
          {loc.label}
        </h4>
        <p className='text-xs leading-snug text-muted-foreground'>
          {loc.description}
        </p>

        <div className='mt-auto flex items-center pt-1'>
          <span className='rounded-[3px] bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground'>
            {COUNT_LABEL[lang](count)}
          </span>
        </div>

        <button
          type='button'
          onClick={() => onOpen(id)}
          className='mt-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950'
          data-testid={`familia-expand-${id}`}
        >
          {OPTIONS_LABEL[lang](count)}
          <ArrowRight className='h-3 w-3' />
        </button>
      </div>
    </div>
  );
}
