// NbsTypeDialog — the desktop "Saber mais" surface for the orchestrator NBS tab.
// Where the mobile CBO chat opens a bottom Drawer that scrolls through all six
// types (NbsTypeSheet), the desktop grid already shows all six, so tapping a card
// opens a centered dialog on the ONE tapped type, with prev/next to move between
// them. The teaching content is the SAME NbsTypeDetailContent leaf both surfaces
// render, so they cannot drift.
//
// The dialog portals to <body>, so it centers over the full viewport even though
// the card that opened it lives inside the fixed-height, overflow-scrolled tab
// panel. Design record: docs/nbs-type-content-model.md

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/core/components/ui/dialog';
import {
  getLocalizedNbsType,
  NBS_INTERVENTION_TYPES,
} from '@shared/cbo-schema';
import type { NbsInterventionTypeId } from '@shared/cbo-schema';
import {
  NBS_DETAIL_STRINGS,
  NbsTypeDetailContent,
  orderedNbsTypeIds,
} from './NbsTypeDetailContent';

export function NbsTypeDialog({
  typeIds,
  openTypeId,
  onOpenTypeId,
  onClose,
  lang,
}: {
  typeIds: string[];
  /** Which type the dialog shows. `null` closes it. */
  openTypeId: NbsInterventionTypeId | null;
  /** Move to another type (prev/next) without closing. */
  onOpenTypeId: (id: NbsInterventionTypeId) => void;
  onClose: () => void;
  lang: 'pt' | 'en';
}) {
  const s = NBS_DETAIL_STRINGS[lang];
  const ordered = orderedNbsTypeIds(typeIds);
  const index = openTypeId ? ordered.indexOf(openTypeId) : -1;
  const isOpen = index >= 0;

  // Reset the scroll to the top whenever the shown type changes.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [openTypeId]);

  const go = (delta: number) => {
    const next = ordered[index + delta];
    if (next) onOpenTypeId(next);
  };

  if (ordered.length === 0) return null;

  const currentId = isOpen ? ordered[index] : ordered[0];
  const type = NBS_INTERVENTION_TYPES.find(t => t.id === currentId)!;
  const label = getLocalizedNbsType(type, lang).label;

  return (
    <Dialog open={isOpen} onOpenChange={next => !next && onClose()}>
      <DialogContent
        // Override the primitive's max-w-lg / p-6: the detail is a wider,
        // internally-scrolled column with its own padding.
        className='flex max-h-[88vh] w-[min(92vw,42rem)] max-w-none flex-col gap-0 overflow-hidden p-0'
        data-testid='nbs-type-dialog'
        aria-describedby={undefined}
      >
        {/* pr-12 leaves room for the primitive's built-in close button (top-4 right-4). */}
        <div className='flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 pr-12'>
          <button
            type='button'
            onClick={() => go(-1)}
            disabled={index <= 0}
            aria-label={s.prev}
            data-testid='nbs-type-dialog-prev'
            className='flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30'
          >
            <ChevronLeft className='h-4 w-4' />
          </button>
          <button
            type='button'
            onClick={() => go(1)}
            disabled={index >= ordered.length - 1}
            aria-label={s.next}
            data-testid='nbs-type-dialog-next'
            className='flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30'
          >
            <ChevronRight className='h-4 w-4' />
          </button>
          <DialogTitle className='ml-1 truncate text-[15px] font-semibold tracking-tight'>
            {label}
          </DialogTitle>
          <span className='ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground'>
            {index + 1} / {ordered.length}
          </span>
        </div>

        <div
          ref={bodyRef}
          className='min-h-0 flex-1 overflow-y-auto overscroll-contain'
        >
          <NbsTypeDetailContent id={currentId} lang={lang} hideTitle />
        </div>
      </DialogContent>
    </Dialog>
  );
}
