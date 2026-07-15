// CroquiLightbox — the large view of a família croqui. Every surface that
// shows a croqui small (strip card, sheet banner, coordinator section) opens
// this on tap. It also carries the Register-2 disclosure caption required by
// docs/photo-curation.md condition 4: a croqui is a schematic illustration of
// a CATEGORY, not a photo of a real place — the lightbox is where that is
// said in the viewer's language.

import { Dialog, DialogContent } from '@/core/components/ui/dialog';

const CAPTION = {
  pt: 'Ilustração esquemática — representa um tipo de intervenção, não um local específico.',
  en: 'Schematic illustration — it represents a type of intervention, not a specific place.',
};

export function CroquiLightbox({
  src,
  title,
  lang,
  onClose,
}: {
  /** Croqui image path; `null` closes the lightbox. */
  src: string | null;
  title?: string;
  lang: 'pt' | 'en';
  onClose: () => void;
}) {
  return (
    <Dialog open={!!src} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        className='max-w-4xl p-3'
        data-testid='croqui-lightbox'
        aria-label={title}
      >
        {src && (
          <figure className='m-0 space-y-2'>
            <img
              src={src}
              alt={title ?? ''}
              className='max-h-[75vh] w-full rounded-md object-contain'
            />
            <figcaption className='flex flex-wrap items-baseline justify-between gap-2 px-1'>
              {title && (
                <span className='text-sm font-semibold tracking-tight'>
                  {title}
                </span>
              )}
              <span className='text-[11px] italic text-muted-foreground'>
                {CAPTION[lang]}
              </span>
            </figcaption>
          </figure>
        )}
      </DialogContent>
    </Dialog>
  );
}
