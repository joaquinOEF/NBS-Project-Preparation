import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, ExternalLink, Link as LinkIcon, MessageCircle, Plus, RotateCcw, Send, Users } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/core/components/ui/dialog';
import { Button } from '@/core/components/ui/button';
import { Input } from '@/core/components/ui/input';

// ---------------------------------------------------------------------------
// Greeting templates — shared between ShareLinkDialog and bulk summary so the
// CBO-facing message is consistent everywhere.
// ---------------------------------------------------------------------------
// The wave is written as an explicit code-point escape (\u{1F44B}) rather than a
// raw literal so it survives any non-UTF-8 re-save of this file in the toolchain
// — a raw 👋 had been showing up as a replacement char (�) in the sent preview.
const WAVE = '\u{1F44B}';
export function cboGreetingMessage(orgName: string, url: string, isPt: boolean): string {
  return isPt
    ? `Olá! ${WAVE}\n\nEste é o link da plataforma do COUGAR/Vila Flores para *${orgName}*. Aqui você vai construir o perfil da organização e o seu projeto NBS junto com os workshops:\n\n${url}\n\nQualquer dúvida, me chama!`
    : `Hi! ${WAVE}\n\nHere's the COUGAR / Vila Flores platform link for *${orgName}*. You'll build your organization profile and your NBS project here alongside the workshops:\n\n${url}\n\nReach out anytime.`;
}

// Language of the CBO-facing invite message: a FORCED cohort language wins, so
// the message matches the page the org will see. Falls back to the coordinator's
// own browser language when the cohort is on Auto.
export function inviteIsPt(cohortLanguage: 'pt' | 'en' | null | undefined, browserLang?: string): boolean {
  if (cohortLanguage === 'pt') return true;
  if (cohortLanguage === 'en') return false;
  return !!browserLang?.startsWith('pt');
}

export function whatsappDeepLink(message: string, phone?: string): string {
  const text = encodeURIComponent(message);
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

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
// InviteCboDialog — Single (one CBO at a time) or Bulk (paste a list) modes.
// Bulk is the typical workshop-day flow: Julia comes in with a list of 10
// orgs, pastes them, hits invite, gets a summary of links to send out.
// ---------------------------------------------------------------------------

export type BulkInviteResult = {
  memberSlug: string;
  orgName: string;
  neighborhood?: string;
};

/** Parse a textarea of "Org name, neighborhood" lines into a structured list. */
export function parseBulkInviteText(text: string): Array<{ orgName: string; neighborhood?: string }> {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [name, ...rest] = line.split(',');
      const orgName = name.trim();
      const neighborhood = rest.join(',').trim() || undefined;
      return { orgName, neighborhood };
    })
    .filter(p => p.orgName.length > 0);
}

export function InviteCboDialog({
  open, onOpenChange, onSubmit, onSingleSuccess, onBulkComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pure invite — no side effects. Called once per CBO in either mode. */
  onSubmit: (params: { orgName: string; neighborhood?: string; role: 'priority' | 'alternate' }) => Promise<{ memberSlug: string; orgName: string } | null>;
  /** Called after a successful single-mode invite — parent typically opens
      the ShareLinkDialog for that CBO. NOT called in bulk mode. */
  onSingleSuccess?: (result: { memberSlug: string; orgName: string }) => void;
  /** Called once after a Bulk submission completes — parent typically opens
      the BulkInviteSummaryDialog with these results. */
  onBulkComplete?: (results: BulkInviteResult[]) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [orgName, setOrgName] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [role, setRole] = useState<'priority' | 'alternate'>('priority');
  const [bulkText, setBulkText] = useState('');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset form on close so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setMode('single');
      setOrgName('');
      setNeighborhood('');
      setRole('priority');
      setBulkText('');
      setBulkProgress(null);
    }
  }, [open]);

  const parsed = useMemo(() => parseBulkInviteText(bulkText), [bulkText]);

  const submit = async () => {
    if (busy) return;

    if (mode === 'single') {
      if (!orgName.trim()) return;
      setBusy(true);
      try {
        const result = await onSubmit({
          orgName: orgName.trim(),
          neighborhood: neighborhood.trim() || undefined,
          role,
        });
        if (result) {
          onOpenChange(false);
          onSingleSuccess?.(result);
        }
      } finally { setBusy(false); }
      return;
    }

    // Bulk: invite each row sequentially so the server isn't overwhelmed and
    // the coordinator gets a steady progress count.
    if (parsed.length === 0) return;
    setBusy(true);
    setBulkProgress({ done: 0, total: parsed.length });
    const results: BulkInviteResult[] = [];
    try {
      for (let i = 0; i < parsed.length; i++) {
        const p = parsed[i];
        const r = await onSubmit({ orgName: p.orgName, neighborhood: p.neighborhood, role });
        if (r) results.push({ memberSlug: r.memberSlug, orgName: r.orgName, neighborhood: p.neighborhood });
        setBulkProgress({ done: i + 1, total: parsed.length });
      }
      onBulkComplete?.(results);
      onOpenChange(false);
    } finally {
      setBusy(false);
      setBulkProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            {mode === 'bulk'
              ? t('orchestrator.cohort.inviteTitleBulk', { defaultValue: 'Invite CBOs in bulk' })
              : t('orchestrator.cohort.inviteTitle', { defaultValue: 'Invite a CBO' })}
          </DialogTitle>
          <DialogDescription>
            {mode === 'bulk'
              ? t('orchestrator.cohort.inviteDescBulk', {
                  defaultValue: 'Paste your CBO list — one per line, optionally with a neighborhood after a comma. Each one gets a private link.',
                })
              : t('orchestrator.cohort.inviteDesc', {
                  defaultValue: 'Adds a CBO to your cohort and generates a private link you can share. The CBO starts with Phase 1 unlocked.',
                })}
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle — segmented control */}
        <div className="flex p-0.5 rounded-md border border-foreground/10 bg-muted/40 text-xs">
          {(['single', 'bulk'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 px-3 py-1.5 rounded transition-colors ${
                mode === m
                  ? 'bg-background text-foreground shadow-sm font-medium'
                  : 'text-muted-foreground hover:text-foreground/80'
              }`}
              data-testid={`invite-mode-${m}`}
            >
              {m === 'single'
                ? t('orchestrator.cohort.inviteModeSingle', { defaultValue: 'One at a time' })
                : t('orchestrator.cohort.inviteModeBulk', { defaultValue: 'Paste a list' })}
            </button>
          ))}
        </div>
        <div className="space-y-3 py-2">
          {mode === 'single' ? (
            <>
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
            </>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">
                {t('orchestrator.cohort.bulkList', { defaultValue: 'CBO list' })}
                <span className="text-red-600 ml-0.5">*</span>
                <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                  {t('orchestrator.cohort.bulkListHint', { defaultValue: 'One per line · `Org name, Neighborhood`' })}
                </span>
              </label>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={`Horta Comunitária Cascata, Cascata\nColetivo Arquipélago Verde, Arquipélago\nAgentes do Bosque Humaitá, Humaitá\n…`}
                rows={8}
                autoFocus
                className="w-full text-sm px-3 py-2 rounded-md border border-foreground/15 bg-background font-mono text-[12px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-300/40"
                data-testid="input-bulk-text"
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {bulkProgress
                    ? t('orchestrator.cohort.bulkProgress', {
                        defaultValue: 'Inviting {{done}} of {{total}}…',
                        done: bulkProgress.done,
                        total: bulkProgress.total,
                      })
                    : t('orchestrator.cohort.bulkParsedCount', {
                        defaultValue: '{{n}} ready to invite',
                        n: parsed.length,
                      })}
                </span>
                {parsed.length > 0 && !bulkProgress && (
                  <span className="text-[10px] text-muted-foreground/70">
                    {parsed
                      .slice(0, 3)
                      .map(p => p.neighborhood ? `${p.orgName} · ${p.neighborhood}` : p.orgName)
                      .join(' · ')}
                    {parsed.length > 3 ? ` … +${parsed.length - 3}` : ''}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {mode === 'bulk'
                ? t('orchestrator.cohort.roleAll', { defaultValue: 'Role (applies to all)' })
                : t('orchestrator.cohort.role', { defaultValue: 'Role in cohort' })}
            </label>
            {/* Radio cards — both descriptions always visible so the coordinator
                sees the operational consequence of each role at selection time.
                Mirrors RequestSupportDialog's option-card pattern. */}
            <div className="space-y-1.5">
              {(['priority', 'alternate'] as const).map((r) => {
                const isActive = role === r;
                const label = r === 'priority'
                  ? t('orchestrator.cohort.rolePriority', { defaultValue: 'Priority' })
                  : t('orchestrator.cohort.roleAlternate', { defaultValue: 'Alternate' });
                const hint = r === 'priority'
                  ? t('orchestrator.cohort.rolePriorityHint', { defaultValue: 'Running the pilot. One of the 10 active seats.' })
                  : t('orchestrator.cohort.roleAlternateHint', { defaultValue: 'Waitlist. Promotes to cohort if a priority CBO drops out.' });
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors flex items-start gap-3 ${
                      isActive
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-500'
                        : 'border-foreground/10 hover:border-foreground/20 hover:bg-muted/50'
                    }`}
                    data-testid={`button-role-${r}`}
                  >
                    <span
                      className={`shrink-0 mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        isActive ? 'border-emerald-600' : 'border-foreground/30'
                      }`}
                      aria-hidden="true"
                    >
                      {isActive && <span className="w-2 h-2 rounded-full bg-emerald-600" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm font-medium leading-tight ${isActive ? 'text-foreground' : 'text-foreground/85'}`}>
                        {label}
                      </span>
                      <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">
                        {hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            onClick={submit}
            disabled={
              busy
              || (mode === 'single' && !orgName.trim())
              || (mode === 'bulk' && parsed.length === 0)
            }
            data-testid="button-confirm-invite"
          >
            {busy
              ? t('common.working', { defaultValue: 'Working…' })
              : mode === 'bulk'
                ? t('orchestrator.cohort.inviteAll', { defaultValue: 'Invite {{n}}', n: parsed.length })
                : t('orchestrator.cohort.inviteAndCopy', { defaultValue: 'Invite & get link' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// BulkInviteSummaryDialog — shown after bulk invite completes. Lists every
// new CBO with two single-tap actions per row: Open WhatsApp (wa.me deep-
// link with the greeting pre-filled) and Copy link. A "Copy all" master
// action at the top stuffs every link into a single clipboard block.
// ---------------------------------------------------------------------------
export function BulkInviteSummaryDialog({
  open, onOpenChange, invitations, origin, cohortLanguage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invitations: BulkInviteResult[];
  /** window.location.origin from the caller — kept as a prop so this component is testable. */
  origin: string;
  /** Forced cohort language — the message matches the page the org will see. */
  cohortLanguage?: 'pt' | 'en' | null;
}) {
  const { t, i18n } = useTranslation();
  const isPt = inviteIsPt(cohortLanguage, i18n.language);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => { if (open) { setCopiedAll(false); setCopiedIdx(null); } }, [open]);

  if (!open) return null;

  const buildUrl = (slug: string) => `${origin}/cbo-profile?cbo=${slug}`;
  const buildMessage = (orgName: string, slug: string) =>
    cboGreetingMessage(orgName, buildUrl(slug), isPt);

  const copy = async (text: string, after: () => void) => {
    try { await navigator.clipboard.writeText(text); after(); } catch {}
  };

  const copyAllMessages = () => {
    const block = invitations
      .map(inv => `— ${inv.orgName}${inv.neighborhood ? ` (${inv.neighborhood})` : ''}\n${buildMessage(inv.orgName, inv.memberSlug)}`)
      .join('\n\n──────────\n\n');
    copy(block, () => { setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2000); });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4" />
            {t('orchestrator.cohort.bulkSummaryTitle', {
              defaultValue: '{{n}} invitations ready',
              n: invitations.length,
            })}
          </DialogTitle>
          <DialogDescription>
            {t('orchestrator.cohort.bulkSummaryDesc', {
              defaultValue: 'Tap "Open in WhatsApp" on each row to send the invite, or copy all messages at once.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={copyAllMessages}
            data-testid="button-copy-all-messages"
          >
            {copiedAll ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            {copiedAll
              ? t('common.copied', { defaultValue: 'Copied!' })
              : t('orchestrator.cohort.copyAllMessages', { defaultValue: 'Copy all messages' })}
          </Button>

          <div className="max-h-[420px] overflow-y-auto -mx-1 px-1 space-y-1.5">
            {invitations.map((inv, i) => {
              const url = buildUrl(inv.memberSlug);
              const msg = buildMessage(inv.orgName, inv.memberSlug);
              return (
                <div
                  key={inv.memberSlug}
                  className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-background px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium tracking-tight truncate">{inv.orgName}</div>
                    {inv.neighborhood && (
                      <div className="text-[11px] text-muted-foreground truncate">{inv.neighborhood}</div>
                    )}
                  </div>
                  <a
                    href={whatsappDeepLink(msg)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] px-2.5 h-7 rounded-md bg-[#25D366] hover:bg-[#1ebd5a] text-white font-medium whitespace-nowrap"
                    data-testid={`button-bulk-whatsapp-${i}`}
                  >
                    <MessageCircle className="w-3 h-3" />
                    WhatsApp
                  </a>
                  <button
                    onClick={() => copy(url, () => { setCopiedIdx(i); setTimeout(() => setCopiedIdx(c => c === i ? null : c), 2000); })}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-foreground/10 hover:bg-muted text-muted-foreground"
                    title={t('orchestrator.cohort.copyLink', { defaultValue: 'Copy link' })}
                    data-testid={`button-bulk-copy-${i}`}
                  >
                    {copiedIdx === i ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              );
            })}
          </div>
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

// ---------------------------------------------------------------------------
// ShareLinkDialog — generic "share this link" dialog with copy + WhatsApp
//   - Used after an invite (audience: a CBO contact)
//   - Used for "My link" (audience: the coordinator themselves)
// ---------------------------------------------------------------------------
type ShareLinkContext =
  | { kind: 'cbo'; orgName: string }
  | { kind: 'coordinator'; cohortName: string };

export function ShareLinkDialog({
  open, onOpenChange, url, context, cohortLanguage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  context: ShareLinkContext | null;
  /** Forced cohort language — the CBO invite message matches the org's page. */
  cohortLanguage?: 'pt' | 'en' | null;
}) {
  const { t, i18n } = useTranslation();
  // The CBO greeting follows the cohort language; the coordinator's own link
  // message stays in the coordinator's browser language (it's for them).
  const cboIsPt = inviteIsPt(cohortLanguage, i18n.language);
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
      return cboGreetingMessage(context.orgName, url, cboIsPt);
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

          {/* Primary action — open WhatsApp with the message pre-filled.
              Only shown for CBO-facing shares; coordinator-link is private. */}
          {context?.kind === 'cbo' && (
            <a
              href={whatsappDeepLink(whatsappMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#25D366] hover:bg-[#1ebd5a] text-white font-medium text-sm h-10 transition-colors"
              data-testid="button-open-whatsapp"
            >
              <MessageCircle className="w-4 h-4" />
              {t('orchestrator.cohort.openWhatsApp', { defaultValue: 'Open in WhatsApp' })}
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
          )}

          {/* Secondary actions — fallbacks if wa.me doesn't work (e.g. desktop
              without WhatsApp Web set up). */}
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
              variant="outline"
              onClick={() => copy(whatsappMessage, setCopiedMessage)}
              data-testid="button-copy-message"
            >
              {copiedMessage ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
              {copiedMessage
                ? t('common.copied', { defaultValue: 'Copied!' })
                : t('orchestrator.cohort.copyMessage', { defaultValue: 'Copy message' })}
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

// ---------------------------------------------------------------------------
// ResetConfirmDialog — wipes members + restores default workshops. Used in
// the pilot's singleton-cohort model where there's only one cohort and the
// orchestrator needs a quick "start fresh" for demo dry runs.
// ---------------------------------------------------------------------------
export function ResetConfirmDialog({
  open, onOpenChange, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            {t('orchestrator.cohort.resetTitle', { defaultValue: 'Reset cohort?' })}
          </DialogTitle>
          <DialogDescription>
            {t('orchestrator.cohort.resetDesc', {
              defaultValue: 'Removes every invited CBO and clears workshop progress. The cohort itself stays. This can\'t be undone.',
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="destructive"
            onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}
            disabled={busy}
            data-testid="button-confirm-reset"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            {busy ? t('common.working', { defaultValue: 'Working…' }) : t('orchestrator.cohort.confirmReset', { defaultValue: 'Yes, reset' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// DeleteCohortConfirmDialog — admin cleanup. Unlike Reset (keeps the cohort),
// this removes the cohort and its members entirely.
// ---------------------------------------------------------------------------
export function DeleteCohortConfirmDialog({
  open, onOpenChange, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            {t('orchestrator.cohort.deleteTitle', { defaultValue: 'Delete cohort?' })}
          </DialogTitle>
          <DialogDescription>
            {t('orchestrator.cohort.deleteDesc', {
              defaultValue: 'Permanently removes this cohort and every invited CBO. The default cohort is re-created empty. This can\'t be undone.',
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            variant="destructive"
            onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}
            disabled={busy}
            data-testid="button-confirm-delete-cohort"
          >
            {busy ? t('common.working', { defaultValue: 'Working…' }) : t('orchestrator.cohort.confirmDelete', { defaultValue: 'Yes, delete' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
