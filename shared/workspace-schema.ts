import { sql } from 'drizzle-orm';
import { pgTable, text, varchar, jsonb, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export type InfoBlockType = 
  | 'funder_selection'
  | 'site_explorer'
  | 'impact_model'
  | 'operations'
  | 'business_model';

export type BlockStatus = 'NOT_STARTED' | 'DRAFT' | 'READY' | 'LOCKED';
export type UpdatedByType = 'user' | 'agent' | 'system';
export type EvidenceType = 'dataset' | 'citation' | 'user_note' | 'api_response' | 'retrieval' | 'assumption';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type AssumptionScope = 'project' | 'block' | 'zone' | 'intervention' | 'field';
export type AssumptionSensitivity = 'high' | 'medium' | 'low';
export type ActionType = 'propose_patch' | 'apply_patch' | 'reject_patch' | 'auto_complete' | 'suggest' | 'draft' | 'explain';
export type ActionStatus = 'proposed' | 'accepted' | 'rejected' | 'auto_applied';

export const infoBlocks = pgTable('info_blocks', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  projectId: text('project_id').notNull(),
  blockType: text('block_type').notNull().$type<InfoBlockType>(),
  blockStateJson: jsonb('block_state_json').$type<Record<string, any>>().default({}),
  status: text('status').notNull().$type<BlockStatus>().default('NOT_STARTED'),
  completionPercent: integer('completion_percent').default(0),
  updatedBy: text('updated_by').$type<UpdatedByType>().default('user'),
  updatedByAgentId: text('updated_by_agent_id'),
  version: integer('version').default(1),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const evidenceRecords = pgTable('evidence_records', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  projectId: text('project_id').notNull(),
  evidenceType: text('evidence_type').notNull().$type<EvidenceType>(),
  title: text('title').notNull(),
  summary: text('summary'),
  payloadRef: text('payload_ref'),
  payloadJson: jsonb('payload_json').$type<Record<string, any>>(),
  sourceUrl: text('source_url'),
  sourceLabel: text('source_label'),
  linkedPaths: jsonb('linked_paths').$type<string[]>().default([]),
  linkedBlockTypes: jsonb('linked_block_types').$type<InfoBlockType[]>().default([]),
  confidence: text('confidence').$type<ConfidenceLevel>().default('MEDIUM'),
  isActive: boolean('is_active').default(true),
  createdBy: text('created_by').$type<UpdatedByType>().default('user'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const assumptions = pgTable('assumptions', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  projectId: text('project_id').notNull(),
  statement: text('statement').notNull(),
  scope: text('scope').notNull().$type<AssumptionScope>().default('project'),
  scopeRef: text('scope_ref'),
  sensitivity: text('sensitivity').$type<AssumptionSensitivity>().default('medium'),
  linkedPaths: jsonb('linked_paths').$type<string[]>().default([]),
  linkedBlockTypes: jsonb('linked_block_types').$type<InfoBlockType[]>().default([]),
  evidenceId: text('evidence_id'),
  status: text('status').default('active'),
  validatedBy: text('validated_by'),
  validatedAt: timestamp('validated_at'),
  createdBy: text('created_by').$type<UpdatedByType>().default('user'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const agentActionLog = pgTable('agent_action_log', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  projectId: text('project_id').notNull(),
  sessionId: text('session_id'),
  actionType: text('action_type').notNull().$type<ActionType>(),
  actionStatus: text('action_status').notNull().$type<ActionStatus>().default('proposed'),
  actor: text('actor').notNull().$type<UpdatedByType>(),
  actorId: text('actor_id'),
  targetBlockType: text('target_block_type').$type<InfoBlockType>(),
  targetFieldPath: text('target_field_path'),
  proposedPatch: jsonb('proposed_patch').$type<Record<string, any>>(),
  appliedPatch: jsonb('applied_patch').$type<Record<string, any>>(),
  previousValue: jsonb('previous_value').$type<any>(),
  evidenceRefs: jsonb('evidence_refs').$type<string[]>().default([]),
  assumptionRefs: jsonb('assumption_refs').$type<string[]>().default([]),
  explanation: text('explanation'),
  toolCallsUsed: jsonb('tool_calls_used').$type<string[]>().default([]),
  modelUsed: text('model_used'),
  promptSnapshotRef: text('prompt_snapshot_ref'),
  userFeedback: text('user_feedback'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const projectPatches = pgTable('project_patches', {
  id: varchar('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  projectId: text('project_id').notNull(),
  blockType: text('block_type').$type<InfoBlockType>(),
  fieldPath: text('field_path').notNull(),
  operation: text('operation').notNull().$type<'set' | 'merge' | 'append' | 'remove'>(),
  value: jsonb('value').$type<any>(),
  previousValue: jsonb('previous_value').$type<any>(),
  status: text('status').notNull().$type<'pending' | 'applied' | 'rejected'>().default('pending'),
  evidenceRefs: jsonb('evidence_refs').$type<string[]>().default([]),
  proposedBy: text('proposed_by').$type<UpdatedByType>().default('user'),
  proposedByAgentId: text('proposed_by_agent_id'),
  appliedBy: text('applied_by').$type<UpdatedByType>(),
  appliedAt: timestamp('applied_at'),
  agentActionId: text('agent_action_id'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const insertInfoBlockSchema = createInsertSchema(infoBlocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEvidenceRecordSchema = createInsertSchema(evidenceRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAssumptionSchema = createInsertSchema(assumptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAgentActionLogSchema = createInsertSchema(agentActionLog).omit({
  id: true,
  createdAt: true,
});

export const insertProjectPatchSchema = createInsertSchema(projectPatches).omit({
  id: true,
  createdAt: true,
});

export type InfoBlock = typeof infoBlocks.$inferSelect;
export type InsertInfoBlock = z.infer<typeof insertInfoBlockSchema>;

export type EvidenceRecord = typeof evidenceRecords.$inferSelect;
export type InsertEvidenceRecord = z.infer<typeof insertEvidenceRecordSchema>;

export type Assumption = typeof assumptions.$inferSelect;
export type InsertAssumption = z.infer<typeof insertAssumptionSchema>;

export type AgentActionLogEntry = typeof agentActionLog.$inferSelect;
export type InsertAgentActionLog = z.infer<typeof insertAgentActionLogSchema>;

export type ProjectPatch = typeof projectPatches.$inferSelect;
export type InsertProjectPatch = z.infer<typeof insertProjectPatchSchema>;

export const MODULE_REGISTRY: Record<InfoBlockType, {
  id: InfoBlockType;
  name: string;
  route: string;
  description: string;
  sections: Array<{
    id: string;
    name: string;
    fields: string[];
  }>;
}> = {
  funder_selection: {
    id: 'funder_selection',
    name: 'Funder Selection',
    route: '/funder-selection',
    description: 'Identify funding pathways and target funders',
    sections: [
      { id: 'questionnaire', name: 'Project Profile', fields: ['projectName', 'projectDescription', 'sectors', 'projectStage', 'investmentSize', 'canTakeDebt'] },
      { id: 'pathway', name: 'Funding Pathway', fields: ['primary', 'secondary', 'readinessLevel', 'limitingFactors'] },
      { id: 'targetFunders', name: 'Target Funders', fields: ['selectedFunds', 'shortlistedFunds', 'targetFunders'] },
    ],
  },
  site_explorer: {
    id: 'site_explorer',
    name: 'Site Explorer',
    route: '/site-explorer',
    description: 'Analyze sites and select intervention zones',
    sections: [
      { id: 'zones', name: 'Selected Zones', fields: ['selectedZones', 'hazardSummary'] },
      { id: 'interventions', name: 'Interventions', fields: ['interventionPortfolio'] },
      { id: 'layers', name: 'Evidence Layers', fields: ['layerPreferences'] },
    ],
  },
  impact_model: {
    id: 'impact_model',
    name: 'Impact Model',
    route: '/impact-model',
    description: 'Quantify climate impacts and generate funder-ready narratives with analytical lenses',
    sections: [
      { id: 'setup', name: 'Setup', fields: ['prioritizationWeights', 'interventionBundles'] },
      { id: 'quantify', name: 'Quantify Impacts', fields: ['quantifiedImpacts'] },
      { id: 'narrative', name: 'Generate & Refine Narrative', fields: ['narrativeCache', 'selectedLens', 'coBenefits', 'downstreamSignals'] },
    ],
  },
  operations: {
    id: 'operations',
    name: 'Project Operations',
    route: '/project-operations',
    description: 'Define O&M model and responsibilities',
    sections: [
      { id: 'model', name: 'Operating Model', fields: ['operatingModel', 'roles'] },
      { id: 'serviceLevels', name: 'Service Levels', fields: ['serviceLevels', 'taskPlan'] },
      { id: 'nbs', name: 'NBS Extensions', fields: ['nbsExtensions'] },
      { id: 'costs', name: 'O&M Costs', fields: ['omCostBand', 'omFunding'] },
      { id: 'readiness', name: 'Readiness', fields: ['capacity', 'opsRisks', 'readiness'] },
    ],
  },
  business_model: {
    id: 'business_model',
    name: 'Business Model',
    route: '/business-model',
    description: 'Structure financing and revenue',
    sections: [
      { id: 'archetype', name: 'Archetype', fields: ['primaryArchetype', 'payerBeneficiaryMap'] },
      { id: 'payment', name: 'Payment Mechanism', fields: ['paymentMechanism'] },
      { id: 'revenue', name: 'Revenue Stack', fields: ['revenueStack'] },
      { id: 'financing', name: 'Financing', fields: ['sourcesAndUsesRom', 'financingPathway'] },
      { id: 'readiness', name: 'Readiness', fields: ['enablingActions', 'bmRisks', 'readiness'] },
    ],
  },
};

export const AGENT_ACTIONS: Record<ActionType, {
  name: string;
  description: string;
  requiresConfirmation: boolean;
}> = {
  propose_patch: {
    name: 'Propose Changes',
    description: 'Agent proposes field-level updates for review',
    requiresConfirmation: true,
  },
  apply_patch: {
    name: 'Apply Changes',
    description: 'Confirmed changes are applied to the project',
    requiresConfirmation: false,
  },
  reject_patch: {
    name: 'Reject Changes',
    description: 'User rejected proposed changes',
    requiresConfirmation: false,
  },
  auto_complete: {
    name: 'Auto-Complete',
    description: 'Agent auto-fills a field based on context',
    requiresConfirmation: true,
  },
  suggest: {
    name: 'Suggest',
    description: 'Agent provides suggestions without modifying',
    requiresConfirmation: false,
  },
  draft: {
    name: 'Draft',
    description: 'Agent drafts content for a field',
    requiresConfirmation: true,
  },
  explain: {
    name: 'Explain',
    description: 'Agent explains a concept or field',
    requiresConfirmation: false,
  },
};
