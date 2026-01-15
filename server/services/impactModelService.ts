import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface SelectedZone {
  zoneId: string;
  hazardType: string;
  riskScore: number;
  area?: number;
  interventionType?: string;
}

interface InterventionBundle {
  id: string;
  name: string;
  description: string;
  targetHazards: string[];
  interventions: string[];
  enabled: boolean;
}

interface FunderPathway {
  primary: string;
  secondary?: string;
  readinessLevel?: string;
  limitingFactors?: string[];
}

interface GenerateNarrativeRequest {
  selectedZones: SelectedZone[];
  interventionBundles: InterventionBundle[];
  funderPathway: FunderPathway;
  prioritizationWeights: {
    floodRiskReduction: number;
    heatReduction: number;
    landslideRiskReduction: number;
    socialEquity: number;
    costCertainty: number;
    biodiversityWaterQuality: number;
  };
  projectName?: string;
  cityName?: string;
}

interface NarrativeBlock {
  id: string;
  title: string;
  type: string;
  lens: string;
  contentMd: string;
  evidenceTier: string;
  included: boolean;
  kpis?: Array<{ name: string; valueRange: string; unit: string; confidence: string }>;
}

interface CoBenefitCard {
  id: string;
  title: string;
  category: string;
  description: string;
  whoBenefits: string[];
  where: string[];
  confidence: string;
  evidenceTier: string;
  included: boolean;
  userNotes: string;
}

interface SignalCard {
  id: string;
  title: string;
  description: string;
  whyItMatters: string;
  triggeredBy: string[];
  ownerCandidates: string[];
  timeHorizon: string;
  riskIfMissing: string;
  confidence: string;
  included: boolean;
  userNotes: string;
}

interface GenerateNarrativeResponse {
  narrativeBlocks: NarrativeBlock[];
  coBenefits: CoBenefitCard[];
  downstreamSignals: {
    operations: SignalCard[];
    businessModel: SignalCard[];
    mrv: SignalCard[];
    implementors: SignalCard[];
  };
}

export async function generateImpactNarrative(
  request: GenerateNarrativeRequest
): Promise<GenerateNarrativeResponse> {
  const { selectedZones, interventionBundles, funderPathway, prioritizationWeights, projectName, cityName } = request;

  const enabledBundles = interventionBundles.filter(b => b.enabled);
  
  const systemPrompt = `You are an expert in Nature-Based Solutions (NBS) for climate adaptation and urban resilience. 
You help cities create compelling, evidence-based impact narratives for climate projects.
Your narratives should be:
- Grounded in scientific evidence and best practices
- Tailored to the specific hazards and interventions selected
- Aligned with funder expectations (${funderPathway.primary || 'general'} funding pathway)
- Quantitative where possible, with realistic ranges
- Professional and suitable for funding proposals

Always respond with valid JSON matching the exact structure requested.`;

  const userPrompt = `Generate an impact narrative for a Nature-Based Solutions project with the following context:

PROJECT CONTEXT:
- Project: ${projectName || 'Urban Climate Resilience Initiative'}
- City: ${cityName || 'Urban area'}
- Selected zones: ${selectedZones.length} intervention zones
- Zone details:
${selectedZones.map(z => `  * Zone ${z.zoneId}: ${z.hazardType} risk (score: ${(z.riskScore * 100).toFixed(0)}%), area: ${z.area || 'unknown'}m², intervention: ${z.interventionType || 'TBD'}`).join('\n')}

INTERVENTION BUNDLES (${enabledBundles.length} enabled):
${enabledBundles.map(b => `- ${b.name}: ${b.description}
  Target hazards: ${b.targetHazards.join(', ')}
  Interventions: ${b.interventions.join(', ')}`).join('\n\n')}

FUNDING PATHWAY:
- Primary: ${funderPathway.primary || 'Not specified'}
- Secondary: ${funderPathway.secondary || 'None'}
- Readiness: ${funderPathway.readinessLevel || 'Early stage'}
- Limiting factors: ${funderPathway.limitingFactors?.join(', ') || 'None identified'}

PRIORITIZATION WEIGHTS:
- Flood Risk Reduction: ${prioritizationWeights.floodRiskReduction ?? 0.3}
- Heat Reduction: ${prioritizationWeights.heatReduction ?? 0.25}
- Landslide Risk Reduction: ${prioritizationWeights.landslideRiskReduction ?? 0.15}
- Social Equity: ${prioritizationWeights.socialEquity ?? 0.1}
- Cost Certainty: ${prioritizationWeights.costCertainty ?? 0.1}
- Biodiversity & Water Quality: ${prioritizationWeights.biodiversityWaterQuality ?? 0.1}

Generate a complete impact narrative response in the following JSON structure:

{
  "narrativeBlocks": [
    {
      "id": "block-1",
      "title": "Executive Summary",
      "type": "summary",
      "lens": "neutral",
      "contentMd": "2-3 paragraph executive summary of the project's climate impact...",
      "evidenceTier": "MODELLED",
      "included": true,
      "kpis": [
        { "name": "Key metric name", "valueRange": "X-Y%", "unit": "reduction", "confidence": "MEDIUM" }
      ]
    },
    {
      "id": "block-2",
      "title": "Theory of Change",
      "type": "theory_of_change",
      "lens": "neutral",
      "contentMd": "Explain how the interventions lead to desired outcomes...",
      "evidenceTier": "ASSUMPTION",
      "included": true
    },
    {
      "id": "block-3",
      "title": "Expected Impacts",
      "type": "expected_impacts",
      "lens": "neutral", 
      "contentMd": "Detail the primary and secondary impacts...",
      "evidenceTier": "MODELLED",
      "included": true,
      "kpis": [
        { "name": "Impact metric", "valueRange": "range", "unit": "unit", "confidence": "confidence" }
      ]
    }
  ],
  "coBenefits": [
    {
      "id": "cb-1",
      "title": "Co-benefit title",
      "category": "HEALTH|BIODIVERSITY|ECONOMIC_VALUE|SOCIAL_COHESION|WATER_QUALITY|AIR_QUALITY",
      "description": "Description of the co-benefit...",
      "whoBenefits": ["Beneficiary group 1", "Beneficiary group 2"],
      "where": ["Location 1", "Location 2"],
      "confidence": "HIGH|MEDIUM|LOW",
      "evidenceTier": "EVIDENCE|MODELLED|ASSUMPTION",
      "included": true,
      "userNotes": ""
    }
  ],
  "downstreamSignals": {
    "operations": [
      {
        "id": "ops-1",
        "title": "Operations signal title",
        "description": "What maintenance or operations are needed...",
        "whyItMatters": "Why this is critical for success...",
        "triggeredBy": ["Intervention name"],
        "ownerCandidates": ["Potential owner 1", "Potential owner 2"],
        "timeHorizon": "0-2y|2-5y|5-10y",
        "riskIfMissing": "What happens if this is not addressed...",
        "confidence": "HIGH|MEDIUM|LOW",
        "included": true,
        "userNotes": ""
      }
    ],
    "businessModel": [
      {
        "id": "bm-1",
        "title": "Business model signal title",
        "description": "Revenue or financing opportunity...",
        "whyItMatters": "Why this matters for project bankability...",
        "triggeredBy": ["Intervention name"],
        "ownerCandidates": ["Potential owner 1"],
        "timeHorizon": "2-5y",
        "riskIfMissing": "Financial risk if not addressed...",
        "confidence": "MEDIUM",
        "included": true,
        "userNotes": ""
      }
    ],
    "mrv": [],
    "implementors": []
  }
}

Generate at least 3 narrative blocks, 3-5 co-benefits relevant to the selected hazards and interventions, and 2-3 downstream signals (at least 1 for operations and 1 for business model).
Make the content specific to the zones, hazards, and interventions provided. Use realistic metrics and ranges based on NBS literature.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_completion_tokens: 4000,
    reasoning_effort: "none", // Disable extended thinking for faster responses
  } as any);

  const content = response.choices[0]?.message?.content || "{}";
  
  try {
    const parsed = JSON.parse(content) as GenerateNarrativeResponse;
    return {
      narrativeBlocks: parsed.narrativeBlocks || [],
      coBenefits: parsed.coBenefits || [],
      downstreamSignals: parsed.downstreamSignals || { operations: [], businessModel: [], mrv: [], implementors: [] },
    };
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    throw new Error("Failed to generate narrative - invalid response format");
  }
}
