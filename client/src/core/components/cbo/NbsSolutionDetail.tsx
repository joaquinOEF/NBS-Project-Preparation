// NbsSolutionDetail — the per-solution "ficha técnica": deck photo header +
// the five CBO-first sections (O que é · Como funciona · Quanto custa · Quem
// precisa dizer sim · Quem cuida depois) + sources. Headless: fills whatever
// container hosts it (NbsFamiliaSheet inner view, selector panel, desktop
// dialog). Content comes from shared/nbs-solution-fichas.ts; sections whose
// figures are inferred rather than sourced carry a visible "estimado" pill
// (docs/nbs-type-content-model.md: no unmarked placeholder ships).
//
// For variants mapped to one of the six deep-content types, `onOpenTypeContent`
// renders a complementary button into the croqui/knowledge detail — the type
// content COMPLEMENTS the ficha, it no longer substitutes for it (that
// substitution is how "Bacia de retenção" used to open "Parques Alagáveis").

import { ArrowRight } from 'lucide-react';
import type { NbsSolution } from '@shared/nbs-catalog';
import { getFamilia, nbsSolutionPhoto } from '@shared/nbs-catalog';
import { getSolutionFicha } from '@shared/nbs-solution-fichas';
import type { NbsFichaCopy } from '@shared/nbs-solution-fichas';
import type { NbsInterventionTypeId } from '@shared/cbo-schema';
import { NBS_INTERVENTION_TYPES, getLocalizedNbsType } from '@shared/cbo-schema';

const STRINGS = {
  pt: {
    oQueE: 'O que é?',
    comoFunciona: 'Como funciona',
    quantoCusta: 'Quanto custa',
    quemDizSim: 'Quem precisa dizer sim',
    quemCuida: 'Quem cuida depois',
    estimado: 'estimado',
    fontes: 'Fontes',
    fotoCredito: 'Foto: cartas da Rede SCbN de POA',
    verTipo: (label: string) => `Ver croqui e conteúdo técnico: ${label}`,
    semFicha: 'Ficha em preparação — por enquanto, use a descrição acima e converse com a gente no chat.',
  },
  en: {
    oQueE: 'What is it?',
    comoFunciona: 'How it works',
    quantoCusta: 'What it costs',
    quemDizSim: 'Who has to say yes',
    quemCuida: 'Who takes care of it',
    estimado: 'estimated',
    fontes: 'Sources',
    fotoCredito: 'Photo: Rede SCbN de POA card deck',
    verTipo: (label: string) => `See croqui & technical content: ${label}`,
    semFicha: 'Ficha in preparation — for now, use the description above and ask us in the chat.',
  },
};

function Section({
  title,
  body,
  estimado,
  estimadoLabel,
}: {
  title: string;
  body: string;
  estimado?: boolean;
  estimadoLabel: string;
}) {
  return (
    <section className='space-y-1'>
      <h4 className='flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground'>
        {title}
        {estimado && (
          <span className='rounded-[3px] bg-amber-100 px-1 py-px text-[9px] font-semibold lowercase tracking-normal text-amber-800 dark:bg-amber-950 dark:text-amber-300'>
            {estimadoLabel}
          </span>
        )}
      </h4>
      <p className='m-0 text-[13.5px] leading-relaxed'>{body}</p>
    </section>
  );
}

export function NbsSolutionDetail({
  solution,
  lang,
  onOpenTypeContent,
  wide,
}: {
  solution: NbsSolution;
  lang: 'pt' | 'en';
  /** When set and the solution maps to a deep-content type, renders the
   *  complementary "see croqui/technical content" button. */
  onOpenTypeContent?: (id: NbsInterventionTypeId) => void;
  /** Desktop dialog layout: photo + identity on the left, the four ficha
   *  sections on the right (collapses back to one column under md). */
  wide?: boolean;
}) {
  const s = STRINGS[lang];
  const ficha = getSolutionFicha(solution.id);
  const copy: NbsFichaCopy | undefined = ficha?.[lang];
  const familia = getFamilia(solution.familiaId);
  const legacyType = solution.legacyTypeId
    ? NBS_INTERVENTION_TYPES.find(t => t.id === solution.legacyTypeId)
    : undefined;

  const identity = (
    <div className='space-y-4'>
      <div className='overflow-hidden rounded-lg'>
        <div className={`${wide ? 'h-44' : 'h-36'} w-full overflow-hidden bg-muted`}>
          <img
            src={nbsSolutionPhoto(solution.id)}
            alt=''
            aria-hidden='true'
            loading='lazy'
            decoding='async'
            className='h-full w-full object-cover'
          />
        </div>
        <div className='flex items-center justify-between gap-2 bg-muted/50 px-2.5 py-1'>
          <span className='text-[10px] text-muted-foreground'>
            📍 {solution.exampleCity}
          </span>
          <span className='text-[9.5px] text-muted-foreground/70'>
            {s.fotoCredito}
          </span>
        </div>
      </div>

      <div className='space-y-0.5'>
        <p className='m-0 text-[11px] font-semibold uppercase tracking-wide' style={{ color: familia?.color }}>
          {familia?.[lang].label}
        </p>
        <h3 className='m-0 text-base font-bold leading-tight'>
          {solution[lang].label}
        </h3>
      </div>

      <Section title={s.oQueE} body={solution[lang].whatItIs} estimadoLabel={s.estimado} />
    </div>
  );

  const fichaBody = (
    <div className='space-y-4'>
      {copy ? (
        <>
          <Section title={s.comoFunciona} body={copy.comoFunciona} estimadoLabel={s.estimado} />
          <Section
            title={s.quantoCusta}
            body={copy.quantoCusta}
            estimado={ficha?.custoEstimado}
            estimadoLabel={s.estimado}
          />
          <Section
            title={s.quemDizSim}
            body={copy.quemPrecisaDizerSim}
            estimado={ficha?.autorizacaoEstimada}
            estimadoLabel={s.estimado}
          />
          <Section title={s.quemCuida} body={copy.quemCuidaDepois} estimadoLabel={s.estimado} />
        </>
      ) : (
        <p className='m-0 text-[13px] italic text-muted-foreground'>{s.semFicha}</p>
      )}

      {legacyType && onOpenTypeContent && (
        <button
          type='button'
          onClick={() => onOpenTypeContent(legacyType.id)}
          className='inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950'
          data-testid={`solution-type-content-${solution.id}`}
        >
          {s.verTipo(getLocalizedNbsType(legacyType, lang).label)}
          <ArrowRight className='h-3 w-3' />
        </button>
      )}

      {ficha && ficha.sources.length > 0 && (
        <p className='m-0 border-t border-border pt-2 text-[10px] leading-snug text-muted-foreground/80'>
          {s.fontes}: {ficha.sources.join(' · ')}
        </p>
      )}
    </div>
  );

  return (
    <div
      className={
        wide
          ? 'space-y-4 md:grid md:grid-cols-[2fr_3fr] md:gap-6 md:space-y-0'
          : 'space-y-4'
      }
      data-testid={`solution-detail-${solution.id}`}
    >
      {identity}
      {fichaBody}
    </div>
  );
}
