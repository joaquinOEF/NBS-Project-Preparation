// NbsTypeSheet — the "Saber mais" surface. Opens from any card in NbsTypeStrip
// and holds ALL six NBS types, scrolled to the one that was tapped.
//
// Design record: docs/nbs-type-content-model.md
//
// Three interaction rules, each of them load-bearing:
//
//   1. Vertical scroll, not a horizontal carousel. A carousel hides types 2-6
//      behind a gesture; NN/g puts the practical ceiling near five slides and we
//      have six, dots are a weak cue on mobile, and horizontal swipe fights the
//      iOS back-gesture.
//
//   2. The before/after pair is STACKED at full width, never a drag-divider
//      wipe. A wipe shows half of each image at any instant, and a horizontal
//      drag nested inside a vertically-draggable sheet gives two handlers
//      fighting for one finger.
//
//   3. vaul `handleOnly` + `data-vaul-no-drag` on the figures. Without this the
//      sheet dismisses when the user meant to scroll.
//
// This is a scroll region with real headings, NOT an ARIA carousel — screen
// reader users navigate the six types by heading. `lang` arrives as a prop, never
// from i18n.language: see cbo-ux-audit-backlog.md:11 (NbsTypeStrip.tsx:111 could
// render English to a PT cohort in a pre-fetch race).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHandle,
} from '@/core/components/ui/drawer';
import {
  NBS_INTERVENTION_TYPES,
  getLocalizedNbsType,
} from '@shared/cbo-schema';
import type { NbsInterventionTypeId } from '@shared/cbo-schema';
import { getNbsTypeContent, nbsIllustration } from '@shared/nbs-type-content';
import type { NbsCostBand, NbsTypeCopy } from '@shared/nbs-type-content';

const STRINGS = {
  pt: {
    title: 'Tipos de soluções',
    close: 'Fechar',
    handle: 'Arraste para fechar',
    before: 'Antes',
    after: 'Depois',
    afterWork: 'Depois da obra',
    changes: 'O que muda',
    needs: 'O que é preciso',
    cost: 'Custo e prazo',
    failure: 'Quando não funciona',
    notThis: 'Não confunda',
    estimated: 'estimado',
    bands: { baixo: 'baixo', medio: 'médio', alto: 'alto' },
    drawings: {
      cutaway: 'Corte esquemático',
      'before-after': 'Antes e depois',
      surface: 'Vista de superfície',
    },
  },
  en: {
    title: 'Types of solutions',
    close: 'Close',
    handle: 'Drag to close',
    before: 'Before',
    after: 'After',
    afterWork: 'After the work',
    changes: 'What changes',
    needs: 'What it takes',
    cost: 'Cost and time',
    failure: 'When it fails',
    notThis: "Don't confuse",
    estimated: 'estimated',
    bands: { baixo: 'low', medio: 'medium', alto: 'high' },
    drawings: {
      cutaway: 'Section perspective',
      'before-after': 'Before and after',
      surface: 'Surface view',
    },
  },
} as const;

const BAND_CLASS: Record<NbsCostBand, string> = {
  baixo:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  medio: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  alto: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
};

/** Marks a figure we could not source to a Brazilian reference. No unmarked
 *  placeholder ships — see docs/nbs-type-content-model.md, open item 2. */
function EstimatedMark({ label }: { label: string }) {
  return (
    <span className='ml-1 inline-block whitespace-nowrap rounded-[2px] bg-amber-100 px-1 align-middle text-[8px] font-medium uppercase leading-[1.5] tracking-wider text-amber-800 dark:bg-amber-950 dark:text-amber-300'>
      {label}
    </span>
  );
}

function Panel({
  src,
  alt,
  tag,
  caption,
}: {
  src: string;
  alt: string;
  tag: string;
  caption: string;
}) {
  return (
    <figure className='m-0'>
      <div className='relative overflow-hidden rounded-lg border border-border'>
        {/* literal black/white, not bg-foreground/85: the theme colours are full
            `var(--foreground)` values, so Tailwind's opacity modifier cannot apply
            and the chip renders invisible. The croqui is light in both themes. */}
        <span className='absolute left-2 top-2 z-10 rounded-[3px] bg-black/75 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.13em] text-white'>
          {tag}
        </span>
        {/* width/height are load-bearing, not decoration: without them the lazy
            images have zero height at mount, every section's offsetTop collapses,
            and "open at type N" lands the sheet mid-way through type N-1. */}
        <img
          src={src}
          alt={alt}
          width={1200}
          height={896}
          loading='lazy'
          decoding='async'
          className='block h-auto w-full'
        />
      </div>
      <figcaption className='px-0.5 pt-1.5 text-[13px] leading-snug text-foreground'>
        {caption}
      </figcaption>
    </figure>
  );
}

function TypeSection({
  id,
  title,
  kicker,
  copy,
  costBand,
  s,
  index,
}: {
  id: NbsInterventionTypeId;
  title: string;
  kicker: string;
  copy: NbsTypeCopy;
  costBand: NbsCostBand;
  s: (typeof STRINGS)['pt'] | (typeof STRINGS)['en'];
  index: number;
}) {
  return (
    <section
      aria-labelledby={`nbs-type-${id}`}
      data-index={index}
      data-testid={`type-section-${id}`}
      className='border-b-8 border-muted px-4 py-5 last:border-b-0'
    >
      <div className='mx-auto w-full max-w-2xl'>
        <h3
          id={`nbs-type-${id}`}
          className='m-0 text-[17.5px] font-semibold leading-tight tracking-tight'
        >
          {title}
        </h3>
        <p className='mb-2.5 mt-1 text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground'>
          {kicker}
        </p>

        <p className='rounded-r-md border-l-[3px] border-emerald-700 bg-muted px-2.5 py-2 text-[12.5px] leading-relaxed text-foreground'>
          {copy.gloss}
        </p>

        <div className='mt-3.5 flex flex-col gap-1' data-vaul-no-drag>
          <Panel
            src={nbsIllustration(id, 'before')}
            alt={copy.altBefore}
            tag={s.before}
            caption={copy.antesCaption}
          />
          <div className='flex items-center justify-center gap-1.5 py-1.5 text-[9px] uppercase tracking-[0.13em] text-muted-foreground'>
            <svg width='13' height='13' viewBox='0 0 14 14' aria-hidden='true'>
              <path
                d='M7 2v10M3.4 8.4 7 12l3.6-3.6'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.3'
                strokeLinecap='round'
                strokeLinejoin='round'
              />
            </svg>
            <span>{s.afterWork}</span>
          </div>
          <Panel
            src={nbsIllustration(id, 'after')}
            alt={copy.altAfter}
            tag={s.after}
            caption={copy.depoisCaption}
          />
        </div>

        <h4 className='mb-1.5 mt-5 text-[10px] uppercase tracking-[0.13em] text-muted-foreground'>
          {s.changes}
        </h4>
        <ul className='m-0 flex list-none flex-col gap-1.5 p-0'>
          {copy.changes.map(c => (
            <li
              key={c}
              className='relative pl-4 text-[13px] leading-snug text-foreground'
            >
              <span className='absolute left-0 top-[7px] h-[7px] w-[7px] rounded-[2px] bg-emerald-700' />
              {c}
            </li>
          ))}
        </ul>

        <h4 className='mb-1.5 mt-5 text-[10px] uppercase tracking-[0.13em] text-muted-foreground'>
          {s.needs}
        </h4>
        <dl className='m-0 flex flex-col'>
          {copy.requirements.map((r, i) => (
            <div
              key={r.label}
              className={`grid grid-cols-[88px_minmax(0,1fr)] gap-2.5 py-2 ${i > 0 ? 'border-t border-border' : ''}`}
            >
              <dt className='text-[11.5px] font-semibold leading-snug'>
                {r.label}
              </dt>
              {/* overflow-wrap:anywhere — the wetland row carries a long SMAMUS
                  email that otherwise overflows its column and is clipped. */}
              <dd className='m-0 text-[12.5px] leading-snug text-muted-foreground [overflow-wrap:anywhere]'>
                {r.value}
                {r.estimated && <EstimatedMark label={s.estimated} />}
              </dd>
            </div>
          ))}
        </dl>

        <h4 className='mb-1.5 mt-5 text-[10px] uppercase tracking-[0.13em] text-muted-foreground'>
          {s.cost}
        </h4>
        <p className='m-0 text-[13px] leading-relaxed text-foreground'>
          <span
            className={`mr-2 inline-block rounded-[3px] px-1.5 py-0.5 align-[1px] text-[9.5px] font-bold uppercase tracking-wider ${BAND_CLASS[costBand]}`}
          >
            {s.bands[costBand]}
          </span>
          {copy.cost}
          {copy.costEstimated && <EstimatedMark label={s.estimated} />}
        </p>

        <h4 className='mb-1.5 mt-5 text-[10px] uppercase tracking-[0.13em] text-muted-foreground'>
          {s.failure}
        </h4>
        <p className='m-0 rounded-r-md border-l-[3px] border-rose-400 bg-rose-50 px-2.5 py-2 text-[12.5px] leading-relaxed text-foreground dark:bg-rose-950/40'>
          {copy.failure}
        </p>

        <div className='mt-3.5 rounded-md bg-muted px-2.5 py-2'>
          <p className='m-0 mb-1 text-[9px] uppercase tracking-[0.12em] text-muted-foreground'>
            {s.notThis}
          </p>
          <p className='m-0 text-[12.5px] leading-snug text-foreground'>
            {copy.notThis}
          </p>
        </div>

        <p className='mb-0 mt-3 text-[12px] italic leading-snug text-muted-foreground'>
          {copy.example}
        </p>
      </div>
    </section>
  );
}

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
  const s = STRINGS[lang];
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
          {types.map((type, i) => {
            const { copy, costBand, drawing } = getNbsTypeContent(
              type.id,
              lang
            );
            const loc = getLocalizedNbsType(type, lang);
            return (
              <TypeSection
                key={type.id}
                id={type.id}
                index={i}
                title={loc.label}
                kicker={s.drawings[drawing]}
                copy={copy}
                costBand={costBand}
                s={s}
              />
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
