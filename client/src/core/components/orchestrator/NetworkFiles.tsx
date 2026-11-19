// The coordination's own files about the network — the synergy report's
// second input (docs/synergy-outside-documents.md).
//
// Any file can be added and is read as context. A spreadsheet of "organisation
// × what it has / wants" is also proposed as a table; nothing in it is counted
// until a coordinator has looked at how its names were read and confirmed.
// The ticked files are what the next report uses.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, FileSpreadsheet, FileText, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/core/components/ui/dialog';
import { Button } from '@/core/components/ui/button';
import type { SolutionsTable } from '@shared/network-solutions';

interface NetworkFile {
  id: string;
  filename: string;
  createdAt?: string | null;
  table: { orgs: number; hasRatings: boolean; doubts: number; confirmedAt: string | null } | null;
}

interface ReviewData {
  table: SolutionsTable;
  members: Array<{ id: string; orgName: string }>;
  solutions: Array<{ id: string; label: string; familiaId: string }>;
  familias: Array<{ id: string; label: string }>;
}

const selectCls = 'h-8 w-full rounded-md border border-input bg-background px-2 text-[12.5px]';

function ReviewDialog({ slug, fileId, isPt, onClose, onConfirmed }: {
  slug: string; fileId: string | null; isPt: boolean; onClose: () => void; onConfirmed: () => void;
}) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [orgs, setOrgs] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  // For a doubtful name: the catalogue solution it resembles, offered and not chosen.
  const [suggested, setSuggested] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setData(null); setError(false);
    if (!fileId) return;
    let live = true;
    void (async () => {
      const r = await fetch(`/api/cohort/${slug}/network-files/${fileId}/table`, { credentials: 'include' });
      if (!live) return;
      if (!r.ok) { setError(true); return; }
      const d: ReviewData = await r.json();
      setData(d);
      setOrgs(Object.fromEntries(d.table.orgs.map(o => [o.sheetName, o.memberId ?? ''])));
      // One value per name: a catalogue solution id, `fam:<id>` / `fam:` for an
      // item kept outside the catalogue, or `ignore`.
      // A name that only RESEMBLES a catalogue solution ("Cozinha comunitária"
      // against "Cozinha comunitária com biodigestor") comes with that solution
      // already chosen and a note beside the name saying to check it.
      setNames(Object.fromEntries(d.table.names.map(n => [n.key, n.ignore ? 'ignore' : n.solutionId ?? `fam:${n.familiaId ?? ''}`])));
      setSuggested(Object.fromEntries(d.table.names.filter(n => n.how === 'similar' && n.solutionId).map(n => [n.key, n.solutionId!])));
    })();
    return () => { live = false; };
  }, [slug, fileId]);

  const used = useMemo(() => new Set(data ? data.table.orgs.flatMap(o => [...o.has, ...o.wants]) : []), [data]);
  const rows = useMemo(() => (data?.table.names ?? []).filter(n => used.has(n.key)), [data, used]);
  const doubtful = (how: string) => how === 'similar' || how === 'outside';

  const confirm = async () => {
    if (!data || !fileId) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/cohort/${slug}/network-files/${fileId}/table`, {
        method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orgs: data.table.orgs.map(o => ({ sheetName: o.sheetName, memberId: orgs[o.sheetName] || null })),
          names: data.table.names.map(n => {
            const v = names[n.key] ?? '';
            if (v === 'ignore') return { key: n.key, ignore: true };
            if (v.startsWith('fam:')) return { key: n.key, solutionId: null, familiaId: v.slice(4) || null, ignore: false };
            return { key: n.key, solutionId: v, ignore: false };
          }),
        }),
      });
      if (r.ok) { onConfirmed(); onClose(); } else setError(true);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!fileId} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto" data-testid="network-file-review">
        <DialogHeader>
          <DialogTitle>{isPt ? 'Conferir a planilha' : 'Check the spreadsheet'}</DialogTitle>
          <DialogDescription>
            {isPt
              ? 'A plataforma leu os nomes da planilha assim. Confira os destacados em amarelo; só depois de confirmar a tabela entra na contagem do relatório.'
              : 'This is how the platform read the names in the spreadsheet. Check the ones in yellow; the table is only counted in the report after you confirm.'}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-[12.5px] text-destructive">{isPt ? 'Não foi possível abrir ou salvar. Tente de novo.' : 'Could not open or save. Try again.'}</p>}
        {!data && !error && <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{isPt ? 'Abrindo…' : 'Opening…'}</p>}

        {data && (
          <div className="space-y-5">
            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{isPt ? 'Organizações' : 'Organisations'}</h4>
              <div className="space-y-1.5">
                {data.table.orgs.map(o => {
                  const empty = !o.has.length && !o.wants.length;
                  return (
                    <div key={o.sheetName} className={`grid grid-cols-[1fr_1fr] items-center gap-2 rounded-md px-2 py-1 ${!orgs[o.sheetName] && !empty ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`} data-testid="review-org">
                      <span className="text-[12.5px]">{o.sheetName}{empty && <span className="text-muted-foreground"> · {isPt ? 'linha vazia' : 'empty row'}</span>}</span>
                      <select className={selectCls} value={orgs[o.sheetName] ?? ''} onChange={e => setOrgs(p => ({ ...p, [o.sheetName]: e.target.value }))} aria-label={o.sheetName}>
                        <option value="">{isPt ? '— fora da contagem' : '— leave out'}</option>
                        {data.members.map(m => <option key={m.id} value={m.id}>{m.orgName}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{isPt ? 'Soluções' : 'Solutions'}</h4>
              <div className="space-y-1.5">
                {rows.map(n => (
                  <div key={n.key} className={`grid grid-cols-[1fr_1fr] items-center gap-2 rounded-md px-2 py-1 ${doubtful(n.how) ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`} data-testid="review-name" data-how={n.how}>
                    <div className="min-w-0">
                      <div className="text-[12.5px]">{n.typed}</div>
                      {n.how === 'similar' && names[n.key] === suggested[n.key] && (
                        <div className="text-[11px] leading-snug text-amber-800 dark:text-amber-300" data-testid="review-hint">
                          {isPt ? 'Nome parecido: confira se é esta solução' : 'Similar name: check it is this solution'}
                        </div>
                      )}
                      {n.how === 'outside' && (
                        <div className="text-[11px] leading-snug text-amber-800 dark:text-amber-300" data-testid="review-hint">
                          {isPt ? 'Não está no catálogo: escolha a família' : 'Not in the catalogue: choose its family'}
                        </div>
                      )}
                    </div>
                    <select className={selectCls} value={names[n.key] ?? ''} onChange={e => setNames(p => ({ ...p, [n.key]: e.target.value }))} aria-label={n.typed}>
                      <optgroup label={isPt ? 'Solução da plataforma' : 'Platform solution'}>
                        {data.solutions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </optgroup>
                      <optgroup label={isPt ? 'Fora do catálogo: manter com este nome, em…' : 'Outside the catalogue: keep under this name, in…'}>
                        {data.familias.map(f => <option key={f.id} value={`fam:${f.id}`}>{f.label}</option>)}
                        <option value="fam:">{isPt ? 'Fora das famílias' : 'Outside the families'}</option>
                      </optgroup>
                      <option value="ignore">{isPt ? 'Não é uma solução (ignorar)' : 'Not a solution (ignore)'}</option>
                    </select>
                  </div>
                ))}
              </div>
            </section>

            {data.table.ratings.length > 0 && (
              <p className="text-[12px] text-muted-foreground">
                {isPt
                  ? `A planilha também avalia ${data.table.ratings.length} soluções quanto à redução de alagamento, calor e deslizamento. Essas avaliações aparecem no relatório como sendo da planilha, não da plataforma.`
                  : `The spreadsheet also rates ${data.table.ratings.length} solutions for reducing flooding, heat and landslide. The report shows those ratings as the spreadsheet's, not the platform's.`}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{isPt ? 'Fechar' : 'Close'}</Button>
          <Button onClick={confirm} disabled={!data || saving} data-testid="review-confirm">
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
            {isPt ? 'Confirmar' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The list under "Mapear sinergias". `onSelection` hands the parent the ids
 * the next report should use — every file, unless one was unticked — and
 * whether one of them is a confirmed table (the focus buttons depend on it).
 */
export function NetworkFiles({ slug, isPt, onSelection }: { slug: string; isPt: boolean; onSelection: (ids: string[], hasConfirmedTable: boolean) => void }) {
  const [files, setFiles] = useState<NetworkFile[] | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/cohort/${slug}/network-files`, { credentials: 'include' });
      if (r.ok) setFiles((await r.json()).files ?? []);
    } catch { /* an empty list is a normal state */ }
  }, [slug]);
  useEffect(() => { void load(); }, [load]);
  // Only once the list is known — an empty answer before that would run a report without the files.
  useEffect(() => {
    if (!files) return;
    const on = files.filter(f => !off.has(f.id));
    onSelection(on.map(f => f.id), on.some(f => !!f.table?.confirmedAt));
  }, [files, off, onSelection]);

  const add = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true); setFailed(null);
    try {
      const body = new FormData(); body.append('file', file);
      const r = await fetch(`/api/cohort/${slug}/network-files`, { method: 'POST', credentials: 'include', body });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setFailed(j?.error ?? (isPt ? 'O arquivo não pôde ser lido.' : 'The file could not be read.'));
      else {
        if (j?.keptOlder) setFailed(isPt
          ? 'Nesta versão não foi encontrada a tabela de organizações. A versão anterior, com a tabela conferida, foi mantida.'
          : 'No table of organisations was found in this version. The earlier one, with its confirmed table, was kept.');
        await load();
        // A table that was found is reviewed at once: an unconfirmed one is never counted.
        if (j?.file?.table && !j.file.table.confirmedAt) setReview(j.file.id);
      }
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async (id: string) => {
    await fetch(`/api/cohort/${slug}/network-files/${id}`, { method: 'DELETE', credentials: 'include' });
    await load();
  };
  const toggle = (id: string) => setOff(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="mt-4 border-t border-foreground/10 pt-3" data-testid="network-files">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {isPt ? 'Arquivos da coordenação para o relatório' : "The coordination's files for the report"}
        </div>
        <input ref={input} type="file" className="hidden" data-testid="network-file-input"
          accept=".xlsx,.csv,.tsv,.pdf,.docx,.pptx,.txt,.md" onChange={e => void add(e.target.files?.[0])} />
        <button onClick={() => input.current?.click()} disabled={uploading} data-testid="network-file-add"
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-[12px] font-medium transition-colors hover:bg-muted disabled:opacity-60">
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
          {isPt ? 'Adicionar arquivo' : 'Add a file'}
        </button>
      </div>

      {files?.length === 0 && (
        <p className="max-w-[62ch] text-[12px] leading-snug text-muted-foreground">
          {isPt
            ? 'Opcional. Uma planilha com o que cada organização já tem e quer (e, se houver, quanto cada solução reduz cada risco) é cruzada por família de solução e comparada com o que está na plataforma. Outros arquivos entram como contexto.'
            : 'Optional. A spreadsheet of what each organisation has and wants (and, if present, how far each solution reduces each risk) is crossed by solution family and compared with the platform. Other files are read as context.'}
        </p>
      )}
      {failed && <p className="text-[12px] text-destructive" data-testid="network-file-failed">{failed}</p>}

      <ul className="space-y-1">
        {(files ?? []).map(f => {
          const t = f.table;
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px]" data-testid="network-file" data-state={t ? (t.confirmedAt ? 'confirmed' : 'unconfirmed') : 'context'}>
              <input type="checkbox" checked={!off.has(f.id)} onChange={() => toggle(f.id)} aria-label={f.filename} className="h-3.5 w-3.5" />
              {t ? <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="font-medium">{f.filename}</span>
              {f.createdAt && <span className="text-muted-foreground">{new Date(f.createdAt).toLocaleDateString(isPt ? 'pt-BR' : 'en-GB')}</span>}
              {!t && <span className="text-muted-foreground">· {isPt ? 'lido como contexto' : 'read as context'}</span>}
              {t && t.confirmedAt && (
                <span className="text-emerald-700 dark:text-emerald-300">· {isPt ? `tabela conferida (${t.orgs} organizações)` : `table confirmed (${t.orgs} organisations)`}</span>
              )}
              {t && !t.confirmedAt && (
                <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" />
                  {isPt ? 'tabela ainda não conferida: por enquanto só contexto' : 'table not confirmed yet: context only for now'}
                </span>
              )}
              {t && (
                <button onClick={() => setReview(f.id)} className="underline underline-offset-2 hover:text-foreground" data-testid="network-file-review-open">
                  {t.confirmedAt ? (isPt ? 'rever' : 'review') : (isPt ? `conferir${t.doubts ? ` (${t.doubts} a olhar)` : ''}` : `check${t.doubts ? ` (${t.doubts} to look at)` : ''}`)}
                </button>
              )}
              <button onClick={() => void remove(f.id)} className="ml-auto text-muted-foreground hover:text-destructive" aria-label={isPt ? `Remover ${f.filename}` : `Remove ${f.filename}`} data-testid="network-file-remove">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>

      <ReviewDialog slug={slug} fileId={review} isPt={isPt} onClose={() => setReview(null)} onConfirmed={() => void load()} />
    </div>
  );
}
