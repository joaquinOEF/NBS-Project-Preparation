// E3 Beat 1 — the shortlist. W2 ends with famílias; W3 has to end with a
// solution, because a solution is the thing with a price, an approving body, a
// maintenance regime and a failure mode. A família has none of those.
//
// Ordering, never filtering (shared/w3-solutions.ts). Every row carries the
// reason it is where it is, and a row whose site record argues against it says
// so on the card rather than disappearing — an organisation that wants a rain
// garden on a slope gets to choose it and gets told what that will cost them in
// studies. Removing it would be making the decision while claiming to offer one.
//
// Reading a row opens its ficha técnica; ANSWERING is the paired ask_user's job,
// exactly like the família recommendation this follows.

import { useState } from 'react';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import { getSolution, nbsSolutionPhoto } from '@shared/nbs-catalog';
import { NbsSolutionDetail } from './NbsSolutionDetail';
import { Button } from '@/core/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/core/components/ui/sheet';

export interface SolutionOption {
  solutionId: string;
  reason: string;
  caveat?: string;
}

const STRINGS = {
  pt: { eyebrow: 'Soluções pra esse lugar', ficha: 'Ficha técnica', all: 'as 27 do catálogo', choose: 'Escolher esta solução' },
  en: { eyebrow: 'Solutions for this place', ficha: 'Details', all: 'all 27 in the catalogue', choose: 'Choose this solution' },
};

export function CboSolutionOptions({
  items,
  lang,
  full,
  onChoose,
}: {
  items: SolutionOption[];
  lang: 'pt' | 'en';
  /** The "ver todas" view — the eyebrow says so rather than implying a shortlist. */
  full?: boolean;
  /**
   * Answer the pending question with this solution, from inside its ficha.
   *
   * Without it, "ver todas as soluções" is a dead end for most of the
   * catalogue: 27 cards render, but chips can only carry the first handful, so
   * an organisation that opens the 18th and decides yes has no way to say so
   * except by typing its name exactly. Undefined while no question is pending,
   * and the button is simply absent then rather than inert.
   */
  onChoose?: (label: string) => void;
}) {
  const s = STRINGS[lang];
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId ? getSolution(openId) : undefined;

  return (
    <div
      className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] dark:bg-stone-900 dark:border-stone-700 px-3 py-2.5'
      data-testid='cbo-solution-options'
    >
      <div className='text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400 mb-1.5'>
        {s.eyebrow} · {full ? s.all : items.length}
      </div>
      <div className='space-y-1.5'>
        {items.map(item => {
          const sol = getSolution(item.solutionId);
          if (!sol) return null;
          return (
            <button
              key={item.solutionId}
              onClick={() => setOpenId(item.solutionId)}
              data-testid={`solution-option-${item.solutionId}`}
              className='flex w-full items-center gap-2.5 rounded-lg border border-border/60 bg-card px-2 py-2 text-left hover:bg-muted/50'
            >
              <img
                src={nbsSolutionPhoto(sol.id as any)}
                alt=''
                aria-hidden='true'
                loading='lazy'
                className='h-11 w-11 shrink-0 rounded-md object-cover bg-muted'
              />
              <span className='min-w-0 flex-1'>
                <span className='block text-[12.5px] font-semibold leading-tight'>
                  {sol[lang].label}
                </span>
                <span className='block text-[11px] leading-snug text-muted-foreground'>
                  {item.reason}
                </span>
                {item.caveat && (
                  <span className='mt-0.5 flex items-start gap-1 text-[10.5px] leading-snug text-amber-700 dark:text-amber-500'>
                    <TriangleAlert className='mt-[1px] h-3 w-3 shrink-0' />
                    {item.caveat}
                  </span>
                )}
              </span>
              <ArrowRight className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
            </button>
          );
        })}
      </div>

      <Sheet open={!!open} onOpenChange={o => !o && setOpenId(null)}>
        <SheetContent side='bottom' className='h-[88vh] overflow-y-auto p-0'>
          {open && (
            <>
              <SheetHeader className='sr-only'>
                <SheetTitle>{open[lang].label}</SheetTitle>
              </SheetHeader>
              <div className='p-3'>
                <NbsSolutionDetail solution={open} lang={lang} />
                {onChoose && (
                  <div className='sticky bottom-0 -mx-3 mt-3 border-t bg-background px-3 py-2'>
                    <Button
                      className='h-10 w-full text-sm'
                      data-testid={`solution-choose-${open.id}`}
                      onClick={() => {
                        const label = open[lang].label;
                        setOpenId(null);
                        onChoose(label);
                      }}
                    >
                      {s.choose}
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
