export type DocumentCategory = 
  | "nbs_intervention_impacts"
  | "funder_guidelines"
  | "technical_standards"
  | "case_studies"
  | "local_context"
  | "economic_data"
  | "policy_frameworks"
  | "climate_science";

export type DocumentTag =
  | "co-benefits"
  | "flood-resilience"
  | "heat-mitigation"
  | "slope-stabilization"
  | "urban-greening"
  | "stormwater-management"
  | "biodiversity"
  | "carbon-sequestration"
  | "health-impacts"
  | "social-equity"
  | "cost-benefit"
  | "gcf"
  | "world-bank"
  | "idb"
  | "bilateral"
  | "latin-america"
  | "asia"
  | "africa"
  | "europe"
  | "monitoring-reporting"
  | "implementation"
  | "governance";

export type ModuleUsability = 
  | "impact_model"
  | "site_explorer"
  | "funder_selection"
  | "operations"
  | "business_model"
  | "all";

export interface DocumentMetadata {
  category: DocumentCategory;
  tags: DocumentTag[];
  usableBy: ModuleUsability[];
  documentType: "research_synthesis" | "case_study" | "funder_guidance" | "technical_standard" | "policy_document" | "local_data";
  region?: string;
  sourceUrl?: string;
  authors?: string[];
  publicationDate?: string;
  version?: string;
  language?: string;
}

export interface KnowledgeDocumentDefinition {
  id: string;
  title: string;
  description: string;
  filePath: string;
  metadata: DocumentMetadata;
}

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  nbs_intervention_impacts: "NBS Intervention Impacts & Co-benefits",
  funder_guidelines: "Funder Guidelines & Requirements",
  technical_standards: "Technical Standards & Methodologies",
  case_studies: "Project Case Studies",
  local_context: "Local Context & Demographics",
  economic_data: "Economic & Financial Data",
  policy_frameworks: "Policy Frameworks & Regulations",
  climate_science: "Climate Science & Projections",
};

export const DOCUMENT_TAG_GROUPS: Record<string, DocumentTag[]> = {
  "Hazard Types": ["flood-resilience", "heat-mitigation", "slope-stabilization"],
  "Intervention Types": ["urban-greening", "stormwater-management", "biodiversity"],
  "Impact Areas": ["co-benefits", "carbon-sequestration", "health-impacts", "social-equity", "cost-benefit"],
  "Funders": ["gcf", "world-bank", "idb", "bilateral"],
  "Regions": ["latin-america", "asia", "africa", "europe"],
  "Process": ["monitoring-reporting", "implementation", "governance"],
};

export const GLOBAL_PROJECT_ID = "global-knowledge-base";

export const INITIAL_KNOWLEDGE_DOCUMENTS: KnowledgeDocumentDefinition[] = [
  {
    id: "nbs-urban-resilience-v1",
    title: "Nature-Based Solutions for Urban Climate Resilience",
    description: "Comprehensive research synthesis on NBS effectiveness for flood resilience, heat mitigation, and slope stabilization, with emphasis on Latin American case studies.",
    filePath: "attached_assets/Nature-Based_Solutions_(NBS)_for_Urban_Climate_Resilience_1768850795130.pdf",
    metadata: {
      category: "nbs_intervention_impacts",
      tags: ["co-benefits", "flood-resilience", "heat-mitigation", "slope-stabilization", "latin-america", "urban-greening", "stormwater-management"],
      usableBy: ["impact_model", "site_explorer", "operations"],
      documentType: "research_synthesis",
      region: "latin_america",
      language: "en",
      version: "1.0",
    },
  },
];
