// NbsTypeStrip — the inline chat strip that TEACHES the kinds of nature-based
// solutions. First educational beat of E2, pre-posted by the platform on phase
// entry (cboAgent.ts). Read-only: tapping "Saber mais" opens NbsTypeSheet, which
// holds all six types, scrolled to the one that was tapped.
//
// Design record: docs/nbs-type-content-model.md
//
// The card TRIAGES; the sheet TEACHES. The card leaf (NbsTypeCard) is shared with
// the desktop orchestrator grid; this strip is just the mobile-chat LAYOUT around
// it — a horizontal snap-scroller. Keeping the card headless is what stops the
// two surfaces from drifting.
//
// `lang` arrives as a prop. Reading i18n.language here loses a pre-fetch race and
// renders English to a PT cohort — see cbo-ux-audit-backlog.md:11.

import { useState } from 'react';
import { NBS_INTERVENTION_TYPES } from '@shared/cbo-schema';
import type { NbsInterventionTypeId } from '@shared/cbo-schema';
import { NBS_TYPE_CONTENT } from '@shared/nbs-type-content';
import { NbsTypeCard } from './NbsTypeCard';
import { NbsTypeSheet } from './NbsTypeSheet';

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
            // 240px snap item on mobile; a flex cell on md+. The card fills it.
            // scroll-snap-stop: always — an iOS momentum fling otherwise skips
            // several cards past their snap points.
            className='flex w-[240px] shrink-0 snap-start [scroll-snap-stop:always] md:w-auto md:min-w-[220px] md:max-w-[320px] md:flex-1'
          >
            <NbsTypeCard id={type.id} lang={lang} onOpen={setOpenTypeId} />
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
