// NbsTypeStrip — inline chat strip that TEACHES the kinds of nature-based
// solutions, shown as the first educational beat of E2 (before any real
// examples or the map). Read-only: there is no selection here — the user reads,
// expands "Saber mais" to learn more, and moves on. Picking a concrete type
// happens later in the flow.
//
// Source of truth: NBS_INTERVENTION_TYPES in shared/cbo-schema.ts. We
// deliberately render an emoji + hazard-colored gradient (NOT the per-type
// caseStudy photos) so the strip stays consistent and avoids the mislabeled
// type-catalog images flagged in docs/photo-curation.md.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { NBS_INTERVENTION_TYPES, getLocalizedNbsType } from '@shared/cbo-schema';

const GRADIENTS: Record<'flood' | 'heat' | 'biodiversity', string> = {
  flood: 'linear-gradient(135deg, #cffafe 0%, #67e8f9 100%)',
  heat: 'linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%)',
  biodiversity: 'linear-gradient(135deg, #d1fae5 0%, #6ee7b7 100%)',
};

// Which hazards each type primarily addresses (for the small tags) and which
// gradient to paint behind its emoji. Derived from knowledge/_interventions/*.md.
const TYPE_VISUAL: Record<string, { gradient: 'flood' | 'heat' | 'biodiversity'; hazards: Array<'flood' | 'heat'> }> = {
  'bioswales-rain-gardens': { gradient: 'flood', hazards: ['flood'] },
  'flood-parks': { gradient: 'flood', hazards: ['flood'] },
  'green-corridors': { gradient: 'biodiversity', hazards: ['heat', 'flood'] },
  'green-roofs-walls': { gradient: 'heat', hazards: ['heat', 'flood'] },
  'urban-forests': { gradient: 'biodiversity', hazards: ['heat', 'flood'] },
  'wetland-restoration': { gradient: 'flood', hazards: ['flood'] },
};

const HAZARD_LABELS = {
  pt: { flood: 'enchente', heat: 'calor' },
  en: { flood: 'flood', heat: 'heat' },
};

type NbsType = (typeof NBS_INTERVENTION_TYPES)[number];

function NbsTypeCardItem({ type, lang }: { type: NbsType; lang: 'pt' | 'en' }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const loc = getLocalizedNbsType(type, lang);
  const visual = TYPE_VISUAL[type.id] ?? { gradient: 'biodiversity' as const, hazards: [] };

  return (
    <div
      className="shrink-0 w-[240px] rounded-xl border border-foreground/10 bg-card overflow-hidden transition-all hover:border-foreground/25"
      data-testid={`type-card-${type.id}`}
    >
      <div
        className="relative h-24 w-full flex items-center justify-center"
        style={{ background: GRADIENTS[visual.gradient] }}
      >
        <span className="text-5xl" role="img" aria-hidden="true">{type.emoji}</span>
      </div>

      <div className="p-3 space-y-1.5">
        <h4 className="text-sm font-semibold leading-tight">{loc.label}</h4>

        {visual.hazards.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {visual.hazards.map(h => (
              <span
                key={h}
                className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
              >
                {HAZARD_LABELS[lang][h]}
              </span>
            ))}
          </div>
        )}

        <p className="text-xs text-foreground/85 leading-snug">{loc.description}</p>

        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 -ml-0.5 pt-0.5"
          data-testid={`type-expand-${type.id}`}
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded
            ? t('cbo.showcase.less', { defaultValue: 'Menos' })
            : t('cbo.showcase.more', { defaultValue: 'Saber mais' })}
        </button>

        {expanded && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground/70">
                {t('cbo.types.example', { defaultValue: 'Exemplo' })}:
              </span>{' '}
              {loc.example}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground/70">{loc.caseStudy.project}</span>
              {' · '}{loc.caseStudy.city}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{loc.caseStudy.outcome}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function NbsTypeStrip({ typeIds, intro }: { typeIds: string[]; intro?: string }) {
  const { i18n } = useTranslation();
  const lang: 'pt' | 'en' = i18n.language?.startsWith('pt') ? 'pt' : 'en';
  const ids = new Set(typeIds);
  const types = NBS_INTERVENTION_TYPES.filter(t => ids.has(t.id));
  if (types.length === 0) return null;

  return (
    <div className="space-y-2">
      {intro && (
        <p className="text-xs text-muted-foreground px-1 leading-relaxed">{intro}</p>
      )}
      <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {types.map(type => (
          <div key={type.id} className="snap-start">
            <NbsTypeCardItem type={type} lang={lang} />
          </div>
        ))}
      </div>
    </div>
  );
}
