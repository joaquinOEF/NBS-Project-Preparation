// E3's test card — one solution, four answers.
//
// What it needs · what blocks it · what it does · what it costs, for the one
// solution the organisation just chose to try. Every row is computed in
// shared/w3-solution-test.ts from functions that already existed (the verdict,
// the price band, the expected effect, the ficha, Robson's reading of the
// deck), so the card and the comparison that follows it cannot disagree.
//
// Reading is this card's job; ANSWERING is the paired ask_user's — the reaction
// chips follow in the same turn, exactly like the shortlist before it.

import { Sprout, ShieldAlert, Wallet, Wrench, Droplets, TriangleAlert, FileText } from 'lucide-react';
import type { SolutionTestCard } from '@shared/w3-solution-test';
import { getFamilia, nbsSolutionPhoto } from '@shared/nbs-catalog';
import type { VerdictState } from '@shared/w3-dossier';
import { NOTES_HEADING } from '@shared/w3-document-notes';

const NOTE_TONE: Record<string, string> = {
  'a-favor': 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  contra: 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
  dito: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  condicao: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

const STRINGS = {
  pt: {
    eyebrow: 'Testando',
    needs: 'O que precisa',
    blocks: 'O que trava',
    effect: 'Efeito esperado',
    cost: 'Quanto custa',
    upkeep: 'Quem cuida depois',
    complexity: 'Complexidade',
    estimate: 'Estimativa de projeto, não medição.',
    sizedBy: (m2?: number, units?: number) =>
      m2 ? `Calculado sobre ${m2.toLocaleString('pt-BR')} m²` : units ? `Calculado para ${units} unidade${units === 1 ? '' : 's'}` : null,
  },
  en: {
    eyebrow: 'Testing',
    needs: 'What it needs',
    blocks: 'What blocks it',
    effect: 'Expected effect',
    cost: 'What it costs',
    upkeep: 'Who looks after it',
    complexity: 'Complexity',
    estimate: 'A design estimate, not a measurement.',
    sizedBy: (m2?: number, units?: number) =>
      m2 ? `Computed over ${m2.toLocaleString('en-US')} m²` : units ? `Computed for ${units} unit${units === 1 ? '' : 's'}` : null,
  },
};

export const VERDICT_TONE: Record<VerdictState, { pt: string; en: string; tone: string }> = {
  ready: {
    pt: 'Nada trava',
    en: 'Nothing blocks it',
    tone: 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-900',
  },
  needs_study: {
    pt: 'Precisa de estudo',
    en: 'Needs a study',
    tone: 'bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-900',
  },
  needs_permission: {
    pt: 'Precisa de autorização',
    en: 'Needs permission',
    tone: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-900',
  },
  needs_site: {
    pt: 'Falta o lugar',
    en: 'The place is missing',
    tone: 'bg-stone-100 text-stone-800 border-stone-300 dark:bg-stone-900 dark:text-stone-200 dark:border-stone-700',
  },
};

function Row({ Icon, title, children, testid }: { Icon: typeof Sprout; title: string; children: React.ReactNode; testid: string }) {
  return (
    <section className='space-y-0.5' data-testid={testid}>
      <h4 className='flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>
        <Icon className='h-3 w-3' />
        {title}
      </h4>
      <div className='text-[13px] leading-snug'>{children}</div>
    </section>
  );
}

export function CboSolutionTest({ test, lang }: { test: SolutionTestCard; lang: 'pt' | 'en' }) {
  const s = STRINGS[lang];
  const familia = getFamilia(test.familiaId as any);
  const v = VERDICT_TONE[test.verdict.state];
  const sized = s.sizedBy(test.sizedBy.areaM2, test.sizedBy.units);

  return (
    <div
      className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] dark:bg-stone-900 dark:border-stone-700 overflow-hidden'
      data-testid={`cbo-solution-test-${test.solutionId}`}
    >
      <div className='flex gap-3 p-3'>
        <img
          src={nbsSolutionPhoto(test.solutionId as any)}
          alt=''
          aria-hidden='true'
          loading='lazy'
          className='h-20 w-20 shrink-0 rounded-lg object-cover bg-muted'
        />
        <div className='min-w-0 space-y-0.5'>
          <div className='text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>
            {s.eyebrow} · <span style={{ color: familia?.color }}>{familia?.[lang].label}</span>
          </div>
          <h3 className='m-0 text-[15px] font-bold leading-tight'>{test.label}</h3>
          <p className='m-0 text-[12px] leading-snug text-muted-foreground'>{test.whatItIs}</p>
          <p className='m-0 pt-0.5 text-[11.5px] leading-snug' data-testid='solution-test-complexity'>
            <span className='font-semibold'>{s.complexity}: {test.complexity.level}</span>
            {' — '}{test.complexity.detail}
            {test.supportingMeasure && <><br /><span className='font-semibold'>{test.supportingMeasure.split(' — ')[0]}</span> — {test.supportingMeasure.split(' — ').slice(1).join(' — ')}</>}
          </p>
        </div>
      </div>

      <div className='grid gap-3 border-t border-[#e2d9c4] dark:border-stone-700 bg-card/60 p-3 sm:grid-cols-2'>
        <Row Icon={Wrench} title={s.needs} testid='solution-test-needs'>
          <ul className='m-0 list-disc space-y-0.5 pl-4'>
            {test.needs.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
          {test.caveat && (
            <p className='mt-1 flex items-start gap-1 text-[12px] text-amber-800 dark:text-amber-300'>
              <TriangleAlert className='mt-0.5 h-3 w-3 shrink-0' />{test.caveat}
            </p>
          )}
        </Row>

        <Row Icon={ShieldAlert} title={s.blocks} testid='solution-test-blocks'>
          <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${v.tone}`} data-testid={`solution-test-verdict-${test.verdict.state}`}>
            {v[lang]}
          </span>
          <p className='mt-1 text-[12px] leading-snug text-muted-foreground'>{test.verdict.why}</p>
        </Row>

        <Row Icon={Droplets} title={s.effect} testid='solution-test-effect'>
          {test.effect.headline ? (
            <p className='m-0 font-semibold'>{test.effect.headline}</p>
          ) : null}
          <p className='m-0 text-[12px] leading-snug text-muted-foreground'>{test.effect.claim}</p>
          {test.effect.nota && <p className='m-0 mt-1 text-[11px] italic leading-snug text-muted-foreground'>{test.effect.nota}</p>}
          {test.effect.headline && <p className='m-0 mt-1 text-[10.5px] italic text-muted-foreground'>{s.estimate}</p>}
        </Row>

        <Row Icon={Wallet} title={s.cost} testid='solution-test-cost'>
          {test.cost ? (
            <>
              <p className='m-0'>{test.cost.note}</p>
              <p className='m-0 mt-0.5 text-[10.5px] italic text-muted-foreground'>{test.cost.source}</p>
            </>
          ) : (
            <p className='m-0 text-muted-foreground'>—</p>
          )}
        </Row>
      </div>

      {/* Their own files, beside our reading — quoted, with the file named. The
          rows above are functions and do not move; this is what THEY sent, so a
          card can never silently contradict the visit report they uploaded. */}
      {((test.fromTheirFiles?.length ?? 0) > 0 || (test.placeNoteCount ?? 0) > 0) && (
        <div className='border-t border-[#e2d9c4] dark:border-stone-700 px-3 py-2.5' data-testid='solution-test-their-files'>
          <div className='mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8a7d5c] dark:text-stone-400'>
            <FileText className='h-3.5 w-3.5' />{NOTES_HEADING[lang]}
          </div>
          <ul className='m-0 list-none space-y-2 p-0'>
            {test.fromTheirFiles.map((n, i) => (
              <li key={i} className='text-[12.5px] leading-snug' data-testid={`solution-test-note-${n.stance}`}>
                <span className={`mr-1.5 inline-block rounded-full border px-1.5 py-px text-[10.5px] font-semibold ${NOTE_TONE[n.stance]}`}>{n.stanceLabel}</span>
                {n.text}
                <span className='mt-0.5 block border-l-2 border-[#e2d9c4] pl-2 text-[11.5px] italic text-muted-foreground dark:border-stone-600'>“{n.quote}”</span>
                <span className='block pl-2 text-[10.5px] text-muted-foreground'>{lang === 'pt' ? 'Fonte' : 'Source'}: {n.source}</span>
              </li>
            ))}
          </ul>
          {(test.placeNoteCount ?? 0) > 0 && (
            <p className='m-0 mt-2 text-[11.5px] italic text-muted-foreground' data-testid='solution-test-place-notes'>
              {lang === 'pt'
                ? `+ ${test.placeNoteCount} ${test.placeNoteCount === 1 ? 'condição que vale' : 'condições que valem'} pra qualquer solução nesse lugar (prazo, acesso, recursos…) — estão juntas na comparação.`
                : `+ ${test.placeNoteCount} ${test.placeNoteCount === 1 ? 'condition that holds' : 'conditions that hold'} for any solution at this place (timing, access, resources…) — listed together in the comparison.`}
            </p>
          )}
        </div>
      )}

      <div className='border-t border-[#e2d9c4] dark:border-stone-700 px-3 py-2 text-[12px] leading-snug'>
        <span className='font-semibold text-[#8a7d5c] dark:text-stone-400'>{s.upkeep}: </span>{test.upkeep}
        {sized && <span className='block pt-1 text-[10.5px] italic text-muted-foreground'>{sized}</span>}
      </div>
    </div>
  );
}
