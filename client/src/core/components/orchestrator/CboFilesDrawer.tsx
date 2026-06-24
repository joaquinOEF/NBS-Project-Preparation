/**
 * Coordinator-side evidence drawer — the files a single CBO has uploaded.
 * Opens from the 📎 file-count chip on an orchestrator card; renders the shared
 * <CboFilesView> inside a right-hand Sheet. Reads are scoped + ownership-gated
 * server-side (/api/cohort/:slug/member/:id/documents).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/core/components/ui/sheet';
import { CboFilesView } from '@/core/components/cbo-files/CboFilesView';
import type { DocumentMeta } from '@shared/document-schema';

export type FilesDrawerMember = { id: string; orgName: string };

export function CboFilesDrawer({
  cohortSlug,
  member,
  onClose,
}: {
  cohortSlug: string | null;
  member: FilesDrawerMember | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!member || !cohortSlug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/cohort/${cohortSlug}/member/${member.id}/documents`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => { if (!cancelled) setDocs(data.documents ?? []); })
      .catch(() => { if (!cancelled) setError(t('files.loadError', { defaultValue: 'Could not load files.' })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [member, cohortSlug, t]);

  const fetchText = async (docId: string): Promise<string> => {
    if (!member || !cohortSlug) return '';
    const r = await fetch(
      `/api/cohort/${cohortSlug}/member/${member.id}/documents/${docId}/text`,
      { credentials: 'include' },
    );
    if (!r.ok) return '';
    const data = await r.json();
    return data.fullText ?? '';
  };

  return (
    <Sheet open={!!member} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col" data-testid="cbo-files-drawer">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {t('files.title', { defaultValue: 'Files' })}
            {member && <span className="text-muted-foreground font-normal">· {member.orgName}</span>}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-auto mt-2">
          <CboFilesView
            documents={docs}
            loading={loading}
            error={error}
            originalUrl={docId => `/api/documents/${docId}/original`}
            fetchText={fetchText}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
