export interface QuestionnaireAnswers {
  projectName: string;
  projectDescription: string;
  sectors: string[];
  projectStage: string;
  existingElements: string[];
  budgetPreparation: string;
  budgetImplementation: string;
  politicalMandatePlanRefs: string[];
  politicalEndorsementLevel: string;
  implementingOwnership: string;
  internalAlignmentLevel: string;
  politicalRiskFactors: string[];
  leadershipCommitmentConfidence: string;
  generatesRevenue: string;
  repaymentSource: string;
  investmentSize: string;
  fundingReceiver: string;
  canTakeDebt: string;
  nationalApproval: string;
  openToBundling: string;
}

export interface ReadinessScores {
  technical: number;
  financial: number;
  political: number;
  overall: number;
  overallLabel: 'very_early' | 'emerging' | 'investable' | 'advanced';
  mandateStrength: 'weak' | 'moderate' | 'strong';
  durabilityRisk: 'low' | 'medium' | 'high';
}

export interface PathwayResult {
  primary: string;
  secondary?: string;
  readinessLevel: string;
  limitingFactorKeys: string[];
}

export function determinePathway(answers: Partial<QuestionnaireAnswers>): PathwayResult {
  const limitingFactorKeys: string[] = [];
  let readinessLevel = 'very_early';
  
  const projectStage = answers.projectStage || 'idea';
  const existingElements = answers.existingElements || [];
  const sectors = answers.sectors || [];
  const investmentSize = answers.investmentSize || 'unknown';
  
  const isEarlyStage = ['idea', 'concept', 'prefeasibility'].includes(projectStage);
  const hasFeasibility = ['feasibility', 'procurement'].includes(projectStage);
  const missingCapex = !existingElements.includes('capex');
  const missingAssessments = !existingElements.includes('assessments');
  const noBudgetForPrep = answers.budgetPreparation === 'no';
  const noRevenue = answers.generatesRevenue === 'no';
  const isAdaptation = sectors.includes('nature_based') || sectors.includes('urban_resilience');
  const canBorrow = answers.canTakeDebt === 'yes';
  const openToBundling = answers.openToBundling === 'yes' || answers.openToBundling === 'maybe';
  
  const investmentSizeSmall = ['under_1m', '1_5m'].includes(investmentSize);
  const investmentSizeLarge = ['20_50m', 'over_50m'].includes(investmentSize);

  if (isEarlyStage) limitingFactorKeys.push('earlyStage');
  if (missingCapex) limitingFactorKeys.push('missingCapex');
  if (missingAssessments) limitingFactorKeys.push('missingAssessments');
  if (noBudgetForPrep) limitingFactorKeys.push('noBudgetPrep');
  if (noRevenue && !isAdaptation) limitingFactorKeys.push('noRevenue');
  if (!canBorrow && answers.canTakeDebt !== 'not_sure') limitingFactorKeys.push('cannotBorrow');

  if (hasFeasibility && !missingCapex && !missingAssessments) {
    readinessLevel = projectStage === 'procurement' ? 'advanced' : 'investable';
  } else if (projectStage === 'prefeasibility' || (projectStage === 'concept' && existingElements.length >= 3)) {
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

export function computeReadinessScores(answers: Partial<QuestionnaireAnswers>): ReadinessScores {
  let technical = 0;
  const stage = answers.projectStage || 'idea';
  if (stage === 'procurement') technical = 100;
  else if (stage === 'feasibility') technical = 75;
  else if (stage === 'prefeasibility') technical = 50;
  else if (stage === 'concept') technical = 25;
  else technical = 10;
  
  const existingElements = answers.existingElements || [];
  const elementCount = existingElements.filter(e => e !== 'none').length;
  technical = Math.min(100, technical + elementCount * 5);
  
  let financial = 0;
  if (answers.generatesRevenue === 'yes') financial += 30;
  else if (answers.generatesRevenue === 'not_sure') financial += 15;
  
  if (answers.budgetPreparation === 'yes') financial += 20;
  if (answers.budgetImplementation === 'yes') financial += 20;
  else if (answers.budgetImplementation === 'partial') financial += 10;
  
  if (answers.canTakeDebt === 'yes') financial += 20;
  else if (answers.canTakeDebt === 'not_sure') financial += 10;
  
  if (answers.repaymentSource && answers.repaymentSource !== 'not_defined') financial += 10;
  
  let political = 0;
  
  const planRefs = answers.politicalMandatePlanRefs || [];
  const hasPlanRef = planRefs.some(p => 
    ['city_climate_plan', 'sectoral_plan', 'multi_year_investment_plan', 'national_or_state_plan'].includes(p)
  );
  if (hasPlanRef) political += 20;
  
  const endorsement = answers.politicalEndorsementLevel || '';
  if (endorsement === 'written') political += 20;
  else if (endorsement === 'informal') political += 10;
  
  const ownership = answers.implementingOwnership || '';
  if (ownership === 'single_department') political += 15;
  else if (ownership === 'multiple_departments') political += 10;
  
  const alignment = answers.internalAlignmentLevel || '';
  if (alignment === 'high') political += 25;
  else if (alignment === 'medium') political += 15;
  else if (alignment === 'unknown') political += 5;
  
  const commitment = answers.leadershipCommitmentConfidence || '';
  if (commitment === 'high') political += 20;
  else if (commitment === 'medium') political += 10;
  else if (commitment === 'unknown') political += 5;
  
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
  penalty = Math.min(20, penalty);
  political = Math.max(0, Math.min(100, political - penalty));
  
  let mandateStrength: 'weak' | 'moderate' | 'strong' = 'weak';
  if (hasPlanRef && endorsement === 'written') mandateStrength = 'strong';
  else if (hasPlanRef || endorsement === 'informal') mandateStrength = 'moderate';
  
  const riskCount = riskFactors.filter(r => r !== 'none').length;
  let durabilityRisk: 'low' | 'medium' | 'high' = 'medium';
  if (commitment === 'low' || alignment === 'low' || riskCount >= 2) durabilityRisk = 'high';
  else if (commitment === 'medium' || riskCount === 1) durabilityRisk = 'medium';
  else if (commitment === 'high' && alignment === 'high' && riskCount === 0) durabilityRisk = 'low';
  
  const overall = Math.round(0.4 * technical + 0.4 * financial + 0.2 * political);
  
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

export function formatReadinessSummary(scores: ReadinessScores, pathway: PathwayResult): string {
  const labelMap: Record<string, string> = {
    very_early: 'Very Early Stage',
    emerging: 'Emerging',
    investable: 'Investable',
    advanced: 'Advanced',
  };

  const pathwayMap: Record<string, string> = {
    preparation_facility: 'Project Preparation Facility',
    grant: 'Grant Funding',
    domestic_bank: 'Domestic Bank Financing',
    multilateral: 'Multilateral Development Bank',
    aggregation: 'Aggregation/Bundling',
  };

  const mandateMap: Record<string, string> = {
    weak: 'Needs strengthening',
    moderate: 'Moderate',
    strong: 'Strong',
  };

  const riskMap: Record<string, string> = {
    low: 'Low risk',
    medium: 'Medium risk',
    high: 'High risk',
  };

  let summary = `**Funding Readiness Updated**\n\n`;
  summary += `**Overall Score: ${scores.overall}/100** (${labelMap[scores.overallLabel]})\n\n`;
  
  summary += `**Readiness Breakdown:**\n`;
  summary += `• Technical: ${scores.technical}/100\n`;
  summary += `• Financial: ${scores.financial}/100\n`;
  summary += `• Political: ${scores.political}/100\n\n`;
  
  summary += `**Political Indicators:**\n`;
  summary += `• Mandate strength: ${mandateMap[scores.mandateStrength]}\n`;
  summary += `• Durability risk: ${riskMap[scores.durabilityRisk]}\n\n`;
  
  summary += `**Recommended Pathway:** ${pathwayMap[pathway.primary] || pathway.primary}`;
  if (pathway.secondary) {
    summary += ` (with ${pathwayMap[pathway.secondary] || pathway.secondary} as secondary option)`;
  }
  
  return summary;
}
