/**
 * CBO-side "Seus arquivos" bottom sheet — lets a CBO review the files they've
 * already shared, in-flow on mobile. Reuses the shared <CboFilesView> inside a
 * vaul Drawer (bottom sheet, drag-to-dismiss). Read-only.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from '@/core/components/ui/drawer';
import { CboFilesView } from '@/core/components/cbo-files/CboFilesView';
import type { DocumentMeta } from '@shared/document-schema';

export function CboFilesSheet({
  cboId,
  open,
  onOpenChange,
}: {
  cboId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !cboId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/cbo/${cboId}/documents`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => { if (!cancelled) setDocs(data.documents ?? []); })
      .catch(() => { if (!cancelled) setError(t('files.loadError', { defaultValue: 'Could not load files.' })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, cboId, t]);

  const fetchText = async (docId: string): Promise<string> => {
    if (!cboId) return '';
    const r = await fetch(`/api/cbo/${cboId}/documents/${docId}/text`);
    if (!r.ok) return '';
    const data = await r.json();
    return data.fullText ?? '';
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]" data-testid="cbo-files-sheet">
        <DrawerHeader className="text-left">
          <DrawerTitle>{t('files.mine', { defaultValue: 'Your files' })}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-8 overflow-auto flex-1 min-h-0">
          <CboFilesView
            documents={docs}
            loading={loading}
            error={error}
            originalUrl={docId => `/api/documents/${docId}/original`}
            fetchText={fetchText}
            preferOpenOverIframe
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
