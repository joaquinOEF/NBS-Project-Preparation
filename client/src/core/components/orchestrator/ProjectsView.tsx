// The Projetos view of the orchestrator — what the coordination works with
// from Encontro 3 onwards. A project is a group of organisations with one
// shared conversation and one link (docs/projects.md).
//
// Empty state first: the cohort arrives here with organisations and no
// projects, and the page has to say what a project is and offer the one
// action. The synergy report, when it exists, offers its programme lines as
// starting points — a line is a title and a set of organisations, which is
// exactly what a project is made of.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, ExternalLink, FileText, Link as LinkIcon, MessageCircle, Plus, Sparkles, Trash2, Users } from 'lucide-react';
import type { CohortMember, CohortProject } from '@shared/cohort-schema';
import { Button } from '@/core/components/ui/button';
import { Card, CardContent } from '@/core/components/ui/card';

export function projectLinkUrl(p: { capabilityToken: string }): string {
  return `${window.location.origin}/cbo-profile?p=${p.capabilityToken}`;
}

type SynergyLine = { namePt?: string; nameEn?: string; orgNames?: string[]; rationalePt?: string; rationaleEn?: string };

export function ProjectsView({
  projects, members, cohortId, onCreate, onShare, onArchive, onDelete,
}: {
  projects: CohortProject[];
  members: CohortMember[];
  cohortId: string | null;
  onCreate: (initial?: { title?: string; memberIds?: string[] } | null) => void;
  onShare: (p: CohortProject) => void;
  onArchive: (p: CohortProject, archived: boolean) => void;
  onDelete: (p: CohortProject) => void;
}) {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language?.startsWith('pt');
  const byId = new Map(members.map(m => [m.id, m]));
  const byName = new Map(members.map(m => [m.orgName.trim().toLowerCase(), m]));
  const [showArchived, setShowArchived] = useState(false);

  // The synergy report's programme lines, as suggestions. A missing report is
  // a normal state — the panel simply has no suggestions.
  const [lines, setLines] = useState<SynergyLine[]>([]);
  const load = useCallback(async () => {
    if (!cohortId) return;
    try {
      const r = await fetch(`/api/cohort/${cohortId}/synergies`, { credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json();
      setLines(Array.isArray(data?.report?.narrative?.lines) ? data.report.narrative.lines : []);
    } catch { /* no report yet */ }
  }, [cohortId]);
  useEffect(() => { void load(); }, [load]);

  const live = projects.filter(p => !p.archivedAt);
  const archived = projects.filter(p => !!p.archivedAt);
  const shown = showArchived ? projects : live;

  // A suggestion whose organisations are already a project is not repeated.
  const taken = new Set(live.map(p => [...p.memberIds].sort().join('|')));
  const suggestions = lines
    .map(l => {
      const ids = (l.orgNames ?? []).map(n => byName.get(n.trim().toLowerCase())?.id).filter((x): x is string => !!x);
      return { title: (isPt ? l.namePt : l.nameEn ?? l.namePt) ?? '', ids, why: isPt ? l.rationalePt : (l.rationaleEn ?? l.rationalePt), orgNames: l.orgNames ?? [] };
    })
    .filter(sg => sg.title && sg.ids.length >= 1 && !taken.has([...sg.ids].sort().join('|')));

  return (
    <div data-testid="projects-view">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="max-w-[64ch] text-[13px] text-muted-foreground">
            {t('orchestrator.projects.lede', {
              defaultValue: 'From Encontro 3 on, the work is by project: a group of organisations, one shared conversation, one link. The conversation opens on everything each organisation already told us.',
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {archived.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowArchived(v => !v)} data-testid="button-toggle-archived">
              {showArchived
                ? t('orchestrator.projects.hideArchived', { defaultValue: 'Hide archived' })
                : t('orchestrator.projects.showArchived', { defaultValue: 'Show archived ({{n}})', n: archived.length })}
            </Button>
          )}
          <Button size="sm" onClick={() => onCreate(null)} data-testid="button-create-project" disabled={members.length === 0}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {t('orchestrator.projects.create', { defaultValue: 'Create project' })}
          </Button>
        </div>
      </div>

      {shown.length === 0 && (
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

      {suggestions.length > 0 && (
        <div className="mb-8" data-testid="project-suggestions">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
            <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('orchestrator.projects.suggestionsTitle', { defaultValue: 'From the synergy report' })}
            </h3>
          </div>
          <p className="mb-3 max-w-[64ch] text-[12.5px] text-muted-foreground">
            {t('orchestrator.projects.suggestionsLede', {
              defaultValue: 'Programme lines the synergy report proposed. Each one is a name and a set of organisations — the shape of a project. They are hypotheses; creating one does not commit anybody.',
            })}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {suggestions.map((sg, i) => (
              <div key={i} className="flex items-start justify-between gap-3 rounded-lg border bg-card px-3.5 py-3" data-testid="project-suggestion">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold leading-tight">{sg.title}</div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">{sg.orgNames.join(' · ')}</div>
                  {sg.why && <p className="mt-1 text-[12px] leading-snug text-muted-foreground line-clamp-2">{sg.why}</p>}
                </div>
                <Button
                  size="sm" variant="outline" className="h-7 shrink-0 px-2.5 text-[12px]"
                  onClick={() => onCreate({ title: sg.title, memberIds: sg.ids })}
                  data-testid="button-suggestion-create"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {t('orchestrator.projects.createFromLine', { defaultValue: 'Create project' })}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
