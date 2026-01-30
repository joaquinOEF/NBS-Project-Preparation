import OpenAI from "openai";
import { semanticSearch } from "./knowledgeService";

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
  const { selectedZones, interventionBundles, funderPathway, projectName, cityName } = request;

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

Generate a complete impact narrative response in the following JSON structure.
You MUST generate exactly 10 narrative blocks covering all these topics:

{
  "narrativeBlocks": [
    {
      "id": "block-1",
      "title": "Executive Summary",
      "type": "executive_summary",
      "lens": "neutral",
      "contentMd": "2-3 paragraph executive summary introducing the project, its scale, key outcomes, and why it matters for climate resilience...",
      "evidenceTier": "MODELLED",
      "included": true,
      "kpis": [{ "name": "Key outcome metric", "valueRange": "X-Y%", "unit": "reduction", "confidence": "MEDIUM" }]
    },
    {
      "id": "block-2",
      "title": "Context and Rationale",
      "type": "context_rationale",
      "lens": "neutral",
      "contentMd": "Explain the city context, climate challenges, recent events, and why NBS interventions are needed now...",
      "evidenceTier": "EVIDENCE",
      "included": true
    },
    {
      "id": "block-3",
      "title": "Theory of Change",
      "type": "theory_of_change",
      "lens": "neutral",
      "contentMd": "Explain the causal chain: how the interventions lead to outcomes. Include inputs, activities, outputs, outcomes, and impact...",
      "evidenceTier": "ASSUMPTION",
      "included": true
    },
    {
      "id": "block-4",
      "title": "Portfolio Overview and Phasing",
      "type": "portfolio_phasing",
      "lens": "neutral",
      "contentMd": "Detail the intervention portfolio, implementation phases, timelines, and sequencing logic...",
      "evidenceTier": "MODELLED",
      "included": true,
      "kpis": [{ "name": "Implementation timeline", "valueRange": "X-Y years", "unit": "duration", "confidence": "MEDIUM" }]
    },
    {
      "id": "block-5",
      "title": "Expected Impacts",
      "type": "expected_impacts",
      "lens": "neutral",
      "contentMd": "Detail the primary climate impacts (flood reduction, heat mitigation, landslide prevention) with quantified ranges...",
      "evidenceTier": "MODELLED",
      "included": true,
      "kpis": [{ "name": "Flood risk reduction", "valueRange": "X-Y%", "unit": "reduction", "confidence": "MEDIUM" }, { "name": "Heat reduction", "valueRange": "X-Y°C", "unit": "degrees", "confidence": "MEDIUM" }]
    },
    {
      "id": "block-6",
      "title": "Key Co-Benefits",
      "type": "key_cobenefits",
      "lens": "neutral",
      "contentMd": "Summarize the main co-benefits across health, biodiversity, economic value, social cohesion, water quality...",
      "evidenceTier": "MODELLED",
      "included": true
    },
    {
      "id": "block-7",
      "title": "Synergies and Alignment",
      "type": "synergies_alignment",
      "lens": "neutral",
      "contentMd": "Explain alignment with city plans, national policies, SDGs, and other initiatives. Identify synergies with existing programs...",
      "evidenceTier": "EVIDENCE",
      "included": true
    },
    {
      "id": "block-8",
      "title": "Assumptions",
      "type": "assumptions",
      "lens": "neutral",
      "contentMd": "List key assumptions underlying the impact estimates, including climate scenarios, implementation capacity, and stakeholder engagement...",
      "evidenceTier": "ASSUMPTION",
      "included": true
    },
    {
      "id": "block-9",
      "title": "Risks and Dependencies",
      "type": "risks_dependencies",
      "lens": "neutral",
      "contentMd": "Identify key risks (climate, implementation, financial, political) and dependencies. Include mitigation strategies...",
      "evidenceTier": "ASSUMPTION",
      "included": true
    },
    {
      "id": "block-10",
      "title": "MRV Stub (Monitoring, Reporting and Verification)",
      "type": "mrv_stub",
      "lens": "neutral",
      "contentMd": "Outline the MRV framework: what will be measured, how, when, and by whom. Include key indicators and reporting frequency...",
      "evidenceTier": "ASSUMPTION",
      "included": true
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

Generate exactly 10 narrative blocks as specified above, 4-6 co-benefits relevant to the selected hazards and interventions, and 3-4 downstream signals (at least 2 for operations and 2 for business model).
Make the content specific to the zones, hazards, and interventions provided. Use realistic metrics and ranges based on NBS literature.
Each block should have 2-4 paragraphs of substantive content. Be specific about the city, interventions, and expected outcomes.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_completion_tokens: 8000,
    reasoning_effort: "none",
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

interface GenerateLensRequest {
  lens: 'climate' | 'social' | 'financial' | 'institutional';
  baseNarrativeBlocks: NarrativeBlock[];
  funderPathway: FunderPathway;
  customInstructions?: string;
}

const LENS_DESCRIPTIONS: Record<string, string> = {
  climate: 'Emphasize climate mitigation and adaptation outcomes, GHG reductions, climate resilience metrics, and alignment with climate targets (NDCs, net-zero goals).',
  social: 'Emphasize social equity, community benefits, vulnerable population impacts, job creation, health outcomes, and inclusive development.',
  financial: 'Emphasize financial returns, cost-benefit analysis, revenue potential, bankability, and investor-relevant metrics.',
  institutional: 'Emphasize governance structures, institutional capacity, policy alignment, regulatory frameworks, and stakeholder coordination.',
};

export async function generateLensVariant(
  request: GenerateLensRequest
): Promise<NarrativeBlock[]> {
  const { lens, baseNarrativeBlocks, funderPathway, customInstructions } = request;

  const systemPrompt = `You are an expert in Nature-Based Solutions narratives for climate funding.
Your task is to adapt an existing narrative to emphasize a specific analytical lens.
${LENS_DESCRIPTIONS[lens]}
Preserve the core facts and structure, but adjust emphasis, language, and highlighted metrics to match the lens.
${customInstructions ? `Additional instructions: ${customInstructions}` : ''}`;

  const userPrompt = `Adapt the following narrative blocks to the "${lens}" lens.
Funding pathway: ${funderPathway.primary || 'General'}

BASE NARRATIVE BLOCKS:
${baseNarrativeBlocks.map(b => `
### ${b.title} (${b.type})
${b.contentMd}
`).join('\n')}

Return a JSON object with the adapted narrative blocks:
{
  "narrativeBlocks": [
    {
      "id": "block-X",
      "title": "Block Title",
      "type": "block_type",
      "lens": "${lens}",
      "contentMd": "Adapted content emphasizing ${lens} perspective...",
      "evidenceTier": "EVIDENCE|MODELLED|ASSUMPTION",
      "included": true,
      "kpis": [{ "name": "metric", "valueRange": "X-Y", "unit": "unit", "confidence": "HIGH|MEDIUM|LOW" }]
    }
  ]
}

Adapt ALL ${baseNarrativeBlocks.length} blocks to the ${lens} lens.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_completion_tokens: 8000,
    reasoning_effort: "none",
  } as any);

  const content = response.choices[0]?.message?.content || "{}";
  
  try {
    const parsed = JSON.parse(content);
    return parsed.narrativeBlocks || [];
  } catch (error) {
    console.error("Failed to parse lens response:", error);
    throw new Error("Failed to generate lens variant");
  }
}

interface RegenerateBlockRequest {
  block: NarrativeBlock;
  customPrompt: string;
  projectContext: {
    cityName?: string;
    hazards?: string[];
    interventions?: string[];
  };
}

export async function regenerateBlock(
  request: RegenerateBlockRequest
): Promise<NarrativeBlock> {
  const { block, customPrompt, projectContext } = request;

  const systemPrompt = `You are an expert in Nature-Based Solutions narratives.
Regenerate the specified narrative block based on user instructions while maintaining consistency with the project context.`;

  const userPrompt = `Regenerate this narrative block with the following instructions:

CURRENT BLOCK:
Title: ${block.title}
Type: ${block.type}
Current Content:
${block.contentMd}

PROJECT CONTEXT:
- City: ${projectContext.cityName || 'Urban area'}
- Hazards: ${projectContext.hazards?.join(', ') || 'Flood, Heat, Landslide'}
- Interventions: ${projectContext.interventions?.join(', ') || 'NBS portfolio'}

USER INSTRUCTIONS:
${customPrompt}

Return a JSON object with the regenerated block:
{
  "block": {
    "id": "${block.id}",
    "title": "${block.title}",
    "type": "${block.type}",
    "lens": "${block.lens}",
    "contentMd": "Regenerated content based on instructions...",
    "evidenceTier": "${block.evidenceTier}",
    "included": true,
    "kpis": []
  }
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_completion_tokens: 2000,
    reasoning_effort: "none",
  } as any);

  const content = response.choices[0]?.message?.content || "{}";
  
  try {
    const parsed = JSON.parse(content);
    return parsed.block || block;
  } catch (error) {
    console.error("Failed to parse block regeneration response:", error);
    throw new Error("Failed to regenerate block");
  }
}

// ============================================
// Quantify API — RAG-grounded KPI generation
// ============================================

export interface QuantifiedKPI {
  id: string;
  name: string;
  metric: string;
  valueRange: { low: number; high: number };
  unit: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidenceTier: 'EVIDENCE' | 'MODELLED' | 'ASSUMPTION';
  sourceChunkIds: string[];
  methodology: string;
}

export interface QuantifiedImpactGroup {
  id: string;
  hazardType: string;
  interventionBundle: string;
  kpis: QuantifiedKPI[];
}

export interface QuantifiedCoBenefit {
  id: string;
  title: string;
  category: string;
  metric: string;
  valueRange: { low: number; high: number } | null;
  unit: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidenceTier: 'EVIDENCE' | 'MODELLED' | 'ASSUMPTION';
  sourceChunkIds: string[];
  whoBenefits: string[];
  where: string[];
}

export interface MRVIndicator {
  id: string;
  name: string;
  metric: string;
  baselineValue: string;
  targetValue: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'BIANNUAL';
  dataSource: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface QuantifyResponse {
  impactGroups: QuantifiedImpactGroup[];
  coBenefits: QuantifiedCoBenefit[];
  mrvIndicators: MRVIndicator[];
  evidenceContext: {
    chunksUsed: number;
    topSources: Array<{ title: string; score: number }>;
    searchQueries: string[];
  };
  generationMeta: { generatedAt: string; model: string; ragChunksUsed: number };
}

interface QuantifyRequest {
  projectId: string;
  selectedZones: SelectedZone[];
  interventionBundles: InterventionBundle[];
  funderPathway: FunderPathway;
  projectName?: string;
  cityName?: string;
}

export async function generateQuantifiedImpacts(
  request: QuantifyRequest
): Promise<QuantifyResponse> {
  const { projectId, selectedZones, interventionBundles, funderPathway, projectName, cityName } = request;

  const enabledBundles = interventionBundles.filter(b => b.enabled);

  // Step 1: Build search queries from hazard types + intervention names
  const hazardTypes = Array.from(new Set(selectedZones.map(z => z.hazardType).filter(Boolean)));
  const interventionNames = enabledBundles.flatMap(b => b.interventions);

  const searchQueries: string[] = [];
  for (const hazard of hazardTypes) {
    searchQueries.push(`${hazard.toLowerCase()} risk reduction NBS urban`);
    for (const intervention of interventionNames.slice(0, 3)) {
      searchQueries.push(`${hazard.toLowerCase()} ${intervention.toLowerCase()} effectiveness`);
    }
  }
  searchQueries.push("co-benefits nature-based solutions urban resilience");
  searchQueries.push("MRV monitoring indicators NBS climate adaptation");

  // Step 2: Call semanticSearch for each query
  const allChunks: Array<{ content: string; score: number; sourceTitle?: string; chunkId?: string }> = [];
  const seenChunkIds = new Set<string>();

  for (const query of searchQueries.slice(0, 8)) {
    try {
      const result = await semanticSearch(projectId, query, {
        includeGlobalKnowledge: true,
        usableByModule: 'impact_model',
        limit: 3,
      });
      for (const chunk of result.chunks) {
        const id = chunk.id?.toString() || chunk.content.slice(0, 50);
        if (!seenChunkIds.has(id)) {
          seenChunkIds.add(id);
          allChunks.push({
            content: chunk.content,
            score: chunk.score,
            sourceTitle: (chunk as any).source?.title,
            chunkId: id,
          });
        }
      }
    } catch (err) {
      console.warn(`RAG search failed for query "${query}":`, err);
    }
  }

  // Step 3: Sort by score and take top chunks
  allChunks.sort((a, b) => b.score - a.score);
  const topChunks = allChunks.slice(0, 12);

  // Step 4: Format evidence context for the LLM prompt
  const evidenceBlock = topChunks.length > 0
    ? topChunks.map((c, i) => `[Evidence ${i + 1}] (score: ${c.score.toFixed(2)}, source: ${c.sourceTitle || 'Unknown'})\n${c.content.slice(0, 500)}`).join('\n\n')
    : 'No evidence chunks found in knowledge base. Use general NBS literature estimates.';

  const topSources = Array.from(
    new Map(topChunks.filter(c => c.sourceTitle).map(c => [c.sourceTitle!, c.score])).entries()
  ).map(([title, score]) => ({ title, score }));

  // Step 5: Build focused LLM prompt
  const systemPrompt = `You are an expert in Nature-Based Solutions (NBS) quantification and evidence-based impact metrics.
Your task is to generate structured, quantified impact data grounded in evidence.
Output ONLY valid JSON. Be honest about confidence levels and evidence tiers.
If evidence supports a metric, use EVIDENCE tier. If modelled/extrapolated, use MODELLED. If assumed, use ASSUMPTION.`;

  const userPrompt = `Generate quantified impact KPIs for this NBS project:

PROJECT CONTEXT:
- Project: ${projectName || 'Urban Climate Resilience Initiative'}
- City: ${cityName || 'Urban area'}
- Zones: ${selectedZones.map(z => `${z.zoneId} (${z.hazardType}, risk: ${(z.riskScore * 100).toFixed(0)}%, area: ${z.area || 'unknown'}m²)`).join('; ')}
- Bundles: ${enabledBundles.map(b => `${b.name} [${b.targetHazards.join(',')}]`).join('; ')}
- Funder: ${funderPathway.primary || 'General'}

EVIDENCE FROM KNOWLEDGE BASE:
${evidenceBlock}

Generate structured JSON with:
1. impactGroups: One per hazard-intervention pair, each with 3-5 KPIs (id, name, metric, valueRange {low, high}, unit, confidence, evidenceTier, sourceChunkIds[], methodology)
2. coBenefits: 4-6 quantifiable co-benefits (id, title, category, metric, valueRange or null, unit, confidence, evidenceTier, sourceChunkIds[], whoBenefits[], where[])
3. mrvIndicators: 3-5 monitoring indicators (id, name, metric, baselineValue, targetValue, frequency, dataSource, confidence)

Use evidence chunk IDs where applicable. Return:
{
  "impactGroups": [...],
  "coBenefits": [...],
  "mrvIndicators": [...]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" },
    temperature: 0.5,
    max_completion_tokens: 3000,
    reasoning_effort: "none",
  } as any);

  const content = response.choices[0]?.message?.content || "{}";

  try {
    const parsed = JSON.parse(content);
    return {
      impactGroups: parsed.impactGroups || [],
      coBenefits: parsed.coBenefits || [],
      mrvIndicators: parsed.mrvIndicators || [],
      evidenceContext: {
        chunksUsed: topChunks.length,
        topSources,
        searchQueries,
      },
      generationMeta: {
        generatedAt: new Date().toISOString(),
        model: 'GPT-5.2',
        ragChunksUsed: topChunks.length,
      },
    };
  } catch (error) {
    console.error("Failed to parse quantify response:", error);
    throw new Error("Failed to generate quantified impacts - invalid response format");
  }
}
