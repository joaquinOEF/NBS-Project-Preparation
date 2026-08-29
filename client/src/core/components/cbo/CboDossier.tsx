// E3's closing card — the scoped project.
//
// This is what the workshop owes. W2 could close honestly on "we know where you
// want to work"; W3 cannot close on a feeling, so this card carries the four
// things an organisation can actually act on the next morning:
//
//   the verdict     — what, precisely, is blocking this project, in one sentence
//   the four lists  — investigate / contact / gather / document, each with an owner
//   the money       — a range off the ficha's published price, over the area they drew
//   the gaps        — named, not blank
//
// Every line is computed in shared/w3-dossier.ts and shared/w3-sizing.ts with no
// model in the path, which is why each carries its own `source`. A coordinator
// can audit "why does this need a soil infiltration test" back to a sentence in
// a ficha that Robson's review already went over — and the same answers always
// produce the same dossier.
//
// The gaps are shown, deliberately and without apology. An honest "we don't know
// yet" about recurring money is the single most useful thing in the session: it
// is the gap the portfolio carries to the municipality. Hiding it to make the
// card look finished would throw away the one thing the coordination can act on.

import {
  AlertCircle,
  CircleCheck,
  FileText,
  FlaskConical,
  Phone,
  Camera,
  Wallet,
} from 'lucide-react';
import type { Dossier, DossierList, VerdictState } from '@shared/w3-dossier';

const VERDICT: Record<VerdictState, { pt: string; en: string; tone: string }> = {
  ready: {
    pt: 'Pronto para orçar',
    en: 'Ready to quote',
    tone: 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-900',
  },
  needs_study: {
    pt: 'Precisa de um estudo técnico',
    en: 'Needs a technical study',
    tone: 'bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-900',
  },
  needs_permission: {
    pt: 'Precisa de autorização',
    en: 'Needs permission',
    tone: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-900',
  },
  needs_site: {
    pt: 'Falta marcar o lugar',
    en: 'No place marked yet',
    tone: 'bg-stone-100 text-stone-800 border-stone-300 dark:bg-stone-900 dark:text-stone-200 dark:border-stone-700',
  },
};

const LISTS: Record<DossierList, { pt: string; en: string; Icon: typeof FlaskConical }> = {
  investigate: { pt: 'Investigar', en: 'Investigate', Icon: FlaskConical },
  contact: { pt: 'Falar com', en: 'Talk to', Icon: Phone },
  gather: { pt: 'Registrar', en: 'Record', Icon: Camera },
  document: { pt: 'Documentar', en: 'Document', Icon: FileText },
};

const OWNER = {
  pt: { org: 'vocês', coordination: 'coordenação' },
  en: { org: 'you', coordination: 'coordination' },
};

const S = {
  pt: {
    eyebrow: 'O projeto de vocês',
    money: 'Quanto custa',
    gaps: 'O que ainda está em aberto',
    gapsWhy: 'Isso não é falha de vocês — é o que a coordenação leva adiante.',
    estimado: 'valor de referência da ficha, não é orçamento',
    unblock: 'Destrava com',
  },
  en: {
    eyebrow: 'Your project',
    money: 'What it costs',
    gaps: 'What is still open',
    gapsWhy: 'This is not a failing on your side — it is what the coordination takes forward.',
    estimado: "the ficha's reference figure, not a budget",
    unblock: 'Unblocked by',
  },
};

const LIST_ORDER: DossierList[] = ['investigate', 'contact', 'gather', 'document'];

export function CboDossier({ dossier, lang }: { dossier: Dossier; lang: 'pt' | 'en' }) {
  const s = S[lang];
  const owner = OWNER[lang];

  return (
    <div
      className='rounded-xl border border-[#e2d9c4] bg-[#f8f4ea] dark:bg-stone-900 dark:border-stone-700 px-3 py-2.5 space-y-3'
      data-testid='cbo-dossier'
    >
      <div className='text-[9px] font-extrabold uppercase tracking-widest text-[#8a7d5c] dark:text-stone-400'>
        {s.eyebrow}
      </div>

      {/* The verdict, per solution. Two solutions on one site can land in two
          different states — that is exactly why it is not one badge. */}
      <div className='space-y-1.5'>
        {dossier.verdicts.map((v, i) => {
          const meta = VERDICT[v.state];
          return (
            <div
              key={i}
              className={`rounded-lg border px-2.5 py-2 ${meta.tone}`}
              data-testid={`dossier-verdict-${v.state}`}
            >
              <div className='flex items-center gap-1.5 text-[11px] font-bold'>
                {v.state === 'ready' ? (
                  <CircleCheck className='h-3.5 w-3.5' />
                ) : (
                  <AlertCircle className='h-3.5 w-3.5' />
                )}
                {meta[lang]}
                {v.solutionId && (
                  <span className='font-normal opacity-75'>· {v.solutionId.replace(/-/g, ' ')}</span>
                )}
              </div>
              <p className='mt-0.5 text-[11.5px] leading-snug'>{v.why}</p>
              <p className='mt-0.5 text-[10.5px] opacity-80'>
                {s.unblock}: {v.unblockedBy}
              </p>
            </div>
          );
        })}
      </div>

      {/* The money. Always a range, always pointing at a real quote. */}
      {dossier.budget.length > 0 && (
        <div>
          <div className='mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground'>
            <Wallet className='h-3 w-3' /> {s.money}
          </div>
          <div className='space-y-1'>
            {dossier.budget.map(b => (
              <div
                key={b.solutionId}
                className='rounded-lg border border-border/60 bg-card px-2 py-1.5'
                data-testid={`dossier-budget-${b.solutionId}`}
              >
                <p className='text-[11.5px] leading-snug'>
                  {lang === 'pt' ? b.notePt : b.noteEn}
                </p>
                {b.estimado && (
                  <p className='mt-0.5 text-[10px] italic text-muted-foreground'>{s.estimado}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The four lists. Each item names who is proposed to carry it — the
          organisation can always override that, and an emerging organisation
          never gets handed a municipal secretariat to chase alone. */}
      {LIST_ORDER.map(list => {
        const items = dossier.items.filter(i => i.list === list);
        if (items.length === 0) return null;
        const { Icon } = LISTS[list];
        return (
          <div key={list}>
            <div className='mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground'>
              <Icon className='h-3 w-3' /> {LISTS[list][lang]}
            </div>
            <ul className='space-y-1'>
              {items.map((item, i) => (
                <li
                  key={i}
                  className='rounded-lg border border-border/60 bg-card px-2 py-1.5'
                  data-testid={`dossier-item-${list}`}
                >
                  <p className='text-[11.5px] leading-snug'>{item.text}</p>
                  <p className='mt-0.5 text-[10px] text-muted-foreground'>
                    {owner[item.owner]}
                    {item.blockedBy && ` · ${item.blockedBy}`}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {dossier.gaps.length > 0 && (
        <div data-testid='dossier-gaps'>
          <div className='mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground'>
            {s.gaps}
          </div>
          <ul className='list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-muted-foreground'>
            {dossier.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
          <p className='mt-1 text-[10.5px] italic text-muted-foreground'>{s.gapsWhy}</p>
        </div>
      )}
    </div>
  );
}
