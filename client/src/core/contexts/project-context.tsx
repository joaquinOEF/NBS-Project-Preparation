import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { SAMPLE_PROJECT_ID as SAMPLE_PROJECT_ID_CONST } from '@shared/sample-constants';

export interface Stakeholder {
  id: string;
  name: string;
  type: 'government' | 'utility' | 'private' | 'community' | 'ngo' | 'dfi' | 'philanthropy' | 'contractor';
}

export interface Site {
  id: string;
  name: string;
  hazardType: 'FLOOD' | 'HEAT' | 'LANDSLIDE' | 'MULTI';
  interventionType: string;
}

export interface TargetFunderData {
  fundId: string;
  fundName: string;
  institution: string;
  instrumentType: string;
  whyFitReasons: string[];
  gapChecklist: Array<{
    id: string;
    category: 'feasibility' | 'safeguards' | 'repayment' | 'sovereign' | 'aggregation';
    text: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  confidence: 'high' | 'medium' | 'low';
}

export interface FundingProfile {
  profileId: string;
  status: 'draft' | 'completed';
  createdAt: string;
  lastUpdatedAt: string;
  version: number;
  questionnaire: {
    projectName: string;
    projectDescription: string;
    sectors: string[];
    projectStage: string;
    existingElements: string[];
    budgetPreparation: string;
    budgetImplementation: string;
    generatesRevenue: string;
    repaymentSource: string;
    investmentSize: string;
    fundingReceiver: string;
    canTakeDebt: string;
    nationalApproval: string;
    openToBundling: string;
  };
  derived: {
    financialReadinessLevel: 'grant_only' | 'preparation_needed' | 'loan_possible_domestic' | 'loan_possible_international';
    capitalReadiness: 'low' | 'medium' | 'high';
    safeguardsReadiness: 'low' | 'medium' | 'high';
  };
}

export interface FundingPlan {
  planId: string;
  status: 'draft' | 'confirmed';
  createdAt: string;
  lastUpdatedAt: string;
  version: number;
  selectedPathwayCategoryNow: string;
  selectedFunderNow: string | null;
  selectedFunderNowName: string | null;
  selectedPathwayCategoryNext: string | null;
  selectedFunderNext: string | null;
  selectedFunderNextName: string | null;
  selectionRationale: string;
  selectionSourceNow: 'recommended' | 'user_override';
  selectionSourceNext: 'recommended' | 'user_override' | 'none';
  systemFitAssessmentNow: 'high' | 'medium' | 'low';
  systemFitAssessmentNext: 'high' | 'medium' | 'low' | 'n/a';
  systemWarnings: string[];
  recommendedNowTop3: string[];
  recommendedNextTargets: string[];
  profileVersionUsed: number;
  profileSnapshot: {
    projectStage: string;
    sectors: string[];
    investmentSize: string;
    canTakeDebt: string;
    generatesRevenue: string;
  };
}

export interface FunderSelectionData {
  status: 'NOT_STARTED' | 'DRAFT' | 'READY';
  funderName?: string;
  questionnaire: {
    projectName: string;
    projectDescription: string;
    sectors: string[];
    projectStage: string;
    existingElements: string[];
    budgetPreparation: string;
    budgetImplementation: string;
    generatesRevenue: string;
    repaymentSource: string;
    investmentSize: string;
    fundingReceiver: string;
    canTakeDebt: string;
    nationalApproval: string;
    openToBundling: string;
  };
  pathway: {
    primary: string;
    secondary?: string;
    readinessLevel: string;
    limitingFactors: string[];
  };
  selectedFunds: string[];
  shortlistedFunds: string[];
  targetFunders: TargetFunderData[];
  bridgeParagraph?: string;
  fundingProfile?: FundingProfile;
  fundingPlan?: FundingPlan;
}

export interface OperationsData {
  status: 'NOT_STARTED' | 'DRAFT' | 'READY';
  operatingModel: 'CITY_RUN' | 'UTILITY_RUN' | 'CONTRACTOR_RUN' | 'COMMUNITY_STEWARDSHIP' | 'HYBRID_SPLIT' | null;
  roles: {
    assetOwnerEntityId: string | null;
    programOwnerEntityId: string | null;
    operatorEntityId: string | null;
    maintainerEntityId: string | null;
    verifierEntityId: string | null;
    communityRole: 'BENEFICIARY' | 'STEWARD_OPERATOR' | 'CO_OWNER_REVENUE_PARTICIPANT' | null;
    stewardshipScope: {
      routineMaintenance: boolean;
      inspections: boolean;
      minorRepairs: boolean;
      monitoringSupport: boolean;
    };
  };
  serviceLevels: Array<{
    serviceType: 'COOLING' | 'STORMWATER' | 'SLOPE_STABILITY' | 'MULTI_BENEFIT';
    targetStatement: string;
    proxyMetric: string;
    inspectionFrequency: 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL';
  }>;
  taskPlan: Array<{
    id: string;
    category: string;
    name: string;
    frequency: string;
    responsibleEntityId: string | null;
    notes: string;
  }>;
  nbsExtensions: {
    establishmentPeriodMonths: 12 | 24 | 36;
    maintenanceIntensity: 'LOW' | 'MEDIUM' | 'HIGH';
    survivalTargetPercent: number;
    replacementPolicy: string;
    nbsAssetTypes: string[];
  };
  omCostBand: {
    low: number;
    mid: number;
    high: number;
    currency: string;
    basis: string;
    assumptions: string;
  };
  omFunding: {
    mechanisms: string[];
    durationYears: number;
  };
  capacity: {
    assessment: 'ADEQUATE' | 'PARTIAL_NEEDS_SUPPORT' | 'INADEQUATE' | null;
    notes: string;
  };
  opsRisks: Array<{
    id: string;
    riskType: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    mitigation: string;
  }>;
  readiness: {
    blockers: string[];
    checklist: {
      operatingModelSelected: boolean;
      operatorAssigned: boolean;
      taskPlanPresent: boolean;
      fundingMechanismSelected: boolean;
      verifierSet: boolean;
    };
  };
}

export interface BusinessModelData {
  status: 'NOT_STARTED' | 'DRAFT' | 'READY';
  primaryArchetype: 'PUBLIC_PROGRAM' | 'UTILITY_SERVICE' | 'SERVICE_CONTRACT' | 'LAND_VALUE_CAPTURE' | 'BLENDED_FINANCE' | 'CREDIT_ADDON' | 'INSURANCE_LINKED' | null;
  payerBeneficiaryMap: {
    beneficiaries: Array<{ stakeholderId: string; benefitType?: string }>;
    candidatePayers: Array<{ stakeholderId: string; mechanismHint?: string }>;
    primaryPayerId: string | null;
  };
  paymentMechanism: {
    type: string | null;
    basis: string | null;
    durationYears: number | null;
    legalInstrumentHint?: string;
  };
  revenueStack: Array<{
    id: string;
    revenueType: string;
    role: 'PRIMARY_DURABLE' | 'SECONDARY_SUPPORT' | 'UPSIDE_OPTIONAL';
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    durationYears?: number;
    prerequisites?: string[];
    notes?: string;
  }>;
  sourcesAndUsesRom: {
    capexBand?: { low?: number; mid?: number; high?: number; currency?: string };
    opexBand?: { low?: number; mid?: number; high?: number; currency?: string };
    mrvBudgetBand?: { low?: number; mid?: number; high?: number; currency?: string };
    assumptions?: string;
  };
  financingPathway: {
    pathway: 'PUBLIC_CAPEX' | 'DFI_LOAN' | 'MUNICIPAL_BOND' | 'BLENDED_VEHICLE' | 'PPP_LIGHT' | 'PHILANTHROPY_ONLY' | null;
    rationale?: string;
    eligibilityNotes?: string[];
  };
  enablingActions: Array<{
    id: string;
    action: string;
    category: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    ownerStakeholderId?: string;
  }>;
  bmRisks: Array<{
    id: string;
    riskType: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    mitigation: string;
  }>;
  readiness: {
    blockers: string[];
    checklist: {
      primaryArchetypeSelected: boolean;
      primaryPayerSelected: boolean;
      oneHighConfidenceRevenueLine: boolean;
      durationSet: boolean;
      financingPathwaySelected: boolean;
      consistencyCheckedWithOps: boolean;
    };
  };
}

export type LensType = 'neutral' | 'climate' | 'social' | 'financial' | 'institutional';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type EvidenceTier = 'EVIDENCE' | 'MODELLED' | 'ASSUMPTION' | 'NEEDS_VALIDATION';
export type TimeHorizon = '0-2y' | '3-7y' | '8-12y' | 'ongoing';
export type CoBenefitCategory = 'HEALTH' | 'BIODIVERSITY' | 'WATER_QUALITY' | 'MOBILITY' | 'EQUITY' | 'ECONOMIC_VALUE' | 'PUBLIC_REALM' | 'INSTITUTIONAL_CAPACITY' | 'OTHER';

export interface NarrativeKPI {
  name: string;
  valueRange: string;
  unit: string;
  confidence: ConfidenceLevel;
  notes?: string;
}

export interface NarrativeBlock {
  id: string;
  title: string;
  type: 'summary' | 'context' | 'theory_of_change' | 'portfolio_overview' | 'expected_impacts' | 'co_benefits' | 'synergies' | 'assumptions' | 'risks_and_dependencies' | 'mrvs_stub';
  lens: LensType;
  contentMd: string;
  kpis?: NarrativeKPI[];
  assumptionsUsed?: string[];
  evidenceTier: EvidenceTier;
  dependencies?: string[];
  included: boolean;
  order?: number;
}

export interface CoBenefitCard {
  id: string;
  title: string;
  category: CoBenefitCategory;
  description: string;
  whoBenefits: string[];
  where: string[];
  kpiOrProxy?: { name: string; valueRange: string; unit: string } | null;
  confidence: ConfidenceLevel;
  evidenceTier: EvidenceTier;
  dependencies?: string[];
  included: boolean;
  userNotes: string;
}

export interface SignalCard {
  id: string;
  title: string;
  description: string;
  whyItMatters: string;
  triggeredBy: string[];
  ownerCandidates: string[];
  timeHorizon: TimeHorizon;
  riskIfMissing: string;
  confidence: ConfidenceLevel;
  included: boolean;
  userNotes: string;
}

export interface PrioritizationWeights {
  floodRiskReduction: number;
  heatReduction: number;
  landslideRiskReduction: number;
  socialEquity: number;
  costCertainty: number;
  biodiversityWaterQuality: number;
}

export interface InterventionBundle {
  id: string;
  name: string;
  objective: string;
  targetHazards: string[];
  interventions: string[];
  locations: Array<{ zoneId: string; name: string; geometryType: string }>;
  capexRange: { low: number; high: number };
  enabled: boolean;
}

export interface ImpactModelData {
  status: 'NOT_STARTED' | 'DRAFT' | 'READY';
  prioritizationWeights: PrioritizationWeights;
  inheritedWeights: PrioritizationWeights;
  interventionBundles: InterventionBundle[];
  narrativeCache: {
    base: NarrativeBlock[] | null;
    lensVariants: Record<LensType, NarrativeBlock[]>;
  };
  coBenefits: CoBenefitCard[];
  downstreamSignals: {
    operations: SignalCard[];
    businessModel: SignalCard[];
    mrv: SignalCard[];
    implementors: SignalCard[];
  };
  selectedLens: LensType;
  generationMeta: {
    generatedAt: string;
    model: string;
    funderContext?: string;
    cityContext?: string;
  } | null;
}

export interface SelectedIntervention {
  interventionId: string;
  interventionName: string;
  category: string;
  estimatedCost: { min: number; max: number; unit: string };
  estimatedArea: number;
  areaUnit: string;
  impacts: { flood: string; heat: string; landslide: string };
  notes?: string;
  addedAt: string;
  assetId?: string;
  assetName?: string;
  assetType?: string;
  osmId?: number;
  centroid?: [number, number];
}

export interface SelectedZone {
  zoneId: string;
  zoneName?: string;
  hazardType: 'FLOOD' | 'HEAT' | 'LANDSLIDE' | 'FLOOD_HEAT' | 'FLOOD_LANDSLIDE' | 'HEAT_LANDSLIDE' | 'LOW';
  primaryHazard?: string;
  secondaryHazard?: string;
  riskScore?: number;
  meanFlood?: number;
  meanHeat?: number;
  meanLandslide?: number;
  area?: number;
  areaKm2?: number;
  populationSum?: number;
  interventionType?: string;
  interventionPortfolio: SelectedIntervention[];
}

export interface SiteExplorerData {
  selectedZones: (string | SelectedZone)[];
  layerPreferences: Record<string, boolean>;
  hazardSummary: {
    floodCells: number;
    heatCells: number;
    landslideCells: number;
    totalCells: number;
  };
}

export interface ProjectContextData {
  projectId: string;
  projectName: string;
  projectDescription: string;
  actionType: 'mitigation' | 'adaptation';
  cityId: string;
  cityName: string;
  cityLocode: string;
  stakeholders: Stakeholder[];
  sites: Site[];
  hazardFocus: string[];
  funderSelection: FunderSelectionData | null;
  operations: OperationsData | null;
  businessModel: BusinessModelData | null;
  siteExplorer: SiteExplorerData | null;
  impactModel: ImpactModelData | null;
  lastUpdated: {
    funderSelection?: string;
    operations?: string;
    businessModel?: string;
    siteExplorer?: string;
    impactModel?: string;
  };
}

const PROJECT_CONTEXT_KEY = 'nbs_project_context';

const defaultFunderSelection: FunderSelectionData = {
  status: 'NOT_STARTED',
  questionnaire: {
    projectName: '',
    projectDescription: '',
    sectors: [],
    projectStage: '',
    existingElements: [],
    budgetPreparation: '',
    budgetImplementation: '',
    generatesRevenue: '',
    repaymentSource: '',
    investmentSize: '',
    fundingReceiver: '',
    canTakeDebt: '',
    nationalApproval: '',
    openToBundling: '',
  },
  pathway: {
    primary: '',
    readinessLevel: '',
    limitingFactors: [],
  },
  selectedFunds: [],
  shortlistedFunds: [],
  targetFunders: [],
};

export const sampleFunderSelection: FunderSelectionData = {
  status: 'DRAFT',
  funderName: 'Green Climate Fund',
  questionnaire: {
    projectName: 'Nature Based Solutions for Climate Resilience',
    projectDescription: 'Implement green infrastructure including wetlands, bioswales, and urban forests for flood management and cooling.',
    sectors: ['CLIMATE', 'WATER', 'URBAN_DEVELOPMENT'],
    projectStage: 'PREPARATION',
    existingElements: ['FEASIBILITY_STUDY', 'STAKEHOLDER_MAPPING'],
    budgetPreparation: 'USD_100K_500K',
    budgetImplementation: 'USD_5M_20M',
    generatesRevenue: 'PARTIAL',
    repaymentSource: 'USER_FEES',
    investmentSize: 'USD_5M_20M',
    fundingReceiver: 'MUNICIPAL_GOVERNMENT',
    canTakeDebt: 'YES_WITH_SOVEREIGN',
    nationalApproval: 'NOT_REQUIRED',
    openToBundling: 'YES',
  },
  pathway: {
    primary: 'BLENDED_FINANCE',
    secondary: 'PUBLIC_PROGRAM',
    readinessLevel: 'CONCEPT_NOTE',
    limitingFactors: ['MRV_CAPACITY', 'LOCAL_CAPACITY'],
  },
  selectedFunds: ['GCF', 'AF'],
  shortlistedFunds: ['GCF', 'AF', 'CIF', 'GEF'],
  targetFunders: [
    {
      fundId: 'idb-esp',
      fundName: 'IDB Specific Investment Loan (ESP)',
      institution: 'IDB (Inter-American Development Bank)',
      instrumentType: 'loan',
      whyFitReasons: [
        'Sector alignment with resilient transport and water infrastructure',
        'Eligible borrower type: municipal government',
        'MDB anchor provides concessional terms and technical support',
      ],
      gapChecklist: [
        { id: 'feasibility-study', category: 'feasibility', text: 'Complete pre-feasibility and feasibility study', priority: 'high' },
        { id: 'sovereign-approval', category: 'sovereign', text: 'Confirm sovereign/national approval pathway and guarantee feasibility', priority: 'high' },
      ],
      confidence: 'medium',
    },
  ],
  bridgeParagraph: 'Use the recommended project preparation support to develop the feasibility studies and safeguard documents required by IDB. This creates a clear pathway from early-stage to investment-ready.',
};

export const sampleSiteExplorer: SiteExplorerData = {
  selectedZones: [
    {
      zoneId: 'zone_14',
      zoneName: 'Centro Histórico',
      hazardType: 'FLOOD',
      primaryHazard: 'FLOOD',
      secondaryHazard: 'HEAT',
      riskScore: 0.78,
      meanFlood: 0.72,
      meanHeat: 0.45,
      meanLandslide: 0.08,
      area: 45000,
      areaKm2: 45,
      populationSum: 156000,
      interventionType: 'sponge_network',
      interventionPortfolio: [
        {
          interventionId: 'floodable_park',
          interventionName: 'Floodable Park / Detention Basin',
          category: 'flood_storage',
          estimatedCost: { min: 2250000, max: 13500000, unit: 'USD' },
          estimatedArea: 45,
          areaUnit: 'ha',
          impacts: { flood: 'high', heat: 'medium', landslide: 'low' },
          addedAt: '2026-01-14T10:00:00.000Z',
        },
      ],
    },
    {
      zoneId: 'zone_12',
      zoneName: 'Zona Sul Residencial',
      hazardType: 'HEAT',
      primaryHazard: 'HEAT',
      secondaryHazard: 'FLOOD',
      riskScore: 0.85,
      meanFlood: 0.42,
      meanHeat: 0.62,
      meanLandslide: 0.03,
      area: 32000,
      areaKm2: 103,
      populationSum: 830967,
      interventionType: 'cooling_network',
      interventionPortfolio: [],
    },
    {
      zoneId: 'zone_5',
      zoneName: 'Morro da Cruz',
      hazardType: 'LANDSLIDE',
      primaryHazard: 'LANDSLIDE',
      secondaryHazard: 'FLOOD',
      riskScore: 0.65,
      meanFlood: 0.35,
      meanHeat: 0.28,
      meanLandslide: 0.58,
      area: 28000,
      areaKm2: 28,
      populationSum: 45000,
      interventionType: 'slope_stabilization',
      interventionPortfolio: [],
    },
  ],
  layerPreferences: {
    flood: true,
    heat: true,
    landslide: true,
    vegetation: true,
    population: true,
  },
  hazardSummary: {
    floodCells: 156,
    heatCells: 234,
    landslideCells: 89,
    totalCells: 479,
  },
};

interface ProjectContextValue {
  context: ProjectContextData | null;
  loadContext: (projectId: string) => ProjectContextData | null;
  saveContext: (data: Partial<ProjectContextData>) => void;
  updateModule: <K extends keyof Pick<ProjectContextData, 'funderSelection' | 'operations' | 'businessModel' | 'siteExplorer' | 'impactModel'>>(
    module: K,
    data: ProjectContextData[K]
  ) => void;
  getContextSummary: () => Record<string, any>;
  clearContext: (projectId: string) => void;
  migrateExistingData: (projectId: string, projectInfo: { name: string; description: string; actionType: string; cityId: string; cityName: string; cityLocode: string }) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

const getDbProjectId = (projectId: string): string => {
  if (projectId.startsWith('sample-')) {
    return SAMPLE_PROJECT_ID_CONST;
  }
  return projectId;
};

export function ProjectContextProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<ProjectContextData | null>(null);

  const syncAllModulesToDatabase = useCallback(async (projectId: string, contextData: ProjectContextData) => {
    const dbProjectId = getDbProjectId(projectId);
    const modules = ['funderSelection', 'siteExplorer', 'impactModel', 'operations', 'businessModel'] as const;
    const blockTypeMap: Record<string, string> = {
      funderSelection: 'funder_selection',
      siteExplorer: 'site_explorer',
      impactModel: 'impact_model',
      operations: 'operations',
      businessModel: 'business_model',
    };
    
    for (const module of modules) {
      const moduleData = contextData[module];
      if (moduleData) {
        try {
          await fetch(`/api/projects/${dbProjectId}/blocks/${blockTypeMap[module]}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: moduleData, status: (moduleData as unknown as Record<string, unknown>).status || 'DRAFT', actor: 'user' }),
          });
        } catch (e) {
          console.warn(`Failed to sync ${module} to database:`, e);
        }
      }
    }
    console.log('Synced all modules to database');
  }, []);

  const loadContext = useCallback((projectId: string): ProjectContextData | null => {
    try {
      const stored = localStorage.getItem(`${PROJECT_CONTEXT_KEY}_${projectId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as ProjectContextData;
        setContext(parsed);
        
        syncAllModulesToDatabase(projectId, parsed);
        
        return parsed;
      }
    } catch (e) {
      console.error('Failed to load project context:', e);
    }
    return null;
  }, [syncAllModulesToDatabase]);

  const saveContext = useCallback((data: Partial<ProjectContextData>) => {
    if (!data.projectId && !context?.projectId) return;
    
    const projectId = data.projectId || context!.projectId;
    const updated: ProjectContextData = {
      ...context,
      ...data,
      projectId,
    } as ProjectContextData;
    
    setContext(updated);
    localStorage.setItem(`${PROJECT_CONTEXT_KEY}_${projectId}`, JSON.stringify(updated));
  }, [context]);

  const syncModuleToDatabase = useCallback(async (
    projectId: string,
    module: string,
    moduleData: unknown
  ) => {
    try {
      const dbProjectId = getDbProjectId(projectId);
      const blockTypeMap: Record<string, string> = {
        funderSelection: 'funder_selection',
        siteExplorer: 'site_explorer',
        impactModel: 'impact_model',
        operations: 'operations',
        businessModel: 'business_model',
      };
      const blockType = blockTypeMap[module];
      if (!blockType || !moduleData) return;

      const dataObj = moduleData as Record<string, unknown>;
      await fetch(`/api/projects/${dbProjectId}/blocks/${blockType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: moduleData, status: dataObj.status || 'DRAFT', actor: 'user' }),
      });
    } catch (e) {
      console.warn('Failed to sync module to database:', e);
    }
  }, []);

  const updateModule = useCallback(<K extends keyof Pick<ProjectContextData, 'funderSelection' | 'operations' | 'businessModel' | 'siteExplorer' | 'impactModel'>>(
    module: K,
    data: ProjectContextData[K]
  ) => {
    if (!context) return;
    
    const updated: ProjectContextData = {
      ...context,
      [module]: data,
      lastUpdated: {
        ...context.lastUpdated,
        [module]: new Date().toISOString(),
      },
    };
    
    setContext(updated);
    localStorage.setItem(`${PROJECT_CONTEXT_KEY}_${context.projectId}`, JSON.stringify(updated));
    
    syncModuleToDatabase(context.projectId, module, data);
  }, [context, syncModuleToDatabase]);

  const getContextSummary = useCallback(() => {
    if (!context) return {};
    
    return {
      project: {
        id: context.projectId,
        name: context.projectName,
        description: context.projectDescription,
        actionType: context.actionType,
        city: {
          id: context.cityId,
          name: context.cityName,
          locode: context.cityLocode,
        },
      },
      stakeholders: context.stakeholders,
      sites: context.sites,
      hazardFocus: context.hazardFocus,
      modules: {
        funderSelection: context.funderSelection ? {
          status: context.funderSelection.status,
          pathway: context.funderSelection.pathway.primary,
          readinessLevel: context.funderSelection.pathway.readinessLevel,
          selectedFunds: context.funderSelection.selectedFunds.length,
        } : null,
        operations: context.operations ? {
          status: context.operations.status,
          operatingModel: context.operations.operatingModel,
          costBand: context.operations.omCostBand,
          fundingMechanisms: context.operations.omFunding.mechanisms,
        } : null,
        businessModel: context.businessModel ? {
          status: context.businessModel.status,
          archetype: context.businessModel.primaryArchetype,
          primaryPayer: context.businessModel.payerBeneficiaryMap.primaryPayerId,
          revenueLines: context.businessModel.revenueStack.length,
          financingPathway: context.businessModel.financingPathway.pathway,
        } : null,
        siteExplorer: context.siteExplorer ? {
          selectedZones: context.siteExplorer.selectedZones.length,
          hazardSummary: context.siteExplorer.hazardSummary,
        } : null,
        impactModel: context.impactModel ? {
          status: context.impactModel.status,
          coBenefitsCount: context.impactModel.coBenefits.length,
          signalsCount: Object.values(context.impactModel.downstreamSignals).flat().length,
          selectedLens: context.impactModel.selectedLens,
          hasNarrative: !!context.impactModel.narrativeCache.base,
        } : null,
      },
      lastUpdated: context.lastUpdated,
    };
  }, [context]);

  const clearContext = useCallback((projectId: string) => {
    localStorage.removeItem(`${PROJECT_CONTEXT_KEY}_${projectId}`);
    setContext(null);
  }, []);

  const migrateExistingData = useCallback((
    projectId: string, 
    projectInfo: { name: string; description: string; actionType: string; cityId: string; cityName: string; cityLocode: string }
  ) => {
    const existingContext = localStorage.getItem(`${PROJECT_CONTEXT_KEY}_${projectId}`);
    if (existingContext) {
      loadContext(projectId);
      return;
    }

    const omData = localStorage.getItem(`nbs_operations_om_${projectId}`);
    const bmData = localStorage.getItem(`nbs_business_model_${projectId}`);

    const defaultStakeholders: Stakeholder[] = [
      { id: 'city-env', name: 'City Environment Department', type: 'government' },
      { id: 'city-works', name: 'City Public Works', type: 'government' },
      { id: 'city-finance', name: 'City Finance Department', type: 'government' },
      { id: 'smam', name: 'SMAM - Environmental Secretariat', type: 'government' },
      { id: 'dmae', name: 'DMAE - Water and Sewage Department', type: 'utility' },
      { id: 'property-owners', name: 'Property Owners Association', type: 'private' },
      { id: 'developers', name: 'Real Estate Developers', type: 'private' },
      { id: 'community-assoc', name: 'Neighborhood Associations', type: 'community' },
      { id: 'ngo-verde', name: 'Porto Alegre Verde NGO', type: 'ngo' },
      { id: 'dfi-iadb', name: 'Inter-American Development Bank', type: 'dfi' },
      { id: 'foundation', name: 'Climate Adaptation Foundation', type: 'philanthropy' },
      { id: 'contractor-1', name: 'Green Infrastructure Services Ltd', type: 'contractor' },
    ];

    const defaultSites: Site[] = [
      { id: 'zone-1', name: 'Centro Histórico Sponge Zone', hazardType: 'FLOOD', interventionType: 'sponge_network' },
      { id: 'zone-2', name: 'Cidade Baixa Cooling Corridor', hazardType: 'HEAT', interventionType: 'cooling_network' },
      { id: 'zone-3', name: 'Morro Santana Slope Stabilization', hazardType: 'LANDSLIDE', interventionType: 'slope_stabilization' },
      { id: 'zone-4', name: 'Guaíba Waterfront Multi-Benefit', hazardType: 'MULTI', interventionType: 'multi_benefit' },
    ];

    const newContext: ProjectContextData = {
      projectId,
      projectName: projectInfo.name,
      projectDescription: projectInfo.description,
      actionType: projectInfo.actionType as 'mitigation' | 'adaptation',
      cityId: projectInfo.cityId,
      cityName: projectInfo.cityName,
      cityLocode: projectInfo.cityLocode,
      stakeholders: defaultStakeholders,
      sites: defaultSites,
      hazardFocus: ['FLOOD', 'HEAT', 'LANDSLIDE'],
      funderSelection: { ...sampleFunderSelection },
      operations: omData ? JSON.parse(omData) : null,
      businessModel: bmData ? JSON.parse(bmData) : null,
      siteExplorer: { ...sampleSiteExplorer },
      impactModel: null,
      lastUpdated: {
        operations: omData ? new Date().toISOString() : undefined,
        businessModel: bmData ? new Date().toISOString() : undefined,
      },
    };

    setContext(newContext);
    localStorage.setItem(`${PROJECT_CONTEXT_KEY}_${projectId}`, JSON.stringify(newContext));
  }, [loadContext]);

  return (
    <ProjectContext.Provider value={{
      context,
      loadContext,
      saveContext,
      updateModule,
      getContextSummary,
      clearContext,
      migrateExistingData,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within a ProjectContextProvider');
  }
  return context;
}
