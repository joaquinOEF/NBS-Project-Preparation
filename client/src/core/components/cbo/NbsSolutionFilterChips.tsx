// NbsSolutionFilterChips — the "o que a gente consegue fazer?" filter over the
// 27-solution catalog (Julia's ask, PxG<>OEF biweekly 2026-07-16): toggle chips
// on the two attributes every solution already carries — delivery (mutirão /
// parceria) and cost band. Same-dimension chips are exclusive; dimensions AND
// together. Headless state: the host owns the SolutionFilter so the same leaf
// serves the mobile família sheet and the desktop catalog grid.
//
// Design record: catalog-filters mockup, alternative A (chips), 2026-07-16.

import type { NbsSolution } from '@shared/nbs-catalog';

export interface SolutionFilter {
  delivery: 'mutirao' | 'parceria' | null;
  lowCost: boolean;
}

export const EMPTY_SOLUTION_FILTER: SolutionFilter = {
  delivery: null,
  lowCost: false,
};

export function isFilterActive(f: SolutionFilter): boolean {
  return f.delivery !== null || f.lowCost;
}

export function filterSolutions(
  solutions: NbsSolution[],
  f: SolutionFilter
): NbsSolution[] {
  return solutions.filter(
    s =>
      (!f.delivery || s.delivery === f.delivery) &&
      (!f.lowCost || s.costBand === 'baixo')
  );
}

const STRINGS = {
  pt: {
    mutirao: '🤝 dá pra fazer em mutirão',
    parceria: 'com parceria',
    lowCost: '💰 custo baixo',
    empty: 'Nenhuma solução com esses filtros — tira um filtro pra ver mais.',
  },
  en: {
    mutirao: '🤝 can be a mutirão',
    parceria: 'with a partner',
    lowCost: '💰 low cost',
    empty: 'No solution matches these filters — remove one to see more.',
  },
};

export function solutionFilterEmptyText(lang: 'pt' | 'en'): string {
  return STRINGS[lang].empty;
}

export function NbsSolutionFilterChips({
  value,
  onChange,
  lang,
}: {
  value: SolutionFilter;
  onChange: (next: SolutionFilter) => void;
  lang: 'pt' | 'en';
}) {
  const s = STRINGS[lang];
  const chip = (
    on: boolean,
    label: string,
    toggle: () => void,
    testid: string
  ) => (
    <button
      type='button'
      onClick={toggle}
      aria-pressed={on}
      data-testid={testid}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        on
          ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-300'
          : 'border-border bg-card text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className='flex flex-wrap items-center gap-1.5'
      data-testid='solution-filter-chips'
    >
      {chip(
        value.delivery === 'mutirao',
        s.mutirao,
        () =>
          onChange({
            ...value,
            delivery: value.delivery === 'mutirao' ? null : 'mutirao',
          }),
        'solution-filter-mutirao'
      )}
      {chip(
        value.lowCost,
        s.lowCost,
        () => onChange({ ...value, lowCost: !value.lowCost }),
        'solution-filter-lowcost'
      )}
      {chip(
        value.delivery === 'parceria',
        s.parceria,
        () =>
          onChange({
            ...value,
            delivery: value.delivery === 'parceria' ? null : 'parceria',
          }),
        'solution-filter-parceria'
      )}
    </div>
  );
}
