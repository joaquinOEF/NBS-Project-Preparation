// The data term, as text — one rendering for the gate, the public page
// (/termo-de-dados) and nothing else. Sized to be read on a phone: 16px body,
// generous leading, one column.

import type { DataTermVersion } from '@shared/data-term';

export function DataTermText({ term, showTitle = true }: { term: DataTermVersion; showTitle?: boolean }) {
  return (
    <article className="text-[16px] leading-[1.65] text-foreground/90" lang="pt-BR" data-testid="data-term-text">
      {showTitle && (
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{term.network}</p>
          <h1 className="mt-1 text-[22px] font-semibold leading-snug text-foreground">{term.title}</h1>
        </header>
      )}
      <p>{term.intro}</p>
      {term.sections.map(s => (
        <section key={s.h} className="mt-6">
          <h2 className="text-[17px] font-semibold leading-snug text-foreground">{s.h}</h2>
          {s.body.map((b, i) => Array.isArray(b)
            ? (
              <ul key={i} className="mt-2 list-disc space-y-1.5 pl-5">
                {b.map(item => <li key={item}>{item}</li>)}
              </ul>
            )
            : <p key={i} className="mt-2">{b}</p>)}
        </section>
      ))}
      <p className="mt-6 text-sm text-muted-foreground">Versão {term.version}, {term.dated}</p>
    </article>
  );
}
