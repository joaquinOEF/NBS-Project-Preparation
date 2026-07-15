// NbsSolutionCard — the leaf card for ONE of the 27 Rede SCbN POA solutions:
// the solution's own deck-card photo + name + what-it-is + two chips (delivery,
// cost band). Headless like NbsTypeCard: no width, fills its parent cell — the
// same leaf renders as a row inside NbsFamiliaSheet (mobile chat) and as a grid
// track on the desktop orchestrator (NbsFamiliasGrid).
//
// Photos are documentary (named places curated by the deck's authors) — the
// credit line renders the card's place, per docs/photo-curation.md.
//
// Design record: biweekly taxonomy proposal (2026-07-15) + docs/nbs-type-content-model.md

import { ArrowRight } from 'lucide-react';
import type { NbsSolution } from '@shared/nbs-catalog';
import { nbsSolutionPhoto } from '@shared/nbs-catalog';
import type { NbsCostBand } from '@shared/nbs-type-content';
import type { NbsInterventionTypeId } from '@shared/cbo-schema';
import { DELIVERY_CLASS, DELIVERY_LABELS } from './NbsTypeCard';

const COST_LABELS: Record<'pt' | 'en', Record<NbsCostBand, string>> = {
  pt: { baixo: 'custo baixo', medio: 'custo médio', alto: 'custo alto' },
  en: { baixo: 'low cost', medio: 'medium cost', alto: 'high cost' },
};

const FICHA_LABEL = { pt: 'Ficha técnica', en: 'Details' };

export function NbsSolutionCard({
  solution,
  lang,
  onOpenLegacy,
}: {
  solution: NbsSolution;
  lang: 'pt' | 'en';
  /** When set and the solution maps to a deep-content type, renders a
   *  "Ficha técnica" button that opens that type's croqui/cost detail. */
  onOpenLegacy?: (id: NbsInterventionTypeId) => void;
}) {
  const loc = solution[lang];

  return (
    <div
      className='flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card'
      data-testid={`solution-card-${solution.id}`}
    >
      <div className='h-[104px] w-full shrink-0 overflow-hidden bg-muted'>
        <img
          src={nbsSolutionPhoto(solution.id)}
          alt=''
          aria-hidden='true'
          loading='lazy'
          decoding='async'
          className='h-full w-full object-cover'
        />
      </div>

      <div className='flex flex-1 flex-col gap-1.5 p-3'>
        <h4 className='text-sm font-semibold leading-tight tracking-tight'>
          {loc.label}
        </h4>
        <p className='text-xs leading-snug text-muted-foreground'>
          {loc.whatItIs}
        </p>

        <div className='mt-auto flex flex-wrap items-center gap-1 pt-1'>
          <span
            className={`rounded-[3px] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${DELIVERY_CLASS[solution.delivery]}`}
          >
            {DELIVERY_LABELS[lang][solution.delivery]}
          </span>
          <span className='rounded-[3px] bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground'>
            {COST_LABELS[lang][solution.costBand]}
          </span>
        </div>

        <p className='text-[10px] leading-tight text-muted-foreground/70'>
          {solution.exampleCity}
        </p>

        {onOpenLegacy && solution.legacyTypeId && (
          <button
            type='button'
            onClick={() => onOpenLegacy(solution.legacyTypeId!)}
            className='mt-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950'
            data-testid={`solution-ficha-${solution.id}`}
          >
            {FICHA_LABEL[lang]}
            <ArrowRight className='h-3 w-3' />
          </button>
        )}
      </div>
    </div>
  );
}
