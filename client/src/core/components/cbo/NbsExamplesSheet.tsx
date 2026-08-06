// ============================================================================
// NbsExamplesSheet — real cases, reachable WHILE choosing
// ============================================================================
//
// COUGAR convening 2026-08-06: "make NBS family examples more discoverable
// through an exploratory component so users can reference back to case studies
// while selecting solutions". Orgs were choosing famílias blind.
//
// ⚠️ It opens from a SECONDARY control on the question card, never from an
// answer option. The E2 checkpoint machine derives its position from the
// answers, so an option that only opened a sheet would either strand the flow
// or answer the question by accident. Opening this must cost nothing: the
// question is still there when it closes.
//
// Browsable, theirs first — not filtered to our recommendation. The ranking
// that would do the filtering runs on bairro averages rather than their site,
// and the flow already promises out loud that nothing is ruled out.

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/core/components/ui/sheet';
import { NBS_SHOWCASE_CARDS, orderShowcaseCardsFor } from '@shared/nbs-showcase-cards';
import { NbsShowcaseCardStrip } from './NbsShowcaseCard';

const STRINGS = {
  pt: {
    title: 'Casos reais',
    lead: 'Projetos que já aconteceram. Os mais parecidos com o que vocês contaram vêm primeiro.',
  },
  en: {
    title: 'Real cases',
    lead: 'Projects that already happened. The ones closest to what you told us come first.',
  },
} as const;

export function NbsExamplesSheet({
  open,
  onClose,
  lang,
  families,
  savedIds,
  onToggleSave,
}: {
  open: boolean;
  onClose: () => void;
  lang: 'pt' | 'en';
  /** Hazard families behind what the org named, so theirs sort to the top. */
  families: string[];
  savedIds: string[];
  onToggleSave: (id: string, next: boolean) => void;
}) {
  const s = STRINGS[lang];
  const cards = orderShowcaseCardsFor(NBS_SHOWCASE_CARDS, families);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto" data-testid="nbs-examples-sheet">
        <SheetHeader className="text-left">
          <SheetTitle>{s.title}</SheetTitle>
        </SheetHeader>
        <p className="text-sm text-muted-foreground mt-1 mb-3">{s.lead}</p>
        <NbsShowcaseCardStrip
          cards={cards}
          mode="browse"
          savedIds={savedIds}
          onToggleSave={onToggleSave}
        />
      </SheetContent>
    </Sheet>
  );
}
