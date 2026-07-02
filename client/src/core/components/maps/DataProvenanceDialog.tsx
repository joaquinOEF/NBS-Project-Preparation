// "Where this data comes from" — a shared data-literacy dialog for BOTH the
// orchestrator Community-projects map and the CBO map (Ana's #1 ask). One
// component, parameterized by which layers are on screen, so the two views stay
// in sync. Content + vintages come from shared/data-provenance.ts (sourced from
// the OEF geospatial catalog, not invented).

import { Info } from 'lucide-react';
import { Button } from '@/core/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/core/components/ui/dialog';
import {
  DATA_PROVENANCE, PROVENANCE_UI, RISK_METHODOLOGY, type ProvenanceKey,
} from '@shared/data-provenance';

interface Props {
  lang: 'en' | 'pt';
  /** Which layers are currently on the map — only these are documented. */
  entries: ProvenanceKey[];
  /** Optional extra classes for the trigger button. */
  className?: string;
  /** Compact trigger (icon only) for tight map corners. */
  compact?: boolean;
}

export function DataProvenanceDialog({ lang, entries, className, compact }: Props) {
  const ui = PROVENANCE_UI[lang];
  const keys = entries.filter((k, i) => entries.indexOf(k) === i && DATA_PROVENANCE[k]);
  if (keys.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`gap-1.5 h-7 text-[11px] bg-white/90 backdrop-blur ${className ?? ''}`}
          data-testid="data-provenance-trigger"
          aria-label={ui.button}
        >
          <Info className="w-3.5 h-3.5" />
          {!compact && <span>{ui.button}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="data-provenance-dialog">
        <DialogHeader>
          <DialogTitle>{ui.title}</DialogTitle>
          <DialogDescription>{ui.subtitle}</DialogDescription>
        </DialogHeader>

        {/* Data-literacy: what "risk" means here (H×E×V). */}
        {keys.some(k => k === 'flood' || k === 'heat' || k === 'landslide' || k === 'neighborhoods') && (
          <div className="rounded-md bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            <div className="font-medium text-foreground mb-1">{ui.methodologyTitle}</div>
            {RISK_METHODOLOGY[lang]}
          </div>
        )}

        <div className="space-y-3">
          {keys.map(key => {
            const e = DATA_PROVENANCE[key][lang];
            return (
              <div key={key} className="rounded-md border p-3 text-xs" data-testid={`provenance-entry-${key}`}>
                <div className="font-semibold text-sm text-foreground">{e.title}</div>
                <p className="text-muted-foreground mt-0.5 leading-relaxed">{e.whatItShows}</p>
                <p className="text-muted-foreground mt-1"><span className="font-medium text-foreground/80">{ui.colors}:</span> {e.colorMeaning}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-muted-foreground">
                  <dt className="font-medium text-foreground/80">{ui.source}</dt><dd>{e.source}</dd>
                  <dt className="font-medium text-foreground/80">{ui.updated}</dt><dd>{e.vintage}</dd>
                  <dt className="font-medium text-foreground/80">{ui.resolution}</dt><dd>{e.resolution}</dd>
                </dl>
                <p className="mt-2 text-amber-700 dark:text-amber-500"><span className="font-medium">{ui.note}:</span> {e.caveat}</p>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
