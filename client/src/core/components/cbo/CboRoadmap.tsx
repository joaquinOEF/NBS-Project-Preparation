// The hoja de ruta — what an organisation walks out of Encontro 3 holding.
//
// Everything about this card is designed to read as a DRAFT ROUTE rather than a
// finding handed down. That is not softening; it is accuracy. Every figure on
// it is a design range over a finger-drawn footprint, and a document that
// presents those as settled would be lying in the direction that costs an
// organisation the most — it would send them to a secretariat defending numbers
// they had no way to check.
//
// So three things are structural, not decorative:
//   · every block shows where it came from, so a line can be disagreed with
//     specifically rather than in general;
//   · every block shows what would CHANGE it (↻), because a route you cannot
//     redirect is a verdict wearing a friendlier word;
//   · the open questions are numbered into the route, not filed at the back.
//
// Content and copy: shared/w3-roadmap.ts. Nothing is rendered here that was not
// computed there.

import { ArrowRight, CircleAlert, RefreshCw } from 'lucide-react';
import type { Roadmap, RoadmapBlock } from '@shared/w3-roadmap';

type VerdictState = 'ready' | 'needs_study' | 'needs_permission' | 'needs_site';

const STATE: Record<VerdictState, { pt: string; en: string; cls: string }> = {
  ready: {
    pt: 'pronto pra orçar', en: 'ready to quote',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900',
  },
  needs_study: {
    pt: 'precisa de um estudo', en: 'needs a study',
    cls: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900',
  },
  needs_permission: {
    pt: 'precisa de autorização', en: 'needs permission',
    cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900',
  },
  needs_site: {
    pt: 'falta marcar o lugar', en: 'no place marked yet',
    cls: 'bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-700',
  },
};

const S = {
  pt: {
    eyebrow: 'Rascunho — pra vocês conferirem e ajustarem',
    p1: 'O projeto',
    p2: 'O que ele pede',
    road: 'O caminho daqui',
    open: 'O que ficou em aberto',
    openWhy: 'Isso não é falha de vocês. É o próximo trecho do caminho — e boa parte dele é da coordenação.',
    org: 'vocês',
    coord: 'coordenação',
    openTag: 'em aberto',
    note: 'Nada aqui está fechado. Cada bloco diz de onde veio e o que muda ele.',
  },
  en: {
    eyebrow: 'Draft — for you to check and adjust',
    p1: 'The project',
    p2: 'What it asks for',
    road: 'The road from here',
    open: 'What is still open',
    openWhy: 'This is not a failing on your side. It is the next stretch of the road — and much of it belongs to the coordination.',
    org: 'you',
    coord: 'coordination',
    openTag: 'open',
    note: 'Nothing here is settled. Every block says where it came from and what would change it.',
  },
};

function Block({ b, lang }: { b: RoadmapBlock; lang: 'pt' | 'en' }) {
  const s = S[lang];
  return (
    <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5" data-testid="roadmap-block">
      <div className="mb-1 flex items-center gap-1.5">
        <h4 className="text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">{b.title}</h4>
        {b.open && (
          <span className="rounded-full border border-amber-300/70 bg-amber-50 px-1.5 py-px text-[9.5px] font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            {s.openTag}
          </span>
        )}
      </div>
      {b.lines.map((l, i) => (
        <p key={i} className="mb-1 text-[12.5px] leading-snug last:mb-0">{l}</p>
      ))}
      {b.from && (
        <p className="mt-1.5 text-[10.5px] italic leading-snug text-muted-foreground">← {b.from}</p>
      )}
      {b.changedBy && (
        <p className="mt-1 flex items-start gap-1 text-[10.5px] leading-snug text-muted-foreground">
          <RefreshCw className="mt-[2px] h-2.5 w-2.5 shrink-0" />
          {b.changedBy}
        </p>
      )}
    </div>
  );
}

export function CboRoadmap({ roadmap, lang }: { roadmap: Roadmap; lang: 'pt' | 'en' }) {
  const s = S[lang];
  const st = STATE[(roadmap.state as VerdictState) ?? 'needs_site'];

  return (
    <div
      className="space-y-3 rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] px-3 py-2.5 dark:border-stone-700 dark:bg-stone-900"
      data-testid="cbo-roadmap"
    >
      <div>
        <div className="text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400">
          {s.eyebrow}
        </div>
        <h3 className="mt-1 text-[15px] font-bold leading-tight">
          {roadmap.solutions.join(' + ') || '—'}
        </h3>
        <p className="text-[12px] text-muted-foreground">
          {[roadmap.siteName, roadmap.bairro].filter(Boolean).join(' · ')}
        </p>
        <span className={`mt-1.5 inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${st.cls}`}>
          {st[lang]}
        </span>
      </div>

      <section>
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400">
          {s.p1}
        </div>
        <div className="space-y-1.5">
          {roadmap.what.map((b, i) => <Block key={i} b={b} lang={lang} />)}
        </div>
      </section>

      <section>
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400">
          {s.p2}
        </div>
        <div className="space-y-1.5">
          {roadmap.how.map((b, i) => <Block key={i} b={b} lang={lang} />)}
        </div>
      </section>

      {roadmap.steps.length > 0 && (
        <section data-testid="roadmap-steps">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400">
            {s.road}
          </div>
          <ol className="space-y-1">
            {roadmap.steps.map(step => (
              <li
                key={step.n}
                className="flex gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2"
              >
                <span className="pt-px text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {step.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] leading-snug">{step.title}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[10.5px] text-muted-foreground">
                    <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                    {step.owner === 'org' ? s.org : s.coord}
                    {step.blockedBy && ` · ${step.blockedBy}`}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {roadmap.open.length > 0 && (
        <section data-testid="roadmap-open">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400">
            <CircleAlert className="h-3 w-3" />
            {s.open}
          </div>
          <ul className="list-disc space-y-1 pl-4">
            {roadmap.open.map((g, i) => (
              <li key={i} className="text-[12px] leading-snug text-muted-foreground">{g}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10.5px] italic leading-snug text-muted-foreground">{s.openWhy}</p>
        </section>
      )}

      <p className="border-t border-border/60 pt-2 text-[10.5px] italic leading-snug text-muted-foreground">
        {s.note}
      </p>
    </div>
  );
}
