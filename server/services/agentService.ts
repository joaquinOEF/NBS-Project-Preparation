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
    description: "Look up valid values for a field BEFORE proposing a patch. Use this to ensure you propose only valid values.",
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
          description: "The field path to look up (e.g., 'questionnaire.projectStage')",
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
1. Use get_block to see current module state
2. IMPORTANT: Use get_field_options to look up valid values BEFORE proposing any patch
3. For Impact Model: Use search_knowledge to find evidence BEFORE proposing narratives
4. Explain what you will save and why, citing evidence when available
5. Use propose_patch with ONLY valid values - user must approve each change
6. After approval, use get_patch_status to confirm

## Field Validation
- All patches are validated before being created. Invalid values will be rejected.
- Always use get_field_options first to see what values are allowed for a field.
- For enum fields, you MUST use one of the exact valid values (e.g., 'idea', 'concept', 'design').
- For enumArray fields, provide an array containing only valid values.

## Key Evidence in Knowledge Base
- Flood resilience: green roofs (56% rainfall retention), bioretention (40-90% peak flow reduction), wetlands (50-95% flood peak reduction)
- Heat mitigation: urban forests (1-3°C cooling), green roofs (15-45°C surface temperature reduction, 50% cooling load reduction)
- Slope stabilization: vetiver grass (60-90% soil loss reduction), deep-rooted vegetation for soil cohesion
- Case studies: Medellín Green Corridors ($16M for 2°C cooling), Mexico City La Quebradora (flood control + aquifer recharge)

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
        
        const entry = moduleValidations.find(v => v.fieldPath === fieldPath);
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
            fieldPath,
            label: label || fieldPath,
            validationType: validation.type,
            validValues: 'values' in validation ? validation.values : undefined,
            constraints: validation.type === 'number' ? { min: (validation as any).min, max: (validation as any).max } : undefined,
            message: `Use ONLY these values when proposing changes to ${label || fieldPath}.`,
          },
        };
      }

      case "propose_patch": {
        const { blockType, fieldPath, proposedValue, rationale } = args as {
          blockType: InfoBlockType;
          fieldPath: string;
          proposedValue: unknown;
          rationale: string;
        };

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
          proposedByAgentId: "nbs-assistant",
        });

        await storage.createAgentAction({
          projectId,
          actor: "agent",
          actorId: "nbs-assistant",
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
