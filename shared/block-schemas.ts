import { z } from 'zod';

// ============================================================================
// FIELD VALIDATION REGISTRY
// A scalable, declarative system for validating patch values across all modules.
// To add new validations: simply add entries to the FIELD_VALIDATIONS object below.
// ============================================================================

export type FieldValidationType = 
  | { type: 'enum'; values: readonly string[] }
  | { type: 'enumArray'; values: readonly string[] }
  | { type: 'string' }
  | { type: 'number'; min?: number; max?: number }
  | { type: 'boolean' };

export interface FieldValidationEntry {
  fieldPath: string;  // e.g., "questionnaire.projectStage" or just "projectStage" for nested
  validation: FieldValidationType;
  label?: string;  // Human-readable label for error messages
}

// Centralized field validation registry - add new modules/fields here
export const FIELD_VALIDATIONS: Record<string, FieldValidationEntry[]> = {
  funder_selection: [
    // Questionnaire fields - synced with UI options
    { fieldPath: 'questionnaire.projectStage', validation: { type: 'enum', values: ['idea', 'concept', 'prefeasibility', 'feasibility', 'procurement'] }, label: 'Project Stage' },
    { fieldPath: 'questionnaire.existingElements', validation: { type: 'enumArray', values: ['capex', 'timeline', 'location', 'assessments', 'agency', 'none'] }, label: 'Existing Elements' },
    { fieldPath: 'questionnaire.sectors', validation: { type: 'enumArray', values: ['nature_based', 'transport', 'energy', 'water', 'waste', 'urban_resilience', 'other'] }, label: 'Sectors' },
    { fieldPath: 'questionnaire.investmentSize', validation: { type: 'enum', values: ['under_1m', '1_5m', '5_20m', '20_50m', 'over_50m', 'unknown'] }, label: 'Investment Size' },
    { fieldPath: 'questionnaire.budgetPreparation', validation: { type: 'enum', values: ['yes', 'partial', 'no'] }, label: 'Budget for Preparation' },
    { fieldPath: 'questionnaire.budgetImplementation', validation: { type: 'enum', values: ['yes', 'partial', 'no'] }, label: 'Budget for Implementation' },
    { fieldPath: 'questionnaire.generatesRevenue', validation: { type: 'enum', values: ['yes', 'no', 'not_sure'] }, label: 'Generates Revenue' },
    { fieldPath: 'questionnaire.repaymentSource', validation: { type: 'enum', values: ['user_fees', 'budget_savings', 'transfers', 'private_offtaker', 'not_defined'] }, label: 'Repayment Source' },
    { fieldPath: 'questionnaire.canTakeDebt', validation: { type: 'enum', values: ['yes', 'no', 'not_sure'] }, label: 'Can Take Debt' },
    { fieldPath: 'questionnaire.nationalApproval', validation: { type: 'enum', values: ['yes', 'no', 'not_sure'] }, label: 'National Approval' },
    { fieldPath: 'questionnaire.openToBundling', validation: { type: 'enum', values: ['yes', 'no', 'maybe'] }, label: 'Open to Bundling' },
    { fieldPath: 'questionnaire.fundingReceiver', validation: { type: 'enum', values: ['municipality', 'state', 'utility', 'private', 'consortium'] }, label: 'Funding Receiver' },
    { fieldPath: 'questionnaire.politicalEndorsementLevel', validation: { type: 'enum', values: ['written', 'informal', 'none', 'unknown'] }, label: 'Political Endorsement Level' },
    { fieldPath: 'questionnaire.implementingOwnership', validation: { type: 'enum', values: ['single_department', 'multiple_departments', 'not_defined'] }, label: 'Implementing Ownership' },
    { fieldPath: 'questionnaire.internalAlignmentLevel', validation: { type: 'enum', values: ['high', 'medium', 'low', 'unknown'] }, label: 'Internal Alignment Level' },
    { fieldPath: 'questionnaire.leadershipCommitmentConfidence', validation: { type: 'enum', values: ['high', 'medium', 'low', 'unknown'] }, label: 'Leadership Commitment Confidence' },
    { fieldPath: 'questionnaire.politicalMandatePlanRefs', validation: { type: 'enumArray', values: ['city_climate_plan', 'sectoral_plan', 'multi_year_investment_plan', 'national_or_state_plan', 'not_in_official_plan'] }, label: 'Political Mandate References' },
    { fieldPath: 'questionnaire.politicalRiskFactors', validation: { type: 'enumArray', values: ['upcoming_elections', 'land_resettlement', 'tariff_sensitivity', 'public_opposition', 'none'] }, label: 'Political Risk Factors' },
    // Block status
    { fieldPath: 'status', validation: { type: 'enum', values: ['NOT_STARTED', 'DRAFT', 'READY'] }, label: 'Status' },
  ],
  
  site_explorer: [
    { fieldPath: 'status', validation: { type: 'enum', values: ['NOT_STARTED', 'DRAFT', 'READY'] }, label: 'Status' },
    // Selected zone hazard types
    { fieldPath: 'selectedZones.*.hazardType', validation: { type: 'enum', values: ['FLOOD', 'HEAT', 'LANDSLIDE', 'FLOOD_HEAT', 'FLOOD_LANDSLIDE', 'HEAT_LANDSLIDE', 'LOW'] }, label: 'Hazard Type' },
  ],

  impact_model: [
    { fieldPath: 'status', validation: { type: 'enum', values: ['NOT_STARTED', 'DRAFT', 'READY'] }, label: 'Status' },
    { fieldPath: 'selectedLens', validation: { type: 'enum', values: ['neutral', 'climate', 'social', 'financial', 'institutional'] }, label: 'Selected Lens' },
    // Prioritization weights (0-5 scale)
    { fieldPath: 'prioritizationWeights.floodRiskReduction', validation: { type: 'number', min: 0, max: 5 }, label: 'Flood Risk Reduction Weight' },
    { fieldPath: 'prioritizationWeights.heatReduction', validation: { type: 'number', min: 0, max: 5 }, label: 'Heat Reduction Weight' },
    { fieldPath: 'prioritizationWeights.landslideRiskReduction', validation: { type: 'number', min: 0, max: 5 }, label: 'Landslide Risk Reduction Weight' },
    { fieldPath: 'prioritizationWeights.socialEquity', validation: { type: 'number', min: 0, max: 5 }, label: 'Social Equity Weight' },
    { fieldPath: 'prioritizationWeights.costCertainty', validation: { type: 'number', min: 0, max: 5 }, label: 'Cost Certainty Weight' },
    { fieldPath: 'prioritizationWeights.biodiversityWaterQuality', validation: { type: 'number', min: 0, max: 5 }, label: 'Biodiversity/Water Quality Weight' },
    // Narrative block fields
    { fieldPath: 'narrativeCache.base.*.lens', validation: { type: 'enum', values: ['neutral', 'climate', 'social', 'financial', 'institutional'] }, label: 'Narrative Lens' },
    { fieldPath: 'narrativeCache.base.*.evidenceTier', validation: { type: 'enum', values: ['EVIDENCE', 'MODELLED', 'ASSUMPTION', 'NEEDS_VALIDATION'] }, label: 'Evidence Tier' },
    // Co-benefit fields
    { fieldPath: 'coBenefits.*.category', validation: { type: 'enum', values: ['HEALTH', 'BIODIVERSITY', 'WATER_QUALITY', 'MOBILITY', 'EQUITY', 'ECONOMIC_VALUE', 'PUBLIC_REALM', 'INSTITUTIONAL_CAPACITY', 'OTHER'] }, label: 'Co-Benefit Category' },
    { fieldPath: 'coBenefits.*.confidence', validation: { type: 'enum', values: ['HIGH', 'MEDIUM', 'LOW'] }, label: 'Confidence Level' },
    { fieldPath: 'coBenefits.*.evidenceTier', validation: { type: 'enum', values: ['EVIDENCE', 'MODELLED', 'ASSUMPTION', 'NEEDS_VALIDATION'] }, label: 'Evidence Tier' },
    // Signal card fields
    { fieldPath: 'downstreamSignals.*.*.timeHorizon', validation: { type: 'enum', values: ['0-2y', '3-7y', '8-12y', 'ongoing'] }, label: 'Time Horizon' },
    { fieldPath: 'downstreamSignals.*.*.confidence', validation: { type: 'enum', values: ['HIGH', 'MEDIUM', 'LOW'] }, label: 'Confidence Level' },
  ],

  operations: [
    { fieldPath: 'status', validation: { type: 'enum', values: ['NOT_STARTED', 'DRAFT', 'READY'] }, label: 'Status' },
    { fieldPath: 'operatingModel', validation: { type: 'enum', values: ['CITY_RUN', 'UTILITY_RUN', 'CONTRACTOR_RUN', 'COMMUNITY_STEWARDSHIP', 'HYBRID_SPLIT'] }, label: 'Operating Model' },
    // Role fields
    { fieldPath: 'roles.communityRole', validation: { type: 'enum', values: ['BENEFICIARY', 'STEWARD_OPERATOR', 'CO_OWNER_REVENUE_PARTICIPANT'] }, label: 'Community Role' },
    // Service levels
    { fieldPath: 'serviceLevels.*.serviceType', validation: { type: 'enum', values: ['COOLING', 'STORMWATER', 'SLOPE_STABILITY', 'MULTI_BENEFIT'] }, label: 'Service Type' },
    { fieldPath: 'serviceLevels.*.inspectionFrequency', validation: { type: 'enum', values: ['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL'] }, label: 'Inspection Frequency' },
    // NBS extensions
    { fieldPath: 'nbsExtensions.establishmentPeriodMonths', validation: { type: 'number', min: 12, max: 36 }, label: 'Establishment Period (12, 24, or 36 months)' },
    { fieldPath: 'nbsExtensions.maintenanceIntensity', validation: { type: 'enum', values: ['LOW', 'MEDIUM', 'HIGH'] }, label: 'Maintenance Intensity' },
    { fieldPath: 'nbsExtensions.survivalTargetPercent', validation: { type: 'number', min: 0, max: 100 }, label: 'Survival Target Percent' },
    // Capacity
    { fieldPath: 'capacity.assessment', validation: { type: 'enum', values: ['ADEQUATE', 'PARTIAL_NEEDS_SUPPORT', 'INADEQUATE'] }, label: 'Capacity Assessment' },
    // Ops risks
    { fieldPath: 'opsRisks.*.riskLevel', validation: { type: 'enum', values: ['LOW', 'MEDIUM', 'HIGH'] }, label: 'Risk Level' },
    // Readiness checklist (booleans)
    { fieldPath: 'readiness.checklist.operatingModelSelected', validation: { type: 'boolean' }, label: 'Operating Model Selected' },
    { fieldPath: 'readiness.checklist.operatorAssigned', validation: { type: 'boolean' }, label: 'Operator Assigned' },
    { fieldPath: 'readiness.checklist.taskPlanPresent', validation: { type: 'boolean' }, label: 'Task Plan Present' },
    { fieldPath: 'readiness.checklist.fundingMechanismSelected', validation: { type: 'boolean' }, label: 'Funding Mechanism Selected' },
    { fieldPath: 'readiness.checklist.verifierSet', validation: { type: 'boolean' }, label: 'Verifier Set' },
  ],

  business_model: [
    { fieldPath: 'status', validation: { type: 'enum', values: ['NOT_STARTED', 'DRAFT', 'READY'] }, label: 'Status' },
    { fieldPath: 'primaryArchetype', validation: { type: 'enum', values: ['PUBLIC_PROGRAM', 'UTILITY_SERVICE', 'SERVICE_CONTRACT', 'LAND_VALUE_CAPTURE', 'BLENDED_FINANCE', 'CREDIT_ADDON', 'INSURANCE_LINKED'] }, label: 'Primary Archetype' },
    // Revenue stack
    { fieldPath: 'revenueStack.*.role', validation: { type: 'enum', values: ['PRIMARY_DURABLE', 'SECONDARY_SUPPORT', 'UPSIDE_OPTIONAL'] }, label: 'Revenue Role' },
    { fieldPath: 'revenueStack.*.confidence', validation: { type: 'enum', values: ['HIGH', 'MEDIUM', 'LOW'] }, label: 'Confidence Level' },
    // Financing pathway
    { fieldPath: 'financingPathway.pathway', validation: { type: 'enum', values: ['PUBLIC_CAPEX', 'DFI_LOAN', 'MUNICIPAL_BOND', 'BLENDED_VEHICLE', 'PPP_LIGHT', 'PHILANTHROPY_ONLY'] }, label: 'Financing Pathway' },
    // Enabling actions
    { fieldPath: 'enablingActions.*.priority', validation: { type: 'enum', values: ['HIGH', 'MEDIUM', 'LOW'] }, label: 'Action Priority' },
    // BM risks
    { fieldPath: 'bmRisks.*.riskLevel', validation: { type: 'enum', values: ['LOW', 'MEDIUM', 'HIGH'] }, label: 'Risk Level' },
    // Readiness checklist (booleans)
    { fieldPath: 'readiness.checklist.primaryArchetypeSelected', validation: { type: 'boolean' }, label: 'Primary Archetype Selected' },
    { fieldPath: 'readiness.checklist.primaryPayerSelected', validation: { type: 'boolean' }, label: 'Primary Payer Selected' },
    { fieldPath: 'readiness.checklist.oneHighConfidenceRevenueLine', validation: { type: 'boolean' }, label: 'High Confidence Revenue Line' },
    { fieldPath: 'readiness.checklist.durationSet', validation: { type: 'boolean' }, label: 'Duration Set' },
    { fieldPath: 'readiness.checklist.financingPathwaySelected', validation: { type: 'boolean' }, label: 'Financing Pathway Selected' },
    { fieldPath: 'readiness.checklist.consistencyCheckedWithOps', validation: { type: 'boolean' }, label: 'Consistency Checked with Ops' },
  ],
};

/**
 * Matches a concrete field path against a pattern that may contain wildcards.
 * e.g., "selectedZones.0.hazardType" matches "selectedZones.*.hazardType"
 */
function matchesWildcardPath(concretePath: string, patternPath: string): boolean {
  const concreteSegments = concretePath.split('.');
  const patternSegments = patternPath.split('.');
  
  if (concreteSegments.length !== patternSegments.length) return false;
  
  return patternSegments.every((pattern, i) => {
    if (pattern === '*') return true; // Wildcard matches any segment
    return pattern === concreteSegments[i];
  });
}

/**
 * Validates a value against the field validation registry.
 * Returns null if valid, or an error message string if invalid.
 * Supports wildcard patterns like "array.*.field" to validate array items.
 */
export function validateFieldValue(
  blockType: string,
  fieldPath: string,
  value: unknown
): string | null {
  const moduleValidations = FIELD_VALIDATIONS[blockType];
  if (!moduleValidations) return null; // No validations defined for this module
  
  // Try exact match first, then wildcard patterns
  let entry = moduleValidations.find(v => v.fieldPath === fieldPath);
  if (!entry) {
    entry = moduleValidations.find(v => 
      v.fieldPath.includes('*') && matchesWildcardPath(fieldPath, v.fieldPath)
    );
  }
  if (!entry) return null; // No validation defined for this field
  
  const { validation, label } = entry;
  const fieldLabel = label || fieldPath;
  
  switch (validation.type) {
    case 'enum':
      if (typeof value !== 'string' || !validation.values.includes(value)) {
        return `Invalid ${fieldLabel}: "${value}". Valid options: ${validation.values.join(', ')}`;
      }
      break;
      
    case 'enumArray':
      if (!Array.isArray(value)) {
        return `${fieldLabel} must be an array`;
      }
      const invalidItems = value.filter(v => !validation.values.includes(v as string));
      if (invalidItems.length > 0) {
        return `Invalid ${fieldLabel} values: ${invalidItems.join(', ')}. Valid options: ${validation.values.join(', ')}`;
      }
      break;
      
    case 'string':
      if (typeof value !== 'string') {
        return `${fieldLabel} must be a text value`;
      }
      break;
      
    case 'number':
      if (typeof value !== 'number') {
        return `${fieldLabel} must be a number`;
      }
      if (validation.min !== undefined && value < validation.min) {
        return `${fieldLabel} must be at least ${validation.min}`;
      }
      if (validation.max !== undefined && value > validation.max) {
        return `${fieldLabel} must be at most ${validation.max}`;
      }
      break;
      
    case 'boolean':
      if (typeof value !== 'boolean') {
        return `${fieldLabel} must be true or false`;
      }
      break;
  }
  
  return null;
}

// Legacy export for backwards compatibility
export const FUNDER_SELECTION_VALID_VALUES = {
  sectors: ['nature_based', 'transport', 'energy', 'water', 'waste', 'urban_resilience', 'other'] as const,
  projectStage: ['idea', 'concept', 'prefeasibility', 'feasibility', 'procurement'] as const,
  existingElements: ['capex', 'timeline', 'location', 'assessments', 'agency', 'none'] as const,
  investmentSize: ['under_1m', '1_5m', '5_20m', '20_50m', 'over_50m', 'unknown'] as const,
  yesNo: ['yes', 'no'] as const,
  fundingReceiver: ['municipality', 'utility', 'special_purpose_vehicle', 'ngo', 'other'] as const,
};

export const stakeholderSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['government', 'utility', 'private', 'community', 'ngo', 'dfi', 'philanthropy', 'contractor']),
});

export const targetFunderDataSchema = z.object({
  fundId: z.string(),
  fundName: z.string(),
  institution: z.string(),
  instrumentType: z.string(),
  whyFitReasons: z.array(z.string()),
  gapChecklist: z.array(z.object({
    id: z.string(),
    category: z.enum(['feasibility', 'safeguards', 'repayment', 'sovereign', 'aggregation']),
    text: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
  })),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const funderSelectionBlockSchema = z.object({
  status: z.enum(['NOT_STARTED', 'DRAFT', 'READY']).default('NOT_STARTED'),
  funderName: z.string().optional(),
  questionnaire: z.object({
    projectName: z.string().default(''),
    projectDescription: z.string().default(''),
    sectors: z.array(z.string()).default([]),
    projectStage: z.string().default(''),
    existingElements: z.array(z.string()).default([]),
    budgetPreparation: z.string().default(''),
    budgetImplementation: z.string().default(''),
    generatesRevenue: z.string().default(''),
    repaymentSource: z.string().default(''),
    investmentSize: z.string().default(''),
    fundingReceiver: z.string().default(''),
    canTakeDebt: z.string().default(''),
    nationalApproval: z.string().default(''),
    openToBundling: z.string().default(''),
  }),
  pathway: z.object({
    primary: z.string().default(''),
    secondary: z.string().optional(),
    readinessLevel: z.string().default(''),
    limitingFactors: z.array(z.string()).default([]),
  }),
  selectedFunds: z.array(z.string()).default([]),
  shortlistedFunds: z.array(z.string()).default([]),
  targetFunders: z.array(targetFunderDataSchema).default([]),
  bridgeParagraph: z.string().optional(),
});

export const selectedInterventionSchema = z.object({
  interventionId: z.string(),
  interventionName: z.string(),
  category: z.string(),
  estimatedCost: z.object({
    min: z.number(),
    max: z.number(),
    unit: z.string(),
  }),
  estimatedArea: z.number(),
  areaUnit: z.string(),
  impacts: z.object({
    flood: z.string(),
    heat: z.string(),
    landslide: z.string(),
  }),
  notes: z.string().optional(),
  addedAt: z.string(),
  assetId: z.string().optional(),
  assetName: z.string().optional(),
  assetType: z.string().optional(),
  osmId: z.number().optional(),
  centroid: z.tuple([z.number(), z.number()]).optional(),
});

export const selectedZoneSchema = z.object({
  zoneId: z.string(),
  zoneName: z.string().optional(),
  hazardType: z.enum(['FLOOD', 'HEAT', 'LANDSLIDE', 'FLOOD_HEAT', 'FLOOD_LANDSLIDE', 'HEAT_LANDSLIDE', 'LOW']),
  primaryHazard: z.string().optional(),
  secondaryHazard: z.string().optional(),
  riskScore: z.number().optional(),
  meanFlood: z.number().optional(),
  meanHeat: z.number().optional(),
  meanLandslide: z.number().optional(),
  area: z.number().optional(),
  areaKm2: z.number().optional(),
  populationSum: z.number().optional(),
  interventionType: z.string().optional(),
  interventionPortfolio: z.array(selectedInterventionSchema).default([]),
});

export const siteExplorerBlockSchema = z.object({
  status: z.enum(['NOT_STARTED', 'DRAFT', 'READY']).default('NOT_STARTED'),
  selectedZones: z.array(z.union([z.string(), selectedZoneSchema])).default([]),
  layerPreferences: z.record(z.string(), z.boolean()).default({}),
  hazardSummary: z.object({
    floodCells: z.number().default(0),
    heatCells: z.number().default(0),
    landslideCells: z.number().default(0),
    totalCells: z.number().default(0),
  }).default({}),
});

export const narrativeKPISchema = z.object({
  name: z.string(),
  valueRange: z.string(),
  unit: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  notes: z.string().optional(),
});

export const narrativeBlockSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string().default('summary'),
  lens: z.enum(['neutral', 'climate', 'social', 'financial', 'institutional']).default('neutral'),
  contentMd: z.string().default(''),
  content: z.string().optional(),
  kpis: z.array(narrativeKPISchema).optional(),
  assumptionsUsed: z.array(z.string()).optional(),
  evidenceTier: z.enum(['EVIDENCE', 'MODELLED', 'ASSUMPTION', 'NEEDS_VALIDATION']).default('ASSUMPTION'),
  dependencies: z.array(z.string()).optional(),
  included: z.boolean().default(true),
  order: z.number().optional(),
  category: z.string().optional(),
});

export const coBenefitCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.enum(['HEALTH', 'BIODIVERSITY', 'WATER_QUALITY', 'MOBILITY', 'EQUITY', 'ECONOMIC_VALUE', 'PUBLIC_REALM', 'INSTITUTIONAL_CAPACITY', 'OTHER']),
  description: z.string(),
  whoBenefits: z.array(z.string()),
  where: z.array(z.string()),
  kpiOrProxy: z.object({
    name: z.string(),
    valueRange: z.string(),
    unit: z.string(),
  }).nullable().optional(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  evidenceTier: z.enum(['EVIDENCE', 'MODELLED', 'ASSUMPTION', 'NEEDS_VALIDATION']),
  dependencies: z.array(z.string()).optional(),
  included: z.boolean(),
  userNotes: z.string(),
});

export const signalCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  whyItMatters: z.string(),
  triggeredBy: z.array(z.string()),
  ownerCandidates: z.array(z.string()),
  timeHorizon: z.enum(['0-2y', '3-7y', '8-12y', 'ongoing']),
  riskIfMissing: z.string(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  included: z.boolean(),
  userNotes: z.string(),
});

export const interventionBundleSchema = z.object({
  id: z.string(),
  name: z.string(),
  objective: z.string(),
  targetHazards: z.array(z.string()),
  interventions: z.array(z.string()),
  locations: z.array(z.object({
    zoneId: z.string(),
    name: z.string(),
    geometryType: z.string(),
  })),
  capexRange: z.object({
    low: z.number(),
    high: z.number(),
  }),
  enabled: z.boolean(),
});

export const prioritizationWeightsSchema = z.object({
  floodRiskReduction: z.number().min(0).max(5).default(4),
  heatReduction: z.number().min(0).max(5).default(4),
  landslideRiskReduction: z.number().min(0).max(5).default(3),
  socialEquity: z.number().min(0).max(5).default(5),
  costCertainty: z.number().min(0).max(5).default(3),
  biodiversityWaterQuality: z.number().min(0).max(5).default(4),
});

export const impactModelBlockSchema = z.object({
  status: z.enum(['NOT_STARTED', 'DRAFT', 'READY']).default('NOT_STARTED'),
  prioritizationWeights: prioritizationWeightsSchema.default({}),
  inheritedWeights: prioritizationWeightsSchema.optional(),
  interventionBundles: z.array(interventionBundleSchema).default([]),
  narrativeCache: z.object({
    base: z.array(narrativeBlockSchema).nullable().default(null),
    lensVariants: z.record(z.string(), z.array(narrativeBlockSchema)).default({}),
  }).default({}),
  coBenefits: z.array(coBenefitCardSchema).default([]),
  downstreamSignals: z.object({
    operations: z.array(signalCardSchema).default([]),
    businessModel: z.array(signalCardSchema).default([]),
    mrv: z.array(signalCardSchema).default([]),
    implementors: z.array(signalCardSchema).default([]),
  }).default({}),
  selectedLens: z.enum(['neutral', 'climate', 'social', 'financial', 'institutional']).default('neutral'),
  generationMeta: z.object({
    generatedAt: z.string(),
    model: z.string(),
    funderContext: z.string().optional(),
    cityContext: z.string().optional(),
  }).nullable().default(null),
});

export const operationsBlockSchema = z.object({
  status: z.enum(['NOT_STARTED', 'DRAFT', 'READY']).default('NOT_STARTED'),
  operatingModel: z.enum(['CITY_RUN', 'UTILITY_RUN', 'CONTRACTOR_RUN', 'COMMUNITY_STEWARDSHIP', 'HYBRID_SPLIT']).nullable().default(null),
  roles: z.object({
    assetOwnerEntityId: z.string().nullable().default(null),
    programOwnerEntityId: z.string().nullable().default(null),
    operatorEntityId: z.string().nullable().default(null),
    maintainerEntityId: z.string().nullable().default(null),
    verifierEntityId: z.string().nullable().default(null),
    communityRole: z.enum(['BENEFICIARY', 'STEWARD_OPERATOR', 'CO_OWNER_REVENUE_PARTICIPANT']).nullable().default(null),
    stewardshipScope: z.object({
      routineMaintenance: z.boolean().default(false),
      inspections: z.boolean().default(false),
      minorRepairs: z.boolean().default(false),
      monitoringSupport: z.boolean().default(false),
    }).default({}),
  }).default({}),
  serviceLevels: z.array(z.object({
    serviceType: z.enum(['COOLING', 'STORMWATER', 'SLOPE_STABILITY', 'MULTI_BENEFIT']),
    targetStatement: z.string(),
    proxyMetric: z.string(),
    inspectionFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL']),
  })).default([]),
  taskPlan: z.array(z.object({
    id: z.string(),
    category: z.string(),
    name: z.string(),
    frequency: z.string(),
    responsibleEntityId: z.string().nullable(),
    notes: z.string(),
  })).default([]),
  nbsExtensions: z.object({
    establishmentPeriodMonths: z.union([z.literal(12), z.literal(24), z.literal(36)]).default(24),
    maintenanceIntensity: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
    survivalTargetPercent: z.number().min(0).max(100).default(85),
    replacementPolicy: z.string().default(''),
    nbsAssetTypes: z.array(z.string()).default([]),
  }).default({}),
  omCostBand: z.object({
    low: z.number().default(0),
    mid: z.number().default(0),
    high: z.number().default(0),
    currency: z.string().default('USD'),
    basis: z.string().default(''),
    assumptions: z.string().default(''),
  }).default({}),
  omFunding: z.object({
    mechanisms: z.array(z.string()).default([]),
    durationYears: z.number().default(10),
  }).default({}),
  capacity: z.object({
    assessment: z.enum(['ADEQUATE', 'PARTIAL_NEEDS_SUPPORT', 'INADEQUATE']).nullable().default(null),
    notes: z.string().default(''),
  }).default({}),
  opsRisks: z.array(z.object({
    id: z.string(),
    riskType: z.string(),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    mitigation: z.string(),
  })).default([]),
  readiness: z.object({
    blockers: z.array(z.string()).default([]),
    checklist: z.object({
      operatingModelSelected: z.boolean().default(false),
      operatorAssigned: z.boolean().default(false),
      taskPlanPresent: z.boolean().default(false),
      fundingMechanismSelected: z.boolean().default(false),
      verifierSet: z.boolean().default(false),
    }).default({}),
  }).default({}),
});

export const businessModelBlockSchema = z.object({
  status: z.enum(['NOT_STARTED', 'DRAFT', 'READY']).default('NOT_STARTED'),
  primaryArchetype: z.enum(['PUBLIC_PROGRAM', 'UTILITY_SERVICE', 'SERVICE_CONTRACT', 'LAND_VALUE_CAPTURE', 'BLENDED_FINANCE', 'CREDIT_ADDON', 'INSURANCE_LINKED']).nullable().default(null),
  payerBeneficiaryMap: z.object({
    beneficiaries: z.array(z.object({
      stakeholderId: z.string(),
      benefitType: z.string().optional(),
    })).default([]),
    candidatePayers: z.array(z.object({
      stakeholderId: z.string(),
      mechanismHint: z.string().optional(),
    })).default([]),
    primaryPayerId: z.string().nullable().default(null),
  }).default({}),
  paymentMechanism: z.object({
    type: z.string().nullable().default(null),
    basis: z.string().nullable().default(null),
    durationYears: z.number().nullable().default(null),
    legalInstrumentHint: z.string().optional(),
  }).default({}),
  revenueStack: z.array(z.object({
    id: z.string(),
    revenueType: z.string(),
    role: z.enum(['PRIMARY_DURABLE', 'SECONDARY_SUPPORT', 'UPSIDE_OPTIONAL']),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    durationYears: z.number().optional(),
    prerequisites: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })).default([]),
  sourcesAndUsesRom: z.object({
    capexBand: z.object({
      low: z.number().optional(),
      mid: z.number().optional(),
      high: z.number().optional(),
      currency: z.string().optional(),
    }).optional(),
    opexBand: z.object({
      low: z.number().optional(),
      mid: z.number().optional(),
      high: z.number().optional(),
      currency: z.string().optional(),
    }).optional(),
    mrvBudgetBand: z.object({
      low: z.number().optional(),
      mid: z.number().optional(),
      high: z.number().optional(),
      currency: z.string().optional(),
    }).optional(),
    assumptions: z.string().optional(),
  }).default({}),
  financingPathway: z.object({
    pathway: z.enum(['PUBLIC_CAPEX', 'DFI_LOAN', 'MUNICIPAL_BOND', 'BLENDED_VEHICLE', 'PPP_LIGHT', 'PHILANTHROPY_ONLY']).nullable().default(null),
    rationale: z.string().optional(),
    eligibilityNotes: z.array(z.string()).optional(),
  }).default({}),
  enablingActions: z.array(z.object({
    id: z.string(),
    action: z.string(),
    category: z.string(),
    priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
    ownerStakeholderId: z.string().optional(),
  })).default([]),
  bmRisks: z.array(z.object({
    id: z.string(),
    riskType: z.string(),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    mitigation: z.string(),
  })).default([]),
  readiness: z.object({
    blockers: z.array(z.string()).default([]),
    checklist: z.object({
      primaryArchetypeSelected: z.boolean().default(false),
      primaryPayerSelected: z.boolean().default(false),
      oneHighConfidenceRevenueLine: z.boolean().default(false),
      durationSet: z.boolean().default(false),
      financingPathwaySelected: z.boolean().default(false),
      consistencyCheckedWithOps: z.boolean().default(false),
    }).default({}),
  }).default({}),
});

export const BLOCK_SCHEMAS = {
  funder_selection: funderSelectionBlockSchema,
  site_explorer: siteExplorerBlockSchema,
  impact_model: impactModelBlockSchema,
  operations: operationsBlockSchema,
  business_model: businessModelBlockSchema,
} as const;

export type FunderSelectionBlock = z.infer<typeof funderSelectionBlockSchema>;
export type SiteExplorerBlock = z.infer<typeof siteExplorerBlockSchema>;
export type ImpactModelBlock = z.infer<typeof impactModelBlockSchema>;
export type OperationsBlock = z.infer<typeof operationsBlockSchema>;
export type BusinessModelBlock = z.infer<typeof businessModelBlockSchema>;

export const patchOperationSchema = z.object({
  blockType: z.enum(['funder_selection', 'site_explorer', 'impact_model', 'operations', 'business_model']).optional(),
  path: z.string(),
  operation: z.enum(['set', 'merge', 'append', 'remove']),
  value: z.any(),
  evidenceRefs: z.array(z.string()).optional(),
  status: z.enum(['draft', 'confirmed']).default('draft'),
});

export const proposePatchRequestSchema = z.object({
  patches: z.array(patchOperationSchema),
  actor: z.enum(['user', 'agent', 'system']).default('user'),
  actorId: z.string().optional(),
  explanation: z.string().optional(),
});

export const applyPatchRequestSchema = z.object({
  patchIds: z.array(z.string()),
  actor: z.enum(['user', 'agent', 'system']).default('user'),
  actorId: z.string().optional(),
});

export type PatchOperation = z.infer<typeof patchOperationSchema>;
export type ProposePatchRequest = z.infer<typeof proposePatchRequestSchema>;
export type ApplyPatchRequest = z.infer<typeof applyPatchRequestSchema>;
