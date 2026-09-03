/**
 * Coordinator-side per-CBO drawer — everything about one CBO in four tabs:
 *   Convite (invite link + WhatsApp message) · Arquivos (files) · Conversa
 *   (chat transcript) · Perfil (profile doc). Opens from an orchestrator card;
 *   reads are ownership-gated server-side. Snapshot on open + a manual refresh.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, RefreshCw, Download } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/core/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/core/components/ui/tabs';
import { Button } from '@/core/components/ui/button';
import { CboFilesView } from '@/core/components/cbo-files/CboFilesView';
import { CboInviteView } from '@/core/components/orchestrator/CboInviteView';
import { CboChatTranscript } from '@/core/components/orchestrator/CboChatTranscript';
import { CboProfileSummary } from '@/core/components/orchestrator/CboProfileSummary';
import type { DocumentMeta } from '@shared/document-schema';

export type CboDrawerTab = 'convite' | 'arquivos' | 'conversa' | 'perfil' | 'documentos';
export type FilesDrawerMember = { id: string; orgName: string; inviteUrl: string };

export function CboFilesDrawer({
  cohortSlug,
  member,
  cohortLanguage,
  initialTab = 'convite',
  onClose,
}: {
  cohortSlug: string | null;
  member: FilesDrawerMember | null;
  cohortLanguage?: 'pt' | 'en' | null;
  initialTab?: CboDrawerTab;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CboDrawerTab>(initialTab);
  const [reloadKey, setReloadKey] = useState(0);

  // Files tab data (lives here so the refresh button can re-pull it too).
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  // Reset to the requested tab each time the drawer opens for a member.
  useEffect(() => { if (member) setTab(initialTab); }, [member, initialTab]);

  useEffect(() => {
    if (!member || !cohortSlug) return;
    let cancelled = false;
    setDocsLoading(true);
    setDocsError(null);
    fetch(`/api/cohort/${cohortSlug}/member/${member.id}/documents`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => { if (!cancelled) setDocs(data.documents ?? []); })
      .catch(() => { if (!cancelled) setDocsError(t('files.loadError', { defaultValue: 'Could not load files.' })); })
      .finally(() => { if (!cancelled) setDocsLoading(false); });
    return () => { cancelled = true; };
  }, [member, cohortSlug, reloadKey, t]);

  const fetchText = async (docId: string): Promise<string> => {
    if (!member || !cohortSlug) return '';
    const r = await fetch(`/api/cohort/${cohortSlug}/member/${member.id}/documents/${docId}/text`, { credentials: 'include' });
    if (!r.ok) return '';
    return (await r.json()).fullText ?? '';
  };

  return (
    <Sheet open={!!member} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col" data-testid="cbo-files-drawer">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 pr-8">
            <span className="truncate">{member?.orgName}</span>
            {/* Context bundle — the whole org in one folder, readable by a
                person or an agent. Anchored rather than fetch+blob: the server
                sets Content-Disposition, so the browser streams it straight to
                disk and a large zip never has to sit in a tab's memory. */}
            <Button
              asChild
              variant="ghost" size="sm"
              className="ml-auto shrink-0 h-7 px-2 gap-1"
            >
              <a
                href={`/api/cohort/${cohortSlug}/member/${member?.id}/export`}
                download
                title={t('cboView.exportHint', {
                  defaultValue: 'Download everything we have about this org',
                }) as string}
                data-testid="cbo-drawer-export"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">
                  {t('cboView.export', { defaultValue: 'Export' })}
                </span>
              </a>
            </Button>
            <Button
              variant="ghost" size="sm"
              className="shrink-0 h-7 px-2"
              onClick={() => setReloadKey(k => k + 1)}
              title={t('cboView.refresh', { defaultValue: 'Refresh' }) as string}
              data-testid="cbo-drawer-refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </SheetTitle>
        </SheetHeader>

        {member && cohortSlug && (
          <Tabs value={tab} onValueChange={v => setTab(v as CboDrawerTab)} className="flex-1 min-h-0 flex flex-col mt-2">
            <TabsList className="grid grid-cols-5">
              <TabsTrigger value="convite" data-testid="cbo-tab-convite">{t('cboView.tabInvite', { defaultValue: 'Invite' })}</TabsTrigger>
              <TabsTrigger value="arquivos" data-testid="cbo-tab-arquivos">{t('cboView.tabFiles', { defaultValue: 'Files' })}</TabsTrigger>
              <TabsTrigger value="conversa" data-testid="cbo-tab-conversa">{t('cboView.tabChat', { defaultValue: 'Chat' })}</TabsTrigger>
              <TabsTrigger value="perfil" data-testid="cbo-tab-perfil">{t('cboView.tabProfile', { defaultValue: 'Profile' })}</TabsTrigger>
              <TabsTrigger value="documentos" data-testid="cbo-tab-documentos">{t('cboView.tabDocuments', { defaultValue: 'Documents' })}</TabsTrigger>
            </TabsList>

            <TabsContent value="convite" className="flex-1 min-h-0 overflow-auto mt-2">
              <CboInviteView url={member.inviteUrl} orgName={member.orgName} cohortLanguage={cohortLanguage} />
            </TabsContent>
            <TabsContent value="arquivos" className="flex-1 min-h-0 overflow-auto mt-2">
              <CboFilesView
                documents={docs}
                loading={docsLoading}
                error={docsError}
                originalUrl={docId => `/api/documents/${docId}/original`}
                fetchText={fetchText}
              />
            </TabsContent>
            <TabsContent value="conversa" className="flex-1 min-h-0 overflow-auto mt-2">
              <CboChatTranscript cohortSlug={cohortSlug} memberId={member.id} reloadKey={reloadKey} />
            </TabsContent>
            <TabsContent value="perfil" className="flex-1 min-h-0 overflow-auto mt-2">
              <CboProfileSummary cohortSlug={cohortSlug} memberId={member.id} reloadKey={reloadKey} />
            </TabsContent>
            {/* ⚠️ What the ORGANISATION took away. Until now nobody on the
                coordination side could read it: the portfolio exists to carry
                these forward — pooling the studies, taking the recurring-money
                gap to the prefeitura — and the only way to see one was to be
                the org. Rebuilt from live state on open, so this is the same
                document they hold, not a copy of it. */}
            <TabsContent value="documentos" className="flex-1 min-h-0 overflow-auto mt-2">
              <div className="space-y-2 px-1">
                <p className="text-[12px] leading-snug text-muted-foreground">
                  {t('cboView.documentsHint', {
                    defaultValue: 'Os documentos que a organização leva do Encontro 3. Abrem numa aba nova, exatamente como ela os vê.',
                  })}
                </p>
                {[
                  { kind: 'nota', label: t('cboView.docConceptNote', { defaultValue: 'Nota de conceito' }), hint: t('cboView.docConceptNoteHint', { defaultValue: 'Para financiador ou prefeitura' }) },
                  { kind: 'rota', label: t('cboView.docRoadmap', { defaultValue: 'Hoja de ruta' }), hint: t('cboView.docRoadmapHint', { defaultValue: 'O caminho, com responsáveis' }) },
                ].map(d => (
                  <a
                    key={d.kind}
                    href={`/api/cohort/${cohortSlug}/member/${member.id}/document/${d.kind}`}
                    target="_blank"
                    rel="noreferrer"
                    data-testid={`cbo-doc-${d.kind}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-card px-3 py-2.5 hover:bg-muted/50"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold">{d.label}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{d.hint}</span>
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </a>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
