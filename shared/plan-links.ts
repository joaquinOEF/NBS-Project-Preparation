// What the plan cross-reading stored for one organisation
// (server/services/planLinks.ts) — read by the board, the project card and the
// printed pre-portfolio. Stored on the organisation's own record as
// `intervention_type._plan_links_json`, keyed so a stale reading is not shown.

export interface PlanLink {
  docId: string;
  title: string;
  owner?: string;
  kind: 'plano' | 'projeto' | 'iniciativa' | 'empresa';
  /** How this organisation's project connects, one sentence, third person. */
  connection: string;
  /** Verbatim from the document — the proof. */
  passage: string;
  relation: 'alinha' | 'complementa' | 'mesmo-territorio';
}

export interface StoredPlanLinks {
  key: string;
  links: PlanLink[];
  at: string;
  model: string;
}

export function parsePlanLinks(raw: string | undefined | null): StoredPlanLinks | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v.key !== 'string' || !Array.isArray(v.links)) return null;
    return v as StoredPlanLinks;
  } catch {
    return null;
  }
}

export const RELATION_LABEL: Record<PlanLink['relation'], string> = {
  alinha: 'alinha com',
  complementa: 'complementa',
  'mesmo-territorio': 'no mesmo território que',
};
