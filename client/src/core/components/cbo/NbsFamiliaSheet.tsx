// NbsFamiliaSheet — the mobile "Ver opções" surface for ONE família: a vertical
// list of its solution variants (NbsSolutionCard leaves). Opens from a card in
// NbsFamiliaStrip.
//
// Follows the NbsTypeSheet interaction rules (docs/nbs-type-content-model.md):
// vertical scroll, vaul `handleOnly` so scrolling doesn't dismiss, real headings
// for screen readers. Unlike the type sheet it holds one família at a time —
// 11 variants is already a long scroll; stacking all 27 would bury the tail.
//
// `lang` arrives as a prop (never i18n.language in the component — pre-fetch race).

import { useCallback } from 'react';
import { X } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHandle,
} from '@/core/components/ui/drawer';
import type { NbsFamiliaId } from '@shared/nbs-catalog';
import { getFamilia, solutionsForFamilia } from '@shared/nbs-catalog';
import { NbsSolutionCard } from './NbsSolutionCard';

const STRINGS = {
  pt: {
    close: 'Fechar',
    handle: 'Arraste para fechar',
    credit: 'Fotos: cartas da Rede SCbN de POA (fontes MMA, GIZ e CNM)',
  },
  en: {
    close: 'Close',
    handle: 'Drag to close',
    credit: 'Photos: Rede SCbN de POA card deck (MMA, GIZ and CNM sources)',
  },
};

export function NbsFamiliaSheet({
  openFamiliaId,
  onClose,
  lang,
}: {
  /** Which família to show. `null` closes the sheet. */
  openFamiliaId: NbsFamiliaId | null;
  onClose: () => void;
  lang: 'pt' | 'en';
}) {
  const s = STRINGS[lang];
  const familia = openFamiliaId ? getFamilia(openFamiliaId) : undefined;
  const solutions = openFamiliaId ? solutionsForFamilia(openFamiliaId) : [];

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) onClose();
    },
    [onClose]
  );

  return (
    <Drawer
      open={!!familia}
      onOpenChange={handleOpenChange}
      handleOnly
      scrollLockTimeout={400}
    >
      <DrawerContent
        hideHandle
        className='h-[96dvh] max-h-[96dvh]'
        data-testid='nbs-familia-sheet'
        aria-label={familia ? familia[lang].label : undefined}
      >
        <DrawerHandle
          aria-label={s.handle}
          className='mx-auto mb-1 mt-2.5 h-1 w-10 shrink-0 cursor-grab rounded-full bg-neutral-300 dark:bg-neutral-700'
        />

        <div className='flex shrink-0 items-center gap-2.5 border-b border-border px-4 pb-2.5'>
          <span
            aria-hidden='true'
            className='h-2.5 w-2.5 shrink-0 rounded-[3px]'
            style={{ background: familia?.color }}
          />
          <h2 className='m-0 text-[14.5px] font-semibold tracking-tight'>
            {familia ? familia[lang].label : ''}
          </h2>
          <span className='ml-auto text-[11px] tabular-nums text-muted-foreground'>
            {solutions.length}
          </span>
          <button
            type='button'
            onClick={onClose}
            aria-label={s.close}
            data-testid='nbs-familia-sheet-close'
            className='flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className='min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4'>
          {familia && (
            <p className='m-0 text-xs leading-relaxed text-muted-foreground'>
              {familia[lang].description}
            </p>
          )}
          {solutions.map(solution => (
            <NbsSolutionCard
              key={solution.id}
              solution={solution}
              lang={lang}
            />
          ))}
          <p className='m-0 pb-2 text-[10px] leading-tight text-muted-foreground/70'>
            {s.credit}
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
