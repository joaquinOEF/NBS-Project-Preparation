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
import { PreportfolioMap, PROJECT_COLORS } from './PreportfolioMap';

type Group = { id: string; title: string; memberIds: string[]; story?: string; learnings?: string; quote?: string; projectId?: string };

/** Names, stories and project links follow the members to the most similar new group. */
export function carryOver(prev: Group[], fresh: Group[]): Group[] {
  const used = new Set<string>();
  return fresh.map(g => {
    let best: Group | null = null, overlap = 0;
    for (const p of prev) {
      if (used.has(p.id) || !(p.title || p.story || p.learnings || p.quote || p.projectId)) continue;
      const n = p.memberIds.filter(id => g.memberIds.includes(id)).length;
      if (n > overlap) { best = p; overlap = n; }
    }
    if (!best) return g;
    used.add(best.id);
    const { title, story, learnings, quote, projectId } = best;
    return { ...g, id: best.id, ...(title ? { title } : {}), ...(story ? { story } : {}), ...(learnings ? { learnings } : {}), ...(quote ? { quote } : {}), ...(projectId ? { projectId } : {}) };
  });
}

const brl = (n: number) => `R$ ${Math.round(n).toLocaleString('pt-BR')}`;
const HORIZON_CLS = {
  agora: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  '2-6-meses': 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  '1-ano': 'border-orange-200 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
} as const;

export function PreportfolioBoard({ cohortSlug, onConfirmed }: { cohortSlug: string; onConfirmed?: () => void }) {
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

  // Plan readings run in the background (~12 s each); while any is pending,
  // look again now and then and take the links as they land. Never the groups.
  const pending = orgs.some(o => o.planLinksPending);
  useEffect(() => {
    if (!pending) return;
    const h = setTimeout(async () => {
      const r = await fetch(`${base}?lang=${lang}`, { credentials: 'include' }).catch(() => null);
      if (r?.ok) setOrgs((await r.json()).orgs ?? []);
    }, 15_000);
    return () => clearTimeout(h);
  }, [pending, orgs, base, lang]);

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

  // Layer 3: once the board has been still for a moment, each column's
  // narrative — from the server's cache by member set, or written then (Opus,
  // ~17 s). Keyed client-side by member set too, so a card moved back shows its
  // text at once. A drag never waits on this.
  type Narrative = { title: string; why: string; synergies: string[]; cautions: string[] };
  const [narratives, setNarratives] = useState<Record<string, Narrative | null | 'loading'>>({});
  const setKey = (ids: string[]) => [...ids].sort().join('|');
  useEffect(() => {
    if (loading) return;
    const h = setTimeout(() => {
      for (const g of groups) {
        const k = setKey(g.memberIds);
        if (narratives[k] !== undefined) continue;
        setNarratives(prev => ({ ...prev, [k]: 'loading' }));
        fetch(`${base}/narrative`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberIds: g.memberIds }) })
          .then(r => (r.ok ? r.json() : null))
          .then(d => setNarratives(prev => ({ ...prev, [k]: d?.narrative ?? null })))
          .catch(() => setNarratives(prev => ({ ...prev, [k]: null })));
      }
    }, 2500);
    return () => clearTimeout(h);
  }, [groups, loading, base]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⚠️ A new suggestion replaces the arrangement. What people WROTE on it — a
  // name, Vila Flores's story, the project a group became — is carried to the
  // new group that shares the most organisations with the old one, never
  // dropped; and if cards were moved by hand, it asks first.
  const handEdited = useRef(false);
  const suggest = useCallback(async (next: PortfolioPrefs) => {
    if (handEdited.current && !window.confirm(t('orchestrator.preportfolio.confirmResuggest', { defaultValue: 'Isso refaz a sugestão e desfaz o que foi movido à mão. Nomes e histórias passam para o grupo mais parecido. Continuar?' }) as string)) return;
    setPrefs(next);
    const r = await fetch(`${base}/suggest`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs: next, lang }),
    }).catch(() => null);
    if (!r?.ok) return;
    const fresh: Group[] = (await r.json()).groups ?? [];
    setGroups(prev => carryOver(prev, fresh));
    handEdited.current = false;
  }, [base, lang, t]);

  const move = (memberId: string, toId: string) => {
    handEdited.current = true;
    setGroups(prev => {
      let next = prev.map(g => ({ ...g, memberIds: g.memberIds.filter(id => id !== memberId) }));
      if (toId === '__new') next = [...next, { id: `g${Date.now()}`, title: '', memberIds: [memberId] }];
      else next = next.map(g => (g.id === toId ? { ...g, memberIds: [...g.memberIds, memberId] } : g));
      return next.filter(g => g.memberIds.length);
    });
  };
  const rename = (id: string, title: string) => setGroups(prev => prev.map(g => (g.id === id ? { ...g, title } : g)));
  const setText = (id: string, k: 'story' | 'learnings' | 'quote', v: string) => setGroups(prev => prev.map(g => (g.id === id ? { ...g, [k]: v } : g)));
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const confirm = async () => {
    setConfirmMsg(null);
    // Save what is on screen first — the autosave may still be waiting.
    const put = await fetch(base, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefs, groups }) }).catch(() => null);
    const r = put?.ok ? await fetch(`${base}/confirm`, { method: 'POST', credentials: 'include' }).catch(() => null) : null;
    if (!r?.ok) { setConfirmMsg(t('orchestrator.preportfolio.confirmFailed', { defaultValue: 'Não confirmou — tenta de novo.' })); return; }
    const d = await r.json();
    first.current = true; // the returned groups carry project ids; not a user move
    setGroups(d.groups ?? groups);
    onConfirmed?.();
    setConfirmMsg(t('orchestrator.preportfolio.confirmed', { defaultValue: '{{c}} projetos criados, {{u}} atualizados. Cada um tem a sua conversa e o seu link na lista abaixo.', c: d.created, u: d.updated }));
  };

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
        <a href={`${base}/print`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] hover:bg-muted/50" data-testid="preportfolio-print">
          {t('orchestrator.preportfolio.print', { defaultValue: 'Pré-portfólio (PDF)' })}
        </a>
        <button type="button" onClick={confirm} className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-[12px] font-semibold text-white" data-testid="preportfolio-confirm">
          {t('orchestrator.preportfolio.confirm', { defaultValue: 'Confirmar arranjo' })}
        </button>
        <button type="button" onClick={() => suggest(prefs)} className="ml-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] hover:bg-muted/50" data-testid="preportfolio-resuggest">
          <Sparkles className="h-3 w-3" />{t('orchestrator.preportfolio.resuggest', { defaultValue: 'Sugerir de novo' })}
        </button>
      </div>

      {confirmMsg && <p className="text-[12.5px] text-emerald-800 dark:text-emerald-300" data-testid="preportfolio-confirm-msg">{confirmMsg}</p>}
      <p className="text-[12.5px]" data-testid="preportfolio-totals">
        {t('orchestrator.preportfolio.totals', {
          defaultValue: '{{n}} projetos · estimativa somada {{range}}',
          n: totals.projects,
          range: totals.high ? `${brl(totals.low)}–${brl(totals.high)}` : '—',
        })}
      </p>

      <PreportfolioMap orgs={orgs} groups={groups} />

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
              <div className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: PROJECT_COLORS[gi % PROJECT_COLORS.length] }}>{gi + 1}</span>
              <input
                value={g.title}
                onChange={e => rename(g.id, e.target.value)}
                placeholder={t('orchestrator.preportfolio.namePlaceholder', { defaultValue: 'Nome do projeto' }) as string}
                className="w-full bg-transparent text-[13.5px] font-semibold outline-none placeholder:text-muted-foreground"
                data-testid={`preportfolio-title-${gi}`}
              />
              </div>
              <p className="text-[11.5px] text-muted-foreground" data-testid={`preportfolio-reason-${gi}`}>{card.reason}</p>
              {(() => {
                const n = narratives[setKey(g.memberIds)];
                if (n === 'loading') return <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{t('orchestrator.preportfolio.writing', { defaultValue: 'escrevendo por que juntas…' })}</p>;
                if (!n) return null;
                return (
                  <div className="space-y-1 rounded-lg bg-muted/40 px-2 py-1.5 text-[11.5px] leading-snug" data-testid={`preportfolio-narrative-${gi}`}>
                    {!g.title && n.title && (
                      <button type="button" onClick={() => rename(g.id, n.title)} className="text-left font-semibold text-emerald-800 hover:underline dark:text-emerald-300" title={t('orchestrator.preportfolio.useTitle', { defaultValue: 'Usar este nome' }) as string} data-testid={`preportfolio-use-title-${gi}`}>
                        {t('orchestrator.preportfolio.suggestedName', { defaultValue: 'Nome sugerido' })}: {n.title}
                      </button>
                    )}
                    <p>{n.why}</p>
                    {n.synergies.length > 0 && <ul className="list-disc pl-4">{n.synergies.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                    {n.cautions.length > 0 && <ul className="list-disc pl-4 text-amber-800 dark:text-amber-300">{n.cautions.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                  </div>
                );
              })()}
              <div className="flex flex-wrap gap-1.5 text-[11px]" data-testid={`preportfolio-card-${gi}`}>
                {card.riskLabels.length > 0 && <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">{card.riskLabels.join(' · ')}</span>}
                <span className="rounded-full border border-border px-2 py-0.5" data-testid={`preportfolio-budget-${gi}`}>{card.budget ? `${brl(card.budget.low)}–${brl(card.budget.high)}` : t('orchestrator.preportfolio.noBudget', { defaultValue: 'sem estimativa' })}</span>
                <span className={`rounded-full border px-2 py-0.5 ${HORIZON_CLS[card.horizon]}`} title={card.slowest ? `${card.slowest.orgName}: ${card.slowest.why.join('; ')}` : ''} data-testid={`preportfolio-horizon-${gi}`}>{card.horizonLabel}</span>
                {card.unpriced.length > 0 && <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground">{t('orchestrator.preportfolio.unpriced', { defaultValue: 'sem valor: {{names}}', names: card.unpriced.join(', ') })}</span>}
                {card.planLinks.length > 0 && (
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
                    title={card.planLinks.map(l => `${l.title} — ${l.orgName}: ${l.connection}`).join('\n')} data-testid={`preportfolio-plans-${gi}`}>
                    {t('orchestrator.preportfolio.plans', { defaultValue: '{{n}} conexões com planos', n: card.planLinks.length })}
                  </span>
                )}
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
              {/* Vila Flores's part of the page: the story the numbers cannot tell. */}
              <details className="rounded-lg border border-dashed border-border/70 px-2 py-1" data-testid={`preportfolio-story-${gi}`}>
                <summary className="cursor-pointer text-[11.5px] font-medium text-muted-foreground">
                  {t('orchestrator.preportfolio.storyTitle', { defaultValue: 'História do projeto (Vila Flores)' })}{g.story ? ' ✓' : ''}
                </summary>
                <div className="space-y-1.5 py-1.5">
                  {([
                    ['story', t('orchestrator.preportfolio.story', { defaultValue: 'A história: como essas organizações chegaram até aqui' }), 3],
                    ['learnings', t('orchestrator.preportfolio.learnings', { defaultValue: 'O que a Rede aprendeu nesse caminho' }), 2],
                    ['quote', t('orchestrator.preportfolio.quote', { defaultValue: 'Uma frase de alguém da comunidade (com o nome)' }), 1],
                  ] as const).map(([k, label, rows]) => (
                    <label key={k} className="block text-[11px] text-muted-foreground">
                      {label}
                      <textarea value={(g as any)[k] ?? ''} rows={rows} onChange={e => setText(g.id, k, e.target.value)}
                        className="mt-0.5 w-full rounded border border-border bg-background px-1.5 py-1 text-[12px] text-foreground" data-testid={`preportfolio-${k}-${gi}`} />
                    </label>
                  ))}
                </div>
              </details>
              {g.projectId && <p className="text-[10.5px] text-emerald-700 dark:text-emerald-400">{t('orchestrator.preportfolio.isProject', { defaultValue: '✓ confirmado como projeto' })}</p>}
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
