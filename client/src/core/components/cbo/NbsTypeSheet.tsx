// NbsTypeSheet — the mobile "Saber mais" surface for the CBO chat. Opens from a
// card in NbsTypeStrip and holds ALL six NBS types, scrolled to the tapped one.
//
// Design record: docs/nbs-type-content-model.md
//
// Three interaction rules, each load-bearing:
//
//   1. Vertical scroll, not a horizontal carousel. A carousel hides types 2-6
//      behind a gesture; NN/g puts the practical ceiling near five slides and we
//      have six, dots are a weak cue on mobile, and horizontal swipe fights the
//      iOS back-gesture.
//
//   2. The before/after pair is STACKED at full width, never a drag-divider wipe.
//
//   3. vaul `handleOnly` + `data-vaul-no-drag` on the figures, or the sheet
//      dismisses when the user meant to scroll.
//
// A scroll region with real headings, NOT an ARIA carousel — screen readers
// navigate the six types by heading. `lang` arrives as a prop (never i18n.language
// read in the component — see cbo-ux-audit-backlog.md).
//
// The per-type teaching content lives in NbsTypeDetailContent, shared with the
// desktop orchestrator dialog (NbsTypeDialog) so the two surfaces cannot drift.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHandle,
} from '@/core/components/ui/drawer';
import { NBS_INTERVENTION_TYPES } from '@shared/cbo-schema';
import type { NbsInterventionTypeId } from '@shared/cbo-schema';
import {
  NBS_DETAIL_STRINGS,
  NbsTypeDetailContent,
} from './NbsTypeDetailContent';

export function NbsTypeSheet({
  typeIds,
  openTypeId,
  onClose,
  lang,
}: {
  typeIds: string[];
  /** Which type to land on. `null` closes the sheet. */
  openTypeId: NbsInterventionTypeId | null;
  onClose: () => void;
  lang: 'pt' | 'en';
}) {
  const s = NBS_DETAIL_STRINGS[lang];
  const bodyRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const types = useMemo(() => {
    const ids = new Set(typeIds);
    return NBS_INTERVENTION_TYPES.filter(t => ids.has(t.id));
  }, [typeIds]);

  const openIndex = openTypeId ? types.findIndex(t => t.id === openTypeId) : -1;
  const isOpen = openIndex >= 0;

  // Land on the tapped type. offsetTop is relative to the nearest positioned
  // ancestor, so normalise against the first section rather than the container.
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      const body = bodyRef.current;
      if (!body) return;
      const sections = body.querySelectorAll<HTMLElement>(
        'section[data-index]'
      );
      const target = sections[openIndex];
      const first = sections[0];
      if (target && first) body.scrollTop = target.offsetTop - first.offsetTop;
      setActive(openIndex);
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, openIndex]);

  // Counter reads "2 / 6" as you scroll. Text, not dots — dots are a weak cue.
  useEffect(() => {
    if (!isOpen) return;
    const body = bodyRef.current;
    if (!body) return;
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.index);
            if (!Number.isNaN(i)) setActive(i);
          }
        });
      },
      { root: body, threshold: 0.55 }
    );
    body
      .querySelectorAll('section[data-index]')
      .forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [isOpen, types.length]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) onClose();
    },
    [onClose]
  );

  if (types.length === 0) return null;

  return (
    <Drawer
      open={isOpen}
      onOpenChange={handleOpenChange}
      handleOnly
      scrollLockTimeout={400}
    >
      <DrawerContent
        hideHandle
        className='h-[96dvh] max-h-[96dvh]'
        data-testid='nbs-type-sheet'
        aria-label={s.title}
      >
        <DrawerHandle
          aria-label={s.handle}
          className='mx-auto mb-1 mt-2.5 h-1 w-10 shrink-0 cursor-grab rounded-full bg-neutral-300 dark:bg-neutral-700'
        />

        <div className='flex shrink-0 items-center gap-2.5 border-b border-border px-4 pb-2.5'>
          <h2 className='m-0 text-[14.5px] font-semibold tracking-tight'>
            {s.title}
          </h2>
          <span className='ml-auto text-[11px] tabular-nums text-muted-foreground'>
            {active + 1} / {types.length}
          </span>
          <button
            type='button'
            onClick={onClose}
            aria-label={s.close}
            data-testid='nbs-type-sheet-close'
            className='flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        <div
          ref={bodyRef}
          className='min-h-0 flex-1 overflow-y-auto overscroll-contain'
        >
          {types.map((type, i) => (
            <NbsTypeDetailContent
              key={type.id}
              id={type.id}
              index={i}
              lang={lang}
            />
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
