// Coordinator support inbox — slide-out panel triggered from the orchestrator
// header. Lists all support requests across the cohort, lets the coordinator
// resolve them with an optional note. Closes the loop on the RequestSupport
// feature shipped in PR #152.
//
// Endpoints used:
//   GET   /api/cohort/:coord/support-requests?status=pending|resolved|all
//   PATCH /api/cohort/:coord/support-request/:id/resolve

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/core/components/ui/button';
import { Textarea } from '@/core/components/ui/textarea';
import { X, Users, HelpCircle, Network, Wallet, Check, Clock, Loader2, ExternalLink } from 'lucide-react';
import type { SupportRequestType } from '@shared/cohort-schema';

type InboxItem = {
  requestId: string;
  memberId: string;
  capabilityToken: string | null;
  orgName: string;
  neighborhood: string | null;
  type: SupportRequestType;
  message: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedNote: string | null;
};

type Filter = 'pending' | 'resolved' | 'all';

const TYPE_META: Record<SupportRequestType, { Icon: React.ComponentType<{ className?: string }>; pt: string; en: string }> = {
  'coordinator-chat': { Icon: Users, pt: 'Conversa', en: 'Chat' },
  'oef-technical': { Icon: HelpCircle, pt: 'Técnica', en: 'Technical' },
  'cbo-connection': { Icon: Network, pt: 'Conexão CBO', en: 'CBO connection' },
  'finance-partners': { Icon: Wallet, pt: 'Finanças', en: 'Finance' },
};

function formatTimeAgo(iso: string, lang: 'pt' | 'en'): string {
  const then = new Date(iso).getTime();
  const minutesAgo = Math.floor((Date.now() - then) / 60000);
  if (minutesAgo < 1) return lang === 'pt' ? 'agora' : 'just now';
  if (minutesAgo < 60) return lang === 'pt' ? `${minutesAgo}m atrás` : `${minutesAgo}m ago`;
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return lang === 'pt' ? `${hoursAgo}h atrás` : `${hoursAgo}h ago`;
  const daysAgo = Math.floor(hoursAgo / 24);
  return lang === 'pt' ? `${daysAgo}d atrás` : `${daysAgo}d ago`;
}

export function SupportInbox({
  open,
  onOpenChange,
  coordinatorSlug,
  onCountChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coordinatorSlug: string;
  /** Called after any resolve so the trigger badge can update. */
  onCountChange?: (pendingCount: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang: 'pt' | 'en' = i18n.language?.startsWith('pt') ? 'pt' : 'en';
  const [filter, setFilter] = useState<Filter>('pending');
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolveDraft, setResolveDraft] = useState<{ id: string; note: string } | null>(null);
  const [resolving, setResolving] = useState(false);

  const refresh = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/cohort/${coordinatorSlug}/support-requests?status=${filter}`);
      if (r.ok) {
        const data = await r.json();
        setItems(data.items ?? []);
        // Always recompute pending count regardless of current filter
        const pendingR = filter === 'pending'
          ? data.items
          : await (await fetch(`/api/cohort/${coordinatorSlug}/support-requests?status=pending`)).json().then((d: any) => d.items);
        onCountChange?.(pendingR.length);
      }
    } finally { setLoading(false); }
  }, [coordinatorSlug, filter, open, onCountChange]);

  useEffect(() => { refresh(); }, [refresh]);

  const resolveItem = async (item: InboxItem) => {
    setResolving(true);
    try {
      const r = await fetch(`/api/cohort/${coordinatorSlug}/support-request/${item.requestId}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedNote: resolveDraft?.note?.trim() || undefined }),
      });
      if (r.ok) {
        setResolveDraft(null);
        await refresh();
      }
    } finally { setResolving(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
        aria-label={t('orchestrator.support.closeBackdrop', { defaultValue: 'Fechar' }) as string}
      />
      {/* Drawer */}
      <div className="relative w-full max-w-md h-full bg-background border-l border-foreground/10 shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-foreground/10 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              {t('orchestrator.support.title', { defaultValue: 'Pedidos de apoio' })}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t('orchestrator.support.subtitle', { defaultValue: 'Inbox da coordenação' })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label={t('orchestrator.support.close', { defaultValue: 'Fechar' }) as string}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-foreground/10 flex gap-1">
          {(['pending', 'resolved', 'all'] as Filter[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filter === f ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
              }`}
              data-testid={`support-filter-${f}`}
            >
              {t(`orchestrator.support.filter.${f}`, {
                defaultValue: f === 'pending' ? 'Pendentes' : f === 'resolved' ? 'Resolvidos' : 'Todos',
              })}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 mx-auto animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {filter === 'pending'
                  ? t('orchestrator.support.emptyPending', { defaultValue: 'Sem pedências. ☘️' })
                  : t('orchestrator.support.empty', { defaultValue: 'Nada por aqui.' })}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-foreground/5">
              {items.map(item => {
                const meta = TYPE_META[item.type];
                const Icon = meta.Icon;
                const isExpanded = resolveDraft?.id === item.requestId;
                const isResolved = !!item.resolvedAt;
                return (
                  <li key={item.requestId} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center ${
                        isResolved ? 'bg-muted text-muted-foreground' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-tight truncate">{item.orgName}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                              <span>{meta[lang]}</span>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" />
                                {formatTimeAgo(item.createdAt, lang)}
                              </span>
                              {item.neighborhood && (
                                <>
                                  <span>·</span>
                                  <span>{item.neighborhood}</span>
                                </>
                              )}
                            </p>
                          </div>
                          {item.capabilityToken && (
                            <a
                              href={`/cbo-profile?t=${item.capabilityToken}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                              title={t('orchestrator.support.openProfile', { defaultValue: 'Ver perfil' }) as string}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>

                        {item.message && (
                          <p className="text-xs text-foreground/80 leading-snug mt-1.5 whitespace-pre-wrap">
                            {item.message}
                          </p>
                        )}

                        {isResolved && (
                          <div className="mt-2 px-2.5 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40">
                            <p className="text-[10px] font-medium text-emerald-800 dark:text-emerald-200 flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              {t('orchestrator.support.resolved', {
                                defaultValue: 'Resolvido {{when}}',
                                when: item.resolvedAt ? formatTimeAgo(item.resolvedAt, lang) : '',
                              })}
                            </p>
                            {item.resolvedNote && (
                              <p className="text-[11px] text-emerald-900 dark:text-emerald-100 mt-1">{item.resolvedNote}</p>
                            )}
                          </div>
                        )}

                        {!isResolved && !isExpanded && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 h-7 text-[11px]"
                            onClick={() => setResolveDraft({ id: item.requestId, note: '' })}
                            data-testid={`support-resolve-${item.requestId}`}
                          >
                            <Check className="w-3 h-3 mr-1" />
                            {t('orchestrator.support.markResolved', { defaultValue: 'Marcar resolvido' })}
                          </Button>
                        )}

                        {isExpanded && (
                          <div className="mt-2 space-y-2">
                            <Textarea
                              value={resolveDraft.note}
                              onChange={(e) => setResolveDraft({ id: item.requestId, note: e.target.value })}
                              placeholder={t('orchestrator.support.notePlaceholder', { defaultValue: 'Nota interna (opcional)' }) as string}
                              rows={2}
                              maxLength={1000}
                              className="text-xs"
                            />
                            <div className="flex gap-1.5 justify-end">
                              <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setResolveDraft(null)} disabled={resolving}>
                                {t('orchestrator.support.cancel', { defaultValue: 'Cancelar' })}
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => resolveItem(item)}
                                disabled={resolving}
                                data-testid={`support-confirm-${item.requestId}`}
                              >
                                {resolving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                                {t('orchestrator.support.confirm', { defaultValue: 'Confirmar' })}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
