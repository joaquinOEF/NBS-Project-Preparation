// NbsTypeStrip — the inline chat strip that TEACHES the kinds of nature-based
// solutions. First educational beat of E2, pre-posted by the platform on phase
// entry (cboAgent.ts). Read-only: tapping "Saber mais" opens NbsTypeSheet, which
// holds all six types, scrolled to the one that was tapped.
//
// Design record: docs/nbs-type-content-model.md
//
// The card TRIAGES; the sheet TEACHES. So the card carries the croqui, the type
// name, one benefit line and three chips — two hazards and one delivery chip
// naming who can actually build the thing. Cost, time, area and maintenance are
// deliberation attributes and live in the sheet: people filter on one to three
// salient attributes, then consult the rest only after narrowing.
//
// Source of truth for the types: NBS_INTERVENTION_TYPES in shared/cbo-schema.ts.
// Copy + illustrations: shared/nbs-type-content.ts (croquis, not photographs —
// see docs/photo-curation.md on the two registers).
//
// `lang` arrives as a prop. Reading i18n.language here loses a pre-fetch race and
// renders English to a PT cohort — see cbo-ux-audit-backlog.md:11.

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  NBS_INTERVENTION_TYPES,
  getLocalizedNbsType,
} from '@shared/cbo-schema';
import type { NbsInterventionTypeId } from '@shared/cbo-schema';
import {
  NBS_TYPE_CONTENT,
  getNbsTypeContent,
  nbsIllustration,
} from '@shared/nbs-type-content';
import type { NbsDelivery } from '@shared/nbs-type-content';
import { NbsTypeSheet } from './NbsTypeSheet';

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

const DELIVERY_LABELS: Record<'pt' | 'en', Record<NbsDelivery, string>> = {
  pt: {
    mutirao: 'mutirão',
    parceria: 'parceria',
    licenca: 'licença ambiental',
  },
  en: { mutirao: 'mutirão', parceria: 'partnership', licenca: 'env. licence' },
};

// The delivery chip is the honest one: at community scale all six are affordable,
// so what actually gates a project is who has to say yes and who keeps it alive.
const DELIVERY_CLASS: Record<NbsDelivery, string> = {
  mutirao:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  parceria: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  licenca: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

const MORE_LABEL = { pt: 'Saber mais', en: 'Learn more' };

type NbsType = (typeof NBS_INTERVENTION_TYPES)[number];

function NbsTypeCardItem({
  type,
  lang,
  onOpen,
}: {
  type: NbsType;
  lang: 'pt' | 'en';
  onOpen: (id: NbsInterventionTypeId) => void;
}) {
  const loc = getLocalizedNbsType(type, lang);
  const { copy, delivery } = getNbsTypeContent(type.id, lang);
  const visual = TYPE_VISUAL[type.id] ?? {
    gradient: 'biodiversity' as const,
    hazards: [],
  };

  return (
    <div
      className='flex h-full w-[240px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-emerald-500/60 md:w-full'
      data-testid={`type-card-${type.id}`}
    >
      <div
        className='h-[118px] w-full shrink-0 overflow-hidden'
        style={{ background: GRADIENTS[visual.gradient] }}
      >
        <img
          src={nbsIllustration(type.id, 'after')}
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
          onClick={() => onOpen(type.id)}
          className='mt-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950'
          data-testid={`type-expand-${type.id}`}
        >
          {MORE_LABEL[lang]}
          <ArrowRight className='h-3 w-3' />
        </button>
      </div>
    </div>
  );
}

export function NbsTypeStrip({
  typeIds,
  intro,
  lang,
}: {
  typeIds: string[];
  intro?: string;
  lang: 'pt' | 'en';
}) {
  const [openTypeId, setOpenTypeId] = useState<NbsInterventionTypeId | null>(
    null
  );

  const ids = new Set(typeIds);
  const types = NBS_INTERVENTION_TYPES.filter(
    t => ids.has(t.id) && NBS_TYPE_CONTENT[t.id]
  );
  if (types.length === 0) return null;

  return (
    // min-w-0 + max-w-full contain the scroller: without them the strip drags the
    // whole page sideways at 390px (cbo-ux-audit-backlog.md — types-strip overflow).
    <div className='w-full min-w-0 max-w-full space-y-2'>
      {intro && (
        <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
          {intro}
        </p>
      )}

      <div className='-mx-1 flex max-w-full snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-2 md:flex-wrap md:overflow-x-visible md:snap-none'>
        {types.map(type => (
          <div
            key={type.id}
            // scroll-snap-stop: always — an iOS momentum fling otherwise skips
            // several cards past their snap points.
            className='flex snap-start [scroll-snap-stop:always] md:min-w-[220px] md:max-w-[320px] md:flex-1'
          >
            <NbsTypeCardItem type={type} lang={lang} onOpen={setOpenTypeId} />
          </div>
        ))}
      </div>

      <NbsTypeSheet
        typeIds={typeIds}
        openTypeId={openTypeId}
        onClose={() => setOpenTypeId(null)}
        lang={lang}
      />
    </div>
  );
}
