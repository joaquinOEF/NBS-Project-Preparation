// RiskPriorityChips — inline chat composer for ranking the 3 climate hazards
// in order of concern. Tap-in-order pattern (per E2 spec): first tap = priority
// 1, second = 2, third = 3. Mobile-friendlier than drag-and-drop.
//
// Emits the ordered ranking back to the agent as a chat message ("Ranking:
// flood (1), heat (2), landslide (3)") which the agent parses to fill
// primary_hazard, secondary_hazard, tertiary_hazard fields.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Waves, Thermometer, Mountain, RotateCcw, Check } from 'lucide-react';

export type HazardId = 'flood' | 'heat' | 'landslide';

const HAZARDS: Array<{
  id: HazardId;
  Icon: React.ComponentType<{ className?: string }>;
  pt: { label: string; hint: string };
  en: { label: string; hint: string };
}> = [
  {
    id: 'flood',
    Icon: Waves,
    pt: { label: 'Enchente', hint: 'Inundação, chuva forte, rio subindo' },
    en: { label: 'Flood', hint: 'Flooding, heavy rain, river rising' },
  },
  {
    id: 'heat',
    Icon: Thermometer,
    pt: { label: 'Calor extremo', hint: 'Ondas de calor, falta de sombra, ilha de calor' },
    en: { label: 'Extreme heat', hint: 'Heat waves, no shade, urban heat island' },
  },
  {
    id: 'landslide',
    Icon: Mountain,
    pt: { label: 'Deslizamento', hint: 'Encostas instáveis, morros, terreno escorregando' },
    en: { label: 'Landslide', hint: 'Unstable slopes, hillsides, sliding ground' },
  },
];

export function RiskPriorityChips({
  prompt,
  minRanked = 2,
  onConfirm,
}: {
  prompt: string;
  /** How many ranks the user must assign before Confirmar enables. Default 2. */
  minRanked?: number;
  onConfirm: (ranking: HazardId[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang: 'pt' | 'en' = i18n.language?.startsWith('pt') ? 'pt' : 'en';
  const [ranking, setRanking] = useState<HazardId[]>([]);

  const tap = (id: HazardId) => {
    setRanking(prev => {
      if (prev.includes(id)) return prev; // ignore re-tap; use reset to redo
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const reset = () => setRanking([]);
  const canConfirm = ranking.length >= minRanked;

  return (
    <div className="rounded-lg border border-foreground/10 bg-card p-4 space-y-3" data-testid="risk-priority-chips">
      <p className="text-sm font-medium leading-snug">{prompt}</p>
      <p className="text-[11px] text-muted-foreground -mt-1">
        {t('cbo.priority.hint', { defaultValue: 'Toque na ordem do que mais te preocupa.' })}
      </p>

      <div className="grid grid-cols-3 gap-2">
        {HAZARDS.map(h => {
          const idx = ranking.indexOf(h.id);
          const isRanked = idx >= 0;
          const Icon = h.Icon;
          const copy = h[lang];
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => tap(h.id)}
              disabled={isRanked || ranking.length >= 3}
              className={`relative text-center p-3 rounded-lg border transition-all ${
                isRanked
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                  : ranking.length >= 3
                    ? 'border-foreground/5 bg-muted/40 opacity-50 cursor-not-allowed'
                    : 'border-foreground/15 bg-background hover:border-foreground/30 hover:bg-muted/50 cursor-pointer'
              }`}
              data-testid={`risk-chip-${h.id}`}
            >
              {isRanked && (
                <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                  {idx + 1}
                </span>
              )}
              <Icon className={`w-5 h-5 mx-auto mb-1 ${isRanked ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`} />
              <p className={`text-xs font-medium leading-tight ${isRanked ? 'text-foreground' : 'text-foreground/85'}`}>
                {copy.label}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">
                {copy.hint}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={reset}
          disabled={ranking.length === 0}
          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="risk-reset"
        >
          <RotateCcw className="w-3 h-3" />
          {t('cbo.priority.reset', { defaultValue: 'Recomeçar' })}
        </button>
        <button
          type="button"
          onClick={() => onConfirm(ranking)}
          disabled={!canConfirm}
          className={`text-sm font-medium px-4 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
            canConfirm
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
          data-testid="risk-confirm"
        >
          <Check className="w-3.5 h-3.5" />
          {t('cbo.priority.confirm', { defaultValue: 'Confirmar' })}
        </button>
      </div>
    </div>
  );
}
