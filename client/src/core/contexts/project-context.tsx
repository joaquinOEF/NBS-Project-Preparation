import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
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

export interface ModuleNavigation {
  currentStep: number;
  showResults?: boolean;
  additionalState?: Record<string, unknown>;
}

export interface FunderSelectionData {
  status: 'NOT_STARTED' | 'DRAFT' | 'READY';
  funderName?: string;
  navigation?: ModuleNavigation;
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
  shortlistedFunds: string[];
  targetFunders: TargetFunderData[];
  bridgeParagraph?: string;
  fundingProfile?: FundingProfile;
  fundingPlan?: FundingPlan;
}

export interface OperationsData {
  status: 'NOT_STARTED' | 'DRAFT' | 'READY';
  navigation?: ModuleNavigation;
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
  navigation?: ModuleNavigation;
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
  userEdited?: boolean;
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

export interface QuantifiedKPI {
  id: string;
  name: string;
  metric: string;
  valueRange: { low: number; high: number };
  unit: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidenceTier: 'EVIDENCE' | 'MODELLED' | 'ASSUMPTION';
  sourceChunkIds: string[];
  methodology: string;
  userEvidenceSource?: string;
}

export interface QuantifiedImpactGroup {
  id: string;
  hazardType: string;
  interventionBundle: string;
  kpis: QuantifiedKPI[];
}

export interface QuantifiedCoBenefit {
  id: string;
  title: string;
  category: string;
  metric: string;
  valueRange: { low: number; high: number } | null;
  unit: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidenceTier: 'EVIDENCE' | 'MODELLED' | 'ASSUMPTION';
  sourceChunkIds: string[];
  whoBenefits: string[];
  where: string[];
}

export interface MRVIndicator {
  id: string;
  name: string;
  metric: string;
  baselineValue: string;
  targetValue: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'BIANNUAL';
  dataSource: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface QuantifyResponse {
  impactGroups: QuantifiedImpactGroup[];
  coBenefits: QuantifiedCoBenefit[];
  mrvIndicators: MRVIndicator[];
  evidenceContext: {
    chunksUsed: number;
    topSources: Array<{ title: string; score: number }>;
    searchQueries: string[];
  };
  generationMeta: { generatedAt: string; model: string; ragChunksUsed: number };
}

export interface ImpactModelData {
  status: 'NOT_STARTED' | 'DRAFT' | 'READY';
  navigation?: ModuleNavigation;
  interventionBundles: InterventionBundle[];
  quantifiedImpacts: QuantifyResponse | null;
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
  source?: 'osm' | 'manual';
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
  navigation?: ModuleNavigation;
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
      zoneId: 'arquipelago',
      zoneName: 'Arquipélago',
      hazardType: 'FLOOD',
      primaryHazard: 'FLOOD',
      secondaryHazard: undefined,
      riskScore: 0.58,
      meanFlood: 0.58,
      meanHeat: 0.08,
      meanLandslide: 0.0,
      area: 65697,
      areaKm2: 65.7,
      populationSum: 8330,
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
      zoneId: 'centro_historico',
      zoneName: 'Centro Histórico',
      hazardType: 'HEAT',
      primaryHazard: 'HEAT',
      secondaryHazard: 'FLOOD',
      riskScore: 0.60,
      meanFlood: 0.39,
      meanHeat: 0.60,
      meanLandslide: 0.0,
      area: 2425,
      areaKm2: 2.4,
      populationSum: 39154,
      interventionType: 'cooling_network',
      interventionPortfolio: [],
    },
    {
      zoneId: 'cascata',
      zoneName: 'Cascata',
      hazardType: 'LANDSLIDE',
      primaryHazard: 'LANDSLIDE',
      secondaryHazard: undefined,
      riskScore: 0.34,
      meanFlood: 0.28,
      meanHeat: 0.16,
      meanLandslide: 0.34,
      area: 5366,
      areaKm2: 5.4,
      populationSum: 23133,
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
  loadContext: (projectId: string, options?: { skipDbSync?: boolean }) => ProjectContextData | null;
  saveContext: (data: Partial<ProjectContextData>) => void;
  updateModule: <K extends keyof Pick<ProjectContextData, 'funderSelection' | 'operations' | 'businessModel' | 'siteExplorer' | 'impactModel'>>(
    module: K,
    data: ProjectContextData[K],
    options?: { skipDbSync?: boolean }
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

const DB_SYNC_DEBOUNCE_MS = 400;

export function ProjectContextProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<ProjectContextData | null>(null);
  const dbSyncedProjects = useRef<Set<string>>(new Set());
  const dbSyncInProgress = useRef<Set<string>>(new Set());
  // Mirror of latest context — lets callbacks below have [] deps, so their
  // identity is stable across renders and consumer effects don't loop.
  const contextRef = useRef<ProjectContextData | null>(null);
  useEffect(() => { contextRef.current = context; }, [context]);
  // Debounce + generation counter prevents ping-pong writes and lets a late
  // response lose to a newer local edit.
  const dbSyncTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const dbSyncGenerationRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const timers = dbSyncTimersRef.current;
    return () => {
      timers.forEach(t => clearTimeout(t));
      timers.clear();
    };
  }, []);

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

  const loadContext = useCallback((projectId: string, options?: { skipDbSync?: boolean }): ProjectContextData | null => {
    try {
      const stored = localStorage.getItem(`${PROJECT_CONTEXT_KEY}_${projectId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as ProjectContextData;
        setContext(parsed);
        
        const shouldSkipSync = options?.skipDbSync || 
          dbSyncedProjects.current.has(projectId) || 
          dbSyncInProgress.current.has(projectId);
        
        if (!shouldSkipSync) {
          dbSyncInProgress.current.add(projectId);
          
          const dbProjectId = getDbProjectId(projectId);
          const blockTypeMap: Record<string, keyof Pick<ProjectContextData, 'funderSelection' | 'siteExplorer' | 'impactModel' | 'operations' | 'businessModel'>> = {
            funder_selection: 'funderSelection',
            site_explorer: 'siteExplorer',
            impact_model: 'impactModel',
            operations: 'operations',
            business_model: 'businessModel',
          };
          
          Promise.all(
            Object.keys(blockTypeMap).map(blockType =>
              fetch(`/api/projects/${dbProjectId}/blocks/${blockType}`)
                .then(res => res.ok ? res.json() : null)
                .catch(() => null)
            )
          ).then(results => {
            dbSyncInProgress.current.delete(projectId);
            dbSyncedProjects.current.add(projectId);
            
            const blockTypes = Object.keys(blockTypeMap);
            let hasUpdates = false;
            const updatedContext = { ...parsed };
            
            results.forEach((result, idx) => {
              if (result?.data) {
                const moduleKey = blockTypeMap[blockTypes[idx]];
                const dbData = result.data;
                const localData = parsed[moduleKey];
                
                if (dbData && JSON.stringify(dbData) !== JSON.stringify(localData)) {
                  (updatedContext as Record<string, unknown>)[moduleKey] = dbData;
                  hasUpdates = true;
                }
              }
            });
            
            if (hasUpdates) {
              setContext(updatedContext);
              localStorage.setItem(`${PROJECT_CONTEXT_KEY}_${projectId}`, JSON.stringify(updatedContext));
              console.log('Merged database updates into local context');
            }
          }).catch(() => {
            dbSyncInProgress.current.delete(projectId);
          });
        }
        
        return parsed;
      }
    } catch (e) {
      console.error('Failed to load project context:', e);
    }
    return null;
  }, []);

  const saveContext = useCallback((data: Partial<ProjectContextData>) => {
    const current = contextRef.current;
    const projectId = data.projectId || current?.projectId;
    if (!projectId) return;

    const updated: ProjectContextData = {
      ...current,
      ...data,
      projectId,
    } as ProjectContextData;

    setContext(updated);
    localStorage.setItem(`${PROJECT_CONTEXT_KEY}_${projectId}`, JSON.stringify(updated));
  }, []);

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

      // For funder_selection, prevent overwriting newer DB data with stale local data
      if (module === 'funderSelection') {
        const currentDbRes = await fetch(`/api/projects/${dbProjectId}/blocks/funder_selection`);
        if (currentDbRes.ok) {
          const currentDb = await currentDbRes.json();
          const dbPlan = currentDb?.data?.fundingPlan;
          const localPlan = (moduleData as Record<string, unknown>)?.fundingPlan as Record<string, unknown> | undefined;
          
          if (dbPlan?.status === 'confirmed') {
            // Only sync if local data also has a confirmed plan
            if (!localPlan || localPlan.status !== 'confirmed') {
              console.log('Skipping sync: DB has confirmed plan, local does not');
              return;
            }
            
            // Compare timestamps - don't overwrite if DB has newer data
            const dbTimestamp = dbPlan.lastUpdatedAt ? new Date(dbPlan.lastUpdatedAt as string).getTime() : 0;
            const localTimestamp = localPlan.lastUpdatedAt ? new Date(localPlan.lastUpdatedAt as string).getTime() : 0;
            
            if (dbTimestamp > localTimestamp) {
              console.log('Skipping sync: DB fundingPlan is newer than local', { dbTimestamp, localTimestamp });
              return;
            }
            
            // Also check if DB has a different selectedFunderNow and we're about to overwrite with old value
            if (dbPlan.selectedFunderNow !== localPlan.selectedFunderNow) {
              // DB was updated (likely by agent patches) - don't overwrite unless local timestamp is genuinely newer
              if (dbTimestamp >= localTimestamp - 1000) { // 1 second tolerance
                console.log('Skipping sync: DB has different funder selection, avoiding overwrite', {
                  dbFunder: dbPlan.selectedFunderNow,
                  localFunder: localPlan.selectedFunderNow
                });
                return;
              }
            }
          }
        }
      }

      const dataObj = moduleData as Record<string, unknown>;
      const res = await fetch(`/api/projects/${dbProjectId}/blocks/${blockType}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: moduleData, status: dataObj.status || 'DRAFT', actor: 'user' }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error(`Failed to sync ${module} to database:`, errorData);
        if (errorData.errors) {
          console.error('Validation errors:', JSON.stringify(errorData.errors, null, 2));
        }
      } else {
        console.log(`[ProjectContext] Synced ${module} to database successfully`);
      }
    } catch (e) {
      console.error('Failed to sync module to database:', e);
    }
  }, []);

  const scheduleDbSync = useCallback((projectId: string, module: string, data: unknown) => {
    const key = `${projectId}:${module}`;
    const timers = dbSyncTimersRef.current;
    const generations = dbSyncGenerationRef.current;
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    const generation = (generations.get(key) ?? 0) + 1;
    generations.set(key, generation);
    const timer = setTimeout(() => {
      timers.delete(key);
      // Only sync if our generation is still the latest — a newer write
      // will have bumped the generation and queued its own timer.
      if (generations.get(key) === generation) {
        syncModuleToDatabase(projectId, module, data);
      }
    }, DB_SYNC_DEBOUNCE_MS);
    timers.set(key, timer);
  }, [syncModuleToDatabase]);

  const updateModule = useCallback(<K extends keyof Pick<ProjectContextData, 'funderSelection' | 'operations' | 'businessModel' | 'siteExplorer' | 'impactModel'>>(
    module: K,
    data: ProjectContextData[K],
    options?: { skipDbSync?: boolean }
  ) => {
    const current = contextRef.current;
    if (!current) return;

    // [JitterDebug] Log every updateModule call with caller stack.
    const stack = new Error().stack?.split('\n').slice(2, 6).join(' | ') ?? '(no stack)';
    const summary = module === 'funderSelection'
      ? `selectedFunderNow=${(data as unknown as { fundingPlan?: { selectedFunderNow?: string | null } } | null)?.fundingPlan?.selectedFunderNow ?? '(n/a)'} status=${(data as unknown as { status?: string } | null)?.status ?? '(n/a)'}`
      : '';
    // eslint-disable-next-line no-console
    console.log(`[JitterDebug] updateModule(${module}) ${summary} skipDb=${options?.skipDbSync ?? false} caller: ${stack}`);

    const updated: ProjectContextData = {
      ...current,
      [module]: data,
      lastUpdated: {
        ...current.lastUpdated,
        [module]: new Date().toISOString(),
      },
    };

    setContext(updated);
    localStorage.setItem(`${PROJECT_CONTEXT_KEY}_${current.projectId}`, JSON.stringify(updated));

    // Skip DB sync for navigation-only updates to prevent overwriting domain data
    if (!options?.skipDbSync) {
      scheduleDbSync(current.projectId, module, data);
    }
  }, [scheduleDbSync]);

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
          selectedFunder: context.funderSelection.fundingPlan?.selectedFunderNow || null,
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
      { id: 'arquipelago', name: 'Arquipélago Sponge Network', hazardType: 'FLOOD', interventionType: 'sponge_network' },
      { id: 'centro_historico', name: 'Centro Histórico Cooling Corridor', hazardType: 'HEAT', interventionType: 'cooling_network' },
      { id: 'cascata', name: 'Cascata Slope Stabilization', hazardType: 'LANDSLIDE', interventionType: 'slope_stabilization' },
      { id: 'humaita', name: 'Humaitá Waterfront Multi-Benefit', hazardType: 'MULTI', interventionType: 'multi_benefit' },
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
