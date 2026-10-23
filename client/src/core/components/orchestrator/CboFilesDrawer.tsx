/**
 * Coordinator-side per-CBO drawer — everything about one CBO in four tabs:
 *   Convite (invite link + WhatsApp message) · Arquivos (files) · Conversa
 *   (chat transcript) · Perfil (profile doc). Opens from an orchestrator card;
 *   reads are ownership-gated server-side. Snapshot on open + a manual refresh.
 */
import { PrenotePanel } from './PrenotePanel';
import { E4AnswersPanel } from './E4AnswersPanel';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, RefreshCw, Download, CopyPlus, FileText, MapPin, FlaskConical, Share2, EyeOff, RotateCcw, Trash2, UserMinus, ArrowLeft, CheckCircle2, ShieldCheck, ShieldAlert } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/core/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/core/components/ui/tabs';
import { Button } from '@/core/components/ui/button';
import { CboFilesView } from '@/core/components/cbo-files/CboFilesView';
import { CboInviteView } from '@/core/components/orchestrator/CboInviteView';
import { CboChatTranscript } from '@/core/components/orchestrator/CboChatTranscript';
import { CboProfileSummary, VisitPanel, SkipToE4 } from '@/core/components/orchestrator/CboProfileSummary';
import type { DocumentMeta } from '@shared/document-schema';
import { getSolution } from '@shared/nbs-catalog';
import type { DataTermStatus } from '@shared/data-term';

/** Each tab is as wide as its word (and grows to share what is left) — never an equal fifth it cannot fit in. */
const TAB = 'grow shrink-0 basis-auto px-1.5 text-[12px] min-[420px]:px-2.5 min-[420px]:text-[12.5px]';

export type CboDrawerTab = 'convite' | 'arquivos' | 'conversa' | 'perfil' | 'visita' | 'documentos';
export type FilesDrawerMember = {
  id: string; orgName: string; inviteUrl: string;
  /** Context for the line under the name. All optional — the drawer renders without them. */
  neighborhood?: string;
  /** 1–6: the encontro this organisation is in. */
  encontro?: number;
  /** A test copy / demo member, kept out of the portfolio analysis. */
  isTest?: boolean;
  /** Ids of the solutions tested in Encontro 3 — one "Cenário" link each in Documentos. */
  w3?: { testedIds?: string[]; detailed?: boolean };
  /** The data term's record for the current version (shared/data-term.ts). */
  dataTerm?: DataTermStatus | null;
};

export function CboFilesDrawer({
  cohortSlug,
  member,
  cohortLanguage,
  initialTab = 'convite',
  onClose,
  onCloneTest,
  onSimulateE3,
  onRecordChanged,
  skipPrompt,
  simulating = false,
  memberActions,
}: {
  cohortSlug: string | null;
  member: FilesDrawerMember | null;
  cohortLanguage?: 'pt' | 'en' | null;
  initialTab?: CboDrawerTab;
  onClose: () => void;
  /** Make a test copy of this organisation (end of Encontro 2). Absent = no button. */
  onCloneTest?: (member: FilesDrawerMember) => void;
  /** Walk this organisation through a simulated Encontro 3 (staging only). Absent = not eligible here. */
  onSimulateE3?: (member: FilesDrawerMember) => void;
  /** Something on the organisation's record changed from inside the drawer — reload the board. */
  onRecordChanged?: () => void;
  /** Opened from the card's "levar ao Encontro 4": the drawer opens on that step, confirmation first. */
  skipPrompt?: boolean;
  simulating?: boolean;
  /** The rarely-used per-organisation actions, moved here off the roster card. */
  memberActions?: {
    inPortfolio: boolean;
    onTogglePortfolio: () => void;
    onReset: () => void;
    onRemove: () => void;
    /** "Saiu da rede": off the board and every analysis, record kept, restorable. */
    onLeaveNetwork?: () => void;
  };
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CboDrawerTab>(initialTab);
  const [reloadKey, setReloadKey] = useState(0);

  // Files tab data (lives here so the refresh button can re-pull it too).
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  // A file attached in the visit tab belongs on the Arquivos list too.
  const [filesTick, setFilesTick] = useState(0);

  // ⚠️ "Levar ao Encontro 4" is its own view, in two steps (22 Oct decision):
  // confirm, then "O que ainda falta" — the coordination answers what it knows,
  // all optional, and leaves the rest to the organisation's own Encontro 4.
  // It used to be a box at the foot of the visit tab, and after it the only
  // tool was the proposal's pencil, which closes no gap.
  const [skipStep, setSkipStep] = useState<'confirm' | 'answers' | null>(null);
  // The line under the name follows a skip at once — it read "Encontro 2" above "Encontro 4 aberto".
  const [movedTo4, setMovedTo4] = useState(false);

  // Reset to the requested tab each time the drawer opens for a member.
  useEffect(() => {
    if (!member) return;
    setTab(initialTab);
    setSkipStep(skipPrompt && (member.encontro ?? 0) < 4 ? 'confirm' : null);
    setMovedTo4(false);
  }, [member, initialTab, skipPrompt]);
  const encontro = movedTo4 ? 4 : member?.encontro;
  const leaveSkip = () => { setSkipStep(null); setTab('documentos'); setReloadKey(k => k + 1); };

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
  }, [member, cohortSlug, reloadKey, filesTick, t]);

  const fetchText = async (docId: string): Promise<string> => {
    if (!member || !cohortSlug) return '';
    const r = await fetch(`/api/cohort/${cohortSlug}/member/${member.id}/documents/${docId}/text`, { credentials: 'include' });
    if (!r.ok) return '';
    return (await r.json()).fullText ?? '';
  };

  return (
    <Sheet open={!!member} onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-3" data-testid="cbo-files-drawer">
        {/* ⚠️ THE NAME COMES FIRST, ON ITS OWN LINE. It used to share one row with
            the actions, and every action added since (Exportar, Perfil, Cópia de
            teste) took its width from the name until a coordinator with three
            drawers open was reading "t". Name (two lines if it needs them), a
            line of context, then the actions as their own row. */}
        <SheetHeader className="space-y-1 text-left">
          <SheetTitle className="pr-8 text-base font-semibold leading-snug break-words line-clamp-2" data-testid="cbo-drawer-title" title={member?.orgName}>
            {member?.orgName}
          </SheetTitle>
          <div className="flex items-center gap-2">
            <div className="flex min-h-7 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" data-testid="cbo-drawer-context">
              {member?.neighborhood && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{member.neighborhood}</span>}
              {encontro ? <span>{member?.neighborhood ? '· ' : ''}{t('cboView.encontroN', { defaultValue: 'Encontro {{n}}', n: encontro })}</span> : null}
              {member?.dataTerm && (
                member.dataTerm.accepted
                  ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400" data-testid="cbo-drawer-data-term">
                      <ShieldCheck className="h-3 w-3" />
                      {t('cboView.dataTermAccepted', {
                        defaultValue: 'Termo v{{v}} aceito em {{date}} por {{name}} ({{role}})',
                        v: member.dataTerm.version,
                        date: new Date(member.dataTerm.accepted.at).toLocaleString(cohortLanguage === 'en' ? 'en-GB' : 'pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
                        name: member.dataTerm.accepted.name,
                        role: member.dataTerm.accepted.role,
                      })}
                    </span>
                  )
                  : (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400" data-testid="cbo-drawer-data-term">
                      <ShieldAlert className="h-3 w-3" />
                      {t('cboView.dataTermPending', { defaultValue: 'Termo de dados pendente' })}
                    </span>
                  )
              )}
              {member?.isTest && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-1.5 py-px text-[10.5px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300" data-testid="cbo-drawer-test-badge">
                  <FlaskConical className="h-3 w-3" />{t('cboView.testBadge', { defaultValue: 'Cópia de teste — fora do portfólio' })}
                </span>
              )}
            </div>
            {/* Refresh lives with the context, not with the actions: three labelled
                buttons fill a phone's row, and a fourth control wrapped alone onto
                a line of its own. */}
            <Button
              variant="ghost" size="sm"
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground"
            onClick={() => setReloadKey(k => k + 1)}
            title={t('cboView.refresh', { defaultValue: 'Refresh' }) as string}
            aria-label={t('cboView.refresh', { defaultValue: 'Refresh' }) as string}
            data-testid="cbo-drawer-refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          </div>
        </SheetHeader>

        <div className="-mx-1 flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-2" role="toolbar" aria-label={t('cboView.actions', { defaultValue: 'Ações' }) as string}>
          {/* Context bundle — the whole org in one folder, readable by a
              person or an agent. Anchored rather than fetch+blob: the server
              sets Content-Disposition, so the browser streams it straight to
              disk and a large zip never has to sit in a tab's memory. */}
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs">
            <a
              href={`/api/cohort/${cohortSlug}/member/${member?.id}/export`}
              download
              title={t('cboView.exportHint', { defaultValue: 'Download everything we have about this org' }) as string}
              data-testid="cbo-drawer-export"
            >
              <Download className="h-3.5 w-3.5" />{t('cboView.export', { defaultValue: 'Export' })}
            </a>
          </Button>
          {/* The profile — everything the organisation has shared so far, laid
              out for a person: printed for a convening, carried on a visit,
              handed to the organisation (shared/org-profile.ts). */}
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs">
            <a
              href={`/api/cohort/${cohortSlug}/member/${member?.id}/profile/print`}
              target="_blank"
              rel="noreferrer"
              title={t('cboView.profileHint', { defaultValue: 'A print-ready page with everything this organisation has shared so far' }) as string}
              data-testid="cbo-drawer-profile"
            >
              <FileText className="h-3.5 w-3.5" />{t('cboView.profile', { defaultValue: 'Profile (PDF)' })}
            </a>
          </Button>
          {/* A test copy, as the organisation stood when Encontro 2 closed —
              so the next encontro can be tried on a real record without
              touching the original (docs/test-orgs.md). */}
          {onCloneTest && member && (
            <Button
              variant="outline" size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs"
              onClick={() => onCloneTest(member)}
              title={t('cboView.cloneTestHint', {
                defaultValue: 'Create a test copy of this organisation as it stood at the end of Encontro 2. The original is not touched.',
              }) as string}
              data-testid="cbo-drawer-clone-test"
            >
              <CopyPlus className="h-3.5 w-3.5" />{t('cboView.cloneTest', { defaultValue: 'Test copy' })}
            </Button>
          )}
          {memberActions && member && (
            <>
              {/* In or out of the synergy analysis — reversible, never destructive. */}
              <Button
                variant="outline" size="sm"
                className={`h-8 gap-1.5 px-2.5 text-xs ${memberActions.inPortfolio ? '' : 'border-amber-300 text-amber-800 dark:border-amber-900 dark:text-amber-300'}`}
                onClick={memberActions.onTogglePortfolio}
                title={t('orchestrator.portfolioExclude.tooltip', { defaultValue: 'Keep this organization out of the synergy report (it stays on the board)' }) as string}
                data-testid={`button-portfolio-exclude-${member.id}`}
              >
                {memberActions.inPortfolio ? <Share2 className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {memberActions.inPortfolio
                  ? t('orchestrator.portfolioExclude.off', { defaultValue: 'No portfólio' })
                  : t('orchestrator.portfolioExclude.on', { defaultValue: 'Fora do portfólio' })}
              </Button>
              {memberActions.onLeaveNetwork && (
                <Button
                  variant="outline" size="sm"
                  className="h-8 gap-1.5 px-2.5 text-xs"
                  onClick={memberActions.onLeaveNetwork}
                  title={t('orchestrator.leftNetwork.tooltip', { defaultValue: 'A organização saiu da rede: sai do quadro, das contagens e do pré-portfólio. O registro fica guardado e pode ser restaurado.' }) as string}
                  data-testid={`button-left-network-${member.id}`}
                >
                  <UserMinus className="h-3.5 w-3.5" />{t('orchestrator.leftNetwork.chip', { defaultValue: 'Saiu da rede' })}
                </Button>
              )}
              <Button
                variant="outline" size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs hover:bg-destructive/10 hover:text-destructive"
                onClick={memberActions.onReset}
                title={t('orchestrator.memberReset.chipTooltip', { defaultValue: 'Reset this organization’s profile from scratch' }) as string}
                data-testid={`button-cbo-reset-${member.id}`}
              >
                <RotateCcw className="h-3.5 w-3.5" />{t('orchestrator.memberReset.chip', { defaultValue: 'Reset' })}
              </Button>
              <Button
                variant="outline" size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs hover:bg-destructive/10 hover:text-destructive"
                onClick={memberActions.onRemove}
                title={t('orchestrator.memberRemove.chipTooltip', { defaultValue: 'Remove this organization from the cohort' }) as string}
                data-testid={`button-cbo-remove-${member.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />{t('orchestrator.memberRemove.chip', { defaultValue: 'Remove' })}
              </Button>
            </>
          )}
          {/* Staging only: a model plays this organisation from its own record
              through the real Encontro 3 (server/services/e3Simulator.ts). */}
          {(onSimulateE3 || simulating) && member && (
            <Button
              variant="outline" size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs border-violet-300 text-violet-900 dark:border-violet-800 dark:text-violet-200"
              disabled={simulating}
              onClick={() => onSimulateE3?.(member)}
              title={t('orchestrator.simulation.startHint', {
                defaultValue: 'A model plays each organisation from its own record, through the real Encontro 3, up to the comparison. The session is marked as simulated.',
              }) as string}
              data-testid="cbo-drawer-simulate-e3"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              {simulating
                ? t('orchestrator.simulation.running', { defaultValue: 'Simulating…' })
                : t('cboView.simulateE3', { defaultValue: 'Simulate Encontro 3' })}
            </Button>
          )}
        </div>

        {member && cohortSlug && skipStep && (
          <div className="flex-1 min-h-0 overflow-auto space-y-3 px-1 pb-4" data-testid="skip-e4-view">
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={skipStep === 'answers' ? leaveSkip : () => setSkipStep(null)} data-testid="skip-e4-back"
                className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" />{t('cboView.skipBack', { defaultValue: 'Voltar às abas' })}
              </button>
              <span className="text-[11px] text-muted-foreground" data-testid="skip-e4-steps">
                {t('cboView.skipSteps', { defaultValue: 'Passo {{n}} de 2', n: skipStep === 'confirm' ? 1 : 2 })}
              </span>
            </div>
            {skipStep === 'confirm' ? (
              <SkipToE4 cohortSlug={cohortSlug} memberId={member.id} phase={member.encontro ?? 1} prompt
                onDone={() => { setSkipStep('answers'); setMovedTo4(true); onRecordChanged?.(); }} />
            ) : (
              <>
                <p className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[12.5px] text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" data-testid="skip-e4-done">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {t('cboView.skipDone', { defaultValue: 'Encontro 4 aberto para {{org}}.', org: member.orgName })}
                </p>
                <E4AnswersPanel cohortSlug={cohortSlug} memberId={member.id} reloadKey={reloadKey} mode="skip"
                  onSaved={() => onRecordChanged?.()} onLeave={leaveSkip} />
              </>
            )}
          </div>
        )}

        {member && cohortSlug && !skipStep && (
          <Tabs value={tab} onValueChange={v => setTab(v as CboDrawerTab)} className="flex-1 min-h-0 flex flex-col">
            {/* Five labels in five equal columns overlapped ("Arquivos Conversa")
                as soon as one was longer than its fifth. Each tab now takes the
                width its word needs, and the row scrolls sideways on a narrow
                phone rather than colliding. */}
            <TabsList className="flex h-9 w-full justify-start gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsTrigger value="convite" data-testid="cbo-tab-convite" className={TAB}>{t('cboView.tabInvite', { defaultValue: 'Invite' })}</TabsTrigger>
              <TabsTrigger value="arquivos" data-testid="cbo-tab-arquivos" className={TAB}>{t('cboView.tabFiles', { defaultValue: 'Files' })}</TabsTrigger>
              <TabsTrigger value="conversa" data-testid="cbo-tab-conversa" className={TAB}>{t('cboView.tabChat', { defaultValue: 'Chat' })}</TabsTrigger>
              <TabsTrigger value="perfil" data-testid="cbo-tab-perfil" className={TAB}>{t('cboView.tabProfile', { defaultValue: 'Profile' })}</TabsTrigger>
              <TabsTrigger value="visita" data-testid="cbo-tab-visita" className={TAB}>{t('cboView.tabVisit', { defaultValue: 'Technical visit' })}</TabsTrigger>
              <TabsTrigger value="documentos" data-testid="cbo-tab-documentos" className={TAB}>{t('cboView.tabDocuments', { defaultValue: 'Documents' })}</TabsTrigger>
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
            <TabsContent value="visita" className="flex-1 min-h-0 overflow-auto mt-2">
              <VisitPanel cohortSlug={cohortSlug} memberId={member.id} reloadKey={reloadKey} onFilesChanged={() => setFilesTick(n => n + 1)} onRecordChanged={onRecordChanged} onSkipped={() => { setSkipStep('answers'); setMovedTo4(true); }} />
            </TabsContent>
            {/* ⚠️ What the ORGANISATION took away. Until now nobody on the
                coordination side could read it: the portfolio exists to carry
                these forward — pooling the studies, taking the recurring-money
                gap to the prefeitura — and the only way to see one was to be
                the org. Rebuilt from live state on open, so this is the same
                document they hold, not a copy of it. */}
            <TabsContent value="documentos" className="flex-1 min-h-0 overflow-auto mt-2">
              <div className="space-y-2 px-1">
                {/* Encontro 4's one page — computed from the record, reviewed
                    (optionally) and adjusted here. */}
                {/* Encontro 4's questions the coordination can answer for them — any time, all optional. */}
                <E4AnswersPanel cohortSlug={cohortSlug} memberId={member.id} reloadKey={reloadKey} mode="documents"
                  onSaved={() => { setReloadKey(k => k + 1); onRecordChanged?.(); }} />
                <PrenotePanel cohortSlug={cohortSlug} memberId={member.id} reloadKey={reloadKey} />
                <p className="text-[12px] leading-snug text-muted-foreground">
                  {t('cboView.documentsHint', {
                    defaultValue: 'Os documentos do Encontro 3 — a comparação e uma página por cenário. Abrem numa aba nova, exatamente como a organização os vê.',
                  })}
                </p>
                {[
                  { kind: 'comparacao', label: t('cboView.docComparison', { defaultValue: 'Comparação das soluções testadas' }), hint: t('cboView.docComparisonHint', { defaultValue: 'O que cada solução testada pede, faz e custa — base para a conversa de portfólio' }) },
                  ...(member.w3?.testedIds ?? []).map((id: string) => ({
                    kind: `cenario?solution=${id}`,
                    label: t('cboView.docScenario', { defaultValue: 'Cenário: {{name}}', name: getSolution(id)?.pt.label ?? id }),
                    hint: t('cboView.docScenarioHint', { defaultValue: 'Uma página só — pra levar à mesa do portfólio' }),
                  })),
                  // ⚠️ Encontro 3 ends at the comparison (#553). The Resumo and the
                  // hoja de ruta are built from who builds / why here / how the
                  // place is today — project detailing, Encontro 4's — so for an
                  // organisation that closed at the comparison they print mostly
                  // "ainda não definido". Offered beside the comparison as equals,
                  // they read as the org's E3 result (22 Sept audit). A record that
                  // ran the old tail keeps them as before.
                  ...(member.w3?.detailed
                    ? [
                        { kind: 'nota', label: t('cboView.docConceptNote', { defaultValue: 'Resumo do projeto' }), hint: t('cboView.docConceptNoteHint', { defaultValue: 'Para a coordenação — base para preparar uma proposta' }) },
                        { kind: 'rota', label: t('cboView.docRoadmap', { defaultValue: 'Hoja de ruta' }), hint: t('cboView.docRoadmapHint', { defaultValue: 'O caminho, com responsáveis' }) },
                      ]
                    : []),
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
                {!member.w3?.detailed && (
                  <div className="pt-2" data-testid="cbo-docs-e4">
                    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('cboView.docE4Heading', { defaultValue: 'Para o Encontro 4' })}
                    </p>
                    <p className="mb-1.5 text-[11.5px] leading-snug text-muted-foreground">
                      {t('cboView.docE4Hint', { defaultValue: 'O Encontro 3 termina na comparação. Estes dois são montados com o detalhamento do projeto (quem constrói, por que aqui, como o lugar está hoje) e ficam quase vazios até lá.' })}
                    </p>
                    {[
                      { kind: 'nota', label: t('cboView.docConceptNote', { defaultValue: 'Resumo do projeto' }) },
                      { kind: 'rota', label: t('cboView.docRoadmap', { defaultValue: 'Hoja de ruta' }) },
                    ].map(d => (
                      <a
                        key={d.kind}
                        href={`/api/cohort/${cohortSlug}/member/${member.id}/document/${d.kind}`}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`cbo-doc-${d.kind}`}
                        className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-dashed border-border/70 px-3 py-2 text-muted-foreground hover:bg-muted/50"
                      >
                        <span className="text-[12.5px]">{d.label}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
