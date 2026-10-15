// The Projetos view of the orchestrator — what the coordination works with
// from Encontro 3 onwards. A project is a group of organisations with one
// shared conversation and one link (docs/projects.md).
//
// Empty state first: the cohort arrives here with organisations and no
// projects, and the page has to say what a project is and offer the one
// action. The synergy report, when it exists, offers its programme lines as
// starting points — a line is a title and a set of organisations, which is
// exactly what a project is made of.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, ExternalLink, FileText, Link as LinkIcon, MessageCircle, Plus, Trash2, Users } from 'lucide-react';
import type { CohortMember, CohortProject } from '@shared/cohort-schema';
import { Button } from '@/core/components/ui/button';
import { Card, CardContent } from '@/core/components/ui/card';
import { PreportfolioBoard } from './PreportfolioBoard';

export function projectLinkUrl(p: { capabilityToken: string }): string {
  return `${window.location.origin}/cbo-profile?p=${p.capabilityToken}`;
}


export function ProjectsView({
  projects, members, cohortId, cohortSlug, onCreate, onShare, onArchive, onDelete, onRefresh,
}: {
  projects: CohortProject[];
  members: CohortMember[];
  cohortId: string | null;
  /** The pre-portfolio board's routes are keyed by the coordinator slug. */
  cohortSlug?: string | null;
  /** Reload the project list — after the pre-portfolio is confirmed. */
  onRefresh?: () => void;
  onCreate: (initial?: { title?: string; memberIds?: string[] } | null) => void;
  onShare: (p: CohortProject) => void;
  onArchive: (p: CohortProject, archived: boolean) => void;
  onDelete: (p: CohortProject) => void;
}) {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language?.startsWith('pt');
  const byId = new Map(members.map(m => [m.id, m]));
  const [showArchived, setShowArchived] = useState(false);

  const live = projects.filter(p => !p.archivedAt);
  const archived = projects.filter(p => !!p.archivedAt);
  const shown = showArchived ? projects : live;

  return (
    <div data-testid="projects-view">
      {cohortSlug && <PreportfolioBoard cohortSlug={cohortSlug} onConfirmed={onRefresh} />}
      {/* Below the board: the projects it CREATED (and any made by hand). The
          board is where projects are formed — the suggestion, the synergy
          report's lines and the hand moves all live there now. */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          {shown.length > 0 && (
            <h3 className="text-[15px] font-semibold" data-testid="projects-created-title">
              {t('orchestrator.projects.createdTitle', { defaultValue: 'Created projects' })}
            </h3>
          )}
          {shown.length > 0 && (
            <p className="max-w-[64ch] text-[12.5px] text-muted-foreground">
              {t('orchestrator.projects.lede', {
                defaultValue: 'Each project is a group of organisations with one shared conversation and one link. The conversation opens on everything each organisation already told us.',
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {archived.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowArchived(v => !v)} data-testid="button-toggle-archived">
              {showArchived
                ? t('orchestrator.projects.hideArchived', { defaultValue: 'Hide archived' })
                : t('orchestrator.projects.showArchived', { defaultValue: 'Show archived ({{n}})', n: archived.length })}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-[12px] text-muted-foreground" onClick={() => onCreate(null)} data-testid="button-create-project" disabled={members.length === 0}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            {t('orchestrator.projects.createByHand', { defaultValue: 'Project by hand' })}
          </Button>
        </div>
      </div>

      {shown.length === 0 && !cohortSlug && (
        <Card className="mb-6 border-dashed" data-testid="projects-empty">
          <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/30 dark:text-emerald-300">
              <Users className="h-6 w-6" />
            </div>
            <div className="max-w-[52ch]">
              <div className="text-base font-semibold">
                {t('orchestrator.projects.emptyTitle', { defaultValue: 'No projects yet' })}
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {members.length === 0
                  ? t('orchestrator.projects.emptyNoMembers', { defaultValue: 'Invite organisations on the Organisations view first — a project is made of them.' })
                  : t('orchestrator.projects.emptyBody', {
                      defaultValue: 'Give the project a name and choose the organisations in it. The link and the shared conversation are created with it, ready to send.',
                    })}
              </p>
            </div>
            {members.length > 0 && (
              <Button onClick={() => onCreate(null)} data-testid="button-create-project-empty">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                {t('orchestrator.projects.create', { defaultValue: 'Create project' })}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {shown.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="projects-grid">
          {shown.map(p => {
            const orgs = p.memberIds.map(id => byId.get(id)).filter((m): m is CohortMember => !!m);
            const missing = p.memberIds.length - orgs.length;
            const isArchived = !!p.archivedAt;
            return (
              <Card key={p.id} className={isArchived ? 'opacity-60' : ''} data-testid={`project-card-${p.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                        {isArchived
                          ? t('orchestrator.projects.archived', { defaultValue: 'Archived' })
                          : t('orchestrator.projects.eyebrow', { defaultValue: 'Project' })}
                      </div>
                      <h3 className="truncate text-[15px] font-semibold leading-tight" data-testid="project-title">{p.title}</h3>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                      {t('orchestrator.projects.orgCount', { defaultValue: '{{n}} orgs', n: orgs.length })}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-0.5 text-[12.5px]" data-testid="project-orgs">
                    {orgs.map(m => (
                      <li key={m.id} className="truncate">
                        {m.orgName}
                        {m.neighborhood && <span className="ml-1 text-muted-foreground">· {m.neighborhood}</span>}
                      </li>
                    ))}
                    {missing > 0 && (
                      <li className="text-muted-foreground italic">
                        {t('orchestrator.projects.missingOrgs', { defaultValue: '{{n}} organisation(s) no longer in the cohort', n: missing })}
                      </li>
                    )}
                  </ul>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="default" className="h-7 px-2.5 text-[12px]" onClick={() => onShare(p)} data-testid="button-project-link" disabled={isArchived}>
                      <LinkIcon className="mr-1 h-3 w-3" />
                      {t('orchestrator.projects.link', { defaultValue: 'Link' })}
                    </Button>
                    <a
                      href={projectLinkUrl(p)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 items-center rounded-md border px-2.5 text-[12px] font-medium hover:bg-muted"
                      data-testid="link-project-chat"
                    >
                      <MessageCircle className="mr-1 h-3 w-3" />
                      {t('orchestrator.projects.openChat', { defaultValue: 'Open chat' })}
                      <ExternalLink className="ml-1 h-2.5 w-2.5 opacity-60" />
                    </a>
                    <a
                      href={`/api/project/${p.id}/brief?lang=${isPt ? 'pt' : 'en'}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 items-center rounded-md border px-2.5 text-[12px] font-medium hover:bg-muted"
                      data-testid="link-project-brief"
                    >
                      <FileText className="mr-1 h-3 w-3" />
                      {t('orchestrator.projects.brief', { defaultValue: 'Brief (PDF)' })}
                    </a>
                    <a
                      href={`/api/project/${p.id}/note?lang=${isPt ? 'pt' : 'en'}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 items-center rounded-md border px-2.5 text-[12px] font-medium hover:bg-muted"
                      data-testid="link-project-note"
                    >
                      <FileText className="mr-1 h-3 w-3" />
                      {t('orchestrator.projects.note', { defaultValue: 'Summary (PDF)' })}
                    </a>
                    <span className="flex-1" />
                    <Button
                      size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground"
                      onClick={() => onArchive(p, !isArchived)}
                      title={isArchived
                        ? t('orchestrator.projects.unarchive', { defaultValue: 'Restore' })
                        : t('orchestrator.projects.archive', { defaultValue: 'Archive (the link stops working)' })}
                      data-testid="button-project-archive"
                    >
                      {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                      onClick={() => onDelete(p)}
                      title={t('orchestrator.projects.delete', { defaultValue: 'Delete project' })}
                      data-testid="button-project-delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

    </div>
  );
}
