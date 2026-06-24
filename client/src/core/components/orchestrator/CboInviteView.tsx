/**
 * CBO invite content — the link + the ready-to-send WhatsApp message. Extracted
 * from ShareLinkDialog so it can live as the first tab of the per-CBO drawer
 * when inspecting an existing CBO. (New single invites still use the modal.)
 * Reuses the shared invite helpers so the message matches exactly.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle, ExternalLink, Copy, Check } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { cboGreetingMessage, whatsappDeepLink, inviteIsPt } from '@/core/components/orchestrator/CohortDialogs';

export function CboInviteView({
  url,
  orgName,
  cohortLanguage,
}: {
  url: string;
  orgName: string;
  cohortLanguage?: 'pt' | 'en' | null;
}) {
  const { t, i18n } = useTranslation();
  const message = cboGreetingMessage(orgName, url, inviteIsPt(cohortLanguage, i18n.language));
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const copy = async (text: string, set: (v: boolean) => void) => {
    try { await navigator.clipboard.writeText(text); set(true); setTimeout(() => set(false), 2000); } catch {}
  };

  return (
    <div className="space-y-3 py-1">
      <p className="text-xs text-muted-foreground">
        {t('orchestrator.cohort.cboLinkDesc', {
          defaultValue: "Share this link with {{org}}. They'll land on the chat with Phase 1 unlocked.",
          org: orgName,
        })}
      </p>

      <div className="rounded-md border border-foreground/10 bg-muted/50 px-3 py-2 break-all text-xs font-mono text-foreground/80">
        {url}
      </div>

      <a
        href={whatsappDeepLink(message)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#25D366] hover:bg-[#1ebd5a] text-white font-medium text-sm h-10 transition-colors"
        data-testid="button-open-whatsapp"
      >
        <MessageCircle className="w-4 h-4" />
        {t('orchestrator.cohort.openWhatsApp', { defaultValue: 'Open in WhatsApp' })}
        <ExternalLink className="w-3 h-3 opacity-70" />
      </a>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => copy(url, setCopiedLink)} data-testid="button-copy-link">
          {copiedLink ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
          {copiedLink ? t('common.copied', { defaultValue: 'Copied!' }) : t('orchestrator.cohort.copyLink', { defaultValue: 'Copy link' })}
        </Button>
        <Button variant="outline" onClick={() => copy(message, setCopiedMessage)} data-testid="button-copy-message">
          {copiedMessage ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
          {copiedMessage ? t('common.copied', { defaultValue: 'Copied!' }) : t('orchestrator.cohort.copyMessage', { defaultValue: 'Copy message' })}
        </Button>
      </div>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none hover:text-foreground/80">
          {t('orchestrator.cohort.previewMessage', { defaultValue: 'Preview message' })}
        </summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-md border border-foreground/10 bg-muted/30 px-3 py-2 text-[11px] leading-relaxed font-sans">
          {message}
        </pre>
      </details>
    </div>
  );
}
