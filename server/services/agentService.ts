import { openai, type Message, type ReasoningEffort } from "./openaiClient";
import { storage } from "../storage";
import { semanticSearch, getKnowledgeStats } from "./knowledgeService";
import { generateQuantifiedImpacts, generateNarrativeFromKPIs, regenerateBlock } from "./impactModelService";
import { 
  type InfoBlock, 
  type InfoBlockType, 
  type EvidenceRecord,
  type EvidenceType,
  type Assumption,
  type ProjectPatch,
  MODULE_REGISTRY,
  FIELD_VALIDATIONS,
  validateFieldValue,
  getRelatedPatches,
} from "@shared/schema";

export interface PageContext {
  moduleName: string;
  currentStep?: string;
  stepNumber?: number;
  totalSteps?: number;
  viewState?: string;
  additionalInfo?: Record<string, unknown>;
}

export interface AgentContext {
  projectId: string;
  userId?: string;
  currentModule?: InfoBlockType;
  currentPage?: string;
  currentStep?: number;
  pageGoal?: string;
  conversationHistory: Message[];
  pageContext?: PageContext;
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: object;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  result: unknown;
  error?: string;
}

const AGENT_TOOLS: AgentTool[] = [
  {
    name: "get_project_state",
    description: "Get the full state of the project including all blocks, evidence, assumptions, and pending patches",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "get_block",
    description: "Get the state of a specific module block (funder_selection, site_explorer, impact_model, operations, business_model)",
    parameters: {
      type: "object",
      properties: {
        blockType: {
          type: "string",
          enum: ["funder_selection", "site_explorer", "impact_model", "operations", "business_model"],
          description: "The type of block to retrieve",
        },
      },
      required: ["blockType"],
      additionalProperties: false,
    },
  },
  {
    name: "list_modules",
    description: "List all available modules with their sections and field paths for navigation",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "propose_patch",
    description: "Propose a field-level update to a block. The user will be asked to approve or reject the change.",
    parameters: {
      type: "object",
      properties: {
        blockType: {
          type: "string",
          enum: ["funder_selection", "site_explorer", "impact_model", "operations", "business_model"],
          description: "The block to update",
        },
        fieldPath: {
          type: "string",
          description: "Dot-notation path to the field (e.g., 'questionnaire.projectStage', 'zones.0.name')",
        },
        proposedValue: {
          type: "string",
          description: "The new value to set (as JSON string for complex values)",
        },
        rationale: {
          type: "string",
          description: "Explanation for why this change is recommended",
        },
      },
      required: ["blockType", "fieldPath", "proposedValue", "rationale"],
      additionalProperties: false,
    },
  },
  {
    name: "get_field_options",
    description: "Look up valid values for a field BEFORE proposing a patch. Use fieldPath='' (empty string) to list all validated fields for a module. Use a specific fieldPath to get valid values for that field.",
    parameters: {
      type: "object",
      properties: {
        blockType: {
          type: "string",
          enum: ["funder_selection", "site_explorer", "impact_model", "operations", "business_model"],
          description: "The module/block type",
        },
        fieldPath: {
          type: "string",
          description: "The field path to look up (e.g., 'questionnaire.projectStage'). Use empty string '' to list all validated fields for the module.",
        },
      },
      required: ["blockType", "fieldPath"],
      additionalProperties: false,
    },
  },
  {
    name: "record_evidence",
    description: "Record a piece of evidence linked to a specific field path",
    parameters: {
      type: "object",
      properties: {
        blockType: {
          type: "string",
          enum: ["funder_selection", "site_explorer", "impact_model", "operations", "business_model"],
          description: "The block this evidence relates to",
        },
        linkedPath: {
          type: "string",
          description: "The field path this evidence supports",
        },
        sourceType: {
          type: "string",
          enum: ["WEB", "DOCUMENT", "USER_INPUT", "CALCULATION", "EXTERNAL_API"],
          description: "Type of evidence source",
        },
        sourceRef: {
          type: "string",
          description: "Reference to the source (URL, document name, etc.)",
        },
        snippet: {
          type: "string",
          description: "Relevant excerpt from the source",
        },
        confidence: {
          type: "string",
          enum: ["HIGH", "MEDIUM", "LOW"],
          description: "Confidence level in this evidence",
        },
      },
      required: ["blockType", "linkedPath", "sourceType", "sourceRef", "snippet", "confidence"],
      additionalProperties: false,
    },
  },
  {
    name: "get_evidence",
    description: "Get all evidence records for the project",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "get_pending_patches",
    description: "Get all pending patches awaiting user approval",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "get_patch_status",
    description: "Check the status of a specific patch by ID to see if it was approved, rejected, or is still pending",
    parameters: {
      type: "object",
      properties: {
        patchId: {
          type: "string",
          description: "The ID of the patch to check",
        },
      },
      required: ["patchId"],
      additionalProperties: false,
    },
  },
  {
    name: "search_knowledge",
    description: "Search the knowledge base for evidence, research, and case studies. This includes the global NBS research library with quantified impacts (e.g., '56% rainfall retention by green roofs', '2°C temperature reduction in Medellín'). ALWAYS use this before generating impact narratives to ground them in evidence.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language search query describing what evidence you need (e.g., 'flood resilience green infrastructure quantified impacts')",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags to filter results. Use empty array [] for no filtering. Available: flood-resilience, heat-mitigation, slope-stabilization, co-benefits, latin-america, urban-greening, stormwater-management",
        },
      },
      required: ["query", "tags"],
      additionalProperties: false,
    },
  },
  {
    name: "lookup_location",
    description: "Look up a location by name or address using OpenStreetMap. Returns coordinates, area, and other details. Use this to find coordinates for a site before adding it as an intervention site.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Location name or address to search for (e.g., 'Lyon Park Porto Alegre', 'Rua Garibaldi 270 Porto Alegre')",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "find_zone_for_coordinates",
    description: "Given coordinates (lat, lng), find which intervention zone contains that location. Returns the zone ID, hazard type, and COMPATIBLE INTERVENTION TYPES for that zone. Always call this after lookup_location to get intervention options.",
    parameters: {
      type: "object",
      properties: {
        lat: {
          type: "number",
          description: "Latitude coordinate",
        },
        lng: {
          type: "number",
          description: "Longitude coordinate",
        },
      },
      required: ["lat", "lng"],
      additionalProperties: false,
    },
  },
  {
    name: "add_intervention_site",
    description: "Add a new intervention site to a zone's portfolio. Use this PROACTIVELY after finding a location and zone - present the user with intervention options and let them choose, then add the site directly.",
    parameters: {
      type: "object",
      properties: {
        zoneId: {
          type: "string",
          description: "The zone ID (e.g., 'zone_12')",
        },
        siteName: {
          type: "string",
          description: "Name of the site/asset",
        },
        interventionType: {
          type: "string",
          description: "Type of intervention (e.g., 'Cooling Campus', 'Tree Canopy', 'Floodable Park')",
        },
        category: {
          type: "string",
          enum: ["flood_storage", "urban_cooling", "slope_stability", "multi_benefit"],
          description: "Intervention category",
        },
        lat: {
          type: "number",
          description: "Latitude of site centroid",
        },
        lng: {
          type: "number",
          description: "Longitude of site centroid",
        },
        areaHa: {
          type: "number",
          description: "Area in hectares (from lookup_location)",
        },
        osmId: {
          type: "string",
          description: "OSM ID if available (from lookup_location)",
        },
      },
      required: ["zoneId", "siteName", "interventionType", "category", "lat", "lng", "areaHa", "osmId"],
      additionalProperties: false,
    },
  },
  {
    name: "select_funder",
    description: "Select a funder for the project. This will update all related fields (targetFunders, shortlistedFunds, fundingPlan) properly so the UI reflects the change. Use this instead of propose_patch when changing funder selections.",
    parameters: {
      type: "object",
      properties: {
        fundId: {
          type: "string",
          description: "The ID of the fund to select (e.g., 'fnmc-grants', 'idb-esp', 'caf-environment')",
        },
        funderType: {
          type: "string",
          enum: ["preparation", "implementation"],
          description: "Whether this is for preparation funding (now) or implementation funding (next/target)",
        },
      },
      required: ["fundId", "funderType"],
      additionalProperties: false,
    },
  },
  {
    name: "regenerate_kpis",
    description: "Regenerate the quantified impact KPIs for the Impact Model. This triggers the full RAG-grounded quantification pipeline using the project's zones, intervention bundles, and funder context. The results replace the current quantified impacts. Use when the user wants to re-quantify impacts (e.g., after adding new intervention sites or changing zones).",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief explanation of why KPIs are being regenerated (shown to user)",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "regenerate_narrative",
    description: "Regenerate the ENTIRE impact narrative for the Impact Model. This triggers the full 3-phase narrative pipeline (Plan → Generate → Assemble) using existing quantified KPIs. Optionally applies an analytical lens. Use when the user wants to regenerate ALL blocks, a different lens perspective, or provides custom instructions for the whole narrative.",
    parameters: {
      type: "object",
      properties: {
        lens: {
          type: "string",
          enum: ["neutral", "climate", "social", "financial", "institutional"],
          description: "Analytical lens to apply. 'neutral' = balanced/default, 'climate' = GHG & resilience focus, 'social' = equity & health focus, 'financial' = ROI & bankability focus, 'institutional' = governance & capacity focus.",
        },
        customInstructions: {
          type: "string",
          description: "Optional custom instructions from the user for narrative focus (e.g., 'emphasize biodiversity co-benefits', 'focus on heat island reduction').",
        },
        reason: {
          type: "string",
          description: "Brief explanation of why the narrative is being regenerated (shown to user)",
        },
      },
      required: ["lens", "customInstructions", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "regenerate_block",
    description: "Regenerate a SINGLE narrative block in the Impact Model. Use this when the user wants to refine or change a specific section of the narrative (e.g., 'make the Executive Summary more concise', 'add more data to Risk Assessment'). This is much faster than regenerating the entire narrative. The block is regenerated with the user's custom instructions while preserving all other blocks.",
    parameters: {
      type: "object",
      properties: {
        blockId: {
          type: "string",
          description: "The ID of the narrative block to regenerate (e.g., 'block-1', 'summary-1'). Get this from the pageContext's editingBlock.id or from the current narrative state.",
        },
        lens: {
          type: "string",
          enum: ["neutral", "climate", "social", "financial", "institutional"],
          description: "Which lens variant the block belongs to. Use the lens from pageContext's editingBlock.lens if available.",
        },
        customInstructions: {
          type: "string",
          description: "The user's instructions for how to change this block (e.g., 'focus more on financial ROI', 'add specific numbers from the KPIs', 'make it shorter and more direct').",
        },
        reason: {
          type: "string",
          description: "Brief summary of changes the user wants (shown for confirmation).",
        },
      },
      required: ["blockId", "lens", "customInstructions", "reason"],
      additionalProperties: false,
    },
  },
];

const SYSTEM_PROMPT = `You are an AI assistant for the NBS (Nature-Based Solutions) Project Builder platform.
You help city planners and project managers develop climate resilience projects using nature-based solutions.

## Knowledge Workspace
You have access to a Knowledge Workspace that stores:
- **Project Data**: Funder Selection, Site Explorer, Impact Model, Operations, Business Model modules
- **Global Knowledge Base**: Research synthesis on NBS effectiveness with quantified impacts from peer-reviewed studies and case studies (especially Latin American cities like Medellín, Mexico City, Rio de Janeiro)

## Funder Selection

### Changing Funders
When the user wants to change the preparation funder or implementation funder:
- **ALWAYS use the select_funder tool** instead of propose_patch
- This ensures all related fields (targetFunders, shortlistedFunds, fundingPlan) are updated together
- The select_funder tool creates proper patches for the UI to reflect the change
- Available fund IDs: fnmc-grants, idb-esp, caf-environment, bndes-fundo-clima, fonplata-green, caixa-finisa, etc.

### Valid Field Values for Questionnaire
When modifying the Funder Selection questionnaire, you MUST use these exact values:
- **projectStage**: "idea", "concept", "prefeasibility", "feasibility", "procurement"
- **existingElements**: "capex", "timeline", "location", "assessments", "agency", "none"
- **sectors**: "nature_based", "transport", "energy", "water", "waste", "urban_resilience", "other"
- **investmentSize**: "under_1m", "1_5m", "5_20m", "20_50m", "over_50m", "unknown"
- **budgetPreparation/budgetImplementation/generatesRevenue/canTakeDebt/nationalApproval/openToBundling**: "yes", "no"
- **fundingReceiver**: "municipality", "utility", "special_purpose_vehicle", "ngo", "other"

For example, if a user says "we have a concept note", set projectStage to "concept". If they say "we have a timeline", add "timeline" to existingElements.

## Impact Model Module
The Impact Model is a 3-step wizard: **Setup → Quantify → Generate & Refine Narrative**.

### Step 1 — Setup
Configure prioritization weights and intervention bundles. The user enables/disables bundles and adjusts weights.

### Step 2 — Quantify
Generates RAG-grounded quantified KPIs for each zone/intervention. Shows results grouped by hazard type → zone, with per-hazard subtotals and a project-wide summary.
- Use **regenerate_kpis** tool to re-run quantification (e.g., after the user adds new intervention sites or changes zones)
- KPIs include flood risk reduction, heat mitigation, slope stability, and co-benefits

### Step 3 — Generate & Refine Narrative
Generates a 10-block funder-ready narrative via 3-phase pipeline (Plan → Generate → Assemble). Supports analytical lenses:
- **Neutral**: Balanced/default perspective
- **Climate**: GHG reductions, resilience metrics, adaptation pathways
- **Social**: Equity, health outcomes, community benefits, vulnerability reduction
- **Financial**: ROI, bankability, cost-benefit, revenue potential
- **Institutional**: Governance capacity, implementation readiness, partnerships

Use **regenerate_narrative** tool to:
- Create a new narrative with a different analytical lens
- Apply custom instructions (e.g., "emphasize biodiversity", "focus on flood risk reduction for the IDB funder")
- Regenerate after KPIs have been updated

Use **regenerate_block** tool to:
- Refine a SINGLE narrative block based on user instructions (much faster than full regeneration)
- The user may open chat from a specific block's edit menu — check pageContext.additionalInfo.editingBlock for block ID, title, type, and lens
- When the user wants to change just one section, ALWAYS prefer regenerate_block over regenerate_narrative

### Block-Level Chat Editing Flow
When a user opens chat from a narrative block's edit menu:
1. The pageContext will contain editingBlock info (id, title, type, lens)
2. Ask what they want to change about that specific block
3. Summarize the requested changes as a bullet list
4. Ask for confirmation: "I'll regenerate this block with these changes — shall I proceed?"
5. On confirmation, use regenerate_block with the block ID and lens from pageContext
6. After regeneration, ask: "Does the updated version look good, or would you like further changes?"

### Agent Guidance for Impact Model
- If user is on Step 1: Help configure bundles and weights, explain what each bundle includes
- If user is on Step 2: Explain KPI results, suggest re-quantification if inputs changed, help interpret numbers
- If user is on Step 3: Help refine narrative, suggest lens perspectives, explain what each narrative block covers
- When the user asks to change a SPECIFIC block/section → use regenerate_block tool
- When the user asks to "regenerate" or "redo" the ENTIRE narrative → use regenerate_narrative tool
- When the user asks to "re-quantify" or "update KPIs" → use regenerate_kpis tool
- After regeneration, the page updates automatically — no need to tell users to refresh

## Evidence-Based Approach
When generating or editing Impact Model narratives:
1. FIRST use search_knowledge to find relevant evidence from the knowledge base
2. Include specific quantified impacts in your narratives (e.g., "green roofs retain 56% of rainfall", "2°C temperature reduction", "40-90% peak runoff reduction")
3. Reference real case studies when relevant (e.g., Medellín's Green Corridors, Mexico City's La Quebradora park)
4. Connect interventions to measurable co-benefits (health, equity, biodiversity, carbon)

## Workflow for Field Updates
1. When user requests a change, use get_field_options to verify the value is valid
2. If the value IS valid: IMMEDIATELY use propose_patch - do NOT ask for confirmation first
3. If the value is NOT valid or ambiguous: ask the user to clarify which valid option they want
4. For Impact Model narratives: search_knowledge for evidence BEFORE proposing
5. After proposing, tell user to approve or reject the pending change

## Field Validation
- All patches are validated before being created. Invalid values will be rejected.
- Use get_field_options to see what values are allowed for a field.
- For enum fields, you MUST use one of the exact valid values.
- For enumArray fields, provide an array containing only valid values.
- When user's request clearly matches a valid value, propose immediately without asking.

## Key Evidence in Knowledge Base
- Flood resilience: green roofs (56% rainfall retention), bioretention (40-90% peak flow reduction), wetlands (50-95% flood peak reduction)
- Heat mitigation: urban forests (1-3°C cooling), green roofs (15-45°C surface temperature reduction, 50% cooling load reduction)
- Slope stabilization: vetiver grass (60-90% soil loss reduction), deep-rooted vegetation for soil cohesion
- Case studies: Medellín Green Corridors ($16M for 2°C cooling), Mexico City La Quebradora (flood control + aquifer recharge)

## Adding Intervention Sites (Site Explorer) - BE PROACTIVE!
When a user mentions a location or wants to add a site:
1. Use lookup_location to find coordinates AND area (you'll get areaHa and osmId from the result)
2. Use find_zone_for_coordinates with lat/lng - this returns the zone AND compatible intervention types
3. BE PROACTIVE: Present the compatible intervention options as a list for the user to choose from:
   - "I found [Site Name] ([area] ha) in [Zone X] ([hazard type]). Here are the compatible interventions:
     • Urban Cooling: Shade & Cooling Retrofit, Tree Canopy, Cooling Campus, Green Roof
     • Multi-Benefit: Green Corridor, Eco-Park
     Which would you like to add?"
4. When user chooses an intervention type, use add_intervention_site to ADD THE SITE DIRECTLY (no approval needed!)
   - Pass all required parameters: zoneId, siteName, interventionType, category, lat, lng, areaHa, osmId
5. Confirm the site was added and tell user to refresh Site Explorer to see it on the map

IMPORTANT: 
- Don't ask multiple questions. After finding the location and zone, immediately present intervention options.
- The add_intervention_site tool creates a PENDING PATCH for user approval - they can approve or reject it.
- The lookup_location tool returns areaHa and osmId - pass these to add_intervention_site.

## User-Friendly Communication
When summarizing project data (like questionnaire responses), NEVER show raw schema fields.
Instead, present information in a readable format:
- Group by logical sections (e.g., "Project Status", "Budget & Financing", "Governance")
- Use plain language labels (e.g., "Project stage: Early idea phase" not "projectStage: idea")
- Use simple bullet points with clear descriptions
- Translate enum values to readable text:
  - "idea" → "Early idea phase"
  - "concept" → "Concept stage"  
  - "prefeasibility" → "Pre-feasibility study"
  - "feasibility" → "Feasibility study"
  - "procurement" → "Ready for procurement"
  - "under_1m" → "Under $1 million"
  - "1_5m" → "$1-5 million"
  - "5_20m" → "$5-20 million"
  - "20_50m" → "$20-50 million"
  - "over_50m" → "Over $50 million"
  - "nature_based" → "Nature-based solutions"
  - "urban_resilience" → "Urban resilience"
  - "yes"/"no" → "Yes"/"No"
  - "municipality" → "Municipality/City government"
  - "capex" → "Capital expenditure estimate"
  - "timeline" → "Project timeline"
  - "location" → "Site location identified"
  - "assessments" → "Technical assessments"
  - "agency" → "Implementing agency defined"

Example summary format:
"Here's a summary of your funding preparedness:

**Project Status**
• Stage: Early idea phase
• Sectors: Nature-based solutions, Urban resilience

**Budget & Financing**
• Investment size: Over $50 million
• Budget for preparation: No
• Budget for implementation: Partial
• Revenue generation: Yes (from user fees)
• Can take on debt: Yes

**Governance & Approvals**
• National approval: Yes
• Funding receiver: Municipality

What would you like to update?"

Communication guidelines:
- Be concise and professional
- Ground narratives in evidence with specific numbers when available
- When proposing changes, explain what will be saved and cite supporting evidence
- After proposing, remind the user to approve or reject pending changes`;

export async function executeAgentTool(
  context: AgentContext,
  toolCall: ToolCall
): Promise<ToolResult> {
  const { projectId } = context;
  const { name, arguments: args } = toolCall;

  try {
    switch (name) {
      case "get_project_state": {
        const blocks = await storage.getInfoBlocksByProject(projectId);
        const evidence = await storage.getEvidenceByProject(projectId);
        const assumptions = await storage.getAssumptionsByProject(projectId);
        const pendingPatches = await storage.getPendingPatches(projectId);
        const project = await storage.getProject(projectId);

        return {
          name,
          result: {
            project: project ? {
              id: project.id,
              actionName: project.actionName,
              actionType: project.actionType,
              cityId: project.cityId,
            } : null,
            blocks: blocks.map(b => ({
              blockType: b.blockType,
              status: b.status,
              completionPercent: b.completionPercent,
              updatedAt: b.updatedAt,
            })),
            evidenceCount: evidence.length,
            assumptionCount: assumptions.length,
            pendingPatchCount: pendingPatches.length,
          },
        };
      }

      case "get_block": {
        const blockType = args.blockType as InfoBlockType;
        const block = await storage.getInfoBlock(projectId, blockType);
        
        if (!block) {
          return {
            name,
            result: null,
            error: `Block ${blockType} not found for this project`,
          };
        }

        return {
          name,
          result: {
            blockType: block.blockType,
            status: block.status,
            completionPercent: block.completionPercent,
            state: block.blockStateJson,
            updatedAt: block.updatedAt,
            version: block.version,
          },
        };
      }

      case "list_modules": {
        return {
          name,
          result: MODULE_REGISTRY,
        };
      }

      case "get_field_options": {
        const { blockType, fieldPath } = args as {
          blockType: string;
          fieldPath: string;
        };
        
        const moduleValidations = FIELD_VALIDATIONS[blockType];
        if (!moduleValidations) {
          return {
            name,
            result: {
              hasValidation: false,
              message: `No validation rules defined for module "${blockType}". You may use any valid value.`,
            },
          };
        }

        // If empty fieldPath, list all available validations for the module
        if (!fieldPath || fieldPath === '') {
          const fieldList = moduleValidations.map(v => ({
            fieldPath: v.fieldPath,
            label: v.label || v.fieldPath,
            type: v.validation.type,
            values: 'values' in v.validation ? v.validation.values : undefined,
          }));
          return {
            name,
            result: {
              hasValidation: true,
              module: blockType,
              fields: fieldList,
              message: `Available validated fields for ${blockType}. Use get_field_options with a specific fieldPath to see valid values.`,
            },
          };
        }
        
        // Try exact match first
        let entry = moduleValidations.find(v => v.fieldPath === fieldPath);
        
        // Then try wildcard patterns (e.g., "coBenefits.0.category" matches "coBenefits.*.category")
        if (!entry) {
          const matchesWildcard = (concrete: string, pattern: string): boolean => {
            const concreteSegs = concrete.split('.');
            const patternSegs = pattern.split('.');
            if (concreteSegs.length !== patternSegs.length) return false;
            return patternSegs.every((p, i) => p === '*' || p === concreteSegs[i]);
          };
          entry = moduleValidations.find(v => 
            v.fieldPath.includes('*') && matchesWildcard(fieldPath, v.fieldPath)
          );
        }
        
        if (!entry) {
          return {
            name,
            result: {
              hasValidation: false,
              message: `No validation rules defined for field "${fieldPath}" in "${blockType}". You may use any valid value.`,
            },
          };
        }
        
        const { validation, label } = entry;
        return {
          name,
          result: {
            hasValidation: true,
            fieldPath: entry.fieldPath,
            matchedFrom: fieldPath,
            label: label || fieldPath,
            validationType: validation.type,
            validValues: 'values' in validation ? validation.values : undefined,
            constraints: validation.type === 'number' ? { min: (validation as any).min, max: (validation as any).max } : undefined,
            message: `Use ONLY these values when proposing changes to ${label || fieldPath}.`,
          },
        };
      }

      case "propose_patch": {
        const { blockType, fieldPath, proposedValue: rawProposedValue, rationale } = args as {
          blockType: InfoBlockType;
          fieldPath: string;
          proposedValue: unknown;
          rationale: string;
        };

        // Parse the proposed value - it might be a JSON string
        let proposedValue: unknown = rawProposedValue;
        if (typeof rawProposedValue === 'string') {
          try {
            // Try to parse as JSON (handles '"partial"' -> 'partial', '[...]' -> [...], etc.)
            const parsed = JSON.parse(rawProposedValue);
            proposedValue = parsed;
          } catch {
            // Not valid JSON, use as-is (already a plain string)
            proposedValue = rawProposedValue;
          }
        }
        console.log(`[propose_patch] blockType=${blockType}, fieldPath=${fieldPath}, rawValue=${JSON.stringify(rawProposedValue)}, parsedValue=${JSON.stringify(proposedValue)}`);

        // Validate the proposed value BEFORE creating the patch
        const validationError = validateFieldValue(blockType, fieldPath, proposedValue);
        if (validationError) {
          // Look up valid options to include in error
          const moduleValidations = FIELD_VALIDATIONS[blockType];
          const entry = moduleValidations?.find(v => v.fieldPath === fieldPath);
          const validOptions = entry && 'values' in entry.validation ? entry.validation.values : [];
          
          return {
            name,
            result: null,
            error: `${validationError}. Use get_field_options tool to look up valid values before proposing.`,
          };
        }

        const block = await storage.getInfoBlock(projectId, blockType);
        const blockData = (block?.blockStateJson as Record<string, unknown>) || {};
        const oldValue = block ? getNestedValue(blockData, fieldPath) : undefined;

        const patch = await storage.createPatch({
          projectId,
          blockType,
          fieldPath,
          operation: "set",
          value: proposedValue as any,
          previousValue: oldValue as any,
          status: "pending",
          proposedBy: "agent",
          proposedByAgentId: "city-project-assistant",
        });

        const allPatches = [{ id: patch.id, fieldPath, value: proposedValue }];

        // Check for related fields that need to be updated
        const relatedPatches = getRelatedPatches(blockType, fieldPath, proposedValue, blockData);
        for (const related of relatedPatches) {
          const relatedPatch = await storage.createPatch({
            projectId,
            blockType,
            fieldPath: related.fieldPath,
            operation: "set",
            value: related.value as any,
            previousValue: getNestedValue(blockData, related.fieldPath) as any,
            status: "pending",
            proposedBy: "agent",
            proposedByAgentId: "city-project-assistant",
          });
          allPatches.push({ id: relatedPatch.id, fieldPath: related.fieldPath, value: related.value });
        }

        await storage.createAgentAction({
          projectId,
          actor: "agent",
          actorId: "city-project-assistant",
          actionType: "propose_patch",
          actionStatus: "proposed",
          targetBlockType: blockType,
          targetFieldPath: fieldPath,
          previousValue: oldValue as any,
          proposedPatch: { value: proposedValue, rationale, relatedPatches: relatedPatches.length > 0 ? relatedPatches : undefined },
        });

        const message = allPatches.length > 1 
          ? `Proposed ${allPatches.length} related changes. Awaiting user approval.`
          : "Patch proposed. Awaiting user approval.";

        return {
          name,
          result: {
            patchId: patch.id,
            allPatches,
            blockType,
            fieldPath,
            proposedValue,
            message,
          },
        };
      }

      case "record_evidence": {
        const { blockType, linkedPath, sourceType, sourceRef, snippet, confidence } = args as {
          blockType: InfoBlockType;
          linkedPath: string;
          sourceType: "WEB" | "DOCUMENT" | "USER_INPUT" | "CALCULATION" | "EXTERNAL_API";
          sourceRef: string;
          snippet: string;
          confidence: "HIGH" | "MEDIUM" | "LOW";
        };

        const evidenceTypeMap: Record<string, EvidenceType> = {
          "WEB": "citation",
          "DOCUMENT": "citation",
          "USER_INPUT": "user_note",
          "CALCULATION": "api_response",
          "EXTERNAL_API": "api_response",
        };

        const evidence = await storage.createEvidenceRecord({
          projectId,
          evidenceType: evidenceTypeMap[sourceType] || "user_note",
          title: `Evidence from ${sourceRef}`,
          summary: snippet,
          sourceUrl: sourceType === "WEB" ? sourceRef : undefined,
          sourceLabel: sourceRef,
          linkedPaths: [linkedPath],
          linkedBlockTypes: [blockType],
          confidence,
          createdBy: "agent",
        });

        return {
          name,
          result: {
            evidenceId: evidence.id,
            message: "Evidence recorded successfully",
          },
        };
      }

      case "get_evidence": {
        const evidence = await storage.getEvidenceByProject(projectId);
        return {
          name,
          result: evidence.map(e => ({
            id: e.id,
            evidenceType: e.evidenceType,
            title: e.title,
            summary: e.summary,
            linkedPaths: e.linkedPaths,
            linkedBlockTypes: e.linkedBlockTypes,
            sourceUrl: e.sourceUrl,
            sourceLabel: e.sourceLabel,
            confidence: e.confidence,
            isActive: e.isActive,
          })),
        };
      }

      case "get_pending_patches": {
        const patches = await storage.getPendingPatches(projectId);
        return {
          name,
          result: patches.map(p => ({
            id: p.id,
            blockType: p.blockType,
            fieldPath: p.fieldPath,
            operation: p.operation,
            value: p.value,
            previousValue: p.previousValue,
            proposedBy: p.proposedBy,
            createdAt: p.createdAt,
          })),
        };
      }

      case "get_patch_status": {
        const { patchId } = args as { patchId: string };
        const patches = await storage.getPatchesByIds([patchId]);
        if (patches.length === 0) {
          return {
            name,
            result: { found: false, message: `Patch ${patchId} not found` },
          };
        }
        const patch = patches[0];
        return {
          name,
          result: {
            found: true,
            id: patch.id,
            status: patch.status,
            blockType: patch.blockType,
            fieldPath: patch.fieldPath,
            value: patch.value,
            previousValue: patch.previousValue,
            appliedAt: patch.appliedAt,
            appliedBy: patch.appliedBy,
          },
        };
      }

      case "search_knowledge": {
        const { query, blockType, limit, tags } = args as {
          query: string;
          blockType?: InfoBlockType;
          limit?: number;
          tags?: string[];
        };

        const searchResult = await semanticSearch(projectId, query, {
          blockType,
          limit: limit || 5,
          tags,
          includeGlobalKnowledge: true,
        });

        return {
          name,
          result: {
            query: searchResult.query,
            totalResults: searchResult.totalCount,
            chunks: searchResult.chunks.map(c => ({
              content: c.content,
              score: c.score.toFixed(3),
              blockType: c.blockType,
              fieldPath: c.fieldPath,
              sourceType: c.source?.sourceType,
              sourceTitle: c.source?.title,
              category: (c.metadata as any)?.category,
              tags: (c.metadata as any)?.tags,
            })),
          },
        };
      }

      case "lookup_location": {
        const { query } = args as { query: string };
        
        // Normalize query: remove accents for better Nominatim matching
        const normalizedQuery = query
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove accent marks
          .toLowerCase();
        
        // Porto Alegre bounding box for constrained local search
        const portoAlegreBbox = [-30.27, -51.32, -29.93, -51.01]; // [south, west, north, east]
        
        const searchUrl = new URL('https://nominatim.openstreetmap.org/search');
        searchUrl.searchParams.append('q', normalizedQuery);
        searchUrl.searchParams.append('format', 'json');
        searchUrl.searchParams.append('addressdetails', '1');
        searchUrl.searchParams.append('limit', '10');
        searchUrl.searchParams.append('countrycodes', 'br'); // Constrain to Brazil
        // Use viewbox to prefer results in Porto Alegre area
        searchUrl.searchParams.append('viewbox', `${portoAlegreBbox[1]},${portoAlegreBbox[0]},${portoAlegreBbox[3]},${portoAlegreBbox[2]}`);
        searchUrl.searchParams.append('bounded', '0'); // Prefer but don't strictly limit to viewbox
        
        console.log(`🔍 Agent lookup_location: "${query}" → normalized: "${normalizedQuery}"`);
        
        const response = await fetch(searchUrl.toString(), {
          headers: {
            'User-Agent': 'NBS-Project-Builder/1.0 (https://nbs-project-preparation.replit.app; nbs-project-builder@replit.dev)',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        
        if (!response.ok) {
          console.log(`❌ Nominatim lookup failed: ${response.statusText}`);
          return {
            name,
            result: null,
            error: `Location lookup failed: ${response.statusText}`,
          };
        }
        
        const results = await response.json() as any[];
        console.log(`   Found ${results.length} results for "${query}"`);
        
        if (results.length === 0) {
          return {
            name,
            result: {
              found: false,
              message: `No locations found for "${query}" in Porto Alegre area. Try: 1) A simpler name (e.g., just "Grêmio Náutico" instead of full name), 2) The street address, or 3) Ask the user to search in Site Explorer → Add Custom Site which has more flexible matching.`,
            },
          };
        }
        
        // Calculate area from Nominatim bounding box (same as UI does)
        const calcArea = (bbox: string[]): number => {
          if (!bbox || bbox.length !== 4) return 0;
          const [south, north, west, east] = bbox.map(Number);
          const latSpan = north - south;
          const lngSpan = east - west;
          const avgLat = (south + north) / 2;
          const metersPerDegreeLat = 111320;
          const metersPerDegreeLng = 111320 * Math.cos(avgLat * Math.PI / 180);
          return (latSpan * metersPerDegreeLat) * (lngSpan * metersPerDegreeLng);
        };
        
        const locations = results.map((r: any) => ({
          name: r.display_name.split(',')[0],
          fullAddress: r.display_name,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          type: r.type || r.class || 'place',
          osmId: r.osm_id,
          osmType: r.osm_type,
          areaM2: calcArea(r.boundingbox),
          areaHa: Math.round(calcArea(r.boundingbox) / 10000 * 100) / 100, // hectares
        }));
        
        const firstLocation = locations[0];
        
        return {
          name,
          result: {
            found: true,
            count: locations.length,
            locations,
            bestMatch: firstLocation,
            message: `Found "${firstLocation.name}" (${firstLocation.areaHa} ha) at coordinates ${firstLocation.lat}, ${firstLocation.lng}. Now use find_zone_for_coordinates to check which zone it's in and get compatible intervention types.`,
          },
        };
      }

      case "find_zone_for_coordinates": {
        const { lat, lng } = args as { lat: number; lng: number };
        
        // Load the zones data
        const fs = await import('fs/promises');
        const path = await import('path');
        const zonesPath = path.join(process.cwd(), 'client', 'public', 'sample-data', 'porto-alegre-zones.json');
        
        let zonesData: any;
        try {
          const zonesJson = await fs.readFile(zonesPath, 'utf-8');
          zonesData = JSON.parse(zonesJson);
        } catch (error) {
          return {
            name,
            result: null,
            error: 'Could not load zones data. This feature is only available for Porto Alegre sample project.',
          };
        }
        
        // Check if point is inside any zone polygon
        const pointInPolygon = (point: [number, number], polygon: number[][]): boolean => {
          const [x, y] = point;
          let inside = false;
          for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
          }
          return inside;
        };
        
        const features = zonesData?.geoJson?.features || zonesData?.features || [];
        
        for (const feature of features) {
          const coords = feature.geometry?.coordinates;
          if (!coords) continue;
          
          // Handle both Polygon and MultiPolygon
          const polygons = feature.geometry.type === 'MultiPolygon' 
            ? coords.map((p: any) => p[0])
            : [coords[0]];
          
          for (const polygon of polygons) {
            // GeoJSON uses [lng, lat], we need to check with [lng, lat]
            if (pointInPolygon([lng, lat], polygon)) {
              const props = feature.properties || {};
              
              // Determine compatible intervention categories based on zone's primary hazard
              const hazard = props.primaryHazard?.toUpperCase() || '';
              const compatibleCategories: { id: string; name: string; examples: string[] }[] = [];
              
              if (hazard.includes('FLOOD')) {
                compatibleCategories.push({
                  id: 'flood_storage',
                  name: 'Flood Storage & Delay',
                  examples: ['Floodable Park', 'Sponge Square', 'Retention Yard', 'Bioswales'],
                });
              }
              if (hazard.includes('HEAT')) {
                compatibleCategories.push({
                  id: 'urban_cooling',
                  name: 'Urban Cooling & Shade',
                  examples: ['Shade & Cooling Retrofit', 'Tree Canopy', 'Cool Pavement', 'Green Roof', 'Cooling Campus'],
                });
              }
              if (hazard.includes('LANDSLIDE')) {
                compatibleCategories.push({
                  id: 'slope_stability',
                  name: 'Slope Stabilization',
                  examples: ['Vetiver Terraces', 'Root Network Planting', 'Infiltration Buffers'],
                });
              }
              compatibleCategories.push({
                id: 'multi_benefit',
                name: 'Multi-Benefit Solutions',
                examples: ['Green Corridor', 'Eco-Park', 'Urban Forest Patch'],
              });
              
              return {
                name,
                result: {
                  found: true,
                  zoneId: props.zoneId,
                  zoneName: `Zone ${props.zoneId?.replace('zone_', '')}`,
                  typology: props.typologyLabel,
                  primaryHazard: props.primaryHazard,
                  interventionType: props.interventionType,
                  riskScores: {
                    flood: props.meanFlood,
                    heat: props.meanHeat,
                    landslide: props.meanLandslide,
                  },
                  compatibleCategories,
                  message: `Location is in ${props.zoneId} (${props.typologyLabel}). Compatible intervention types: ${compatibleCategories.map(c => c.name).join(', ')}. Use add_intervention_site to propose adding this site with your chosen intervention type.`,
                },
              };
            }
          }
        }
        
        return {
          name,
          result: {
            found: false,
            message: `The coordinates (${lat}, ${lng}) are not within any intervention zone. The location may be outside the study area.`,
          },
        };
      }
      
      case "add_intervention_site": {
        console.log('🔧 add_intervention_site called with args:', JSON.stringify(args));
        
        const { zoneId, siteName, interventionType, category, lat, lng, areaHa, osmId, zoneRiskLevels } = args as {
          zoneId: string;
          siteName: string;
          interventionType: string;
          category: string;
          lat: number;
          lng: number;
          areaHa: number;
          osmId: string;
          zoneRiskLevels?: { flood: number; heat: number; landslide: number };
        };
        
        console.log(`📍 Adding site: ${siteName} to ${zoneId} as ${interventionType} (${category})`);
        
        // Intervention cost and impact lookup table
        const INTERVENTION_DATA: Record<string, { costPerHa: { min: number; max: number }; impacts: { flood: string; heat: string; landslide: string } }> = {
          'Floodable Park / Detention Basin': { costPerHa: { min: 50000, max: 300000 }, impacts: { flood: 'high', heat: 'medium', landslide: 'low' } },
          'Sponge Square / Plaza': { costPerHa: { min: 800000, max: 2500000 }, impacts: { flood: 'medium', heat: 'medium', landslide: 'low' } },
          'Multi-use Retention Yard': { costPerHa: { min: 400000, max: 1500000 }, impacts: { flood: 'medium-high', heat: 'medium', landslide: 'low' } },
          'Detention & Infiltration Field': { costPerHa: { min: 60000, max: 200000 }, impacts: { flood: 'medium', heat: 'low-medium', landslide: 'low' } },
          'Constructed Wetland': { costPerHa: { min: 30000, max: 120000 }, impacts: { flood: 'high', heat: 'medium', landslide: 'low' } },
          'Permeable Street Retrofit': { costPerHa: { min: 500000, max: 1500000 }, impacts: { flood: 'low-medium', heat: 'low', landslide: 'low' } },
          'Tree Canopy Corridor': { costPerHa: { min: 100000, max: 300000 }, impacts: { flood: 'low-medium', heat: 'high', landslide: 'low' } },
          'Shade & Cooling Retrofit': { costPerHa: { min: 500000, max: 2000000 }, impacts: { flood: 'low', heat: 'medium-high', landslide: 'low' } },
          'Cooling Campus': { costPerHa: { min: 30000, max: 150000 }, impacts: { flood: 'low-medium', heat: 'high', landslide: 'low' } },
          'Green Roof Network': { costPerHa: { min: 1000000, max: 3000000 }, impacts: { flood: 'medium', heat: 'high', landslide: 'low' } },
          'Cool Pavement Program': { costPerHa: { min: 200000, max: 500000 }, impacts: { flood: 'low', heat: 'medium', landslide: 'low' } },
          'Terraced Green Buffer': { costPerHa: { min: 80000, max: 250000 }, impacts: { flood: 'medium', heat: 'medium', landslide: 'high' } },
          'Slope Forest Belt': { costPerHa: { min: 15000, max: 60000 }, impacts: { flood: 'medium', heat: 'medium', landslide: 'high' } },
          'Retention Terrace System': { costPerHa: { min: 100000, max: 400000 }, impacts: { flood: 'high', heat: 'low', landslide: 'high' } },
          'Bio-engineered Slope': { costPerHa: { min: 200000, max: 600000 }, impacts: { flood: 'medium', heat: 'low', landslide: 'high' } },
          'Linear Green Infrastructure': { costPerHa: { min: 80000, max: 300000 }, impacts: { flood: 'medium', heat: 'medium', landslide: 'medium' } },
          'Resilient Green Corridor': { costPerHa: { min: 100000, max: 400000 }, impacts: { flood: 'medium-high', heat: 'medium-high', landslide: 'medium' } },
          'Urban Food Forest': { costPerHa: { min: 50000, max: 200000 }, impacts: { flood: 'medium', heat: 'high', landslide: 'medium' } },
        };
        
        // Get intervention data or use defaults
        const interventionData = INTERVENTION_DATA[interventionType] || {
          costPerHa: { min: 50000, max: 200000 },
          impacts: { flood: 'medium', heat: 'medium', landslide: 'low' }
        };
        
        // Calculate estimated cost based on area
        const area = areaHa || 1;
        const estimatedCost = {
          min: Math.round(interventionData.costPerHa.min * area),
          max: Math.round(interventionData.costPerHa.max * area),
          unit: 'USD'
        };
        
        // Determine impact levels - use intervention default impacts, but can be enhanced based on zone risk
        const impacts = { ...interventionData.impacts };
        
        // Generate a unique asset ID
        const assetId = osmId ? `nominatim_${osmId}` : `manual_${Date.now()}`;
        
        // Build the intervention object to add to the zone's portfolio
        const intervention = {
          interventionId: interventionType.toLowerCase().replace(/\s+/g, '_'),
          interventionName: interventionType,
          category: category,
          assetId: assetId,
          assetName: siteName,
          centroid: [lat, lng],
          estimatedArea: areaHa || 1,
          areaUnit: 'ha',
          estimatedCost,
          impacts,
          source: osmId ? 'nominatim' : 'manual',
          addedAt: new Date().toISOString(),
        };
        
        // Create a patch for user approval
        const projectId = context.projectId || 'sample-porto-alegre-project';
        
        try {
          // Import storage to create patch directly (avoid HTTP fetch issues)
          const { storage } = await import('../storage');
          
          // Create a pending patch that user must approve
          const patch = await storage.createPatch({
            projectId,
            blockType: 'site_explorer',
            fieldPath: `interventionSite.${zoneId}`,
            operation: 'set',
            value: intervention as any,
            status: 'pending',
            proposedBy: 'agent',
          });
          
          const patchId = patch.id;
          
          console.log(`📝 Created patch for intervention site: ${siteName} in ${zoneId}, patchId: ${patchId}`);
          
          return {
            name,
            result: {
              success: true,
              patchId,
              intervention,
              zoneId,
              message: `I've prepared to add "${siteName}" as a ${interventionType} to Zone ${zoneId.replace('zone_', '')}. Please approve or reject this change.`,
              requiresApproval: true,
            },
          };
        } catch (error) {
          console.error('Failed to create patch:', error);
          return {
            name,
            result: null,
            error: `Failed to propose intervention site: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      }

      case "select_funder": {
        const { fundId, funderType } = args as { fundId: string; funderType: 'preparation' | 'implementation' };
        
        const fs = await import('fs/promises');
        const path = await import('path');
        const fundsPath = path.join(process.cwd(), 'client', 'public', 'sample-data', 'climate-funds.json');
        
        let fundsData: any;
        try {
          const fundsJson = await fs.readFile(fundsPath, 'utf-8');
          fundsData = JSON.parse(fundsJson);
        } catch (error) {
          return {
            name,
            result: null,
            error: 'Could not load funds data. This feature is only available for the sample project.',
          };
        }
        
        const fund = fundsData.funds?.find((f: any) => f.id === fundId);
        if (!fund) {
          const availableFunds = fundsData.funds?.map((f: any) => `${f.id} (${f.name})`).join(', ');
          return {
            name,
            result: null,
            error: `Fund "${fundId}" not found. Available funds: ${availableFunds}`,
          };
        }
        
        // Get current funder_selection block to access questionnaire answers
        const block = await storage.getInfoBlock(projectId, 'funder_selection');
        const blockData = (block?.blockStateJson as any) || {};
        const questionnaire = blockData.questionnaire || {};
        
        // Build targetFunder data with computed reasons and gaps
        const whyFitReasons: string[] = [];
        const gapChecklist: Array<{ id: string; category: string; text: string; priority: string }> = [];
        
        // Compute fit reasons based on questionnaire answers
        if (questionnaire.sectors?.includes('nature_based') && fund.prioritySectors?.includes('nature_based_solutions')) {
          whyFitReasons.push('Sector alignment with nature-based solutions');
        }
        if (questionnaire.fundingReceiver && fund.eligibleBorrowers?.includes(questionnaire.fundingReceiver)) {
          whyFitReasons.push(`Eligible borrower type: ${questionnaire.fundingReceiver.replace(/_/g, ' ')}`);
        }
        if (fund.category === 'multilateral') {
          whyFitReasons.push('MDB anchor provides concessional terms and technical support');
        }
        if (fund.instrumentType === 'grant') {
          whyFitReasons.push('Grant structure fits public-good project nature');
        }
        if (fund.supportsPreparation && funderType === 'preparation') {
          whyFitReasons.push('Supports project preparation phase');
        }
        if (whyFitReasons.length === 0) {
          whyFitReasons.push(`Selected fund: ${fund.name}`);
        }
        
        // Compute gap checklist based on fund requirements
        if (fund.requiresFeasibility && !questionnaire.existingElements?.includes('assessments')) {
          gapChecklist.push({
            id: 'feasibility-study',
            category: 'feasibility',
            text: 'Complete a feasibility study',
            priority: 'high',
          });
        }
        if (fund.requiresSovereignGuarantee && questionnaire.nationalApproval !== 'yes') {
          gapChecklist.push({
            id: 'sovereign-approval',
            category: 'sovereign',
            text: 'Obtain federal/sovereign approval',
            priority: 'high',
          });
        }
        
        const targetFunderData = {
          fundId: fund.id,
          fundName: fund.name,
          institution: fund.institution,
          instrumentType: fund.instrumentType || fund.instrumentLabel || 'unknown',
          whyFitReasons,
          gapChecklist,
          confidence: gapChecklist.length === 0 ? 'high' : (gapChecklist.length <= 2 ? 'medium' : 'low'),
        };
        
        // Create patches for funder selection (3 patches: targetFunders, shortlistedFunds, fundingPlan.selectedFunderNow/Next)
        const patches: any[] = [];
        
        // Patch 1: Update targetFunders
        const targetFundersPatch = await storage.createPatch({
          projectId,
          blockType: 'funder_selection',
          fieldPath: 'targetFunders',
          operation: 'set',
          value: [targetFunderData] as any,
          status: 'pending',
          proposedBy: 'agent',
        });
        patches.push({ id: targetFundersPatch.id, field: 'targetFunders', value: [targetFunderData] });
        
        // Patch 3: Update shortlistedFunds to include the selected fund
        const shortlistedFundsPatch = await storage.createPatch({
          projectId,
          blockType: 'funder_selection',
          fieldPath: 'shortlistedFunds',
          operation: 'set',
          value: [fundId] as any,
          status: 'pending',
          proposedBy: 'agent',
        });
        patches.push({ id: shortlistedFundsPatch.id, field: 'shortlistedFunds', value: [fundId] });
        
        // Patch 4 & 5: Update fundingPlan with selectedFunderNow/Next based on funderType
        if (funderType === 'preparation') {
          const selectedFunderNowPatch = await storage.createPatch({
            projectId,
            blockType: 'funder_selection',
            fieldPath: 'fundingPlan.selectedFunderNow',
            operation: 'set',
            value: fundId as any,
            status: 'pending',
            proposedBy: 'agent',
          });
          patches.push({ id: selectedFunderNowPatch.id, field: 'fundingPlan.selectedFunderNow', value: fundId });
        } else {
          const selectedFunderNextPatch = await storage.createPatch({
            projectId,
            blockType: 'funder_selection',
            fieldPath: 'fundingPlan.selectedFunderNext',
            operation: 'set',
            value: fundId as any,
            status: 'pending',
            proposedBy: 'agent',
          });
          patches.push({ id: selectedFunderNextPatch.id, field: 'fundingPlan.selectedFunderNext', value: fundId });
        }
        
        console.log(`📝 Created ${patches.length} patches for funder selection: ${fund.name}`);
        
        return {
          name,
          result: {
            success: true,
            patches,
            fund: {
              id: fund.id,
              name: fund.name,
              institution: fund.institution,
              instrumentType: fund.instrumentType,
            },
            funderType,
            message: `I've proposed changing your ${funderType} funder to ${fund.name} (${fund.institution}). This creates ${patches.length} related updates. Please approve or reject these changes.`,
            requiresApproval: true,
          },
        };
      }

      case "regenerate_kpis": {
        const { reason } = args as { reason: string };
        
        const impactBlock = await storage.getInfoBlock(projectId, 'impact_model');
        const impactData = (impactBlock?.blockStateJson as any) || {};
        
        const siteBlock = await storage.getInfoBlock(projectId, 'site_explorer');
        const siteData = (siteBlock?.blockStateJson as any) || {};
        const selectedZones = siteData.selectedZones || [];
        
        if (selectedZones.length === 0) {
          return {
            name,
            result: null,
            error: 'No zones selected in Site Explorer. The user needs to select intervention zones before KPIs can be quantified.',
          };
        }
        
        const interventionBundles = impactData.interventionBundles || [];
        const enabledBundles = interventionBundles.filter((b: any) => b.enabled);
        if (enabledBundles.length === 0) {
          return {
            name,
            result: null,
            error: 'No intervention bundles are enabled in the Impact Model setup step. The user needs to enable at least one bundle.',
          };
        }
        
        const funderBlock = await storage.getInfoBlock(projectId, 'funder_selection');
        const funderData = (funderBlock?.blockStateJson as any) || {};
        const funderPathway = funderData.pathway || {};
        
        const project = await storage.getProject(projectId);
        
        console.log(`🤖 Agent regenerate_kpis: ${reason}`);
        
        const result = await generateQuantifiedImpacts({
          projectId,
          selectedZones,
          interventionBundles,
          funderPathway,
          projectName: project?.actionName,
          cityName: 'Porto Alegre',
        });
        
        const updatedState = {
          ...impactData,
          quantifiedImpacts: result,
        };
        
        await storage.upsertInfoBlock(projectId, 'impact_model', {
          projectId,
          blockType: 'impact_model',
          status: 'DRAFT',
          blockStateJson: updatedState,
        });
        
        const kpiCount = result.impactGroups?.reduce((sum: number, g: any) => sum + (g.kpis?.length || 0), 0) || 0;
        
        return {
          name,
          result: {
            success: true,
            impactGroupCount: result.impactGroups?.length || 0,
            kpiCount,
            coBenefitCount: result.coBenefits?.length || 0,
            mrvIndicatorCount: result.mrvIndicators?.length || 0,
            evidenceChunksUsed: result.evidenceContext?.chunksUsed || 0,
            message: `Successfully regenerated KPIs: ${kpiCount} indicators across ${result.impactGroups?.length || 0} impact groups, grounded in ${result.evidenceContext?.chunksUsed || 0} evidence sources. The user should refresh the Impact Model page to see updated results.`,
          },
        };
      }

      case "regenerate_narrative": {
        const { lens, customInstructions, reason } = args as { 
          lens: string; 
          customInstructions?: string; 
          reason: string;
        };
        
        const impactBlock = await storage.getInfoBlock(projectId, 'impact_model');
        const impactData = (impactBlock?.blockStateJson as any) || {};
        
        if (!impactData.quantifiedImpacts) {
          return {
            name,
            result: null,
            error: 'No quantified impacts exist yet. Use regenerate_kpis first, or ask the user to run quantification from Step 2 of the Impact Model.',
          };
        }
        
        const siteBlock = await storage.getInfoBlock(projectId, 'site_explorer');
        const siteData = (siteBlock?.blockStateJson as any) || {};
        const selectedZones = siteData.selectedZones || [];
        
        const interventionBundles = impactData.interventionBundles || [];
        
        const funderBlock = await storage.getInfoBlock(projectId, 'funder_selection');
        const funderData = (funderBlock?.blockStateJson as any) || {};
        const funderPathway = funderData.pathway || {};
        
        const project = await storage.getProject(projectId);
        
        console.log(`🤖 Agent regenerate_narrative: lens=${lens}, reason=${reason}${customInstructions ? `, instructions=${customInstructions}` : ''}`);
        
        const result = await generateNarrativeFromKPIs({
          quantifiedImpacts: impactData.quantifiedImpacts,
          selectedZones,
          interventionBundles,
          funderPathway,
          projectName: project?.actionName,
          cityName: 'Porto Alegre',
          projectId,
          lens: (lens !== 'neutral' ? lens : undefined) as 'neutral' | 'climate' | 'social' | 'financial' | 'institutional' | undefined,
          lensInstructions: customInstructions,
        });
        
        const updatedNarrativeCache = { ...(impactData.narrativeCache || {}) };
        if (lens === 'neutral' || !lens) {
          updatedNarrativeCache.base = result.narrativeBlocks;
        } else {
          updatedNarrativeCache.lensVariants = {
            ...(updatedNarrativeCache.lensVariants || {}),
            [lens]: result.narrativeBlocks,
          };
        }
        
        const updatedState = {
          ...impactData,
          narrativeCache: updatedNarrativeCache,
          downstreamSignals: result.downstreamSignals || impactData.downstreamSignals,
          selectedLens: lens || 'neutral',
        };
        
        await storage.upsertInfoBlock(projectId, 'impact_model', {
          projectId,
          blockType: 'impact_model',
          status: 'DRAFT',
          blockStateJson: updatedState,
        });
        
        return {
          name,
          result: {
            success: true,
            lens,
            narrativeBlockCount: result.narrativeBlocks?.length || 0,
            message: `Successfully generated ${lens !== 'neutral' ? lens + ' lens' : 'neutral'} narrative with ${result.narrativeBlocks?.length || 0} blocks. The updated content will appear in the Impact Model page.`,
          },
        };
      }

      case "regenerate_block": {
        const { blockId, lens, customInstructions, reason } = args as {
          blockId: string;
          lens: string;
          customInstructions: string;
          reason: string;
        };

        const impactBlock = await storage.getInfoBlock(projectId, 'impact_model');
        const impactData = (impactBlock?.blockStateJson as any) || {};
        const narrativeCache = impactData.narrativeCache || {};
        
        const isLensVariant = lens && lens !== 'neutral';
        const blocks = isLensVariant
          ? (narrativeCache.lensVariants?.[lens] || [])
          : (narrativeCache.base || []);
        
        const targetBlock = blocks.find((b: any) => b.id === blockId);
        if (!targetBlock) {
          return {
            name,
            result: null,
            error: `Block "${blockId}" not found in ${isLensVariant ? lens + ' lens' : 'base'} narrative. Available blocks: ${blocks.map((b: any) => b.id).join(', ')}`,
          };
        }

        console.log(`🔄 Agent regenerate_block: blockId=${blockId}, lens=${lens}, reason=${reason}`);

        const result = await regenerateBlock({
          block: targetBlock,
          customPrompt: customInstructions,
          projectContext: {
            cityName: 'Porto Alegre',
            hazards: impactData.interventionBundles?.filter((b: any) => b.enabled).map((b: any) => b.hazardType) || [],
            interventions: impactData.interventionBundles?.filter((b: any) => b.enabled).map((b: any) => b.name) || [],
          },
        });

        const updatedBlocks = blocks.map((b: any) => b.id === blockId ? { ...result, id: blockId } : b);
        const updatedNarrativeCache = { ...narrativeCache };
        if (isLensVariant) {
          updatedNarrativeCache.lensVariants = {
            ...(updatedNarrativeCache.lensVariants || {}),
            [lens]: updatedBlocks,
          };
        } else {
          updatedNarrativeCache.base = updatedBlocks;
        }

        const updatedState = {
          ...impactData,
          narrativeCache: updatedNarrativeCache,
        };

        await storage.upsertInfoBlock(projectId, 'impact_model', {
          projectId,
          blockType: 'impact_model',
          status: 'DRAFT',
          blockStateJson: updatedState,
        });

        return {
          name,
          result: {
            success: true,
            blockId,
            blockTitle: targetBlock.title,
            lens,
            message: `Successfully regenerated the "${targetBlock.title}" block${isLensVariant ? ` (${lens} lens)` : ''}. The updated content will appear in the Impact Model page. Does the new version look good, or would you like to make further changes?`,
          },
        };
      }

      default:
        return {
          name,
          result: null,
          error: `Unknown tool: ${name}`,
        };
    }
  } catch (error) {
    console.error(`Tool execution error (${name}):`, error);
    return {
      name,
      result: null,
      error: error instanceof Error ? error.message : "Tool execution failed",
    };
  }
}

function getNestedValue(obj: any, path: string): unknown {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function buildSystemPrompt(context: AgentContext): string {
  let prompt = SYSTEM_PROMPT;
  
  if (context.currentPage || context.pageGoal || context.currentStep !== undefined || context.pageContext) {
    prompt += '\n\n## Current Context';
    if (context.currentPage) {
      prompt += `\nThe user is currently on the **${context.currentPage}** page.`;
    }
    
    // Use pageContext for detailed step information
    if (context.pageContext) {
      const pc = context.pageContext;
      if (pc.currentStep && pc.stepNumber !== undefined && pc.totalSteps !== undefined) {
        prompt += `\nThey are on step ${pc.stepNumber + 1} of ${pc.totalSteps}: **${pc.currentStep}**.`;
      } else if (pc.currentStep) {
        prompt += `\nThey are on step: **${pc.currentStep}**.`;
      } else if (pc.stepNumber !== undefined) {
        prompt += ` They are on step ${pc.stepNumber + 1} of the wizard.`;
      }
      if (pc.viewState) {
        prompt += `\nView state: ${pc.viewState}.`;
      }
      if (pc.additionalInfo && Object.keys(pc.additionalInfo).length > 0) {
        const infoEntries = Object.entries(pc.additionalInfo)
          .filter(([_, v]) => v !== null && v !== undefined)
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join(', ');
        if (infoEntries) {
          prompt += `\nContext details: ${infoEntries}`;
        }
      }
    } else if (context.currentStep !== undefined) {
      prompt += ` They are on step ${context.currentStep + 1} of the wizard.`;
    }
    
    if (context.pageGoal) {
      prompt += `\n\n**Your goal on this page**: ${context.pageGoal}`;
    }
    prompt += '\n\nFocus your assistance on the specific context and goals of this page. Be proactive in helping them complete the current step or module.';
  }
  
  return prompt;
}

export async function* streamAgentResponse(
  context: AgentContext,
  userMessage: string
): AsyncGenerator<{
  type: "text" | "tool_call" | "tool_result" | "done" | "error";
  content?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  error?: string;
}> {
  const { conversationHistory, projectId } = context;

  let messages: Message[] = [
    { role: "system", content: buildSystemPrompt(context) },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  const tools = AGENT_TOOLS.map(tool => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as { [key: string]: unknown },
    strict: true,
  }));

  let maxIterations = 5;
  let fullText = "";

  try {
    while (maxIterations > 0) {
      maxIterations--;

      const response = await openai.responses.create({
        model: "gpt-5.2",
        input: messages.map(m => ({ role: m.role, content: m.content })),
        max_output_tokens: 4096,
        reasoning: { effort: "low" as any },
        tools,
      });

      const output = response.output || [];
      let hasFunctionCall = false;

      for (const item of output as any[]) {
        if (item.type === "message") {
          for (const part of item.content || []) {
            if (part.type === "output_text") {
              fullText += part.text;
              yield { type: "text", content: part.text };
            }
          }
        } else if (item.type === "function_call") {
          hasFunctionCall = true;
          const toolCall: ToolCall = {
            name: item.name,
            arguments: JSON.parse(item.arguments || "{}"),
          };
          
          yield { type: "tool_call", toolCall };

          const result = await executeAgentTool(context, toolCall);
          yield { type: "tool_result", toolResult: result };

          messages.push({
            role: "assistant",
            content: `[Called tool: ${toolCall.name}]`,
          });
          messages.push({
            role: "user",
            content: `Tool result for ${toolCall.name}: ${JSON.stringify(result.result)}`,
          });
        }
      }

      if (!hasFunctionCall) {
        break;
      }
    }

    yield { type: "done", content: fullText };
  } catch (error) {
    console.error("Agent stream error:", error);
    yield { 
      type: "error", 
      error: error instanceof Error ? error.message : "Agent response failed" 
    };
  }
}

export async function getAgentResponse(
  context: AgentContext,
  userMessage: string
): Promise<string> {
  const { conversationHistory } = context;

  const messages: Message[] = [
    { role: "system", content: buildSystemPrompt(context) },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  const response = await openai.responses.create({
    model: "gpt-5.2",
    input: messages.map(m => ({ role: m.role, content: m.content })),
    max_output_tokens: 4096,
    reasoning: { effort: "low" as any },
    tools: AGENT_TOOLS.map(tool => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as { [key: string]: unknown },
      strict: true,
    })),
  });

  const output = response.output || [];
  let responseText = "";
  
  for (const item of output as any[]) {
    if (item.type === "message") {
      for (const part of item.content || []) {
        if (part.type === "output_text") {
          responseText += part.text;
        }
      }
    } else if (item.type === "function_call") {
      const toolCall: ToolCall = {
        name: item.name,
        arguments: JSON.parse(item.arguments || "{}"),
      };
      const result = await executeAgentTool(context, toolCall);
      responseText += `\n[Tool: ${toolCall.name}]\n${JSON.stringify(result.result, null, 2)}\n`;
    }
  }

  return responseText;
}

export { AGENT_TOOLS, SYSTEM_PROMPT };
