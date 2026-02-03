import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'wouter';
import { ArrowLeft, Check, Building2, Users, Landmark, DollarSign, AlertTriangle, FileText, Copy, ChevronDown, ChevronUp, Plus, Trash2, Info, Edit, RotateCcw, CheckCircle } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/core/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/core/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { useSampleData } from '@/core/contexts/sample-data-context';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';
import { useToast } from '@/core/hooks/use-toast';
import { useProjectContext } from '@/core/contexts/project-context';

type BMArchetype = 'PUBLIC_PROGRAM' | 'UTILITY_SERVICE' | 'SERVICE_CONTRACT' | 'LAND_VALUE_CAPTURE' | 'BLENDED_FINANCE' | 'CREDIT_ADDON' | 'INSURANCE_LINKED' | null;
type PaymentMechanismType = 'CITY_BUDGET' | 'FEE_TARIFF' | 'AVAILABILITY_PAYMENT' | 'DEVELOPER_CONTRIBUTION' | 'OUTCOME_PAYMENT' | 'CONCESSION_REVENUE' | 'CREDIT_REVENUE' | null;
type PaymentBasis = 'ASSET_UPTIME' | 'SERVICE_DELIVERY' | 'OUTCOME_VERIFIED' | 'ANNUAL_APPROPRIATION' | 'PERMITS_FEES' | 'CREDITS_SOLD' | null;
type RevenueType = 'BUDGET_ALLOCATION' | 'FEE_TARIFF_ALLOCATION' | 'SERVICE_CONTRACT_PAYMENTS' | 'DEVELOPER_FEES' | 'DISTRICT_LEVY' | 'PHILANTHROPY_GRANT' | 'DFI_LOAN' | 'BOND_PROCEEDS' | 'CREDIT_REVENUE' | 'CORPORATE_CO_FUNDING';
type RevenueRole = 'PRIMARY_DURABLE' | 'SECONDARY_SUPPORT' | 'UPSIDE_OPTIONAL';
type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type FinancingPathway = 'PUBLIC_CAPEX' | 'DFI_LOAN' | 'MUNICIPAL_BOND' | 'BLENDED_VEHICLE' | 'PPP_LIGHT' | 'PHILANTHROPY_ONLY' | null;
type BMStatus = 'NOT_STARTED' | 'DRAFT' | 'READY';
type ImportedContextMode = 'ACCEPT' | 'EDIT' | 'SCRATCH';
type BenefitType = 'RISK_REDUCTION' | 'ASSET_VALUE' | 'HEALTH' | 'LIVELIHOOD' | 'AMENITY';
type PayerRole = 'ANCHOR' | 'CO_FUNDER' | 'CREDIT_ENHANCER' | 'OFFTAKER' | 'GUARANTOR';
type PrimaryPayerConfidence = 'CONFIRMED' | 'PLANNED' | 'IDEA';
type AddOnRevenue = 'CREDIT_ADDON' | 'CORPORATE_SPONSORSHIP' | 'PHILANTHROPY_ESTABLISHMENT';
type PaymentCommitment = 'CONFIRMED' | 'PLANNED' | 'IDEA';
type PaymentDurability = 'ONE_TIME' | 'RECURRING' | 'CONTRACTED';
type CostCoverage = 'CAPEX' | 'OPEX_OM' | 'ESTABLISHMENT_ONLY' | 'MRV';
type AmountPeriod = 'ANNUAL' | 'ONE_TIME';
type AmountBasis = 'PER_SITE' | 'PROGRAM_WIDE';

interface Stakeholder {
  id: string;
  name: string;
  type: string;
}

interface ImportedContext {
  actionType?: string;
  hazardFocus?: string[];
  problemSummary?: string;
  objectives?: string[];
  solutionArchetype?: string;
  sites?: Array<{ id: string; name: string }>;
  stakeholders?: Array<{ id: string; name: string; type: string }>;
  capexBand?: { low?: number; mid?: number; high?: number; currency?: string };
  opexBand?: { low?: number; mid?: number; high?: number; currency?: string };
  omOperatingModel?: string;
  omFundingMechanisms?: string[];
}

interface PayerBeneficiary {
  stakeholderId: string;
  benefitType?: BenefitType;
  payerRole?: PayerRole;
  mechanismHint?: string;
}

interface RevenueLine {
  id: string;
  revenueType: RevenueType;
  role: RevenueRole;
  confidence: Confidence;
  durationYears?: number;
  prerequisites?: string[];
  notes?: string;
  payerStakeholderId?: string;
  amountRange?: { 
    low?: number; 
    mid?: number;
    high?: number; 
    currency?: string;
    period?: AmountPeriod;
    basis?: AmountBasis;
  };
  costCoverage?: CostCoverage[];
}

type BankabilityMaturity = 'CONCEPT_NOTE' | 'EMERGING' | 'BANKABLE_DRAFT';

interface EnablingAction {
  id: string;
  action: string;
  category: 'POLICY' | 'CONTRACTING' | 'DATA_MRV' | 'GOVERNANCE' | 'PROCUREMENT' | 'CAPACITY';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  ownerStakeholderId?: string;
  timeframe?: string;
  isEditable?: boolean;
}

interface BMRisk {
  id: string;
  riskType: 'COUNTERPARTY_CREDIT' | 'POLICY_CHANGE' | 'REVENUE_VOLATILITY' | 'MRV_ATTRIBUTION' | 'MARKET_DEMAND' | 'IMPLEMENTATION_CAPACITY' | 'CUSTOM';
  customLabel?: string;
  riskLevel: RiskLevel;
  mitigation: string;
  ownerStakeholderId?: string;
  mitigationChecked?: boolean;
  hidden?: boolean;
}

interface BusinessModelData {
  status: BMStatus;
  importedContext: ImportedContext;
  originalContext?: ImportedContext;
  importedContextMode: ImportedContextMode;
  primaryArchetype: BMArchetype;
  addOnRevenues: AddOnRevenue[];
  payerBeneficiaryMap: {
    beneficiaries: PayerBeneficiary[];
    candidatePayers: PayerBeneficiary[];
    primaryPayerId: string | null;
    primaryPayerConfidence?: PrimaryPayerConfidence;
    primaryPayerMechanismHint?: string;
  };
  paymentMechanism: {
    type: PaymentMechanismType;
    basis: PaymentBasis;
    durationYears: number | null;
    legalInstrumentHint?: string;
    commitment?: PaymentCommitment;
    durability?: PaymentDurability;
  };
  revenueStack: RevenueLine[];
  sourcesAndUsesRom: {
    capexBand?: { low?: number; mid?: number; high?: number; currency?: string };
    opexBand?: { low?: number; mid?: number; high?: number; currency?: string };
    mrvBudgetBand?: { low?: number; mid?: number; high?: number; currency?: string };
    assumptions?: string;
  };
  financingPathway: {
    pathway: FinancingPathway;
    rationale?: string;
    autoRationale?: string;
    fitReasons?: string[];
    eligibilityNotes?: string[];
  };
  consistencyChecks?: {
    recurringRevenueNeeded: boolean;
    opexCovered: boolean;
    mrvCovered: boolean;
    enablingActions: string[];
  };
  enablingActions: EnablingAction[];
  bmRisks: BMRisk[];
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

const SAMPLE_STAKEHOLDERS: Stakeholder[] = [
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
];

const BM_ARCHETYPES = [
  { id: 'PUBLIC_PROGRAM', icon: Building2, color: 'blue', bankability: 'HIGH' as const, typicalPayers: ['government'], bestWhenKey: 'publicProgramBestWhen' },
  { id: 'UTILITY_SERVICE', icon: Building2, color: 'cyan', bankability: 'HIGH' as const, typicalPayers: ['utility'], bestWhenKey: 'utilityServiceBestWhen' },
  { id: 'SERVICE_CONTRACT', icon: FileText, color: 'green', bankability: 'MEDIUM' as const, typicalPayers: ['government', 'private'], bestWhenKey: 'serviceContractBestWhen' },
  { id: 'LAND_VALUE_CAPTURE', icon: Landmark, color: 'amber', bankability: 'MEDIUM' as const, typicalPayers: ['private', 'government'], bestWhenKey: 'landValueCaptureBestWhen' },
  { id: 'BLENDED_FINANCE', icon: DollarSign, color: 'purple', bankability: 'MEDIUM' as const, typicalPayers: ['dfi', 'philanthropy', 'government'], bestWhenKey: 'blendedFinanceBestWhen' },
  { id: 'CREDIT_ADDON', icon: DollarSign, color: 'emerald', bankability: 'LOW' as const, typicalPayers: ['private'], bestWhenKey: 'creditAddonBestWhen' },
  { id: 'INSURANCE_LINKED', icon: AlertTriangle, color: 'orange', bankability: 'LOW' as const, typicalPayers: ['private'], bestWhenKey: 'insuranceLinkedBestWhen' },
];

const ADD_ON_REVENUES: AddOnRevenue[] = ['CREDIT_ADDON', 'CORPORATE_SPONSORSHIP', 'PHILANTHROPY_ESTABLISHMENT'];

const REVENUE_PREREQUISITES = [
  'COUNCIL_APPROVAL', 'BUDGET_LINE_ITEM', 'TARIFF_APPROVAL', 'CONTRACT_SIGNED',
  'GRANT_AGREEMENT', 'MOU_SIGNED', 'CREDIT_METHODOLOGY', 'SPONSOR_LOI'
];

const COST_COVERAGES: CostCoverage[] = ['CAPEX', 'OPEX_OM', 'ESTABLISHMENT_ONLY', 'MRV'];

const ARCHETYPE_PAYMENT_DEFAULTS: Record<string, { type: PaymentMechanismType; basis: PaymentBasis; durability: PaymentDurability }> = {
  PUBLIC_PROGRAM: { type: 'CITY_BUDGET', basis: 'ANNUAL_APPROPRIATION', durability: 'RECURRING' },
  UTILITY_SERVICE: { type: 'FEE_TARIFF', basis: 'SERVICE_DELIVERY', durability: 'RECURRING' },
  SERVICE_CONTRACT: { type: 'AVAILABILITY_PAYMENT', basis: 'SERVICE_DELIVERY', durability: 'CONTRACTED' },
  LAND_VALUE_CAPTURE: { type: 'DEVELOPER_CONTRIBUTION', basis: 'PERMITS_FEES', durability: 'ONE_TIME' },
  BLENDED_FINANCE: { type: 'OUTCOME_PAYMENT', basis: 'OUTCOME_VERIFIED', durability: 'CONTRACTED' },
  CREDIT_ADDON: { type: 'CREDIT_REVENUE', basis: 'CREDITS_SOLD', durability: 'RECURRING' },
  INSURANCE_LINKED: { type: 'OUTCOME_PAYMENT', basis: 'OUTCOME_VERIFIED', durability: 'CONTRACTED' },
};

const FINANCING_PATHWAY_METADATA: Record<string, { bestWhenKey: string; prerequisites: string[]; fitReasons: string[] }> = {
  PUBLIC_CAPEX: { bestWhenKey: 'publicCapexBestWhen', prerequisites: ['BUDGET_APPROVAL', 'COUNCIL_VOTE'], fitReasons: ['stableFunding', 'lowComplexity', 'quickStart'] },
  DFI_LOAN: { bestWhenKey: 'dfiLoanBestWhen', prerequisites: ['DFI_ELIGIBILITY', 'PROJECT_APPRAISAL'], fitReasons: ['lowInterest', 'technicalAssistance', 'catalyticEffect'] },
  MUNICIPAL_BOND: { bestWhenKey: 'municipalBondBestWhen', prerequisites: ['CREDIT_RATING', 'BOND_APPROVAL'], fitReasons: ['largescaleCapex', 'longTermFinancing'] },
  BLENDED_VEHICLE: { bestWhenKey: 'blendedVehicleBestWhen', prerequisites: ['VEHICLE_STRUCTURE', 'ANCHOR_INVESTOR'], fitReasons: ['riskSharing', 'catalyticCapital', 'nbsFriendly'] },
  PPP_LIGHT: { bestWhenKey: 'pppLightBestWhen', prerequisites: ['PPP_FRAMEWORK', 'PRIVATE_PARTNER'], fitReasons: ['efficiencyGains', 'riskTransfer'] },
  PHILANTHROPY_ONLY: { bestWhenKey: 'philanthropyOnlyBestWhen', prerequisites: ['GRANT_SECURED'], fitReasons: ['noRepayment', 'pilotPhase', 'capacityBuilding'] },
};

const REVENUE_TYPES: RevenueType[] = [
  'BUDGET_ALLOCATION',
  'FEE_TARIFF_ALLOCATION',
  'SERVICE_CONTRACT_PAYMENTS',
  'DEVELOPER_FEES',
  'DISTRICT_LEVY',
  'PHILANTHROPY_GRANT',
  'DFI_LOAN',
  'BOND_PROCEEDS',
  'CREDIT_REVENUE',
  'CORPORATE_CO_FUNDING',
];

const FINANCING_PATHWAYS: NonNullable<FinancingPathway>[] = [
  'PUBLIC_CAPEX',
  'DFI_LOAN',
  'MUNICIPAL_BOND',
  'BLENDED_VEHICLE',
  'PPP_LIGHT',
  'PHILANTHROPY_ONLY',
];

const BENEFIT_TYPES: BenefitType[] = [
  'RISK_REDUCTION',
  'ASSET_VALUE',
  'HEALTH',
  'LIVELIHOOD',
  'AMENITY',
];

const PAYER_ROLES: PayerRole[] = [
  'ANCHOR',
  'CO_FUNDER',
  'CREDIT_ENHANCER',
  'OFFTAKER',
  'GUARANTOR',
];

const PRIMARY_PAYER_CONFIDENCE_OPTIONS: PrimaryPayerConfidence[] = ['CONFIRMED', 'PLANNED', 'IDEA'];

const DEFAULT_RISKS: BMRisk[] = [
  { id: 'r1', riskType: 'COUNTERPARTY_CREDIT', riskLevel: 'LOW', mitigation: '' },
  { id: 'r2', riskType: 'POLICY_CHANGE', riskLevel: 'MEDIUM', mitigation: '' },
  { id: 'r3', riskType: 'REVENUE_VOLATILITY', riskLevel: 'MEDIUM', mitigation: '' },
  { id: 'r4', riskType: 'IMPLEMENTATION_CAPACITY', riskLevel: 'LOW', mitigation: '' },
];

const BM_STORAGE_KEY = 'nbs_business_model';
const OM_STORAGE_KEY = 'nbs_operations_om';

function getStoredBMData(projectId: string): BusinessModelData | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(`${BM_STORAGE_KEY}_${projectId}`);
  return stored ? JSON.parse(stored) : null;
}

function saveBMData(projectId: string, data: BusinessModelData) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${BM_STORAGE_KEY}_${projectId}`, JSON.stringify(data));
  }
}

interface OMStoredData {
  status?: string;
  operatingModel?: string;
  omCostBand?: { low?: number; mid?: number; high?: number; currency?: string };
  omFunding?: { mechanisms?: string[]; durationYears?: number };
  roles?: {
    assetOwnerEntityId?: string | null;
    operatorEntityId?: string | null;
  };
}

function getStoredOMData(projectId: string): OMStoredData | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(`${OM_STORAGE_KEY}_${projectId}`);
  return stored ? JSON.parse(stored) : null;
}

function hasValidOMData(omData: OMStoredData | null): boolean {
  if (!omData) return false;
  return omData.status === 'READY' || 
    (omData.operatingModel !== null && omData.operatingModel !== undefined);
}

function inferRecommendedArchetype(context: ImportedContext): BMArchetype {
  const hazards = context.hazardFocus || [];
  const hasUtility = context.stakeholders?.some(s => s.type === 'utility');
  
  if (hazards.includes('FLOOD') && hasUtility) return 'UTILITY_SERVICE';
  if (context.actionType === 'adaptation') return 'BLENDED_FINANCE';
  if (hazards.includes('HEAT')) return 'PUBLIC_PROGRAM';
  if (hazards.includes('LANDSLIDE')) return 'SERVICE_CONTRACT';
  return 'PUBLIC_PROGRAM';
}

function inferCandidatePayers(context: ImportedContext, stakeholders: Stakeholder[]): PayerBeneficiary[] {
  const candidates: PayerBeneficiary[] = [];
  const hazards = context.hazardFocus || [];
  
  if (hazards.includes('FLOOD')) {
    const utility = stakeholders.find(s => s.type === 'utility');
    if (utility) candidates.push({ stakeholderId: utility.id, mechanismHint: 'Stormwater fee' });
    const propOwners = stakeholders.find(s => s.id === 'property-owners');
    if (propOwners) candidates.push({ stakeholderId: propOwners.id, mechanismHint: 'Developer contribution' });
  }
  if (hazards.includes('HEAT')) {
    const cityEnv = stakeholders.find(s => s.id === 'city-env');
    if (cityEnv) candidates.push({ stakeholderId: cityEnv.id, mechanismHint: 'City budget' });
  }
  
  const cityFinance = stakeholders.find(s => s.id === 'city-finance');
  if (cityFinance && candidates.length === 0) {
    candidates.push({ stakeholderId: cityFinance.id, mechanismHint: 'City budget' });
  }
  
  return candidates;
}

function inferBeneficiaries(context: ImportedContext, stakeholders: Stakeholder[]): PayerBeneficiary[] {
  const beneficiaries: PayerBeneficiary[] = [];
  
  const community = stakeholders.find(s => s.type === 'community');
  if (community) beneficiaries.push({ stakeholderId: community.id, benefitType: 'RISK_REDUCTION' });
  
  const propOwners = stakeholders.find(s => s.id === 'property-owners');
  if (propOwners) beneficiaries.push({ stakeholderId: propOwners.id, benefitType: 'ASSET_VALUE' });
  
  return beneficiaries;
}

function buildInitialBMData(actionType: string, hazards: string[], stakeholders: Stakeholder[], omData: OMStoredData | null): BusinessModelData {
  const isNBS = actionType === 'adaptation';
  
  const importedContext: ImportedContext = {
    actionType,
    hazardFocus: hazards,
    problemSummary: 'Climate vulnerability requiring nature-based interventions',
    objectives: ['Reduce climate risk', 'Improve urban resilience', 'Enhance ecosystem services'],
    solutionArchetype: isNBS ? 'Nature-Based Solution' : 'Traditional Infrastructure',
    sites: [
      { id: 'zone-1', name: 'Centro Histórico' },
      { id: 'zone-2', name: 'Cidade Baixa' },
    ],
    stakeholders: stakeholders.slice(0, 6),
    capexBand: { low: 5000000, mid: 10000000, high: 20000000, currency: 'BRL' },
    opexBand: omData?.omCostBand || { low: 500000, mid: 1000000, high: 2000000, currency: 'BRL' },
    omOperatingModel: omData?.operatingModel || undefined,
    omFundingMechanisms: omData?.omFunding?.mechanisms || [],
  };

  const recommendedArchetype = inferRecommendedArchetype(importedContext);
  const candidatePayers = inferCandidatePayers(importedContext, stakeholders);
  const beneficiaries = inferBeneficiaries(importedContext, stakeholders);

  const revenueStack: RevenueLine[] = [
    {
      id: 'rev-1',
      revenueType: 'BUDGET_ALLOCATION',
      role: 'PRIMARY_DURABLE',
      confidence: 'MEDIUM',
      durationYears: 5,
      prerequisites: ['Council approval', 'Budget line item'],
      notes: 'Annual municipal budget allocation',
    },
  ];

  if (isNBS) {
    revenueStack.push({
      id: 'rev-2',
      revenueType: 'PHILANTHROPY_GRANT',
      role: 'SECONDARY_SUPPORT',
      confidence: 'MEDIUM',
      durationYears: 3,
      prerequisites: ['Grant application', 'Matching funds'],
      notes: 'Establishment period grant',
    });
    revenueStack.push({
      id: 'rev-3',
      revenueType: 'CREDIT_REVENUE',
      role: 'UPSIDE_OPTIONAL',
      confidence: 'LOW',
      durationYears: 10,
      prerequisites: ['MRV protocol', 'Registry registration', 'Buyer agreement'],
      notes: 'Carbon/ecosystem credits - do not rely on as primary',
    });
  }

  const enablingActions: EnablingAction[] = [
    { id: 'ea-1', action: 'Pass ordinance to earmark budget line', category: 'POLICY', priority: 'HIGH', ownerStakeholderId: 'city-finance' },
    { id: 'ea-2', action: 'Sign service/stewardship contract', category: 'CONTRACTING', priority: 'HIGH', ownerStakeholderId: 'city-env' },
    { id: 'ea-3', action: 'Define MRV protocol for outcomes', category: 'DATA_MRV', priority: 'MEDIUM', ownerStakeholderId: 'smam' },
    { id: 'ea-4', action: 'Identify and confirm creditworthy payer', category: 'GOVERNANCE', priority: 'HIGH' },
  ];

  return {
    status: 'NOT_STARTED',
    importedContext,
    originalContext: { ...importedContext },
    importedContextMode: 'ACCEPT' as ImportedContextMode,
    primaryArchetype: recommendedArchetype,
    addOnRevenues: isNBS ? ['PHILANTHROPY_ESTABLISHMENT'] : [],
    payerBeneficiaryMap: {
      beneficiaries,
      candidatePayers,
      primaryPayerId: candidatePayers[0]?.stakeholderId || null,
      primaryPayerConfidence: 'IDEA' as PrimaryPayerConfidence,
    },
    paymentMechanism: {
      type: 'CITY_BUDGET',
      basis: 'ANNUAL_APPROPRIATION',
      durationYears: 5,
      legalInstrumentHint: 'ORDINANCE',
    },
    revenueStack,
    sourcesAndUsesRom: {
      capexBand: importedContext.capexBand,
      opexBand: importedContext.opexBand,
      mrvBudgetBand: { low: 50000, mid: 100000, high: 200000, currency: 'BRL' },
      assumptions: 'Based on comparable NBS projects in Latin America',
    },
    financingPathway: {
      pathway: isNBS ? 'BLENDED_VEHICLE' : 'PUBLIC_CAPEX',
      rationale: isNBS ? 'NBS projects benefit from blended public + philanthropic funding' : 'Traditional municipal capital expenditure',
      eligibilityNotes: ['City has investment grade rating', 'Project aligns with climate action plan'],
    },
    enablingActions,
    bmRisks: DEFAULT_RISKS.map(r => ({ ...r })),
    readiness: {
      blockers: [],
      checklist: {
        primaryArchetypeSelected: false,
        primaryPayerSelected: false,
        oneHighConfidenceRevenueLine: false,
        durationSet: false,
        financingPathwaySelected: false,
        consistencyCheckedWithOps: false,
      },
    },
  };
}

export default function BusinessModelPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { sampleActions } = useSampleData();
  const { routePrefix } = useSampleRoute();
  const { loadContext, updateModule } = useProjectContext();

  // Separate navigation persistence from domain data
  const { 
    navigationState: savedNavState, 
    updateNavigationState, 
    navigationRestored 
  } = useNavigationPersistence({
    projectId,
    moduleName: 'businessModel',
  });

  const [currentStep, setCurrentStep] = useState(0);
  const [bmData, setBMData] = useState<BusinessModelData | null>(null);
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const [editContextOpen, setEditContextOpen] = useState(false);
  const [editingContext, setEditingContext] = useState<ImportedContext | null>(null);

  const action = sampleActions.find(a => a.id === projectId);
  const isNBS = action?.type === 'adaptation';
  const stakeholders = SAMPLE_STAKEHOLDERS;
  const hazards = ['FLOOD', 'HEAT', 'LANDSLIDE'];

  // Restore navigation from dedicated hook
  useEffect(() => {
    if (navigationRestored && savedNavState) {
      setCurrentStep(savedNavState.currentStep ?? 0);
    }
  }, [navigationRestored, savedNavState]);

  // Load business model data
  useEffect(() => {
    if (projectId) {
      const stored = getStoredBMData(projectId);
      if (stored) {
        setBMData(stored);
      } else {
        const omData = getStoredOMData(projectId);
        const initial = buildInitialBMData(action?.type || 'adaptation', hazards, stakeholders, omData);
        setBMData(initial);
      }
    }
  }, [projectId, action?.type]);

  // Persist navigation using dedicated hook (completely separate from domain data)
  useEffect(() => {
    if (!navigationRestored) return;
    updateNavigationState({ currentStep });
  }, [currentStep, navigationRestored, updateNavigationState]);

  // Listen for agent block updates
  useEffect(() => {
    const handleBlockUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.blockType === 'business_model') {
        console.log('[BusinessModel] Received nbs-block-updated event, re-hydrating...');
        // Re-fetch data from context
        const existingContext = loadContext(projectId || '', { skipDbSync: true });
        const savedData = existingContext?.businessModel;
        if (savedData) {
          // Update local state with any changes from agent patches
          const stored = getStoredBMData(projectId || '');
          if (stored) {
            setBMData(stored);
          }
        }
      }
    };
    window.addEventListener('nbs-block-updated', handleBlockUpdate);
    return () => window.removeEventListener('nbs-block-updated', handleBlockUpdate);
  }, [projectId, loadContext]);

  useEffect(() => {
    if (projectId && bmData) {
      const updatedData = { ...bmData };
      const hasHighConfidence = bmData.revenueStack.some(r => r.confidence === 'HIGH');
      const omData = getStoredOMData(projectId);
      const omIsValid = hasValidOMData(omData);
      
      updatedData.readiness.checklist = {
        primaryArchetypeSelected: bmData.primaryArchetype !== null,
        primaryPayerSelected: bmData.payerBeneficiaryMap.primaryPayerId !== null,
        oneHighConfidenceRevenueLine: hasHighConfidence,
        durationSet: bmData.paymentMechanism.durationYears !== null,
        financingPathwaySelected: bmData.financingPathway.pathway !== null,
        consistencyCheckedWithOps: omIsValid,
      };
      
      const blockers: string[] = [];
      if (!updatedData.readiness.checklist.primaryArchetypeSelected) blockers.push('selectArchetype');
      if (!updatedData.readiness.checklist.primaryPayerSelected) blockers.push('selectPrimaryPayer');
      if (!updatedData.readiness.checklist.oneHighConfidenceRevenueLine) blockers.push('addHighConfidenceRevenue');
      if (!updatedData.readiness.checklist.durationSet) blockers.push('setDuration');
      if (!updatedData.readiness.checklist.financingPathwaySelected) blockers.push('selectFinancingPathway');
      if (!updatedData.readiness.checklist.consistencyCheckedWithOps) blockers.push('completeOMFirst');
      
      updatedData.readiness.blockers = blockers;
      
      const allRequired = updatedData.readiness.checklist.primaryArchetypeSelected &&
        updatedData.readiness.checklist.primaryPayerSelected &&
        updatedData.readiness.checklist.oneHighConfidenceRevenueLine &&
        updatedData.readiness.checklist.durationSet &&
        updatedData.readiness.checklist.financingPathwaySelected &&
        updatedData.readiness.checklist.consistencyCheckedWithOps;
      
      updatedData.status = allRequired ? 'READY' : (bmData.primaryArchetype ? 'DRAFT' : 'NOT_STARTED');
      
      saveBMData(projectId, updatedData);
    }
  }, [projectId, bmData]);

  const updateBMData = (updates: Partial<BusinessModelData>) => {
    if (bmData) {
      setBMData({ ...bmData, ...updates });
    }
  };

  const steps = [
    { id: 'overview', icon: FileText },
    { id: 'payers', icon: Users },
    { id: 'archetype', icon: Landmark },
    { id: 'revenue', icon: DollarSign },
    { id: 'financing', icon: Building2 },
    { id: 'bankability', icon: AlertTriangle },
    { id: 'playbook', icon: Copy },
  ];

  const computeBankabilityMaturity = (): BankabilityMaturity => {
    if (!bmData) return 'CONCEPT_NOTE';
    
    const hasArchetype = bmData.primaryArchetype !== null;
    const hasPayer = bmData.payerBeneficiaryMap.primaryPayerId !== null;
    const hasHighConfidenceRevenue = bmData.revenueStack.some(r => r.confidence === 'HIGH');
    const hasMediumConfidenceRevenue = bmData.revenueStack.some(r => r.confidence === 'MEDIUM' || r.confidence === 'HIGH');
    const hasPaymentMechanism = bmData.paymentMechanism.type !== null && bmData.paymentMechanism.durationYears !== null;
    const hasFinancingPathway = bmData.financingPathway.pathway !== null;
    const hasOpexCoverage = bmData.revenueStack.some(r => r.costCoverage?.includes('OPEX_OM'));
    const payerConfirmed = bmData.payerBeneficiaryMap.primaryPayerConfidence === 'CONFIRMED';
    
    if (hasArchetype && hasPayer && payerConfirmed && hasHighConfidenceRevenue && hasPaymentMechanism && hasFinancingPathway && hasOpexCoverage) {
      return 'BANKABLE_DRAFT';
    }
    if (hasArchetype && hasPayer && hasMediumConfidenceRevenue && hasPaymentMechanism) {
      return 'EMERGING';
    }
    return 'CONCEPT_NOTE';
  };

  const getBankabilityBlockers = (): string[] => {
    if (!bmData) return [];
    const blockers: string[] = [];
    
    if (bmData.payerBeneficiaryMap.primaryPayerConfidence !== 'CONFIRMED') {
      blockers.push('payerNotConfirmed');
    }
    if (!bmData.paymentMechanism.type || !bmData.paymentMechanism.basis) {
      blockers.push('paymentMechanismIncomplete');
    }
    if (!bmData.revenueStack.some(r => r.confidence === 'HIGH' || r.confidence === 'MEDIUM')) {
      blockers.push('noConfidentRevenue');
    }
    if (!bmData.revenueStack.some(r => r.costCoverage?.includes('OPEX_OM'))) {
      blockers.push('opexNotCoveredBeyondEstablishment');
    }
    if ((bmData.primaryArchetype === 'CREDIT_ADDON' || bmData.paymentMechanism.basis === 'OUTCOME_VERIFIED') && 
        !bmData.revenueStack.some(r => r.costCoverage?.includes('MRV'))) {
      blockers.push('mrvRequiredForOutcomeModel');
    }
    if (!bmData.financingPathway.pathway) {
      blockers.push('noFinancingPathway');
    }
    
    return blockers.slice(0, 5);
  };

  const canNavigateToStep = (_stepIndex: number): boolean => {
    return true;
  };

  const getStakeholderName = (id: string | null) => {
    if (!id) return t('bm.notAssigned');
    return stakeholders.find(s => s.id === id)?.name || id;
  };

  const generatePlaybookText = () => {
    if (!bmData) return '';
    
    let text = `# ${t('bm.businessModelPlaybook')}\n\n`;
    
    text += `## ${t('bm.primaryArchetype')}\n`;
    text += `${t(`bm.archetypes.${bmData.primaryArchetype}`)}\n\n`;
    
    text += `## ${t('bm.payerBeneficiaryLogic')}\n`;
    text += `### ${t('bm.primaryPayer')}\n`;
    text += `${getStakeholderName(bmData.payerBeneficiaryMap.primaryPayerId)}\n\n`;
    
    text += `### ${t('bm.beneficiaries')}\n`;
    bmData.payerBeneficiaryMap.beneficiaries.forEach(b => {
      text += `- ${getStakeholderName(b.stakeholderId)}: ${b.benefitType || 'N/A'}\n`;
    });
    text += '\n';
    
    text += `## ${t('bm.paymentMechanism')}\n`;
    text += `- ${t('bm.type')}: ${t(`bm.paymentTypes.${bmData.paymentMechanism.type}`)}\n`;
    text += `- ${t('bm.basis')}: ${t(`bm.paymentBasis.${bmData.paymentMechanism.basis}`)}\n`;
    text += `- ${t('bm.duration')}: ${bmData.paymentMechanism.durationYears} ${t('bm.years')}\n`;
    if (bmData.paymentMechanism.legalInstrumentHint) {
      text += `- ${t('bm.legalInstrument')}: ${t(`bm.legalInstruments.${bmData.paymentMechanism.legalInstrumentHint}`)}\n`;
    }
    text += '\n';
    
    text += `## ${t('bm.revenueStack')}\n`;
    bmData.revenueStack.forEach(rev => {
      text += `- ${t(`bm.revenueTypes.${rev.revenueType}`)} (${t(`bm.roles.${rev.role}`)}, ${t(`bm.confidence.${rev.confidence}`)})\n`;
      if (rev.prerequisites && rev.prerequisites.length > 0) {
        text += `  Prerequisites: ${rev.prerequisites.join(', ')}\n`;
      }
    });
    text += '\n';
    
    text += `## ${t('bm.financingPathway')}\n`;
    text += `${t(`bm.pathways.${bmData.financingPathway.pathway}`)}\n`;
    if (bmData.financingPathway.rationale) {
      text += `${bmData.financingPathway.rationale}\n`;
    }
    text += '\n';
    
    text += `## ${t('bm.enablingActions')}\n`;
    bmData.enablingActions.forEach(ea => {
      text += `- [${ea.priority}] ${ea.action} (${t(`bm.categories.${ea.category}`)})\n`;
    });
    text += '\n';
    
    text += `## ${t('bm.keyRisks')}\n`;
    bmData.bmRisks.forEach(risk => {
      text += `- ${t(`bm.riskTypes.${risk.riskType}`)} (${t(`bm.riskLevel.${risk.riskLevel}`)}): ${risk.mitigation || t('bm.noMitigation')}\n`;
    });
    
    return text;
  };

  const copyPlaybook = () => {
    const text = generatePlaybookText();
    navigator.clipboard.writeText(text);
    toast({
      title: t('bm.copied'),
      description: t('bm.playbookCopied'),
    });
  };

  const addRevenueLine = () => {
    if (!bmData) return;
    const newLine: RevenueLine = {
      id: `rev-${Date.now()}`,
      revenueType: 'BUDGET_ALLOCATION',
      role: 'SECONDARY_SUPPORT',
      confidence: 'LOW',
      durationYears: 3,
      prerequisites: [],
      notes: '',
    };
    updateBMData({
      revenueStack: [...bmData.revenueStack, newLine],
    });
  };

  const removeRevenueLine = (id: string) => {
    if (!bmData) return;
    updateBMData({
      revenueStack: bmData.revenueStack.filter(r => r.id !== id),
    });
  };

  const updateRevenueLine = (id: string, updates: Partial<RevenueLine>) => {
    if (!bmData) return;
    updateBMData({
      revenueStack: bmData.revenueStack.map(r => r.id === id ? { ...r, ...updates } : r),
    });
  };

  const handleAcceptContext = () => {
    if (!bmData) return;
    updateBMData({ importedContextMode: 'ACCEPT' });
    toast({ title: t('bm.contextAccepted'), description: t('bm.contextAcceptedDesc') });
    setCurrentStep(1);
  };

  const handleEditContext = () => {
    if (!bmData) return;
    setEditingContext({ ...bmData.importedContext });
    setEditContextOpen(true);
  };

  const handleSaveEditedContext = () => {
    if (!bmData || !editingContext) return;
    updateBMData({ 
      importedContext: editingContext, 
      importedContextMode: 'EDIT',
      sourcesAndUsesRom: {
        ...bmData.sourcesAndUsesRom,
        capexBand: editingContext.capexBand,
        opexBand: editingContext.opexBand,
      }
    });
    setEditContextOpen(false);
    toast({ title: t('bm.contextEdited'), description: t('bm.contextEditedDesc') });
  };

  const handleStartFromScratch = () => {
    if (!bmData || !projectId) return;
    const omData = getStoredOMData(projectId);
    const freshData = buildInitialBMData(action?.type || 'adaptation', hazards, stakeholders, omData);
    freshData.importedContextMode = 'SCRATCH';
    freshData.originalContext = bmData.originalContext;
    freshData.payerBeneficiaryMap = { beneficiaries: [], candidatePayers: [], primaryPayerId: null };
    freshData.revenueStack = [];
    freshData.primaryArchetype = null;
    freshData.financingPathway = { pathway: null };
    setBMData(freshData);
    toast({ title: t('bm.startedFromScratch'), description: t('bm.startedFromScratchDesc') });
  };

  const addEnablingAction = () => {
    if (!bmData) return;
    const newAction: EnablingAction = {
      id: `ea-${Date.now()}`,
      action: '',
      category: 'GOVERNANCE',
      priority: 'MEDIUM',
      isEditable: true,
    };
    updateBMData({
      enablingActions: [...bmData.enablingActions, newAction],
    });
  };

  const removeEnablingAction = (id: string) => {
    if (!bmData) return;
    updateBMData({
      enablingActions: bmData.enablingActions.filter(a => a.id !== id),
    });
  };

  const updateEnablingAction = (id: string, updates: Partial<EnablingAction>) => {
    if (!bmData) return;
    updateBMData({
      enablingActions: bmData.enablingActions.map(a => a.id === id ? { ...a, ...updates } : a),
    });
  };

  const addBMRisk = () => {
    if (!bmData) return;
    const newRisk: BMRisk = {
      id: `risk-${Date.now()}`,
      riskType: 'CUSTOM',
      customLabel: '',
      riskLevel: 'MEDIUM',
      mitigation: '',
    };
    updateBMData({
      bmRisks: [...bmData.bmRisks, newRisk],
    });
  };

  const removeBMRisk = (id: string) => {
    if (!bmData) return;
    updateBMData({
      bmRisks: bmData.bmRisks.filter(r => r.id !== id),
    });
  };

  const updateBMRisk = (id: string, updates: Partial<BMRisk>) => {
    if (!bmData) return;
    updateBMData({
      bmRisks: bmData.bmRisks.map(r => r.id === id ? { ...r, ...updates } : r),
    });
  };

  const toggleRiskHidden = (id: string) => {
    if (!bmData) return;
    updateBMData({
      bmRisks: bmData.bmRisks.map(r => r.id === id ? { ...r, hidden: !r.hidden } : r),
    });
  };

  const generateMiroPrompt = () => {
    if (!bmData) return '';
    
    let prompt = `Value Flow Diagram for NBS Business Model\n\n`;
    prompt += `PRIMARY PAYER: ${getStakeholderName(bmData.payerBeneficiaryMap.primaryPayerId)}\n`;
    prompt += `↓ ${t(`bm.paymentTypes.${bmData.paymentMechanism.type}`)} ↓\n`;
    prompt += `PROJECT/ASSET\n`;
    prompt += `↓ benefits ↓\n`;
    prompt += `BENEFICIARIES:\n`;
    bmData.payerBeneficiaryMap.beneficiaries.forEach(b => {
      prompt += `  - ${getStakeholderName(b.stakeholderId)} (${b.benefitType})\n`;
    });
    prompt += `\nREVENUE STREAMS:\n`;
    bmData.revenueStack.forEach(r => {
      const payer = r.payerStakeholderId ? getStakeholderName(r.payerStakeholderId) : 'TBD';
      prompt += `  ${payer} → ${t(`bm.revenueTypes.${r.revenueType}`)} → Project\n`;
    });
    prompt += `\nFINANCING: ${t(`bm.pathways.${bmData.financingPathway.pathway}`)}\n`;
    
    return prompt;
  };

  const copyMiroPrompt = () => {
    const prompt = generateMiroPrompt();
    navigator.clipboard.writeText(prompt);
    toast({
      title: t('bm.copied'),
      description: t('bm.miroPromptCopied'),
    });
  };

  const exportPlaybookJSON = () => {
    if (!bmData) return;
    const data = {
      archetype: bmData.primaryArchetype,
      payerBeneficiaryMap: bmData.payerBeneficiaryMap,
      paymentMechanism: bmData.paymentMechanism,
      revenueStack: bmData.revenueStack,
      financingPathway: bmData.financingPathway,
      sourcesAndUsesRom: bmData.sourcesAndUsesRom,
      enablingActions: bmData.enablingActions,
      risks: bmData.bmRisks.filter(r => !r.hidden),
      bankabilityMaturity: computeBankabilityMaturity(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'business-model-playbook.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: t('bm.exported'),
      description: t('bm.playbookExported'),
    });
  };

  const updateBeneficiary = (stakeholderId: string, updates: Partial<PayerBeneficiary>) => {
    if (!bmData) return;
    updateBMData({
      payerBeneficiaryMap: {
        ...bmData.payerBeneficiaryMap,
        beneficiaries: bmData.payerBeneficiaryMap.beneficiaries.map(b =>
          b.stakeholderId === stakeholderId ? { ...b, ...updates } : b
        ),
      },
    });
  };

  const updateCandidatePayer = (stakeholderId: string, updates: Partial<PayerBeneficiary>) => {
    if (!bmData) return;
    updateBMData({
      payerBeneficiaryMap: {
        ...bmData.payerBeneficiaryMap,
        candidatePayers: bmData.payerBeneficiaryMap.candidatePayers.map(p =>
          p.stakeholderId === stakeholderId ? { ...p, ...updates } : p
        ),
      },
    });
  };

  if (!bmData) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <p>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const completedSteps = Object.values(bmData.readiness.checklist).filter(Boolean).length;
  const totalSteps = Object.keys(bmData.readiness.checklist).length;
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
            <h1 className="text-2xl font-bold">{t('bm.pageTitle')}</h1>
            <p className="text-muted-foreground">{action?.name}</p>
          </div>
          <Badge variant={bmData.status === 'READY' ? 'default' : bmData.status === 'DRAFT' ? 'secondary' : 'outline'}>
            {t(`bm.status.${bmData.status}`)}
          </Badge>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">{t('bm.bankabilityProgress')}</span>
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
              {t(`bm.steps.${step.id}`)}
            </Button>
          ))}
        </div>

        {currentStep === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('bm.overviewTitle')}</CardTitle>
              <CardDescription>{t('bm.overviewDescription')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg">
                <h3 className="font-medium mb-3">{t('bm.importedContext')}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('bm.actionType')}:</span>
                    <span className="ml-2">{isNBS ? t('bm.nbs') : t('bm.traditional')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('bm.hazards')}:</span>
                    <span className="ml-2">{bmData.importedContext.hazardFocus?.join(', ')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('bm.sites')}:</span>
                    <span className="ml-2">{bmData.importedContext.sites?.length || 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('bm.stakeholders')}:</span>
                    <span className="ml-2">{bmData.importedContext.stakeholders?.length || 0}</span>
                  </div>
                </div>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg">
                <h3 className="font-medium mb-3">{t('bm.budgetContext')}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('bm.capexBand')}:</span>
                    <span className="ml-2">
                      {bmData.sourcesAndUsesRom.capexBand?.low?.toLocaleString()} - {bmData.sourcesAndUsesRom.capexBand?.high?.toLocaleString()} {bmData.sourcesAndUsesRom.capexBand?.currency}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('bm.opexBand')}:</span>
                    <span className="ml-2">
                      {bmData.sourcesAndUsesRom.opexBand?.low?.toLocaleString()} - {bmData.sourcesAndUsesRom.opexBand?.high?.toLocaleString()} {bmData.sourcesAndUsesRom.opexBand?.currency}
                    </span>
                  </div>
                </div>
              </div>

              {bmData.importedContext.omOperatingModel && (
                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h3 className="font-medium mb-2 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    {t('bm.omContext')}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t('bm.operatingModel')}: {bmData.importedContext.omOperatingModel}
                  </p>
                  {bmData.importedContext.omFundingMechanisms && bmData.importedContext.omFundingMechanisms.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {t('bm.omFundingMechanisms')}: {bmData.importedContext.omFundingMechanisms.join(', ')}
                    </p>
                  )}
                </div>
              )}

              {bmData.importedContextMode && (
                <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                  <Badge variant={bmData.importedContextMode === 'ACCEPT' ? 'default' : bmData.importedContextMode === 'EDIT' ? 'secondary' : 'outline'}>
                    {t(`bm.contextMode.${bmData.importedContextMode}`)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{t('bm.currentContextMode')}</span>
                </div>
              )}

              <div className="border-t pt-4">
                <Label className="text-base font-medium mb-3 block">{t('bm.contextActions')}</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Button variant="default" onClick={handleAcceptContext} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    {t('bm.acceptPrefill')}
                  </Button>
                  <Button variant="outline" onClick={handleEditContext} className="flex items-center gap-2">
                    <Edit className="h-4 w-4" />
                    {t('bm.editContext')}
                  </Button>
                  <Button variant="ghost" onClick={handleStartFromScratch} className="flex items-center gap-2 text-destructive hover:text-destructive">
                    <RotateCcw className="h-4 w-4" />
                    {t('bm.startFromScratch')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={editContextOpen} onOpenChange={setEditContextOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('bm.editImportedContext')}</DialogTitle>
              <DialogDescription>{t('bm.editContextDescription')}</DialogDescription>
            </DialogHeader>
            {editingContext && (
              <div className="space-y-4">
                <div>
                  <Label>{t('bm.problemSummary')}</Label>
                  <Textarea
                    value={editingContext.problemSummary || ''}
                    onChange={(e) => setEditingContext({ ...editingContext, problemSummary: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('bm.capexLow')}</Label>
                    <Input
                      type="number"
                      value={editingContext.capexBand?.low || 0}
                      onChange={(e) => setEditingContext({
                        ...editingContext,
                        capexBand: { ...editingContext.capexBand, low: Number(e.target.value) }
                      })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>{t('bm.capexHigh')}</Label>
                    <Input
                      type="number"
                      value={editingContext.capexBand?.high || 0}
                      onChange={(e) => setEditingContext({
                        ...editingContext,
                        capexBand: { ...editingContext.capexBand, high: Number(e.target.value) }
                      })}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('bm.opexLow')}</Label>
                    <Input
                      type="number"
                      value={editingContext.opexBand?.low || 0}
                      onChange={(e) => setEditingContext({
                        ...editingContext,
                        opexBand: { ...editingContext.opexBand, low: Number(e.target.value) }
                      })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>{t('bm.opexHigh')}</Label>
                    <Input
                      type="number"
                      value={editingContext.opexBand?.high || 0}
                      onChange={(e) => setEditingContext({
                        ...editingContext,
                        opexBand: { ...editingContext.opexBand, high: Number(e.target.value) }
                      })}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t('common.cancel')}</Button>
              </DialogClose>
              <Button onClick={handleSaveEditedContext}>{t('common.save')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {currentStep === 1 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('bm.payerBeneficiaryTitle')}</CardTitle>
                <CardDescription>{t('bm.payerBeneficiaryDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label className="text-base font-medium">{t('bm.beneficiaries')}</Label>
                  <p className="text-sm text-muted-foreground mb-3">{t('bm.beneficiariesHint')}</p>
                  <div className="space-y-3">
                    {stakeholders.filter(s => ['community', 'private'].includes(s.type)).map(stakeholder => {
                      const isSelected = bmData.payerBeneficiaryMap.beneficiaries.some(b => b.stakeholderId === stakeholder.id);
                      const beneficiary = bmData.payerBeneficiaryMap.beneficiaries.find(b => b.stakeholderId === stakeholder.id);
                      return (
                        <div key={stakeholder.id} className={`p-3 border rounded-lg ${isSelected ? 'border-primary bg-primary/5' : ''}`}>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`ben-${stakeholder.id}`}
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  updateBMData({
                                    payerBeneficiaryMap: {
                                      ...bmData.payerBeneficiaryMap,
                                      beneficiaries: [...bmData.payerBeneficiaryMap.beneficiaries, { stakeholderId: stakeholder.id }],
                                    },
                                  });
                                } else {
                                  updateBMData({
                                    payerBeneficiaryMap: {
                                      ...bmData.payerBeneficiaryMap,
                                      beneficiaries: bmData.payerBeneficiaryMap.beneficiaries.filter(b => b.stakeholderId !== stakeholder.id),
                                    },
                                  });
                                }
                              }}
                            />
                            <Label htmlFor={`ben-${stakeholder.id}`} className="text-sm flex-1">
                              {stakeholder.name}
                              <Badge variant="outline" className="ml-2 text-xs">{stakeholder.type}</Badge>
                            </Label>
                          </div>
                          {isSelected && (
                            <div className="mt-2 ml-6">
                              <Label className="text-xs text-muted-foreground">{t('bm.benefitType')} *</Label>
                              <Select
                                value={beneficiary?.benefitType || ''}
                                onValueChange={(value) => updateBeneficiary(stakeholder.id, { benefitType: value as BenefitType })}
                              >
                                <SelectTrigger className="h-8 mt-1">
                                  <SelectValue placeholder={t('bm.selectBenefitType')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {BENEFIT_TYPES.map(type => (
                                    <SelectItem key={type} value={type}>{t(`bm.benefitTypes.${type}`)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label className="text-base font-medium">{t('bm.candidatePayers')}</Label>
                  <p className="text-sm text-muted-foreground mb-3">{t('bm.candidatePayersHint')}</p>
                  <div className="space-y-3">
                    {stakeholders.filter(s => ['government', 'utility', 'private', 'dfi', 'philanthropy'].includes(s.type)).map(stakeholder => {
                      const isSelected = bmData.payerBeneficiaryMap.candidatePayers.some(p => p.stakeholderId === stakeholder.id);
                      const payer = bmData.payerBeneficiaryMap.candidatePayers.find(p => p.stakeholderId === stakeholder.id);
                      return (
                        <div key={stakeholder.id} className={`p-3 border rounded-lg ${isSelected ? 'border-primary bg-primary/5' : ''}`}>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`payer-${stakeholder.id}`}
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  updateBMData({
                                    payerBeneficiaryMap: {
                                      ...bmData.payerBeneficiaryMap,
                                      candidatePayers: [...bmData.payerBeneficiaryMap.candidatePayers, { stakeholderId: stakeholder.id }],
                                    },
                                  });
                                } else {
                                  updateBMData({
                                    payerBeneficiaryMap: {
                                      ...bmData.payerBeneficiaryMap,
                                      candidatePayers: bmData.payerBeneficiaryMap.candidatePayers.filter(p => p.stakeholderId !== stakeholder.id),
                                    },
                                  });
                                }
                              }}
                            />
                            <Label htmlFor={`payer-${stakeholder.id}`} className="text-sm flex-1">
                              {stakeholder.name}
                              <Badge variant="outline" className="ml-2 text-xs">{stakeholder.type}</Badge>
                            </Label>
                          </div>
                          {isSelected && (
                            <div className="mt-2 ml-6 grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs text-muted-foreground">{t('bm.payerRole')} *</Label>
                                <Select
                                  value={payer?.payerRole || ''}
                                  onValueChange={(value) => updateCandidatePayer(stakeholder.id, { payerRole: value as PayerRole })}
                                >
                                  <SelectTrigger className="h-8 mt-1">
                                    <SelectValue placeholder={t('bm.selectPayerRole')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {PAYER_ROLES.map(role => (
                                      <SelectItem key={role} value={role}>{t(`bm.payerRoles.${role}`)}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">{t('bm.mechanismHint')}</Label>
                                <Input
                                  className="h-8 mt-1"
                                  placeholder={t('bm.mechanismHintPlaceholder')}
                                  value={payer?.mechanismHint || ''}
                                  onChange={(e) => updateCandidatePayer(stakeholder.id, { mechanismHint: e.target.value })}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <Label className="text-base font-medium">{t('bm.primaryPayer')} *</Label>
                  <p className="text-sm text-muted-foreground mb-3">{t('bm.primaryPayerHint')}</p>
                  <div className="space-y-4">
                    <Select
                      value={bmData.payerBeneficiaryMap.primaryPayerId || ''}
                      onValueChange={(value) => updateBMData({
                        payerBeneficiaryMap: {
                          ...bmData.payerBeneficiaryMap,
                          primaryPayerId: value,
                        },
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('bm.selectPrimaryPayer')} />
                      </SelectTrigger>
                      <SelectContent>
                        {bmData.payerBeneficiaryMap.candidatePayers.map(payer => (
                          <SelectItem key={payer.stakeholderId} value={payer.stakeholderId}>
                            {getStakeholderName(payer.stakeholderId)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {bmData.payerBeneficiaryMap.primaryPayerId && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                        <div>
                          <Label className="text-sm">{t('bm.paymentMechanismHint')} *</Label>
                          <Input
                            className="mt-1"
                            placeholder={t('bm.paymentMechanismHintPlaceholder')}
                            value={bmData.payerBeneficiaryMap.primaryPayerMechanismHint || ''}
                            onChange={(e) => updateBMData({
                              payerBeneficiaryMap: {
                                ...bmData.payerBeneficiaryMap,
                                primaryPayerMechanismHint: e.target.value,
                              },
                            })}
                          />
                        </div>
                        <div>
                          <Label className="text-sm">{t('bm.primaryPayerConfidence')} *</Label>
                          <Select
                            value={bmData.payerBeneficiaryMap.primaryPayerConfidence || ''}
                            onValueChange={(value) => updateBMData({
                              payerBeneficiaryMap: {
                                ...bmData.payerBeneficiaryMap,
                                primaryPayerConfidence: value as PrimaryPayerConfidence,
                              },
                            })}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder={t('bm.selectConfidence')} />
                            </SelectTrigger>
                            <SelectContent>
                              {PRIMARY_PAYER_CONFIDENCE_OPTIONS.map(conf => (
                                <SelectItem key={conf} value={conf}>{t(`bm.confidence.${conf}`)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('bm.archetypeTitle')}</CardTitle>
                <CardDescription>{t('bm.archetypeDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Label className="text-base font-medium">{t('bm.primaryArchetypeLabel')} *</Label>
                <RadioGroup
                  value={bmData.primaryArchetype || ''}
                  onValueChange={(value) => {
                    const defaults = ARCHETYPE_PAYMENT_DEFAULTS[value];
                    updateBMData({ 
                      primaryArchetype: value as BMArchetype,
                      paymentMechanism: defaults ? {
                        ...bmData.paymentMechanism,
                        type: defaults.type,
                        basis: defaults.basis,
                        durability: defaults.durability,
                      } : bmData.paymentMechanism,
                    });
                  }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  {BM_ARCHETYPES.map(archetype => {
                    const isRecommended = archetype.id === inferRecommendedArchetype(bmData.importedContext);
                    const bankabilityColor = archetype.bankability === 'HIGH' ? 'bg-green-500' : archetype.bankability === 'MEDIUM' ? 'bg-yellow-500' : 'bg-red-500';
                    return (
                      <div key={archetype.id} className="relative">
                        <RadioGroupItem
                          value={archetype.id}
                          id={archetype.id}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={archetype.id}
                          className="flex flex-col p-4 border rounded-lg cursor-pointer peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover:bg-muted/50"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <archetype.icon className="h-5 w-5" />
                              <span className="font-medium">{t(`bm.archetypes.${archetype.id}`)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${bankabilityColor}`} title={t(`bm.bankability.${archetype.bankability}`)} />
                              {isRecommended && (
                                <Badge variant="default" className="text-xs">{t('bm.recommended')}</Badge>
                              )}
                            </div>
                          </div>
                          <span className="text-sm text-muted-foreground mb-2">
                            {t(`bm.archetypesDesc.${archetype.id}`)}
                          </span>
                          <span className="text-xs text-primary italic">
                            {t(`bm.bestWhen.${archetype.bestWhenKey}`)}
                          </span>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {archetype.typicalPayers.map(payerType => (
                              <Badge key={payerType} variant="outline" className="text-xs">
                                {t(`bm.payerTypes.${payerType}`)}
                              </Badge>
                            ))}
                          </div>
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('bm.addOnRevenuesTitle')}</CardTitle>
                <CardDescription>{t('bm.addOnRevenuesDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {ADD_ON_REVENUES.map(addon => {
                    const isSelected = bmData.addOnRevenues.includes(addon);
                    return (
                      <div 
                        key={addon} 
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                        onClick={() => {
                          if (isSelected) {
                            updateBMData({ addOnRevenues: bmData.addOnRevenues.filter(a => a !== addon) });
                          } else {
                            updateBMData({ addOnRevenues: [...bmData.addOnRevenues, addon] });
                          }
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox checked={isSelected} />
                          <span className="text-sm font-medium">{t(`bm.addOns.${addon}`)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{t(`bm.addOnsDesc.${addon}`)}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('bm.paymentMechanismTitle')}</CardTitle>
                {bmData.primaryArchetype && (
                  <CardDescription className="flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    {t('bm.prefillFromArchetype', { archetype: t(`bm.archetypes.${bmData.primaryArchetype}`) })}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{t('bm.paymentType')}</Label>
                    <Select
                      value={bmData.paymentMechanism.type || ''}
                      onValueChange={(value) => updateBMData({
                        paymentMechanism: { ...bmData.paymentMechanism, type: value as PaymentMechanismType },
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('bm.selectPaymentType')} />
                      </SelectTrigger>
                      <SelectContent>
                        {['CITY_BUDGET', 'FEE_TARIFF', 'AVAILABILITY_PAYMENT', 'DEVELOPER_CONTRIBUTION', 'OUTCOME_PAYMENT', 'CONCESSION_REVENUE', 'CREDIT_REVENUE'].map(type => (
                          <SelectItem key={type} value={type}>{t(`bm.paymentTypes.${type}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('bm.paymentBasisLabel')}</Label>
                    <Select
                      value={bmData.paymentMechanism.basis || ''}
                      onValueChange={(value) => updateBMData({
                        paymentMechanism: { ...bmData.paymentMechanism, basis: value as PaymentBasis },
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('bm.selectPaymentBasis')} />
                      </SelectTrigger>
                      <SelectContent>
                        {['ASSET_UPTIME', 'SERVICE_DELIVERY', 'OUTCOME_VERIFIED', 'ANNUAL_APPROPRIATION', 'PERMITS_FEES', 'CREDITS_SOLD'].map(basis => (
                          <SelectItem key={basis} value={basis}>{t(`bm.paymentBasis.${basis}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{t('bm.paymentCommitment')}</Label>
                    <Select
                      value={bmData.paymentMechanism.commitment || ''}
                      onValueChange={(value) => updateBMData({
                        paymentMechanism: { ...bmData.paymentMechanism, commitment: value as PaymentCommitment },
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('bm.selectCommitment')} />
                      </SelectTrigger>
                      <SelectContent>
                        {['CONFIRMED', 'PLANNED', 'IDEA'].map(level => (
                          <SelectItem key={level} value={level}>{t(`bm.confidence.${level}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('bm.paymentDurability')}</Label>
                    <Select
                      value={bmData.paymentMechanism.durability || ''}
                      onValueChange={(value) => updateBMData({
                        paymentMechanism: { ...bmData.paymentMechanism, durability: value as PaymentDurability },
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('bm.selectDurability')} />
                      </SelectTrigger>
                      <SelectContent>
                        {['ONE_TIME', 'RECURRING', 'CONTRACTED'].map(dur => (
                          <SelectItem key={dur} value={dur}>{t(`bm.durability.${dur}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{t('bm.durationYears')}</Label>
                    <Select
                      value={bmData.paymentMechanism.durationYears?.toString() || ''}
                      onValueChange={(value) => updateBMData({
                        paymentMechanism: { ...bmData.paymentMechanism, durationYears: parseInt(value) },
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('bm.selectDuration')} />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 3, 5, 10, 15, 20].map(years => (
                          <SelectItem key={years} value={years.toString()}>{years} {t('bm.years')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('bm.legalInstrument')}</Label>
                    <Select
                      value={bmData.paymentMechanism.legalInstrumentHint || ''}
                      onValueChange={(value) => updateBMData({
                        paymentMechanism: { ...bmData.paymentMechanism, legalInstrumentHint: value },
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('bm.selectLegalInstrument')} />
                      </SelectTrigger>
                      <SelectContent>
                        {['ORDINANCE', 'MOU', 'SERVICE_CONTRACT', 'TARIFF_RESOLUTION', 'DEVELOPMENT_AGREEMENT'].map(inst => (
                          <SelectItem key={inst} value={inst}>{t(`bm.legalInstruments.${inst}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{t('bm.revenueStackTitle')}</CardTitle>
                    <CardDescription>{t('bm.revenueStackDescription')}</CardDescription>
                  </div>
                  <Button onClick={addRevenueLine} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('bm.addRevenueLine')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {bmData.revenueStack.map((line, index) => (
                    <div key={line.id} className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{t('bm.revenueLine')} {index + 1}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRevenueLine(line.id)}
                          disabled={bmData.revenueStack.length === 1}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <Label>{t('bm.revenuePayerSource')} *</Label>
                          <Select
                            value={line.payerStakeholderId || ''}
                            onValueChange={(value) => updateRevenueLine(line.id, { payerStakeholderId: value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('bm.selectPayer')} />
                            </SelectTrigger>
                            <SelectContent>
                              {bmData.payerBeneficiaryMap.primaryPayerId && (
                                <SelectItem value={bmData.payerBeneficiaryMap.primaryPayerId}>
                                  {getStakeholderName(bmData.payerBeneficiaryMap.primaryPayerId)} ({t('bm.primaryPayer')})
                                </SelectItem>
                              )}
                              {bmData.payerBeneficiaryMap.candidatePayers
                                .filter(p => p.stakeholderId !== bmData.payerBeneficiaryMap.primaryPayerId)
                                .map(payer => (
                                  <SelectItem key={payer.stakeholderId} value={payer.stakeholderId}>
                                    {getStakeholderName(payer.stakeholderId)}
                                  </SelectItem>
                                ))}
                              <SelectItem value="OTHER">{t('bm.otherSource')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>{t('bm.revenueTypeLabel')}</Label>
                          <Select
                            value={line.revenueType}
                            onValueChange={(value) => updateRevenueLine(line.id, { revenueType: value as RevenueType })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {REVENUE_TYPES.map(type => (
                                <SelectItem key={type} value={type}>{t(`bm.revenueTypes.${type}`)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>{t('bm.confidenceLabel')}</Label>
                          <Select
                            value={line.confidence}
                            onValueChange={(value) => updateRevenueLine(line.id, { confidence: value as Confidence })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="HIGH">
                                <span className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-green-500" />
                                  {t('bm.confidence.HIGH')}
                                </span>
                              </SelectItem>
                              <SelectItem value="MEDIUM">
                                <span className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                                  {t('bm.confidence.MEDIUM')}
                                </span>
                              </SelectItem>
                              <SelectItem value="LOW">
                                <span className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-red-500" />
                                  {t('bm.confidence.LOW')}
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>{t('bm.role')}</Label>
                          <Select
                            value={line.role}
                            onValueChange={(value) => updateRevenueLine(line.id, { role: value as RevenueRole })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PRIMARY_DURABLE">{t('bm.roles.PRIMARY_DURABLE')}</SelectItem>
                              <SelectItem value="SECONDARY_SUPPORT">{t('bm.roles.SECONDARY_SUPPORT')}</SelectItem>
                              <SelectItem value="UPSIDE_OPTIONAL">{t('bm.roles.UPSIDE_OPTIONAL')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <Label>{t('bm.durationYears')}</Label>
                          <Select
                            value={line.durationYears?.toString() || ''}
                            onValueChange={(value) => updateRevenueLine(line.id, { durationYears: parseInt(value) })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('bm.selectDuration')} />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 3, 5, 10, 15, 20].map(years => (
                                <SelectItem key={years} value={years.toString()}>{years} {t('bm.years')}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>{t('bm.costCoverage')}</Label>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {COST_COVERAGES.map(coverage => {
                              const isSelected = line.costCoverage?.includes(coverage);
                              return (
                                <Badge
                                  key={coverage}
                                  variant={isSelected ? 'default' : 'outline'}
                                  className="cursor-pointer"
                                  onClick={() => {
                                    const current = line.costCoverage || [];
                                    if (isSelected) {
                                      updateRevenueLine(line.id, { costCoverage: current.filter(c => c !== coverage) });
                                    } else {
                                      updateRevenueLine(line.id, { costCoverage: [...current, coverage] });
                                    }
                                  }}
                                >
                                  {t(`bm.costCoverages.${coverage}`)}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <Label>{t('bm.amountEstimate')}</Label>
                          <div className="grid grid-cols-4 gap-2 mt-1">
                            <Input
                              type="number"
                              placeholder={t('bm.low')}
                              value={line.amountRange?.low || ''}
                              onChange={(e) => updateRevenueLine(line.id, {
                                amountRange: { ...line.amountRange, low: Number(e.target.value) }
                              })}
                              className="h-8"
                            />
                            <Input
                              type="number"
                              placeholder={t('bm.mid')}
                              value={line.amountRange?.mid || ''}
                              onChange={(e) => updateRevenueLine(line.id, {
                                amountRange: { ...line.amountRange, mid: Number(e.target.value) }
                              })}
                              className="h-8"
                            />
                            <Input
                              type="number"
                              placeholder={t('bm.high')}
                              value={line.amountRange?.high || ''}
                              onChange={(e) => updateRevenueLine(line.id, {
                                amountRange: { ...line.amountRange, high: Number(e.target.value) }
                              })}
                              className="h-8"
                            />
                            <Select
                              value={line.amountRange?.period || 'ANNUAL'}
                              onValueChange={(value) => updateRevenueLine(line.id, {
                                amountRange: { ...line.amountRange, period: value as AmountPeriod }
                              })}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ANNUAL">{t('bm.annual')}</SelectItem>
                                <SelectItem value="ONE_TIME">{t('bm.oneTime')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <Label>{t('bm.prerequisites')}</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {REVENUE_PREREQUISITES.map(prereq => {
                            const isSelected = line.prerequisites?.includes(prereq);
                            return (
                              <Badge
                                key={prereq}
                                variant={isSelected ? 'secondary' : 'outline'}
                                className="cursor-pointer text-xs"
                                onClick={() => {
                                  const current = line.prerequisites || [];
                                  if (isSelected) {
                                    updateRevenueLine(line.id, { prerequisites: current.filter(p => p !== prereq) });
                                  } else {
                                    updateRevenueLine(line.id, { prerequisites: [...current, prereq] });
                                  }
                                }}
                              >
                                {t(`bm.prereqs.${prereq}`)}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                      
                      <div>
                        <Label>{t('bm.notes')}</Label>
                        <Input
                          value={line.notes || ''}
                          onChange={(e) => updateRevenueLine(line.id, { notes: e.target.value })}
                          placeholder={t('bm.revenueNotesPlaceholder')}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {!bmData.revenueStack.some(r => r.confidence === 'HIGH') && (
                  <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {t('bm.noHighConfidenceWarning')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('bm.financingPathwayTitle')}</CardTitle>
                <CardDescription>{t('bm.financingPathwayDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup
                  value={bmData.financingPathway.pathway || ''}
                  onValueChange={(value) => {
                    const metadata = FINANCING_PATHWAY_METADATA[value];
                    updateBMData({
                      financingPathway: {
                        ...bmData.financingPathway,
                        pathway: value as FinancingPathway,
                        autoRationale: metadata ? t(`bm.financingAutoRationale.${value}`) : undefined,
                        fitReasons: metadata?.fitReasons || [],
                      },
                    });
                  }}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  {FINANCING_PATHWAYS.map(pathway => {
                    const isRecommended = (isNBS && pathway === 'BLENDED_VEHICLE') || (!isNBS && pathway === 'PUBLIC_CAPEX');
                    const metadata = FINANCING_PATHWAY_METADATA[pathway];
                    return (
                      <div key={pathway} className="relative">
                        <RadioGroupItem
                          value={pathway}
                          id={pathway}
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor={pathway}
                          className="flex flex-col p-4 border rounded-lg cursor-pointer peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover:bg-muted/50"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{t(`bm.pathways.${pathway}`)}</span>
                            {isRecommended && (
                              <Badge variant="default" className="text-xs">{t('bm.recommended')}</Badge>
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground mt-1">
                            {t(`bm.pathwaysDesc.${pathway}`)}
                          </span>
                          {metadata && (
                            <>
                              <span className="text-xs text-primary italic mt-2">
                                {t(`bm.bestWhen.${metadata.bestWhenKey}`)}
                              </span>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {metadata.fitReasons.map(reason => (
                                  <Badge key={reason} variant="outline" className="text-xs">
                                    {t(`bm.fitReasons.${reason}`)}
                                  </Badge>
                                ))}
                              </div>
                            </>
                          )}
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>

                {bmData.financingPathway.autoRationale && (
                  <div className="p-3 bg-muted/50 rounded-lg flex items-start gap-2">
                    <Info className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                    <p className="text-sm text-muted-foreground">{bmData.financingPathway.autoRationale}</p>
                  </div>
                )}

                <div>
                  <Label>{t('bm.rationale')}</Label>
                  <Textarea
                    value={bmData.financingPathway.rationale || ''}
                    onChange={(e) => updateBMData({
                      financingPathway: { ...bmData.financingPathway, rationale: e.target.value },
                    })}
                    placeholder={t('bm.rationalePlaceholder')}
                  />
                </div>

                {bmData.financingPathway.fitReasons && bmData.financingPathway.fitReasons.length > 0 && (
                  <div>
                    <Label className="text-sm">{t('bm.whyGoodFit')}</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {bmData.financingPathway.fitReasons.map(reason => (
                        <Badge key={reason} variant="secondary">
                          {t(`bm.fitReasons.${reason}`)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('bm.romBudgetTitle')}</CardTitle>
                <CardDescription>{t('bm.romBudgetDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg space-y-2">
                    <Label className="text-muted-foreground">{t('bm.capex')}</Label>
                    <div className="grid grid-cols-3 gap-1">
                      <Input
                        type="number"
                        placeholder={t('bm.low')}
                        value={bmData.sourcesAndUsesRom.capexBand?.low || ''}
                        onChange={(e) => updateBMData({
                          sourcesAndUsesRom: {
                            ...bmData.sourcesAndUsesRom,
                            capexBand: { ...bmData.sourcesAndUsesRom.capexBand, low: Number(e.target.value) }
                          }
                        })}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        placeholder={t('bm.mid')}
                        value={bmData.sourcesAndUsesRom.capexBand?.mid || ''}
                        onChange={(e) => updateBMData({
                          sourcesAndUsesRom: {
                            ...bmData.sourcesAndUsesRom,
                            capexBand: { ...bmData.sourcesAndUsesRom.capexBand, mid: Number(e.target.value) }
                          }
                        })}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        placeholder={t('bm.high')}
                        value={bmData.sourcesAndUsesRom.capexBand?.high || ''}
                        onChange={(e) => updateBMData({
                          sourcesAndUsesRom: {
                            ...bmData.sourcesAndUsesRom,
                            capexBand: { ...bmData.sourcesAndUsesRom.capexBand, high: Number(e.target.value) }
                          }
                        })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <Select
                      value={bmData.sourcesAndUsesRom.capexBand?.currency || 'BRL'}
                      onValueChange={(value) => updateBMData({
                        sourcesAndUsesRom: {
                          ...bmData.sourcesAndUsesRom,
                          capexBand: { ...bmData.sourcesAndUsesRom.capexBand, currency: value }
                        }
                      })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BRL">BRL</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="p-4 border rounded-lg space-y-2">
                    <Label className="text-muted-foreground">{t('bm.opex')}</Label>
                    <div className="grid grid-cols-3 gap-1">
                      <Input
                        type="number"
                        placeholder={t('bm.low')}
                        value={bmData.sourcesAndUsesRom.opexBand?.low || ''}
                        onChange={(e) => updateBMData({
                          sourcesAndUsesRom: {
                            ...bmData.sourcesAndUsesRom,
                            opexBand: { ...bmData.sourcesAndUsesRom.opexBand, low: Number(e.target.value) }
                          }
                        })}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        placeholder={t('bm.mid')}
                        value={bmData.sourcesAndUsesRom.opexBand?.mid || ''}
                        onChange={(e) => updateBMData({
                          sourcesAndUsesRom: {
                            ...bmData.sourcesAndUsesRom,
                            opexBand: { ...bmData.sourcesAndUsesRom.opexBand, mid: Number(e.target.value) }
                          }
                        })}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        placeholder={t('bm.high')}
                        value={bmData.sourcesAndUsesRom.opexBand?.high || ''}
                        onChange={(e) => updateBMData({
                          sourcesAndUsesRom: {
                            ...bmData.sourcesAndUsesRom,
                            opexBand: { ...bmData.sourcesAndUsesRom.opexBand, high: Number(e.target.value) }
                          }
                        })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{t('bm.perYear')}</p>
                  </div>
                  <div className="p-4 border rounded-lg space-y-2">
                    <Label className="text-muted-foreground">{t('bm.mrvBudget')}</Label>
                    <div className="grid grid-cols-3 gap-1">
                      <Input
                        type="number"
                        placeholder={t('bm.low')}
                        value={bmData.sourcesAndUsesRom.mrvBudgetBand?.low || ''}
                        onChange={(e) => updateBMData({
                          sourcesAndUsesRom: {
                            ...bmData.sourcesAndUsesRom,
                            mrvBudgetBand: { ...bmData.sourcesAndUsesRom.mrvBudgetBand, low: Number(e.target.value) }
                          }
                        })}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        placeholder={t('bm.mid')}
                        value={bmData.sourcesAndUsesRom.mrvBudgetBand?.mid || ''}
                        onChange={(e) => updateBMData({
                          sourcesAndUsesRom: {
                            ...bmData.sourcesAndUsesRom,
                            mrvBudgetBand: { ...bmData.sourcesAndUsesRom.mrvBudgetBand, mid: Number(e.target.value) }
                          }
                        })}
                        className="h-8 text-sm"
                      />
                      <Input
                        type="number"
                        placeholder={t('bm.high')}
                        value={bmData.sourcesAndUsesRom.mrvBudgetBand?.high || ''}
                        onChange={(e) => updateBMData({
                          sourcesAndUsesRom: {
                            ...bmData.sourcesAndUsesRom,
                            mrvBudgetBand: { ...bmData.sourcesAndUsesRom.mrvBudgetBand, high: Number(e.target.value) }
                          }
                        })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{t('bm.perYear')}</p>
                  </div>
                </div>
                <div>
                  <Label>{t('bm.assumptions')}</Label>
                  <Textarea
                    value={bmData.sourcesAndUsesRom.assumptions || ''}
                    onChange={(e) => updateBMData({
                      sourcesAndUsesRom: { ...bmData.sourcesAndUsesRom, assumptions: e.target.value },
                    })}
                    placeholder={t('bm.assumptionsPlaceholder')}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('bm.consistencyCheck')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${bmData.revenueStack.some(r => r.role === 'PRIMARY_DURABLE' && r.durationYears && r.durationYears >= 3) ? 'bg-green-500 text-white' : 'bg-muted'}`}>
                      {bmData.revenueStack.some(r => r.role === 'PRIMARY_DURABLE' && r.durationYears && r.durationYears >= 3) && <Check className="h-4 w-4" />}
                    </div>
                    <span className={bmData.revenueStack.some(r => r.role === 'PRIMARY_DURABLE' && r.durationYears && r.durationYears >= 3) ? 'text-foreground' : 'text-muted-foreground'}>
                      {t('bm.consistencyRecurringRevenue')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${bmData.revenueStack.some(r => r.costCoverage?.includes('OPEX_OM')) ? 'bg-green-500 text-white' : 'bg-muted'}`}>
                      {bmData.revenueStack.some(r => r.costCoverage?.includes('OPEX_OM')) && <Check className="h-4 w-4" />}
                    </div>
                    <span className={bmData.revenueStack.some(r => r.costCoverage?.includes('OPEX_OM')) ? 'text-foreground' : 'text-muted-foreground'}>
                      {t('bm.consistencyOpexCovered')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${bmData.revenueStack.some(r => r.costCoverage?.includes('MRV')) ? 'bg-green-500 text-white' : 'bg-muted'}`}>
                      {bmData.revenueStack.some(r => r.costCoverage?.includes('MRV')) && <Check className="h-4 w-4" />}
                    </div>
                    <span className={bmData.revenueStack.some(r => r.costCoverage?.includes('MRV')) ? 'text-foreground' : 'text-muted-foreground'}>
                      {t('bm.consistencyMrvCovered')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('bm.bankabilityAssessment')}</CardTitle>
                <CardDescription>{t('bm.bankabilityAssessmentSubtitle')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    computeBankabilityMaturity() === 'BANKABLE_DRAFT' ? 'bg-green-500 text-white' :
                    computeBankabilityMaturity() === 'EMERGING' ? 'bg-yellow-500 text-white' :
                    'bg-blue-500 text-white'
                  }`}>
                    {computeBankabilityMaturity() === 'BANKABLE_DRAFT' ? <CheckCircle className="h-6 w-6" /> :
                     computeBankabilityMaturity() === 'EMERGING' ? <AlertTriangle className="h-6 w-6" /> :
                     <FileText className="h-6 w-6" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{t(`bm.maturity.${computeBankabilityMaturity()}`)}</h3>
                    <p className="text-sm text-muted-foreground">{t(`bm.maturityDesc.${computeBankabilityMaturity()}`)}</p>
                  </div>
                </div>

                {computeBankabilityMaturity() !== 'BANKABLE_DRAFT' && getBankabilityBlockers().length > 0 && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {t('bm.topBlockers')}
                    </h4>
                    <ul className="list-disc list-inside text-sm text-amber-700 dark:text-amber-300 space-y-1">
                      {getBankabilityBlockers().map(blocker => (
                        <li key={blocker}>{t(`bm.bankabilityBlocker.${blocker}`)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{t('bm.enablingActionsTitle')}</CardTitle>
                    <CardDescription>{t('bm.enablingActionsDesc')}</CardDescription>
                  </div>
                  <Button onClick={addEnablingAction} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('bm.addAction')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {bmData.enablingActions.map(action => (
                    <div key={action.id} className="border rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <Input
                          value={action.action}
                          onChange={(e) => updateEnablingAction(action.id, { action: e.target.value })}
                          placeholder={t('bm.actionPlaceholder')}
                          className="flex-1 mr-2"
                        />
                        <Button variant="ghost" size="sm" onClick={() => removeEnablingAction(action.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <Select value={action.priority} onValueChange={(v) => updateEnablingAction(action.id, { priority: v as 'HIGH' | 'MEDIUM' | 'LOW' })}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="HIGH">{t('bm.priorityHigh')}</SelectItem>
                            <SelectItem value="MEDIUM">{t('bm.priorityMedium')}</SelectItem>
                            <SelectItem value="LOW">{t('bm.priorityLow')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={action.category} onValueChange={(v) => updateEnablingAction(action.id, { category: v as EnablingAction['category'] })}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {['POLICY', 'CONTRACTING', 'DATA_MRV', 'GOVERNANCE', 'PROCUREMENT', 'CAPACITY'].map(cat => (
                              <SelectItem key={cat} value={cat}>{t(`bm.categories.${cat}`)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={action.ownerStakeholderId || ''} onValueChange={(v) => updateEnablingAction(action.id, { ownerStakeholderId: v || undefined })}>
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder={t('bm.selectOwner')} />
                          </SelectTrigger>
                          <SelectContent>
                            {stakeholders.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={action.timeframe || ''}
                          onChange={(e) => updateEnablingAction(action.id, { timeframe: e.target.value })}
                          placeholder={t('bm.timeframePlaceholder')}
                          className="h-8"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{t('bm.risksTitle')}</CardTitle>
                    <CardDescription>{t('bm.risksDesc')}</CardDescription>
                  </div>
                  <Button onClick={addBMRisk} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('bm.addRisk')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {bmData.bmRisks.filter(r => !r.hidden).map(risk => (
                    <div key={risk.id} className="border rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1">
                          {risk.riskType === 'CUSTOM' ? (
                            <Input
                              value={risk.customLabel || ''}
                              onChange={(e) => updateBMRisk(risk.id, { customLabel: e.target.value })}
                              placeholder={t('bm.customRiskLabel')}
                              className="w-48"
                            />
                          ) : (
                            <span className="font-medium">{t(`bm.riskTypes.${risk.riskType}`)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => toggleRiskHidden(risk.id)}>
                            <span className="text-xs text-muted-foreground">{t('bm.hide')}</span>
                          </Button>
                          {risk.riskType === 'CUSTOM' && (
                            <Button variant="ghost" size="sm" onClick={() => removeBMRisk(risk.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <Select value={risk.riskLevel} onValueChange={(v) => updateBMRisk(risk.id, { riskLevel: v as RiskLevel })}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="LOW">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-green-500" />
                                    {t('bm.riskLevel.LOW')}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{t('bm.riskLevelTooltip.LOW')}</TooltipContent>
                              </Tooltip>
                            </SelectItem>
                            <SelectItem value="MEDIUM">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-yellow-500" />
                                    {t('bm.riskLevel.MEDIUM')}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{t('bm.riskLevelTooltip.MEDIUM')}</TooltipContent>
                              </Tooltip>
                            </SelectItem>
                            <SelectItem value="HIGH">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500" />
                                    {t('bm.riskLevel.HIGH')}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>{t('bm.riskLevelTooltip.HIGH')}</TooltipContent>
                              </Tooltip>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={risk.ownerStakeholderId || ''} onValueChange={(v) => updateBMRisk(risk.id, { ownerStakeholderId: v || undefined })}>
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder={t('bm.riskOwner')} />
                          </SelectTrigger>
                          <SelectContent>
                            {stakeholders.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="col-span-2 flex items-center gap-2">
                          <Checkbox
                            checked={risk.mitigationChecked || false}
                            onCheckedChange={(checked) => updateBMRisk(risk.id, { mitigationChecked: !!checked })}
                          />
                          <Input
                            value={risk.mitigation}
                            onChange={(e) => updateBMRisk(risk.id, { mitigation: e.target.value })}
                            placeholder={t('bm.mitigationPlaceholder')}
                            className="h-8 flex-1"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {bmData.bmRisks.some(r => r.hidden) && (
                    <p className="text-xs text-muted-foreground">
                      {bmData.bmRisks.filter(r => r.hidden).length} {t('bm.hiddenRisks')}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {currentStep === 6 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('bm.playbookTitle')}</CardTitle>
                <CardDescription>{t('bm.playbookSubtitle')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">{t('bm.whoBenefitsWhoPays')}</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">{t('bm.primaryPayer')}:</span>
                        <span className="ml-2 font-medium">{getStakeholderName(bmData.payerBeneficiaryMap.primaryPayerId)}</span>
                        {bmData.payerBeneficiaryMap.primaryPayerConfidence && (
                          <Badge variant="outline" className="ml-2">{t(`bm.confidence.${bmData.payerBeneficiaryMap.primaryPayerConfidence}`)}</Badge>
                        )}
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('bm.beneficiaries')}:</span>
                        <div className="ml-2">
                          {bmData.payerBeneficiaryMap.beneficiaries.map(b => (
                            <span key={b.stakeholderId} className="block">{getStakeholderName(b.stakeholderId)} ({b.benefitType})</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">{t('bm.archetypeAndMechanism')}</h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">{t('bm.primaryArchetype')}:</span>
                        <span className="ml-2 font-medium">{bmData.primaryArchetype ? t(`bm.archetypes.${bmData.primaryArchetype}`) : '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('bm.paymentType')}:</span>
                        <span className="ml-2">{bmData.paymentMechanism.type ? t(`bm.paymentTypes.${bmData.paymentMechanism.type}`) : '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('bm.duration')}:</span>
                        <span className="ml-2">{bmData.paymentMechanism.durationYears} {t('bm.years')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">{t('bm.revenueStackSummary')}</h4>
                  <div className="space-y-2">
                    {bmData.revenueStack.map(rev => (
                      <div key={rev.id} className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded">
                        <div className="flex items-center gap-2">
                          <Badge variant={rev.confidence === 'HIGH' ? 'default' : rev.confidence === 'MEDIUM' ? 'secondary' : 'outline'} className="text-xs">
                            {t(`bm.confidence.${rev.confidence}`)}
                          </Badge>
                          <span>{t(`bm.revenueTypes.${rev.revenueType}`)}</span>
                          {rev.payerStakeholderId && (
                            <span className="text-muted-foreground">({getStakeholderName(rev.payerStakeholderId)})</span>
                          )}
                        </div>
                        {rev.amountRange?.mid && (
                          <span className="font-mono text-xs">{rev.amountRange.mid.toLocaleString()} {rev.amountRange.currency || 'BRL'}/{rev.amountRange.period === 'ANNUAL' ? t('bm.annual') : t('bm.oneTime')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">{t('bm.financingPathway')}</h4>
                    <p className="text-sm">{bmData.financingPathway.pathway ? t(`bm.pathways.${bmData.financingPathway.pathway}`) : '-'}</p>
                    {bmData.financingPathway.rationale && (
                      <p className="text-xs text-muted-foreground mt-1">{bmData.financingPathway.rationale}</p>
                    )}
                  </div>
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-medium mb-2">{t('bm.romBudgetTitle')}</h4>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('bm.capex')}:</span>
                        <span className="font-mono">{bmData.sourcesAndUsesRom.capexBand?.mid?.toLocaleString()} {bmData.sourcesAndUsesRom.capexBand?.currency}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('bm.opex')}:</span>
                        <span className="font-mono">{bmData.sourcesAndUsesRom.opexBand?.mid?.toLocaleString()} {bmData.sourcesAndUsesRom.opexBand?.currency}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">{t('bm.keyActionsAndRisks')}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground block mb-1">{t('bm.topEnablingActions')}:</span>
                      <ul className="list-disc list-inside space-y-1">
                        {bmData.enablingActions.filter(a => a.priority === 'HIGH').slice(0, 3).map(a => (
                          <li key={a.id}>{a.action}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-1">{t('bm.keyRisks')}:</span>
                      <ul className="list-disc list-inside space-y-1">
                        {bmData.bmRisks.filter(r => !r.hidden && r.riskLevel === 'HIGH').slice(0, 3).map(r => (
                          <li key={r.id}>{r.riskType === 'CUSTOM' ? r.customLabel : t(`bm.riskTypes.${r.riskType}`)}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('bm.exportOptions')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button onClick={copyPlaybook} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
                    <Copy className="h-5 w-5" />
                    <span>{t('bm.copyToConceptNote')}</span>
                    <span className="text-xs text-muted-foreground">{t('bm.copyToConceptNoteDesc')}</span>
                  </Button>
                  <Button onClick={exportPlaybookJSON} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
                    <FileText className="h-5 w-5" />
                    <span>{t('bm.exportPlaybookText')}</span>
                    <span className="text-xs text-muted-foreground">{t('bm.exportPlaybookTextDesc')}</span>
                  </Button>
                  <Button onClick={copyMiroPrompt} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2">
                    <Landmark className="h-5 w-5" />
                    <span>{t('bm.generateMiroPrompt')}</span>
                    <span className="text-xs text-muted-foreground">{t('bm.generateMiroPromptDesc')}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Collapsible open={playbookOpen} onOpenChange={setPlaybookOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center justify-between">
                      <CardTitle>{t('bm.playbookPreview')}</CardTitle>
                      {playbookOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    <div className="bg-muted/50 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {generatePlaybookText()}
                    </div>
                    <Button onClick={copyPlaybook} className="mt-4">
                      <Copy className="h-4 w-4 mr-2" />
                      {t('bm.copyToConceptNote')}
                    </Button>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
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
                  title: t('bm.blockers'),
                  description: bmData.readiness.blockers.map(b => t(`bm.blocker.${b}`)).join(', '),
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
    </div>
  );
}
