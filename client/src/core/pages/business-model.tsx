import { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { ArrowLeft, Check, Building2, Users, Landmark, DollarSign, AlertTriangle, FileText, Copy, ChevronDown, ChevronUp, Plus, Trash2, Info } from 'lucide-react';
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
import { useTranslation } from 'react-i18next';
import { useSampleData } from '@/core/contexts/sample-data-context';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';
import { useToast } from '@/core/hooks/use-toast';

type BMArchetype = 'PUBLIC_PROGRAM' | 'UTILITY_SERVICE' | 'SERVICE_CONTRACT' | 'LAND_VALUE_CAPTURE' | 'BLENDED_FINANCE' | 'CREDIT_ADDON' | 'INSURANCE_LINKED' | null;
type PaymentMechanismType = 'CITY_BUDGET' | 'FEE_TARIFF' | 'AVAILABILITY_PAYMENT' | 'DEVELOPER_CONTRIBUTION' | 'OUTCOME_PAYMENT' | 'CONCESSION_REVENUE' | 'CREDIT_REVENUE' | null;
type PaymentBasis = 'ASSET_UPTIME' | 'SERVICE_DELIVERY' | 'OUTCOME_VERIFIED' | 'ANNUAL_APPROPRIATION' | 'PERMITS_FEES' | 'CREDITS_SOLD' | null;
type RevenueType = 'BUDGET_ALLOCATION' | 'FEE_TARIFF_ALLOCATION' | 'SERVICE_CONTRACT_PAYMENTS' | 'DEVELOPER_FEES' | 'DISTRICT_LEVY' | 'PHILANTHROPY_GRANT' | 'DFI_LOAN' | 'BOND_PROCEEDS' | 'CREDIT_REVENUE' | 'CORPORATE_CO_FUNDING';
type RevenueRole = 'PRIMARY_DURABLE' | 'SECONDARY_SUPPORT' | 'UPSIDE_OPTIONAL';
type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type FinancingPathway = 'PUBLIC_CAPEX' | 'DFI_LOAN' | 'MUNICIPAL_BOND' | 'BLENDED_VEHICLE' | 'PPP_LIGHT' | 'PHILANTHROPY_ONLY' | null;
type BMStatus = 'NOT_STARTED' | 'DRAFT' | 'READY';

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
  benefitType?: string;
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
}

interface EnablingAction {
  id: string;
  action: string;
  category: 'POLICY' | 'CONTRACTING' | 'DATA_MRV' | 'GOVERNANCE' | 'PROCUREMENT' | 'CAPACITY';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  ownerStakeholderId?: string;
}

interface BMRisk {
  id: string;
  riskType: 'COUNTERPARTY_CREDIT' | 'POLICY_CHANGE' | 'REVENUE_VOLATILITY' | 'MRV_ATTRIBUTION' | 'MARKET_DEMAND' | 'IMPLEMENTATION_CAPACITY';
  riskLevel: RiskLevel;
  mitigation: string;
}

interface BusinessModelData {
  status: BMStatus;
  importedContext: ImportedContext;
  primaryArchetype: BMArchetype;
  payerBeneficiaryMap: {
    beneficiaries: PayerBeneficiary[];
    candidatePayers: PayerBeneficiary[];
    primaryPayerId: string | null;
  };
  paymentMechanism: {
    type: PaymentMechanismType;
    basis: PaymentBasis;
    durationYears: number | null;
    legalInstrumentHint?: string;
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
    eligibilityNotes?: string[];
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
  { id: 'PUBLIC_PROGRAM', icon: Building2, color: 'blue' },
  { id: 'UTILITY_SERVICE', icon: Building2, color: 'cyan' },
  { id: 'SERVICE_CONTRACT', icon: FileText, color: 'green' },
  { id: 'LAND_VALUE_CAPTURE', icon: Landmark, color: 'amber' },
  { id: 'BLENDED_FINANCE', icon: DollarSign, color: 'purple' },
  { id: 'CREDIT_ADDON', icon: DollarSign, color: 'emerald' },
  { id: 'INSURANCE_LINKED', icon: AlertTriangle, color: 'orange' },
];

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

function getStoredOMData(projectId: string): any | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(`${OM_STORAGE_KEY}_${projectId}`);
  return stored ? JSON.parse(stored) : null;
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
  if (community) beneficiaries.push({ stakeholderId: community.id, benefitType: 'Climate resilience' });
  
  const propOwners = stakeholders.find(s => s.id === 'property-owners');
  if (propOwners) beneficiaries.push({ stakeholderId: propOwners.id, benefitType: 'Reduced flood damage' });
  
  return beneficiaries;
}

function buildInitialBMData(actionType: string, hazards: string[], stakeholders: Stakeholder[], omData: any | null): BusinessModelData {
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
    primaryArchetype: recommendedArchetype,
    payerBeneficiaryMap: {
      beneficiaries,
      candidatePayers,
      primaryPayerId: candidatePayers[0]?.stakeholderId || null,
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

  const [currentStep, setCurrentStep] = useState(0);
  const [bmData, setBMData] = useState<BusinessModelData | null>(null);
  const [playbookOpen, setPlaybookOpen] = useState(false);

  const action = sampleActions.find(a => a.id === projectId);
  const isNBS = action?.type === 'adaptation';
  const stakeholders = SAMPLE_STAKEHOLDERS;
  const hazards = ['FLOOD', 'HEAT', 'LANDSLIDE'];

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

  useEffect(() => {
    if (projectId && bmData) {
      const updatedData = { ...bmData };
      const hasHighConfidence = bmData.revenueStack.some(r => r.confidence === 'HIGH');
      
      updatedData.readiness.checklist = {
        primaryArchetypeSelected: bmData.primaryArchetype !== null,
        primaryPayerSelected: bmData.payerBeneficiaryMap.primaryPayerId !== null,
        oneHighConfidenceRevenueLine: hasHighConfidence,
        durationSet: bmData.paymentMechanism.durationYears !== null,
        financingPathwaySelected: bmData.financingPathway.pathway !== null,
        consistencyCheckedWithOps: true,
      };
      
      const blockers: string[] = [];
      if (!updatedData.readiness.checklist.primaryArchetypeSelected) blockers.push('selectArchetype');
      if (!updatedData.readiness.checklist.primaryPayerSelected) blockers.push('selectPrimaryPayer');
      if (!updatedData.readiness.checklist.oneHighConfidenceRevenueLine) blockers.push('addHighConfidenceRevenue');
      if (!updatedData.readiness.checklist.durationSet) blockers.push('setDuration');
      if (!updatedData.readiness.checklist.financingPathwaySelected) blockers.push('selectFinancingPathway');
      
      updatedData.readiness.blockers = blockers;
      
      const allRequired = updatedData.readiness.checklist.primaryArchetypeSelected &&
        updatedData.readiness.checklist.primaryPayerSelected &&
        updatedData.readiness.checklist.oneHighConfidenceRevenueLine &&
        updatedData.readiness.checklist.durationSet &&
        updatedData.readiness.checklist.financingPathwaySelected;
      
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
    { id: 'readiness', icon: AlertTriangle },
  ];

  const canAccessReadiness = (): boolean => {
    if (!bmData) return false;
    return bmData.readiness.checklist.primaryArchetypeSelected &&
      bmData.readiness.checklist.primaryPayerSelected &&
      bmData.readiness.checklist.oneHighConfidenceRevenueLine &&
      bmData.readiness.checklist.durationSet &&
      bmData.readiness.checklist.financingPathwaySelected;
  };

  const canNavigateToStep = (stepIndex: number): boolean => {
    if (stepIndex < 5) return true;
    return canAccessReadiness();
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

              <Button onClick={() => setCurrentStep(1)} className="w-full">
                {t('bm.startConfiguration')}
              </Button>
            </CardContent>
          </Card>
        )}

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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {stakeholders.filter(s => ['community', 'private'].includes(s.type)).map(stakeholder => {
                      const isSelected = bmData.payerBeneficiaryMap.beneficiaries.some(b => b.stakeholderId === stakeholder.id);
                      return (
                        <div key={stakeholder.id} className="flex items-center space-x-2">
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
                          <Label htmlFor={`ben-${stakeholder.id}`} className="text-sm">
                            {stakeholder.name}
                            <Badge variant="outline" className="ml-2 text-xs">{stakeholder.type}</Badge>
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label className="text-base font-medium">{t('bm.candidatePayers')}</Label>
                  <p className="text-sm text-muted-foreground mb-3">{t('bm.candidatePayersHint')}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {stakeholders.filter(s => ['government', 'utility', 'private', 'dfi', 'philanthropy'].includes(s.type)).map(stakeholder => {
                      const isSelected = bmData.payerBeneficiaryMap.candidatePayers.some(p => p.stakeholderId === stakeholder.id);
                      return (
                        <div key={stakeholder.id} className="flex items-center space-x-2">
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
                          <Label htmlFor={`payer-${stakeholder.id}`} className="text-sm">
                            {stakeholder.name}
                            <Badge variant="outline" className="ml-2 text-xs">{stakeholder.type}</Badge>
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label className="text-base font-medium">{t('bm.primaryPayer')} *</Label>
                  <p className="text-sm text-muted-foreground mb-3">{t('bm.primaryPayerHint')}</p>
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
              <CardContent>
                <RadioGroup
                  value={bmData.primaryArchetype || ''}
                  onValueChange={(value) => updateBMData({ primaryArchetype: value as BMArchetype })}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  {BM_ARCHETYPES.map(archetype => {
                    const isRecommended = archetype.id === inferRecommendedArchetype(bmData.importedContext);
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
                            {isRecommended && (
                              <Badge variant="default" className="text-xs">{t('bm.recommended')}</Badge>
                            )}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {t(`bm.archetypesDesc.${archetype.id}`)}
                          </span>
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('bm.paymentMechanismTitle')}</CardTitle>
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
                        {[1, 3, 5, 10].map(years => (
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
                      
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                          <Label>{t('bm.durationYears')}</Label>
                          <Select
                            value={line.durationYears?.toString() || ''}
                            onValueChange={(value) => updateRevenueLine(line.id, { durationYears: parseInt(value) })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('bm.selectDuration')} />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 3, 5, 10].map(years => (
                                <SelectItem key={years} value={years.toString()}>{years} {t('bm.years')}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                  onValueChange={(value) => updateBMData({
                    financingPathway: { ...bmData.financingPathway, pathway: value as FinancingPathway },
                  })}
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                >
                  {FINANCING_PATHWAYS.map(pathway => {
                    const isRecommended = (isNBS && pathway === 'BLENDED_VEHICLE') || (!isNBS && pathway === 'PUBLIC_CAPEX');
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
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>

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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('bm.sourcesAndUsesTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg">
                    <Label className="text-muted-foreground">{t('bm.capex')}</Label>
                    <p className="text-lg font-medium">
                      {bmData.sourcesAndUsesRom.capexBand?.mid?.toLocaleString()} {bmData.sourcesAndUsesRom.capexBand?.currency}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bmData.sourcesAndUsesRom.capexBand?.low?.toLocaleString()} - {bmData.sourcesAndUsesRom.capexBand?.high?.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <Label className="text-muted-foreground">{t('bm.opex')}</Label>
                    <p className="text-lg font-medium">
                      {bmData.sourcesAndUsesRom.opexBand?.mid?.toLocaleString()} {bmData.sourcesAndUsesRom.opexBand?.currency}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bmData.sourcesAndUsesRom.opexBand?.low?.toLocaleString()} - {bmData.sourcesAndUsesRom.opexBand?.high?.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <Label className="text-muted-foreground">{t('bm.mrvBudget')}</Label>
                    <p className="text-lg font-medium">
                      {bmData.sourcesAndUsesRom.mrvBudgetBand?.mid?.toLocaleString()} {bmData.sourcesAndUsesRom.mrvBudgetBand?.currency}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {bmData.sourcesAndUsesRom.mrvBudgetBand?.low?.toLocaleString()} - {bmData.sourcesAndUsesRom.mrvBudgetBand?.high?.toLocaleString()}
                    </p>
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
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('bm.readinessGate')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(bmData.readiness.checklist).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${value ? 'bg-green-500 text-white' : 'bg-muted'}`}>
                        {value && <Check className="h-4 w-4" />}
                      </div>
                      <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
                        {t(`bm.checklist.${key}`)}
                      </span>
                    </div>
                  ))}
                </div>

                {bmData.readiness.blockers.length > 0 && (
                  <div className="mt-4 p-4 bg-destructive/10 rounded-lg">
                    <h4 className="font-medium text-destructive mb-2">{t('bm.blockers')}</h4>
                    <ul className="list-disc list-inside text-sm text-destructive">
                      {bmData.readiness.blockers.map(blocker => (
                        <li key={blocker}>{t(`bm.blocker.${blocker}`)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('bm.enablingActionsTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {bmData.enablingActions.map(action => (
                    <div key={action.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant={action.priority === 'HIGH' ? 'destructive' : action.priority === 'MEDIUM' ? 'default' : 'secondary'}>
                          {action.priority}
                        </Badge>
                        <span>{action.action}</span>
                      </div>
                      <Badge variant="outline">{t(`bm.categories.${action.category}`)}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('bm.risksTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {bmData.bmRisks.map(risk => (
                    <div key={risk.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant={risk.riskLevel === 'HIGH' ? 'destructive' : risk.riskLevel === 'MEDIUM' ? 'default' : 'secondary'}>
                          {t(`bm.riskLevel.${risk.riskLevel}`)}
                        </Badge>
                        <span>{t(`bm.riskTypes.${risk.riskType}`)}</span>
                      </div>
                      <Input
                        className="w-64"
                        value={risk.mitigation}
                        onChange={(e) => {
                          updateBMData({
                            bmRisks: bmData.bmRisks.map(r => r.id === risk.id ? { ...r, mitigation: e.target.value } : r),
                          });
                        }}
                        placeholder={t('bm.mitigationPlaceholder')}
                      />
                    </div>
                  ))}
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
