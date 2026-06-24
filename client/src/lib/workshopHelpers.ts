import type { TFunction } from 'i18next';
import type { WorkshopConfig } from '@shared/cohort-schema';

// ---------------------------------------------------------------------------
// Workshop names are stored in the DB as English strings (seeded from
// DEFAULT_WORKSHOPS at cohort creation) and are NOT re-translated per cohort
// language. The CBO + orchestrator UIs localize them BY POSITION instead:
// the canonical PT names live under `orchestrator.workshops.wN.name`, keyed on
// the workshop's index in the cohort's workshops array (EN has no keys, so it
// falls back to the stored English `name`). This keeps a single source of truth
// for translated workshop names and stops English leaking into a PT cohort.
// See WorkshopCadence.tsx (orchestrator) for the original of this pattern.
// ---------------------------------------------------------------------------

/** Index of `workshop` within `workshops`. Tolerates the workshop being a
 *  distinct object (e.g. the server sends `focusWorkshop` separately) by
 *  matching on name + unlocksPhase. Returns -1 if not found. */
export function workshopIndex(
  workshops: WorkshopConfig[],
  workshop: WorkshopConfig | null | undefined,
): number {
  if (!workshop) return -1;
  const byRef = workshops.indexOf(workshop);
  if (byRef >= 0) return byRef;
  return workshops.findIndex(
    w => w.name === workshop.name && w.unlocksPhase === workshop.unlocksPhase,
  );
}

/** Localized workshop name keyed by position, falling back to the stored name. */
export function localizedWorkshopName(
  t: TFunction,
  workshops: WorkshopConfig[],
  workshop: WorkshopConfig | null | undefined,
): string {
  if (!workshop) return '';
  const i = workshopIndex(workshops, workshop);
  return i >= 0
    ? (t(`orchestrator.workshops.w${i + 1}.name`, { defaultValue: workshop.name }) as string)
    : workshop.name;
}
