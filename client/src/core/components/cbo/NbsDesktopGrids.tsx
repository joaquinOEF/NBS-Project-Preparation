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

const GRID = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';
const CROQUI_CAPTION = { pt: 'Ilustração esquemática — toque para ampliar', en: 'Schematic illustration — click to enlarge' };

/** "Soluções" tab — the full Rede SCbN POA catalog: five família sections, each
 *  with its solution variants. Every variant opens its own ficha técnica
 *  (NbsSolutionDetail); variants mapped to a deep-content type link onward to
 *  the croqui/cost dialog as a complement. */
export function NbsSolutionsGrid({ lang }: { lang: 'pt' | 'en' }) {
  const [openTypeId, setOpenTypeId] = useState<NbsInterventionTypeId | null>(
    null
  );
  const [openSolutionId, setOpenSolutionId] = useState<string | null>(null);
  const [croqui, setCroqui] = useState<{ src: string; title: string } | null>(null);
  const openSolution = openSolutionId ? getSolution(openSolutionId) : undefined;
  const typeIds = NBS_INTERVENTION_TYPES.filter(
    t => NBS_TYPE_CONTENT[t.id]
  ).map(t => t.id);

  return (
    <div className='space-y-8'>
      {NBS_FAMILIAS.map(familia => {
        const solutions = solutionsForFamilia(familia.id);
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
            {/* The croqui sits BESIDE its variants — the category drawing and
                the concrete options read together (field ask, 2026-07-15). */}
            <div className='flex flex-col gap-5 lg:flex-row'>
              <figure className='m-0 shrink-0 lg:w-1/3'>
                <button
                  type='button'
                  className='block w-full overflow-hidden rounded-xl border border-border transition-colors hover:border-emerald-500/60'
                  onClick={() =>
                    setCroqui({ src: familia.croqui, title: familia[lang].label })
                  }
                  data-testid={`familia-croqui-${familia.id}`}
                >
                  <img
                    src={familia.croqui}
                    alt={familia[lang].label}
                    loading='lazy'
                    decoding='async'
                    className='aspect-[4/3] w-full object-cover'
                  />
                </button>
                <figcaption className='mt-1 px-1 text-[10px] italic text-muted-foreground'>
                  {CROQUI_CAPTION[lang]}
                </figcaption>
              </figure>
              <div className='min-w-0 flex-1'>
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
        src={croqui?.src ?? null}
        title={croqui?.title}
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
