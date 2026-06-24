/**
 * Shared evidence viewer — lists a CBO's uploaded files and previews/opens them.
 *
 * Presentational + self-contained: the caller supplies the document list and two
 * URL/loader callbacks, so the SAME component powers the coordinator drawer
 * (orchestrator) and the CBO's own bottom sheet (mobile chat). Master-detail:
 * a file list; tapping a file opens its preview with a back affordance — which
 * reads cleanly in both a narrow side-drawer and a mobile bottom sheet.
 *
 * Preview strategy (graceful degradation):
 *   - image/*           → inline <img>
 *   - application/pdf    → inline <iframe> on desktop; "open" button on mobile
 *                          (iOS Safari renders PDF-in-iframe unreliably)
 *   - everything else    → the agent's extracted text (fetched on demand)
 *   - no original blob   → extracted text only, with a note
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Paperclip, FileText, Image as ImageIcon, FileSpreadsheet, Music, File,
  Download, ExternalLink, ChevronLeft, Loader2,
} from 'lucide-react';
import type { DocumentMeta, DocumentKind } from '@shared/document-schema';
import { Button } from '@/core/components/ui/button';

const KIND_ICON: Record<DocumentKind, typeof FileText> = {
  pdf: FileText,
  docx: FileText,
  xlsx: FileSpreadsheet,
  text: FileText,
  image: ImageIcon,
  audio: Music,
  other: File,
};

function iconFor(doc: DocumentMeta) {
  return (doc.kind && KIND_ICON[doc.kind]) || File;
}

function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type CboFilesViewProps = {
  documents: DocumentMeta[];
  loading?: boolean;
  error?: string | null;
  /** Builds the URL that streams a document's original blob. */
  originalUrl: (docId: string) => string;
  /** Fetches the agent's extracted text for a document (fallback / non-previewable). */
  fetchText: (docId: string) => Promise<string>;
  /** On mobile, prefer an "open" button over an inline PDF iframe. */
  preferOpenOverIframe?: boolean;
};

export function CboFilesView({
  documents,
  loading,
  error,
  originalUrl,
  fetchText,
  preferOpenOverIframe = false,
}: CboFilesViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('pt') ? 'pt-BR' : 'en-US';
  const [selected, setSelected] = useState<DocumentMeta | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (error) {
    return <div className="py-12 text-center text-sm text-destructive">{error}</div>;
  }
  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <Paperclip className="w-7 h-7 mb-2 opacity-40" />
        <p className="text-sm">
          {t('files.empty', { defaultValue: 'No files shared yet.' })}
        </p>
      </div>
    );
  }

  if (selected) {
    return (
      <FilePreview
        doc={selected}
        onBack={() => setSelected(null)}
        originalUrl={originalUrl}
        fetchText={fetchText}
        preferOpenOverIframe={preferOpenOverIframe}
      />
    );
  }

  return (
    <ul className="divide-y divide-foreground/5">
      {documents.map(doc => {
        const Icon = iconFor(doc);
        const date = doc.createdAt
          ? new Date(doc.createdAt).toLocaleDateString(locale, { day: '2-digit', month: 'short' })
          : '';
        return (
          <li key={doc.id}>
            <button
              type="button"
              onClick={() => setSelected(doc)}
              className="w-full flex items-center gap-3 py-2.5 px-1 text-left hover:bg-foreground/5 rounded-md transition-colors"
              data-testid={`file-row-${doc.id}`}
            >
              <span className="shrink-0 w-9 h-9 rounded-lg bg-foreground/[0.04] flex items-center justify-center text-foreground/60">
                <Icon className="w-4 h-4" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{doc.filename}</span>
                <span className="block text-[11px] text-muted-foreground truncate">
                  {[
                    formatSize(doc.sizeBytes),
                    doc.droppedInPhase
                      ? t('files.fromEncontro', { defaultValue: 'Encontro {{n}}', n: doc.droppedInPhase })
                      : '',
                    date,
                  ].filter(Boolean).join(' · ')}
                </span>
              </span>
              <ChevronLeft className="w-4 h-4 text-muted-foreground rotate-180 shrink-0" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FilePreview({
  doc,
  onBack,
  originalUrl,
  fetchText,
  preferOpenOverIframe,
}: {
  doc: DocumentMeta;
  onBack: () => void;
  originalUrl: (docId: string) => string;
  fetchText: (docId: string) => Promise<string>;
  preferOpenOverIframe: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const url = originalUrl(doc.id);
  const isImage = doc.mimeType?.startsWith('image/') || doc.kind === 'image';
  const isPdf = doc.mimeType === 'application/pdf' || doc.kind === 'pdf';
  const canInlinePdf = isPdf && doc.hasOriginal && !preferOpenOverIframe;
  // Anything we can't render visually → show the extracted text.
  const needsText = !doc.hasOriginal || (!isImage && !canInlinePdf);

  const loadText = async () => {
    if (text !== null || loadingText) return;
    setLoadingText(true);
    try {
      setText(await fetchText(doc.id));
    } catch {
      setText('');
    } finally {
      setLoadingText(false);
    }
  };
  if (needsText) void loadText();

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 pb-2 mb-2 border-b border-foreground/5">
        <Button variant="ghost" size="sm" onClick={onBack} className="shrink-0 -ml-2" data-testid="file-preview-back">
          <ChevronLeft className="w-4 h-4 mr-1" />
          {t('files.back', { defaultValue: 'Files' })}
        </Button>
        <span className="text-sm font-medium truncate flex-1">{doc.filename}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {isImage && doc.hasOriginal && (
          <img src={url} alt={doc.filename} className="max-w-full max-h-[60vh] mx-auto object-contain rounded-lg" />
        )}
        {canInlinePdf && (
          <iframe src={url} title={doc.filename} className="w-full h-[60vh] rounded-lg border border-foreground/10" />
        )}
        {needsText && (
          <div className="text-sm">
            {!doc.hasOriginal && (
              <p className="text-[11px] text-muted-foreground mb-2">
                {t('files.noOriginalNote', { defaultValue: 'Original not stored — showing the extracted text.' })}
              </p>
            )}
            {loadingText ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : text ? (
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-foreground/85">{text}</pre>
            ) : (
              <p className="text-muted-foreground py-6 text-center">
                {t('files.noPreview', { defaultValue: 'No preview available.' })}
              </p>
            )}
          </div>
        )}
      </div>

      {doc.hasOriginal && (
        <div className="flex items-center gap-2 pt-3 mt-2 border-t border-foreground/5">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <a href={url} target="_blank" rel="noopener noreferrer" data-testid="file-open">
              <ExternalLink className="w-4 h-4 mr-1.5" />
              {t('files.open', { defaultValue: 'Open' })}
            </a>
          </Button>
          <Button asChild variant="outline" size="sm" className="flex-1">
            <a href={url} download={doc.filename} data-testid="file-download">
              <Download className="w-4 h-4 mr-1.5" />
              {t('files.download', { defaultValue: 'Download' })}
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
