// The project brief — what a project's shared session opens on.
//
// One block per organisation: its place, its worry, the scenarios it tested in
// Encontro 3 and what it made of each, the coordination's technical reading
// when there is one. Then what they share. Built by shared/project-brief.ts,
// which is also what the printed page renders — so the card and the PDF cannot
// say different things. Every fact is attributed to the organisation it came
// from; nothing here is a decision.

import { FileText, Printer } from 'lucide-react';
import type { ProjectBrief, BriefBlock } from '@shared/project-brief';

const STRINGS = {
  pt: {
    eyebrow: 'Ponto de partida do projeto',
    orgs: (n: number) => `${n} ${n === 1 ? 'organização' : 'organizações'}`,
    place: 'Lugar', worry: 'O que preocupa', tested: 'Testou no Encontro 3',
    untested: 'Ainda não testou soluções no Encontro 3.',
    technical: 'Leitura técnica da coordenação', files: 'Arquivos',
    shared: 'Em comum', groups: 'Agrupamentos', studies: 'Mesmo estudo', instruments: 'Mesmo instrumento', bodies: 'Mesmo órgão', barriers: 'Mesma barreira', gaps: 'Lacunas',
    nothingShared: 'A leitura cruzada ainda não encontrou nada em comum — normal quando as organizações ainda não marcaram lugar ou testaram soluções.',
    print: 'Baixar o resumo (PDF)',
  },
  en: {
    eyebrow: "The project's starting point",
    orgs: (n: number) => `${n} ${n === 1 ? 'organisation' : 'organisations'}`,
    place: 'Place', worry: 'What worries them', tested: 'Tested in Encontro 3',
    untested: 'Has not tested solutions in Encontro 3 yet.',
    technical: "The coordination's technical reading", files: 'Files',
    shared: 'In common', groups: 'Groupings', studies: 'Same study', instruments: 'Same instrument', bodies: 'Same body', barriers: 'Same barrier', gaps: 'Gaps',
    nothingShared: 'The cross-reading has found nothing in common yet — normal when the organisations have not marked a place or tested solutions.',
    print: 'Download the brief (PDF)',
  },
};

function Block({ b, lang }: { b: BriefBlock; lang: 'pt' | 'en' }) {
  const s = STRINGS[lang];
  return (
    <section className='rounded-lg border border-[#e2d9c4] bg-card/70 px-2.5 py-2 dark:border-stone-700' data-testid={`brief-block-${b.memberId}`}>
      <h4 className='m-0 text-[13px] font-bold leading-tight'>
        {b.orgName}
        {b.bairro && <span className='ml-1.5 text-[11px] font-normal text-muted-foreground'>· {b.bairro}</span>}
      </h4>
      <dl className='mt-1 space-y-0.5 text-[12px] leading-snug'>
        {b.siteName && <div><dt className='inline font-semibold'>{s.place}: </dt><dd className='inline'>{b.siteName}</dd></div>}
        {b.worry && <div><dt className='inline font-semibold'>{s.worry}: </dt><dd className='inline'>{b.worry}</dd></div>}
        {b.story && <div className='italic text-muted-foreground'>“{b.story}”</div>}
      </dl>
      <div className='mt-1.5 text-[9.5px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>{s.tested}</div>
      {b.untested ? (
        <p className='m-0 text-[12px] text-muted-foreground'>{s.untested}</p>
      ) : (
        <ul className='m-0 list-disc space-y-0.5 pl-3.5 text-[12px] leading-snug'>
          {b.scenarios.map(sc => (
            <li key={sc.solutionId}>
              <span className='font-semibold'>{sc.label}</span>
              {sc.reaction && <span className='text-muted-foreground'> — {sc.reaction}</span>}
              <span className='block text-muted-foreground'>{sc.verdict}: {sc.unblockedBy}{sc.cost ? ` · ${sc.cost}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
      {b.technicalNote && (
        <div className='mt-1.5 rounded border border-[#e8d5a6] bg-[#fdf9f0] px-2 py-1.5 text-[12px] leading-snug dark:border-stone-600 dark:bg-stone-800' data-testid='brief-technical-note'>
          <span className='block text-[9.5px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>{s.technical}</span>
          {b.technicalNote}
        </div>
      )}
      {b.docNames.length > 0 && (
        <p className='m-0 mt-1 text-[11px] text-muted-foreground'><FileText className='mr-1 inline h-3 w-3' />{b.docNames.join(' · ')}</p>
      )}
    </section>
  );
}

export function CboProjectBrief({ brief, lang }: { brief: ProjectBrief; lang: 'pt' | 'en' }) {
  const s = STRINGS[lang];
  const sh = brief.shared;
  const hasShared = sh.groups.length + sh.pooledStudies.length + sh.pooledInstruments.length + sh.pooledBodies.length + sh.sharedFundingBarriers.length > 0;
  const list = (items: string[]) => <ul className='m-0 list-disc space-y-0.5 pl-3.5'>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  const row = (label: string, items: string[]) => items.length > 0 && (
    <div>
      <div className='text-[9.5px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>{label}</div>
      {list(items)}
    </div>
  );
  return (
    <div
      className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] px-3 py-2.5 space-y-2 dark:border-stone-700 dark:bg-stone-900'
      data-testid='cbo-project-brief'
      data-blocks={brief.blocks.length}
    >
      <div className='text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>
        {s.eyebrow} · {s.orgs(brief.blocks.length)}
      </div>
      <h3 className='m-0 text-[15px] font-bold leading-tight'>{brief.title}</h3>

      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        {brief.blocks.map(b => <Block key={b.memberId} b={b} lang={lang} />)}
      </div>

      <section className='rounded-lg border border-[#c9bd9a] bg-card px-2.5 py-2 text-[12px] leading-snug dark:border-stone-600' data-testid='brief-shared'>
        <h4 className='m-0 mb-1 text-[13px] font-bold'>{s.shared}</h4>
        {!hasShared && <p className='m-0 text-muted-foreground'>{s.nothingShared}</p>}
        <div className='space-y-1.5'>
          {row(s.groups, sh.groups.map(g => `${g.axis} — ${g.key}: ${g.orgNames.join(', ')}`))}
          {row(s.studies, sh.pooledStudies.map(p => `${p.need}: ${p.orgNames.join(', ')}`))}
          {row(s.instruments, sh.pooledInstruments.map(p => `${p.instrument}: ${p.orgNames.join(', ')}`))}
          {row(s.bodies, sh.pooledBodies.map(p => `${p.body}: ${p.orgNames.join(', ')}`))}
          {row(s.barriers, sh.sharedFundingBarriers.map(p => `${p.path}: ${p.orgNames.join(', ')}`))}
          {row(s.gaps, sh.gaps)}
        </div>
      </section>

      <a
        href={`/api/project/${brief.projectId}/brief?lang=${lang}`}
        target='_blank'
        rel='noreferrer'
        data-testid='project-brief-print'
        className='inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b5f3c] underline-offset-2 hover:underline dark:text-stone-300'
      >
        <Printer className='h-3.5 w-3.5' />{s.print}
      </a>
    </div>
  );
}
