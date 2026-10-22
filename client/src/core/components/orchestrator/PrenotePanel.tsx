/**
 * The pre-note (Encontro 4's one page) on the coordinator side: what it says,
 * what is still missing, the one optional technical review, and a way to
 * rewrite any section's text. Built by the same function as the printed page
 * (`buildPrenote`), fetched on open.
 *
 * Nothing here is a gate (JVP, 14 Oct): the review is optional and anyone on
 * the coordinator side can stamp it, waive it or take it back; an edit is
 * marked "ajustado pela coordenação" on the page and drops away by itself when
 * the answers it was written over change.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ExternalLink, Loader2, Pencil, X } from 'lucide-react';
import type { Prenote, PrenoteSectionId } from '@shared/e4-prenote';

export function PrenotePanel({ cohortSlug, memberId, reloadKey }: { cohortSlug: string; memberId: string; reloadKey: number }) {
  const { t } = useTranslation();
  const base = `/api/cohort/${cohortSlug}/member/${memberId}`;
  const [note, setNote] = useState<Prenote | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [by, setBy] = useState('');
  const [editing, setEditing] = useState<PrenoteSectionId | null>(null);
  const [draft, setDraft] = useState('');
  // Bumped after a write, so the panel reads back what the page will print.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${base}/prenote`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (!cancelled) setNote(d.prenote ?? null); })
      .catch(() => { if (!cancelled) setNote(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [base, reloadKey, tick]);

  const patch = async (path: string, body: unknown) => {
    setBusy(true); setFailed(false);
    const r = await fetch(`${base}/prenote/${path}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setFailed(true); return null; }
    return r.json();
  };

  const review = async (status: 'revisada' | 'dispensada' | null) => {
    if (await patch('review', { status, by })) setTick(n => n + 1);
  };
  const saveEdit = async (section: PrenoteSectionId, text: string | null) => {
    if (await patch('edit', { section, text, by })) { setEditing(null); setTick(n => n + 1); }
  };

  if (loading && !note) return <div className="flex justify-center py-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (!note) return null;

  const missingCount = note.gaps.length;
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2.5 space-y-2" data-testid="prenote-panel">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{t('cboView.prenote', { defaultValue: 'Proposta inicial de projeto' })}</p>
          <p className="text-[11.5px] text-muted-foreground" data-testid="prenote-summary">
            {note.solution
              ? `${note.title} · ${missingCount
                ? t('cboView.prenoteGaps', { defaultValue: 'faltam {{n}} respostas do Encontro 4', n: missingCount })
                : t('cboView.prenoteComplete', { defaultValue: 'completa' })}`
              : t('cboView.prenoteNoSolution', { defaultValue: 'Ainda sem solução: registre a visita técnica ou espere o Encontro 3' })}
          </p>
        </div>
        <a
          href={`${base}/document/prenota`}
          target="_blank"
          rel="noreferrer"
          data-testid="cbo-doc-prenota"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] hover:bg-muted/50"
        >
          {t('cboView.open', { defaultValue: 'Abrir' })}<ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {note.solution && (
        <>
          {/* The one review stamp. Status only: what is stamped, by whom, when. */}
          <div className="rounded-md bg-muted/40 px-2 py-1.5 space-y-1.5" data-testid="prenote-review">
            <p className="text-[11.5px]">
              <span className="font-semibold">{t('cboView.prenoteReview', { defaultValue: 'Revisão técnica (opcional)' })}: </span>
              <span data-testid="prenote-status">{note.status}</span>
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                value={by}
                onChange={e => setBy(e.target.value)}
                placeholder={t('cboView.prenoteBy', { defaultValue: 'quem revisou' }) as string}
                className="h-7 w-32 rounded-md border border-border bg-background px-2 text-[12px]"
                data-testid="prenote-by"
              />
              {note.review?.status !== 'revisada' && (
                <button type="button" disabled={busy} onClick={() => review('revisada')} data-testid="prenote-mark-reviewed"
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-[11.5px] font-semibold text-white disabled:opacity-40">
                  <Check className="h-3 w-3" />{t('cboView.prenoteMarkReviewed', { defaultValue: 'Marcar como revisada' })}
                </button>
              )}
              {!note.review && (
                <button type="button" disabled={busy} onClick={() => review('dispensada')} data-testid="prenote-waive"
                  className="rounded-md border border-border px-2 py-1 text-[11.5px] disabled:opacity-40">
                  {t('cboView.prenoteWaive', { defaultValue: 'Não precisa revisar' })}
                </button>
              )}
              {note.review && (
                <button type="button" disabled={busy} onClick={() => review(null)} data-testid="prenote-unreview"
                  className="rounded-md border border-border px-2 py-1 text-[11.5px] disabled:opacity-40">
                  {t('cboView.prenoteUndo', { defaultValue: 'Desfazer' })}
                </button>
              )}
            </div>
          </div>

          {/* Each section: what it says, what is missing, and a rewrite. */}
          <div className="space-y-1">
            {note.sections.map(s => (
              <div key={s.id} className="border-t border-border/50 pt-1" data-testid={`prenote-section-${s.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold">
                    {s.title}
                    {s.edited && <span className="ml-1 text-[10.5px] font-normal text-amber-700">{t('cboView.prenoteEdited', { defaultValue: 'ajustado pela coordenação' })}</span>}
                  </span>
                  {editing !== s.id && (
                    <button type="button" onClick={() => { setEditing(s.id); setDraft(s.lines.map(l => l.text).join('\n')); }}
                      className="text-muted-foreground hover:text-foreground" title={t('cboView.prenoteEdit', { defaultValue: 'Editar o texto' }) as string}
                      data-testid={`prenote-edit-${s.id}`}>
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {editing === s.id ? (
                  <div className="space-y-1">
                    <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4}
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12px] leading-snug" data-testid={`prenote-edit-input-${s.id}`} />
                    <div className="flex gap-1.5">
                      <button type="button" disabled={busy} onClick={() => saveEdit(s.id, draft)} data-testid={`prenote-edit-save-${s.id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-0.5 text-[11.5px] font-semibold text-white disabled:opacity-40">
                        <Check className="h-3 w-3" />{t('cboView.technicalNoteSave', { defaultValue: 'Salvar' })}
                      </button>
                      {s.edited && (
                        <button type="button" disabled={busy} onClick={() => saveEdit(s.id, null)}
                          className="rounded-md border border-border px-2 py-0.5 text-[11.5px]">
                          {t('cboView.prenoteRestore', { defaultValue: 'Voltar ao texto calculado' })}
                        </button>
                      )}
                      <button type="button" onClick={() => setEditing(null)} className="rounded-md px-1.5 text-muted-foreground"><X className="h-3 w-3" /></button>
                    </div>
                  </div>
                ) : (
                  <>
                    {s.lines.slice(0, 3).map((l, i) => (
                      <p key={i} className="text-[11.5px] leading-snug text-muted-foreground line-clamp-2">{l.text.replace(/\*\*/g, '')}</p>
                    ))}
                    {s.byCoordination?.length ? (
                      <p className="text-[11px] text-amber-700" data-testid={`prenote-bycoord-${s.id}`}>
                        {t('cboView.prenoteByCoord', { defaultValue: 'Registrado pela coordenação: {{what}}', what: s.byCoordination.join(', ') })}
                      </p>
                    ) : null}
                    {s.missing && <p className="text-[11.5px] text-amber-700" data-testid={`prenote-missing-${s.id}`}>{s.missing}</p>}
                  </>
                )}
              </div>
            ))}
          </div>
          {failed && <p className="text-[11px] text-destructive">{t('cboView.technicalNoteFailed', { defaultValue: 'Não salvou — tenta de novo' })}</p>}
        </>
      )}
    </div>
  );
}
