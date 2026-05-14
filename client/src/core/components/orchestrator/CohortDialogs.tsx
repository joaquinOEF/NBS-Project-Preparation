import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Link as LinkIcon, MessageCircle, Plus, Users } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/core/components/ui/dialog';
import { Button } from '@/core/components/ui/button';
import { Input } from '@/core/components/ui/input';

// ---------------------------------------------------------------------------
// CreateCohortDialog — replaces window.prompt for "Create cohort"
// ---------------------------------------------------------------------------
export function CreateCohortDialog({
  open, onOpenChange, onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('Vila Flores cohort');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { await onSubmit(name.trim()); onOpenChange(false); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {t('orchestrator.cohort.createTitle', { defaultValue: 'Create cohort' })}
          </DialogTitle>
          <DialogDescription>
            {t('orchestrator.cohort.createDesc', {
              defaultValue: 'A cohort holds the CBOs you coordinate through one convening cycle. You\'ll get a private link to come back to.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <label className="text-xs font-medium text-foreground/80">
            {t('orchestrator.cohort.cohortName', { defaultValue: 'Cohort name' })}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vila Flores cohort"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            data-testid="input-cohort-name"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()} data-testid="button-confirm-create-cohort">
            {busy
              ? t('common.working', { defaultValue: 'Working…' })
              : t('orchestrator.cohort.create', { defaultValue: 'Create cohort' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// LoadCohortDialog — paste a coordinator link/slug to load an existing cohort
// ---------------------------------------------------------------------------
export function LoadCohortDialog({
  open, onOpenChange, onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (slug: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const cleaned = value.trim().includes('=')
      ? value.trim().split('=').pop()!
      : value.trim().includes('/')
        ? value.trim().split('/').pop()!
        : value.trim();
    if (!cleaned) return;
    setBusy(true);
    try { await onSubmit(cleaned); onOpenChange(false); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            {t('orchestrator.cohort.loadTitle', { defaultValue: 'Load existing cohort' })}
          </DialogTitle>
          <DialogDescription>
            {t('orchestrator.cohort.loadDesc', {
              defaultValue: 'Paste your coordinator link or slug. Use this to return to your cohort from a new browser or device.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <label className="text-xs font-medium text-foreground/80">
            {t('orchestrator.cohort.coordLinkOrSlug', { defaultValue: 'Coordinator link or slug' })}
          </label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://…/orchestrator?coord=… or just the slug"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            data-testid="input-coord-slug"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={submit} disabled={busy || !value.trim()} data-testid="button-confirm-load-cohort">
            {busy
              ? t('common.working', { defaultValue: 'Working…' })
              : t('orchestrator.cohort.load', { defaultValue: 'Load' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// InviteCboDialog — single form for org name + neighborhood + role
// ---------------------------------------------------------------------------
export function InviteCboDialog({
  open, onOpenChange, onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (params: { orgName: string; neighborhood?: string; role: 'priority' | 'alternate' }) => Promise<{ memberSlug: string; orgName: string } | null>;
}) {
  const { t } = useTranslation();
  const [orgName, setOrgName] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [role, setRole] = useState<'priority' | 'alternate'>('priority');
  const [busy, setBusy] = useState(false);

  // Reset form on close so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setOrgName('');
      setNeighborhood('');
      setRole('priority');
    }
  }, [open]);

  const submit = async () => {
    if (!orgName.trim() || busy) return;
    setBusy(true);
    try {
      const result = await onSubmit({
        orgName: orgName.trim(),
        neighborhood: neighborhood.trim() || undefined,
        role,
      });
      if (result) onOpenChange(false);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            {t('orchestrator.cohort.inviteTitle', { defaultValue: 'Invite a CBO' })}
          </DialogTitle>
          <DialogDescription>
            {t('orchestrator.cohort.inviteDesc', {
              defaultValue: 'Adds a CBO to your cohort and generates a private link you can share. The CBO starts with Phase 1 unlocked.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {t('orchestrator.cohort.orgName', { defaultValue: 'Organization name' })}
              <span className="text-red-600 ml-0.5">*</span>
            </label>
            <Input
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Horta Comunitária Cascata"
              autoFocus
              data-testid="input-org-name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {t('orchestrator.cohort.neighborhood', { defaultValue: 'Neighborhood (optional)' })}
            </label>
            <Input
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Cascata"
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              data-testid="input-neighborhood"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {t('orchestrator.cohort.role', { defaultValue: 'Role in cohort' })}
            </label>
            <div className="flex gap-1.5">
              {(['priority', 'alternate'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 text-xs px-3 py-1.5 rounded-md border transition-colors ${
                    role === r
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                      : 'border-foreground/10 bg-background text-foreground/70 hover:bg-foreground/5'
                  }`}
                  data-testid={`button-role-${r}`}
                >
                  {r === 'priority'
                    ? t('orchestrator.cohort.rolePriority', { defaultValue: 'Priority' })
                    : t('orchestrator.cohort.roleAlternate', { defaultValue: 'Alternate' })}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={submit} disabled={busy || !orgName.trim()} data-testid="button-confirm-invite">
            {busy
              ? t('common.working', { defaultValue: 'Working…' })
              : t('orchestrator.cohort.inviteAndCopy', { defaultValue: 'Invite & get link' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ShareLinkDialog — generic "share this link" dialog with copy + WhatsApp
//   - Used after an invite (audience: a CBO contact)
//   - Used for "My link" (audience: the coordinator themselves)
// ---------------------------------------------------------------------------
type ShareLinkContext =
  | { kind: 'cbo'; orgName: string }
  | { kind: 'coordinator'; cohortName: string };

export function ShareLinkDialog({
  open, onOpenChange, url, context,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  context: ShareLinkContext | null;
}) {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language?.startsWith('pt');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  // Reset copy state when dialog reopens with a new URL.
  useEffect(() => {
    if (open) { setCopiedLink(false); setCopiedMessage(false); }
  }, [open, url]);

  const whatsappMessage = (() => {
    if (!context) return url;
    if (context.kind === 'cbo') {
      // CBO-facing greeting. Default to Portuguese for the Brazilian audience;
      // English fallback for the demo.
      return isPt
        ? `Olá! 👋\n\nEste é o link da plataforma do COUGAR/Vila Flores para *${context.orgName}*. Aqui você vai construir o perfil da organização e o seu projeto NBS junto com os workshops:\n\n${url}\n\nQualquer dúvida, me chama!`
        : `Hi! 👋\n\nHere's the COUGAR / Vila Flores platform link for *${context.orgName}*. You'll build your organization profile and your NBS project here alongside the workshops:\n\n${url}\n\nReach out anytime.`;
    }
    // Coordinator-facing — short, just for their own notes
    return isPt
      ? `Meu link de coordenador — ${context.cohortName}:\n${url}\n\n⚠️ Guarde este link. É a forma de voltar ao cohort em outro navegador.`
      : `My coordinator link — ${context.cohortName}:\n${url}\n\n⚠️ Save this link. It's how you get back to the cohort from another browser.`;
  })();

  const copy = async (text: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const isCoordinatorContext = context?.kind === 'coordinator';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            {isCoordinatorContext
              ? t('orchestrator.cohort.coordLinkTitle', { defaultValue: 'Your coordinator link' })
              : t('orchestrator.cohort.cboLinkTitle', { defaultValue: 'Invitation ready' })}
          </DialogTitle>
          <DialogDescription>
            {isCoordinatorContext
              ? t('orchestrator.cohort.coordLinkDesc', {
                  defaultValue: 'Save this somewhere safe. It\'s the only way back to this cohort if you switch browsers or clear cookies.',
                })
              : context?.kind === 'cbo'
                ? t('orchestrator.cohort.cboLinkDesc', {
                    defaultValue: 'Share this link with {{org}}. They\'ll land on the chat with Phase 1 unlocked.',
                    org: context.orgName,
                  })
                : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* URL preview */}
          <div className="rounded-md border border-foreground/10 bg-muted/50 px-3 py-2 break-all text-xs font-mono text-foreground/80">
            {url}
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => copy(url, setCopiedLink)}
              data-testid="button-copy-link"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
              {copiedLink
                ? t('common.copied', { defaultValue: 'Copied!' })
                : t('orchestrator.cohort.copyLink', { defaultValue: 'Copy link' })}
            </Button>
            <Button
              onClick={() => copy(whatsappMessage, setCopiedMessage)}
              data-testid="button-copy-message"
            >
              {copiedMessage ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <MessageCircle className="w-3.5 h-3.5 mr-1.5" />}
              {copiedMessage
                ? t('common.copied', { defaultValue: 'Copied!' })
                : t('orchestrator.cohort.copyMessage', { defaultValue: 'Copy WhatsApp message' })}
            </Button>
          </div>

          {/* Message preview */}
          {context && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground/80">
                {t('orchestrator.cohort.previewMessage', { defaultValue: 'Preview message' })}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-md border border-foreground/10 bg-muted/30 px-3 py-2 text-[11px] leading-relaxed font-sans">
                {whatsappMessage}
              </pre>
            </details>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            {t('common.done', { defaultValue: 'Done' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
