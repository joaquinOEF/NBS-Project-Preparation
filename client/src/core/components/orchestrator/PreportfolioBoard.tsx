/**
 * The pre-portfolio board — the coordination arranges the Rede's organisations
 * into collective projects (shared/preportfolio.ts).
 *
 * Opens on a SUGGESTION under the coordination's preferences (geography vs
 * theme, a framing risk, whether a project may have one organisation), with
 * one line on why each group sits together. Cards move by drag on a desktop
 * and by "Mover para" anywhere — a phone has no drag. Every move recomputes
 * the project's card here, instantly (layer 2: members, risks, budget,
 * readiness); nothing on this board waits on a model. The draft saves itself.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { projectCard, HORIZON_LABEL, type PortfolioOrg, type PortfolioPrefs } from '@shared/preportfolio';

type Group = { id: string; title: string; memberIds: string[] };

const brl = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
const HORIZON_CLS = {
  agora: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  '2-6-meses': 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  '1-ano': 'border-orange-200 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
} as const;

export function PreportfolioBoard({ cohortSlug }: { cohortSlug: string }) {
  const { t, i18n } = useTranslation();
  const lang: 'pt' | 'en' = i18n.language?.startsWith('pt') ? 'pt' : 'en';
  const base = `/api/cohort/${cohortSlug}/preportfolio`;
  const [orgs, setOrgs] = useState<PortfolioOrg[]>([]);
  const [prefs, setPrefs] = useState<PortfolioPrefs>({ geoWeight: 0.5, theme: null, allowSingle: false });
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [dragging, setDragging] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${base}?lang=${lang}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (cancelled) return; setOrgs(d.orgs ?? []); setPrefs(d.prefs); setGroups(d.groups ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [base, lang]);

  // The draft saves itself, a beat after the last move.
  useEffect(() => {
    if (loading) return;
    if (first.current) { first.current = false; return; }
    setSaving('saving');
    const h = setTimeout(async () => {
      const r = await fetch(base, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs, groups }),
      }).catch(() => null);
      setSaving(r?.ok ? 'saved' : 'failed');
    }, 700);
    return () => clearTimeout(h);
  }, [groups, prefs, base, loading]);

  const suggest = useCallback(async (next: PortfolioPrefs) => {
    setPrefs(next);
    const r = await fetch(`${base}/suggest`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs: next, lang }),
    }).catch(() => null);
    if (r?.ok) setGroups((await r.json()).groups ?? []);
  }, [base, lang]);

  const move = (memberId: string, toId: string) => {
    setGroups(prev => {
      let next = prev.map(g => ({ ...g, memberIds: g.memberIds.filter(id => id !== memberId) }));
      if (toId === '__new') next = [...next, { id: `g${Date.now()}`, title: '', memberIds: [memberId] }];
      else next = next.map(g => (g.id === toId ? { ...g, memberIds: [...g.memberIds, memberId] } : g));
      return next.filter(g => g.memberIds.length);
    });
  };
  const rename = (id: string, title: string) => setGroups(prev => prev.map(g => (g.id === id ? { ...g, title } : g)));

  const byId = useMemo(() => new Map(orgs.map(o => [o.memberId, o])), [orgs]);
  const totals = useMemo(() => {
    const cards = groups.map(g => projectCard(g.memberIds, orgs, lang));
    const priced = cards.filter(c => c.budget);
    return { projects: groups.length, low: priced.reduce((s, c) => s + c.budget!.low, 0), high: priced.reduce((s, c) => s + c.budget!.high, 0) };
  }, [groups, orgs, lang]);

  if (loading) return <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!orgs.length) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-[13px] text-muted-foreground" data-testid="preportfolio-empty">
        {t('orchestrator.preportfolio.empty', { defaultValue: 'Nenhuma organização com registro ainda — o pré-portfólio aparece quando houver.' })}
      </p>
    );
  }

  const GEO = [
    { w: 1, label: t('orchestrator.preportfolio.geo', { defaultValue: 'Mais território' }) },
    { w: 0.5, label: t('orchestrator.preportfolio.balanced', { defaultValue: 'Equilíbrio' }) },
    { w: 0, label: t('orchestrator.preportfolio.theme', { defaultValue: 'Mais tema' }) },
  ];
  const THEMES: Array<{ id: PortfolioPrefs['theme']; label: string }> = [
    { id: null, label: t('orchestrator.preportfolio.noTheme', { defaultValue: 'Sem tema' }) },
    { id: 'flood', label: t('orchestrator.preportfolio.flood', { defaultValue: 'Água' }) },
    { id: 'heat', label: t('orchestrator.preportfolio.heat', { defaultValue: 'Calor' }) },
    { id: 'landslide', label: t('orchestrator.preportfolio.landslide', { defaultValue: 'Encosta' }) },
  ];
  const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-[12px] ${on ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-border hover:bg-muted/50'}`;

  return (
    <section className="mb-6 space-y-3" data-testid="preportfolio-board">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold">{t('orchestrator.preportfolio.title', { defaultValue: 'Pré-portfólio' })}</h3>
          <p className="max-w-[70ch] text-[12.5px] text-muted-foreground">
            {t('orchestrator.preportfolio.lede', { defaultValue: 'Uma sugestão de projetos coletivos a partir das pré-notas. Mova as organizações entre os projetos; cada cartão se refaz na hora. O rascunho se salva sozinho.' })}
          </p>
        </div>
        <span className="text-[11.5px] text-muted-foreground" data-testid="preportfolio-saving">
          {saving === 'saving' ? t('orchestrator.preportfolio.saving', { defaultValue: 'salvando…' })
            : saving === 'saved' ? t('orchestrator.preportfolio.saved', { defaultValue: 'rascunho salvo' })
            : saving === 'failed' ? t('orchestrator.preportfolio.failed', { defaultValue: 'não salvou — tenta mover de novo' }) : ''}
        </span>
      </div>

      {/* The preference questions. Any change re-suggests the arrangement. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/70 bg-card px-3 py-2" data-testid="preportfolio-prefs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-medium">{t('orchestrator.preportfolio.groupBy', { defaultValue: 'Agrupar por' })}</span>
          {GEO.map(g => (
            <button key={g.w} type="button" className={chip(prefs.geoWeight === g.w)} onClick={() => suggest({ ...prefs, geoWeight: g.w })} data-testid={`pref-geo-${g.w}`}>{g.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-medium">{t('orchestrator.preportfolio.frame', { defaultValue: 'Tema que organiza' })}</span>
          {THEMES.map(th => (
            <button key={String(th.id)} type="button" className={chip(prefs.theme === th.id)} onClick={() => suggest({ ...prefs, theme: th.id })} data-testid={`pref-theme-${th.id ?? 'none'}`}>{th.label}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12px]">
          <input type="checkbox" checked={prefs.allowSingle} onChange={e => suggest({ ...prefs, allowSingle: e.target.checked })} data-testid="pref-single" />
          {t('orchestrator.preportfolio.single', { defaultValue: 'Permitir projeto de uma organização só' })}
        </label>
        <button type="button" onClick={() => suggest(prefs)} className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] hover:bg-muted/50" data-testid="preportfolio-resuggest">
          <Sparkles className="h-3 w-3" />{t('orchestrator.preportfolio.resuggest', { defaultValue: 'Sugerir de novo' })}
        </button>
      </div>

      <p className="text-[12.5px]" data-testid="preportfolio-totals">
        {t('orchestrator.preportfolio.totals', {
          defaultValue: '{{n}} projetos · estimativa somada {{range}}',
          n: totals.projects,
          range: totals.high ? `${brl(totals.low)}–${brl(totals.high)}` : '—',
        })}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g, gi) => {
          const card = projectCard(g.memberIds, orgs, lang);
          return (
            <div
              key={g.id}
              className={`rounded-xl border bg-card p-3 space-y-2 ${dragging ? 'border-dashed border-emerald-400' : 'border-border/70'}`}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) move(id, g.id); setDragging(null); }}
              data-testid={`preportfolio-group-${gi}`}
            >
              <input
                value={g.title}
                onChange={e => rename(g.id, e.target.value)}
                placeholder={t('orchestrator.preportfolio.namePlaceholder', { defaultValue: 'Nome do projeto' }) as string}
                className="w-full bg-transparent text-[13.5px] font-semibold outline-none placeholder:text-muted-foreground"
                data-testid={`preportfolio-title-${gi}`}
              />
              <p className="text-[11.5px] text-muted-foreground" data-testid={`preportfolio-reason-${gi}`}>{card.reason}</p>
              <div className="flex flex-wrap gap-1.5 text-[11px]" data-testid={`preportfolio-card-${gi}`}>
                {card.riskLabels.length > 0 && <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">{card.riskLabels.join(' · ')}</span>}
                <span className="rounded-full border border-border px-2 py-0.5" data-testid={`preportfolio-budget-${gi}`}>{card.budget ? `${brl(card.budget.low)}–${brl(card.budget.high)}` : t('orchestrator.preportfolio.noBudget', { defaultValue: 'sem estimativa' })}</span>
                <span className={`rounded-full border px-2 py-0.5 ${HORIZON_CLS[card.horizon]}`} title={card.slowest ? `${card.slowest.orgName}: ${card.slowest.why.join('; ')}` : ''} data-testid={`preportfolio-horizon-${gi}`}>{card.horizonLabel}</span>
                {card.unpriced.length > 0 && <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground">{t('orchestrator.preportfolio.unpriced', { defaultValue: 'sem valor: {{names}}', names: card.unpriced.join(', ') })}</span>}
                {card.unvisited.length > 0 && <span className="rounded-full border border-dashed border-amber-300 px-2 py-0.5 text-amber-800 dark:text-amber-300">{t('orchestrator.preportfolio.unvisited', { defaultValue: 'sem visita: {{n}}', n: card.unvisited.length })}</span>}
              </div>
              <ul className="space-y-1.5">
                {g.memberIds.map(id => {
                  const o = byId.get(id);
                  if (!o) return null;
                  return (
                    <li
                      key={id}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData('text/plain', id); setDragging(id); }}
                      onDragEnd={() => setDragging(null)}
                      className="cursor-grab rounded-lg border border-border/70 bg-background px-2.5 py-1.5"
                      data-testid={`preportfolio-org-${id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold">{o.orgName}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {[o.solutionLabel ?? t('orchestrator.preportfolio.noSolution', { defaultValue: 'sem solução' }), o.bairro].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${HORIZON_CLS[o.horizon]}`}>{HORIZON_LABEL[o.horizon][lang]}</span>
                      </div>
                      <select
                        value={g.id}
                        onChange={e => move(id, e.target.value)}
                        className="mt-1 w-full rounded border border-border bg-background px-1 py-0.5 text-[11px] text-muted-foreground"
                        aria-label={t('orchestrator.preportfolio.moveTo', { defaultValue: 'Mover para' }) as string}
                        data-testid={`preportfolio-move-${id}`}
                      >
                        {groups.map((h, hi) => (
                          <option key={h.id} value={h.id}>{`${t('orchestrator.preportfolio.moveTo', { defaultValue: 'Mover para' })}: ${h.title || `${t('orchestrator.preportfolio.project', { defaultValue: 'Projeto' })} ${hi + 1}`}`}</option>
                        ))}
                        <option value="__new">{t('orchestrator.preportfolio.newProject', { defaultValue: 'Mover para: um projeto novo' })}</option>
                      </select>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        <div
          className="flex min-h-[90px] items-center justify-center rounded-xl border border-dashed border-border/70 text-[12px] text-muted-foreground"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) move(id, '__new'); setDragging(null); }}
          data-testid="preportfolio-new-drop"
        >
          <Plus className="mr-1 h-3.5 w-3.5" />{t('orchestrator.preportfolio.dropNew', { defaultValue: 'Solte aqui para um projeto novo' })}
        </div>
      </div>
    </section>
  );
}
