/**
 * Coordinator-side read-only summary of a CBO's profile document as it's built —
 * sections (field: value) + the maturity scorecard (coordinator-only). Compact;
 * snapshot-on-open (re-fetches on `reloadKey`).
 */
import { readableFilename } from '@shared/readable-filename';
import { HEALTH_LABEL, type HealthEntry, type HealthKind } from '@shared/session-health';
import { useEffect, useRef, useState } from 'react';
import { cboFieldLabel, cboDisplayValue } from '@shared/cbo-field-catalog';
import { useTranslation } from 'react-i18next';
import { Loader2, FileText, Check, Paperclip, X } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import type { DocumentMeta } from '@shared/document-schema';
import { CBO_SECTIONS, isInternalCboField, type CboState } from '@shared/cbo-schema';
import { parseVisit, visitOptions, visitSummary, sizedByUnits } from '@shared/e4-visit';
import { parseTests } from '@shared/w3-tests';

type Profile = Pick<CboState, 'phase' | 'sections' | 'maturityScores' | 'totalMaturityScore' | 'gaps'> & { health?: HealthEntry[]; maturityHeld?: string[] };

/**
 * The technical visit, in one place: which solution Vila Flores and Robson
 * recommend, at what size, on what day, and what they saw (`technical_note`,
 * which the comparison and the synergy pass print). Encontro 4 opens on the
 * recommended solution — "Depois da visita, a escolha foi X. É essa?" — and
 * when nothing is recorded the organisation picks for itself and its card says
 * "sem visita". Anyone on the coordinator side can record or change it.
 * Saved through PATCH …/visit into the organisation's own record.
 */
function VisitEditor({ cohortSlug, memberId, fields, onSaved }: { cohortSlug: string; memberId: string; fields: Record<string, { value?: unknown } | undefined>; onSaved?: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('pt') ? 'pt' : 'en';
  const str = (k: string) => String(fields?.[k]?.value ?? '');
  const initial = parseVisit(str('_visit_json'));
  const options = visitOptions(str('solution_tests_json'), lang);
  const [solutionId, setSolutionId] = useState(initial?.solutionId ?? '');
  const [size, setSize] = useState(String(initial?.areaM2 ?? initial?.units ?? ''));
  const [date, setDate] = useState(initial?.date ?? '');
  const [note, setNote] = useState(str('technical_note'));
  const [saved, setSaved] = useState(() => ({ visit: initial, note: str('technical_note') }));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const byUnits = solutionId ? sizedByUnits(solutionId) : false;
  const dirty =
    solutionId !== (saved.visit?.solutionId ?? '') ||
    size !== String(saved.visit?.areaM2 ?? saved.visit?.units ?? '') ||
    date !== (saved.visit?.date ?? '') ||
    note.trim() !== saved.note.trim();
  const reactionMark: Record<string, string> = { 'faz-sentido': '✓', 'ainda-nao-sabemos': '?', 'nao-e-pra-gente': '✗' };

  const save = async () => {
    setBusy(true); setFailed(false);
    const body = solutionId
      ? { solutionId, ...(byUnits ? { units: size } : { areaM2: size }), date, note: note.trim() }
      : { solutionId: null, note: note.trim() };
    const r = await fetch(`/api/cohort/${cohortSlug}/member/${memberId}/visit`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setFailed(true); return; }
    const data = await r.json().catch(() => ({}));
    setSaved({ visit: data.visit ?? null, note: note.trim() });
    onSaved?.();
  };

  return (
    <div className="rounded-lg border border-amber-200/70 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20 px-3 py-2 space-y-2" data-testid="visit-editor">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('cboView.visit', { defaultValue: 'Visita técnica' })}
        </span>
        <span className="text-[11px] text-muted-foreground" data-testid="visit-status">
          {saved.visit
            ? t('cboView.visitRecorded', { defaultValue: 'Registrada: {{what}}', what: visitSummary(saved.visit, lang) })
            : t('cboView.visitNone', { defaultValue: 'Sem visita registrada' })}
        </span>
      </div>
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        {t('cboView.visitHint', { defaultValue: 'A solução indicada abre o Encontro 4 ("É essa?"). Sem ela, a organização escolhe sozinha entre as que testou, e o card marca "sem visita". Pode ser preenchida ou mudada a qualquer momento.' })}
      </p>
      <label className="block text-[11.5px] font-medium" htmlFor={`visit-solution-${memberId}`}>
        {t('cboView.visitSolution', { defaultValue: 'Solução indicada' })}
      </label>
      <select
        id={`visit-solution-${memberId}`}
        value={solutionId}
        onChange={e => {
          // Start from the size they tested it at — the visit usually confirms
          // or corrects it rather than starting over.
          const id = e.target.value;
          const test = parseTests(str('solution_tests_json')).find(x => x.solutionId === id);
          setSolutionId(id);
          setSize(String((sizedByUnits(id) ? test?.units : test?.areaM2) || ''));
        }}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        data-testid="visit-solution"
      >
        <option value="">{t('cboView.visitSolutionNone', { defaultValue: '— ainda não indicada —' })}</option>
        {options.tested.length > 0 && (
          <optgroup label={t('cboView.visitTested', { defaultValue: 'Testadas no Encontro 3' })}>
            {options.tested.map(o => (
              <option key={o.solutionId} value={o.solutionId}>{`${reactionMark[o.reaction ?? ''] ?? '·'} ${o.label}`}</option>
            ))}
          </optgroup>
        )}
        <optgroup label={t('cboView.visitOthers', { defaultValue: 'Outras soluções' })}>
          {options.others.map(o => <option key={o.solutionId} value={o.solutionId}>{o.label}</option>)}
        </optgroup>
      </select>
      {solutionId && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-[11.5px] font-medium" htmlFor={`visit-size-${memberId}`}>
              {byUnits ? t('cboView.visitUnits', { defaultValue: 'Quantidade' }) : t('cboView.visitArea', { defaultValue: 'Área (m²)' })}
            </label>
            <input
              id={`visit-size-${memberId}`}
              inputMode="decimal"
              value={size}
              onChange={e => setSize(e.target.value)}
              placeholder={t('cboView.visitSizeHint', { defaultValue: 'opcional' })}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              data-testid="visit-size"
            />
          </div>
          <div className="flex-1">
            <label className="block text-[11.5px] font-medium" htmlFor={`visit-date-${memberId}`}>
              {t('cboView.visitDate', { defaultValue: 'Data da visita' })}
            </label>
            <input
              id={`visit-date-${memberId}`}
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
              data-testid="visit-date"
            />
          </div>
        </div>
      )}
      <label htmlFor={`technical-note-${memberId}`} className="block text-[11.5px] font-medium">
        {t('cboView.technicalNote', { defaultValue: 'Leitura técnica da coordenação' })}
      </label>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {t('cboView.technicalNoteHint', { defaultValue: 'O que a visita técnica viu no lugar. Aparece na comparação da organização e no relatório de sinergias, com esta atribuição. Opcional.' })}
      </p>
      <textarea
        id={`technical-note-${memberId}`}
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={4}
        maxLength={4000}
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm leading-snug"
        data-testid="technical-note-input"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || busy}
          data-testid="visit-save"
          className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {t('cboView.technicalNoteSave', { defaultValue: 'Salvar' })}
        </button>
        {!dirty && (saved.visit || saved.note) && <span className="text-[11px] text-muted-foreground">{t('cboView.technicalNoteSaved', { defaultValue: 'Salvo' })}</span>}
        {failed && <span className="text-[11px] text-destructive">{t('cboView.technicalNoteFailed', { defaultValue: 'Não salvou — tenta de novo' })}</span>}
      </div>
    </div>
  );
}

/**
 * The technical visit, as a tab of its own: what they tested, and the one
 * place to record what the visit indicated. Opened from the roster card's
 * "Visita técnica" button, so nobody has to dig for it inside the profile.
 */
const VISIT_FILE_ACCEPT = '.pdf,.pptx,.docx,.xlsx,.txt,.md,.csv,.tsv,.json,.png,.jpg,.jpeg,.gif,.webp,.heic,.heif,.mp3,.wav,.m4a,.webm,.ogg,.opus,.aac,.flac,audio/*,image/*';

/**
 * What the visit brought back on paper — the report, a technician's photos, a
 * sketch. Each file is saved the moment it is chosen (no Salvar), into the
 * organisation's locker marked as the coordination's visit, and then READ: the
 * passes that turn files into notes run again, so what is in the report reaches
 * the comparison, the concept note, the pre-note, the synergy report and the
 * pre-portfolio — always named as the coordination's, never the organisation's.
 */
function VisitFiles({ cohortSlug, memberId, onChanged }: { cohortSlug: string; memberId: string; onChanged?: () => void }) {
  const { t } = useTranslation();
  const base = `/api/cohort/${cohortSlug}/member/${memberId}`;
  const [files, setFiles] = useState<DocumentMeta[] | null>(null);
  const [sending, setSending] = useState<string[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const load = () =>
    fetch(`${base}/documents`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => setFiles(((d.documents ?? []) as DocumentMeta[]).filter(x => x.purpose === 'visita_tecnica')))
      .catch(() => setFiles([]));
  useEffect(() => { void load(); }, [base]);

  const send = async (list: FileList | File[]) => {
    setProblem(null);
    for (const f of Array.from(list)) {
      setSending(s => [...s, f.name]);
      const body = new FormData();
      body.append('file', f);
      const r = await fetch(`${base}/visit/files`, { method: 'POST', credentials: 'include', body }).catch(() => null);
      const data = r ? await r.json().catch(() => ({})) : {};
      setSending(s => s.filter(x => x !== f.name));
      if (!r?.ok) { setProblem(data?.reason ?? data?.error ?? t('cboView.visitFileFailed', { defaultValue: 'Não foi possível anexar {{name}}.', name: f.name })); continue; }
      if (data.parsed === false) setProblem(t('cboView.visitFileUnread', { defaultValue: '{{name}} foi guardado, mas não conseguimos ler o texto dele.', name: f.name }));
      if (data.document) { setFiles(cur => [data.document as DocumentMeta, ...(cur ?? [])]); onChanged?.(); }
    }
  };
  const remove = async (id: string) => {
    const r = await fetch(`${base}/visit/files/${id}`, { method: 'DELETE', credentials: 'include' }).catch(() => null);
    if (r?.ok) { setFiles(cur => (cur ?? []).filter(x => x.id !== id)); onChanged?.(); }
  };

  return (
    <div
      className={`rounded-lg border px-3 py-2 space-y-2 transition-colors ${over ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-amber-200/70 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20'}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); if (e.dataTransfer.files?.length) void send(e.dataTransfer.files); }}
      data-testid="visit-files"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('cboView.visitFiles', { defaultValue: 'Arquivos da visita' })}
        </span>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted/50">
          <Paperclip className="h-3 w-3" />
          {t('cboView.visitFilesAdd', { defaultValue: 'Anexar' })}
          <input type="file" multiple accept={VISIT_FILE_ACCEPT} className="hidden" data-testid="visit-files-input"
            onChange={e => { if (e.target.files?.length) void send(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
      <p className="text-[11.5px] leading-snug text-muted-foreground">
        {t('cboView.visitFilesHint', { defaultValue: 'O relatório da visita, fotos, um croqui. Cada arquivo é lido e o que importa vai para a comparação, a proposta inicial, o relatório de sinergias e o pré-portfólio — sempre como da coordenação. Arraste para cá ou anexe.' })}
      </p>
      {files === null ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <ul className="space-y-1" data-testid="visit-files-list">
          {files.map(f => (
            <li key={f.id} className="flex items-center gap-2 text-[12.5px]" data-testid={`visit-file-${f.id}`}>
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {f.hasOriginal
                ? <a href={`/api/documents/${f.id}/original`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{readableFilename(f.filename)}</a>
                : <span className="min-w-0 flex-1 truncate">{readableFilename(f.filename)}</span>}
              <button type="button" onClick={() => void remove(f.id)} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t('cboView.visitFileRemove', { defaultValue: 'Remover {{name}}', name: f.filename }) as string} data-testid={`visit-file-remove-${f.id}`}>
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
          {sending.map(n => (
            <li key={`sending-${n}`} className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />{t('cboView.visitFileSending', { defaultValue: 'Lendo {{name}}…', name: n })}
            </li>
          ))}
          {files.length === 0 && sending.length === 0 && (
            <li className="text-[11.5px] italic text-muted-foreground/80">{t('cboView.visitFilesNone', { defaultValue: 'Nenhum arquivo anexado.' })}</li>
          )}
        </ul>
      )}
      {problem && <p className="text-[11.5px] text-destructive" data-testid="visit-files-problem">{problem}</p>}
    </div>
  );
}

/**
 * `onRecordChanged`: the visit was saved, a visit file changed or the
 * organisation was taken to Encontro 4 — the board behind the drawer reloads,
 * so its card stops saying "Registrar a visita técnica" (it used to, until a
 * page reload).
 */
export function VisitPanel({ cohortSlug, memberId, reloadKey, onFilesChanged, onRecordChanged, promptSkip }: { cohortSlug: string; memberId: string; reloadKey: number; onFilesChanged?: () => void; onRecordChanged?: () => void; promptSkip?: boolean }) {
  const { t } = useTranslation();
  const [fields, setFields] = useState<Record<string, { value?: unknown } | undefined> | null>(null);
  const [phase, setPhase] = useState<number | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setFields(null); setError(false);
    fetch(`/api/cohort/${cohortSlug}/member/${memberId}/profile`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => {
        if (cancelled) return;
        setFields((data.profile?.sections as any)?.intervention_type?.fields ?? {});
        setPhase(Number(data.profile?.phase ?? 0) || null);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [cohortSlug, memberId, reloadKey]);
  if (error) return <div className="py-12 text-center text-sm text-destructive">{t('cboView.loadError', { defaultValue: 'Could not load.' })}</div>;
  if (!fields) return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  return (
    <div className="space-y-3 py-1 text-sm">
      <VisitEditor key={`${memberId}-${reloadKey}`} cohortSlug={cohortSlug} memberId={memberId} fields={fields} onSaved={onRecordChanged} />
      <VisitFiles key={`files-${memberId}-${reloadKey}`} cohortSlug={cohortSlug} memberId={memberId} onChanged={() => { onFilesChanged?.(); onRecordChanged?.(); }} />
      {phase !== null && phase >= 1 && phase < 4 && (
        <SkipToE4 cohortSlug={cohortSlug} memberId={memberId} phase={phase} prompt={!!promptSkip} onDone={() => { setPhase(4); onRecordChanged?.(); }} />
      )}
    </div>
  );
}

/**
 * "Levar ao Encontro 4" (22 Oct call): an organisation still in Encontro 2 or 3
 * whose solution was settled with the coordination at the visit goes straight
 * to the initial proposal. The record says which encontros were skipped; the
 * organisation's Encontro 4 asks what they would have given (the place, the
 * problem, and anything else — in words or files).
 */
function SkipToE4({ cohortSlug, memberId, phase, prompt, onDone }: { cohortSlug: string; memberId: string; phase: number; prompt?: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  // Opened from the card: the confirmation is already waiting, in view.
  const [confirming, setConfirming] = useState(!!prompt);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (prompt) boxRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [prompt]);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/cohort/${cohortSlug}/member/${memberId}/skip-to-e4`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? String(r.status));
      onDone();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setBusy(false); setConfirming(false); }
  };
  return (
    <div ref={boxRef} className={`rounded-lg border border-dashed p-3 ${prompt ? 'border-emerald-500/70 bg-emerald-50/40 dark:bg-emerald-950/20' : 'border-foreground/15'}`} data-testid="visit-skip-e4">
      <p className="text-[13px] font-semibold">{t('cboView.skipE4Title', { defaultValue: 'Levar ao Encontro 4' })}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('cboView.skipE4Hint', {
          defaultValue: 'A organização está no Encontro {{phase}}. Se a solução já foi combinada na visita, ela pode ir direto para a proposta inicial: o Encontro 4 pergunta o lugar, o problema e o que mais quiserem contar ou anexar. Fica registrado que o encontro foi pulado.',
          phase,
        })}
      </p>
      {confirming ? (
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={go} data-testid="visit-skip-e4-confirm">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('cboView.skipE4Confirm', { defaultValue: 'Sim, levar ao Encontro 4' })}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={busy} onClick={() => setConfirming(false)}>
            {t('common.cancel', { defaultValue: 'Cancelar' })}
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="mt-2 h-8 text-xs" onClick={() => setConfirming(true)} data-testid="visit-skip-e4-button">
          {t('cboView.skipE4Button', { defaultValue: 'Levar ao Encontro 4' })}
        </Button>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function CboProfileSummary({
  cohortSlug,
  memberId,
  reloadKey,
}: {
  cohortSlug: string;
  memberId: string;
  reloadKey: number;
}) {
  const { t, i18n } = useTranslation();
  const isPt = !!i18n.language?.startsWith('pt');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/cohort/${cohortSlug}/member/${memberId}/profile`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => { if (!cancelled) setProfile(data.profile ?? null); })
      .catch(() => { if (!cancelled) setError(t('cboView.loadError', { defaultValue: 'Could not load.' })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cohortSlug, memberId, reloadKey, t]);

  if (loading) return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (error) return <div className="py-12 text-center text-sm text-destructive">{error}</div>;
  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <FileText className="w-7 h-7 mb-2 opacity-40" />
        <p className="text-sm">{t('cboView.noProfile', { defaultValue: 'Nothing captured yet.' })}</p>
      </div>
    );
  }

  // Same catalog the org's own document uses — the coordinator was reading
  // "site worry" and "community anchoring lead" for the same fields.
  const label = (key: string) => t(`cbo.fields.${key}`, cboFieldLabel(key, isPt ? 'pt' : 'en'));
  const fmt = (v: string | number | null) => (v === null || v === undefined || v === '' ? null : String(v));

  return (
    <div className="space-y-4 py-1 text-sm">
      {/* Maturity total */}
      <div className="rounded-lg border border-foreground/10 bg-foreground/[0.02] px-3 py-2 flex items-center justify-between">
        <span className="text-muted-foreground">{t('cboView.maturity', { defaultValue: 'Maturity' })}</span>
        <span className="font-semibold">{profile.totalMaturityScore}/27</span>
      </div>
      {/* ⚠️ Encontro 3 ends at the comparison; what these four read (why here,
          baseline, who builds, recurring money) is Encontro 4's. Scored or not,
          they are left out of the total until then, and the drawer says so
          rather than letting a low number read as a weak organisation. */}
      {(profile.maturityHeld?.length ?? 0) > 0 && (
        <p className="-mt-2 px-1 text-[11.5px] leading-snug text-muted-foreground" data-testid="cbo-maturity-held">
          {t('cboView.maturityHeld', {
            defaultValue: 'Sem contar {{metrics}}: são lidas do detalhamento do projeto, que fica para o Encontro 4.',
            metrics: profile.maturityHeld!.map(m => label(m).toLowerCase()).join(', '),
          })}
        </p>
      )}

      {/* The technical visit has its own tab now (VisitPanel) — opened
          straight from the roster card, where Robson looks for it. */}

      {/* Sections → fields */}
      {CBO_SECTIONS.map(sec => {
        const section = profile.sections?.[sec.id];
        if (!section) return null;
        const rows = Object.entries(section.fields)
          // "_"-prefixed = E2 checkpoint machine state, not an answer. The
          // JSON blocks (the dig, the tests) and the note have their own
          // rendering — a raw JSON string in a field table helps nobody.
          .filter(([k]) => !isInternalCboField(k) && !k.endsWith('_json') && k !== 'technical_note')
          .map(([k, f]) => {
            const v = fmt(f?.value);
            // org_profile enum fields may hold legacy machine ids ("funded") —
            // render the viewer-language label instead.
            // Every section, not just org_profile — the drawer showed the
            // coordinator `private-owned` and `aguas-pluviais` for E2 fields.
            return [k, v !== null ? cboDisplayValue(sec.id, k, String(v), isPt ? 'pt' : 'en') : v] as const;
          })
          .filter(([, v]) => v !== null);
        return (
          <div key={sec.id}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{section.title}</h4>
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground/70 italic">{t('cboView.empty', { defaultValue: '—' })}</p>
            ) : (
              <dl className="space-y-1">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="text-muted-foreground shrink-0 min-w-[42%]">{label(k)}</dt>
                    <dd className="font-medium break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        );
      })}

      {/* Maturity scorecard */}
      {profile.maturityScores?.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            {t('cboView.scorecard', { defaultValue: 'Maturity scorecard' })}
          </h4>
          <ul className="space-y-1.5">
            {profile.maturityScores.map(s => (
              <li key={s.metric} className="flex items-start gap-2">
                <span className="shrink-0 inline-flex items-center justify-center min-w-[34px] h-5 px-1 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-900/40">
                  {s.score}/3
                </span>
                <span className="min-w-0">
                  <span className="font-medium">{label(s.metric)}</span>
                  {s.justification && <span className="block text-xs text-muted-foreground">{s.justification}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quiet incidents of this session — for the coordination, never the
          organisation. Closed by default; a red count when the flow itself
          misbehaved. shared/session-health.ts */}
      {(profile.health?.length ?? 0) > 0 && (() => {
        const entries = [...(profile.health ?? [])].reverse();
        const bugs = entries.filter(e => HEALTH_LABEL[e.kind as HealthKind]?.severity === 'bug').length;
        return (
          <details className="rounded-lg border border-foreground/10 px-3 py-2" data-testid="cbo-session-health">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('cboView.health', { defaultValue: isPt ? 'Ocorrências da sessão' : 'Session incidents' })} · {entries.length}
              {bugs > 0 && <span className="ml-2 rounded-full bg-destructive/10 px-1.5 py-px text-[10.5px] font-semibold normal-case text-destructive" data-testid="cbo-session-health-bugs">{bugs} {isPt ? 'do fluxo' : 'in the flow'}</span>}
            </summary>
            <ul className="mt-2 space-y-1.5">
              {entries.map((e, i) => {
                const l = HEALTH_LABEL[e.kind as HealthKind];
                return (
                  <li key={i} className="text-xs leading-snug">
                    <span className={l?.severity === 'bug' ? 'font-medium text-destructive' : 'font-medium'}>{l ? (isPt ? l.pt : l.en) : e.kind}</span>
                    <span className="block text-muted-foreground">{e.detail} · {new Date(e.at).toLocaleString(isPt ? 'pt-BR' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}{e.phase ? ` · E${e.phase}` : ''}</span>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })()}
    </div>
  );
}
