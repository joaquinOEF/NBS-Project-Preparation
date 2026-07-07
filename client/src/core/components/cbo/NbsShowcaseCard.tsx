// NbsShowcaseCard — inline chat card showing Brazilian NBS examples.
// Used at the start of E2 to build vocabulary before the user touches the
// bairro map. Two render modes:
//   - browse: read-only horizontal scroll (has-idea path)
//   - favorites: per-card "Salvar" toggle; saves to inspiration_picks[]
//     which E3's InterventionSelector pre-filters by (needs-help path)
//
// Photo manifest: docs/photo-curation.md. Verified photos render normally;
// unverified entries render a gradient + emoji placeholder.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bookmark, BookmarkCheck, MapPin, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import type { NbsShowcaseCard as Card, ShowcasePlaceholder } from '@shared/nbs-showcase-cards';

const GRADIENTS: Record<ShowcasePlaceholder['gradient'], string> = {
  flood: 'linear-gradient(135deg, #cffafe 0%, #67e8f9 100%)',
  heat: 'linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%)',
  biodiversity: 'linear-gradient(135deg, #d1fae5 0%, #6ee7b7 100%)',
};

const HAZARD_LABELS = {
  pt: { flood: 'enchente', heat: 'calor', biodiversity: 'biodiv', mixed: 'misto' },
  en: { flood: 'flood', heat: 'heat', biodiversity: 'biodiv', mixed: 'mixed' },
};

function CardThumbnail({ card }: { card: Card }) {
  if (card.photo) {
    return (
      <div className="relative h-32 w-full overflow-hidden bg-muted">
        <img
          src={card.photo.path}
          alt={card.org}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        <div className="absolute bottom-0 right-0 px-1.5 py-0.5 bg-black/50 text-[8px] text-white font-medium tracking-tight">
          {card.photo.photographer} · {card.photo.license}
        </div>
      </div>
    );
  }
  if (card.placeholder) {
    return (
      <div
        className="relative h-32 w-full overflow-hidden flex items-center justify-center"
        style={{ background: GRADIENTS[card.placeholder.gradient] }}
      >
        <span className="text-5xl" role="img" aria-hidden="true">{card.placeholder.emoji}</span>
      </div>
    );
  }
  return <div className="h-32 w-full bg-muted" />;
}

export function NbsShowcaseCardItem({
  card,
  lang,
  isSaved,
  onToggleSave,
  mode,
}: {
  card: Card;
  lang: 'pt' | 'en';
  isSaved: boolean;
  onToggleSave: (id: string, next: boolean) => void;
  mode: 'browse' | 'favorites';
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const summary = lang === 'pt' ? card.summaryPt : card.summaryEn;
  const detail = lang === 'pt' ? card.detailPt : card.detailEn;
  const hazardLabel = HAZARD_LABELS[lang][card.hazard];

  return (
    <div
      className={`shrink-0 w-[240px] md:w-full rounded-xl border bg-card overflow-hidden transition-all ${
        isSaved ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-foreground/10 hover:border-foreground/25'
      }`}
      data-testid={`showcase-card-${card.id}`}
    >
      <CardThumbnail card={card} />

      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold leading-tight">{card.org}</h4>
          {mode === 'favorites' && (
            <button
              type="button"
              onClick={() => onToggleSave(card.id, !isSaved)}
              className={`shrink-0 -mr-1 -mt-1 p-1 rounded-md transition-colors ${
                isSaved ? 'text-emerald-600 hover:bg-emerald-50' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              aria-label={isSaved ? t('cbo.showcase.unsave', { defaultValue: 'Remover dos favoritos' }) : t('cbo.showcase.save', { defaultValue: 'Salvar' })}
              data-testid={`showcase-toggle-${card.id}`}
            >
              {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <MapPin className="w-2.5 h-2.5" />
            {card.city}
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-0.5">
            <Calendar className="w-2.5 h-2.5" />
            {card.year}
          </span>
          <span>·</span>
          <span>{hazardLabel}</span>
        </div>

        <p className="text-xs text-foreground/85 leading-snug">{summary}</p>

        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 -ml-0.5 pt-0.5"
          data-testid={`showcase-expand-${card.id}`}
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded
            ? t('cbo.showcase.less', { defaultValue: 'Menos' })
            : t('cbo.showcase.more', { defaultValue: 'Saber mais' })}
        </button>

        {expanded && (
          <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">{detail}</p>
        )}
      </div>
    </div>
  );
}

export function NbsShowcaseCardStrip({
  cards,
  mode,
  savedIds,
  onToggleSave,
  intro,
}: {
  cards: Card[];
  mode: 'browse' | 'favorites';
  savedIds: string[];
  onToggleSave: (id: string, next: boolean) => void;
  /** Optional lead text rendered above the strip — e.g. "Salve 1-2 que parecem que poderiam funcionar no seu bairro" */
  intro?: string;
}) {
  const { i18n } = useTranslation();
  const lang: 'pt' | 'en' = i18n.language?.startsWith('pt') ? 'pt' : 'en';
  const savedSet = new Set(savedIds);

  return (
    <div className="space-y-2">
      {intro && (
        <p className="text-xs text-muted-foreground px-1 leading-relaxed">{intro}</p>
      )}
      <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1 snap-x md:flex-wrap md:overflow-x-visible md:snap-none">
        {cards.map(card => (
          <div key={card.id} className="snap-start md:flex-1 md:min-w-[220px] md:max-w-[320px]">
            <NbsShowcaseCardItem
              card={card}
              lang={lang}
              isSaved={savedSet.has(card.id)}
              onToggleSave={onToggleSave}
              mode={mode}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
