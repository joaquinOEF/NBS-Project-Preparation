// The project note — the multi-organisation summary the project encontro ends
// on. Same object the printed page renders (shared/project-plan.ts), so the
// card and the PDF cannot say different things. Written register.

import { Printer } from 'lucide-react';
import type { ProjectNote } from '@shared/project-plan';

const STRINGS = {
  pt: { print: 'Baixar o resumo do projeto (PDF)', source: 'Fonte' },
  en: { print: 'Download the project summary (PDF)', source: 'Source' },
};

export function CboProjectNote({ note, projectId, lang }: { note: ProjectNote; projectId: string; lang: 'pt' | 'en' }) {
  const s = STRINGS[lang];
  return (
    <div
      className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] px-3 py-2.5 space-y-2 dark:border-stone-700 dark:bg-stone-900'
      data-testid='cbo-project-note'
    >
      <div className='text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>{note.docLabel}</div>
      <h3 className='m-0 text-[15px] font-bold leading-tight'>{note.title}</h3>
      <p className='m-0 text-[11.5px] text-muted-foreground'>{note.subtitle}</p>

      <div className='space-y-2'>
        {note.sections.map(sec => (
          <section key={sec.id} className='rounded-lg border border-[#e2d9c4] bg-card/70 px-2.5 py-2 text-[12px] leading-snug dark:border-stone-700' data-testid={`note-section-${sec.id}`}>
            <h4 className='m-0 mb-1 text-[12.5px] font-bold'>{sec.title}</h4>
            {sec.paragraphs.map((p, i) =>
              p.kind === 'quote'
                ? <blockquote key={i} className='my-1 border-l-2 border-[#c9bd9a] pl-2 italic text-muted-foreground'>{p.text.replace(/\*\*/g, '')}</blockquote>
                : p.kind === 'bullet'
                  ? <p key={i} className='m-0 pl-3 -indent-2'>• {p.text.replace(/\*\*/g, '')}</p>
                  : <p key={i} className='m-0 mb-1'>{p.text.replace(/\*\*/g, '')}</p>,
            )}
            <p className='m-0 mt-1 text-[10px] italic text-muted-foreground'>{s.source}: {Array.from(new Set(sec.paragraphs.flatMap(p => p.sources))).join(' · ')}</p>
          </section>
        ))}
      </div>

      <a
        href={`/api/project/${projectId}/note?lang=${lang}`}
        target='_blank'
        rel='noreferrer'
        data-testid='project-note-print'
        className='inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b5f3c] underline-offset-2 hover:underline dark:text-stone-300'
      >
        <Printer className='h-3.5 w-3.5' />{s.print}
      </a>
    </div>
  );
}
