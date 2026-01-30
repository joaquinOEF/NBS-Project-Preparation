import { openai, type Message, type ReasoningEffort } from "./openaiClient";
import { storage } from "../storage";
import { semanticSearch, getKnowledgeStats } from "./knowledgeService";
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
    description: "Given coordinates (lat, lng), find which intervention zone contains that location. Returns the zone ID and details if found.",
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
];

const SYSTEM_PROMPT = `You are an AI assistant for the NBS (Nature-Based Solutions) Project Builder platform.
You help city planners and project managers develop climate resilience projects using nature-based solutions.

## Knowledge Workspace
You have access to a Knowledge Workspace that stores:
- **Project Data**: Funder Selection, Site Explorer, Impact Model, Operations, Business Model modules
- **Global Knowledge Base**: Research synthesis on NBS effectiveness with quantified impacts from peer-reviewed studies and case studies (especially Latin American cities like Medellín, Mexico City, Rio de Janeiro)

## Funder Selection Valid Field Values
When modifying the Funder Selection questionnaire, you MUST use these exact values:
- **projectStage**: "idea", "concept", "prefeasibility", "feasibility", "procurement"
- **existingElements**: "capex", "timeline", "location", "assessments", "agency", "none"
- **sectors**: "nature_based", "transport", "energy", "water", "waste", "urban_resilience", "other"
- **investmentSize**: "under_1m", "1_5m", "5_20m", "20_50m", "over_50m", "unknown"
- **budgetPreparation/budgetImplementation/generatesRevenue/canTakeDebt/nationalApproval/openToBundling**: "yes", "no"
- **fundingReceiver**: "municipality", "utility", "special_purpose_vehicle", "ngo", "other"

For example, if a user says "we have a concept note", set projectStage to "concept". If they say "we have a timeline", add "timeline" to existingElements.

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

## Adding Intervention Sites (Site Explorer)
When a user wants to add a site by name/address:
1. Use lookup_location to find the coordinates from the name/address
2. Use find_zone_for_coordinates with the lat/lng to determine which zone it belongs to
3. If the location is in a zone, tell the user which zone and ask what intervention type they want
4. For now, the user must add the site through the Site Explorer UI - tell them to navigate there, search for the site using the "Add Custom Site" button, and select the intervention

This workflow allows you to help the user without needing them to provide coordinates manually - you look them up automatically.

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
        const oldValue = block ? getNestedValue(block.blockStateJson, fieldPath) : undefined;

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

        await storage.createAgentAction({
          projectId,
          actor: "agent",
          actorId: "city-project-assistant",
          actionType: "propose_patch",
          actionStatus: "proposed",
          targetBlockType: blockType,
          targetFieldPath: fieldPath,
          previousValue: oldValue as any,
          proposedPatch: { value: proposedValue, rationale },
        });

        return {
          name,
          result: {
            patchId: patch.id,
            blockType,
            fieldPath,
            proposedValue,
            message: "Patch proposed. Awaiting user approval.",
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
        
        // Porto Alegre bounding box for constrained local search
        const portoAlegreBbox = [-30.27, -51.32, -29.93, -51.01]; // [south, west, north, east]
        
        const searchUrl = new URL('https://nominatim.openstreetmap.org/search');
        searchUrl.searchParams.append('q', query);
        searchUrl.searchParams.append('format', 'json');
        searchUrl.searchParams.append('addressdetails', '1');
        searchUrl.searchParams.append('limit', '10');
        searchUrl.searchParams.append('countrycodes', 'br'); // Constrain to Brazil
        // Use viewbox to prefer results in Porto Alegre area
        searchUrl.searchParams.append('viewbox', `${portoAlegreBbox[1]},${portoAlegreBbox[0]},${portoAlegreBbox[3]},${portoAlegreBbox[2]}`);
        searchUrl.searchParams.append('bounded', '0'); // Prefer but don't strictly limit to viewbox
        
        console.log(`🔍 Agent lookup_location: "${query}"`);
        
        const response = await fetch(searchUrl.toString(), {
          headers: {
            'User-Agent': 'NBS-Project-Builder/1.0 (contact@example.com)',
            'Accept': 'application/json',
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
        
        const locations = results.map((r: any) => ({
          name: r.display_name.split(',')[0],
          fullAddress: r.display_name,
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          type: r.type || r.class || 'place',
          osmId: r.osm_id,
        }));
        
        return {
          name,
          result: {
            found: true,
            count: locations.length,
            locations,
            message: `Found ${locations.length} location(s). Use find_zone_for_coordinates with the first result's lat/lng to determine which intervention zone it belongs to.`,
          },
        };
      }

      case "find_zone_for_coordinates": {
        const { lat, lng } = args as { lat: number; lng: number };
        
        // Load the zones data
        const fs = await import('fs/promises');
        const path = await import('path');
        const zonesPath = path.join(process.cwd(), 'public', 'sample-data', 'porto-alegre-zones.json');
        
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
                  message: `The location is in ${props.zoneId} (${props.typologyLabel}). You can now propose adding an intervention site to this zone.`,
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
