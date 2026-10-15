// Encontro 4's one page, in the chat — the same object the printed page and
// the coordinator's drawer render (shared/e4-prenote.ts), so the three cannot
// say different things. What is still missing shows in orange: each orange
// line is one of the questions that follow it.

import { Printer } from 'lucide-react';
import type { Prenote } from '@shared/e4-prenote';

const STRINGS = {
  pt: { label: 'Pré-nota de projeto', print: 'Baixar a pré-nota (PDF)', status: 'Situação', missing: 'Falta' },
  en: { label: 'Project pre-note', print: 'Download the pre-note (PDF)', status: 'Status', missing: 'Missing' },
};

export function CboPrenoteCard({ prenote, cboId, lang }: { prenote: Prenote; cboId: string; lang: 'pt' | 'en' }) {
  const s = STRINGS[lang];
  return (
    <div
      className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] px-3 py-2.5 space-y-2 dark:border-stone-700 dark:bg-stone-900'
      data-testid='cbo-prenote'
    >
      <div className='text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>{s.label}</div>
      <h3 className='m-0 text-[15px] font-bold leading-tight'>{prenote.title}</h3>
      <p className='m-0 text-[11.5px] text-muted-foreground'>
        {[prenote.place, prenote.orgName].filter(Boolean).join(' — ')} · {s.status}: {prenote.status}
      </p>
      <div className='space-y-1.5'>
        {prenote.sections.map(sec => (
          <section key={sec.id} className='rounded-lg border border-[#e2d9c4] bg-card/70 px-2.5 py-1.5 text-[12px] leading-snug dark:border-stone-700' data-testid={`prenote-card-${sec.id}`}>
            <h4 className='m-0 mb-0.5 text-[12.5px] font-bold'>{sec.title}</h4>
            {sec.id === 'orcamento' && !sec.edited
              ? prenote.budget.map(b => (
                  <p key={b.label} className='m-0 flex justify-between gap-2'><span>{b.label}</span><span className='font-semibold text-right'>{b.value}</span></p>
                ))
              : sec.lines.map((l, i) =>
                  l.kind === 'quote'
                    ? <blockquote key={i} className='my-0.5 border-l-2 border-[#c9bd9a] pl-2 italic text-muted-foreground'>{l.text}</blockquote>
                    : <p key={i} className='m-0 mb-0.5'>{sec.id === 'indicadores' ? l.text.replace(/\*\*/g, '').split('. Como medir')[0].split('. How to measure')[0] : l.text.replace(/\*\*/g, '')}</p>,
                )}
            {sec.missing && <p className='m-0 mt-0.5 font-medium text-amber-700 dark:text-amber-400' data-testid={`prenote-card-missing-${sec.id}`}>{sec.missing}</p>}
          </section>
        ))}
      </div>
      <a
        href={`/api/cbo/${cboId}/prenote?lang=${lang}`}
        target='_blank'
        rel='noreferrer'
        data-testid='prenote-print'
        className='inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b5f3c] underline-offset-2 hover:underline dark:text-stone-300'
      >
        <Printer className='h-3.5 w-3.5' />{s.print}
      </a>
    </div>
  );
}
