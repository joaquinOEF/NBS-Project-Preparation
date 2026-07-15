// NbsFamiliaStrip — the inline chat strip that presents the 5 famílias of the
// Rede SCbN POA solution deck. First educational beat of E2, pre-posted by the
// platform on phase entry (cboAgent.ts maybePostE2Entry). Read-only: tapping
// "Ver opções" opens NbsFamiliaSheet with that família's variants.
//
// Same layout contract as NbsTypeStrip (which it supersedes at E2 entry — the
// type strip still renders old transcripts): headless leaf cards inside a
// horizontal snap-scroller, min-w-0 containment against 390px page drag.
//
// `lang` arrives as a prop — see cbo-ux-audit-backlog.md:11.

import { useState } from 'react';
import type { NbsFamiliaId } from '@shared/nbs-catalog';
import { NBS_FAMILIAS } from '@shared/nbs-catalog';
import { NbsFamiliaCard } from './NbsFamiliaCard';
import { NbsFamiliaSheet } from './NbsFamiliaSheet';

export function NbsFamiliaStrip({
  familiaIds,
  intro,
  lang,
}: {
  /** Which famílias to show; empty/undefined = all five. */
  familiaIds?: string[];
  intro?: string;
  lang: 'pt' | 'en';
}) {
  const [openFamiliaId, setOpenFamiliaId] = useState<NbsFamiliaId | null>(null);

  const ids = new Set(familiaIds && familiaIds.length > 0 ? familiaIds : NBS_FAMILIAS.map(f => f.id));
  const familias = NBS_FAMILIAS.filter(f => ids.has(f.id));
  if (familias.length === 0) return null;

  return (
    <div className='w-full min-w-0 max-w-full space-y-2'>
      {intro && (
        <p className='px-1 text-xs leading-relaxed text-muted-foreground'>
          {intro}
        </p>
      )}

      <div className='-mx-1 flex max-w-full snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-2 md:flex-wrap md:overflow-x-visible md:snap-none'>
        {familias.map(familia => (
          <div
            key={familia.id}
            className='flex w-[240px] shrink-0 snap-start [scroll-snap-stop:always] md:w-auto md:min-w-[220px] md:max-w-[320px] md:flex-1'
          >
            <NbsFamiliaCard
              id={familia.id}
              lang={lang}
              onOpen={setOpenFamiliaId}
            />
          </div>
        ))}
      </div>

      <NbsFamiliaSheet
        openFamiliaId={openFamiliaId}
        onClose={() => setOpenFamiliaId(null)}
        lang={lang}
      />
    </div>
  );
}
