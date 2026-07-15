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
import { NBS_FAMILIAS, solutionsForFamilia } from '@shared/nbs-catalog';
import type { NbsShowcaseCard } from '@shared/nbs-showcase-cards';
import { NbsTypeCard } from './NbsTypeCard';
import { NbsTypeDialog } from './NbsTypeDialog';
import { NbsSolutionCard } from './NbsSolutionCard';
import { NbsShowcaseCardItem } from './NbsShowcaseCard';

const GRID = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';

/** "Soluções" tab — the full Rede SCbN POA catalog: five família sections, each
 *  with its solution variants. Variants that map to one of the six deep-content
 *  types keep a "Ficha técnica" button opening the croqui/cost dialog. */
export function NbsSolutionsGrid({ lang }: { lang: 'pt' | 'en' }) {
  const [openTypeId, setOpenTypeId] = useState<NbsInterventionTypeId | null>(
    null
  );
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
            <div className={GRID}>
              {solutions.map(solution => (
                <NbsSolutionCard
                  key={solution.id}
                  solution={solution}
                  lang={lang}
                  onOpenLegacy={setOpenTypeId}
                />
              ))}
            </div>
          </section>
        );
      })}

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
