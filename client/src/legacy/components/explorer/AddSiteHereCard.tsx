import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MapPin, Plus, X } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import { becauseFor, HIGH_LEVEL, type HazardReading } from '@shared/solution-because';
import type { ExplorerSiteReading } from '@shared/explorer-site';

// ============================================================================
// "ADD A SITE HERE" — the card that opens where the map was clicked
// ============================================================================
// What the official data says at the point (flood and landslide from SGB, heat
// from the climate plan — the words and sources are `hazardAtPin`'s, untouched),
// the solutions that answer what is high there, each group under its because
// line, and a name + size to save it with. Nothing here scores anything.
// ============================================================================

export interface AddSiteIntervention {
  id: string;
  category: string;
  name: string;
  description: string;
}

export type ExplorerLang = 'pt' | 'en';
export const explorerLang = (language: string | undefined): ExplorerLang => (language?.toLowerCase().startsWith('pt') ? 'pt' : 'en');

const LEVEL_COLOR: Record<number, string> = { 4: '#b91c1c', 3: '#ea580c', 2: '#ca8a04', 1: '#71717a', 0: '#a1a1aa' };
const SHOWN_PER_HAZARD = 3;

/** One official reading: "Heat · very high · Climate plan, 2050" and its note. */
export function HazardReadingRows({ readings, lang, dense }: { readings: HazardReading[]; lang: ExplorerLang; dense?: boolean }) {
  const { t } = useTranslation();
  return (
    <ul className={dense ? 'space-y-1' : 'space-y-1.5'} data-testid="site-readings">
      {readings.map(r => {
        const note = lang === 'pt' ? r.notePt : r.noteEn;
        return (
          <li key={r.hazard} className="flex items-start gap-2 text-[13px] leading-snug" data-hazard={r.hazard} data-level={r.level}>
            <i className="mt-[5px] h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: LEVEL_COLOR[r.level] ?? LEVEL_COLOR[0] }} />
            <div className="min-w-0">
              <span className="font-medium">{t(`siteExplorer.addSite.hazard.${r.hazard}`)}</span>
              <span className={r.level >= HIGH_LEVEL ? 'font-semibold' : ''} style={{ color: r.level >= HIGH_LEVEL ? LEVEL_COLOR[r.level] : undefined }}>
                {' · '}{lang === 'pt' ? r.pt : r.en}
              </span>
              <span className="text-muted-foreground">{' · '}{t(`siteExplorer.addSite.source.${r.source ?? 'PLAC'}`)}</span>
              {note && !dense && <div className="text-[11.5px] text-muted-foreground">{note}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface Props {
  reading: ExplorerSiteReading | null;
  loading: boolean;
  failed: boolean;
  interventions: AddSiteIntervention[];
  onCancel: () => void;
  onAdd: (choice: { name: string; areaHa: number; interventionId: string }) => void;
}

export function AddSiteHereCard({ reading, loading, failed, interventions, onCancel, onAdd }: Props) {
  const { t, i18n } = useTranslation();
  const lang = explorerLang(i18n.language);
  const byId = useMemo(() => new Map(interventions.map(i => [i.id, i])), [interventions]);
  const [name, setName] = useState('');
  const [area, setArea] = useState('1');
  const [chosen, setChosen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const high = reading?.solutions.high ?? [];
  const firstId = reading?.options[0]?.interventionIds.find(id => byId.has(id)) ?? null;
  useEffect(() => {
    if (!reading) return;
    setName(reading.suggestedName[lang]);
    setArea('1');
    setChosen(firstId);
    setExpanded({});
    // A new point, a new card. `lang` and `firstId` follow from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reading]);

  const nameOf = (i: AddSiteIntervention) => t(`siteExplorer.interventionNames.${i.id}`, { defaultValue: i.name });
  const chosenIntervention = chosen ? byId.get(chosen) : undefined;
  const because = reading && chosenIntervention ? becauseFor(reading.readings, { category: chosenIntervention.category }) : null;
  const areaHa = Number(String(area).replace(',', '.'));
  const canAdd = !!reading?.zone && !!chosenIntervention && name.trim().length > 0 && Number.isFinite(areaHa) && areaHa > 0;

  const option = (i: AddSiteIntervention) => (
    <label
      key={i.id}
      className={`flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 transition-colors ${chosen === i.id ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'}`}
    >
      <input type="radio" name="add-site-solution" className="mt-1 accent-[hsl(var(--primary))]" checked={chosen === i.id} onChange={() => setChosen(i.id)} data-testid={`add-site-option-${i.id}`} />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium leading-tight">{nameOf(i)}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground" title={i.description}>{i.description}</span>
      </span>
    </label>
  );

  return (
    <div className="w-[348px] overflow-hidden rounded-lg border bg-background shadow-xl" data-testid="add-site-card">
      <div className="flex items-start justify-between gap-2 border-b bg-muted/50 px-3 py-2">
        <div className="flex min-w-0 items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold" data-testid="add-site-bairro">
              {loading ? t('siteExplorer.addSite.reading') : reading?.inCity ? (reading.bairro ?? reading.zone?.name ?? t('siteExplorer.addSite.title')) : t('siteExplorer.addSite.title')}
            </div>
            {reading?.inCity && reading.nearest && (
              <div className="truncate text-xs text-muted-foreground">{reading.nearest.name}</div>
            )}
          </div>
        </div>
        <button type="button" onClick={onCancel} aria-label={t('common.close', { defaultValue: 'Close' })} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : failed || !reading ? (
        <p className="px-3 py-4 text-[13px] text-muted-foreground">{t('siteExplorer.addSite.failed')}</p>
      ) : !reading.inCity ? (
        <p className="px-3 py-4 text-[13px] text-muted-foreground" data-testid="add-site-outside">{t('siteExplorer.addSite.outside')}</p>
      ) : (
        <div className="max-h-[min(560px,calc(100vh-260px))] overflow-y-auto">
          <div className="px-3 pt-2.5">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('siteExplorer.addSite.officialHere')}</div>
            <HazardReadingRows readings={reading.readings} lang={lang} />
          </div>

          <div className="px-3 pt-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('siteExplorer.addSite.whatFits')}</div>
            {high.length === 0 ? (
              <p className="text-[13px] leading-snug" data-testid="add-site-none">{reading.solutions.none?.[lang]}</p>
            ) : (
              <div className="space-y-2.5">
                {high.map(h => {
                  const ids = reading.options.find(o => o.hazard === h.hazard)?.interventionIds ?? [];
                  const all = ids.map(id => byId.get(id)).filter((i): i is AddSiteIntervention => !!i);
                  const open = expanded[h.hazard] || all.slice(SHOWN_PER_HAZARD).some(i => i.id === chosen);
                  const shown = open ? all : all.slice(0, SHOWN_PER_HAZARD);
                  return (
                    <div key={h.hazard} data-testid={`add-site-fits-${h.hazard}`}>
                      <p className="mb-1 text-[13px] font-medium leading-snug" data-testid="because-line">{h.line[lang]}</p>
                      <div className="space-y-0.5">{shown.map(option)}</div>
                      {!open && all.length > SHOWN_PER_HAZARD && (
                        <button type="button" className="mt-0.5 px-2 text-xs text-primary hover:underline" onClick={() => setExpanded(e => ({ ...e, [h.hazard]: true }))}>
                          {t('siteExplorer.addSite.more', { count: all.length - SHOWN_PER_HAZARD })}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {high.length > 0 && (
            <div className="mt-3 space-y-2 border-t bg-muted/30 px-3 py-2.5">
              {!reading.zone && <p className="text-xs text-destructive">{t('siteExplorer.addSite.noZone')}</p>}
              <div className="flex gap-2">
                <label className="min-w-0 flex-1 text-[11px] font-medium text-muted-foreground">
                  {t('siteExplorer.addSite.name')}
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    data-testid="add-site-name"
                    className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-[13px] font-normal text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
                <label className="w-[72px] text-[11px] font-medium text-muted-foreground">
                  {t('siteExplorer.addSite.area')}
                  <input
                    value={area}
                    onChange={e => setArea(e.target.value)}
                    inputMode="decimal"
                    data-testid="add-site-area"
                    className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-[13px] font-normal text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </label>
              </div>
              {because && <p className="text-xs leading-snug text-muted-foreground" data-testid="add-site-because">{because.line[lang]}</p>}
              <Button
                size="sm"
                className="h-auto min-h-9 w-full whitespace-normal py-1.5 text-left leading-tight"
                disabled={!canAdd}
                data-testid="add-site-confirm"
                onClick={() => canAdd && onAdd({ name: name.trim(), areaHa, interventionId: chosenIntervention!.id })}
              >
                <Plus className="mr-1 h-4 w-4 flex-shrink-0" />
                {chosenIntervention ? t('siteExplorer.addSite.addNamed', { solution: nameOf(chosenIntervention) }) : t('siteExplorer.addSite.add')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
