// Sample cohort + members for `/orchestrator` when no real coordinator slug is
// present (stakeholder demos, first-visit walkthrough). Same shape as the
// server-backed cohort so the page renders a single code path.

import type { Cohort, CohortMember } from '@shared/cohort-schema';
import { DEFAULT_WORKSHOPS } from '@shared/cohort-schema';

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

export const SAMPLE_COHORT: Cohort = {
  id: 'sample-cohort',
  coordinatorSlug: 'sample',
  name: 'Vila Flores — Sample cohort',
  settings: {
    workshops: DEFAULT_WORKSHOPS.map((w, i) => ({
      ...w,
      // Seed dates: weekly Thursdays starting mid-June 2026.
      date: new Date(2026, 5, 11 + i * 7).toISOString().slice(0, 10),
    })),
  },
  createdAt: daysAgo(14),
};

type SampleMember = Omit<CohortMember, 'snapshotUpdatedAt' | 'invitedAt' | 'startedAt'> & {
  snapshotUpdatedAt: Date | null;
  invitedAt: Date | null;
  startedAt: Date | null;
  /** UI-only: latitude / longitude for the map marker. */
  coords?: [number, number] | null;
  /** UI-only: bilingual display name for the demo. */
  displayName?: { en: string; pt: string };
};

export const SAMPLE_MEMBERS: SampleMember[] = [
  {
    id: 'horta-cascata',
    cohortId: SAMPLE_COHORT.id,
    memberSlug: 'sample-horta-cascata',
    cboStateId: null,
    orgName: 'Horta Comunitária Cascata',
    displayName: { en: 'Horta Comunitária Cascata', pt: 'Horta Comunitária Cascata' },
    neighborhood: 'Cascata',
    role: 'priority',
    origin: 'cohort',
    unlockedPhases: [1, 2, 3, 4],
    invitedAt: daysAgo(14),
    startedAt: daysAgo(12),
    snapshotPhase: 4,
    snapshotSectionsComplete: 4,
    snapshotMaturityScore: 15,
    snapshotFlagsMet: 3,
    snapshotIntervention: 'bioswales',
    snapshotUpdatedAt: daysAgo(2),
    coords: [-30.115, -51.178],
  },
  {
    id: 'arquipelago-verde',
    cohortId: SAMPLE_COHORT.id,
    memberSlug: 'sample-arquipelago-verde',
    cboStateId: null,
    orgName: 'Coletivo Arquipélago Verde',
    displayName: { en: 'Coletivo Arquipélago Verde', pt: 'Coletivo Arquipélago Verde' },
    neighborhood: 'Arquipélago',
    role: 'priority',
    origin: 'cohort',
    unlockedPhases: [1, 2, 3],
    invitedAt: daysAgo(14),
    startedAt: daysAgo(10),
    snapshotPhase: 3,
    snapshotSectionsComplete: 2,
    snapshotMaturityScore: 8,
    snapshotFlagsMet: 2,
    snapshotIntervention: 'wetlands',
    snapshotUpdatedAt: daysAgo(7),
    coords: [-29.993, -51.263],
  },
  {
    id: 'bosque-humaita',
    cohortId: SAMPLE_COHORT.id,
    memberSlug: 'sample-bosque-humaita',
    cboStateId: null,
    orgName: 'Agentes do Bosque Humaitá',
    displayName: { en: 'Agentes do Bosque Humaitá', pt: 'Agentes do Bosque Humaitá' },
    neighborhood: 'Humaitá',
    role: 'priority',
    origin: 'cohort',
    unlockedPhases: [1, 2, 3, 4, 5],
    invitedAt: daysAgo(14),
    startedAt: daysAgo(13),
    snapshotPhase: 5,
    snapshotSectionsComplete: 7,
    snapshotMaturityScore: 22,
    snapshotFlagsMet: 5,
    snapshotIntervention: 'urban-forests',
    snapshotUpdatedAt: daysAgo(1),
    coords: [-29.995, -51.195],
  },
  {
    id: 'restinga-nova',
    cohortId: SAMPLE_COHORT.id,
    memberSlug: 'sample-restinga-nova',
    cboStateId: null,
    orgName: 'Coletivo Restinga Nova',
    displayName: { en: 'Coletivo Restinga Nova', pt: 'Coletivo Restinga Nova' },
    neighborhood: 'Restinga',
    role: 'priority',
    origin: 'cohort',
    unlockedPhases: [1],
    invitedAt: daysAgo(7),
    startedAt: null,
    snapshotPhase: 1,
    snapshotSectionsComplete: 0,
    snapshotMaturityScore: 0,
    snapshotFlagsMet: 0,
    snapshotIntervention: null,
    snapshotUpdatedAt: null,
    coords: null,
  },
];
