import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'wouter';
import { ArrowLeft, Check, Building2, Users, ClipboardList, DollarSign, AlertTriangle, FileText, Copy, ChevronDown, ChevronUp, Plus, Trash2, GripVertical, Sparkles, ExternalLink, Info, Lightbulb, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useNavigationPersistence } from '@/core/hooks/useNavigationPersistence';
import { Button } from '@/core/components/ui/button';
import { Header } from '@/core/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/core/components/ui/card';
import { Badge } from '@/core/components/ui/badge';
import { Progress } from '@/core/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/core/components/ui/radio-group';
import { Checkbox } from '@/core/components/ui/checkbox';
import { Label } from '@/core/components/ui/label';
import { Input } from '@/core/components/ui/input';
import { Textarea } from '@/core/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/core/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/core/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/core/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/core/components/ui/tooltip';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/core/components/ui/accordion';
import { useTranslation } from 'react-i18next';
import { useSampleData } from '@/core/contexts/sample-data-context';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';
import { useToast } from '@/core/hooks/use-toast';
import { useProjectContext } from '@/core/contexts/project-context';

type OperatingModel = 'CITY_RUN' | 'UTILITY_RUN' | 'CONTRACTOR_RUN' | 'COMMUNITY_STEWARDSHIP' | 'HYBRID_SPLIT' | null;
type CommunityRole = 'BENEFICIARY' | 'STEWARD_OPERATOR' | 'CO_OWNER_REVENUE_PARTICIPANT' | null;
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type CapacityAssessment = 'ADEQUATE' | 'PARTIAL_NEEDS_SUPPORT' | 'INADEQUATE' | null;
type OMStatus = 'NOT_STARTED' | 'DRAFT' | 'READY';
type CommitmentLevel = 'CONFIRMED' | 'PLANNED' | 'IDEA';
type SkillLevel = 'BASIC' | 'SPECIALIZED' | 'EXPERT';
type TaskTiming = 'MORNING' | 'AFTERNOON' | 'FLEXIBLE' | 'SEASONAL';
type TaskUrgency = 'CRITICAL' | 'STANDARD' | 'DEFERRABLE';
type FundingCategory = 'PUBLIC_UTILITY' | 'CONTRACTED_STRUCTURED' | 'CATALYTIC_TRANSITIONAL';

interface Stakeholder {
  id: string;
  name: string;
  type: string;
  confirmed?: boolean;
  contactName?: string;
  contactEmail?: string;
}

interface Site {
  id: string;
  name: string;
  hazardType: string;
  interventionType: string;
}

interface Task {
  id: string;
  category: 'ESTABLISHMENT' | 'ROUTINE_MAINTENANCE' | 'INSPECTION' | 'REPAIR_REPLACEMENT' | 'EXTREME_EVENT_RESPONSE';
  name: string;
  frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL' | 'EVENT_TRIGGERED';
  responsibleEntityId: string | null;
  notes: string;
  isEstablishmentOnly?: boolean;
  skillLevel?: SkillLevel;
  timing?: TaskTiming;
  urgency?: TaskUrgency;
  costDriver?: boolean;
}

interface ServiceLevel {
  serviceType: 'COOLING' | 'STORMWATER' | 'SLOPE_STABILITY' | 'MULTI_BENEFIT';
  targetStatement: string;
  proxyMetric: string;
  inspectionFrequency: 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL';
}

interface OperationalRisk {
  id: string;
  riskType: string;
  riskLevel: RiskLevel;
  hidden?: boolean;
  mitigation: string;
  ownerId?: string | null;
  trigger?: string;
  mitigationActions?: string[];
  linkedSignals?: string[];
}

interface FundingSource {
  id: string;
  mechanism: string;
  category: FundingCategory;
  isPrimary: boolean;
  commitmentLevel: CommitmentLevel;
  notes?: string;
}

interface PhasedCostBand {
  low: number;
  mid: number;
  high: number;
  assumptions: string;
}

interface SiteOverride {
  siteId: string;
  operatingModelOverride?: OperatingModel;
  operatorOverride?: string | null;
  taskOverrides?: { taskId: string; excluded?: boolean; frequencyOverride?: Task['frequency'] }[];
  costMultiplier?: number;
}

interface OperationsOMData {
  status: OMStatus;
  operatingModel: OperatingModel;
  roles: {
    assetOwnerEntityId: string | null;
    programOwnerEntityId: string | null;
    operatorEntityId: string | null;
    maintainerEntityId: string | null;
    verifierEntityId: string | null;
    mrvIntegratorEntityId?: string | null;
    communityRole: CommunityRole;
    stewardshipScope: {
      routineMaintenance: boolean;
      inspections: boolean;
      minorRepairs: boolean;
      monitoringSupport: boolean;
    };
  };
  serviceLevels: ServiceLevel[];
  taskPlan: Task[];
  nbsExtensions: {
    establishmentPeriodMonths: 12 | 24 | 36;
    maintenanceIntensity: 'LOW' | 'MEDIUM' | 'HIGH';
    survivalTargetPercent: number;
    replacementPolicy: 'REPLACE_30D' | 'REPLACE_90D' | 'ANNUAL_CYCLE';
    nbsAssetTypes: string[];
    establishmentPeriodEnabled?: boolean;
    phasedCosts?: {
      establishment?: { low?: number; mid?: number; high?: number };
      ongoing?: { low?: number; mid?: number; high?: number };
    };
  };
  omCostBand: {
    low: number;
    mid: number;
    high: number;
    currency?: string;
    basis: 'PER_ASSET' | 'PER_HECTARE' | 'PER_KM' | 'PER_SITE' | 'PORTFOLIO';
    assumptions: string;
  };
  nbsPhasedCosts?: {
    establishment: PhasedCostBand;
    ongoing: PhasedCostBand;
  };
  omFunding: {
    mechanisms: string[];
    durationYears: 1 | 3 | 5 | 10;
    primaryMechanism?: string | null;
    commitmentLevels?: Record<string, CommitmentLevel>;
  };
  fundingSources?: FundingSource[];
  siteOverrides?: SiteOverride[];
  capacity: {
    assessment: CapacityAssessment;
    notes: string;
  };
  opsRisks: OperationalRisk[];
  readiness: {
    blockers: string[];
    checklist: {
      operatingModelSelected: boolean;
      operatorAssigned: boolean;
      taskPlanPresent: boolean;
      fundingMechanismSelected: boolean;
      verifierSet: boolean;
      costBandDefined?: boolean;
      primaryFundingSelected?: boolean;
    };
  };
  customStakeholders?: Stakeholder[];
}

const SAMPLE_STAKEHOLDERS: Stakeholder[] = [
  { id: 'city-env', name: 'City Environment Department', type: 'government' },
  { id: 'city-works', name: 'City Public Works', type: 'government' },
  { id: 'city-parks', name: 'City Parks Department', type: 'government' },
  { id: 'smam', name: 'SMAM - Environmental Secretariat', type: 'government' },
  { id: 'dmae', name: 'DMAE - Water and Sewage Department', type: 'utility' },
  { id: 'community-assoc', name: 'Neighborhood Associations', type: 'community' },
  { id: 'ngo-verde', name: 'Porto Alegre Verde NGO', type: 'ngo' },
  { id: 'contractor-1', name: 'Green Infrastructure Services Ltd', type: 'contractor' },
];

const SAMPLE_SITES: Site[] = [
  { id: 'arquipelago', name: 'Arquipélago Sponge Network', hazardType: 'FLOOD', interventionType: 'sponge_network' },
  { id: 'centro_historico', name: 'Centro Histórico Cooling Corridor', hazardType: 'HEAT', interventionType: 'cooling_network' },
  { id: 'cascata', name: 'Cascata Slope Stabilization', hazardType: 'LANDSLIDE', interventionType: 'slope_stabilization' },
  { id: 'humaita', name: 'Humaitá Waterfront Multi-Benefit', hazardType: 'MULTI', interventionType: 'multi_benefit' },
];

const OPERATING_MODELS = [
  { id: 'CITY_RUN', icon: Building2, color: 'blue' },
  { id: 'UTILITY_RUN', icon: Building2, color: 'cyan' },
  { id: 'CONTRACTOR_RUN', icon: Users, color: 'purple' },
  { id: 'COMMUNITY_STEWARDSHIP', icon: Users, color: 'green' },
  { id: 'HYBRID_SPLIT', icon: Users, color: 'orange' },
];

const TASK_LIBRARY: Record<string, Task[]> = {
  sponge_network: [
    { id: 't1', category: 'ESTABLISHMENT', name: 'Plant bioswale vegetation', frequency: 'EVENT_TRIGGERED', responsibleEntityId: null, notes: '' },
    { id: 't2', category: 'ROUTINE_MAINTENANCE', name: 'Clear debris from rain gardens', frequency: 'MONTHLY', responsibleEntityId: null, notes: '' },
    { id: 't3', category: 'INSPECTION', name: 'Inspect drainage capacity', frequency: 'QUARTERLY', responsibleEntityId: null, notes: '' },
    { id: 't4', category: 'REPAIR_REPLACEMENT', name: 'Replace failed plantings', frequency: 'ANNUAL', responsibleEntityId: null, notes: '' },
    { id: 't5', category: 'EXTREME_EVENT_RESPONSE', name: 'Post-flood damage assessment', frequency: 'EVENT_TRIGGERED', responsibleEntityId: null, notes: '' },
  ],
  cooling_network: [
    { id: 't6', category: 'ESTABLISHMENT', name: 'Plant shade trees', frequency: 'EVENT_TRIGGERED', responsibleEntityId: null, notes: '' },
    { id: 't7', category: 'ROUTINE_MAINTENANCE', name: 'Prune and water trees', frequency: 'MONTHLY', responsibleEntityId: null, notes: '' },
    { id: 't8', category: 'INSPECTION', name: 'Tree health assessment', frequency: 'BIANNUAL', responsibleEntityId: null, notes: '' },
    { id: 't9', category: 'REPAIR_REPLACEMENT', name: 'Replace dead trees', frequency: 'ANNUAL', responsibleEntityId: null, notes: '' },
  ],
  slope_stabilization: [
    { id: 't10', category: 'ESTABLISHMENT', name: 'Plant slope vegetation', frequency: 'EVENT_TRIGGERED', responsibleEntityId: null, notes: '' },
    { id: 't11', category: 'ROUTINE_MAINTENANCE', name: 'Maintain slope drainage', frequency: 'QUARTERLY', responsibleEntityId: null, notes: '' },
    { id: 't12', category: 'INSPECTION', name: 'Slope stability monitoring', frequency: 'MONTHLY', responsibleEntityId: null, notes: '' },
    { id: 't13', category: 'EXTREME_EVENT_RESPONSE', name: 'Post-storm erosion check', frequency: 'EVENT_TRIGGERED', responsibleEntityId: null, notes: '' },
  ],
  multi_benefit: [
    { id: 't14', category: 'ESTABLISHMENT', name: 'Install green infrastructure', frequency: 'EVENT_TRIGGERED', responsibleEntityId: null, notes: '' },
    { id: 't15', category: 'ROUTINE_MAINTENANCE', name: 'General landscape maintenance', frequency: 'MONTHLY', responsibleEntityId: null, notes: '' },
    { id: 't16', category: 'INSPECTION', name: 'Multi-hazard assessment', frequency: 'QUARTERLY', responsibleEntityId: null, notes: '' },
  ],
};

const DEFAULT_RISKS: OperationalRisk[] = [
  { id: 'r1', riskType: 'PERFORMANCE_DECLINE', riskLevel: 'MEDIUM', mitigation: '', ownerId: null, trigger: '', mitigationActions: [], linkedSignals: [] },
  { id: 'r2', riskType: 'EXTREME_EVENTS', riskLevel: 'HIGH', mitigation: '', ownerId: null, trigger: '', mitigationActions: [], linkedSignals: [] },
  { id: 'r3', riskType: 'FUNDING_GAP', riskLevel: 'MEDIUM', mitigation: '', ownerId: null, trigger: '', mitigationActions: [], linkedSignals: ['unconfirmed_funding'] },
  { id: 'r4', riskType: 'GOVERNANCE_FAILURE', riskLevel: 'LOW', mitigation: '', ownerId: null, trigger: '', mitigationActions: [], linkedSignals: ['missing_operator'] },
];

const NBS_SPECIFIC_RISKS: OperationalRisk[] = [
  { id: 'r5', riskType: 'PLANT_MORTALITY', riskLevel: 'MEDIUM', mitigation: '', ownerId: null, trigger: 'Survival rate below target', mitigationActions: ['increase_watering', 'soil_amendment', 'species_replacement'], linkedSignals: [] },
  { id: 'r6', riskType: 'COMMUNITY_ENGAGEMENT_LOSS', riskLevel: 'MEDIUM', mitigation: '', ownerId: null, trigger: '', mitigationActions: ['regular_communication', 'benefit_sharing', 'training_programs'], linkedSignals: ['partial_community_capacity'] },
  { id: 'r7', riskType: 'SEASONAL_STRESS', riskLevel: 'HIGH', mitigation: '', ownerId: null, trigger: 'Dry season or heat wave', mitigationActions: ['irrigation_schedule', 'mulching', 'shade_structures'], linkedSignals: [] },
];

const SUGGESTED_MITIGATION_ACTIONS: Record<string, string[]> = {
  PERFORMANCE_DECLINE: ['increase_inspection_frequency', 'early_intervention_protocol', 'performance_bonuses'],
  EXTREME_EVENTS: ['emergency_response_plan', 'insurance_coverage', 'redundant_systems'],
  FUNDING_GAP: ['reserve_fund', 'alternative_sources', 'phased_implementation'],
  GOVERNANCE_FAILURE: ['clear_roles', 'regular_meetings', 'escalation_procedures'],
  PLANT_MORTALITY: ['increase_watering', 'soil_amendment', 'species_replacement'],
  COMMUNITY_ENGAGEMENT_LOSS: ['regular_communication', 'benefit_sharing', 'training_programs'],
  SEASONAL_STRESS: ['irrigation_schedule', 'mulching', 'shade_structures'],
};

const FUNDING_MECHANISMS = [
  'CITY_BUDGET_LINE',
  'RING_FENCED_FEE_ALLOCATION',
  'MULTI_YEAR_SERVICE_CONTRACT',
  'DISTRICT_LEVY_BID',
  'PHILANTHROPY_ESTABLISHMENT_GRANT',
  'DEVELOPER_MAINTENANCE_ESCROW',
];

const FUNDING_SOURCES_BY_CATEGORY: Record<FundingCategory, string[]> = {
  PUBLIC_UTILITY: ['CITY_BUDGET_LINE', 'RING_FENCED_FEE_ALLOCATION', 'UTILITY_SURCHARGE'],
  CONTRACTED_STRUCTURED: ['MULTI_YEAR_SERVICE_CONTRACT', 'DISTRICT_LEVY_BID', 'DEVELOPER_MAINTENANCE_ESCROW'],
  CATALYTIC_TRANSITIONAL: ['PHILANTHROPY_ESTABLISHMENT_GRANT', 'CLIMATE_FUND_GRANT', 'BLENDED_FINANCE'],
};

const CURRENCIES = ['USD', 'EUR', 'BRL', 'GBP', 'CAD', 'AUD'];

const DEFAULT_ASSUMPTIONS_TEMPLATE = `• Labor: Based on local wage rates for maintenance crews
• Materials: Annual vegetation replacement at 10-15% mortality
• Equipment: Shared across sites, prorated allocation
• Contingency: 15% buffer for unforeseen repairs
• Inflation: Assumed 3% annual increase`;

const TOP_COST_DRIVERS = [
  { id: 'watering', category: 'ROUTINE_MAINTENANCE' },
  { id: 'inspections', category: 'INSPECTION' },
  { id: 'replacements', category: 'REPAIR_REPLACEMENT' },
  { id: 'debris_removal', category: 'ROUTINE_MAINTENANCE' },
  { id: 'pruning', category: 'ROUTINE_MAINTENANCE' },
];

const OM_STORAGE_KEY = 'nbs_operations_om';

function getFundingCategory(mechanism: string): FundingCategory {
  for (const [category, mechanisms] of Object.entries(FUNDING_SOURCES_BY_CATEGORY)) {
    if (mechanisms.includes(mechanism)) {
      return category as FundingCategory;
    }
  }
  return 'PUBLIC_UTILITY';
}

function getStoredOMData(projectId: string): OperationsOMData | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(`${OM_STORAGE_KEY}_${projectId}`);
  if (!stored) return null;
  
  const parsed = JSON.parse(stored);
  if (parsed.readiness?.checklist) {
    parsed.readiness.checklist = {
      operatingModelSelected: false,
      operatorAssigned: false,
      taskPlanPresent: false,
      fundingMechanismSelected: false,
      verifierSet: false,
      costBandDefined: false,
      primaryFundingSelected: false,
      ...parsed.readiness.checklist,
    };
  }
  return parsed;
}

function saveOMData(projectId: string, data: OperationsOMData) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${OM_STORAGE_KEY}_${projectId}`, JSON.stringify(data));
  }
}

function buildInitialOMData(actionType: string, sites: Site[]): OperationsOMData {
  const isNBS = actionType === 'adaptation';
  const primaryHazard = sites[0]?.hazardType || 'FLOOD';
  const interventionType = sites[0]?.interventionType || 'sponge_network';
  
  const serviceLevels: ServiceLevel[] = [];
  if (primaryHazard === 'FLOOD' || primaryHazard === 'MULTI') {
    serviceLevels.push({
      serviceType: 'STORMWATER',
      targetStatement: 'Maintain 80% stormwater capture during 10-year storm events',
      proxyMetric: 'Volume captured (m³/event)',
      inspectionFrequency: 'QUARTERLY',
    });
  }
  if (primaryHazard === 'HEAT' || primaryHazard === 'MULTI') {
    serviceLevels.push({
      serviceType: 'COOLING',
      targetStatement: 'Reduce peak temperature by 2-3°C in intervention zones',
      proxyMetric: 'Temperature differential (°C)',
      inspectionFrequency: 'BIANNUAL',
    });
  }
  if (primaryHazard === 'LANDSLIDE') {
    serviceLevels.push({
      serviceType: 'SLOPE_STABILITY',
      targetStatement: 'Prevent slope failures through vegetation stabilization',
      proxyMetric: 'Vegetation cover (%)',
      inspectionFrequency: 'MONTHLY',
    });
  }

  const baseTasks = TASK_LIBRARY[interventionType] || TASK_LIBRARY.multi_benefit;
  const taskPlan = baseTasks.map(t => ({
    ...t,
    id: `${t.id}-${Date.now()}`,
    isEstablishmentOnly: t.category === 'ESTABLISHMENT',
    skillLevel: t.category === 'INSPECTION' ? 'SPECIALIZED' as SkillLevel : 'BASIC' as SkillLevel,
    timing: 'FLEXIBLE' as TaskTiming,
    urgency: t.category === 'EXTREME_EVENT_RESPONSE' ? 'CRITICAL' as TaskUrgency : 'STANDARD' as TaskUrgency,
    costDriver: ['ROUTINE_MAINTENANCE', 'REPAIR_REPLACEMENT'].includes(t.category),
  }));

  const initialRisks = isNBS 
    ? [...DEFAULT_RISKS, ...NBS_SPECIFIC_RISKS].map(r => ({ ...r }))
    : DEFAULT_RISKS.map(r => ({ ...r }));

  const initialFundingSources: FundingSource[] = [
    { id: 'fs1', mechanism: 'CITY_BUDGET_LINE', category: 'PUBLIC_UTILITY', isPrimary: true, commitmentLevel: 'PLANNED' },
  ];
  if (isNBS) {
    initialFundingSources.push({ id: 'fs2', mechanism: 'PHILANTHROPY_ESTABLISHMENT_GRANT', category: 'CATALYTIC_TRANSITIONAL', isPrimary: false, commitmentLevel: 'IDEA' });
  }

  return {
    status: 'NOT_STARTED',
    operatingModel: isNBS ? 'COMMUNITY_STEWARDSHIP' : 'CITY_RUN',
    roles: {
      assetOwnerEntityId: 'city-env',
      programOwnerEntityId: 'smam',
      operatorEntityId: isNBS ? 'community-assoc' : 'city-parks',
      maintainerEntityId: isNBS ? 'community-assoc' : 'city-works',
      verifierEntityId: null,
      mrvIntegratorEntityId: null,
      communityRole: isNBS ? 'STEWARD_OPERATOR' : 'BENEFICIARY',
      stewardshipScope: {
        routineMaintenance: true,
        inspections: true,
        minorRepairs: false,
        monitoringSupport: true,
      },
    },
    serviceLevels,
    taskPlan,
    nbsExtensions: {
      establishmentPeriodMonths: 24,
      maintenanceIntensity: 'MEDIUM',
      survivalTargetPercent: 85,
      replacementPolicy: 'REPLACE_90D',
      nbsAssetTypes: ['URBAN_TREES_CORRIDORS', 'BIOSWALES_RAIN_GARDENS'],
      establishmentPeriodEnabled: isNBS,
    },
    omCostBand: {
      low: 50000,
      mid: 100000,
      high: 200000,
      currency: 'BRL',
      basis: 'PER_SITE',
      assumptions: 'Annual O&M costs based on 10-year lifecycle',
    },
    nbsPhasedCosts: isNBS ? {
      establishment: { low: 80000, mid: 150000, high: 250000, assumptions: 'Years 1-2: Higher intensity watering, replanting, monitoring' },
      ongoing: { low: 30000, mid: 60000, high: 100000, assumptions: 'Year 3+: Steady-state maintenance after establishment' },
    } : undefined,
    omFunding: {
      mechanisms: ['CITY_BUDGET_LINE', 'PHILANTHROPY_ESTABLISHMENT_GRANT'],
      durationYears: 5,
    },
    fundingSources: initialFundingSources,
    siteOverrides: [],
    capacity: {
      assessment: 'PARTIAL_NEEDS_SUPPORT',
      notes: '',
    },
    opsRisks: initialRisks,
    customStakeholders: [],
    readiness: {
      blockers: [],
      checklist: {
        operatingModelSelected: false,
        operatorAssigned: false,
        taskPlanPresent: false,
        fundingMechanismSelected: false,
        verifierSet: false,
        costBandDefined: false,
        primaryFundingSelected: false,
      },
    },
  };
}

export default function ProjectOperationsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isSampleMode, sampleActions } = useSampleData();
  const { isSampleRoute, routePrefix } = useSampleRoute();
  const { loadContext, updateModule, context } = useProjectContext();

  // Separate navigation persistence from domain data
  const { 
    navigationState: savedNavState, 
    updateNavigationState, 
    navigationRestored 
  } = useNavigationPersistence({
    projectId,
    moduleName: 'operations',
  });

  const [currentStep, setCurrentStep] = useState(0);
  const [omData, setOMData] = useState<OperationsOMData | null>(null);
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [stakeholderModalOpen, setStakeholderModalOpen] = useState(false);
  const [editingStakeholder, setEditingStakeholder] = useState<Stakeholder | null>(null);
  const [newStakeholder, setNewStakeholder] = useState<Partial<Stakeholder>>({ name: '', type: 'other', confirmed: false });
  const [dataHydrated, setDataHydrated] = useState(false);

  const action = sampleActions.find(a => a.id === projectId);
  const isNBS = action?.type === 'adaptation';
  const sites = SAMPLE_SITES;
  
  const allStakeholders = [...SAMPLE_STAKEHOLDERS, ...(omData?.customStakeholders || [])];

  // Restore navigation from dedicated hook
  useEffect(() => {
    if (navigationRestored && savedNavState) {
      setCurrentStep(savedNavState.currentStep ?? 0);
    }
  }, [navigationRestored, savedNavState]);

  // Load operations data
  useEffect(() => {
    if (projectId) {
      const stored = getStoredOMData(projectId);
      if (stored) {
        setOMData(stored);
      } else {
        const initial = buildInitialOMData(action?.type || 'adaptation', sites);
        setOMData(initial);
      }
      setDataHydrated(true);
    }
  }, [projectId, action?.type]);

  // Persist navigation using dedicated hook (completely separate from domain data)
  useEffect(() => {
    if (!navigationRestored) return;
    updateNavigationState({ currentStep });
  }, [currentStep, navigationRestored, updateNavigationState]);

  // React to external updates to operations (agent/ChatDrawer).
  // ChatDrawer writes through updateModule, which updates context AND localStorage;
  // we read back through getStoredOMData to preserve the existing hydration path.
  const lastSyncedOperationsRef = useRef<unknown>(undefined);
  useEffect(() => {
    const slice = context?.operations;
    if (!slice || slice === lastSyncedOperationsRef.current) return;
    lastSyncedOperationsRef.current = slice;
    const stored = getStoredOMData(projectId || '');
    if (stored) {
      setOMData(stored);
    }
  }, [context?.operations, projectId]);

  useEffect(() => {
    if (projectId && omData) {
      const updatedData = { ...omData };
      const hasPrimaryFunding = omData.fundingSources?.some(fs => fs.isPrimary) ?? false;
      const costBandDefined = omData.omCostBand.mid > 0;
      
      updatedData.readiness.checklist = {
        operatingModelSelected: omData.operatingModel !== null,
        operatorAssigned: omData.roles.operatorEntityId !== null,
        taskPlanPresent: omData.taskPlan.length > 0,
        fundingMechanismSelected: omData.omFunding.mechanisms.length > 0 || (omData.fundingSources?.length ?? 0) > 0,
        verifierSet: omData.roles.verifierEntityId !== null,
        costBandDefined,
        primaryFundingSelected: hasPrimaryFunding,
      };
      
      const blockers: string[] = [];
      if (!updatedData.readiness.checklist.operatingModelSelected) blockers.push('selectOperatingModel');
      if (!updatedData.readiness.checklist.operatorAssigned) blockers.push('assignOperator');
      if (!updatedData.readiness.checklist.taskPlanPresent) blockers.push('defineTaskPlan');
      if (!updatedData.readiness.checklist.fundingMechanismSelected) blockers.push('selectFunding');
      if (!updatedData.readiness.checklist.verifierSet) blockers.push('assignVerifier');
      if (!updatedData.readiness.checklist.costBandDefined) blockers.push('defineCostBand');
      if (!updatedData.readiness.checklist.primaryFundingSelected) blockers.push('selectPrimaryFunding');
      
      updatedData.readiness.blockers = blockers;
      
      const allRequired = updatedData.readiness.checklist.operatingModelSelected &&
        updatedData.readiness.checklist.operatorAssigned &&
        updatedData.readiness.checklist.taskPlanPresent &&
        updatedData.readiness.checklist.fundingMechanismSelected &&
        updatedData.readiness.checklist.costBandDefined;
      
      updatedData.status = allRequired ? 'READY' : (omData.operatingModel ? 'DRAFT' : 'NOT_STARTED');
      
      saveOMData(projectId, updatedData);
    }
  }, [projectId, omData]);

  const updateOMData = (updates: Partial<OperationsOMData>) => {
    if (omData) {
      setOMData({ ...omData, ...updates });
    }
  };

  const steps = [
    { id: 'overview', icon: FileText },
    { id: 'operatingModel', icon: Building2 },
    { id: 'roles', icon: Users },
    { id: 'taskPlan', icon: ClipboardList },
    { id: 'funding', icon: DollarSign },
    { id: 'capacityAndRisk', icon: AlertTriangle },
    { id: 'playbookReview', icon: FileText },
  ];

  const canAccessReadiness = (): boolean => {
    if (!omData) return false;
    return omData.readiness.checklist.operatingModelSelected &&
      omData.readiness.checklist.operatorAssigned &&
      omData.readiness.checklist.taskPlanPresent &&
      omData.readiness.checklist.fundingMechanismSelected &&
      omData.readiness.checklist.verifierSet;
  };

  const canNavigateToStep = (stepIndex: number): boolean => {
    if (stepIndex < 5) return true;
    return canAccessReadiness();
  };

  const getStakeholderName = (id: string | null) => {
    if (!id) return t('om.notAssigned');
    return allStakeholders.find(s => s.id === id)?.name || id;
  };

  const getStakeholder = (id: string | null): Stakeholder | undefined => {
    if (!id) return undefined;
    return allStakeholders.find(s => s.id === id);
  };

  const isStakeholderConfirmed = (id: string | null): boolean => {
    if (!id) return false;
    const stakeholder = getStakeholder(id);
    return stakeholder?.confirmed ?? SAMPLE_STAKEHOLDERS.some(s => s.id === id);
  };

  const addCustomStakeholder = () => {
    if (!omData || !newStakeholder.name) return;
    const id = `custom-${Date.now()}`;
    const stakeholder: Stakeholder = {
      id,
      name: newStakeholder.name,
      type: newStakeholder.type || 'other',
      confirmed: newStakeholder.confirmed ?? false,
      contactName: newStakeholder.contactName,
      contactEmail: newStakeholder.contactEmail,
    };
    updateOMData({
      customStakeholders: [...(omData.customStakeholders || []), stakeholder],
    });
    setNewStakeholder({ name: '', type: 'other', confirmed: false });
    setStakeholderModalOpen(false);
    toast({ title: t('om.stakeholderAdded'), description: stakeholder.name });
  };

  const updateCustomStakeholder = (id: string, updates: Partial<Stakeholder>) => {
    if (!omData) return;
    const customStakeholders = (omData.customStakeholders || []).map(s =>
      s.id === id ? { ...s, ...updates } : s
    );
    updateOMData({ customStakeholders });
  };

  const removeCustomStakeholder = (id: string) => {
    if (!omData) return;
    updateOMData({
      customStakeholders: (omData.customStakeholders || []).filter(s => s.id !== id),
    });
  };

  const addTask = () => {
    if (!omData) return;
    const newTask: Task = {
      id: `task-${Date.now()}`,
      category: 'ROUTINE_MAINTENANCE',
      name: '',
      frequency: 'MONTHLY',
      responsibleEntityId: null,
      notes: '',
      isEstablishmentOnly: false,
      skillLevel: 'BASIC',
      timing: 'FLEXIBLE',
      urgency: 'STANDARD',
      costDriver: false,
    };
    updateOMData({ taskPlan: [...omData.taskPlan, newTask] });
  };

  const removeTask = (taskId: string) => {
    if (!omData) return;
    updateOMData({ taskPlan: omData.taskPlan.filter(t => t.id !== taskId) });
  };

  const moveTask = (taskId: string, direction: 'up' | 'down') => {
    if (!omData) return;
    const tasks = [...omData.taskPlan];
    const index = tasks.findIndex(t => t.id === taskId);
    if (index === -1) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= tasks.length) return;
    [tasks[index], tasks[newIndex]] = [tasks[newIndex], tasks[index]];
    updateOMData({ taskPlan: tasks });
  };

  const addFundingSource = (mechanism: string, category: FundingCategory) => {
    if (!omData) return;
    const existingSources = omData.fundingSources || [];
    if (existingSources.some(fs => fs.mechanism === mechanism)) return;
    const newSource: FundingSource = {
      id: `fs-${Date.now()}`,
      mechanism,
      category,
      isPrimary: existingSources.length === 0,
      commitmentLevel: 'IDEA',
    };
    updateOMData({ fundingSources: [...existingSources, newSource] });
  };

  const removeFundingSource = (id: string) => {
    if (!omData) return;
    const remaining = (omData.fundingSources || []).filter(fs => fs.id !== id);
    if (remaining.length > 0 && !remaining.some(fs => fs.isPrimary)) {
      remaining[0].isPrimary = true;
    }
    updateOMData({ fundingSources: remaining });
  };

  const setPrimaryFundingSource = (id: string) => {
    if (!omData) return;
    const fundingSources = (omData.fundingSources || []).map(fs => ({
      ...fs,
      isPrimary: fs.id === id,
    }));
    updateOMData({ fundingSources });
  };

  const updateFundingSourceCommitment = (id: string, commitmentLevel: CommitmentLevel) => {
    if (!omData) return;
    const fundingSources = (omData.fundingSources || []).map(fs =>
      fs.id === id ? { ...fs, commitmentLevel } : fs
    );
    updateOMData({ fundingSources });
  };

  const insertAssumptionsTemplate = () => {
    if (!omData) return;
    updateOMData({
      omCostBand: { ...omData.omCostBand, assumptions: DEFAULT_ASSUMPTIONS_TEMPLATE },
    });
  };

  const addRisk = (riskType: string) => {
    if (!omData) return;
    if (omData.opsRisks.some(r => r.riskType === riskType && !r.hidden)) return;
    const newRisk: OperationalRisk = {
      id: `risk-${Date.now()}`,
      riskType,
      riskLevel: 'MEDIUM',
      mitigation: '',
      ownerId: null,
      trigger: '',
      mitigationActions: [],
      linkedSignals: [],
    };
    updateOMData({ opsRisks: [...omData.opsRisks, newRisk] });
  };

  const removeRisk = (riskId: string) => {
    if (!omData) return;
    updateOMData({ opsRisks: omData.opsRisks.filter(r => r.id !== riskId) });
  };

  const toggleRiskHidden = (riskId: string) => {
    if (!omData) return;
    const opsRisks = omData.opsRisks.map(r =>
      r.id === riskId ? { ...r, hidden: !r.hidden } : r
    );
    updateOMData({ opsRisks });
  };

  const generatePlaybookText = () => {
    if (!omData) return '';
    
    let text = `# ${t('om.operationsPlaybook')}\n\n`;
    text += `## ${t('om.operatingModelTitle')}\n`;
    text += `${t(`om.models.${omData.operatingModel}`)}\n\n`;
    
    text += `## ${t('om.rolesTitle')}\n`;
    text += `- ${t('om.assetOwner')}: ${getStakeholderName(omData.roles.assetOwnerEntityId)}\n`;
    text += `- ${t('om.programOwner')}: ${getStakeholderName(omData.roles.programOwnerEntityId)}\n`;
    text += `- ${t('om.operator')}: ${getStakeholderName(omData.roles.operatorEntityId)}\n`;
    text += `- ${t('om.maintainer')}: ${getStakeholderName(omData.roles.maintainerEntityId)}\n`;
    text += `- ${t('om.verifier')}: ${getStakeholderName(omData.roles.verifierEntityId)}\n\n`;
    
    if (omData.roles.communityRole !== 'BENEFICIARY') {
      text += `### ${t('om.communityRole')}\n`;
      text += `${t(`om.communityRoles.${omData.roles.communityRole}`)}\n\n`;
    }
    
    text += `## ${t('om.taskPlanTitle')}\n`;
    omData.taskPlan.forEach(task => {
      text += `- ${task.name} (${t(`om.frequency.${task.frequency}`)})\n`;
    });
    text += '\n';
    
    text += `## ${t('om.fundingTitle')}\n`;
    text += `${t('om.costBand')}: ${omData.omCostBand.low.toLocaleString()} - ${omData.omCostBand.high.toLocaleString()} ${omData.omCostBand.currency}/year\n`;
    text += `${t('om.mechanisms')}: ${omData.omFunding.mechanisms.map(m => t(`om.fundingMechanisms.${m}`)).join(', ')}\n`;
    text += `${t('om.duration')}: ${omData.omFunding.durationYears} ${t('om.years')}\n\n`;
    
    text += `## ${t('om.risksTitle')}\n`;
    omData.opsRisks.forEach(risk => {
      text += `- ${t(`om.riskTypes.${risk.riskType}`)} (${t(`om.riskLevel.${risk.riskLevel}`)}): ${risk.mitigation || t('om.noMitigation')}\n`;
    });
    
    return text;
  };

  const copyPlaybook = () => {
    const text = generatePlaybookText();
    navigator.clipboard.writeText(text);
    toast({
      title: t('om.copied'),
      description: t('om.playbookCopied'),
    });
  };

  if (!omData || !navigationRestored || !dataHydrated) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const completedSteps = Object.values(omData.readiness.checklist).filter(Boolean).length;
  const totalSteps = Object.keys(omData.readiness.checklist).length;
  const progressPercent = (completedSteps / totalSteps) * 100;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8">
        <Link href={`${routePrefix}/project/${projectId}`}>
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{t('om.pageTitle')}</h1>
            <p className="text-muted-foreground">{action?.name}</p>
          </div>
          <Badge variant={omData.status === 'READY' ? 'default' : omData.status === 'DRAFT' ? 'secondary' : 'outline'}>
            {t(`om.status.${omData.status}`)}
          </Badge>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">{t('om.readinessProgress')}</span>
            <span className="text-sm font-medium">{completedSteps}/{totalSteps}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {steps.map((step, index) => (
            <Button
              key={step.id}
              variant={currentStep === index ? 'default' : 'outline'}
              size="sm"
              onClick={() => canNavigateToStep(index) && setCurrentStep(index)}
              disabled={!canNavigateToStep(index)}
              className="flex items-center gap-2 whitespace-nowrap"
            >
              <step.icon className="h-4 w-4" />
              {t(`om.steps.${step.id}`)}
            </Button>
          ))}
        </div>

        {currentStep === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('om.overviewTitle')}</CardTitle>
              <CardDescription>{t('om.overviewDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h3 className="font-medium mb-2">{t('om.importedContext')}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('om.actionType')}:</span>
                    <span className="ml-2">{isNBS ? t('om.nbs') : t('om.traditional')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('om.sites')}:</span>
                    <span className="ml-2">{sites.length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('om.hazards')}:</span>
                    <span className="ml-2">{t('om.floodHeatLandslide')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('om.stakeholders')}:</span>
                    <span className="ml-2">{allStakeholders.length}</span>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sites.map(site => (
                  <div key={site.id} className="border rounded-lg p-3">
                    <div className="font-medium">{site.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {t(`om.hazard.${site.hazardType}`)} • {t(`om.intervention.${site.interventionType}`)}
                    </div>
                  </div>
                ))}
              </div>

              <Button onClick={() => setCurrentStep(1)} className="w-full">
                {t('om.startConfiguration')}
              </Button>
            </CardContent>
          </Card>
        )}

        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('om.operatingModelTitle')}</CardTitle>
              <CardDescription>{t('om.operatingModelDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={omData.operatingModel || ''}
                onValueChange={(value) => updateOMData({ operatingModel: value as OperatingModel })}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {OPERATING_MODELS.map((model) => {
                  const isRecommended = (isNBS && model.id === 'COMMUNITY_STEWARDSHIP') ||
                    (!isNBS && model.id === 'CITY_RUN');
                  return (
                    <Label
                      key={model.id}
                      className={`relative flex flex-col p-4 border rounded-lg cursor-pointer hover:bg-accent ${
                        omData.operatingModel === model.id ? 'border-primary bg-primary/5' : ''
                      }`}
                    >
                      <RadioGroupItem value={model.id} className="sr-only" />
                      <div className="flex items-center gap-2 mb-2">
                        <model.icon className="h-5 w-5" />
                        <span className="font-medium">{t(`om.models.${model.id}`)}</span>
                        {isRecommended && (
                          <Badge variant="secondary" className="text-xs">{t('om.recommended')}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{t(`om.modelsDesc.${model.id}`)}</p>
                      {omData.operatingModel === model.id && (
                        <Check className="absolute top-2 right-2 h-5 w-5 text-primary" />
                      )}
                    </Label>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>
        )}

        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('om.rolesTitle')}</CardTitle>
              <CardDescription>{t('om.rolesDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(['assetOwnerEntityId', 'programOwnerEntityId', 'operatorEntityId', 'maintainerEntityId', 'verifierEntityId'] as const).map((role) => (
                  <div key={role} className="space-y-2">
                    <Label>{t(`om.${role.replace('EntityId', '')}`)}</Label>
                    <Select
                      value={omData.roles[role] || ''}
                      onValueChange={(value) => updateOMData({
                        roles: { ...omData.roles, [role]: value || null }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('om.selectEntity')} />
                      </SelectTrigger>
                      <SelectContent>
                        {allStakeholders.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="flex items-center gap-2">
                              {s.name}
                              {s.confirmed === false && (
                                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                  {t('om.unconfirmed')}
                                </Badge>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                        <div className="border-t mt-1 pt-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStakeholderModalOpen(true);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            {t('om.addStakeholder')}
                          </Button>
                        </div>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {(omData.operatingModel === 'COMMUNITY_STEWARDSHIP' || omData.operatingModel === 'HYBRID_SPLIT') && (
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-4">{t('om.communityRoleTitle')}</h3>
                  <RadioGroup
                    value={omData.roles.communityRole || ''}
                    onValueChange={(value) => updateOMData({
                      roles: { ...omData.roles, communityRole: value as CommunityRole }
                    })}
                    className="space-y-2"
                  >
                    {(['BENEFICIARY', 'STEWARD_OPERATOR', 'CO_OWNER_REVENUE_PARTICIPANT'] as const).map((role) => (
                      <Label key={role} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-accent">
                        <RadioGroupItem value={role} />
                        <div>
                          <div className="font-medium">{t(`om.communityRoles.${role}`)}</div>
                          <div className="text-sm text-muted-foreground">{t(`om.communityRolesDesc.${role}`)}</div>
                        </div>
                      </Label>
                    ))}
                  </RadioGroup>

                  {omData.roles.communityRole !== 'BENEFICIARY' && (
                    <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-medium mb-2">{t('om.stewardshipScope')}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {(['routineMaintenance', 'inspections', 'minorRepairs', 'monitoringSupport'] as const).map((scope) => (
                          <Label key={scope} className="flex items-center gap-2">
                            <Checkbox
                              checked={omData.roles.stewardshipScope[scope]}
                              onCheckedChange={(checked) => updateOMData({
                                roles: {
                                  ...omData.roles,
                                  stewardshipScope: {
                                    ...omData.roles.stewardshipScope,
                                    [scope]: !!checked,
                                  }
                                }
                              })}
                            />
                            {t(`om.scope.${scope}`)}
                          </Label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('om.taskPlanTitle')}</CardTitle>
              <CardDescription>{t('om.taskPlanDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isNBS && (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                  <h3 className="font-medium mb-3">{t('om.nbsEstablishment')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{t('om.establishmentPeriod')}</Label>
                      <Select
                        value={String(omData.nbsExtensions.establishmentPeriodMonths)}
                        onValueChange={(value) => updateOMData({
                          nbsExtensions: { ...omData.nbsExtensions, establishmentPeriodMonths: Number(value) as 12 | 24 | 36 }
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="12">12 {t('om.months')}</SelectItem>
                          <SelectItem value="24">24 {t('om.months')}</SelectItem>
                          <SelectItem value="36">36 {t('om.months')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('om.maintenanceIntensity')}</Label>
                      <Select
                        value={omData.nbsExtensions.maintenanceIntensity}
                        onValueChange={(value) => updateOMData({
                          nbsExtensions: { ...omData.nbsExtensions, maintenanceIntensity: value as 'LOW' | 'MEDIUM' | 'HIGH' }
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LOW">{t('om.low')}</SelectItem>
                          <SelectItem value="MEDIUM">{t('om.medium')}</SelectItem>
                          <SelectItem value="HIGH">{t('om.high')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('om.survivalTarget')}</Label>
                      <Input
                        type="number"
                        value={omData.nbsExtensions.survivalTargetPercent}
                        onChange={(e) => updateOMData({
                          nbsExtensions: { ...omData.nbsExtensions, survivalTargetPercent: Number(e.target.value) }
                        })}
                        min={0}
                        max={100}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {omData.taskPlan.map((task, index) => (
                  <div key={task.id} className={`border rounded-lg p-4 ${task.isEstablishmentOnly ? 'bg-green-50/50 border-green-200' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveTask(task.id, 'up')} disabled={index === 0}>
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveTask(task.id, 'down')} disabled={index === omData.taskPlan.length - 1}>
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('om.taskCategory')}</Label>
                          <Select
                            value={task.category}
                            onValueChange={(value) => {
                              const newTasks = [...omData.taskPlan];
                              newTasks[index] = { ...task, category: value as Task['category'], isEstablishmentOnly: value === 'ESTABLISHMENT' };
                              updateOMData({ taskPlan: newTasks });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['ESTABLISHMENT', 'ROUTINE_MAINTENANCE', 'INSPECTION', 'REPAIR_REPLACEMENT', 'EXTREME_EVENT_RESPONSE'].map((cat) => (
                                <SelectItem key={cat} value={cat}>{t(`om.category.${cat}`)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 lg:col-span-2">
                          <Label className="text-xs text-muted-foreground">{t('om.taskName')}</Label>
                          <Input
                            value={task.name}
                            onChange={(e) => {
                              const newTasks = [...omData.taskPlan];
                              newTasks[index] = { ...task, name: e.target.value };
                              updateOMData({ taskPlan: newTasks });
                            }}
                            placeholder="Task description..."
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('om.taskFrequency')}</Label>
                          <Select
                            value={task.frequency}
                            onValueChange={(value) => {
                              const newTasks = [...omData.taskPlan];
                              newTasks[index] = { ...task, frequency: value as Task['frequency'] };
                              updateOMData({ taskPlan: newTasks });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['WEEKLY', 'MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL', 'EVENT_TRIGGERED'].map((freq) => (
                                <SelectItem key={freq} value={freq}>{t(`om.frequency.${freq}`)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('om.responsible')}</Label>
                          <Select
                            value={task.responsibleEntityId || ''}
                            onValueChange={(value) => {
                              const newTasks = [...omData.taskPlan];
                              newTasks[index] = { ...task, responsibleEntityId: value || null };
                              updateOMData({ taskPlan: newTasks });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('om.selectEntity')} />
                            </SelectTrigger>
                            <SelectContent>
                              {allStakeholders.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('om.skillLevel')}</Label>
                          <Select
                            value={task.skillLevel || 'BASIC'}
                            onValueChange={(value) => {
                              const newTasks = [...omData.taskPlan];
                              newTasks[index] = { ...task, skillLevel: value as SkillLevel };
                              updateOMData({ taskPlan: newTasks });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="BASIC">{t('om.skillLevels.BASIC')}</SelectItem>
                              <SelectItem value="SPECIALIZED">{t('om.skillLevels.SPECIALIZED')}</SelectItem>
                              <SelectItem value="EXPERT">{t('om.skillLevels.EXPERT')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('om.urgency')}</Label>
                          <Select
                            value={task.urgency || 'STANDARD'}
                            onValueChange={(value) => {
                              const newTasks = [...omData.taskPlan];
                              newTasks[index] = { ...task, urgency: value as TaskUrgency };
                              updateOMData({ taskPlan: newTasks });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CRITICAL">{t('om.urgencies.CRITICAL')}</SelectItem>
                              <SelectItem value="STANDARD">{t('om.urgencies.STANDARD')}</SelectItem>
                              <SelectItem value="DEFERRABLE">{t('om.urgencies.DEFERRABLE')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-4 lg:col-span-2">
                          {isNBS && (
                            <Label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={task.isEstablishmentOnly || false}
                                onCheckedChange={(checked) => {
                                  const newTasks = [...omData.taskPlan];
                                  newTasks[index] = { ...task, isEstablishmentOnly: !!checked };
                                  updateOMData({ taskPlan: newTasks });
                                }}
                              />
                              {t('om.isEstablishmentOnly')}
                            </Label>
                          )}
                          <Label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={task.costDriver || false}
                              onCheckedChange={(checked) => {
                                const newTasks = [...omData.taskPlan];
                                newTasks[index] = { ...task, costDriver: !!checked };
                                updateOMData({ taskPlan: newTasks });
                              }}
                            />
                            {t('om.costDriver')}
                          </Label>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => removeTask(task.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={addTask} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                {t('om.addTask')}
              </Button>
            </CardContent>
          </Card>
        )}

        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('om.fundingTitle')}</CardTitle>
              <CardDescription>{t('om.fundingDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium">{t('om.annualCostLabel')}</h3>
                  <Select
                    value={omData.omCostBand.currency || 'USD'}
                    onValueChange={(value) => updateOMData({
                      omCostBand: { ...omData.omCostBand, currency: value }
                    })}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="BRL">BRL</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isNBS && (
                  <div className="bg-green-50/50 border border-green-200 rounded-lg p-4 mb-4">
                    <h4 className="font-medium text-green-800 mb-3">{t('om.phasedCosts')}</h4>
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <Label className="text-green-700">{t('om.establishmentCosts')}</Label>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t('om.lowEstimate')}</Label>
                            <Input
                              type="number"
                              value={omData.nbsExtensions.phasedCosts?.establishment?.low || 0}
                              onChange={(e) => updateOMData({
                                nbsExtensions: {
                                  ...omData.nbsExtensions,
                                  phasedCosts: {
                                    ...omData.nbsExtensions.phasedCosts,
                                    establishment: { ...(omData.nbsExtensions.phasedCosts?.establishment || {}), low: Number(e.target.value) }
                                  }
                                }
                              })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t('om.midEstimate')}</Label>
                            <Input
                              type="number"
                              value={omData.nbsExtensions.phasedCosts?.establishment?.mid || 0}
                              onChange={(e) => updateOMData({
                                nbsExtensions: {
                                  ...omData.nbsExtensions,
                                  phasedCosts: {
                                    ...omData.nbsExtensions.phasedCosts,
                                    establishment: { ...(omData.nbsExtensions.phasedCosts?.establishment || {}), mid: Number(e.target.value) }
                                  }
                                }
                              })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t('om.highEstimate')}</Label>
                            <Input
                              type="number"
                              value={omData.nbsExtensions.phasedCosts?.establishment?.high || 0}
                              onChange={(e) => updateOMData({
                                nbsExtensions: {
                                  ...omData.nbsExtensions,
                                  phasedCosts: {
                                    ...omData.nbsExtensions.phasedCosts,
                                    establishment: { ...(omData.nbsExtensions.phasedCosts?.establishment || {}), high: Number(e.target.value) }
                                  }
                                }
                              })}
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label className="text-green-700">{t('om.ongoingCosts')}</Label>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t('om.lowEstimate')}</Label>
                            <Input
                              type="number"
                              value={omData.nbsExtensions.phasedCosts?.ongoing?.low || 0}
                              onChange={(e) => updateOMData({
                                nbsExtensions: {
                                  ...omData.nbsExtensions,
                                  phasedCosts: {
                                    ...omData.nbsExtensions.phasedCosts,
                                    ongoing: { ...(omData.nbsExtensions.phasedCosts?.ongoing || {}), low: Number(e.target.value) }
                                  }
                                }
                              })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t('om.midEstimate')}</Label>
                            <Input
                              type="number"
                              value={omData.nbsExtensions.phasedCosts?.ongoing?.mid || 0}
                              onChange={(e) => updateOMData({
                                nbsExtensions: {
                                  ...omData.nbsExtensions,
                                  phasedCosts: {
                                    ...omData.nbsExtensions.phasedCosts,
                                    ongoing: { ...(omData.nbsExtensions.phasedCosts?.ongoing || {}), mid: Number(e.target.value) }
                                  }
                                }
                              })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t('om.highEstimate')}</Label>
                            <Input
                              type="number"
                              value={omData.nbsExtensions.phasedCosts?.ongoing?.high || 0}
                              onChange={(e) => updateOMData({
                                nbsExtensions: {
                                  ...omData.nbsExtensions,
                                  phasedCosts: {
                                    ...omData.nbsExtensions.phasedCosts,
                                    ongoing: { ...(omData.nbsExtensions.phasedCosts?.ongoing || {}), high: Number(e.target.value) }
                                  }
                                }
                              })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>{t('om.lowEstimate')}</Label>
                    <Input
                      type="number"
                      value={omData.omCostBand.low}
                      onChange={(e) => updateOMData({
                        omCostBand: { ...omData.omCostBand, low: Number(e.target.value) }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('om.midEstimate')}</Label>
                    <Input
                      type="number"
                      value={omData.omCostBand.mid}
                      onChange={(e) => updateOMData({
                        omCostBand: { ...omData.omCostBand, mid: Number(e.target.value) }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('om.highEstimate')}</Label>
                    <Input
                      type="number"
                      value={omData.omCostBand.high}
                      onChange={(e) => updateOMData({
                        omCostBand: { ...omData.omCostBand, high: Number(e.target.value) }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('om.basis')}</Label>
                    <Select
                      value={omData.omCostBand.basis}
                      onValueChange={(value) => updateOMData({
                        omCostBand: { ...omData.omCostBand, basis: value as OperationsOMData['omCostBand']['basis'] }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['PER_ASSET', 'PER_HECTARE', 'PER_KM', 'PER_SITE', 'PORTFOLIO'].map((basis) => (
                          <SelectItem key={basis} value={basis}>{t(`om.costBasis.${basis}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{t('om.costBasisHelper')}</p>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{t('om.assumptionsBehind')}</Label>
                    <Button variant="ghost" size="sm" onClick={() => updateOMData({
                      omCostBand: {
                        ...omData.omCostBand,
                        assumptions: omData.omCostBand.assumptions +
                          (omData.omCostBand.assumptions ? '\n' : '') +
                          '• Based on comparable NBS projects in similar climate zones\n• Assumes standard labor rates for municipal workers\n• Includes contingency of 15% for unforeseen maintenance'
                      }
                    })}>
                      <Lightbulb className="h-4 w-4 mr-1" />
                      {t('om.insertSuggestedAssumptions')}
                    </Button>
                  </div>
                  <Textarea
                    value={omData.omCostBand.assumptions}
                    onChange={(e) => updateOMData({
                      omCostBand: { ...omData.omCostBand, assumptions: e.target.value }
                    })}
                    placeholder={t('om.assumptionsPlaceholder')}
                    rows={4}
                  />
                </div>

                {omData.taskPlan.filter(t => t.costDriver).length > 0 && (
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <Label className="text-sm font-medium">{t('om.costDriver')}s:</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {omData.taskPlan.filter(t => t.costDriver).map(task => (
                        <Badge key={task.id} variant="secondary">{task.name}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">{t('om.fundingSourcesTitle')}</h3>

                {(['PUBLIC_UTILITY', 'CONTRACTED_STRUCTURED', 'CATALYTIC_TRANSITIONAL'] as const).map((category) => (
                  <div key={category} className="mb-4">
                    <Label className="text-sm text-muted-foreground mb-2 block">{t(`om.fundingCategories.${category}`)}</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {FUNDING_MECHANISMS.filter(m => getFundingCategory(m) === category).map((mechanism) => (
                        <div key={mechanism} className="flex items-center gap-2 p-2 border rounded hover:bg-accent/50">
                          <Checkbox
                            checked={omData.omFunding.mechanisms.includes(mechanism)}
                            onCheckedChange={(checked) => {
                              const newMechanisms = checked
                                ? [...omData.omFunding.mechanisms, mechanism]
                                : omData.omFunding.mechanisms.filter(m => m !== mechanism);
                              updateOMData({ omFunding: { ...omData.omFunding, mechanisms: newMechanisms } });
                            }}
                          />
                          <span className="text-sm flex-1">{t(`om.fundingMechanisms.${mechanism}`)}</span>
                          {omData.omFunding.mechanisms.includes(mechanism) && (
                            <div className="flex items-center gap-1">
                              <Select
                                value={omData.omFunding.primaryMechanism === mechanism ? 'primary' : 'secondary'}
                                onValueChange={(value) => updateOMData({
                                  omFunding: {
                                    ...omData.omFunding,
                                    primaryMechanism: value === 'primary' ? mechanism : omData.omFunding.primaryMechanism === mechanism ? null : omData.omFunding.primaryMechanism
                                  }
                                })}
                              >
                                <SelectTrigger className="h-7 w-24 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="primary">{t('om.primarySource')}</SelectItem>
                                  <SelectItem value="secondary">{t('om.secondarySource')}</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select
                                value={(omData.omFunding.commitmentLevels as Record<string, string>)?.[mechanism] || 'IDEA'}
                                onValueChange={(value) => updateOMData({
                                  omFunding: {
                                    ...omData.omFunding,
                                    commitmentLevels: { ...(omData.omFunding.commitmentLevels || {}), [mechanism]: value as CommitmentLevel }
                                  }
                                })}
                              >
                                <SelectTrigger className="h-7 w-28 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="CONFIRMED">{t('om.commitmentLevels.CONFIRMED')}</SelectItem>
                                  <SelectItem value="PLANNED">{t('om.commitmentLevels.PLANNED')}</SelectItem>
                                  <SelectItem value="IDEA">{t('om.commitmentLevels.IDEA')}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4">
                <div className="space-y-2">
                  <Label>{t('om.fundingDuration')}</Label>
                  <RadioGroup
                    value={String(omData.omFunding.durationYears)}
                    onValueChange={(value) => updateOMData({
                      omFunding: { ...omData.omFunding, durationYears: Number(value) as 1 | 3 | 5 | 10 }
                    })}
                    className="flex gap-4"
                  >
                    {[1, 3, 5, 10].map((years) => (
                      <Label key={years} className="flex items-center gap-2 cursor-pointer">
                        <RadioGroupItem value={String(years)} />
                        {years} {t('om.years')}
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {currentStep === 5 && (
          <div className="space-y-6">
            {(() => {
              const blockers: string[] = [];
              if (!omData.operatingModel) blockers.push('selectOperatingModel');
              if (!omData.roles.operatorEntityId) blockers.push('assignOperator');
              if (omData.taskPlan.length === 0) blockers.push('defineTaskPlan');
              if (omData.omFunding.mechanisms.length === 0) blockers.push('selectFunding');
              if (!omData.omFunding.primaryMechanism) blockers.push('selectPrimaryFunding');
              if (omData.omCostBand.mid === 0) blockers.push('defineCostBand');
              
              return blockers.length > 0 && (
                <Card className="border-orange-200 bg-orange-50/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-orange-800 flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      {t('om.topBlockers')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {blockers.map((blocker) => (
                        <div key={blocker} className="flex items-center gap-2 text-orange-700">
                          <div className="h-2 w-2 rounded-full bg-orange-500" />
                          {t(`om.blocker.${blocker}`)}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            <Card>
              <CardHeader>
                <CardTitle>{t('om.capacityAndRisk')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-2 block">{t('om.capacityTitle')}</Label>
                  <RadioGroup
                    value={omData.capacity.assessment || ''}
                    onValueChange={(value) => updateOMData({
                      capacity: { ...omData.capacity, assessment: value as CapacityAssessment }
                    })}
                    className="space-y-2"
                  >
                    {(['ADEQUATE', 'PARTIAL_NEEDS_SUPPORT', 'INADEQUATE'] as const).map((level) => (
                      <Label key={level} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-accent">
                        <RadioGroupItem value={level} />
                        <div>
                          <div className="font-medium">{t(`om.capacity.${level}`)}</div>
                          <div className="text-sm text-muted-foreground">{t(`om.capacityDesc.${level}`)}</div>
                        </div>
                      </Label>
                    ))}
                  </RadioGroup>
                  <Textarea
                    className="mt-3"
                    value={omData.capacity.notes}
                    onChange={(e) => updateOMData({
                      capacity: { ...omData.capacity, notes: e.target.value }
                    })}
                    placeholder={t('om.capacityNotesPlaceholder')}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('om.risksTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {omData.opsRisks.filter(r => !r.hidden).map((risk, index) => (
                    <Collapsible key={risk.id} className="border rounded-lg">
                      <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-muted/50">
                        <div className="flex items-center gap-3">
                          <Badge variant={risk.riskLevel === 'HIGH' ? 'destructive' : risk.riskLevel === 'MEDIUM' ? 'default' : 'secondary'}>
                            {t(`om.riskLevel.${risk.riskLevel}`)}
                          </Badge>
                          <span className="font-medium">{t(`om.riskTypes.${risk.riskType}`) || t(`om.newRiskTypes.${risk.riskType}`) || risk.riskType}</span>
                          {risk.linkedSignals && risk.linkedSignals.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {risk.linkedSignals.length} {t('om.linkedSignals')}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => {
                            e.stopPropagation();
                            const newRisks = omData.opsRisks.map(r => r.id === risk.id ? { ...r, hidden: true } : r);
                            updateOMData({ opsRisks: newRisks });
                          }}>
                            <EyeOff className="h-4 w-4" />
                          </Button>
                          <ChevronDown className="h-4 w-4" />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="border-t p-3 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{t('om.riskOwner')}</Label>
                            <Select
                              value={risk.ownerId || ''}
                              onValueChange={(value) => {
                                const newRisks = omData.opsRisks.map(r => r.id === risk.id ? { ...r, ownerId: value || null } : r);
                                updateOMData({ opsRisks: newRisks });
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('om.selectEntity')} />
                              </SelectTrigger>
                              <SelectContent>
                                {allStakeholders.map((s) => (
                                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <Label className="text-xs text-muted-foreground">{t('om.riskTrigger')}</Label>
                            <Input
                              value={risk.trigger || ''}
                              onChange={(e) => {
                                const newRisks = omData.opsRisks.map(r => r.id === risk.id ? { ...r, trigger: e.target.value } : r);
                                updateOMData({ opsRisks: newRisks });
                              }}
                              placeholder="e.g., Survival rate below 70%..."
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">{t('om.mitigationActions')}</Label>
                            {SUGGESTED_MITIGATION_ACTIONS[risk.riskType] && (
                              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => {
                                const suggestions = SUGGESTED_MITIGATION_ACTIONS[risk.riskType] || [];
                                const newRisks = omData.opsRisks.map(r => 
                                  r.id === risk.id ? { ...r, mitigationActions: Array.from(new Set([...(r.mitigationActions || []), ...suggestions])) } : r
                                );
                                updateOMData({ opsRisks: newRisks });
                              }}>
                                <Sparkles className="h-3 w-3 mr-1" />
                                Suggest
                              </Button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(risk.mitigationActions || []).map((action) => (
                              <Badge key={action} variant="secondary" className="gap-1">
                                {t(`om.suggestedMitigations.${action}`) || action}
                                <button className="ml-1 text-muted-foreground hover:text-foreground" onClick={() => {
                                  const newRisks = omData.opsRisks.map(r => 
                                    r.id === risk.id ? { ...r, mitigationActions: r.mitigationActions?.filter(a => a !== action) } : r
                                  );
                                  updateOMData({ opsRisks: newRisks });
                                }}>×</button>
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {risk.linkedSignals && risk.linkedSignals.length > 0 && (
                          <div className="p-2 bg-muted/50 rounded text-sm">
                            <Label className="text-xs text-muted-foreground">{t('om.linkedSignals')}:</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {risk.linkedSignals.map((signal) => (
                                <Badge key={signal} variant="outline" className="text-xs">{t(`om.signals.${signal}`) || signal}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{t('om.riskLevel')}</Label>
                          <Select
                            value={risk.riskLevel}
                            onValueChange={(value) => {
                              const newRisks = omData.opsRisks.map(r => r.id === risk.id ? { ...r, riskLevel: value as RiskLevel } : r);
                              updateOMData({ opsRisks: newRisks });
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="LOW">{t('om.riskLevel.LOW')}</SelectItem>
                              <SelectItem value="MEDIUM">{t('om.riskLevel.MEDIUM')}</SelectItem>
                              <SelectItem value="HIGH">{t('om.riskLevel.HIGH')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                  
                  {omData.opsRisks.some(r => r.hidden) && (
                    <Button variant="ghost" size="sm" onClick={() => {
                      const newRisks = omData.opsRisks.map(r => ({ ...r, hidden: false }));
                      updateOMData({ opsRisks: newRisks });
                    }}>
                      <Eye className="h-4 w-4 mr-2" />
                      {t('om.showHiddenRisks')} ({omData.opsRisks.filter(r => r.hidden).length})
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('om.readinessGate')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(omData.readiness.checklist).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-3">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center ${value ? 'bg-green-500' : 'bg-muted'}`}>
                        {value && <Check className="h-4 w-4 text-white" />}
                      </div>
                      <span className={value ? '' : 'text-muted-foreground'}>{t(`om.checklist.${key}`)}</span>
                    </div>
                  ))}
                </div>

                {omData.readiness.blockers.length > 0 && (
                  <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">{t('om.blockers')}</h4>
                    <ul className="list-disc list-inside text-sm text-yellow-700 dark:text-yellow-300">
                      {omData.readiness.blockers.map((blocker) => (
                        <li key={blocker}>{t(`om.blocker.${blocker}`)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        )}

        {currentStep === 6 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('om.operationsPlaybook')}</CardTitle>
                <CardDescription>{t('om.playbookDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="multiple" defaultValue={['governance', 'tasks', 'funding', 'risks']} className="space-y-2">
                  <AccordionItem value="governance">
                    <AccordionTrigger className="hover:bg-muted/50 px-3 rounded">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {t('om.governanceTitle')}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-4">
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('om.operatingModelLabel')}:</span>
                          <span className="font-medium">{omData.operatingModel ? t(`om.model.${omData.operatingModel}`) : '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('om.operatorLabel')}:</span>
                          <span className="font-medium">{allStakeholders.find(s => s.id === omData.roles.operatorEntityId)?.name || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('om.verifierLabel')}:</span>
                          <span className="font-medium">{allStakeholders.find(s => s.id === omData.roles.verifierEntityId)?.name || '-'}</span>
                        </div>
                        {omData.roles.communityRole && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('om.communityRoleLabel')}:</span>
                            <span className="font-medium">{t(`om.communityRole.${omData.roles.communityRole}`)}</span>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="tasks">
                    <AccordionTrigger className="hover:bg-muted/50 px-3 rounded">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        {t('om.taskPlanTitle')} ({omData.taskPlan.length})
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-4">
                      <div className="space-y-2">
                        {omData.taskPlan.map((task) => (
                          <div key={task.id} className={`text-sm p-2 rounded ${task.isEstablishmentOnly ? 'bg-green-50' : 'bg-muted/30'}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{task.name}</span>
                              <div className="flex gap-1">
                                <Badge variant="outline" className="text-xs">{t(`om.frequency.${task.frequency}`)}</Badge>
                                {task.costDriver && <Badge variant="secondary" className="text-xs">{t('om.costDriver')}</Badge>}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {t(`om.category.${task.category}`)} • {allStakeholders.find(s => s.id === task.responsibleEntityId)?.name || t('om.notAssigned')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="funding">
                    <AccordionTrigger className="hover:bg-muted/50 px-3 rounded">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        {t('om.fundingTitle')}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-4">
                      <div className="space-y-3 text-sm">
                        <div className="p-3 bg-muted/30 rounded">
                          <div className="font-medium mb-2">{t('om.costBandTitle')}</div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <div className="text-xs text-muted-foreground">{t('om.lowEstimate')}</div>
                              <div className="font-medium">{omData.omCostBand.currency || 'USD'} {omData.omCostBand.low.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">{t('om.midEstimate')}</div>
                              <div className="font-medium">{omData.omCostBand.currency || 'USD'} {omData.omCostBand.mid.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground">{t('om.highEstimate')}</div>
                              <div className="font-medium">{omData.omCostBand.currency || 'USD'} {omData.omCostBand.high.toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div className="font-medium mb-2">{t('om.fundingMechanismsTitle')}</div>
                          <div className="flex flex-wrap gap-2">
                            {omData.omFunding.mechanisms.map((m) => (
                              <Badge key={m} variant={omData.omFunding.primaryMechanism === m ? 'default' : 'secondary'}>
                                {t(`om.fundingMechanisms.${m}`)}
                                {omData.omFunding.primaryMechanism === m && <span className="ml-1 text-xs">★</span>}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="text-muted-foreground">
                          {t('om.fundingDuration')}: {omData.omFunding.durationYears} {t('om.years')}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="risks">
                    <AccordionTrigger className="hover:bg-muted/50 px-3 rounded">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        {t('om.risksTitle')} ({omData.opsRisks.filter(r => !r.hidden).length})
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-4">
                      <div className="space-y-2">
                        {omData.opsRisks.filter(r => !r.hidden).map((risk) => (
                          <div key={risk.id} className="text-sm p-2 bg-muted/30 rounded">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{t(`om.riskTypes.${risk.riskType}`) || t(`om.newRiskTypes.${risk.riskType}`) || risk.riskType}</span>
                              <Badge variant={risk.riskLevel === 'HIGH' ? 'destructive' : risk.riskLevel === 'MEDIUM' ? 'default' : 'secondary'}>
                                {t(`om.riskLevel.${risk.riskLevel}`)}
                              </Badge>
                            </div>
                            {risk.mitigationActions && risk.mitigationActions.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {t('om.mitigationActions')}: {risk.mitigationActions.map(a => t(`om.suggestedMitigations.${a}`) || a).join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('om.validationChecklist')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(omData.readiness.checklist).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-3">
                      <div className={`h-6 w-6 rounded-full flex items-center justify-center ${value ? 'bg-green-500' : 'bg-muted'}`}>
                        {value && <Check className="h-4 w-4 text-white" />}
                      </div>
                      <span className={value ? '' : 'text-muted-foreground'}>{t(`om.checklist.${key}`)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('om.exportOptions')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2" onClick={copyPlaybook}>
                    <Copy className="h-5 w-5" />
                    <span>{t('om.copyToConceptNote')}</span>
                    <span className="text-xs text-muted-foreground">{t('om.conceptNoteDesc')}</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2" onClick={() => {
                    const text = generatePlaybookText();
                    navigator.clipboard.writeText(text);
                    toast({ title: t('om.copied'), description: t('om.textSnippetCopied') });
                  }}>
                    <FileText className="h-5 w-5" />
                    <span>{t('om.copyTextSnippet')}</span>
                    <span className="text-xs text-muted-foreground">{t('om.textSnippetDesc')}</span>
                  </Button>
                  <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-2" onClick={() => {
                    const miroPrompt = `Create a Miro diagram for O&M operations:
Operating Model: ${omData.operatingModel}
Operator: ${allStakeholders.find(s => s.id === omData.roles.operatorEntityId)?.name || 'TBD'}
Tasks: ${omData.taskPlan.length} maintenance tasks
Key Risks: ${omData.opsRisks.filter(r => r.riskLevel === 'HIGH').map(r => r.riskType).join(', ') || 'None'}
Funding: ${omData.omFunding.mechanisms.map(m => m).join(', ')}`;
                    navigator.clipboard.writeText(miroPrompt);
                    toast({ title: t('om.copied'), description: t('om.miroPromptCopied') });
                  }}>
                    <ExternalLink className="h-5 w-5" />
                    <span>{t('om.copyMiroPrompt')}</span>
                    <span className="text-xs text-muted-foreground">{t('om.miroPromptDesc')}</span>
                  </Button>
                </div>

                <div className="border-t pt-4">
                  <Label className="text-sm font-medium mb-2 block">{t('om.playbookPreview')}</Label>
                  <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {generatePlaybookText()}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex justify-between mt-8">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
          >
            {t('common.previous')}
          </Button>
          <Button
            onClick={() => {
              const nextStep = currentStep + 1;
              if (canNavigateToStep(nextStep)) {
                setCurrentStep(Math.min(steps.length - 1, nextStep));
              } else {
                toast({
                  title: t('om.blockers'),
                  description: omData.readiness.blockers.map(b => t(`om.blocker.${b}`)).join(', '),
                  variant: 'destructive',
                });
              }
            }}
            disabled={currentStep === steps.length - 1}
          >
            {t('common.next')}
          </Button>
        </div>
      </div>

      <Dialog open={stakeholderModalOpen} onOpenChange={setStakeholderModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('om.addNewStakeholder')}</DialogTitle>
            <DialogDescription>{t('om.addStakeholderDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('om.stakeholderName')}</Label>
              <Input
                value={newStakeholder.name || ''}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, name: e.target.value })}
                placeholder={t('om.stakeholderNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('om.stakeholderType')}</Label>
              <Select
                value={newStakeholder.type || 'other'}
                onValueChange={(value) => setNewStakeholder({ ...newStakeholder, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="government">{t('om.stakeholderTypes.government')}</SelectItem>
                  <SelectItem value="utility">{t('om.stakeholderTypes.utility')}</SelectItem>
                  <SelectItem value="community">{t('om.stakeholderTypes.community')}</SelectItem>
                  <SelectItem value="ngo">{t('om.stakeholderTypes.ngo')}</SelectItem>
                  <SelectItem value="contractor">{t('om.stakeholderTypes.contractor')}</SelectItem>
                  <SelectItem value="other">{t('om.stakeholderTypes.other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('om.contactName')}</Label>
              <Input
                value={newStakeholder.contactName || ''}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, contactName: e.target.value })}
                placeholder={t('om.contactNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('om.contactEmail')}</Label>
              <Input
                type="email"
                value={newStakeholder.contactEmail || ''}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, contactEmail: e.target.value })}
                placeholder={t('om.contactEmailPlaceholder')}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={newStakeholder.confirmed || false}
                onCheckedChange={(checked) => setNewStakeholder({ ...newStakeholder, confirmed: !!checked })}
              />
              <Label>{t('om.stakeholderConfirmed')}</Label>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t('common.cancel')}</Button>
            </DialogClose>
            <Button onClick={addCustomStakeholder} disabled={!newStakeholder.name}>
              {t('om.addStakeholder')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
