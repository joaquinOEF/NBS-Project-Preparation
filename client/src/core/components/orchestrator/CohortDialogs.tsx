import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, ExternalLink, Link as LinkIcon, MessageCircle, Plus, RotateCcw, Send, Trash2, Users } from 'lucide-react';
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
// No emoji in the greeting: the wave (👋) kept rendering as a replacement char
// (�) in the actual WhatsApp delivery despite the source code-point being
// correct, so it's removed entirely rather than ship a broken glyph.
export function cboGreetingMessage(orgName: string, url: string, isPt: boolean): string {
  return isPt
    ? `Olá!\n\nEste é o link da plataforma do COUGAR/Vila Flores para *${orgName}*. Aqui você vai construir o perfil da organização e o seu projeto NBS junto com os workshops:\n\n${url}\n\nQualquer dúvida, me chama!`
    : `Hi!\n\nHere's the COUGAR / Vila Flores platform link for *${orgName}*. You'll build your organization profile and your NBS project here alongside the workshops:\n\n${url}\n\nReach out anytime.`;
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
// ProvisionCohortDialog — admin-only. Creates a coordinator account AND their
// cohort in one form (replaces the create-coordinator shell script + UUID
// dance). The admin stays logged in as themselves; the new coordinator gets the
// email + password entered here to log in, scoped to the new cohort.
// ---------------------------------------------------------------------------
export function ProvisionCohortDialog({
  open, onOpenChange, onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    coordinatorName?: string;
    email: string;
    password: string;
    cohortName: string;
    language?: 'pt' | 'en' | null;
  }) => Promise<{ ok: boolean; error?: string; coordinatorEmail?: string }>;
}) {
  const { t } = useTranslation();
  const [coordinatorName, setCoordinatorName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cohortName, setCohortName] = useState('');
  const [language, setLanguage] = useState<'pt' | 'en' | null>('pt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever the dialog re-opens, so a previous error/values
  // don't bleed into the next provisioning.
  useEffect(() => {
    if (open) {
      setCoordinatorName(''); setEmail(''); setPassword('');
      setCohortName(''); setLanguage('pt'); setError(null); setBusy(false);
    }
  }, [open]);

  const canSubmit = !!email.trim() && password.length >= 6 && !!cohortName.trim();

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setError(null);
    try {
      const res = await onSubmit({
        coordinatorName: coordinatorName.trim() || undefined,
        email: email.trim(),
        password,
        cohortName: cohortName.trim(),
        language,
      });
      if (res.ok) onOpenChange(false);
      else setError(res.error ?? 'Could not create cohort');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {t('orchestrator.cohort.provisionTitle', { defaultValue: 'New cohort + coordinator' })}
          </DialogTitle>
          <DialogDescription>
            {t('orchestrator.cohort.provisionDesc', {
              defaultValue: 'Create a cohort and the coordinator who runs it. They log in with this email + password and see only this cohort.',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {t('orchestrator.cohort.cohortName', { defaultValue: 'Cohort name' })}
            </label>
            <Input
              value={cohortName}
              onChange={(e) => setCohortName(e.target.value)}
              placeholder="Vila Flores"
              autoFocus
              data-testid="input-provision-cohort-name"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {t('orchestrator.cohort.coordinatorName', { defaultValue: 'Coordinator name' })}
            </label>
            <Input
              value={coordinatorName}
              onChange={(e) => setCoordinatorName(e.target.value)}
              placeholder={t('orchestrator.cohort.coordinatorNamePlaceholder', { defaultValue: 'Ex.: Maria Silva' }) as string}
              data-testid="input-provision-coordinator-name"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">
                {t('orchestrator.cohort.coordinatorEmail', { defaultValue: 'Login email' })}
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="maria@example.com"
                data-testid="input-provision-email"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground/80">
                {t('orchestrator.cohort.coordinatorPassword', { defaultValue: 'Password' })}
              </label>
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min. 6 chars"
                data-testid="input-provision-password"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground/80">
              {t('orchestrator.cohort.language', { defaultValue: 'Language' })}
            </label>
            <div className="inline-flex items-center rounded-md border border-foreground/10 overflow-hidden">
              {([['auto', null], ['pt', 'pt'], ['en', 'en']] as const).map(([label, val]) => {
                const on = language === val;
                const labelText = label === 'auto'
                  ? t('orchestrator.cohort.langAuto', { defaultValue: 'Auto' })
                  : label.toUpperCase();
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setLanguage(val)}
                    aria-pressed={on}
                    data-testid={`button-provision-lang-${label}`}
                    className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                      on ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-foreground/[0.06]'
                    }`}
                  >
                    {labelText}
                  </button>
                );
              })}
            </div>
          </div>
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400" data-testid="text-provision-error">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button onClick={submit} disabled={busy || !canSubmit} data-testid="button-confirm-provision-cohort">
            {busy
              ? t('common.working', { defaultValue: 'Working…' })
              : t('orchestrator.cohort.provisionCreate', { defaultValue: 'Create cohort' })}
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
  onSubmit: (params: { orgName: string; neighborhood?: string; orgType?: 'community' | 'implementer' }) => Promise<{ memberSlug: string; orgName: string } | null>;
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
  // EF-5: the invite used to hardcode type 'community' — wrong default for
  // the implementer cohort. Coordinator declares it here; agent calibration
  // and (later) tier read start from the org row.
  const [orgType, setOrgType] = useState<'community' | 'implementer'>('community');
  const [bulkText, setBulkText] = useState('');
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset form on close so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setMode('single');
      setOrgName('');
      setNeighborhood('');
      setOrgType('community');
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
          orgType,
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
        const r = await onSubmit({ orgName: p.orgName, neighborhood: p.neighborhood });
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
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground/80">
                  {t('orchestrator.cohort.orgType', { defaultValue: 'Organization type' })}
                </label>
                <div className="flex gap-1.5">
                  {(['community', 'implementer'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setOrgType(v)}
                      aria-pressed={orgType === v}
                      data-testid={`orgtype-${v}`}
                      className={`px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${orgType === v ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground/70 border-foreground/15 hover:border-foreground/40'}`}
                    >
                      {v === 'community'
                        ? t('orchestrator.cohort.orgTypeCommunity', { defaultValue: 'Community org' })
                        : t('orchestrator.cohort.orgTypeImplementer', { defaultValue: 'Implementer / studio' })}
                    </button>
                  ))}
                </div>
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
// MemberResetConfirmDialog — resets ONE org's profile (field report
// 2026-07-08: the console could only wipe the whole cohort at once). The
// member keeps its invite link and workshop unlocks; the working session and
// run-derived progress are erased.
// ---------------------------------------------------------------------------
export function MemberResetConfirmDialog({
  open, orgName, onOpenChange, onConfirm,
}: {
  open: boolean;
  orgName: string;
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
            {t('orchestrator.memberReset.title', { defaultValue: 'Reset {{org}}?', org: orgName })}
          </DialogTitle>
          <DialogDescription>
            {t('orchestrator.memberReset.desc', {
              defaultValue: 'Erases this organization’s profile, conversation, and progress so it can start Encontro 1 from scratch. The invite link keeps working and workshop unlocks stay. This can’t be undone.',
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
            data-testid="button-confirm-member-reset"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            {busy ? t('common.working', { defaultValue: 'Working…' }) : t('orchestrator.memberReset.confirm', { defaultValue: 'Yes, reset this org' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// MemberRemoveConfirmDialog — removes ONE org from the cohort entirely (unlike
// reset, which keeps the member + invite link). The invite link stops working
// and the card disappears from the roster; the org's uploaded documents are
// kept server-side and relink if the same org name is invited again.
// ---------------------------------------------------------------------------
export function MemberRemoveConfirmDialog({
  open, orgName, onOpenChange, onConfirm,
}: {
  open: boolean;
  orgName: string;
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
            <AlertTriangle className="w-4 h-4 text-destructive" />
            {t('orchestrator.memberRemove.title', { defaultValue: 'Remove {{org}} from the cohort?', org: orgName })}
          </DialogTitle>
          <DialogDescription>
            {t('orchestrator.memberRemove.desc', {
              defaultValue: 'Removes this organization from the cohort: the invite link stops working and its conversation and progress are erased. Uploaded documents are kept and come back if you invite the same organization name again. This can’t be undone.',
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
            data-testid="button-confirm-member-remove"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            {busy ? t('common.working', { defaultValue: 'Working…' }) : t('orchestrator.memberRemove.confirm', { defaultValue: 'Yes, remove this org' })}
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
