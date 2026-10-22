// ---------------------------------------------------------------------------
// The roster card, as a journey (refine 2026-10-17, decisions C1–C3, R1).
//
// A card answers, in this order: who and where · where they are in the six
// encontros · what is blocking and WHO acts (one coloured "Próximo passo") ·
// what they tested and how it landed · a quiet line of signals. Everything
// that used to be a pill and is not one of those lives in the drawer.
//
// `nextStepOf` is the one rule for "who has to act" — the card's box and the
// roster's grouping both read it, so they cannot disagree.
// ---------------------------------------------------------------------------
import { useTranslation } from 'react-i18next';
import { Droplets, Sun, Mountain, Sprout, MapPin, Paperclip, Eye, FlaskConical, EyeOff, Check, X, HelpCircle } from 'lucide-react';
import { Card, CardContent } from '@/core/components/ui/card';
import { getSolution } from '@shared/nbs-catalog';

export interface JourneyCardData {
  id: string;
  name: string;
  neighborhood: string;
  hasPlace: boolean;
  /** The session's phase (1–6). */
  phase: number;
  worry: string | null;
  worryCount: number;
  worryLabel: string | null;
  documentCount: number;
  /** COUGAR's maturity, 0 when not scored yet — then not shown at all. */
  maturityScore: number;
  maturityTotal: number;
  excludeFromPortfolio: boolean;
  simulated: number[] | null;
  w3: {
    state: 'ready' | 'needs_study' | 'needs_permission' | 'needs_site' | null;
    unblockedBy: string | null;
    gapCount: number;
    visit: { solutionId: string; summary: string } | null;
    tests?: Array<{ id: string; reaction: string | null }>;
    closed?: { e2: boolean; e3: boolean; e4: boolean };
  };
}

export type Actor = 'coordination' | 'organisation' | 'ready' | 'early';
export interface NextStep {
  actor: Actor;
  /** Who, in the coordinator's words — the box's small heading. */
  who: 'org' | 'coord' | 'visit' | 'none';
  text: { pt: string; en: string };
  tone: 'amber' | 'sky' | 'stone' | 'emerald';
  /** The step that opens the drawer on the visit tab. */
  isVisit?: boolean;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The one rule: the next thing that has to happen for this organisation, and who does it. */
export function nextStepOf(p: Pick<JourneyCardData, 'phase' | 'w3'>): NextStep {
  const raw = p.w3.closed ?? { e2: false, e3: false, e4: false };
  // The furthest encontro closed decides — Ksa Rosa never closed Encontro 2
  // (no site marked) yet finished 3 and 4; sending it back to "Terminar o
  // Encontro 2" hid what it actually needs: a place, even an approximate one.
  const c = { e4: raw.e4, e3: raw.e3 || raw.e4, e2: raw.e2 || raw.e3 || raw.e4 };
  if (!c.e2) {
    const n = Math.max(1, Math.min(2, p.phase));
    return n === 1
      ? { actor: 'early', who: 'org', tone: 'stone', text: { pt: 'Terminar o Encontro 1', en: 'Finish Encontro 1' } }
      : { actor: 'early', who: 'org', tone: 'stone', text: { pt: 'Terminar o Encontro 2 — marcar o lugar', en: 'Finish Encontro 2 — mark the place' } };
  }
  if (!c.e3) return { actor: 'organisation', who: 'org', tone: 'stone', text: { pt: 'Terminar o Encontro 3 — testar as soluções', en: 'Finish Encontro 3 — test the solutions' } };
  if (!p.w3.visit && !c.e4) return { actor: 'coordination', who: 'visit', tone: 'amber', isVisit: true, text: { pt: 'Registrar a visita técnica', en: 'Record the technical visit' } };
  if (!c.e4) return { actor: 'organisation', who: 'org', tone: 'stone', text: { pt: 'Fazer o Encontro 4 — a proposta inicial', en: 'Do Encontro 4 — the initial proposal' } };
  const st = p.w3.state;
  if (st === 'needs_site') return { actor: 'organisation', who: 'org', tone: 'stone', text: { pt: cap(p.w3.unblockedBy ?? 'marcar o lugar'), en: cap(p.w3.unblockedBy ?? 'mark the place') } };
  if (st === 'needs_permission' || st === 'needs_study') {
    const what = cap(p.w3.unblockedBy ?? (st === 'needs_study' ? 'um estudo técnico' : 'uma autorização'));
    return { actor: 'coordination', who: 'coord', tone: st === 'needs_study' ? 'sky' : 'amber', text: { pt: what, en: what } };
  }
  return { actor: 'ready', who: 'none', tone: 'emerald', text: { pt: 'Pronta para o pré-portfólio', en: 'Ready for the pre-portfolio' } };
}

const TONE: Record<NextStep['tone'], string> = {
  amber: 'border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  sky: 'border-sky-300/70 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
  stone: 'border-foreground/10 bg-foreground/[0.03] text-foreground/80',
  emerald: 'border-emerald-300/70 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
};

/** What they worried about in Encontro 2, as the card's icon — the only Encontro 1–2 signal kept on the face. */
function worryIcon(worry: string | null): { Icon: typeof Sprout; cls: string } {
  const w = (worry ?? '').toLowerCase();
  if (/alag|flood|inund|agua|chuva|drenag/.test(w)) return { Icon: Droplets, cls: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' };
  if (/calor|heat|sol/.test(w)) return { Icon: Sun, cls: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' };
  if (/desliz|landslide|encost|erosa/.test(w)) return { Icon: Mountain, cls: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' };
  return { Icon: Sprout, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' };
}

const VERDICT_PT: Record<string, string> = {
  needs_site: 'falta o lugar', needs_study: 'precisa de estudo', needs_permission: 'precisa de autorização', ready: 'pronto pra orçar',
};
const VERDICT_EN: Record<string, string> = {
  needs_site: 'needs a site', needs_study: 'needs a study', needs_permission: 'needs permission', ready: 'ready to cost',
};

export function JourneyCard({
  p, selected, onHover, onOpen, onOpenTab, tierControl,
}: {
  p: JourneyCardData;
  selected: boolean;
  onHover: (id: string | null) => void;
  onOpen: () => void;
  onOpenTab: (tab: 'arquivos' | 'perfil' | 'visita') => void;
  /** The coordinator's tier override, when one is set — kept, quietly. */
  tierControl?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const pt = !i18n.language?.startsWith('en');
  const next = nextStepOf(p);
  const { Icon, cls } = worryIcon(p.worry);
  const c = p.w3.closed ?? { e2: false, e3: false, e4: false };
  const doneThrough = c.e4 ? 4 : c.e3 ? 3 : c.e2 ? 2 : p.phase >= 2 ? 1 : 0;
  const current = Math.min(6, doneThrough + 1);
  // Not in the catalogue ("aquecedor-solar"): said as words, never as an id.
  const label = (id: string) => { const s = getSolution(id); return s ? (pt ? s.pt.label : s.en.label) : cap(id.replace(/-/g, ' ')); };
  const tests = p.w3.tests ?? [];
  const whoLabel = {
    org: t('orchestrator.journey.whoOrg', { defaultValue: 'the organisation' }),
    coord: t('orchestrator.journey.whoCoord', { defaultValue: 'coordination' }),
    visit: t('orchestrator.journey.whoVisit', { defaultValue: 'technical team' }),
    none: '',
  }[next.who];

  return (
    <div
      role="button"
      tabIndex={0}
      className="group text-left w-full h-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 rounded-xl"
      onMouseEnter={() => onHover(p.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(p.id)}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      data-testid={`card-orchestrator-project-${p.id}`}
    >
      <Card className={`h-full transition-all duration-200 ${selected ? 'ring-2 ring-emerald-500/40 shadow-lg' : 'group-hover:shadow-md'}`}>
        <CardContent className="flex h-full flex-col gap-3 p-4">
          {/* Who and where */}
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cls}`} title={p.worryLabel ?? undefined}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold tracking-tight">{p.name}</h3>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{p.neighborhood || '—'}</span>
                {p.worryLabel && <span className="truncate" data-testid={`w2-worry-${p.id}`}>· {p.worryLabel}{p.worryCount > 1 ? ` +${p.worryCount - 1}` : ''}</span>}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {p.simulated && p.simulated.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[9.5px] font-medium text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300"
                  title={t('orchestrator.simulation.badgeHint', { defaultValue: 'These encontros were played by a model from this organisation’s record — these are not its own words' }) as string}
                  data-testid={`badge-simulated-${p.id}`}>
                  <FlaskConical className="h-2.5 w-2.5" />{p.simulated.map(n => `E${n}`).join('+')}
                </span>
              )}
              {p.excludeFromPortfolio && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                  title={t('orchestrator.portfolioExclude.tooltip', { defaultValue: 'Keep this organization out of the synergy report (it stays on the board)' }) as string}
                  data-testid={`badge-portfolio-excluded-${p.id}`}>
                  <EyeOff className="h-2.5 w-2.5" />{t('orchestrator.journey.outOfAnalysis', { defaultValue: 'out of analysis' })}
                </span>
              )}
            </div>
          </div>

          {/* Where they are in the six encontros — the calendar's own language */}
          <div className="flex items-center gap-1" data-testid={`journey-dots-${p.id}`} aria-label={t('orchestrator.journey.dotsAria', { defaultValue: 'Encontros done: {{n}} of 6', n: doneThrough }) as string}>
            <span className="mr-1.5 text-[9.5px] uppercase tracking-wider text-muted-foreground">{t('orchestrator.journey.encontros', { defaultValue: 'Encontros' })}</span>
            {[1, 2, 3, 4, 5, 6].map(n => (
              <span key={n} className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold ${
                n <= doneThrough ? 'bg-emerald-600 text-white'
                  : n === current ? 'border-[1.5px] border-emerald-600 text-emerald-700 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground/60'}`}>{n}</span>
            ))}
          </div>

          {/* The next step, and who takes it */}
          <div
            className={`rounded-lg border px-2.5 py-1.5 ${TONE[next.tone]} ${next.isVisit ? 'cursor-pointer hover:brightness-[.98]' : ''}`}
            onClick={next.isVisit ? (e => { e.stopPropagation(); onOpenTab('visita'); }) : undefined}
            role={next.isVisit ? 'button' : undefined}
            data-testid={next.isVisit ? `button-visit-${p.id}` : `journey-next-${p.id}`}
          >
            <div className="text-[9px] font-bold uppercase tracking-wider opacity-75">
              {next.actor === 'ready' ? t('orchestrator.journey.statusReady', { defaultValue: 'Status' }) : t('orchestrator.journey.next', { defaultValue: 'Next step · {{who}}', who: whoLabel })}
            </div>
            <div className="text-[12px] font-semibold leading-snug">{pt ? next.text.pt : next.text.en}</div>
          </div>

          {/* What they tested, and how it landed */}
          {tests.length > 0 && (
            <div className="text-[11.5px] leading-relaxed text-foreground/75" data-testid={`journey-tests-${p.id}`}>
              <span className="font-semibold text-foreground/90">{t('orchestrator.journey.tested', { defaultValue: 'Tested:' })} </span>
              {tests.slice(0, 4).map((x, i, all) => (
                <span key={x.id}>
                  <span className="whitespace-nowrap">{label(x.id)}{' '}
                  {x.reaction === 'faz-sentido' ? <Check className="inline h-3 w-3 text-emerald-600" strokeWidth={3} />
                    : x.reaction === 'nao-e-pra-gente' ? <X className="inline h-3 w-3 text-rose-600" strokeWidth={3} />
                      : <HelpCircle className="inline h-3 w-3 text-amber-600" strokeWidth={2.5} />}
                  {i < all.length - 1 || tests.length > 4 ? ',' : ''}</span>{' '}
                </span>
              ))}
              {tests.length > 4 && <span className="text-muted-foreground"> +{tests.length - 4}</span>}
            </div>
          )}

          {/* A quiet line of signals */}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-foreground/5 pt-2 text-[11px] text-muted-foreground">
            {p.w3.state && (
              <span data-testid={`w3-verdict-${p.id}`}>{pt ? VERDICT_PT[p.w3.state] : VERDICT_EN[p.w3.state]}</span>
            )}
            {p.w3.visit && (
              <button type="button" className="hover:text-foreground" onClick={e => { e.stopPropagation(); onOpenTab('visita'); }} data-testid={`w3-visit-${p.id}`}
                title={t('orchestrator.w3.visitTitle', { defaultValue: 'Indicada na visita técnica: {{what}}', what: p.w3.visit.summary }) as string}>
                {t('orchestrator.w3.visitDone', { defaultValue: 'Visit ✓ {{what}}', what: label(p.w3.visit.solutionId) })}
              </button>
            )}
            {p.w3.gapCount > 0 && (
              <span data-testid={`w3-gaps-${p.id}`} title={t('orchestrator.w3.gapsTitle', { defaultValue: 'Open questions W3 named rather than left blank' }) as string}>
                {t('orchestrator.w3.gaps', { defaultValue: '{{n}} em aberto', n: p.w3.gapCount })}
              </span>
            )}
            {p.maturityScore > 0 && (
              <span title={t('orchestrator.demo.maturityTooltip') as string}>{t('orchestrator.journey.maturity', { defaultValue: 'maturity {{n}}/{{total}}', n: p.maturityScore, total: p.maturityTotal })}</span>
            )}
            {tierControl}
            {p.documentCount > 0 && (
              <button type="button" className="inline-flex items-center gap-0.5 hover:text-foreground" onClick={e => { e.stopPropagation(); onOpenTab('arquivos'); }} data-testid={`button-cbo-files-${p.id}`}>
                <Paperclip className="h-3 w-3" />{p.documentCount}
              </button>
            )}
            {!p.hasPlace && <span>{t('orchestrator.demo.locationPending')}</span>}
            <button type="button" className="ml-auto inline-flex items-center gap-1 font-medium text-foreground/70 hover:text-foreground" onClick={e => { e.stopPropagation(); onOpenTab('perfil'); }}>
              <Eye className="h-3 w-3" />{t('orchestrator.cboView.open', { defaultValue: 'View' })}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
