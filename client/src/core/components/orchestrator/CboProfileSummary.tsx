/**
 * Coordinator-side read-only summary of a CBO's profile document as it's built —
 * sections (field: value) + the maturity scorecard (coordinator-only). Compact;
 * snapshot-on-open (re-fetches on `reloadKey`).
 */
import { useEffect, useState } from 'react';
import { cboFieldLabel, cboDisplayValue } from '@shared/cbo-field-catalog';
import { useTranslation } from 'react-i18next';
import { Loader2, FileText, Check } from 'lucide-react';
import { CBO_SECTIONS, isInternalCboField, type CboState } from '@shared/cbo-schema';

type Profile = Pick<CboState, 'phase' | 'sections' | 'maturityScores' | 'totalMaturityScore' | 'gaps'>;

/**
 * The coordination's technical reading of this organisation — Robson's field
 * visit (28–29 Sept), typed in here. Optional: the comparison and the synergy
 * pass print it when it is there and nothing when it is not. Saved through
 * PATCH …/technical-note into the organisation's own record.
 */
function TechnicalNoteEditor({ cohortSlug, memberId, initial }: { cohortSlug: string; memberId: string; initial: string }) {
  const { t } = useTranslation();
  const [note, setNote] = useState(initial);
  const [saved, setSaved] = useState<string>(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setNote(initial); setSaved(initial); }, [initial]);
  const dirty = note.trim() !== saved.trim();
  const save = async () => {
    setBusy(true); setFailed(false);
    const r = await fetch(`/api/cohort/${cohortSlug}/member/${memberId}/technical-note`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note.trim() }),
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setFailed(true); return; }
    setSaved(note.trim());
  };
  return (
    <div className="rounded-lg border border-amber-200/70 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20 px-3 py-2 space-y-1.5" data-testid="technical-note-editor">
      <label htmlFor={`technical-note-${memberId}`} className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('cboView.technicalNote', { defaultValue: 'Leitura técnica da coordenação' })}
      </label>
      <p className="text-[11.5px] leading-snug text-muted-foreground">
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
          data-testid="technical-note-save"
          className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {t('cboView.technicalNoteSave', { defaultValue: 'Salvar' })}
        </button>
        {!dirty && saved && <span className="text-[11px] text-muted-foreground">{t('cboView.technicalNoteSaved', { defaultValue: 'Salvo' })}</span>}
        {failed && <span className="text-[11px] text-destructive">{t('cboView.technicalNoteFailed', { defaultValue: 'Não salvou — tenta de novo' })}</span>}
      </div>
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

      <TechnicalNoteEditor
        cohortSlug={cohortSlug}
        memberId={memberId}
        initial={String((profile.sections as any)?.intervention_type?.fields?.technical_note?.value ?? '')}
      />

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
    </div>
  );
}
