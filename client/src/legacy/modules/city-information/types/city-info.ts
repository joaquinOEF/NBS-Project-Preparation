// Types for CityCatalyst city information data
export interface CityCatalystInventory {
  year: number;
  id?: string;
}

export interface CityCatalystCityDetail {
  locode: string;
  name: string;
  country?: string;
  inventories?: CityCatalystInventory[];
  metadata?: Record<string, any>;
}

export interface CityCatalystInventoryData {
  // This will be populated as we discover the actual API structure
  [key: string]: any;
  sectors?: GPCSector[];
  total?: number;
  year?: number;
}

export interface GPCSector {
  id: string;
  name: string;
  emissions?: number;
  subsectors?: GPCSubsector[];
}

export interface GPCSubsector {
  id: string;
  name: string;
  emissions?: number;
  data?: any[];
}

export interface CityBoundary {
  type: 'Feature';
  properties: Record<string, any>;
  geometry: {
    type: string;
    coordinates: any;
  };
}

export interface CityInventorySummary {
  locode: string;
  name: string;
  years: number[];
  inventories: CityCatalystInventory[];
}

// CCRA (Climate Change Risk Assessment) Dashboard Types
export interface CCRADashboardData {
  // Flexible structure to accommodate various CCRA data formats
  [key: string]: any;

  // Common CCRA fields that might be present
  hazards?: ClimateHazard[];
  vulnerabilities?: VulnerabilityAssessment[];
  riskScores?: RiskScore[];
  adaptationMeasures?: AdaptationMeasure[];
  assessmentSummary?: AssessmentSummary;
}

export interface ClimateHazard {
  id: string;
  name: string;
  type: string;
  severity?: string | number;
  likelihood?: string | number;
  description?: string;
}

export interface VulnerabilityAssessment {
  sector: string;
  vulnerabilityLevel: string | number;
  description?: string;
  affectedPopulation?: number;
}

export interface RiskScore {
  category: string;
  score: number;
  level: 'Low' | 'Medium' | 'High' | 'Critical';
  description?: string;
}

export interface AdaptationMeasure {
  id: string;
  title: string;
  description: string;
  category: string;
  priority?: string;
  status?: string;
  estimatedCost?: number;
}

export interface AssessmentSummary {
  overallRiskLevel: string;
  majorHazards: string[];
  prioritySectors: string[];
  keyRecommendations: string[];
  lastUpdated?: string;
}

// HIAP (Health Impact Assessment and Policy) Types - Actual API Response Structure
export interface HIAPData {
  id: string;
  locode: string;
  inventoryId: string;
  type: 'mitigation' | 'adaptation';
  langs: string[];
  jobId: string;
  status: string;
  created: string;
  last_updated: string;
  rankedActions: HIAPRankedAction[];
}

export interface HIAPRankedAction {
  id: string;
  hiaRankingId: string;
  lang: string;
  type: 'mitigation' | 'adaptation';
  name: string;
  hazards: string[] | null;
  sectors: string[];
  subsectors: string[];
  primaryPurposes: string[];
  description: string;
  dependencies: string[];
  cobenefits: {
    habitat: number;
    housing: number;
    mobility: number;
    air_quality: number;
    water_quality: number;
    cost_of_living: number;
    stakeholder_engagement: number;
  };
  equityAndInclusionConsiderations: string | null;
  GHGReductionPotential: {
    ippu: string | null;
    afolu: string | null;
    waste: string | null;
    transportation: string | null;
    stationary_energy: string | null;
  };
  adaptationEffectiveness: string | null;
  adaptationEffectivenessPerHazard: {
    floods: string | null;
    storms: string | null;
    diseases: string | null;
    droughts: string | null;
    heatwaves: string | null;
    wildfires: string | null;
    landslides: string | null;
    'sea-level-rise': string | null;
  };
  costInvestmentNeeded: 'low' | 'medium' | 'high';
  timelineForImplementation: string;
  keyPerformanceIndicators: string[];
  powersAndMandates: string[];
  biome: string | null;
  isSelected: boolean;
  actionId: string;
  rank: number;
  explanation: {
    explanations: {
      [lang: string]: string;
    };
  };
  created: string;
  last_updated: string;
}

// Legacy types kept for backward compatibility
export interface HIAPAction {
  id: string;
  title: string;
  description: string;
  actionType: 'mitigation' | 'adaptation';
  category?: string;
  sector?: string;
  priority?: string | number;
  healthImpact?: HealthImpact;
  implementationDetails?: ImplementationDetails;
  resources?: Resource[];
}

export interface HIAPRecommendation {
  id: string;
  title: string;
  description: string;
  priority: string | number;
  category: string;
  healthBenefits?: string[];
  implementationSteps?: string[];
  estimatedCost?: string | number;
  timeframe?: string;
}

export interface HealthImpact {
  score?: number;
  benefits?: string[];
  risks?: string[];
  affectedPopulation?: number | string;
  healthSectors?: string[];
}

export interface ImplementationDetails {
  steps?: string[];
  requirements?: string[];
  barriers?: string[];
  enablers?: string[];
  timeline?: string;
  stakeholders?: string[];
}

export interface Resource {
  type: string;
  title: string;
  url?: string;
  description?: string;
}

export interface HIAPMetadata {
  language: string;
  actionType: 'mitigation' | 'adaptation';
  inventoryId: string;
  generatedAt?: string;
  totalActions?: number;
}
