// Encontro 4's one page, in the chat — the same object the printed page and
// the coordinator's drawer render (shared/e4-prenote.ts), so the three cannot
// say different things. What is still missing shows in orange: each orange
// line is one of the questions that follow it.

import { Printer } from 'lucide-react';
import type { Prenote } from '@shared/e4-prenote';

/**
 * The page's light markdown, rendered — never shown raw. A quoted answer
 * arrives as "**Onde a organização atua:** “Floresta”"; stripping or printing
 * the asterisks both read wrong on a projector.
 */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return <>{parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i} className='font-semibold not-italic'>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}</>;
}

const STRINGS = {
  pt: { label: 'Proposta inicial de projeto', print: 'Baixar a proposta inicial (PDF)', status: 'Situação', missing: 'Falta' },
  en: { label: 'Initial project proposal', print: 'Download the initial proposal (PDF)', status: 'Status', missing: 'Missing' },
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
      {prenote.photo && (
        <figure className='m-0'>
          <img src={prenote.photo.src} alt='' className='max-h-40 w-full rounded-lg object-cover' onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
          <figcaption className='mt-0.5 text-[10.5px] text-muted-foreground'>{prenote.photo.caption}</figcaption>
        </figure>
      )}
      {prenote.summary.length > 0 && (
        <div className='rounded-lg bg-card/70 px-2.5 py-1.5 text-[12px] leading-snug' data-testid='prenote-card-summary'>
          {prenote.summary.map((x, i) => <p key={i} className='m-0 mb-1'>{x.replace(/\*\*/g, '')}</p>)}
        </div>
      )}
      <div className='space-y-1.5'>
        {prenote.sections.map(sec => (
          <section key={sec.id} className='rounded-lg border border-[#e2d9c4] bg-card/70 px-2.5 py-1.5 text-[12px] leading-snug dark:border-stone-700' data-testid={`prenote-card-${sec.id}`}>
            <h4 className='m-0 mb-0.5 text-[12.5px] font-bold'>{sec.title}</h4>
            {sec.id === 'orcamento' && !sec.edited
              ? prenote.budget.map(b => (
                  <p key={b.label} className='m-0 flex justify-between gap-2'><span>{b.label}</span><span className='font-semibold text-right'>{b.value}</span></p>
                ))
              // ⚠️ Three lines, and each at most three rows: a funding path is a
              // 400-character paragraph, and three of them turned the card into
              // a wall the chat scrolled through. The whole text is in the PDF.
              : sec.lines.slice(0, 3).map((l, i) =>
                  l.kind === 'quote'
                    ? <blockquote key={i} className='my-0.5 border-l-2 border-[#c9bd9a] pl-2 italic text-muted-foreground line-clamp-3' data-testid='prenote-card-line'><Inline text={l.text} /></blockquote>
                    : <p key={i} className='m-0 mb-0.5 line-clamp-3' data-testid='prenote-card-line'><Inline text={sec.id === 'indicadores' ? l.text.split('. Como medir')[0].split('. How to measure')[0] : l.text} /></p>,
                )}
            {sec.id !== 'orcamento' && sec.lines.length > 3 && (
              <p className='m-0 text-[10.5px] italic text-muted-foreground'>{lang === 'pt' ? `+ ${sec.lines.length - 3} no PDF` : `+ ${sec.lines.length - 3} in the PDF`}</p>
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
