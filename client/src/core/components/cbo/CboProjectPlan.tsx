// The project plan card — what the project's encontro has put together so
// far: the scenarios each organisation brought in, what the group shares
// (a study contracted once, one conversation with a body), and the money at
// project level. Built by shared/project-plan.ts, the same object the note is
// written from. Read in the room; nothing on it is a decision.

import type { ProjectPlan } from '@shared/project-plan';

const STRINGS = {
  pt: {
    eyebrow: 'O projeto até aqui',
    frame: 'O que junta',
    scenarios: 'Cenários',
    none: 'Sem cenário por enquanto',
    untested: 'Ainda não testou soluções no Encontro 3',
    shared: 'O que se compartilha',
    nothingShared: 'A leitura cruzada não achou nada pra compartilhar ainda.',
    money: 'Dinheiro',
    band: (lo: string, hi: string, n: number) => `${lo} a ${hi} · ${n === 1 ? '1 cenário' : `${n} cenários`} com referência`,
    noBand: 'Nenhum cenário com faixa de referência ainda.',
    unpriced: 'Sem faixa',
    gaps: 'Pendências',
  },
  en: {
    eyebrow: 'The project so far',
    frame: 'The frame',
    scenarios: 'Scenarios',
    none: 'No scenario for now',
    untested: 'Has not tested solutions in Encontro 3',
    shared: 'What is shared',
    nothingShared: 'The cross-reading has found nothing to share yet.',
    money: 'Money',
    band: (lo: string, hi: string, n: number) => `${lo} to ${hi} · ${n === 1 ? '1 scenario' : `${n} scenarios`} with a reference`,
    noBand: 'No scenario with a reference band yet.',
    unpriced: 'No band',
    gaps: 'Open items',
  },
};

const money = (n: number, lang: 'pt' | 'en') => `R$ ${Math.round(n).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { maximumFractionDigits: 0 })}`;

export function CboProjectPlan({ plan, lang }: { plan: ProjectPlan; lang: 'pt' | 'en' }) {
  const s = STRINGS[lang];
  const label = (t: string) => <div className='text-[9.5px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>{t}</div>;
  return (
    <div
      className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] px-3 py-2.5 space-y-2.5 dark:border-stone-700 dark:bg-stone-900'
      data-testid='cbo-project-plan'
      data-scenarios={plan.orgs.reduce((a, o) => a + o.scenarios.length, 0)}
    >
      <div className='text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>{s.eyebrow}</div>
      <h3 className='m-0 text-[15px] font-bold leading-tight'>{plan.title}</h3>

      {(plan.frameLabel || plan.choices.whyTogether) && (
        <section data-testid='plan-frame'>
          {label(s.frame)}
          {plan.frameLabel && <p className='m-0 text-[12.5px] font-semibold'>{plan.frameLabel}</p>}
          {plan.choices.whyTogether && <p className='m-0 text-[12px] italic text-muted-foreground'>“{plan.choices.whyTogether}”</p>}
        </section>
      )}

      <section>
        {label(s.scenarios)}
        <div className='grid grid-cols-1 gap-1.5 sm:grid-cols-2'>
          {plan.orgs.map(o => (
            <div key={o.memberId} className='rounded-lg border border-[#e2d9c4] bg-card/70 px-2.5 py-1.5 text-[12px] leading-snug dark:border-stone-700' data-testid={`plan-org-${o.memberId}`}>
              <div className='font-bold'>{o.orgName}{o.bairro && <span className='ml-1 font-normal text-muted-foreground'>· {o.bairro}</span>}</div>
              {o.scenarios.length ? (
                <ul className='m-0 list-disc space-y-0.5 pl-3.5'>
                  {o.scenarios.map(sc => (
                    <li key={sc.solutionId}>
                      <span className='font-semibold'>{sc.label}</span>
                      <span className='block text-muted-foreground'>{sc.verdict}: {sc.unblockedBy}{sc.costNote ? ` · ${sc.costNote}` : ''}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='m-0 text-muted-foreground'>{o.tested.length ? s.none : s.untested}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className='rounded-lg border border-[#c9bd9a] bg-card px-2.5 py-2 text-[12px] leading-snug dark:border-stone-600' data-testid='plan-shared'>
        {label(s.shared)}
        {plan.pooled.length ? (
          <ul className='m-0 list-disc space-y-0.5 pl-3.5'>{plan.pooled.map((p, i) => <li key={i}>{p}</li>)}</ul>
        ) : (
          <p className='m-0 text-muted-foreground'>{s.nothingShared}</p>
        )}
      </section>

      <section data-testid='plan-money'>
        {label(s.money)}
        {plan.totals.lowBrl != null && plan.totals.highBrl != null ? (
          <p className='m-0 text-[12.5px]'><span className='font-semibold'>{s.band(money(plan.totals.lowBrl, lang), money(plan.totals.highBrl, lang), plan.totals.priced)}</span></p>
        ) : (
          <p className='m-0 text-[12px] text-muted-foreground'>{s.noBand}</p>
        )}
        {plan.totals.unpriced.length > 0 && <p className='m-0 text-[11.5px] text-muted-foreground'>{s.unpriced}: {plan.totals.unpriced.join('; ')}</p>}
      </section>

      {plan.gaps.length > 0 && (
        <section>
          {label(s.gaps)}
          <ul className='m-0 list-disc space-y-0.5 pl-3.5 text-[11.5px] text-muted-foreground'>{plan.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
