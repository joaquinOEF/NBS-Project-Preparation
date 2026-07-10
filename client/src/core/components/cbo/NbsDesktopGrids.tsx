// Desktop grid layouts for the orchestrator NBS tabs. These are thin LAYOUT
// wrappers only — they arrange the same leaf cards the mobile CBO chat uses
// (NbsTypeCard, NbsShowcaseCardItem), so a content edit reaches both surfaces.
// The 3-col grid mirrors the participant grid on the same page for consistency.
//
// Design record: docs/nbs-type-content-model.md

import { useState } from 'react';
import type { NbsInterventionTypeId } from '@shared/cbo-schema';
import { NBS_INTERVENTION_TYPES } from '@shared/cbo-schema';
import { NBS_TYPE_CONTENT } from '@shared/nbs-type-content';
import type { NbsShowcaseCard } from '@shared/nbs-showcase-cards';
import { NbsTypeCard } from './NbsTypeCard';
import { NbsTypeDialog } from './NbsTypeDialog';
import { NbsShowcaseCardItem } from './NbsShowcaseCard';

const GRID = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';

/** "Soluções" tab — the six NBS type cards in a grid; a card opens the centered
 *  detail dialog on that type (prev/next between the six). */
export function NbsSolutionsGrid({ lang }: { lang: 'pt' | 'en' }) {
  const [openTypeId, setOpenTypeId] = useState<NbsInterventionTypeId | null>(
    null
  );
  const types = NBS_INTERVENTION_TYPES.filter(t => NBS_TYPE_CONTENT[t.id]);
  const typeIds = types.map(t => t.id);

  return (
    <>
      <div className={GRID}>
        {types.map(type => (
          <NbsTypeCard
            key={type.id}
            id={type.id}
            lang={lang}
            onOpen={setOpenTypeId}
          />
        ))}
      </div>

      <NbsTypeDialog
        typeIds={typeIds}
        openTypeId={openTypeId}
        onOpenTypeId={setOpenTypeId}
        onClose={() => setOpenTypeId(null)}
        lang={lang}
      />
    </>
  );
}

/** "Casos" tab — the Brazilian named-project case studies. Read-only: reuses the
 *  showcase leaf in browse mode (no save toggle). Cards with a verified photo show
 *  it; the rest render the gradient + emoji placeholder, same as the CBO chat. */
export function NbsCasesGrid({
  cards,
  lang,
}: {
  cards: NbsShowcaseCard[];
  lang: 'pt' | 'en';
}) {
  return (
    <div className={GRID}>
      {cards.map(card => (
        <NbsShowcaseCardItem
          key={card.id}
          card={card}
          lang={lang}
          isSaved={false}
          onToggleSave={() => {}}
          mode='browse'
        />
      ))}
    </div>
  );
}
