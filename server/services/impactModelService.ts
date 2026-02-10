import OpenAI from "openai";
import { semanticSearch } from "./knowledgeService";
import { formatArea } from "@shared/number-formatting";

function formatZoneId(zoneId: string): string {
  return zoneId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatPathway(pathway: string): string {
  return pathway.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function extractInterventionName(intervention: string): string {
  const match = intervention.match(/^([^-–]+)/);
  return match ? match[1].trim().toLowerCase() : intervention.toLowerCase();
}

// Helper to extract text from OpenAI responses API format
function extractTextFromResponse(response: any): string {
  const output = response?.output || [];
  return output
    .filter((item: any) => item.type === "message")
    .flatMap((item: any) => item.content || [])
    .filter((part: any) => part.type === "output_text")
    .map((part: any) => part.text)
    .join("") || "{}";
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface InterventionSite {
  interventionId: string;
  interventionName: string;
  category: string;
  estimatedArea?: number;
  areaUnit?: string;
  estimatedCost?: { min: number; max: number; unit: string };
  impacts?: { flood: string; heat: string; landslide: string };
  assetName?: string;
  assetType?: string;
}

interface SelectedZone {
  zoneId: string;
  zoneName?: string;
  hazardType: string;
  riskScore: number;
  area?: number;
  interventionType?: string;
  interventionPortfolio?: InterventionSite[];
}

interface InterventionBundle {
  id: string;
  name: string;
  description: string;
  targetHazards: string[];
  interventions: string[];
  enabled: boolean;
  capexRange?: { low: number; high: number };
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

## Number Formatting Requirements (CRITICAL)
- Round large areas appropriately:
  - Use hectares (ha) for areas 10,000+ m². Example: "10 ha" not "100,000 m²"
  - Use km² for very large areas (1,000,000+ m²). Example: "10.3 km²" not "10,300,000 m²"
- Round to reasonable significant figures (2-3 max):
  - BAD: "424,236.70860707585 m²" or "9.388314361632617 ha"
  - GOOD: "42 ha" or "9.4 ha" or "424,000 m²"
- For large non-area numbers, use thousands separators or words: "103 million" not "103,000,000"
- Percentages: Round to whole numbers when >= 10%, one decimal when < 10%
- For value ranges, format consistently: "0.5–2°C" or "10–30%"
- Use the provided human-readable zone names (e.g. "Zona Sul Residencial") as-is, do NOT convert them
- Use words for pathway names: "preparation facility" not "preparation_facility"

Always respond with valid JSON matching the exact structure requested.`;

  const userPrompt = `Generate an impact narrative for a Nature-Based Solutions project with the following context:

PROJECT CONTEXT:
- Project: ${projectName || 'Urban Climate Resilience Initiative'}
- City: ${cityName || 'Urban area'}
- Selected zones: ${selectedZones.length} intervention zones
- Zone details:
${selectedZones.map(z => `  * "${z.zoneName || formatZoneId(z.zoneId)}": ${z.hazardType} risk (score: ${Math.round(z.riskScore * 100)}%), area: ${z.area ? formatArea(z.area) : 'unknown'}, intervention: ${z.interventionType || 'TBD'}`).join('\n')}

INTERVENTION BUNDLES (${enabledBundles.length} enabled):
${enabledBundles.map(b => `- ${b.name}: ${b.description}
  Target hazards: ${b.targetHazards.join(', ')}
  Interventions: ${b.interventions.join(', ')}`).join('\n\n')}

FUNDING PATHWAY:
- Primary: ${funderPathway.primary ? formatPathway(funderPathway.primary) : 'Not specified'}
- Secondary: ${funderPathway.secondary ? formatPathway(funderPathway.secondary) : 'None'}
- Readiness: ${funderPathway.readinessLevel ? formatPathway(funderPathway.readinessLevel) : 'Early stage'}
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

  const response = await openai.responses.create({
    model: "gpt-5.2",
    input: [
      { role: "developer", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    text: {
      format: { type: "json_object" },
    },
    reasoning: { effort: "low" },
    max_output_tokens: 8000,
  } as any);

  const content = extractTextFromResponse(response);
  
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

  const response = await openai.responses.create({
    model: "gpt-5.2",
    input: [
      { role: "developer", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    text: {
      format: { type: "json_object" },
    },
    reasoning: { effort: "low" },
    max_output_tokens: 8000,
  } as any);

  const content = extractTextFromResponse(response);
  
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

  const response = await openai.responses.create({
    model: "gpt-5.2",
    input: [
      { role: "developer", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    text: {
      format: { type: "json_object" },
    },
    reasoning: { effort: "low" },
    max_output_tokens: 2000,
  } as any);

  const content = extractTextFromResponse(response);
  
  try {
    const parsed = JSON.parse(content);
    return parsed.block || block;
  } catch (error) {
    console.error("Failed to parse block regeneration response:", error);
    throw new Error("Failed to regenerate block");
  }
}

// ============================================
// Narrate API — 3-Phase KPI-grounded narrative
// Phase 1: Plan outline (prevent duplication)
// Phase 2: Generate blocks in parallel
// Phase 3: Assemble + co-benefits/signals
// ============================================

interface NarrateFromKPIsRequest {
  quantifiedImpacts: QuantifyResponse;
  selectedZones: SelectedZone[];
  interventionBundles: InterventionBundle[];
  funderPathway: FunderPathway;
  projectName?: string;
  cityName?: string;
  projectId?: string;
  lens?: 'neutral' | 'climate' | 'social' | 'financial' | 'institutional';
  lensInstructions?: string;
}

interface NarrativeOutline {
  blocks: Array<{
    id: string;
    title: string;
    type: string;
    scope: string;
    mustIncludeKPIs: string[];
    mustNotCover: string[];
    evidenceTier: string;
    paragraphCount: number;
  }>;
}

function buildProjectContext(
  selectedZones: SelectedZone[],
  interventionBundles: InterventionBundle[],
  funderPathway: FunderPathway,
  projectName?: string,
  cityName?: string,
) {
  const enabledBundles = interventionBundles.filter(b => b.enabled);

  const zoneDetails = selectedZones.map(z => {
    const sites = (z.interventionPortfolio || []).map(s =>
      `    - ${s.interventionName}${s.assetName ? ` at ${s.assetName}` : ''} [${s.category?.replace(/_/g, ' ') || 'general'}] area: ${s.estimatedArea || '?'}${s.areaUnit || 'm²'}${s.estimatedCost ? `, cost: $${s.estimatedCost.min}-${s.estimatedCost.max} ${s.estimatedCost.unit}` : ''}${s.impacts ? `, flood: ${s.impacts.flood}, heat: ${s.impacts.heat}` : ''}`
    ).join('\n');
    return `  "${z.zoneName || formatZoneId(z.zoneId)}" (${z.hazardType}, risk: ${(z.riskScore * 100).toFixed(0)}%, area: ${z.area ? formatArea(z.area) : 'unknown'})\n${sites || '    (no specific sites)'}`;
  }).join('\n');

  return `PROJECT: ${projectName || 'Urban Climate Resilience Initiative'}
CITY: ${cityName || 'Urban area'}
ZONES (${selectedZones.length}):
${zoneDetails}

BUNDLES (${enabledBundles.length} enabled):
${enabledBundles.map(b => `- ${b.name}: ${b.description}\n  Hazards: ${b.targetHazards.join(', ')}\n  Interventions: ${b.interventions.join(', ')}${b.capexRange ? `\n  CAPEX: $${b.capexRange.low}-${b.capexRange.high}` : ''}`).join('\n\n')}

FUNDING:
- Primary: ${funderPathway.primary ? formatPathway(funderPathway.primary) : 'Not specified'}
- Secondary: ${funderPathway.secondary ? formatPathway(funderPathway.secondary) : 'None'}
- Readiness: ${funderPathway.readinessLevel ? formatPathway(funderPathway.readinessLevel) : 'Early stage'}
- Limiting factors: ${funderPathway.limitingFactors?.join(', ') || 'None identified'}`;
}

function buildKPISummary(quantifiedImpacts: QuantifyResponse) {
  const kpiSummary = quantifiedImpacts.impactGroups.map(g =>
    `"${g.interventionBundle || g.zoneId || 'zone'}" (${g.hazardType}):\n${g.kpis.map(k =>
      `  • ${k.name}${k.interventionName ? ` [${k.interventionName}]` : ''}: ${k.valueRange.low}–${k.valueRange.high} ${k.unit} (${k.confidence}, ${k.evidenceTier})`
    ).join('\n')}`
  ).join('\n\n');

  const coBenefitSummary = quantifiedImpacts.coBenefits.map(cb =>
    `• ${cb.title} (${cb.category}): ${cb.valueRange ? `${cb.valueRange.low}–${cb.valueRange.high} ${cb.unit}` : cb.metric} [${cb.confidence}]`
  ).join('\n');

  const mrvSummary = quantifiedImpacts.mrvIndicators.map(m =>
    `• ${m.name}: baseline ${m.baselineValue} → target ${m.targetValue} (${m.frequency}, ${m.confidence})`
  ).join('\n');

  return { kpiSummary, coBenefitSummary, mrvSummary };
}

async function fetchNarrativeEvidence(
  projectId: string,
  selectedZones: SelectedZone[],
  interventionBundles: InterventionBundle[],
): Promise<{ evidenceBlock: string; topSources: Array<{ title: string; score: number }> }> {
  const hazardTypes = Array.from(new Set(selectedZones.map(z => z.hazardType).filter(Boolean)));
  const enabledBundles = interventionBundles.filter(b => b.enabled);

  const allSiteCategories = new Set<string>();
  for (const zone of selectedZones) {
    for (const site of zone.interventionPortfolio || []) {
      if (site.category) allSiteCategories.add(site.category.replace(/_/g, ' '));
    }
  }

  const searchQueries: string[] = [];
  for (const hazard of hazardTypes) {
    const h = hazard.toLowerCase().replace(/_/g, ' ');
    searchQueries.push(`${h} nature-based solutions impact narrative concept note`);
    searchQueries.push(`${h} NBS intervention evidence effectiveness`);
  }
  searchQueries.push("NBS co-benefits urban resilience evidence quantified");
  searchQueries.push("climate adaptation funding concept note best practices");

  for (const cat of Array.from(allSiteCategories).slice(0, 2)) {
    searchQueries.push(`${cat} climate adaptation evidence case study`);
  }

  const allChunks: Array<{ content: string; score: number; sourceTitle?: string; chunkId?: string }> = [];
  const seenChunkIds = new Set<string>();

  const pid = projectId || 'global-knowledge-base';

  for (const query of searchQueries.slice(0, 8)) {
    try {
      const result = await semanticSearch(pid, query, {
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
      console.warn(`[Narrate RAG] Search failed for "${query}":`, err);
    }
  }

  allChunks.sort((a, b) => b.score - a.score);
  const topChunks = allChunks.slice(0, 12);

  const evidenceBlock = topChunks.length > 0
    ? topChunks.map((c, i) => `[Evidence ${i + 1}] (source: ${c.sourceTitle || 'Unknown'})\n${c.content.slice(0, 400)}`).join('\n\n')
    : 'No evidence chunks found. Use general NBS literature.';

  const topSources = Array.from(
    new Map(topChunks.filter(c => c.sourceTitle).map(c => [c.sourceTitle!, c.score])).entries()
  ).map(([title, score]) => ({ title, score }));

  return { evidenceBlock, topSources };
}

// Phase 1: Generate a structured outline to prevent duplication
async function planNarrativeOutline(
  projectContext: string,
  kpiSummary: string,
  coBenefitSummary: string,
  mrvSummary: string,
  evidenceBlock?: string,
  lens?: string,
  lensInstructions?: string,
): Promise<NarrativeOutline> {
  const lensLabel = lens && lens !== 'neutral' ? lens : null;
  console.log(`📋 Phase 1: Planning narrative outline${lensLabel ? ` (${lensLabel} lens)` : ''}...`);

  const lensDirective = lensLabel
    ? `\nANALYTICAL LENS: "${lensLabel}"\n${LENS_DESCRIPTIONS[lensLabel] || ''}\nEvery block scope must be written with this lens in mind. Prioritize ${lensLabel}-relevant KPIs and frame each section through the ${lensLabel} perspective.\n${lensInstructions ? `USER INSTRUCTIONS: ${lensInstructions}` : ''}`
    : '';

  const response = await openai.responses.create({
    model: "gpt-5.2",
    input: [
      {
        role: "developer",
        content: `You are a concept note architect for Nature-Based Solutions projects.
Your job is to plan the structure of a 10-block narrative so that each block has a DISTINCT scope with NO overlapping content.${lensLabel ? ` The entire narrative must be framed through the "${lensLabel}" analytical lens.` : ''}
Output ONLY valid JSON.`
      },
      {
        role: "user",
        content: `Plan the outline for a 10-block concept note narrative. Each block must have a clear, non-overlapping scope.

${projectContext}
${lensDirective}

AVAILABLE KPIs:
${kpiSummary}

CO-BENEFITS: ${coBenefitSummary}
MRV: ${mrvSummary}
${evidenceBlock ? `\nEVIDENCE AVAILABLE:\n${evidenceBlock.slice(0, 1000)}\n` : ''}
Assign each KPI to exactly ONE block. Distribute KPIs so "Expected Impacts" gets the primary hazard metrics, "Co-Benefits" gets cross-cutting ones, "Portfolio Overview" gets area/coverage/cost metrics, and "Executive Summary" gets 2-3 headline numbers.

Return JSON:
{
  "blocks": [
    {
      "id": "block-1",
      "title": "Executive Summary",
      "type": "executive_summary",
      "scope": "Brief overview: project purpose, total scale (area, zones, investment), 2-3 headline impact numbers, and funder alignment. DO NOT detail individual zones or interventions.",
      "mustIncludeKPIs": ["KPI name 1", "KPI name 2"],
      "mustNotCover": ["detailed zone descriptions", "theory of change logic", "risk analysis"],
      "evidenceTier": "MODELLED",
      "paragraphCount": 3
    },
    {
      "id": "block-2",
      "title": "Context and Rationale",
      "type": "context_rationale",
      "scope": "City climate vulnerability, recent events, why NBS is the right approach. NO impact numbers or intervention details.",
      "mustIncludeKPIs": [],
      "mustNotCover": ["specific KPI values", "implementation phasing", "co-benefits"],
      "evidenceTier": "EVIDENCE",
      "paragraphCount": 3
    },
    {
      "id": "block-3",
      "title": "Theory of Change",
      "type": "theory_of_change",
      "scope": "Causal logic: inputs → activities → outputs → outcomes → impact. Reference intervention types generically, NOT zone-by-zone. NO specific numbers.",
      "mustIncludeKPIs": [],
      "mustNotCover": ["specific KPI values", "portfolio details", "co-benefits"],
      "evidenceTier": "ASSUMPTION",
      "paragraphCount": 3
    },
    {
      "id": "block-4",
      "title": "Portfolio Overview and Phasing",
      "type": "portfolio_phasing",
      "scope": "Zone-by-zone intervention detail: what is being built where, site names, areas, costs, phasing timeline. Include area/coverage KPIs here.",
      "mustIncludeKPIs": ["area and coverage related KPIs"],
      "mustNotCover": ["impact reduction percentages", "co-benefits", "MRV details"],
      "evidenceTier": "MODELLED",
      "paragraphCount": 4
    },
    {
      "id": "block-5",
      "title": "Expected Impacts",
      "type": "expected_impacts",
      "scope": "Primary hazard reduction impacts with KPI values: flood reduction, heat mitigation, landslide prevention. Zone-specific quantified outcomes.",
      "mustIncludeKPIs": ["primary hazard KPIs"],
      "mustNotCover": ["co-benefits", "portfolio descriptions", "MRV"],
      "evidenceTier": "MODELLED",
      "paragraphCount": 4
    },
    {
      "id": "block-6",
      "title": "Key Co-Benefits",
      "type": "key_cobenefits",
      "scope": "Cross-cutting benefits: health, biodiversity, economic value, social cohesion, water/air quality. Use co-benefit data only.",
      "mustIncludeKPIs": ["co-benefit metrics"],
      "mustNotCover": ["primary hazard impacts", "portfolio details", "MRV"],
      "evidenceTier": "MODELLED",
      "paragraphCount": 3
    },
    {
      "id": "block-7",
      "title": "Synergies and Alignment",
      "type": "synergies_alignment",
      "scope": "Policy alignment: SDGs, national climate plans, city strategies, existing programs. NO impact numbers.",
      "mustIncludeKPIs": [],
      "mustNotCover": ["KPI values", "risk analysis", "MRV"],
      "evidenceTier": "EVIDENCE",
      "paragraphCount": 3
    },
    {
      "id": "block-8",
      "title": "Assumptions",
      "type": "assumptions",
      "scope": "Key assumptions behind the estimates: climate scenarios, implementation capacity, stakeholder engagement, land availability.",
      "mustIncludeKPIs": [],
      "mustNotCover": ["risk mitigation strategies", "impact numbers", "MRV"],
      "evidenceTier": "ASSUMPTION",
      "paragraphCount": 3
    },
    {
      "id": "block-9",
      "title": "Risks and Dependencies",
      "type": "risks_dependencies",
      "scope": "Key risks (climate, implementation, financial, political) with mitigation strategies. Dependencies on external factors.",
      "mustIncludeKPIs": [],
      "mustNotCover": ["assumptions listing", "impact numbers", "MRV details"],
      "evidenceTier": "ASSUMPTION",
      "paragraphCount": 3
    },
    {
      "id": "block-10",
      "title": "Monitoring, Reporting and Verification",
      "type": "mrv_framework",
      "scope": "MRV framework: indicators, baselines, targets, frequency, data sources, responsibilities. Use MRV indicator data.",
      "mustIncludeKPIs": ["MRV indicators"],
      "mustNotCover": ["impact estimates", "co-benefits", "risk analysis"],
      "evidenceTier": "ASSUMPTION",
      "paragraphCount": 3
    }
  ]
}

Adjust the mustIncludeKPIs to list the ACTUAL KPI names from the provided data. Distribute them so NO KPI appears in more than one block (except Executive Summary which can repeat 2-3 headline numbers).`
      }
    ],
    text: { format: { type: "json_object" } },
    reasoning: { effort: "medium" },
    max_output_tokens: 4000,
  } as any);

  const content = extractTextFromResponse(response);
  try {
    const parsed = JSON.parse(content) as NarrativeOutline;
    console.log(`   ✅ Outline planned: ${parsed.blocks.length} blocks`);
    return parsed;
  } catch (error) {
    console.error("Failed to parse outline:", error);
    return getDefaultOutline();
  }
}

function getDefaultOutline(): NarrativeOutline {
  return {
    blocks: [
      { id: "block-1", title: "Executive Summary", type: "executive_summary", scope: "Project overview with headline numbers", mustIncludeKPIs: [], mustNotCover: [], evidenceTier: "MODELLED", paragraphCount: 3 },
      { id: "block-2", title: "Context and Rationale", type: "context_rationale", scope: "City climate context and NBS rationale", mustIncludeKPIs: [], mustNotCover: [], evidenceTier: "EVIDENCE", paragraphCount: 3 },
      { id: "block-3", title: "Theory of Change", type: "theory_of_change", scope: "Causal chain from inputs to impact", mustIncludeKPIs: [], mustNotCover: [], evidenceTier: "ASSUMPTION", paragraphCount: 3 },
      { id: "block-4", title: "Portfolio Overview and Phasing", type: "portfolio_phasing", scope: "Zone-by-zone detail with sites and costs", mustIncludeKPIs: [], mustNotCover: [], evidenceTier: "MODELLED", paragraphCount: 4 },
      { id: "block-5", title: "Expected Impacts", type: "expected_impacts", scope: "Quantified hazard reduction impacts", mustIncludeKPIs: [], mustNotCover: [], evidenceTier: "MODELLED", paragraphCount: 4 },
      { id: "block-6", title: "Key Co-Benefits", type: "key_cobenefits", scope: "Health, biodiversity, economic, social benefits", mustIncludeKPIs: [], mustNotCover: [], evidenceTier: "MODELLED", paragraphCount: 3 },
      { id: "block-7", title: "Synergies and Alignment", type: "synergies_alignment", scope: "Policy and SDG alignment", mustIncludeKPIs: [], mustNotCover: [], evidenceTier: "EVIDENCE", paragraphCount: 3 },
      { id: "block-8", title: "Assumptions", type: "assumptions", scope: "Key assumptions behind estimates", mustIncludeKPIs: [], mustNotCover: [], evidenceTier: "ASSUMPTION", paragraphCount: 3 },
      { id: "block-9", title: "Risks and Dependencies", type: "risks_dependencies", scope: "Risks with mitigation strategies", mustIncludeKPIs: [], mustNotCover: [], evidenceTier: "ASSUMPTION", paragraphCount: 3 },
      { id: "block-10", title: "Monitoring, Reporting and Verification", type: "mrv_framework", scope: "MRV framework with indicators", mustIncludeKPIs: [], mustNotCover: [], evidenceTier: "ASSUMPTION", paragraphCount: 3 },
    ]
  };
}

// Phase 2: Generate blocks in parallel batches
async function generateBlocksBatch(
  blockOutlines: NarrativeOutline['blocks'],
  projectContext: string,
  kpiSummary: string,
  coBenefitSummary: string,
  mrvSummary: string,
  evidenceBlock: string,
  funderPathway: FunderPathway,
  lens?: string,
  lensInstructions?: string,
): Promise<NarrativeBlock[]> {
  const lensLabel = lens && lens !== 'neutral' ? lens : null;
  const lensBlock = lensLabel
    ? `\nANALYTICAL LENS: "${lensLabel}" — ${LENS_DESCRIPTIONS[lensLabel] || ''}\nFrame this section through the ${lensLabel} perspective. Prioritize ${lensLabel}-relevant metrics and language.\n${lensInstructions ? `USER INSTRUCTIONS: ${lensInstructions}` : ''}`
    : '';

  const batchPromises = blockOutlines.map(async (outline) => {
    const kpiSection = outline.mustIncludeKPIs.length > 0
      ? `\nKPIs TO WEAVE INTO THIS BLOCK:\n${outline.mustIncludeKPIs.map(k => `  • ${k}`).join('\n')}`
      : '';

    const exclusionSection = outline.mustNotCover.length > 0
      ? `\nDO NOT COVER (these are handled by other blocks):\n${outline.mustNotCover.map(k => `  • ${k}`).join('\n')}`
      : '';

    const prompt = `Write the "${outline.title}" section of a concept note for a Nature-Based Solutions project.

SECTION SCOPE: ${outline.scope}
Write exactly ${outline.paragraphCount} substantive paragraphs. Be specific with names, numbers, and locations.
${kpiSection}
${exclusionSection}
${lensBlock}

${projectContext}

ALL QUANTIFIED DATA:
${kpiSummary}

CO-BENEFITS: ${coBenefitSummary}
MRV: ${mrvSummary}

EVIDENCE:
${evidenceBlock}

Return JSON:
{
  "block": {
    "id": "${outline.id}",
    "title": "${outline.title}",
    "type": "${outline.type}",
    "lens": "${lensLabel || 'neutral'}",
    "contentMd": "Your markdown content here...",
    "evidenceTier": "${outline.evidenceTier}",
    "included": true,
    "kpis": [{ "name": "KPI used", "valueRange": "X-Y", "unit": "unit", "confidence": "MEDIUM" }]
  }
}

RULES:
- Use the provided human-readable zone names as-is
- Round numbers: "42 ha" not "42,436.70 m²"; "9.4 ha" not "9.388 ha"
- Use pathway words: "preparation facility" not "preparation_facility"
- Reference actual site names and intervention types from the portfolio
- Only include KPIs that YOU use in the text in the kpis array`;

    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          console.log(`   Retrying block ${outline.id} (attempt ${attempt + 1})...`);
        }

        const response = await openai.responses.create({
          model: "gpt-5.2",
          input: [
            {
              role: "developer",
              content: `You are an expert NBS concept note writer. Write one specific section for a funder-ready concept note.
Target funder pathway: ${funderPathway.primary ? formatPathway(funderPathway.primary) : 'General'}.${lensLabel ? ` Write with a strong "${lensLabel}" analytical lens: ${LENS_DESCRIPTIONS[lensLabel]}` : ''}
CRITICAL: Do NOT invent numbers. Only use the quantified KPI data provided. Write professional, evidence-based prose.
Always respond with valid JSON.`
            },
            { role: "user", content: prompt }
          ],
          text: { format: { type: "json_object" } },
          reasoning: { effort: "medium" },
          max_output_tokens: 3000,
        } as any);

        const content = extractTextFromResponse(response);
        const parsed = JSON.parse(content);
        return parsed.block as NarrativeBlock;
      } catch (error) {
        if (attempt === maxRetries) {
          console.error(`Failed to generate block ${outline.id} after ${maxRetries + 1} attempts:`, error);
          return {
            id: outline.id,
            title: outline.title,
            type: outline.type,
            lens: 'neutral',
            contentMd: `*Generation failed for this block. Please use the regenerate button to try again.*`,
            evidenceTier: outline.evidenceTier,
            included: true,
            kpis: [],
          } as NarrativeBlock;
        }
      }
    }

    return {
      id: outline.id,
      title: outline.title,
      type: outline.type,
      lens: 'neutral',
      contentMd: `*Generation failed for this block.*`,
      evidenceTier: outline.evidenceTier,
      included: true,
      kpis: [],
    } as NarrativeBlock;
  });

  return Promise.all(batchPromises);
}

// Phase 3: Generate co-benefits and downstream signals
async function generateSupplementary(
  projectContext: string,
  kpiSummary: string,
  coBenefitSummary: string,
  funderPathway: FunderPathway,
): Promise<{ coBenefits: CoBenefitCard[]; downstreamSignals: GenerateNarrativeResponse['downstreamSignals'] }> {
  const response = await openai.responses.create({
    model: "gpt-5.2",
    input: [
      {
        role: "developer",
        content: `You are an NBS project expert. Generate structured co-benefits and downstream signals for other modules.
Always respond with valid JSON.`
      },
      {
        role: "user",
        content: `Based on this NBS project, generate co-benefits and downstream signals.

${projectContext}

QUANTIFIED CO-BENEFITS FROM STEP 2:
${coBenefitSummary}

IMPACT DATA:
${kpiSummary}

Return JSON:
{
  "coBenefits": [
    {
      "id": "cb-1",
      "title": "Co-benefit title",
      "category": "HEALTH|BIODIVERSITY|ECONOMIC_VALUE|SOCIAL_COHESION|WATER_QUALITY|AIR_QUALITY",
      "description": "2-3 sentences describing the co-benefit...",
      "whoBenefits": ["group1", "group2"],
      "where": ["location1"],
      "confidence": "HIGH|MEDIUM|LOW",
      "evidenceTier": "EVIDENCE|MODELLED|ASSUMPTION",
      "included": true,
      "userNotes": ""
    }
  ],
  "downstreamSignals": {
    "operations": [
      { "id": "ops-1", "title": "Signal title", "description": "...", "whyItMatters": "...", "triggeredBy": ["intervention"], "ownerCandidates": ["owner"], "timeHorizon": "0-2y|2-5y|5-10y", "riskIfMissing": "...", "confidence": "MEDIUM", "included": true, "userNotes": "" }
    ],
    "businessModel": [
      { "id": "bm-1", "title": "Signal title", "description": "...", "whyItMatters": "...", "triggeredBy": ["intervention"], "ownerCandidates": ["owner"], "timeHorizon": "2-5y", "riskIfMissing": "...", "confidence": "MEDIUM", "included": true, "userNotes": "" }
    ],
    "mrv": [],
    "implementors": []
  }
}

Generate 4-6 co-benefits and 2-3 operations + 2-3 business model signals. Be specific to the project.`
      }
    ],
    text: { format: { type: "json_object" } },
    reasoning: { effort: "low" },
    max_output_tokens: 4000,
  } as any);

  const content = extractTextFromResponse(response);
  try {
    const parsed = JSON.parse(content);
    return {
      coBenefits: parsed.coBenefits || [],
      downstreamSignals: parsed.downstreamSignals || { operations: [], businessModel: [], mrv: [], implementors: [] },
    };
  } catch {
    return { coBenefits: [], downstreamSignals: { operations: [], businessModel: [], mrv: [], implementors: [] } };
  }
}

export async function generateNarrativeFromKPIs(
  request: NarrateFromKPIsRequest
): Promise<GenerateNarrativeResponse> {
  const { quantifiedImpacts, selectedZones, interventionBundles, funderPathway, projectName, cityName, projectId, lens, lensInstructions } = request;

  const lensLabel = lens && lens !== 'neutral' ? lens : null;
  console.log(`📝 3-Phase Narrative Pipeline${lensLabel ? ` [${lensLabel} lens]` : ''}`);

  const projectContext = buildProjectContext(selectedZones, interventionBundles, funderPathway, projectName, cityName);
  const { kpiSummary, coBenefitSummary, mrvSummary } = buildKPISummary(quantifiedImpacts);

  const ragProjectId = projectId || 'global-knowledge-base';
  console.log('🔍 Fetching RAG evidence for narrative...');
  const { evidenceBlock, topSources } = await fetchNarrativeEvidence(ragProjectId, selectedZones, interventionBundles);
  console.log(`   Found ${topSources.length} evidence sources`);

  // PHASE 1: Plan outline (prevents block duplication)
  const outline = await planNarrativeOutline(projectContext, kpiSummary, coBenefitSummary, mrvSummary, evidenceBlock, lens, lensInstructions);

  // PHASE 2: Generate all 10 blocks in parallel + supplementary in parallel
  console.log(`✍️  Phase 2: Generating blocks in parallel${lensLabel ? ` with ${lensLabel} lens` : ''}...`);
  const [narrativeBlocks, supplementary] = await Promise.all([
    generateBlocksBatch(outline.blocks, projectContext, kpiSummary, coBenefitSummary, mrvSummary, evidenceBlock, funderPathway, lens, lensInstructions),
    generateSupplementary(projectContext, kpiSummary, coBenefitSummary, funderPathway),
  ]);

  console.log(`✅ Phase 3: Assembled ${narrativeBlocks.length} blocks, ${supplementary.coBenefits.length} co-benefits`);

  return {
    narrativeBlocks,
    coBenefits: supplementary.coBenefits,
    downstreamSignals: supplementary.downstreamSignals,
  };
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
  interventionId?: string;
  interventionName?: string;
  category?: string;
}

export interface QuantifiedImpactGroup {
  id: string;
  hazardType: string;
  zoneId: string;
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

  // Step 1: Build search queries from hazard types + actual intervention categories/types
  const hazardTypes = Array.from(new Set(selectedZones.map(z => z.hazardType).filter(Boolean)));

  const allSiteCategories = new Set<string>();
  const allSiteTypes = new Set<string>();
  for (const zone of selectedZones) {
    for (const site of zone.interventionPortfolio || []) {
      if (site.category) allSiteCategories.add(site.category.replace(/_/g, ' '));
      if (site.interventionName) allSiteTypes.add(extractInterventionName(site.interventionName));
    }
  }
  const rawInterventionNames = enabledBundles.flatMap(b => b.interventions);
  const cleanInterventionNames = Array.from(new Set<string>([
    ...rawInterventionNames.map(extractInterventionName),
    ...Array.from(allSiteTypes),
  ]));

  const searchQueries: string[] = [];
  for (const hazard of hazardTypes) {
    const h = hazard.toLowerCase().replace(/_/g, ' ');
    searchQueries.push(`${h} risk reduction NBS urban quantified impact`);
    for (const intervention of cleanInterventionNames.slice(0, 4)) {
      searchQueries.push(`${h} ${intervention} effectiveness area reduction`);
    }
    for (const cat of Array.from(allSiteCategories).slice(0, 2)) {
      searchQueries.push(`${cat} ${h} impact quantification per hectare`);
    }
  }
  searchQueries.push("co-benefits nature-based solutions urban resilience quantified");
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

  // Step 5: Build focused LLM prompt with full site-level context
  const systemPrompt = `You are an expert in Nature-Based Solutions (NBS) quantification and evidence-based impact metrics.
Your task is to generate structured, quantified impact data grounded in evidence and anchored to specific zones and intervention sites.
Output ONLY valid JSON. Be honest about confidence levels and evidence tiers.
If evidence supports a metric, use EVIDENCE tier. If modelled/extrapolated, use MODELLED. If assumed, use ASSUMPTION.
CRITICAL: Use absolute values (not rates) wherever possible so KPIs can be summed across zones. When area or cost data is given, scale metrics proportionally.`;

  const zoneNameMap = new Map<string, string>();
  const zoneDetails = selectedZones.map(z => {
    const displayName = z.zoneName || z.zoneId;
    zoneNameMap.set(z.zoneId, displayName);
    const sites = (z.interventionPortfolio || []).map(s =>
      `    - ${s.interventionName}${s.assetName ? ` at ${s.assetName}` : ''} [${s.category?.replace(/_/g, ' ') || 'general'}] area: ${s.estimatedArea || '?'}${s.areaUnit || 'm²'}${s.estimatedCost ? `, cost: $${s.estimatedCost.min}-${s.estimatedCost.max} ${s.estimatedCost.unit}` : ''}${s.impacts ? `, flood: ${s.impacts.flood}, heat: ${s.impacts.heat}` : ''}`
    ).join('\n');
    return `  "${displayName}" (id: ${z.zoneId}, ${z.hazardType}, risk: ${(z.riskScore * 100).toFixed(0)}%, zone area: ${z.area || '?'}m²)\n${sites || '    (no specific intervention sites)'}`;
  }).join('\n');

  const userPrompt = `Generate quantified impact KPIs for this NBS project:

PROJECT CONTEXT:
- Project: ${projectName || 'Urban Climate Resilience Initiative'}
- City: ${cityName || 'Urban area'}
- Funder pathway: ${funderPathway.primary || 'General'}
- ${enabledBundles.length} bundles enabled: ${enabledBundles.map(b => `${b.name} [${b.targetHazards.join(',')}]`).join('; ')}

ZONES AND INTERVENTION SITES:
${zoneDetails}

EVIDENCE FROM KNOWLEDGE BASE:
${evidenceBlock}

Generate structured JSON. RULES:
- One impactGroup PER ZONE (not per hazard). Each group has zoneId matching the zone id.
- The "interventionBundle" field MUST use the human-readable zone name (e.g. "Zona Sul Residencial"), NOT the zone id.
- Each KPI should reference a specific interventionId and interventionName from that zone's sites when possible.
- Use ABSOLUTE values scaled to the actual site area/size (e.g. "340 m³/year" not "15-25% reduction") so values can be summed across zones.
- Include 3-5 KPIs per zone covering: primary hazard reduction, secondary benefits, and area/coverage metrics.

{
  "impactGroups": [
    {
      "id": "ig-{zoneId}",
      "hazardType": "FLOOD",
      "zoneId": "zone_12",
      "interventionBundle": "Zona Sul Residencial",
      "kpis": [
        {
          "id": "kpi-1",
          "name": "Stormwater runoff captured",
          "metric": "volume per year",
          "valueRange": { "low": 280, "high": 420 },
          "unit": "m³/year",
          "confidence": "MEDIUM",
          "evidenceTier": "MODELLED",
          "sourceChunkIds": [],
          "methodology": "Based on 200m² rain garden at 1.4-2.1 m³/m²/year capture rate",
          "interventionId": "int-123",
          "interventionName": "Rain garden",
          "category": "green infrastructure"
        }
      ]
    }
  ],
  "coBenefits": [4-6 items: { id, title, category, metric, valueRange: {low: number, high: number}, unit, confidence, evidenceTier, sourceChunkIds[], whoBenefits[], where[] }],
  IMPORTANT: Every co-benefit MUST have a numeric valueRange with low and high values. Estimate ranges if exact data is unavailable. Never omit valueRange.
  "mrvIndicators": [3-5 items: { id, name, metric, baselineValue, targetValue, frequency, dataSource, confidence }]
}`;

  const response = await openai.responses.create({
    model: "gpt-5.2",
    input: [
      { role: "developer", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    text: {
      format: { type: "json_object" },
    },
    reasoning: { effort: "low" },
    max_output_tokens: 16000,
  } as any);

  let content = extractTextFromResponse(response);
  
  // Strip markdown code blocks if present
  if (content.startsWith('```json')) {
    content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (content.startsWith('```')) {
    content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  content = content.trim();

  console.log(`📊 Quantify LLM response length: ${content.length} chars`);

  try {
    const parsed = JSON.parse(content);
    
    // Log if LLM returned empty results despite having evidence
    if ((!parsed.impactGroups || parsed.impactGroups.length === 0) && topChunks.length > 0) {
      console.warn(`⚠️  Quantify returned empty impactGroups despite ${topChunks.length} evidence chunks. Search queries:`, searchQueries.slice(0, 4));
    }
    
    console.log(`✅ Quantified ${parsed.impactGroups?.length || 0} impact groups, ${parsed.coBenefits?.length || 0} co-benefits, ${parsed.mrvIndicators?.length || 0} MRV indicators`);
    
    const flattenValue = (v: any): string | number | null => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'string' || typeof v === 'number') return v;
      if (typeof v === 'object') {
        return Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(', ');
      }
      return String(v);
    };

    const sanitizedMrv = (parsed.mrvIndicators || []).map((m: any) => ({
      ...m,
      baselineValue: flattenValue(m.baselineValue),
      targetValue: flattenValue(m.targetValue),
    }));

    const replaceZoneIds = (text: string) => {
      if (!text || typeof text !== 'string') return text;
      return text.replace(/\bzone_(\d+)\b/gi, (match, num) => {
        const fullId = `zone_${num}`;
        return zoneNameMap.get(fullId) || `Zone ${num}`;
      });
    };

    const sanitizedGroups = (parsed.impactGroups || []).map((g: any) => ({
      ...g,
      interventionBundle: (g.zoneId && zoneNameMap.has(g.zoneId))
        ? zoneNameMap.get(g.zoneId)
        : g.interventionBundle || g.zoneId || 'Zone',
      kpis: (g.kpis || []).map((k: any) => ({
        ...k,
        name: replaceZoneIds(k.name),
        metric: replaceZoneIds(k.metric),
        methodology: replaceZoneIds(k.methodology),
        interventionName: replaceZoneIds(k.interventionName),
      })),
    }));

    const sanitizedCoBenefits = (parsed.coBenefits || []).map((cb: any) => {
      let vr = cb.valueRange;
      if (!vr || typeof vr.low !== 'number' || typeof vr.high !== 'number') {
        vr = { low: 0, high: 0 };
      }
      return {
        ...cb,
        title: replaceZoneIds(cb.title),
        metric: replaceZoneIds(cb.metric),
        valueRange: vr,
        unit: cb.unit || 'qualitative',
      };
    });

    return {
      impactGroups: sanitizedGroups,
      coBenefits: sanitizedCoBenefits,
      mrvIndicators: sanitizedMrv,
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
    console.error("Failed to parse quantify response. Raw content:", content.slice(0, 500));
    console.error("Parse error:", error);
    throw new Error("Failed to generate quantified impacts - invalid response format");
  }
}
