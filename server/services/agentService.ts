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
  MODULE_REGISTRY 
} from "@shared/schema";

export interface AgentContext {
  projectId: string;
  userId?: string;
  currentModule?: InfoBlockType;
  conversationHistory: Message[];
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
    description: "Search the project's knowledge base using semantic similarity. Use this to find relevant information from block states, evidence, and past conversations.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language search query",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

const SYSTEM_PROMPT = `You are an AI assistant for the NBS (Nature-Based Solutions) Project Builder platform.
You help city planners and project managers develop climate resilience projects using nature-based solutions.

You have access to a Knowledge Workspace that stores the project state across multiple modules:
- **Funder Selection**: Questionnaire answers (projectName, projectDescription, sectors, projectStage, budgetPreparation, etc.), pathway, and target funders
- **Site Explorer**: Selected zones, risk scores, and intervention types
- **Impact Model**: Narrative blocks, co-benefits, and downstream signals
- **Operations**: O&M tasks, stakeholders, and cost estimates
- **Business Model**: Archetypes, revenue stacks, and financing pathways

When the user asks you to fill in or update fields:
1. First use get_block to see the current state of the relevant module
2. Explain clearly what you will save and why BEFORE using propose_patch
3. Use propose_patch for each field you want to update - the user must approve each change
4. After proposing, tell the user they can approve or reject each change in the chat panel
5. When the user says they saved/approved a patch, use get_patch_status with the patch ID to confirm it was applied before proceeding

IMPORTANT - When saving to the database:
- Always explain: "I'm going to save [field name] with value [value] because [reason]"
- The user will see your proposed changes and must click "Save" to confirm
- After the user approves, use get_patch_status to verify the save was successful
- If the user approves, the data is written to the database immediately
- Be specific about which module and field you are updating

Communication guidelines:
- Be concise and professional
- Use clear, non-technical language when explaining concepts
- When proposing changes, explain exactly what will be saved and where
- After proposing, remind the user to approve or reject the pending changes`;

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

      case "propose_patch": {
        const { blockType, fieldPath, proposedValue, rationale } = args as {
          blockType: InfoBlockType;
          fieldPath: string;
          proposedValue: unknown;
          rationale: string;
        };

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
        const { query, blockType, limit } = args as {
          query: string;
          blockType?: InfoBlockType;
          limit?: number;
        };

        const searchResult = await semanticSearch(projectId, query, {
          blockType,
          limit: limit || 5,
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
    { role: "system", content: SYSTEM_PROMPT },
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
    { role: "system", content: SYSTEM_PROMPT },
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
