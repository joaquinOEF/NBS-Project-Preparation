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
import {
  EMPTY_SOLUTION_FILTER,
  NbsSolutionFilterChips,
  filterSolutions,
  isFilterActive,
  solutionFilterEmptyText,
  type SolutionFilter,
} from './NbsSolutionFilterChips';

const STRINGS = {
  pt: {
    close: 'Fechar',
    back: 'Voltar para a lista',
    handle: 'Arraste para fechar',
    credit: 'Fotos: cartas da Rede SCbN de POA (fontes MMA, GIZ e CNM)',
    estNote: '* classificação estimada, em verificação',
    croquiHint: 'Ilustração esquemática — toque para ampliar',
    antes: 'ANTES',
    depois: 'DEPOIS',
  },
  en: {
    close: 'Close',
    back: 'Back to the list',
    handle: 'Drag to close',
    credit: 'Photos: Rede SCbN de POA card deck (MMA, GIZ and CNM sources)',
    estNote: '* estimated classification, under verification',
    croquiHint: 'Schematic illustration — tap to enlarge',
    antes: 'BEFORE',
    depois: 'AFTER',
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
  const [filter, setFilter] = useState<SolutionFilter>(EMPTY_SOLUTION_FILTER);
  const familia = openFamiliaId ? getFamilia(openFamiliaId) : undefined;
  const solutions = openFamiliaId ? solutionsForFamilia(openFamiliaId) : [];
  const visibleSolutions = filterSolutions(solutions, filter);
  const openSolution = openSolutionId ? getSolution(openSolutionId) : undefined;

  // Fresh view state per família; scroll back to top on list ⇄ detail swaps.
  useEffect(() => { setOpenSolutionId(null); setFilter(EMPTY_SOLUTION_FILTER); }, [openFamiliaId]);
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
            // max-w + centered so a desktop-width drawer doesn't render one
            // huge full-width column; the solutions live in a GRID (1-col on
            // phones, 2 from sm) — grid cells are also what makes the card's
            // h-full mean "equal row height" instead of "as tall as the whole
            // sheet body" (JVP screenshot 2026-07-16: one viewport-tall card
            // per solution, chips pushed to the bottom by mt-auto).
            <div className='mx-auto w-full max-w-3xl space-y-3'>
              {familia && (
                <p className='m-0 text-xs leading-relaxed text-muted-foreground'>
                  {familia[lang].description}
                </p>
              )}
              {/* The teaching moment: the ANTES/DEPOIS croqui pair with its
                  one-line captions opens the sheet (E2 mockup decision D,
                  2026-07-15) — the strip card stays a calm DEPOIS. */}
              {familia && (
                <button
                  type='button'
                  className='block w-full rounded-lg border border-[#e2d9c4] bg-[#f8f4ea] p-2 text-left dark:border-stone-700 dark:bg-stone-900'
                  onClick={() => setCroquiOpen(true)}
                  data-testid='familia-sheet-croqui'
                  data-vaul-no-drag
                >
                  <div className='flex gap-2'>
                    <figure className='relative m-0 w-1/2'>
                      <img
                        src={familia.croquiBefore}
                        alt=''
                        loading='lazy'
                        decoding='async'
                        className='aspect-[4/3] w-full rounded-md object-cover'
                      />
                      <span className='absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[8.5px] font-bold tracking-wide text-white'>
                        {s.antes}
                      </span>
                      <figcaption className='mt-1 text-[10px] leading-snug text-muted-foreground'>
                        {familia.croquiCaptions[lang].antes}
                      </figcaption>
                    </figure>
                    <figure className='relative m-0 w-1/2'>
                      <img
                        src={familia.croqui}
                        alt=''
                        loading='lazy'
                        decoding='async'
                        className='aspect-[4/3] w-full rounded-md object-cover'
                      />
                      <span className='absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[8.5px] font-bold tracking-wide text-white'>
                        {s.depois}
                      </span>
                      <figcaption className='mt-1 text-[10px] leading-snug text-muted-foreground'>
                        {familia.croquiCaptions[lang].depois}
                      </figcaption>
                    </figure>
                  </div>
                  <span className='mt-1 block text-[10px] italic text-muted-foreground/80'>
                    {s.croquiHint}
                  </span>
                </button>
              )}
              {/* "O que a gente consegue fazer?" — filters over the delivery/
                  cost attributes the cards already badge (Julia, biweekly
                  2026-07-16). Sticky so the chips survive the scroll. */}
              <div className='sticky top-0 z-10 -mx-1 bg-background px-1 pb-2 pt-1'>
                <NbsSolutionFilterChips value={filter} onChange={setFilter} lang={lang} />
              </div>
              {isFilterActive(filter) && visibleSolutions.length === 0 && (
                <p
                  className='m-0 rounded-lg bg-muted px-3 py-4 text-center text-xs text-muted-foreground'
                  data-testid='solution-filter-empty'
                >
                  {solutionFilterEmptyText(lang)}
                </p>
              )}
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                {visibleSolutions.map(solution => (
                  <NbsSolutionCard
                    key={solution.id}
                    solution={solution}
                    lang={lang}
                    onOpenFicha={setOpenSolutionId}
                  />
                ))}
              </div>
              <p className='m-0 pb-2 text-[10px] leading-tight text-muted-foreground/70'>
                {s.credit} · {s.estNote}
              </p>
            </div>
          )}
        </div>

        <CroquiLightbox
          content={
            croquiOpen && familia
              ? {
                  src: familia.croqui,
                  before: familia.croquiBefore,
                  title: familia[lang].label,
                  antesCaption: familia.croquiCaptions[lang].antes,
                  depoisCaption: familia.croquiCaptions[lang].depois,
                }
              : null
          }
          lang={lang}
          onClose={() => setCroquiOpen(false)}
        />
      </DrawerContent>
    </Drawer>
  );
}
