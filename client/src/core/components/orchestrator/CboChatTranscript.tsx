/**
 * Coordinator-side read-only view of a CBO's encontro chat transcript.
 * Snapshot-on-open (re-fetches when `reloadKey` changes). Uploads render as a
 * file card rather than the raw extracted-text dump.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, FileText, MessagesSquare } from 'lucide-react';

type Msg = { role: 'user' | 'assistant'; content: string; messageType?: string };

const UPLOAD_MSG_RE = /^(?:I'm uploading: |Uploaded )"(.+?)"/;

export function CboChatTranscript({
  cohortSlug,
  memberId,
  reloadKey,
}: {
  cohortSlug: string;
  memberId: string;
  reloadKey: number;
}) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/cohort/${cohortSlug}/member/${memberId}/chat`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => { if (!cancelled) setMessages(data.messages ?? []); })
      .catch(() => { if (!cancelled) setError(t('cboView.loadError', { defaultValue: 'Could not load.' })); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cohortSlug, memberId, reloadKey, t]);

  if (loading) return <Centered><Loader2 className="w-5 h-5 animate-spin" /></Centered>;
  if (error) return <div className="py-12 text-center text-sm text-destructive">{error}</div>;

  const visible = messages.filter(m => m.messageType !== 'thinking' && m.messageType !== 'tool_status');
  if (visible.length === 0) {
    return (
      <Centered>
        <div className="text-center text-muted-foreground">
          <MessagesSquare className="w-7 h-7 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t('cboView.noChat', { defaultValue: 'No conversation yet.' })}</p>
        </div>
      </Centered>
    );
  }

  return (
    <div className="space-y-2.5 py-1">
      {visible.map((m, i) => {
        const uploadName = m.role === 'user' ? m.content.match(UPLOAD_MSG_RE)?.[1] : undefined;
        return (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-muted'}`}>
              {uploadName ? (
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4 shrink-0 opacity-90" />
                  <span className="font-medium">{uploadName}</span>
                </span>
              ) : m.role === 'user' ? (
                <span className="whitespace-pre-wrap">{m.content}</span>
              ) : (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center py-16 text-muted-foreground">{children}</div>;
}
