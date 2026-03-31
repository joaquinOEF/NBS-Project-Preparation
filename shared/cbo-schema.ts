import { z } from 'zod';

// ============================================================================
// CBO INTERVENTION PROFILE — 5 sections aligned to COUGAR NBS Mapping Criteria
// ============================================================================

export const CBO_SECTIONS = [
  { id: 'org_profile', title: '1. Who We Are', phase: 1, maturityMetrics: ['org_delivery_capacity', 'team_technical_experience'] },
  { id: 'intervention_site', title: '2. Where We Work', phase: 2, maturityMetrics: ['site_control', 'community_anchoring'] },
  { id: 'intervention_plan', title: '3. What We\'re Doing', phase: 3, maturityMetrics: ['problem_clarity', 'climate_nbs_impact', 'solution_clarity'] },
  { id: 'needs_assessment', title: '4. What We Need', phase: 4, maturityMetrics: ['financial_thinking', 'regulatory_awareness'] },
  { id: 'results_evidence', title: '5. Results & Evidence', phase: 5, maturityMetrics: [] },
] as const;

export type CboSectionId = typeof CBO_SECTIONS[number]['id'];
export const ALL_CBO_SECTION_IDS = CBO_SECTIONS.map(s => s.id);

// Maturity scores (0-3 per COUGAR NBS Mapping Criteria)
export interface MaturityScore {
  metric: string;
  score: 0 | 1 | 2 | 3;
  justification: string;
}

export interface PriorityFlag {
  flag: string;
  met: boolean;
  notes?: string;
}

export type Confidence = 'high' | 'medium' | 'low' | 'empty';

export interface CboFieldState {
  value: string | number | null;
  confidence: Confidence;
  source?: string;
  userEdited: boolean;
}

export interface CboSectionState {
  id: CboSectionId;
  title: string;
  phase: number;
  fields: Record<string, CboFieldState>;
  confidence: Confidence;
  sources: string[];
  lastUpdatedBy: 'agent' | 'user' | null;
}

export interface CboGapEntry {
  sectionId: CboSectionId;
  field: string;
  reason: string;
  severity: 'critical' | 'important' | 'minor';
}

export interface CboState {
  id: string;
  orgName: string;
  city: string;
  phase: number;
  sections: Record<CboSectionId, CboSectionState>;
  gaps: CboGapEntry[];
  maturityScores: MaturityScore[];
  priorityFlags: PriorityFlag[];
  totalMaturityScore: number; // out of 27
  editLog: Array<{ timestamp: string; sectionId: string; field: string; oldValue: any; newValue: any; source: 'agent' | 'user' }>;
  uploadedFiles: Array<{ name: string; path: string; parsedAt: string; summary: string }>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    sessionId?: string;
  };
}

// SSE events — same structure as concept note but with CBO types
export type CboEvent =
  | { type: 'chat'; content: string; role: 'assistant'; messageType?: 'content' | 'thinking' | 'tool_status' }
  | { type: 'chat_thinking'; content: string }
  | { type: 'thinking_step'; step: { id: string; label: string; status: 'pending' | 'active' | 'complete' | 'error' } }
  | { type: 'field_update'; sectionId: string; field: string; value: string; confidence: Confidence; source?: string }
  | { type: 'gap'; sectionId: string; field: string; reason: string; severity: string }
  | { type: 'phase_change'; phase: number }
  | { type: 'maturity_update'; scores: MaturityScore[]; total: number; flags: PriorityFlag[] }
  | { type: 'ask_user'; question: string; options: Array<{ label: string; description: string; recommended?: boolean }>; relatedSections?: string[]; showMap?: boolean; multiSelect?: boolean }
  | { type: 'done'; summary: string }
  | { type: 'error'; message: string };

// Chat message type (same as concept note — shared)
export interface CboChatMessage {
  role: 'user' | 'assistant';
  content: string;
  messageType: 'content' | 'thinking' | 'tool_status';
  timestamp: string;
}

// Helper to create empty CBO state
export function createEmptyCboState(city: string): CboState {
  const sections: Record<string, CboSectionState> = {};
  for (const sec of CBO_SECTIONS) {
    sections[sec.id] = {
      id: sec.id,
      title: sec.title,
      phase: sec.phase,
      fields: {},
      confidence: 'empty',
      sources: [],
      lastUpdatedBy: null,
    };
  }
  return {
    id: crypto.randomUUID(),
    orgName: '',
    city,
    phase: 0,
    sections: sections as Record<CboSectionId, CboSectionState>,
    gaps: [],
    maturityScores: [],
    priorityFlags: [],
    totalMaturityScore: 0,
    editLog: [],
    uploadedFiles: [],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

// COUGAR maturity metrics
export const MATURITY_METRICS = [
  'problem_clarity',
  'climate_nbs_impact',
  'solution_clarity',
  'site_control',
  'org_delivery_capacity',
  'team_technical_experience',
  'financial_thinking',
  'community_anchoring',
  'regulatory_awareness',
] as const;

export const PRIORITY_FLAG_DEFINITIONS = [
  'Land tenure secure or likely secure',
  'Baseline environmental data exists',
  'Local government expressed interest',
  'Potential buyers/payors identified',
  'Co-financing possibility identified',
  'Scalable beyond one site',
] as const;
