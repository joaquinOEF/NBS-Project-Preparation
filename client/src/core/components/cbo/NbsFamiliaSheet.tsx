// NbsFamiliaSheet — the mobile "Ver opções" surface for ONE família: a vertical
// list of its solution variants, each opening its per-solution ficha técnica
// (NbsSolutionDetail) INSIDE the same sheet (list ⇄ detail, with a back
// affordance) — nested drawers on a phone are a trap.
//
// Follows the NbsTypeSheet interaction rules (docs/nbs-type-content-model.md):
// vertical scroll, vaul `handleOnly` so scrolling doesn't dismiss, real headings
// for screen readers. It holds one família at a time — 11 variants is already a
// long scroll; stacking all 27 would bury the tail.
//
// `lang` arrives as a prop (never i18n.language in the component — pre-fetch race).

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHandle,
} from '@/core/components/ui/drawer';
import type { NbsFamiliaId } from '@shared/nbs-catalog';
import { getFamilia, getSolution, solutionsForFamilia } from '@shared/nbs-catalog';
import { NbsSolutionCard } from './NbsSolutionCard';
import { NbsSolutionDetail } from './NbsSolutionDetail';
import { CroquiLightbox } from './CroquiLightbox';

const STRINGS = {
  pt: {
    close: 'Fechar',
    back: 'Voltar para a lista',
    handle: 'Arraste para fechar',
    credit: 'Fotos: cartas da Rede SCbN de POA (fontes MMA, GIZ e CNM)',
    estNote: '* classificação estimada, em verificação',
    croquiHint: 'Ilustração esquemática — toque para ampliar',
  },
  en: {
    close: 'Close',
    back: 'Back to the list',
    handle: 'Drag to close',
    credit: 'Photos: Rede SCbN de POA card deck (MMA, GIZ and CNM sources)',
    estNote: '* estimated classification, under verification',
    croquiHint: 'Schematic illustration — tap to enlarge',
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
  const bodyRef = useRef<HTMLDivElement>(null);
  const [openSolutionId, setOpenSolutionId] = useState<string | null>(null);
  const [croquiOpen, setCroquiOpen] = useState(false);
  const familia = openFamiliaId ? getFamilia(openFamiliaId) : undefined;
  const solutions = openFamiliaId ? solutionsForFamilia(openFamiliaId) : [];
  const openSolution = openSolutionId ? getSolution(openSolutionId) : undefined;

  // Fresh view state per família; scroll back to top on list ⇄ detail swaps.
  useEffect(() => { setOpenSolutionId(null); }, [openFamiliaId]);
  useEffect(() => { bodyRef.current?.scrollTo(0, 0); }, [openSolutionId]);

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
          {openSolution ? (
            <button
              type='button'
              onClick={() => setOpenSolutionId(null)}
              aria-label={s.back}
              data-testid='nbs-familia-sheet-back'
              className='flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground'
            >
              <ArrowLeft className='h-4 w-4' />
            </button>
          ) : (
            <span
              aria-hidden='true'
              className='h-2.5 w-2.5 shrink-0 rounded-[3px]'
              style={{ background: familia?.color }}
            />
          )}
          <h2 className='m-0 min-w-0 truncate text-[14.5px] font-semibold tracking-tight'>
            {openSolution ? openSolution[lang].label : familia ? familia[lang].label : ''}
          </h2>
          {!openSolution && (
            <span className='ml-auto text-[11px] tabular-nums text-muted-foreground'>
              {solutions.length}
            </span>
          )}
          <button
            type='button'
            onClick={onClose}
            aria-label={s.close}
            data-testid='nbs-familia-sheet-close'
            className={`flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground ${openSolution ? 'ml-auto' : ''}`}
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        <div
          ref={bodyRef}
          className='min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4'
        >
          {openSolution ? (
            <NbsSolutionDetail solution={openSolution} lang={lang} />
          ) : (
            <>
              {familia && (
                <p className='m-0 text-xs leading-relaxed text-muted-foreground'>
                  {familia[lang].description}
                </p>
              )}
              {/* The família croqui reads WITH its variants — banner above the
                  list, tap to see it large (the strip card crops it to 104px). */}
              {familia && (
                <figure className='m-0'>
                  <button
                    type='button'
                    className='block w-full overflow-hidden rounded-lg border border-border'
                    onClick={() => setCroquiOpen(true)}
                    data-testid='familia-sheet-croqui'
                    data-vaul-no-drag
                  >
                    <img
                      src={familia.croqui}
                      alt={familia[lang].label}
                      loading='lazy'
                      decoding='async'
                      className='max-h-44 w-full object-cover'
                    />
                  </button>
                  <figcaption className='mt-1 px-1 text-[10px] italic text-muted-foreground'>
                    {s.croquiHint}
                  </figcaption>
                </figure>
              )}
              {solutions.map(solution => (
                <NbsSolutionCard
                  key={solution.id}
                  solution={solution}
                  lang={lang}
                  onOpenFicha={setOpenSolutionId}
                />
              ))}
              <p className='m-0 pb-2 text-[10px] leading-tight text-muted-foreground/70'>
                {s.credit} · {s.estNote}
              </p>
            </>
          )}
        </div>

        <CroquiLightbox
          src={croquiOpen && familia ? familia.croqui : null}
          title={familia?.[lang].label}
          lang={lang}
          onClose={() => setCroquiOpen(false)}
        />
      </DrawerContent>
    </Drawer>
  );
}
