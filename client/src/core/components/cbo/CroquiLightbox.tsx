// CroquiLightbox — the large view of a família croqui. When the família has a
// "before" croqui, the lightbox shows the ANTES/DEPOIS pair side by side (the
// transformation is the lesson — D4: before the WORK, not before the rain);
// otherwise a single image. It also carries the Register-2 disclosure caption
// required by docs/photo-curation.md condition 4: a croqui is a schematic
// illustration of a CATEGORY, not a photo of a real place.

import { Dialog, DialogContent } from '@/core/components/ui/dialog';

const STRINGS = {
  pt: {
    disclosure: 'Ilustração esquemática — representa um tipo de intervenção, não um local específico.',
    antes: 'ANTES',
    depois: 'DEPOIS',
  },
  en: {
    disclosure: 'Schematic illustration — it represents a type of intervention, not a specific place.',
    antes: 'BEFORE',
    depois: 'AFTER',
  },
};

export interface CroquiLightboxContent {
  src: string;
  before?: string;
  title?: string;
  antesCaption?: string;
  depoisCaption?: string;
}

function Panel({
  src,
  tag,
  caption,
  single,
}: {
  src: string;
  tag?: string;
  caption?: string;
  single?: boolean;
}) {
  return (
    <figure className='relative m-0 min-w-0 flex-1 space-y-1'>
      <img
        src={src}
        alt={caption ?? ''}
        className={`${single ? 'max-h-[70vh]' : 'max-h-[62vh]'} w-full rounded-md object-contain`}
      />
      {tag && (
        <span className='absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white'>
          {tag}
        </span>
      )}
      {caption && (
        <figcaption className='px-1 text-[11.5px] leading-snug text-muted-foreground'>
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

export function CroquiLightbox({
  content,
  lang,
  onClose,
}: {
  /** What to show; `null` closes the lightbox. */
  content: CroquiLightboxContent | null;
  lang: 'pt' | 'en';
  onClose: () => void;
}) {
  const s = STRINGS[lang];
  return (
    <Dialog open={!!content} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        className='max-w-5xl p-4'
        data-testid='croqui-lightbox'
        aria-label={content?.title}
      >
        {content && (
          <div className='space-y-2'>
            {content.before ? (
              <div className='flex flex-col gap-3 sm:flex-row'>
                <Panel src={content.before} tag={s.antes} caption={content.antesCaption} />
                <Panel src={content.src} tag={s.depois} caption={content.depoisCaption} />
              </div>
            ) : (
              <Panel src={content.src} single />
            )}
            <div className='flex flex-wrap items-baseline justify-between gap-2 border-t border-border px-1 pt-2'>
              {content.title && (
                <span className='text-sm font-semibold tracking-tight'>
                  {content.title}
                </span>
              )}
              <span className='text-[11px] italic text-muted-foreground'>
                {s.disclosure}
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
