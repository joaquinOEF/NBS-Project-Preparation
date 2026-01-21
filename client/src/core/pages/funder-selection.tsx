import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, Link } from 'wouter';
import { ArrowLeft, ArrowRight, Check, DollarSign, Building2, FileText, Users, ExternalLink, ChevronRight, AlertCircle, Lightbulb, Target, ArrowUpRight, CheckCircle2, Lock, Edit2, Search, AlertTriangle, Shield } from 'lucide-react';
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
import { useProjectContext, FunderSelectionData } from '@/core/contexts/project-context';

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

interface ChecklistItem {
  id: string;
  category: 'feasibility' | 'safeguards' | 'repayment' | 'sovereign' | 'aggregation';
  text: string;
  priority: 'high' | 'medium' | 'low';
}

interface TargetFunder {
  fund: Fund;
  whyFitReasons: string[];
  gapChecklist: ChecklistItem[];
  confidence: 'high' | 'medium' | 'low';
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
  // Political mandate & readiness fields
  politicalMandatePlanRefs: string[];
  politicalEndorsementLevel: string;
  implementingOwnership: string;
  internalAlignmentLevel: string;
  politicalRiskFactors: string[];
  leadershipCommitmentConfidence: string;
  // Financing fields
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

const RECEIVER_TO_BORROWER: Record<string, string[]> = {
  municipality: ['municipality'],
  state: ['state_government'],
  utility: ['utility', 'public_utility'],
  private: ['ppp_spv', 'private'],
  consortium: ['consortium', 'municipality', 'state_government'],
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

interface ReadinessScores {
  technical: number;
  financial: number;
  political: number;
  overall: number;
  overallLabel: 'very_early' | 'emerging' | 'investable' | 'advanced';
  mandateStrength: 'weak' | 'moderate' | 'strong';
  durabilityRisk: 'low' | 'medium' | 'high';
}

function computeReadinessScores(answers: QuestionnaireAnswers): ReadinessScores {
  // Technical readiness (0-100)
  let technical = 0;
  const stage = answers.projectStage;
  if (stage === 'procurement') technical = 100;
  else if (stage === 'feasibility') technical = 75;
  else if (stage === 'prefeasibility') technical = 50;
  else if (stage === 'concept') technical = 25;
  else technical = 10; // idea
  
  // Adjust for existing elements
  const elementCount = answers.existingElements.filter(e => e !== 'none').length;
  technical = Math.min(100, technical + elementCount * 5);
  
  // Financial readiness (0-100)
  let financial = 0;
  if (answers.generatesRevenue === 'yes') financial += 30;
  else if (answers.generatesRevenue === 'not_sure') financial += 15;
  
  if (answers.budgetPreparation === 'yes') financial += 20;
  if (answers.budgetImplementation === 'yes') financial += 20;
  else if (answers.budgetImplementation === 'partial') financial += 10;
  
  if (answers.canTakeDebt === 'yes') financial += 20;
  else if (answers.canTakeDebt === 'not_sure') financial += 10;
  
  if (answers.repaymentSource && answers.repaymentSource !== 'not_defined') financial += 10;
  
  // Political readiness (0-100) per the scoring rules
  let political = 0;
  
  // Mandate (max 40)
  const planRefs = answers.politicalMandatePlanRefs || [];
  const hasPlanRef = planRefs.some(p => 
    ['city_climate_plan', 'sectoral_plan', 'multi_year_investment_plan', 'national_or_state_plan'].includes(p)
  );
  if (hasPlanRef) political += 20;
  
  const endorsement = answers.politicalEndorsementLevel;
  if (endorsement === 'written') political += 20;
  else if (endorsement === 'informal') political += 10;
  
  // Ownership & alignment (max 40)
  const ownership = answers.implementingOwnership;
  if (ownership === 'single_department') political += 15;
  else if (ownership === 'multiple_departments') political += 10;
  
  const alignment = answers.internalAlignmentLevel;
  if (alignment === 'high') political += 25;
  else if (alignment === 'medium') political += 15;
  else if (alignment === 'unknown') political += 5;
  
  // Durability (max 20)
  const commitment = answers.leadershipCommitmentConfidence;
  if (commitment === 'high') political += 20;
  else if (commitment === 'medium') political += 10;
  else if (commitment === 'unknown') political += 5;
  
  // Risk factor penalty (subtract up to 20)
  const riskFactors = answers.politicalRiskFactors || [];
  const riskPenalties: Record<string, number> = {
    upcoming_elections: 5,
    land_resettlement: 7,
    tariff_sensitivity: 5,
    public_opposition: 7,
  };
  
  let penalty = 0;
  if (!riskFactors.includes('none')) {
    for (const rf of riskFactors) {
      penalty += riskPenalties[rf] || 0;
    }
  }
  penalty = Math.min(20, penalty); // Cap risk penalty at 20
  political = Math.max(0, Math.min(100, political - penalty));
  
  // Derived labels
  let mandateStrength: 'weak' | 'moderate' | 'strong' = 'weak';
  if (hasPlanRef && endorsement === 'written') mandateStrength = 'strong';
  else if (hasPlanRef || endorsement === 'informal') mandateStrength = 'moderate';
  
  const riskCount = riskFactors.filter(r => r !== 'none').length;
  let durabilityRisk: 'low' | 'medium' | 'high' = 'low';
  if (commitment === 'low' || alignment === 'low' || riskCount >= 2) durabilityRisk = 'high';
  else if (commitment === 'medium' || riskCount === 1) durabilityRisk = 'medium';
  else if (commitment === 'high' && alignment === 'high' && riskCount === 0) durabilityRisk = 'low';
  
  // Overall readiness (weighted)
  const overall = Math.round(0.4 * technical + 0.4 * financial + 0.2 * political);
  
  // Overall label
  let overallLabel: 'very_early' | 'emerging' | 'investable' | 'advanced' = 'very_early';
  if (overall >= 81) overallLabel = 'advanced';
  else if (overall >= 56) overallLabel = 'investable';
  else if (overall >= 26) overallLabel = 'emerging';
  
  return {
    technical: Math.round(technical),
    financial: Math.round(financial),
    political: Math.round(political),
    overall,
    overallLabel,
    mandateStrength,
    durabilityRisk,
  };
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
      
      const userBorrowerTypes = RECEIVER_TO_BORROWER[answers.fundingReceiver] || [answers.fundingReceiver];
      if (fund.eligibleBorrowers.some(b => userBorrowerTypes.includes(b))) score += 20;
      
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

function generateGapChecklist(answers: QuestionnaireAnswers, fund: Fund): ChecklistItem[] {
  const checklist: ChecklistItem[] = [];
  const isEarlyStage = ['idea', 'concept', 'prefeasibility'].includes(answers.projectStage);
  const missingCapex = !answers.existingElements.includes('capex');
  const missingAssessments = !answers.existingElements.includes('assessments');
  const repaymentUnclear = answers.repaymentSource === 'not_defined' || answers.generatesRevenue === 'no';
  const sovereignRequired = fund.requiresSovereignGuarantee && answers.nationalApproval !== 'yes';
  const investmentSizeSmall = ['under_1m', '1_5m'].includes(answers.investmentSize);
  const fundMinTicket = fund.ticketWindow.currency === 'BRL' 
    ? fund.ticketWindow.min / 5 
    : fund.ticketWindow.min;

  if (isEarlyStage || !answers.existingElements.includes('assessments')) {
    checklist.push({
      id: 'feasibility-study',
      category: 'feasibility',
      text: 'Complete pre-feasibility and feasibility study',
      priority: 'high',
    });
  }

  if (missingCapex) {
    checklist.push({
      id: 'capex-opex',
      category: 'feasibility',
      text: 'Develop CAPEX and OPEX estimates with implementation timeline',
      priority: 'high',
    });
  }

  if (isEarlyStage) {
    checklist.push({
      id: 'implementation-plan',
      category: 'feasibility',
      text: 'Define implementation plan and procurement approach',
      priority: 'medium',
    });
  }

  if (missingAssessments || fund.safeguards) {
    checklist.push({
      id: 'esia-esmp',
      category: 'safeguards',
      text: 'Prepare ESIA/ESMP and stakeholder engagement plan',
      priority: 'high',
    });
  }

  if (repaymentUnclear && fund.instrumentType === 'loan') {
    checklist.push({
      id: 'repayment-pathway',
      category: 'repayment',
      text: 'Define repayment pathway (budget/tariff/savings) and secure treasury sign-off',
      priority: 'high',
    });
  }

  if (sovereignRequired) {
    checklist.push({
      id: 'sovereign-approval',
      category: 'sovereign',
      text: 'Confirm sovereign/national approval pathway and guarantee feasibility',
      priority: 'high',
    });
  }

  const investmentUSD: Record<string, number> = {
    'under_1m': 500000,
    '1_5m': 3000000,
    '5_20m': 12000000,
    '20_50m': 35000000,
    'over_50m': 100000000,
    'unknown': 10000000,
  };
  const userInvestment = investmentUSD[answers.investmentSize] || 10000000;
  
  if (userInvestment < fundMinTicket * 0.5) {
    checklist.push({
      id: 'aggregation',
      category: 'aggregation',
      text: 'Aggregate with similar projects or package as program to reach minimum ticket size',
      priority: 'medium',
    });
  }

  return checklist.slice(0, 6);
}

function computeTargetFundersNext(funds: Fund[], answers: QuestionnaireAnswers, nowPathway: string): TargetFunder[] {
  const userFundSectors = answers.sectors.flatMap(s => SECTOR_TO_FUND_SECTORS[s] || []);
  const isAdaptation = answers.sectors.includes('nature_based') || answers.sectors.includes('urban_resilience');
  
  const scoredFunds = funds
    .filter(fund => {
      if (fund.supportsPreparation) return false;
      if (nowPathway === 'multilateral' && fund.category === 'multilateral') return false;
      return fund.category === 'multilateral' || fund.category === 'domestic_bank';
    })
    .map(fund => {
      let score = 0;
      const reasons: string[] = [];
      
      const sectorMatch = fund.prioritySectors.some(ps => userFundSectors.includes(ps));
      if (sectorMatch) {
        score += 30;
        reasons.push(`Sector alignment with ${fund.prioritySectorsLabel.split(',')[0]}`);
      }
      
      const userBorrowerTypes = RECEIVER_TO_BORROWER[answers.fundingReceiver] || [answers.fundingReceiver];
      if (fund.eligibleBorrowers.some(b => userBorrowerTypes.includes(b))) {
        score += 25;
        reasons.push(`Eligible borrower type: ${answers.fundingReceiver.replace('_', ' ')}`);
      }
      
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
      
      if (userInvestment >= minTicket * 0.3 && userInvestment <= maxTicket * 2) {
        score += 20;
        if (userInvestment >= minTicket) {
          reasons.push(`Investment size fits ticket window (${fund.ticketWindowLabel})`);
        }
      }
      
      if (fund.instrumentType === 'loan' && answers.generatesRevenue !== 'no') {
        score += 15;
        reasons.push('Revenue potential supports loan repayment');
      }
      if (fund.instrumentType === 'grant' && (answers.generatesRevenue === 'no' || isAdaptation)) {
        score += 15;
        reasons.push('Grant structure fits public-good project nature');
      }
      
      if (fund.category === 'multilateral') {
        score += 10;
        reasons.push('MDB anchor provides concessional terms and technical support');
      }
      
      if (fund.id.includes('idb') || fund.id.includes('caf') || fund.id.includes('fonplata')) {
        score += 5;
        reasons.push('Regional focus on Latin America');
      }
      
      return { fund, score, reasons };
    })
    .filter(item => item.score >= 20 && item.reasons.length >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  
  return scoredFunds.map(({ fund, score, reasons }) => {
    const gapChecklist = generateGapChecklist(answers, fund);
    
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (score >= 60 && gapChecklist.length <= 2) confidence = 'high';
    else if (score < 40 || gapChecklist.length >= 5) confidence = 'low';
    
    return {
      fund,
      whyFitReasons: reasons.slice(0, 4),
      gapChecklist,
      confidence,
    };
  });
}

function generateBridgeParagraph(nowPathway: string, targetFunders: TargetFunder[]): string | null {
  if (targetFunders.length === 0) return null;
  
  const targetNames = targetFunders.map(t => t.fund.institution).join(' or ');
  const hasFeasibilityGap = targetFunders.some(t => 
    t.gapChecklist.some(c => c.category === 'feasibility')
  );
  const hasSafeguardsGap = targetFunders.some(t => 
    t.gapChecklist.some(c => c.category === 'safeguards')
  );
  
  if (nowPathway === 'preparation_facility') {
    if (hasFeasibilityGap && hasSafeguardsGap) {
      return `Use the recommended project preparation support to develop the feasibility studies and safeguard documents required by ${targetNames}. This creates a clear pathway from early-stage to investment-ready.`;
    } else if (hasFeasibilityGap) {
      return `The recommended preparation facilities can help you complete the feasibility work needed to approach ${targetNames} for implementation financing.`;
    } else if (hasSafeguardsGap) {
      return `Use PPF support to develop environmental and social safeguards aligned with ${targetNames} requirements.`;
    }
    return `The recommended preparation support will help position your project for future engagement with ${targetNames}.`;
  }
  
  if (nowPathway === 'grant') {
    return `The grant funding can help establish proof of concept and evidence base that strengthens future applications to ${targetNames}.`;
  }
  
  if (nowPathway === 'domestic_bank') {
    return `Successful implementation with domestic financing can create the track record and institutional capacity needed for larger ${targetNames} engagement.`;
  }
  
  return null;
}

export default function FunderSelectionPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const { isSampleMode, sampleActions } = useSampleData();
  const { isSampleRoute, routePrefix } = useSampleRoute();
  const { updateModule, loadContext } = useProjectContext();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [fundsData, setFundsData] = useState<FundsData | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [hasSavedToContext, setHasSavedToContext] = useState(false);
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({
    projectName: '',
    projectDescription: '',
    sectors: [],
    projectStage: '',
    existingElements: [],
    budgetPreparation: '',
    budgetImplementation: '',
    politicalMandatePlanRefs: [],
    politicalEndorsementLevel: '',
    implementingOwnership: '',
    internalAlignmentLevel: '',
    politicalRiskFactors: [],
    leadershipCommitmentConfidence: '',
    generatesRevenue: '',
    repaymentSource: '',
    investmentSize: '',
    fundingReceiver: '',
    canTakeDebt: '',
    nationalApproval: '',
    openToBundling: '',
  });

  const [showDecisionStep, setShowDecisionStep] = useState(false);
  const [selectedNowFundId, setSelectedNowFundId] = useState<string | null>(null);
  const [selectedNextFundId, setSelectedNextFundId] = useState<string | null>(null);
  const [fundingPlanConfirmed, setFundingPlanConfirmed] = useState(false);
  const [showAllFundsModal, setShowAllFundsModal] = useState<'now' | 'next' | null>(null);
  const [fundSearchQuery, setFundSearchQuery] = useState('');
  const [hydrationComplete, setHydrationComplete] = useState(false);
  const skipAutoSaveRef = useRef(false);

  const action = (isSampleMode || isSampleRoute) 
    ? sampleActions.find(a => a.id === projectId)
    : null;

  useEffect(() => {
    fetch('/sample-data/climate-funds.json')
      .then(res => res.json())
      .then(data => setFundsData(data))
      .catch(console.error);
  }, []);

  // Hydrate questionnaire from saved context or action defaults
  // Also auto-show results if questionnaire was already completed
  useEffect(() => {
    if (projectId) {
      const existingContext = loadContext(projectId);
      const savedQuestionnaire = existingContext?.funderSelection?.questionnaire as QuestionnaireAnswers | undefined;
      
      // Check if questionnaire was already completed (has key answers filled)
      const isQuestionnaireComplete = savedQuestionnaire?.projectStage &&
        savedQuestionnaire?.generatesRevenue;
      
      if (isQuestionnaireComplete) {
        setAnswers(savedQuestionnaire);
        // Auto-show results if questionnaire was already completed
        setShowResults(true);
      }
      
      // Always auto-populate project basics from action/shared context
      if (action) {
        setAnswers(prev => ({
          ...prev,
          projectName: action.name,
          projectDescription: action.description || '',
          sectors: action.type === 'adaptation' ? ['nature_based', 'urban_resilience'] : ['energy', 'transport'],
        }));
      }
    }
  }, [action, projectId]);
  
  const hydrateFromDB = useCallback(() => {
    if (!projectId || !fundsData) return;
    const dbProjectId = (isSampleMode || isSampleRoute) ? 'sample-porto-alegre-project' : projectId;
    console.log('[Hydration] Starting fetch from DB, projectId:', dbProjectId);
    
    fetch(`/api/projects/${dbProjectId}/blocks/funder_selection`)
      .then(res => res.ok ? res.json() : null)
      .then(result => {
        console.log('[Hydration] Got result:', result ? 'has data' : 'no data');
        if (result?.data) {
          const dbData = result.data as FunderSelectionData;
          const savedPlan = dbData.fundingPlan;
          console.log('[Hydration] savedPlan status:', savedPlan?.status);
          
          if (savedPlan && savedPlan.status === 'confirmed') {
            const nowFundExists = savedPlan.selectedFunderNow && fundsData.funds.some(f => f.id === savedPlan.selectedFunderNow);
            const nextFundExists = !savedPlan.selectedFunderNext || fundsData.funds.some(f => f.id === savedPlan.selectedFunderNext);
            console.log('[Hydration] nowFundExists:', nowFundExists, 'nextFundExists:', nextFundExists, 'selectedFunderNow:', savedPlan.selectedFunderNow);
            
            if (nowFundExists && nextFundExists) {
              skipAutoSaveRef.current = true;
              setSelectedNowFundId(savedPlan.selectedFunderNow);
              setSelectedNextFundId(savedPlan.selectedFunderNext || null);
              setFundingPlanConfirmed(true);
              setShowResults(true);
              setHasSavedToContext(true);
              
              if (dbData.questionnaire) {
                setAnswers(dbData.questionnaire as QuestionnaireAnswers);
              }
              console.log('[Hydration] SUCCESS - restored selectedFunderNow =', savedPlan.selectedFunderNow);
            }
          }
        }
        setHydrationComplete(true);
      })
      .catch(err => {
        console.error('[Hydration] FAILED:', err);
        setHydrationComplete(true);
      });
  }, [projectId, fundsData, isSampleMode, isSampleRoute]);

  // Hydrate funding plan selection state from DATABASE directly (not localStorage)
  useEffect(() => {
    if (projectId && fundsData && !hydrationComplete) {
      hydrateFromDB();
    }
  }, [projectId, fundsData, hydrationComplete, hydrateFromDB]);

  // Listen for AI-triggered block updates and re-hydrate
  useEffect(() => {
    const handleBlockUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ blockType: string; moduleName: string; data: unknown }>;
      if (customEvent.detail?.blockType === 'funder_selection') {
        console.log('[FunderSelection] Received nbs-block-updated event, re-hydrating...');
        hydrateFromDB();
      }
    };
    window.addEventListener('nbs-block-updated', handleBlockUpdate);
    return () => window.removeEventListener('nbs-block-updated', handleBlockUpdate);
  }, [hydrateFromDB]);

  const computedResults = useMemo(() => {
    if (!fundsData || !showResults) return null;
    
    const pathwayResult = determinePathway(answers);
    const pathway = fundsData.pathways[pathwayResult.primary];
    const secondaryPathway = pathwayResult.secondary ? fundsData.pathways[pathwayResult.secondary] : null;
    const recommendedFunds = rankFunds(fundsData.funds, answers, pathwayResult.primary);
    const targetFunders = computeTargetFundersNext(fundsData.funds, answers, pathwayResult.primary);
    const bridgeParagraph = generateBridgeParagraph(pathwayResult.primary, targetFunders);
    const readinessScores = computeReadinessScores(answers);
    
    return {
      pathwayResult,
      pathway,
      secondaryPathway,
      recommendedFunds,
      targetFunders,
      bridgeParagraph,
      readinessScores,
    };
  }, [fundsData, showResults, answers]);

  // Reset hasSavedToContext when answers change so autosave can run again
  const [lastSavedAnswers, setLastSavedAnswers] = useState<string>('');
  
  useEffect(() => {
    const answersKey = JSON.stringify(answers);
    if (lastSavedAnswers && answersKey !== lastSavedAnswers) {
      setHasSavedToContext(false);
    }
  }, [answers, lastSavedAnswers]);

  useEffect(() => {
    // Wait for hydration to complete before auto-saving to avoid overwriting confirmed data
    // Also check the ref as a synchronous guard against race conditions
    if (computedResults && projectId && !hasSavedToContext && !fundingPlanConfirmed && hydrationComplete && !skipAutoSaveRef.current) {
      const { pathwayResult, recommendedFunds, targetFunders, bridgeParagraph } = computedResults;
      
      updateModule('funderSelection', {
        status: 'READY',
        questionnaire: answers,
        pathway: {
          primary: pathwayResult.primary,
          secondary: pathwayResult.secondary,
          readinessLevel: pathwayResult.readinessLevel,
          limitingFactors: pathwayResult.limitingFactorKeys,
        },
        selectedFunds: recommendedFunds.map(f => f.id),
        shortlistedFunds: recommendedFunds.map(f => f.id),
        targetFunders: targetFunders.map(tf => ({
          fundId: tf.fund.id,
          fundName: tf.fund.name,
          institution: tf.fund.institution,
          instrumentType: tf.fund.instrumentType,
          whyFitReasons: tf.whyFitReasons,
          gapChecklist: tf.gapChecklist,
          confidence: tf.confidence,
        })),
        bridgeParagraph: bridgeParagraph || undefined,
      });
      setHasSavedToContext(true);
      setLastSavedAnswers(JSON.stringify(answers));
    }
  }, [computedResults, projectId, hasSavedToContext, fundingPlanConfirmed, hydrationComplete, answers, updateModule]);

  const steps = [
    { id: 'readiness', title: t('funderSelection.steps.readiness'), icon: Check },
    { id: 'political', title: t('funderSelection.steps.political'), icon: Shield },
    { id: 'financing', title: t('funderSelection.steps.financing'), icon: DollarSign },
    { id: 'institutional', title: t('funderSelection.steps.institutional'), icon: Building2 },
  ];

  const assessFundFit = (fund: Fund): { fit: 'high' | 'medium' | 'low'; warnings: string[] } => {
    const warnings: string[] = [];
    let score = 100;
    
    const userFundSectors = answers.sectors.flatMap(s => SECTOR_TO_FUND_SECTORS[s] || []);
    const sectorMatch = fund.prioritySectors.some(ps => userFundSectors.includes(ps));
    if (!sectorMatch) {
      warnings.push(t('funderSelection.warnings.sectorMismatch'));
      score -= 30;
    }
    
    const canBorrow = answers.canTakeDebt === 'yes';
    if (fund.instrumentType === 'loan' && !canBorrow) {
      warnings.push(t('funderSelection.warnings.borrowingRequired'));
      score -= 40;
    }
    
    const isEarlyStage = ['idea', 'concept', 'prefeasibility'].includes(answers.projectStage);
    if (fund.requiresFeasibility && isEarlyStage) {
      warnings.push(t('funderSelection.warnings.feasibilityRequired'));
      score -= 25;
    }
    
    if (fund.requiresSovereignGuarantee && answers.nationalApproval === 'no') {
      warnings.push(t('funderSelection.warnings.sovereignRequired'));
      score -= 20;
    }
    
    return {
      fit: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
      warnings,
    };
  };

  const confirmFundingPlan = () => {
    if (!computedResults || !projectId) return;
    
    const selectedNowFund = fundsData?.funds.find(f => f.id === selectedNowFundId);
    const selectedNextFund = fundsData?.funds.find(f => f.id === selectedNextFundId);
    const isNowOverride = selectedNowFundId && !computedResults.recommendedFunds.slice(0, 3).some(f => f.id === selectedNowFundId);
    const isNextOverride = selectedNextFundId && !computedResults.targetFunders.some(tf => tf.fund.id === selectedNextFundId);
    
    const nowFitAssessment = selectedNowFund ? assessFundFit(selectedNowFund) : { fit: 'high' as const, warnings: [] };
    const nextFitAssessment = selectedNextFund ? assessFundFit(selectedNextFund) : { fit: 'n/a' as const, warnings: [] };
    
    const fundingPlan = {
      planId: `plan_${Date.now()}`,
      status: 'confirmed' as const,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      version: 1,
      selectedPathwayCategoryNow: computedResults.pathwayResult.primary,
      selectedFunderNow: selectedNowFundId,
      selectedFunderNowName: selectedNowFund?.name || null,
      selectedPathwayCategoryNext: computedResults.pathwayResult.secondary || null,
      selectedFunderNext: selectedNextFundId,
      selectedFunderNextName: selectedNextFund?.name || null,
      selectionRationale: `Selected ${selectedNowFund?.name || 'no immediate funder'} as anchor funder based on ${isNowOverride ? 'user preference' : 'system recommendation'}.`,
      selectionSourceNow: (isNowOverride ? 'user_override' : 'recommended') as 'recommended' | 'user_override',
      selectionSourceNext: (selectedNextFundId ? (isNextOverride ? 'user_override' : 'recommended') : 'none') as 'recommended' | 'user_override' | 'none',
      systemFitAssessmentNow: nowFitAssessment.fit,
      systemFitAssessmentNext: selectedNextFundId ? nextFitAssessment.fit : 'n/a' as const,
      systemWarnings: [...nowFitAssessment.warnings, ...nextFitAssessment.warnings],
      recommendedNowTop3: computedResults.recommendedFunds.slice(0, 3).map(f => f.id),
      recommendedNextTargets: computedResults.targetFunders.map(tf => tf.fund.id),
      profileVersionUsed: 1,
      profileSnapshot: {
        projectStage: answers.projectStage,
        sectors: answers.sectors,
        investmentSize: answers.investmentSize,
        canTakeDebt: answers.canTakeDebt,
        generatesRevenue: answers.generatesRevenue,
      },
    };
    
    const fundingProfile = {
      profileId: `profile_${Date.now()}`,
      status: 'completed' as const,
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      version: 1,
      questionnaire: answers,
      derived: {
        financialReadinessLevel: answers.canTakeDebt === 'yes' ? 'loan_possible_domestic' as const : 'grant_only' as const,
        capitalReadiness: answers.existingElements.includes('capex') ? 'high' as const : 'low' as const,
        safeguardsReadiness: answers.existingElements.includes('assessments') ? 'high' as const : 'low' as const,
      },
    };
    
    updateModule('funderSelection', {
      status: 'READY',
      funderName: selectedNowFund?.name,
      questionnaire: answers,
      pathway: {
        primary: computedResults.pathwayResult.primary,
        secondary: computedResults.pathwayResult.secondary,
        readinessLevel: computedResults.pathwayResult.readinessLevel,
        limitingFactors: computedResults.pathwayResult.limitingFactorKeys,
      },
      selectedFunds: selectedNowFundId ? [selectedNowFundId] : [],
      shortlistedFunds: computedResults.recommendedFunds.slice(0, 3).map(f => f.id),
      targetFunders: computedResults.targetFunders.map(tf => ({
        fundId: tf.fund.id,
        fundName: tf.fund.name,
        institution: tf.fund.institution,
        instrumentType: tf.fund.instrumentType,
        whyFitReasons: tf.whyFitReasons,
        gapChecklist: tf.gapChecklist,
        confidence: tf.confidence,
      })),
      bridgeParagraph: computedResults.bridgeParagraph || undefined,
      fundingPlan,
      fundingProfile,
    });
    
    setFundingPlanConfirmed(true);
  };

  const editFundingPlan = () => {
    setFundingPlanConfirmed(false);
  };

  const retakeQuestionnaire = () => {
    // Go back to questionnaire while preserving existing answers for editing
    setShowResults(false);
    setCurrentStep(0);
    setFundingPlanConfirmed(false);
    // Keep selected funds and answers intact so user can edit them
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return answers.projectStage && answers.budgetPreparation;
      case 1: return answers.politicalMandatePlanRefs.length > 0 && answers.politicalEndorsementLevel && answers.implementingOwnership && answers.internalAlignmentLevel && answers.politicalRiskFactors.length > 0 && answers.leadershipCommitmentConfidence;
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

  const toggleArrayAnswer = (key: 'sectors' | 'existingElements' | 'politicalMandatePlanRefs' | 'politicalRiskFactors', value: string) => {
    setAnswers(prev => {
      const current = prev[key];
      // Handle "none" special case for multi-selects
      if (value === 'none' || value === 'not_in_official_plan') {
        return { ...prev, [key]: current.includes(value) ? [] : [value] };
      }
      const filtered = current.filter(v => v !== 'none' && v !== 'not_in_official_plan');
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

      case 1:
        // Political Mandate & Leadership Readiness
        const PLAN_REF_IDS = ['city_climate_plan', 'sectoral_plan', 'multi_year_investment_plan', 'national_or_state_plan', 'not_in_official_plan'];
        const ENDORSEMENT_IDS = ['written', 'informal', 'none', 'unknown'];
        const OWNERSHIP_IDS = ['single_department', 'multiple_departments', 'not_defined'];
        const ALIGNMENT_IDS = ['high', 'medium', 'low', 'unknown'];
        const RISK_FACTOR_IDS = ['upcoming_elections', 'land_resettlement', 'tariff_sensitivity', 'public_opposition', 'none'];
        const COMMITMENT_IDS = ['high', 'medium', 'low', 'unknown'];
        
        return (
          <div className="space-y-6">
            <div>
              <Label>{t('funderSelection.political.planRefs')}</Label>
              <p className="text-sm text-muted-foreground mb-2">{t('funderSelection.political.planRefsHint')}</p>
              <div className="space-y-2 mt-2">
                {PLAN_REF_IDS.map(id => (
                  <div key={id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`plan-${id}`}
                      checked={answers.politicalMandatePlanRefs.includes(id)}
                      onCheckedChange={() => toggleArrayAnswer('politicalMandatePlanRefs', id)}
                    />
                    <Label htmlFor={`plan-${id}`} className="text-sm font-normal cursor-pointer">
                      {t(`funderSelection.political.planRefOptions.${id}`)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <Label>{t('funderSelection.political.endorsement')}</Label>
              <RadioGroup
                value={answers.politicalEndorsementLevel}
                onValueChange={(v) => updateAnswer('politicalEndorsementLevel', v)}
                className="mt-2 space-y-2"
              >
                {ENDORSEMENT_IDS.map(id => (
                  <div key={id} className="flex items-center space-x-2">
                    <RadioGroupItem value={id} id={`endorse-${id}`} />
                    <Label htmlFor={`endorse-${id}`} className="text-sm font-normal cursor-pointer">
                      {t(`funderSelection.political.endorsementOptions.${id}`)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            
            <div>
              <Label>{t('funderSelection.political.ownership')}</Label>
              <RadioGroup
                value={answers.implementingOwnership}
                onValueChange={(v) => updateAnswer('implementingOwnership', v)}
                className="mt-2 space-y-2"
              >
                {OWNERSHIP_IDS.map(id => (
                  <div key={id} className="flex items-center space-x-2">
                    <RadioGroupItem value={id} id={`owner-${id}`} />
                    <Label htmlFor={`owner-${id}`} className="text-sm font-normal cursor-pointer">
                      {t(`funderSelection.political.ownershipOptions.${id}`)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            
            <div>
              <Label>{t('funderSelection.political.alignment')}</Label>
              <RadioGroup
                value={answers.internalAlignmentLevel}
                onValueChange={(v) => updateAnswer('internalAlignmentLevel', v)}
                className="mt-2 space-y-2"
              >
                {ALIGNMENT_IDS.map(id => (
                  <div key={id} className="flex items-center space-x-2">
                    <RadioGroupItem value={id} id={`align-${id}`} />
                    <Label htmlFor={`align-${id}`} className="text-sm font-normal cursor-pointer">
                      {t(`funderSelection.political.alignmentOptions.${id}`)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            
            <div>
              <Label>{t('funderSelection.political.riskFactors')}</Label>
              <p className="text-sm text-muted-foreground mb-2">{t('funderSelection.political.riskFactorsHint')}</p>
              <div className="space-y-2 mt-2">
                {RISK_FACTOR_IDS.map(id => (
                  <div key={id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`risk-${id}`}
                      checked={answers.politicalRiskFactors.includes(id)}
                      onCheckedChange={() => toggleArrayAnswer('politicalRiskFactors', id)}
                    />
                    <Label htmlFor={`risk-${id}`} className="text-sm font-normal cursor-pointer">
                      {t(`funderSelection.political.riskFactorOptions.${id}`)}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <Label>{t('funderSelection.political.commitment')}</Label>
              <RadioGroup
                value={answers.leadershipCommitmentConfidence}
                onValueChange={(v) => updateAnswer('leadershipCommitmentConfidence', v)}
                className="mt-2 space-y-2"
              >
                {COMMITMENT_IDS.map(id => (
                  <div key={id} className="flex items-center space-x-2">
                    <RadioGroupItem value={id} id={`commit-${id}`} />
                    <Label htmlFor={`commit-${id}`} className="text-sm font-normal cursor-pointer">
                      {t(`funderSelection.political.commitmentOptions.${id}`)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
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
    if (!computedResults) return null;

    const { pathwayResult, pathway, secondaryPathway, recommendedFunds, targetFunders, bridgeParagraph, readinessScores } = computedResults;
    const { readinessLevel, limitingFactorKeys } = pathwayResult;

    const readinessLabels: Record<string, { label: string; color: string }> = {
      very_early: { label: t('funderSelection.readiness.veryEarly'), color: 'bg-red-100 text-red-800' },
      emerging: { label: t('funderSelection.readiness.emerging'), color: 'bg-yellow-100 text-yellow-800' },
      investable: { label: t('funderSelection.readiness.investable'), color: 'bg-green-100 text-green-800' },
      advanced: { label: t('funderSelection.readiness.advanced'), color: 'bg-blue-100 text-blue-800' },
    };

    const confidenceLabels: Record<string, { label: string; color: string }> = {
      high: { label: t('funderSelection.confidence.high'), color: 'bg-green-100 text-green-800' },
      medium: { label: t('funderSelection.confidence.medium'), color: 'bg-yellow-100 text-yellow-800' },
      low: { label: t('funderSelection.confidence.low'), color: 'bg-orange-100 text-orange-800' },
    };

    return (
      <div className="space-y-6">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-2">
                <Badge variant="secondary" className="w-fit">{t('funderSelection.results.nowLabel')}</Badge>
                <div className="p-2 bg-primary/10 rounded-lg">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
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
              <span className="text-sm font-medium">{t('funderSelection.results.overallReadiness')}:</span>
              <span className="text-lg font-bold">{readinessScores.overall}/100</span>
              <Badge className={readinessLabels[readinessScores.overallLabel]?.color || 'bg-gray-100 text-gray-800'}>
                {readinessLabels[readinessScores.overallLabel]?.label || readinessScores.overallLabel}
              </Badge>
            </div>
            
            <div className="grid grid-cols-3 gap-4 pt-2 border-t">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">{t('funderSelection.results.technicalReadiness')}</p>
                <p className="text-lg font-semibold">{readinessScores.technical}/100</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">{t('funderSelection.results.financialReadiness')}</p>
                <p className="text-lg font-semibold">{readinessScores.financial}/100</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">{t('funderSelection.results.politicalReadiness')}</p>
                <p className="text-lg font-semibold">{readinessScores.political}/100</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t('funderSelection.results.mandateStrength')}:</span>
                <Badge variant="outline" className={
                  readinessScores.mandateStrength === 'strong' ? 'border-green-500 text-green-700' :
                  readinessScores.mandateStrength === 'moderate' ? 'border-yellow-500 text-yellow-700' :
                  'border-red-500 text-red-700'
                }>
                  {t(`funderSelection.results.mandateStrengthOptions.${readinessScores.mandateStrength}`)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{t('funderSelection.results.durabilityRisk')}:</span>
                <Badge variant="outline" className={
                  readinessScores.durabilityRisk === 'low' ? 'border-green-500 text-green-700' :
                  readinessScores.durabilityRisk === 'medium' ? 'border-yellow-500 text-yellow-700' :
                  'border-red-500 text-red-700'
                }>
                  {t(`funderSelection.results.durabilityRiskOptions.${readinessScores.durabilityRisk}`)}
                </Badge>
              </div>
            </div>
            
            {limitingFactorKeys.length > 0 && (
              <div className="pt-2 border-t">
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
              <>
                {recommendedFunds.map((fund, index) => {
                  const isSelected = selectedNowFundId === fund.id;
                  return (
                    <div 
                      key={fund.id} 
                      className={`border rounded-lg p-4 space-y-3 transition-all ${
                        isSelected 
                          ? 'border-green-500 bg-green-50 ring-2 ring-green-200' 
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">#{index + 1}</Badge>
                            <h4 className="font-medium">{fund.name}</h4>
                            {isSelected && (
                              <Badge className="bg-green-600">
                                <Check className="h-3 w-3 mr-1" />
                                {t('funderSelection.decision.selected')}
                              </Badge>
                            )}
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
                      <div className="flex items-center justify-between pt-2 border-t">
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
                        {!fund.officialLink && <div />}
                        {isSelected ? (
                          <Button 
                            type="button"
                            variant="outline" 
                            size="sm"
                            onClick={() => setSelectedNowFundId(null)}
                          >
                            {t('funderSelection.decision.deselect')}
                          </Button>
                        ) : (
                          <Button 
                            type="button"
                            size="sm"
                            onClick={() => setSelectedNowFundId(fund.id)}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            {t('funderSelection.decision.selectThisFund')}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {/* Show selected fund if not in top 3 */}
                {selectedNowFundId && !recommendedFunds.some(f => f.id === selectedNowFundId) && fundsData && (
                  (() => {
                    const selectedFund = fundsData.funds.find(f => f.id === selectedNowFundId);
                    if (!selectedFund) return null;
                    return (
                      <div 
                        className="border-2 border-green-500 bg-green-50 ring-2 ring-green-200 rounded-lg p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="border-green-500 text-green-700">{t('funderSelection.decision.yourSelection')}</Badge>
                              <h4 className="font-medium">{selectedFund.name}</h4>
                              <Badge className="bg-green-600">
                                <Check className="h-3 w-3 mr-1" />
                                {t('funderSelection.decision.selected')}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{selectedFund.institution}</p>
                          </div>
                          <Badge>{selectedFund.instrumentLabel}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{selectedFund.description}</p>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">{t('funderSelection.results.ticketSize')}:</span>
                            <p className="text-muted-foreground">{selectedFund.ticketWindowLabel}</p>
                          </div>
                          <div>
                            <span className="font-medium">{t('funderSelection.results.terms')}:</span>
                            <p className="text-muted-foreground">{selectedFund.tenorGrace}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t">
                          {selectedFund.officialLink && (
                            <a
                              href={selectedFund.officialLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              {t('funderSelection.results.learnMore')}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {!selectedFund.officialLink && <div />}
                          <Button 
                            type="button"
                            variant="outline" 
                            size="sm"
                            onClick={() => setSelectedNowFundId(null)}
                          >
                            {t('funderSelection.decision.deselect')}
                          </Button>
                        </div>
                      </div>
                    );
                  })()
                )}
                
                {/* See more options button */}
                <Button 
                  type="button"
                  variant="ghost" 
                  className="w-full text-muted-foreground"
                  onClick={() => setShowAllFundsModal('now')}
                >
                  <Search className="h-4 w-4 mr-2" />
                  {t('funderSelection.decision.seeMoreOptions')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {targetFunders.length > 0 && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-2">
                  <Badge variant="secondary" className="w-fit bg-blue-100 text-blue-700">{t('funderSelection.results.nextLabel')}</Badge>
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Target className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <div>
                  <CardTitle>{t('funderSelection.results.strategicTargets')}</CardTitle>
                  <CardDescription>
                    {t('funderSelection.results.strategicTargetsDescription')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {targetFunders.map((target, index) => {
                const isSelectedNext = selectedNextFundId === target.fund.id;
                return (
                  <div 
                    key={target.fund.id} 
                    className={`border rounded-lg p-4 bg-white space-y-4 transition-all ${
                      isSelectedNext 
                        ? 'border-blue-500 ring-2 ring-blue-200' 
                        : 'border-blue-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="border-blue-300 text-blue-700">
                            {t('funderSelection.results.target')} {index + 1}
                          </Badge>
                          <h4 className="font-medium">{target.fund.name}</h4>
                          {isSelectedNext && (
                            <Badge className="bg-blue-600">
                              <Check className="h-3 w-3 mr-1" />
                              {t('funderSelection.decision.selected')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{target.fund.institution}</p>
                      </div>
                      <Badge className={`${confidenceLabels[target.confidence].color} whitespace-nowrap flex-shrink-0`}>
                        {confidenceLabels[target.confidence].label}
                      </Badge>
                    </div>
                    
                    <div>
                      <h5 className="text-sm font-medium mb-2 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        {t('funderSelection.results.whyFit')}
                      </h5>
                      <ul className="space-y-1">
                        {target.whyFitReasons.map((reason, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-600" />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {target.gapChecklist.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium mb-2 flex items-center gap-1">
                          <ArrowUpRight className="h-4 w-4 text-amber-600" />
                          {t('funderSelection.results.whatToPrepare')}
                        </h5>
                        <ul className="space-y-1">
                          {target.gapChecklist.map((item) => (
                            <li key={item.id} className="text-sm text-muted-foreground flex items-start gap-2">
                              <Badge variant="outline" className={`text-xs px-1 py-0 ${
                                item.priority === 'high' ? 'border-red-300 text-red-700' : 
                                item.priority === 'medium' ? 'border-amber-300 text-amber-700' : 
                                'border-gray-300 text-gray-600'
                              }`}>
                                {item.priority === 'high' ? '!' : item.priority === 'medium' ? '~' : '○'}
                              </Badge>
                              {item.text}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t">
                      {target.fund.officialLink ? (
                        <a
                          href={target.fund.officialLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          {t('funderSelection.results.learnMore')}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <div />
                      )}
                      {isSelectedNext ? (
                        <Button 
                          type="button"
                          variant="outline" 
                          size="sm"
                          onClick={() => setSelectedNextFundId(null)}
                        >
                          {t('funderSelection.decision.deselect')}
                        </Button>
                      ) : (
                        <Button 
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-blue-300 text-blue-700 hover:bg-blue-100"
                          onClick={() => setSelectedNextFundId(target.fund.id)}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          {t('funderSelection.decision.selectAsTarget')}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              
              {/* See more target options button */}
              <Button 
                type="button"
                variant="ghost" 
                className="w-full text-muted-foreground"
                onClick={() => setShowAllFundsModal('next')}
              >
                <Search className="h-4 w-4 mr-2" />
                {t('funderSelection.decision.seeMoreTargets')}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Confirm Funding Plan - Floating Summary */}
        {(selectedNowFundId || fundingPlanConfirmed) && (
          <Card className={`mt-6 ${fundingPlanConfirmed ? 'border-green-500 bg-green-50' : 'border-primary/30 bg-primary/5'}`}>
            <CardContent className="pt-6">
              {fundingPlanConfirmed ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-green-100 rounded-lg">
                    <Lock className="h-5 w-5 text-green-700" />
                    <span className="font-medium text-green-800">{t('funderSelection.decision.confirmed')}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedNowFundId && (
                      <div className="p-4 border border-green-200 rounded-lg bg-white">
                        <p className="text-sm text-muted-foreground">{t('funderSelection.decision.anchorFunder')}:</p>
                        <p className="font-medium">{fundsData?.funds.find(f => f.id === selectedNowFundId)?.name}</p>
                      </div>
                    )}
                    {selectedNextFundId && (
                      <div className="p-4 border border-blue-200 rounded-lg bg-white">
                        <p className="text-sm text-muted-foreground">{t('funderSelection.decision.targetFunder')}:</p>
                        <p className="font-medium">{fundsData?.funds.find(f => f.id === selectedNextFundId)?.name}</p>
                      </div>
                    )}
                  </div>
                  <Button type="button" variant="outline" onClick={editFundingPlan} className="w-full">
                    <Edit2 className="h-4 w-4 mr-2" />
                    {t('funderSelection.decision.edit')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 border rounded-lg bg-white">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">{t('funderSelection.decision.anchorFunder')}:</p>
                        <p className="font-medium">{fundsData?.funds.find(f => f.id === selectedNowFundId)?.name}</p>
                      </div>
                    </div>
                    {selectedNextFundId && (
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-muted-foreground">{t('funderSelection.decision.targetFunder')}:</p>
                          <p className="font-medium">{fundsData?.funds.find(f => f.id === selectedNextFundId)?.name}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <Button 
                    type="button"
                    onClick={confirmFundingPlan} 
                    className="w-full"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    {t('funderSelection.decision.confirm')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  const renderAllFundsModal = () => {
    if (!showAllFundsModal || !fundsData) return null;
    
    const filteredFunds = fundsData.funds.filter(f => 
      f.name.toLowerCase().includes(fundSearchQuery.toLowerCase()) ||
      f.institution.toLowerCase().includes(fundSearchQuery.toLowerCase())
    );
    
    return (
      <div 
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onClick={() => {
          setShowAllFundsModal(null);
          setFundSearchQuery('');
        }}
      >
        <Card 
          className="w-full max-w-2xl max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{t('funderSelection.decision.allFunds')}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowAllFundsModal(null)}>
                ×
              </Button>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('funderSelection.decision.searchFunds')}
                value={fundSearchQuery}
                onChange={(e) => setFundSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            <div className="space-y-2">
              {filteredFunds.map(fund => {
                const fitAssessment = assessFundFit(fund);
                const fitColors = {
                  high: 'bg-green-100 text-green-800',
                  medium: 'bg-yellow-100 text-yellow-800',
                  low: 'bg-red-100 text-red-800',
                };
                
                return (
                  <div
                    key={fund.id}
                    onClick={() => {
                      if (showAllFundsModal === 'now') {
                        setSelectedNowFundId(fund.id);
                      } else {
                        setSelectedNextFundId(fund.id);
                      }
                      setShowAllFundsModal(null);
                      setFundSearchQuery('');
                    }}
                    className="p-3 border rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{fund.name}</p>
                        <p className="text-sm text-muted-foreground">{fund.institution}</p>
                        <p className="text-xs text-muted-foreground mt-1">{fund.ticketWindowLabel}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge>{fund.instrumentLabel}</Badge>
                        <Badge className={`${fitColors[fitAssessment.fit]} whitespace-nowrap`}>{t(`funderSelection.fit.${fitAssessment.fit}`)}</Badge>
                      </div>
                    </div>
                    {fitAssessment.warnings.length > 0 && (
                      <div className="mt-2 pt-2 border-t">
                        <ul className="text-xs text-amber-700 space-y-1">
                          {fitAssessment.warnings.slice(0, 2).map((w, i) => (
                            <li key={i} className="flex items-start gap-1">
                              <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                              {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
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
              <Button variant="ghost" onClick={retakeQuestionnaire}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('funderSelection.retakeQuestionnaire')}
              </Button>
              <Link href={`${routePrefix}/project/${projectId}`}>
                <Button disabled={!fundingPlanConfirmed}>
                  {fundingPlanConfirmed ? t('funderSelection.backToProject') : t('funderSelection.confirmFirst')}
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
      {renderAllFundsModal()}
    </div>
  );
}
