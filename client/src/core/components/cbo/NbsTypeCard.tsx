// NbsTypeCard — the leaf card for one NBS type: croqui + name + one benefit line
// + three chips (two hazards, one delivery chip naming who can build it). It has
// NO layout opinions and NO width of its own — it fills whatever cell the parent
// gives it (a 240px snap item in the CBO chat strip, a grid track on the desktop
// orchestrator). That's what keeps the two surfaces in lockstep: one card, two
// containers, zero forks.
//
// Design record: docs/nbs-type-content-model.md

import { ArrowRight } from 'lucide-react';
import {
  NBS_INTERVENTION_TYPES,
  getLocalizedNbsType,
} from '@shared/cbo-schema';
import type { NbsInterventionTypeId } from '@shared/cbo-schema';
import { getNbsTypeContent, nbsIllustration } from '@shared/nbs-type-content';
import type { NbsDelivery } from '@shared/nbs-type-content';

// Fallback wash behind the croqui — also what shows if an image fails to load.
const GRADIENTS: Record<'flood' | 'heat' | 'biodiversity', string> = {
  flood: 'linear-gradient(135deg, #cffafe 0%, #67e8f9 100%)',
  heat: 'linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%)',
  biodiversity: 'linear-gradient(135deg, #d1fae5 0%, #6ee7b7 100%)',
};

// Which hazards each type primarily addresses. Derived from knowledge/_interventions/*.md.
const TYPE_VISUAL: Record<
  string,
  {
    gradient: 'flood' | 'heat' | 'biodiversity';
    hazards: Array<'flood' | 'heat'>;
  }
> = {
  'bioswales-rain-gardens': { gradient: 'flood', hazards: ['flood'] },
  'flood-parks': { gradient: 'flood', hazards: ['flood'] },
  'green-corridors': { gradient: 'biodiversity', hazards: ['heat', 'flood'] },
  'green-roofs-walls': { gradient: 'heat', hazards: ['heat', 'flood'] },
  'urban-forests': { gradient: 'biodiversity', hazards: ['heat', 'flood'] },
  'wetland-restoration': { gradient: 'flood', hazards: ['flood'] },
};

const HAZARD_LABELS = {
  pt: { flood: 'enchente', heat: 'calor' },
  en: { flood: 'flood', heat: 'heat' },
};

// Exported: NbsSolutionCard (the 27-variant leaf) reuses the same chip
// vocabulary so família variants and type cards never disagree on wording.
export const DELIVERY_LABELS: Record<'pt' | 'en', Record<NbsDelivery, string>> =
  {
    pt: {
      mutirao: 'mutirão',
      parceria: 'parceria',
      licenca: 'licença ambiental',
    },
    en: {
      mutirao: 'mutirão',
      parceria: 'partnership',
      licenca: 'env. licence',
    },
  };

// The delivery chip is the honest one: at community scale all six are affordable,
// so what actually gates a project is who has to say yes and who keeps it alive.
export const DELIVERY_CLASS: Record<NbsDelivery, string> = {
  mutirao:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  parceria: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  licenca: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

const MORE_LABEL = { pt: 'Saber mais', en: 'Learn more' };

export function NbsTypeCard({
  id,
  lang,
  onOpen,
}: {
  id: NbsInterventionTypeId;
  lang: 'pt' | 'en';
  onOpen: (id: NbsInterventionTypeId) => void;
}) {
  const { copy, delivery } = getNbsTypeContent(id, lang);
  const type = NBS_INTERVENTION_TYPES.find(t => t.id === id)!;
  const loc = getLocalizedNbsType(type, lang);
  const visual = TYPE_VISUAL[id] ?? {
    gradient: 'biodiversity' as const,
    hazards: [],
  };

  return (
    <div
      className='flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-emerald-500/60'
      data-testid={`type-card-${id}`}
    >
      <div
        className='h-[118px] w-full shrink-0 overflow-hidden'
        style={{ background: GRADIENTS[visual.gradient] }}
      >
        <img
          src={nbsIllustration(id, 'after')}
          alt=''
          aria-hidden='true'
          width={1200}
          height={896}
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
          {copy.benefit}
        </p>

        <div className='mt-auto flex flex-wrap items-center gap-1 pt-1'>
          {visual.hazards.map(h => (
            <span
              key={h}
              className='rounded-[3px] bg-muted px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground'
            >
              {HAZARD_LABELS[lang][h]}
            </span>
          ))}
          <span
            className={`rounded-[3px] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${DELIVERY_CLASS[delivery]}`}
          >
            {DELIVERY_LABELS[lang][delivery]}
          </span>
        </div>

        <button
          type='button'
          onClick={() => onOpen(id)}
          className='mt-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950'
          data-testid={`type-expand-${id}`}
        >
          {MORE_LABEL[lang]}
          <ArrowRight className='h-3 w-3' />
        </button>
      </div>
    </div>
  );
}
