// Desktop grid layouts for the orchestrator NBS tabs. These are thin LAYOUT
// wrappers only — they arrange the same leaf cards the mobile CBO chat uses
// (NbsTypeCard, NbsShowcaseCardItem), so a content edit reaches both surfaces.
// The 3-col grid mirrors the participant grid on the same page for consistency.
//
// Design record: docs/nbs-type-content-model.md

import { useState } from 'react';
import type { NbsInterventionTypeId } from '@shared/cbo-schema';
import { NBS_INTERVENTION_TYPES } from '@shared/cbo-schema';
import { NBS_TYPE_CONTENT } from '@shared/nbs-type-content';
import { NBS_FAMILIAS, getSolution, solutionsForFamilia } from '@shared/nbs-catalog';
import type { NbsShowcaseCard } from '@shared/nbs-showcase-cards';
import { Dialog, DialogContent } from '@/core/components/ui/dialog';
import { NbsTypeDialog } from './NbsTypeDialog';
import { NbsSolutionCard } from './NbsSolutionCard';
import { NbsSolutionDetail } from './NbsSolutionDetail';
import { NbsShowcaseCardItem } from './NbsShowcaseCard';
import { CroquiLightbox } from './CroquiLightbox';
import type { CroquiLightboxContent } from './CroquiLightbox';
import {
  EMPTY_SOLUTION_FILTER,
  NbsSolutionFilterChips,
  filterSolutions,
  isFilterActive,
  solutionFilterEmptyText,
  type SolutionFilter,
} from './NbsSolutionFilterChips';

const GRID = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';
const STRINGS = {
  pt: {
    croquiEyebrow: 'Croqui da família · ilustração esquemática',
    solutionsEyebrow: (n: number) => `As ${n} soluções · fotos reais`,
    ampliar: 'Toque para ampliar',
    antes: 'ANTES',
    depois: 'DEPOIS',
  },
  en: {
    croquiEyebrow: 'Família croqui · schematic illustration',
    solutionsEyebrow: (n: number) => `The ${n} solutions · real photos`,
    ampliar: 'Click to enlarge',
    antes: 'BEFORE',
    depois: 'AFTER',
  },
};

/** "Soluções" tab — the full Rede SCbN POA catalog: five família sections, each
 *  with its solution variants. Every variant opens its own ficha técnica
 *  (NbsSolutionDetail); variants mapped to a deep-content type link onward to
 *  the croqui/cost dialog as a complement. */
export function NbsSolutionsGrid({ lang }: { lang: 'pt' | 'en' }) {
  const [openTypeId, setOpenTypeId] = useState<NbsInterventionTypeId | null>(
    null
  );
  const [openSolutionId, setOpenSolutionId] = useState<string | null>(null);
  const [croqui, setCroqui] = useState<CroquiLightboxContent | null>(null);
  const [filter, setFilter] = useState<SolutionFilter>(EMPTY_SOLUTION_FILTER);
  const s = STRINGS[lang];
  const openSolution = openSolutionId ? getSolution(openSolutionId) : undefined;
  const typeIds = NBS_INTERVENTION_TYPES.filter(
    t => NBS_TYPE_CONTENT[t.id]
  ).map(t => t.id);
  const anyVisible = NBS_FAMILIAS.some(
    f => filterSolutions(solutionsForFamilia(f.id), filter).length > 0
  );

  return (
    <div className='space-y-8'>
      {/* Catalog-wide "o que a gente consegue fazer?" filter (Julia, biweekly
          2026-07-16) — famílias with no matching solution collapse away. */}
      <NbsSolutionFilterChips value={filter} onChange={setFilter} lang={lang} />
      {isFilterActive(filter) && !anyVisible && (
        <p
          className='m-0 rounded-lg bg-muted px-3 py-4 text-center text-xs text-muted-foreground'
          data-testid='solution-filter-empty'
        >
          {solutionFilterEmptyText(lang)}
        </p>
      )}
      {NBS_FAMILIAS.map(familia => {
        const solutions = filterSolutions(
          solutionsForFamilia(familia.id),
          filter
        );
        if (solutions.length === 0) return null;
        return (
          <section
            key={familia.id}
            data-testid={`familia-section-${familia.id}`}
          >
            <div className='mb-3 flex items-baseline gap-2.5'>
              <span
                aria-hidden='true'
                className='h-2.5 w-2.5 shrink-0 self-center rounded-[3px]'
                style={{ background: familia.color }}
              />
              <h3 className='m-0 text-base font-semibold tracking-tight'>
                {familia[lang].label}
              </h3>
              <span className='text-xs tabular-nums text-muted-foreground'>
                {solutions.length}
              </span>
              <span className='hidden text-xs text-muted-foreground sm:inline'>
                — {familia[lang].description}
              </span>
            </div>
            {/* The croqui pair sits BESIDE its variants and stays pinned while
                they scroll (sticky) — the transformation is always in view.
                Paper treatment + eyebrows separate "schematic drawing" from
                "real photos" at a glance (field ask, 2026-07-15). */}
            <div className='flex flex-col gap-5 lg:flex-row'>
              <div className='shrink-0 lg:sticky lg:top-4 lg:w-1/3 lg:self-start'>
                <div
                  className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] p-3 dark:border-stone-700 dark:bg-stone-900'
                  data-testid={`familia-croqui-panel-${familia.id}`}
                >
                  <p className='m-0 mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#7a6f56] dark:text-stone-400'>
                    {s.croquiEyebrow}
                  </p>
                  <button
                    type='button'
                    className='block w-full space-y-2 text-left'
                    onClick={() =>
                      setCroqui({
                        src: familia.croqui,
                        before: familia.croquiBefore,
                        title: familia[lang].label,
                        antesCaption: familia.croquiCaptions[lang].antes,
                        depoisCaption: familia.croquiCaptions[lang].depois,
                      })
                    }
                    data-testid={`familia-croqui-${familia.id}`}
                  >
                    <figure className='relative m-0'>
                      <img
                        src={familia.croquiBefore}
                        alt=''
                        loading='lazy'
                        decoding='async'
                        className='aspect-[4/3] w-full rounded-lg object-cover'
                      />
                      <span className='absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[9.5px] font-bold tracking-wide text-white'>
                        {s.antes}
                      </span>
                      <figcaption className='mt-1 text-[11px] leading-snug text-[#6d6350] dark:text-stone-400'>
                        {familia.croquiCaptions[lang].antes}
                      </figcaption>
                    </figure>
                    <figure className='relative m-0'>
                      <img
                        src={familia.croqui}
                        alt=''
                        loading='lazy'
                        decoding='async'
                        className='aspect-[4/3] w-full rounded-lg object-cover'
                      />
                      <span className='absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[9.5px] font-bold tracking-wide text-white'>
                        {s.depois}
                      </span>
                      <figcaption className='mt-1 text-[11px] leading-snug text-[#6d6350] dark:text-stone-400'>
                        {familia.croquiCaptions[lang].depois}
                      </figcaption>
                    </figure>
                    <span className='block text-[10px] italic text-[#8a7f68] dark:text-stone-500'>
                      {s.ampliar}
                    </span>
                  </button>
                </div>
              </div>
              <div className='min-w-0 flex-1'>
                <p className='m-0 mb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground'>
                  {s.solutionsEyebrow(solutions.length)}
                </p>
                <div className='grid grid-cols-1 gap-5 sm:grid-cols-2'>
                  {solutions.map(solution => (
                    <NbsSolutionCard
                      key={solution.id}
                      solution={solution}
                      lang={lang}
                      onOpenFicha={setOpenSolutionId}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <CroquiLightbox
        content={croqui}
        lang={lang}
        onClose={() => setCroqui(null)}
      />

      {/* Per-solution ficha técnica dialog; "ver conteúdo do tipo" swaps to the
          croqui/knowledge dialog below (never both open at once). */}
      <Dialog
        open={!!openSolution}
        onOpenChange={open => { if (!open) setOpenSolutionId(null); }}
      >
        <DialogContent
          className='max-h-[85vh] max-w-3xl overflow-y-auto'
          data-testid='nbs-solution-dialog'
        >
          {openSolution && (
            <NbsSolutionDetail
              solution={openSolution}
              lang={lang}
              wide
              onOpenTypeContent={typeId => {
                setOpenSolutionId(null);
                setOpenTypeId(typeId);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <NbsTypeDialog
        typeIds={typeIds}
        openTypeId={openTypeId}
        onOpenTypeId={setOpenTypeId}
        onClose={() => setOpenTypeId(null)}
        lang={lang}
      />
    </div>
  );
}

/** "Casos" tab — the Brazilian named-project case studies. Read-only: reuses the
 *  showcase leaf in browse mode (no save toggle). Cards with a verified photo show
 *  it; the rest render the gradient + emoji placeholder, same as the CBO chat. */
export function NbsCasesGrid({
  cards,
  lang,
}: {
  cards: NbsShowcaseCard[];
  lang: 'pt' | 'en';
}) {
  return (
    <div className={GRID}>
      {cards.map(card => (
        <NbsShowcaseCardItem
          key={card.id}
          card={card}
          lang={lang}
          isSaved={false}
          onToggleSave={() => {}}
          mode='browse'
        />
      ))}
    </div>
  );
}
