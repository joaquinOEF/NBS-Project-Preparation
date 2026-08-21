// E1 — "Quem somos" 4-card layout for the right-rail doc panel.
//
// Per knowledge/runs/2026-05-15-encontros-curriculum/E1-quem-somos/spec.md, the
// flat field table is replaced by 4 grouped cards so the CBO sees their
// profile take shape thematically rather than as a flat survey.
//
// Pulls named fields from state.sections.org_profile + path from the cohort
// member. Any field the agent writes that isn't in our 4 groups falls into
// the "Outros" card so nothing is hidden.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/core/components/ui/card';
import { AlertTriangle, Lightbulb, Compass, Target, Pencil } from 'lucide-react';
import type { CboSectionState, CboGapEntry } from '@shared/cbo-schema';
import { isInternalCboField } from '@shared/cbo-schema';
import {
  cboFieldLabel,
  orgProfileDisplayValue,
  cboFieldOptionLabels,
  isMultiValueCboField,
} from '@shared/cbo-field-catalog';

type GroupKey = 'quem-somos' | 'equipe' | 'historico' | 'caminho' | 'outros';

const FIELD_GROUPS: Record<Exclude<GroupKey, 'outros'>, string[]> = {
  // Identity — what + who (questionnaire v2 added main_activities + has_cnpj).
  // bairro_of_operation and groups_served live here rather than under Caminho:
  // where an org works and who it serves are part of who they ARE, not of the
  // triage answer about which path they take through the workshops (Ana, W2).
  'quem-somos': ['org_name', 'contact_name', 'contact_role', 'mission_summary', 'main_activities', 'has_cnpj', 'legal_form', 'year_founded', 'bairro_of_operation', 'groups_served'],
  // Team — size + composition
  equipe: ['team_size', 'paid_vs_volunteer'],
  // History — funding track record + NBS experience (prior_project_scale is
  // the pre-v2 legacy field; old sessions still carry it, so it stays listed)
  historico: ['funding_history', 'funded_project_count', 'biggest_project_budget', 'prior_project_scale', 'nbs_experience', 'nbs_experience_detail', 'proud_moment'],
  // Path — the triage answer only. It renders from the pathChip footer, so the
  // card carries no field rows of its own.
  caminho: [],
};

const ALL_KNOWN_FIELDS = new Set<string>([
  ...FIELD_GROUPS['quem-somos'],
  ...FIELD_GROUPS.equipe,
  ...FIELD_GROUPS.historico,
  ...FIELD_GROUPS.caminho,
]);


// Closed-list fields are edited by PICKING, not by typing. Ana's W2 note: the
// profile tab accepted any prose even for banded/closed answers, so the
// orchestrator lost the ability to compare orgs against standard categories.
//
// Mirrors EditableField's click-to-edit shape on purpose — this panel is a
// DOCUMENT, so at rest every row reads as text and the controls only appear
// once you choose to edit. Free-text fields keep EditableField untouched.
//
// The server rejects off-list values on /api/cbo/:id/edit too — this is the
// affordance, that is the guard.
function EnumField({
  sectionId,
  field,
  value,
  userEdited,
  lang,
  onSave,
}: {
  sectionId: string;
  field: string;
  value: string;
  userEdited?: boolean;
  lang: 'pt' | 'en';
  onSave: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const options = cboFieldOptionLabels(sectionId, field, lang);
  const multi = isMultiValueCboField(sectionId, field);
  const selected = new Set(value.split(/\s*[,;·|]\s*/).map(s => s.trim()).filter(Boolean));

  if (!editing) {
    return (
      <div className="group flex items-start gap-1 min-w-0">
        <span className="flex-1 min-w-0">{value}</span>
        <button
          onClick={e => { e.stopPropagation(); setEditing(true); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-muted"
          title={t('cbo.edit', { defaultValue: 'Editar' })}
          data-testid={`cbo-enum-edit-${field}`}
        >
          <Pencil className="w-3 h-3 text-muted-foreground" />
        </button>
        {userEdited && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5" />}
      </div>
    );
  }

  if (multi) {
    const toggle = (label: string) => {
      const next = new Set(selected);
      if (next.has(label)) next.delete(label); else next.add(label);
      onSave(options.filter(o => next.has(o)).join(', '));
    };
    return (
      <div className="space-y-1" onClick={e => e.stopPropagation()}>
        <div className="flex flex-wrap gap-1" data-testid={`cbo-enum-multi-${field}`}>
          {options.map(o => (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              aria-pressed={selected.has(o)}
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                selected.has(o)
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            onClick={() => setEditing(false)}
            className="text-[10px] px-2 py-0.5 rounded text-muted-foreground hover:bg-muted"
          >
            {t('cbo.done', { defaultValue: 'Pronto' })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <select
      autoFocus
      value={options.includes(value) ? value : ''}
      onChange={e => { onSave(e.target.value); setEditing(false); }}
      onBlur={() => setEditing(false)}
      data-testid={`cbo-enum-${field}`}
      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
    >
      {/* A legacy or agent-written value no longer on the list stays selected
          rather than silently reading as empty. */}
      {!options.includes(value) && <option value="">{value || '\u2014'}</option>}
      {options.map(o => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

export function E1Cards({
  section,
  gaps,
  path,
  onFieldEdit,
  EditableField,
}: {
  section: CboSectionState;
  gaps: CboGapEntry[];
  /** Project-readiness triage answer captured at E1 — drives the Caminho chip. */
  path: 'has-project' | 'has-idea' | 'needs-help' | null;
  onFieldEdit: (sectionId: string, field: string, value: string) => void;
  /** Injected from the parent — same EditableField used elsewhere on this page,
   *  so we don't duplicate the markdown + textarea behavior. */
  EditableField: React.ComponentType<{ value: string; userEdited?: boolean; onSave: (v: string) => void }>;
}) {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language?.startsWith('pt');
  const fields = section.fields;

  // Anything the agent wrote that isn't in our 4 groups → Outros so it's
  // visible. (Defensive: future agent versions may add fields we don't yet
  // know how to bucket.)
  // isInternalCboField for symmetry with the flat table: this bucket catches
  // ANY unknown key, so a future `_`-prefixed org_profile field would render
  // its machinery here. Latent today (writeE2Fields only touches
  // intervention_site) — but this is the W1/W2 layout, so it is the one that
  // would show it.
  const otrosKeys = Object.keys(fields).filter(k => !ALL_KNOWN_FIELDS.has(k) && !isInternalCboField(k));

  const renderGroup = (key: Exclude<GroupKey, 'outros'>, title: string, icon?: React.ReactNode, footer?: React.ReactNode) => {
    const keys = FIELD_GROUPS[key].filter(k => fields[k]);
    if (keys.length === 0 && !footer) return null;
    const hasGroupGap = gaps.some(g => g.sectionId === section.id && FIELD_GROUPS[key].includes(g.field));
    return (
      <Card className={`${hasGroupGap ? 'border-orange-300' : ''} transition-all`}>
        <CardHeader className="py-2.5 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              {icon}
              <span>{title}</span>
            </CardTitle>
            {hasGroupGap && <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />}
          </div>
        </CardHeader>
        {(keys.length > 0 || footer) && (
          <CardContent className="pt-0 px-4 pb-4 space-y-2">
            {keys.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {keys.map(k => {
                      const v = fields[k];
                      return (
                        <tr key={k} className="border-b last:border-b-0">
                          <td className="px-3 py-1.5 text-xs text-muted-foreground w-[150px] font-medium">
                            {t(`cbo.fields.${k}`, cboFieldLabel(k, isPt ? 'pt' : 'en'))}
                          </td>
                          <td className="px-3 py-1.5 text-sm">
                            {cboFieldOptionLabels(section.id, k, isPt ? 'pt' : 'en').length > 0 ? (
                              <EnumField
                                sectionId={section.id}
                                field={k}
                                value={orgProfileDisplayValue(k, String(v.value || ''), isPt ? 'pt' : 'en')}
                                userEdited={v.userEdited}
                                lang={isPt ? 'pt' : 'en'}
                                onSave={(newVal) => onFieldEdit(section.id, k, newVal)}
                              />
                            ) : (
                              <EditableField
                                value={orgProfileDisplayValue(k, String(v.value || ''), isPt ? 'pt' : 'en')}
                                userEdited={v.userEdited}
                                onSave={(newVal) => onFieldEdit(section.id, k, newVal)}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {footer}
          </CardContent>
        )}
      </Card>
    );
  };

  // Caminho card has a special pre-table chip showing the triage answer
  const pathChip = path ? (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40">
      {path === 'has-project'
        ? <Target className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
        : path === 'has-idea'
          ? <Lightbulb className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          : <Compass className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />}
      <span className="text-sm text-emerald-900 dark:text-emerald-200 font-medium">
        {path === 'has-project'
          ? (isPt ? 'Já tem um projeto NBS definido' : 'Has a selected NBS project')
          : path === 'has-idea'
            ? (isPt ? 'Já tem uma ideia de projeto NBS' : 'Has an NBS project idea')
            : (isPt ? 'Quer descobrir uma ideia de projeto' : 'Wants to discover a project idea')}
      </span>
    </div>
  ) : (
    <div className="text-xs text-muted-foreground italic px-3 py-2">
      {isPt ? 'Caminho ainda não escolhido' : 'Path not yet chosen'}
    </div>
  );

  const renderOutros = () => {
    if (otrosKeys.length === 0) return null;
    return (
      <Card>
        <CardHeader className="py-2.5 px-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {isPt ? 'Outros' : 'Other'}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-4 pb-4">
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {otrosKeys.map(k => {
                  const v = fields[k];
                  return (
                    <tr key={k} className="border-b last:border-b-0">
                      <td className="px-3 py-1.5 text-xs text-muted-foreground w-[150px] font-medium">
                        {t(`cbo.fields.${k}`, cboFieldLabel(k, isPt ? 'pt' : 'en'))}
                      </td>
                      <td className="px-3 py-1.5 text-sm">
                        <EditableField
                          value={orgProfileDisplayValue(k, String(v.value || ''), isPt ? 'pt' : 'en')}
                          userEdited={v.userEdited}
                          onSave={(newVal) => onFieldEdit(section.id, k, newVal)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-2">
      {renderGroup('quem-somos', isPt ? 'Quem somos' : 'Who we are')}
      {renderGroup('equipe', isPt ? 'Equipe' : 'Team')}
      {renderGroup('historico', isPt ? 'Histórico' : 'History')}
      {renderGroup('caminho', isPt ? 'Caminho' : 'Path', undefined, pathChip)}
      {renderOutros()}
    </div>
  );
}
