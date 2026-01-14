import { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { ArrowLeft, ArrowRight, Check, DollarSign, Building2, FileText, Users, ExternalLink, ChevronRight, AlertCircle, Lightbulb } from 'lucide-react';
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
import { useTranslation } from 'react-i18next';
import { useSampleData } from '@/core/contexts/sample-data-context';
import { useSampleRoute } from '@/core/hooks/useSampleRoute';

interface Fund {
  id: string;
  institution: string;
  name: string;
  description: string;
  instrumentType: string;
  instrumentLabel: string;
  eligibleBorrowers: string[];
  eligibleBorrowersLabel: string;
  prioritySectors: string[];
  prioritySectorsLabel: string;
  ticketWindow: { min: number; max: number | null; currency: string };
  ticketWindowLabel: string;
  financingShare: string;
  financialCost: string;
  tenorGrace: string;
  safeguards: string;
  applicationChannel: string;
  officialLink: string;
  category: string;
  requiresFeasibility: boolean;
  requiresSovereignGuarantee: boolean;
  supportsPreparation: boolean;
  supportsGrants: boolean;
}

interface Pathway {
  name: string;
  shortName: string;
  description: string;
  whenToUse: string;
  nextSteps: string;
}

interface FundsData {
  funds: Fund[];
  pathways: Record<string, Pathway>;
}

interface QuestionnaireAnswers {
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
}

const SECTOR_IDS = ['nature_based', 'transport', 'energy', 'water', 'waste', 'urban_resilience', 'other'];
const STAGE_IDS = ['idea', 'concept', 'prefeasibility', 'feasibility', 'procurement'];
const ELEMENT_IDS = ['capex', 'timeline', 'location', 'assessments', 'agency', 'none'];
const SIZE_IDS = ['under_1m', '1_5m', '5_20m', '20_50m', 'over_50m', 'unknown'];
const RECEIVER_IDS = ['municipality', 'state', 'utility', 'private', 'consortium'];
const REPAYMENT_IDS = ['user_fees', 'budget_savings', 'transfers', 'private_offtaker', 'not_defined'];

const SECTOR_TO_FUND_SECTORS: Record<string, string[]> = {
  nature_based: ['nature_based_solutions', 'climate_adaptation', 'biodiversity', 'adaptation_pilots', 'green_spaces', 'bioeconomy', 'all_climate_sectors'],
  transport: ['transport', 'urban_mobility', 'low_carbon_infrastructure', 'all_climate_sectors'],
  energy: ['energy', 'industrial_efficiency', 'low_carbon_industry', 'biofuels', 'small_hydro', 'all_climate_sectors'],
  water: ['water', 'water_sanitation', 'flood_control', 'all_climate_sectors'],
  waste: ['waste', 'all_climate_sectors'],
  urban_resilience: ['urban_resilience', 'flood_control', 'disaster_risk_reduction', 'climate_adaptation', 'urban_revitalization', 'smart_cities', 'public_spaces', 'social_housing', 'all_climate_sectors'],
  other: ['capacity_building', 'climate_planning', 'project_preparation', 'climate_studies', 'risk_information', 'health', 'urban_governance', 'all_climate_sectors'],
};

function determinePathway(answers: QuestionnaireAnswers): { primary: string; secondary?: string; readinessLevel: string; limitingFactorKeys: string[] } {
  const limitingFactorKeys: string[] = [];
  let readinessLevel = 'very_early';
  
  const isEarlyStage = ['idea', 'concept', 'prefeasibility'].includes(answers.projectStage);
  const hasFeasibility = ['feasibility', 'procurement'].includes(answers.projectStage);
  const missingCapex = !answers.existingElements.includes('capex');
  const missingAssessments = !answers.existingElements.includes('assessments');
  const noBudgetForPrep = answers.budgetPreparation === 'no';
  const noRevenue = answers.generatesRevenue === 'no';
  const isAdaptation = answers.sectors.includes('nature_based') || answers.sectors.includes('urban_resilience');
  const canBorrow = answers.canTakeDebt === 'yes';
  const openToBundling = answers.openToBundling === 'yes' || answers.openToBundling === 'maybe';
  
  const investmentSizeSmall = ['under_1m', '1_5m'].includes(answers.investmentSize);
  const investmentSizeLarge = ['20_50m', 'over_50m'].includes(answers.investmentSize);

  if (isEarlyStage) limitingFactorKeys.push('earlyStage');
  if (missingCapex) limitingFactorKeys.push('missingCapex');
  if (missingAssessments) limitingFactorKeys.push('missingAssessments');
  if (noBudgetForPrep) limitingFactorKeys.push('noBudgetPrep');
  if (noRevenue && !isAdaptation) limitingFactorKeys.push('noRevenue');
  if (!canBorrow && answers.canTakeDebt !== 'not_sure') limitingFactorKeys.push('cannotBorrow');

  if (hasFeasibility && !missingCapex && !missingAssessments) {
    readinessLevel = answers.projectStage === 'procurement' ? 'advanced' : 'investable';
  } else if (answers.projectStage === 'prefeasibility' || (answers.projectStage === 'concept' && answers.existingElements.length >= 3)) {
    readinessLevel = 'emerging';
  }

  if (isEarlyStage || missingCapex || missingAssessments || noBudgetForPrep) {
    if (noRevenue || isAdaptation) {
      return { primary: 'preparation_facility', secondary: 'grant', readinessLevel, limitingFactorKeys };
    }
    return { primary: 'preparation_facility', readinessLevel, limitingFactorKeys };
  }

  if (noRevenue || (isAdaptation && answers.generatesRevenue !== 'yes')) {
    return { primary: 'grant', readinessLevel, limitingFactorKeys };
  }

  if (investmentSizeSmall && openToBundling) {
    return { primary: 'aggregation', secondary: 'domestic_bank', readinessLevel, limitingFactorKeys };
  }

  if (hasFeasibility && canBorrow && !investmentSizeLarge) {
    return { primary: 'domestic_bank', readinessLevel, limitingFactorKeys };
  }

  if (hasFeasibility && investmentSizeLarge && answers.nationalApproval !== 'no') {
    return { primary: 'multilateral', readinessLevel, limitingFactorKeys };
  }

  return { primary: 'domestic_bank', readinessLevel, limitingFactorKeys };
}

function rankFunds(funds: Fund[], answers: QuestionnaireAnswers, pathway: string): Fund[] {
  const userFundSectors = answers.sectors.flatMap(s => SECTOR_TO_FUND_SECTORS[s] || []);
  
  return funds
    .filter(fund => {
      if (pathway === 'preparation_facility') return fund.supportsPreparation;
      if (pathway === 'grant') return fund.instrumentType === 'grant' || fund.instrumentType === 'technical_assistance';
      if (pathway === 'domestic_bank') return fund.category === 'domestic_bank';
      if (pathway === 'multilateral') return fund.category === 'multilateral';
      if (pathway === 'aggregation') return fund.category === 'domestic_bank' || fund.supportsPreparation;
      return true;
    })
    .map(fund => {
      let score = 0;
      
      const sectorMatch = fund.prioritySectors.some(ps => userFundSectors.includes(ps));
      if (sectorMatch) score += 25;
      
      if (fund.eligibleBorrowers.includes(answers.fundingReceiver)) score += 20;
      
      const investmentUSD: Record<string, number> = {
        'under_1m': 500000,
        '1_5m': 3000000,
        '5_20m': 12000000,
        '20_50m': 35000000,
        'over_50m': 100000000,
        'unknown': 10000000,
      };
      const userInvestment = investmentUSD[answers.investmentSize] || 10000000;
      
      const minTicket = fund.ticketWindow.currency === 'BRL' 
        ? fund.ticketWindow.min / 5 
        : fund.ticketWindow.min;
      const maxTicket = fund.ticketWindow.max 
        ? (fund.ticketWindow.currency === 'BRL' ? fund.ticketWindow.max / 5 : fund.ticketWindow.max)
        : Infinity;
      
      if (userInvestment >= minTicket && userInvestment <= maxTicket) score += 25;
      else if (userInvestment >= minTicket * 0.5 && userInvestment <= maxTicket * 1.5) score += 10;
      
      if (fund.instrumentType === 'grant' && answers.generatesRevenue === 'no') score += 15;
      if (fund.instrumentType === 'loan' && answers.generatesRevenue === 'yes') score += 15;
      if (!fund.requiresSovereignGuarantee) score += 10;
      if (!fund.requiresFeasibility && ['idea', 'concept', 'prefeasibility'].includes(answers.projectStage)) score += 15;
      
      return { ...fund, score };
    })
    .sort((a, b) => (b as any).score - (a as any).score)
    .slice(0, 3);
}

export default function FunderSelectionPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { isSampleMode, sampleActions } = useSampleData();
  const { isSampleRoute, routePrefix } = useSampleRoute();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [fundsData, setFundsData] = useState<FundsData | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({
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
  });

  const action = (isSampleMode || isSampleRoute) 
    ? sampleActions.find(a => a.id === projectId)
    : null;

  useEffect(() => {
    fetch('/sample-data/climate-funds.json')
      .then(res => res.json())
      .then(data => setFundsData(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (action && !answers.projectName) {
      setAnswers(prev => ({
        ...prev,
        projectName: action.name,
        projectDescription: action.description || '',
        sectors: action.type === 'adaptation' ? ['nature_based', 'urban_resilience'] : ['energy', 'transport'],
      }));
    }
  }, [action]);

  const steps = [
    { id: 'basics', title: t('funderSelection.steps.basics'), icon: FileText },
    { id: 'readiness', title: t('funderSelection.steps.readiness'), icon: Check },
    { id: 'financing', title: t('funderSelection.steps.financing'), icon: DollarSign },
    { id: 'institutional', title: t('funderSelection.steps.institutional'), icon: Building2 },
  ];

  const canProceed = () => {
    switch (currentStep) {
      case 0: return answers.projectName && answers.sectors.length > 0;
      case 1: return answers.projectStage && answers.budgetPreparation;
      case 2: return answers.generatesRevenue && answers.investmentSize;
      case 3: return answers.fundingReceiver && answers.canTakeDebt;
      default: return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setShowResults(true);
    }
  };

  const handleBack = () => {
    if (showResults) {
      setShowResults(false);
    } else if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const updateAnswer = <K extends keyof QuestionnaireAnswers>(key: K, value: QuestionnaireAnswers[K]) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  };

  const toggleArrayAnswer = (key: 'sectors' | 'existingElements', value: string) => {
    setAnswers(prev => {
      const current = prev[key];
      if (value === 'none') {
        return { ...prev, [key]: current.includes('none') ? [] : ['none'] };
      }
      const filtered = current.filter(v => v !== 'none');
      return {
        ...prev,
        [key]: filtered.includes(value) 
          ? filtered.filter(v => v !== value)
          : [...filtered, value]
      };
    });
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="projectName">{t('funderSelection.projectName')}</Label>
              <Input
                id="projectName"
                value={answers.projectName}
                onChange={(e) => updateAnswer('projectName', e.target.value)}
                placeholder={t('funderSelection.projectNamePlaceholder')}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="projectDescription">{t('funderSelection.projectDescription')}</Label>
              <Textarea
                id="projectDescription"
                value={answers.projectDescription}
                onChange={(e) => updateAnswer('projectDescription', e.target.value)}
                placeholder={t('funderSelection.projectDescriptionPlaceholder')}
                className="mt-2"
                rows={3}
              />
            </div>
            <div>
              <Label>{t('funderSelection.primarySector')}</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                {SECTOR_IDS.map(id => (
                  <div key={id} className="flex items-center space-x-2">
                    <Checkbox
                      id={id}
                      checked={answers.sectors.includes(id)}
                      onCheckedChange={() => toggleArrayAnswer('sectors', id)}
                    />
                    <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
                      {t(`funderSelection.sectors.${id}`)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div>
              <Label>{t('funderSelection.currentStage')}</Label>
              <RadioGroup
                value={answers.projectStage}
                onValueChange={(v) => updateAnswer('projectStage', v)}
                className="mt-2 space-y-2"
              >
                {STAGE_IDS.map(id => (
                  <div key={id} className="flex items-center space-x-2">
                    <RadioGroupItem value={id} id={`stage-${id}`} />
                    <Label htmlFor={`stage-${id}`} className="text-sm font-normal cursor-pointer">
                      {t(`funderSelection.stages.${id}`)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div>
              <Label>{t('funderSelection.existingElements')}</Label>
              <div className="space-y-2 mt-2">
                {ELEMENT_IDS.map(id => (
                  <div key={id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`element-${id}`}
                      checked={answers.existingElements.includes(id)}
                      onCheckedChange={() => toggleArrayAnswer('existingElements', id)}
                    />
                    <Label htmlFor={`element-${id}`} className="text-sm font-normal cursor-pointer">
                      {t(`funderSelection.elements.${id}`)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>{t('funderSelection.budgetPreparation')}</Label>
                <RadioGroup
                  value={answers.budgetPreparation}
                  onValueChange={(v) => updateAnswer('budgetPreparation', v)}
                  className="mt-2 space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="prep-yes" />
                    <Label htmlFor="prep-yes" className="text-sm font-normal">{t('common.yes')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="prep-no" />
                    <Label htmlFor="prep-no" className="text-sm font-normal">{t('common.no')}</Label>
                  </div>
                </RadioGroup>
              </div>
              <div>
                <Label>{t('funderSelection.budgetImplementation')}</Label>
                <RadioGroup
                  value={answers.budgetImplementation}
                  onValueChange={(v) => updateAnswer('budgetImplementation', v)}
                  className="mt-2 space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="impl-yes" />
                    <Label htmlFor="impl-yes" className="text-sm font-normal">{t('common.yes')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="partial" id="impl-partial" />
                    <Label htmlFor="impl-partial" className="text-sm font-normal">{t('funderSelection.partial')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="impl-no" />
                    <Label htmlFor="impl-no" className="text-sm font-normal">{t('common.no')}</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div>
              <Label>{t('funderSelection.generatesRevenue')}</Label>
              <RadioGroup
                value={answers.generatesRevenue}
                onValueChange={(v) => updateAnswer('generatesRevenue', v)}
                className="mt-2 space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="rev-yes" />
                  <Label htmlFor="rev-yes" className="text-sm font-normal">{t('common.yes')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="rev-no" />
                  <Label htmlFor="rev-no" className="text-sm font-normal">{t('common.no')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="not_sure" id="rev-unsure" />
                  <Label htmlFor="rev-unsure" className="text-sm font-normal">{t('funderSelection.notSure')}</Label>
                </div>
              </RadioGroup>
            </div>
            {answers.generatesRevenue === 'yes' && (
              <div>
                <Label>{t('funderSelection.repaymentSource')}</Label>
                <RadioGroup
                  value={answers.repaymentSource}
                  onValueChange={(v) => updateAnswer('repaymentSource', v)}
                  className="mt-2 space-y-2"
                >
                  {REPAYMENT_IDS.map(id => (
                    <div key={id} className="flex items-center space-x-2">
                      <RadioGroupItem value={id} id={`repay-${id}`} />
                      <Label htmlFor={`repay-${id}`} className="text-sm font-normal cursor-pointer">
                        {t(`funderSelection.repaymentSources.${id}`)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}
            <div>
              <Label>{t('funderSelection.investmentSize')}</Label>
              <RadioGroup
                value={answers.investmentSize}
                onValueChange={(v) => updateAnswer('investmentSize', v)}
                className="mt-2 space-y-2"
              >
                {SIZE_IDS.map(id => (
                  <div key={id} className="flex items-center space-x-2">
                    <RadioGroupItem value={id} id={`size-${id}`} />
                    <Label htmlFor={`size-${id}`} className="text-sm font-normal cursor-pointer">
                      {t(`funderSelection.sizes.${id}`)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div>
              <Label>{t('funderSelection.fundingReceiver')}</Label>
              <RadioGroup
                value={answers.fundingReceiver}
                onValueChange={(v) => updateAnswer('fundingReceiver', v)}
                className="mt-2 space-y-2"
              >
                {RECEIVER_IDS.map(id => (
                  <div key={id} className="flex items-center space-x-2">
                    <RadioGroupItem value={id} id={`receiver-${id}`} />
                    <Label htmlFor={`receiver-${id}`} className="text-sm font-normal cursor-pointer">
                      {t(`funderSelection.receivers.${id}`)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>{t('funderSelection.canTakeDebt')}</Label>
                <RadioGroup
                  value={answers.canTakeDebt}
                  onValueChange={(v) => updateAnswer('canTakeDebt', v)}
                  className="mt-2 space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="debt-yes" />
                    <Label htmlFor="debt-yes" className="text-sm font-normal">{t('common.yes')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="debt-no" />
                    <Label htmlFor="debt-no" className="text-sm font-normal">{t('common.no')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="not_sure" id="debt-unsure" />
                    <Label htmlFor="debt-unsure" className="text-sm font-normal">{t('funderSelection.notSure')}</Label>
                  </div>
                </RadioGroup>
              </div>
              <div>
                <Label>{t('funderSelection.nationalApproval')}</Label>
                <RadioGroup
                  value={answers.nationalApproval}
                  onValueChange={(v) => updateAnswer('nationalApproval', v)}
                  className="mt-2 space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="national-yes" />
                    <Label htmlFor="national-yes" className="text-sm font-normal">{t('common.yes')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="national-no" />
                    <Label htmlFor="national-no" className="text-sm font-normal">{t('common.no')}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="not_sure" id="national-unsure" />
                    <Label htmlFor="national-unsure" className="text-sm font-normal">{t('funderSelection.notSure')}</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
            <div>
              <Label>{t('funderSelection.openToBundling')}</Label>
              <RadioGroup
                value={answers.openToBundling}
                onValueChange={(v) => updateAnswer('openToBundling', v)}
                className="mt-2 space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="bundle-yes" />
                  <Label htmlFor="bundle-yes" className="text-sm font-normal">{t('common.yes')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="bundle-no" />
                  <Label htmlFor="bundle-no" className="text-sm font-normal">{t('common.no')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="maybe" id="bundle-maybe" />
                  <Label htmlFor="bundle-maybe" className="text-sm font-normal">{t('funderSelection.maybe')}</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const renderResults = () => {
    if (!fundsData) return null;

    const { primary, secondary, readinessLevel, limitingFactorKeys } = determinePathway(answers);
    const pathway = fundsData.pathways[primary];
    const secondaryPathway = secondary ? fundsData.pathways[secondary] : null;
    const recommendedFunds = rankFunds(fundsData.funds, answers, primary);

    const readinessLabels: Record<string, { label: string; color: string }> = {
      very_early: { label: t('funderSelection.readiness.veryEarly'), color: 'bg-red-100 text-red-800' },
      emerging: { label: t('funderSelection.readiness.emerging'), color: 'bg-yellow-100 text-yellow-800' },
      investable: { label: t('funderSelection.readiness.investable'), color: 'bg-green-100 text-green-800' },
      advanced: { label: t('funderSelection.readiness.advanced'), color: 'bg-blue-100 text-blue-800' },
    };

    return (
      <div className="space-y-6">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>{t('funderSelection.results.recommendedPathway')}</CardTitle>
                <CardDescription className="text-base font-medium text-foreground mt-1">
                  {pathway.name}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">{t('funderSelection.results.whatThisMeans')}</h4>
              <p className="text-sm text-muted-foreground">{pathway.description}</p>
            </div>
            <div>
              <h4 className="font-medium mb-2">{t('funderSelection.results.whyThisFits')}</h4>
              <p className="text-sm text-muted-foreground">{pathway.whenToUse}</p>
            </div>
            {secondaryPathway && (
              <div className="pt-4 border-t">
                <Badge variant="outline" className="mb-2">{t('funderSelection.results.alsoConsider')}</Badge>
                <p className="text-sm font-medium">{secondaryPathway.name}</p>
                <p className="text-sm text-muted-foreground mt-1">{secondaryPathway.whenToUse}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              {t('funderSelection.results.readinessSnapshot')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{t('funderSelection.results.assessedLevel')}:</span>
              <Badge className={readinessLabels[readinessLevel].color}>
                {readinessLabels[readinessLevel].label}
              </Badge>
            </div>
            {limitingFactorKeys.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">{t('funderSelection.results.limitingFactors')}:</h4>
                <ul className="space-y-1">
                  {limitingFactorKeys.map((key, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      {t(`funderSelection.limitingFactors.${key}`)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('funderSelection.results.topFunds')}
            </CardTitle>
            <CardDescription>
              {t('funderSelection.results.topFundsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recommendedFunds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t('funderSelection.results.noFundsMatch')}
              </p>
            ) : (
              recommendedFunds.map((fund, index) => (
                <div key={fund.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">#{index + 1}</Badge>
                        <h4 className="font-medium">{fund.name}</h4>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{fund.institution}</p>
                    </div>
                    <Badge>{fund.instrumentLabel}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{fund.description}</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">{t('funderSelection.results.ticketSize')}:</span>
                      <p className="text-muted-foreground">{fund.ticketWindowLabel}</p>
                    </div>
                    <div>
                      <span className="font-medium">{t('funderSelection.results.terms')}:</span>
                      <p className="text-muted-foreground">{fund.tenorGrace}</p>
                    </div>
                  </div>
                  {fund.officialLink && (
                    <a
                      href={fund.officialLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {t('funderSelection.results.learnMore')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              {t('funderSelection.results.nextSteps')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{pathway.nextSteps}</p>
            <div className="pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                {t('funderSelection.results.disclaimer')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link href={`${routePrefix}/project/${projectId}`}>
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
        </Link>

        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">{t('funderSelection.title')}</h1>
          <p className="text-muted-foreground">{t('funderSelection.subtitle')}</p>
        </div>

        {!showResults && (
          <>
            <div className="mb-8">
              <div className="flex justify-between mb-2">
                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    className={`flex items-center gap-2 ${index <= currentStep ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      index < currentStep ? 'bg-primary text-primary-foreground' : 
                      index === currentStep ? 'border-2 border-primary' : 'border-2 border-muted'
                    }`}>
                      {index < currentStep ? <Check className="h-4 w-4" /> : <step.icon className="h-4 w-4" />}
                    </div>
                    <span className="hidden md:inline text-sm font-medium">{step.title}</span>
                  </div>
                ))}
              </div>
              <Progress value={(currentStep / (steps.length - 1)) * 100} className="h-2" />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{steps[currentStep].title}</CardTitle>
              </CardHeader>
              <CardContent>
                {renderStepContent()}
              </CardContent>
            </Card>

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={handleBack} disabled={currentStep === 0}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('common.back')}
              </Button>
              <Button onClick={handleNext} disabled={!canProceed()}>
                {currentStep === steps.length - 1 ? t('funderSelection.getRecommendations') : t('common.next')}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </>
        )}

        {showResults && (
          <>
            {renderResults()}
            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('funderSelection.modifyAnswers')}
              </Button>
              <Link href={`${routePrefix}/project/${projectId}`}>
                <Button>
                  {t('funderSelection.backToProject')}
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
