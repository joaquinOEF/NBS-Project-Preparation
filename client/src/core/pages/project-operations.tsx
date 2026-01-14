import { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { ArrowLeft, Check, Building2, Users, ClipboardList, DollarSign, AlertTriangle, FileText, Copy, ChevronDown, ChevronUp } from 'lucide-react';
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
import { useTranslation } from 'react-i18next';
import { useSampleData } from '@/core/contexts/sample-data-context';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';
import { useToast } from '@/core/hooks/use-toast';

type OperatingModel = 'CITY_RUN' | 'UTILITY_RUN' | 'CONTRACTOR_RUN' | 'COMMUNITY_STEWARDSHIP' | 'HYBRID_SPLIT' | null;
type CommunityRole = 'BENEFICIARY' | 'STEWARD_OPERATOR' | 'CO_OWNER_REVENUE_PARTICIPANT' | null;
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type CapacityAssessment = 'ADEQUATE' | 'PARTIAL_NEEDS_SUPPORT' | 'INADEQUATE' | null;
type OMStatus = 'NOT_STARTED' | 'DRAFT' | 'READY';

interface Stakeholder {
  id: string;
  name: string;
  type: string;
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
  mitigation: string;
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
  };
  omCostBand: {
    low: number;
    mid: number;
    high: number;
    currency: string;
    basis: 'PER_ASSET' | 'PER_HECTARE' | 'PER_KM' | 'PER_SITE' | 'PORTFOLIO';
    assumptions: string;
  };
  omFunding: {
    mechanisms: string[];
    durationYears: 1 | 3 | 5 | 10;
  };
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
    };
  };
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
  { id: 'zone-1', name: 'Centro Histórico Sponge Zone', hazardType: 'FLOOD', interventionType: 'sponge_network' },
  { id: 'zone-2', name: 'Cidade Baixa Cooling Corridor', hazardType: 'HEAT', interventionType: 'cooling_network' },
  { id: 'zone-3', name: 'Morro Santana Slope Stabilization', hazardType: 'LANDSLIDE', interventionType: 'slope_stabilization' },
  { id: 'zone-4', name: 'Guaíba Waterfront Multi-Benefit', hazardType: 'MULTI', interventionType: 'multi_benefit' },
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
  { id: 'r1', riskType: 'PERFORMANCE_DECLINE', riskLevel: 'MEDIUM', mitigation: '' },
  { id: 'r2', riskType: 'EXTREME_EVENTS', riskLevel: 'HIGH', mitigation: '' },
  { id: 'r3', riskType: 'FUNDING_GAP', riskLevel: 'MEDIUM', mitigation: '' },
  { id: 'r4', riskType: 'GOVERNANCE_FAILURE', riskLevel: 'LOW', mitigation: '' },
];

const FUNDING_MECHANISMS = [
  'CITY_BUDGET_LINE',
  'RING_FENCED_FEE_ALLOCATION',
  'MULTI_YEAR_SERVICE_CONTRACT',
  'DISTRICT_LEVY_BID',
  'PHILANTHROPY_ESTABLISHMENT_GRANT',
  'DEVELOPER_MAINTENANCE_ESCROW',
];

const OM_STORAGE_KEY = 'nbs_operations_om';

function getStoredOMData(projectId: string): OperationsOMData | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(`${OM_STORAGE_KEY}_${projectId}`);
  return stored ? JSON.parse(stored) : null;
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

  const taskPlan = TASK_LIBRARY[interventionType] || TASK_LIBRARY.multi_benefit;

  return {
    status: 'NOT_STARTED',
    operatingModel: isNBS ? 'COMMUNITY_STEWARDSHIP' : 'CITY_RUN',
    roles: {
      assetOwnerEntityId: 'city-env',
      programOwnerEntityId: 'smam',
      operatorEntityId: isNBS ? 'community-assoc' : 'city-parks',
      maintainerEntityId: isNBS ? 'community-assoc' : 'city-works',
      verifierEntityId: null,
      communityRole: isNBS ? 'STEWARD_OPERATOR' : 'BENEFICIARY',
      stewardshipScope: {
        routineMaintenance: true,
        inspections: true,
        minorRepairs: false,
        monitoringSupport: true,
      },
    },
    serviceLevels,
    taskPlan: taskPlan.map(t => ({ ...t, id: `${t.id}-${Date.now()}` })),
    nbsExtensions: {
      establishmentPeriodMonths: 24,
      maintenanceIntensity: 'MEDIUM',
      survivalTargetPercent: 85,
      replacementPolicy: 'REPLACE_90D',
      nbsAssetTypes: ['URBAN_TREES_CORRIDORS', 'BIOSWALES_RAIN_GARDENS'],
    },
    omCostBand: {
      low: 50000,
      mid: 100000,
      high: 200000,
      currency: 'BRL',
      basis: 'PER_SITE',
      assumptions: 'Annual O&M costs based on 10-year lifecycle',
    },
    omFunding: {
      mechanisms: ['CITY_BUDGET_LINE', 'PHILANTHROPY_ESTABLISHMENT_GRANT'],
      durationYears: 5,
    },
    capacity: {
      assessment: 'PARTIAL_NEEDS_SUPPORT',
      notes: '',
    },
    opsRisks: DEFAULT_RISKS.map(r => ({ ...r })),
    readiness: {
      blockers: [],
      checklist: {
        operatingModelSelected: false,
        operatorAssigned: false,
        taskPlanPresent: false,
        fundingMechanismSelected: false,
        verifierSet: false,
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

  const [currentStep, setCurrentStep] = useState(0);
  const [omData, setOMData] = useState<OperationsOMData | null>(null);
  const [playbookOpen, setPlaybookOpen] = useState(false);

  const action = sampleActions.find(a => a.id === projectId);
  const isNBS = action?.type === 'adaptation';
  const stakeholders = SAMPLE_STAKEHOLDERS;
  const sites = SAMPLE_SITES;

  useEffect(() => {
    if (projectId) {
      const stored = getStoredOMData(projectId);
      if (stored) {
        setOMData(stored);
      } else {
        const initial = buildInitialOMData(action?.type || 'adaptation', sites);
        setOMData(initial);
      }
    }
  }, [projectId, action?.type]);

  useEffect(() => {
    if (projectId && omData) {
      const updatedData = { ...omData };
      updatedData.readiness.checklist = {
        operatingModelSelected: omData.operatingModel !== null,
        operatorAssigned: omData.roles.operatorEntityId !== null,
        taskPlanPresent: omData.taskPlan.length > 0,
        fundingMechanismSelected: omData.omFunding.mechanisms.length > 0,
        verifierSet: omData.roles.verifierEntityId !== null,
      };
      
      const blockers: string[] = [];
      if (!updatedData.readiness.checklist.operatingModelSelected) blockers.push('selectOperatingModel');
      if (!updatedData.readiness.checklist.operatorAssigned) blockers.push('assignOperator');
      if (!updatedData.readiness.checklist.taskPlanPresent) blockers.push('defineTaskPlan');
      if (!updatedData.readiness.checklist.fundingMechanismSelected) blockers.push('selectFunding');
      
      updatedData.readiness.blockers = blockers;
      
      const allRequired = updatedData.readiness.checklist.operatingModelSelected &&
        updatedData.readiness.checklist.operatorAssigned &&
        updatedData.readiness.checklist.taskPlanPresent &&
        updatedData.readiness.checklist.fundingMechanismSelected;
      
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
    { id: 'readiness', icon: AlertTriangle },
  ];

  const getStakeholderName = (id: string | null) => {
    if (!id) return t('om.notAssigned');
    return stakeholders.find(s => s.id === id)?.name || id;
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

  if (!omData) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <p>{t('common.loading')}</p>
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
              onClick={() => setCurrentStep(index)}
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
                    <span className="ml-2">{stakeholders.length}</span>
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
                        {stakeholders.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
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

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3 text-sm font-medium">{t('om.taskCategory')}</th>
                      <th className="text-left p-3 text-sm font-medium">{t('om.taskName')}</th>
                      <th className="text-left p-3 text-sm font-medium">{t('om.taskFrequency')}</th>
                      <th className="text-left p-3 text-sm font-medium">{t('om.responsible')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {omData.taskPlan.map((task, index) => (
                      <tr key={task.id} className="border-t">
                        <td className="p-3">
                          <Badge variant="outline">{t(`om.category.${task.category}`)}</Badge>
                        </td>
                        <td className="p-3">
                          <Input
                            value={task.name}
                            onChange={(e) => {
                              const newTasks = [...omData.taskPlan];
                              newTasks[index] = { ...task, name: e.target.value };
                              updateOMData({ taskPlan: newTasks });
                            }}
                          />
                        </td>
                        <td className="p-3">
                          <Select
                            value={task.frequency}
                            onValueChange={(value) => {
                              const newTasks = [...omData.taskPlan];
                              newTasks[index] = { ...task, frequency: value as Task['frequency'] };
                              updateOMData({ taskPlan: newTasks });
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['WEEKLY', 'MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL', 'EVENT_TRIGGERED'].map((freq) => (
                                <SelectItem key={freq} value={freq}>{t(`om.frequency.${freq}`)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3">
                          <Select
                            value={task.responsibleEntityId || ''}
                            onValueChange={(value) => {
                              const newTasks = [...omData.taskPlan];
                              newTasks[index] = { ...task, responsibleEntityId: value || null };
                              updateOMData({ taskPlan: newTasks });
                            }}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder={t('om.selectEntity')} />
                            </SelectTrigger>
                            <SelectContent>
                              {stakeholders.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                <h3 className="font-medium mb-3">{t('om.costBandTitle')}</h3>
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
                <div className="mt-4 space-y-2">
                  <Label>{t('om.assumptions')}</Label>
                  <Textarea
                    value={omData.omCostBand.assumptions}
                    onChange={(e) => updateOMData({
                      omCostBand: { ...omData.omCostBand, assumptions: e.target.value }
                    })}
                    placeholder={t('om.assumptionsPlaceholder')}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-medium mb-3">{t('om.fundingMechanismsTitle')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {FUNDING_MECHANISMS.map((mechanism) => (
                    <Label key={mechanism} className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-accent">
                      <Checkbox
                        checked={omData.omFunding.mechanisms.includes(mechanism)}
                        onCheckedChange={(checked) => {
                          const newMechanisms = checked
                            ? [...omData.omFunding.mechanisms, mechanism]
                            : omData.omFunding.mechanisms.filter(m => m !== mechanism);
                          updateOMData({ omFunding: { ...omData.omFunding, mechanisms: newMechanisms } });
                        }}
                      />
                      <span className="text-sm">{t(`om.fundingMechanisms.${mechanism}`)}</span>
                    </Label>
                  ))}
                </div>
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
            <Card>
              <CardHeader>
                <CardTitle>{t('om.capacityTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  value={omData.capacity.notes}
                  onChange={(e) => updateOMData({
                    capacity: { ...omData.capacity, notes: e.target.value }
                  })}
                  placeholder={t('om.capacityNotesPlaceholder')}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('om.risksTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {omData.opsRisks.map((risk, index) => (
                    <div key={risk.id} className="flex gap-4 items-start p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{t(`om.riskTypes.${risk.riskType}`)}</div>
                        <Input
                          className="mt-2"
                          value={risk.mitigation}
                          onChange={(e) => {
                            const newRisks = [...omData.opsRisks];
                            newRisks[index] = { ...risk, mitigation: e.target.value };
                            updateOMData({ opsRisks: newRisks });
                          }}
                          placeholder={t('om.mitigationPlaceholder')}
                        />
                      </div>
                      <Select
                        value={risk.riskLevel}
                        onValueChange={(value) => {
                          const newRisks = [...omData.opsRisks];
                          newRisks[index] = { ...risk, riskLevel: value as RiskLevel };
                          updateOMData({ opsRisks: newRisks });
                        }}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LOW">{t('om.riskLevel.LOW')}</SelectItem>
                          <SelectItem value="MEDIUM">{t('om.riskLevel.MEDIUM')}</SelectItem>
                          <SelectItem value="HIGH">{t('om.riskLevel.HIGH')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
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

            <Collapsible open={playbookOpen} onOpenChange={setPlaybookOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center justify-between">
                      <CardTitle>{t('om.playbookPreview')}</CardTitle>
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
                      {t('om.copyToConceptNote')}
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
            onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
            disabled={currentStep === steps.length - 1}
          >
            {t('common.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
