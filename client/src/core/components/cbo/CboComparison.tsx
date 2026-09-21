// E3's comparison — the solutions they tested, side by side.
//
// What the encontro hands back now (COUGAR meeting 2026-09-10; Ana
// 2026-09-15: "um comparativo de prós e contras de cada SbN"). One column per
// test; the rows are the test card's rows plus "a favor" / "contra", derived
// with a source each, and the organisation's own reaction, quoted as theirs.
// Built by shared/w3-comparison.ts, which is also what the printed page uses
// — so the chat and the PDF cannot say different things.
//
// On a phone the columns scroll sideways under sticky row labels; the page
// body never scrolls horizontally.

import { Printer } from 'lucide-react';
import type { Comparison, ComparisonColumn, RowId } from '@shared/w3-comparison';
import { VERDICT_TONE } from './CboSolutionTest';

const STRINGS = {
  pt: {
    eyebrow: 'Comparação das soluções testadas',
    print: 'Baixar a comparação (PDF)',
    scenario: 'Este cenário (PDF)',
    sizedBy: (m2: number) => `Custos e efeitos calculados sobre ${m2.toLocaleString('pt-BR')} m²`,
    none: '—',
    technical: 'Leitura técnica da coordenação',
  },
  en: {
    eyebrow: 'Comparison of the solutions tested',
    print: 'Download the comparison (PDF)',
    scenario: 'This scenario (PDF)',
    sizedBy: (m2: number) => `Costs and effects computed over ${m2.toLocaleString('en-US')} m²`,
    none: '—',
    technical: "The coordination's technical reading",
  },
};

function cell(col: ComparisonColumn, row: RowId, lang: 'pt' | 'en'): React.ReactNode {
  const c = col.card;
  switch (row) {
    case 'complexity':
      return <><span className='font-semibold'>{c.complexity.level}</span> — {c.complexity.detail}</>;
    case 'type':
      return c.supportingMeasure ? <span className='text-amber-800 dark:text-amber-300'>{c.supportingMeasure}</span> : (lang === 'pt' ? 'Solução baseada na Natureza' : 'Nature-based Solution');
    case 'needs':
      return <ul className='m-0 list-disc space-y-0.5 pl-3.5'>{c.needs.map((n, i) => <li key={i}>{n}</li>)}</ul>;
    case 'blocks': {
      const v = VERDICT_TONE[c.verdict.state];
      return (
        <>
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${v.tone}`}>{v[lang]}</span>
          <span className='block pt-1 text-muted-foreground'>{c.verdict.unblockedBy}</span>
        </>
      );
    }
    case 'effect':
      return c.effect.headline ? <><span className='font-semibold'>{c.effect.headline}</span><span className='block text-muted-foreground'>{c.effect.claim}</span></> : c.effect.claim;
    case 'cost':
      return c.cost ? c.cost.note : STRINGS[lang].none;
    case 'upkeep':
      return c.upkeep;
    case 'pros':
      return col.pros.length ? <ul className='m-0 list-disc space-y-0.5 pl-3.5'>{col.pros.map((p, i) => <li key={i}>{p.text}</li>)}</ul> : STRINGS[lang].none;
    case 'cons':
      return col.cons.length ? <ul className='m-0 list-disc space-y-0.5 pl-3.5'>{col.cons.map((p, i) => <li key={i}>{p.text}</li>)}</ul> : STRINGS[lang].none;
    case 'criteria':
      return col.criteria?.length ? (
        <ul className='m-0 list-none space-y-0.5 p-0' data-testid={`comparison-criteria-${col.solutionId}`}>
          {col.criteria.map((c, i) => (
            <li key={i}><span className={c.fit === 'bom' ? 'font-semibold text-emerald-700 dark:text-emerald-400' : c.fit === 'fraco' ? 'font-semibold text-rose-700 dark:text-rose-400' : 'font-semibold text-amber-700 dark:text-amber-400'}>{c.mark}</span> <span className='font-medium'>{c.label}</span> — {c.why}</li>
          ))}
        </ul>
      ) : STRINGS[lang].none;
    case 'who':
      return col.who ?? STRINGS[lang].none;
    case 'hardest':
      return col.hardest ?? STRINGS[lang].none;
    case 'reaction':
      return col.reaction ? <span className='font-semibold'>{col.reaction.text}</span> : STRINGS[lang].none;
    case 'detail':
      return col.detail ? <span className='italic'>“{col.detail}”</span> : STRINGS[lang].none;
  }
}

export function CboComparison({ comparison, lang, cboId }: { comparison: Comparison; lang: 'pt' | 'en'; cboId?: string }) {
  const s = STRINGS[lang];
  // The detail row only when somebody answered one; an all-dash row is noise.
  const rows = comparison.rows.filter(r => r.id !== 'detail' || comparison.columns.some(c => c.detail));
  return (
    <div
      className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] dark:bg-stone-900 dark:border-stone-700 px-3 py-2.5 space-y-2'
      data-testid='cbo-comparison'
      data-columns={comparison.columns.length}
    >
      <div className='text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>
        {s.eyebrow} · {comparison.columns.length}
      </div>

      <div className='overflow-x-auto -mx-3 px-3'>
        <table className='w-full min-w-[520px] border-separate border-spacing-0 text-[12px] leading-snug'>
          <thead>
            <tr>
              <th className='sticky left-0 z-10 bg-[#f8f4ea] dark:bg-stone-900 w-[110px] min-w-[110px] p-1.5 text-left align-bottom text-[10px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400' />
              {comparison.columns.map(col => (
                <th key={col.solutionId} className='min-w-[190px] p-1.5 text-left align-bottom' data-testid={`comparison-col-${col.solutionId}`}>
                  <span className='block text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground'>{col.familia}</span>
                  <span className='block text-[13px] font-bold leading-tight'>{col.label}</span>
                  {cboId && (
                    <a
                      href={`/api/cbo/${cboId}/scenario/${col.solutionId}?lang=${lang}`}
                      target='_blank'
                      rel='noreferrer'
                      data-testid={`scenario-print-${col.solutionId}`}
                      className='mt-1 inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#6b5f3c] underline-offset-2 hover:underline dark:text-stone-300'
                    >
                      <Printer className='h-3 w-3' />{s.scenario}
                    </a>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} data-testid={`comparison-row-${r.id}`}>
                <th className='sticky left-0 z-10 bg-[#f8f4ea] dark:bg-stone-900 border-t border-[#e2d9c4] dark:border-stone-700 p-1.5 text-left align-top text-[10px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>
                  {r.label}
                </th>
                {comparison.columns.map(col => (
                  <td key={col.solutionId} className='border-t border-[#e2d9c4] dark:border-stone-700 bg-card/60 p-1.5 align-top'>
                    {cell(col, r.id, lang)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(comparison.placeNotes?.notes.length ?? 0) > 0 && (
        <div className='border-t border-[#e2d9c4] dark:border-stone-700 px-3 py-2.5 text-[12.5px] leading-snug' data-testid='comparison-place-notes'>
          <div className='mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8a7d5c] dark:text-stone-400'>{comparison.placeNotes.heading}</div>
          <ul className='m-0 list-disc space-y-1 pl-4'>
            {comparison.placeNotes.notes.map((n, i) => (
              <li key={i}>{n.text} <span className='text-[10.5px] italic text-muted-foreground'>— {n.source}</span></li>
            ))}
          </ul>
        </div>
      )}
      {comparison.technicalNote && (
        <div className='rounded-lg border border-[#c9bd9a] bg-card px-2.5 py-2 text-[12px] leading-snug' data-testid='comparison-technical-note'>
          <span className='block text-[9.5px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>{s.technical}</span>
          {comparison.technicalNote}
        </div>
      )}

      {comparison.sizedBy.areaM2 && (
        <p className='m-0 text-[10.5px] italic text-muted-foreground'>{s.sizedBy(comparison.sizedBy.areaM2)}</p>
      )}

      {cboId && (
        <a
          href={`/api/cbo/${cboId}/comparison?lang=${lang}`}
          target='_blank'
          rel='noreferrer'
          data-testid='comparison-print'
          className='flex items-center justify-center gap-2 rounded-lg border border-[#c9bd9a] bg-card px-3 py-2.5 text-[12.5px] font-semibold text-[#6b5f3c] hover:bg-muted/50 dark:border-stone-600 dark:text-stone-300'
        >
          <Printer className='h-3.5 w-3.5' />
          {s.print}
        </a>
      )}
    </div>
  );
}
