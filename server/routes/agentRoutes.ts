import type { Express, Request, Response } from "express";
import { streamAgentResponse, getAgentResponse, type AgentContext } from "../services/agentService";
import { chatStorage } from "../replit_integrations/chat/storage";
import { storage } from "../storage";

const PAGE_GOALS: Record<string, string> = {
  'funder-selection': 'Help the user complete a funding profile questionnaire and select appropriate funders for their NBS project. Guide them through questions about project stage, sectors, budget preparation, and financing needs to match them with suitable funding opportunities.',
  'site-explorer': 'Help the user explore potential sites for their nature-based solution intervention. Assist with analyzing risk scores (heat, flood, landslide), identifying suitable zones, and selecting appropriate intervention types based on geographic and climate data.',
  'impact-model': 'Help the user build a compelling impact narrative for their project. Guide them through creating impact statements, identifying co-benefits (health, biodiversity, social), and generating funder-ready narratives that demonstrate the value of their NBS intervention.',
  'project-operations': 'Help the user plan operations and maintenance (O&M) for their project. Assist with defining stakeholder roles, estimating costs, scheduling tasks, and ensuring long-term sustainability of the nature-based solution.',
  'business-model': 'Help the user develop a sustainable business model for their NBS project. Guide them through selecting financing archetypes, building revenue stacks, and creating viable funding pathways to ensure project viability.',
  'project': 'Help the user get an overview of their NBS project and navigate between different modules. Provide guidance on next steps and what information is needed to complete their project preparation.',
};

function getPageGoal(currentPage?: string): string | undefined {
  if (!currentPage) return undefined;
  const pageKey = currentPage.replace(/^\/?(sample\/)?/, '').split('/')[0];
  return PAGE_GOALS[pageKey];
}

export function registerAgentRoutes(app: Express): void {
  app.post("/api/projects/:projectId/agent/chat", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { message, conversationId, currentPage, currentStep, pageContext } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      let convId = conversationId;
      if (!convId) {
        const conv = await chatStorage.createConversation(`City Project Assistant - ${project.actionName}`);
        convId = conv.id;
      }

      await chatStorage.createMessage(convId, "user", message);

      const messages = await chatStorage.getMessagesByConversation(convId);
      const conversationHistory = messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Conversation-Id", convId.toString());

      const context: AgentContext = {
        projectId,
        currentPage,
        currentStep: pageContext?.stepNumber ?? currentStep,
        pageGoal: getPageGoal(currentPage),
        conversationHistory: conversationHistory.slice(0, -1),
        pageContext,
      };

      let fullResponse = "";

      for await (const event of streamAgentResponse(context, message)) {
        if (event.type === "text") {
          fullResponse += event.content || "";
          res.write(`data: ${JSON.stringify({ type: "text", content: event.content })}\n\n`);
        } else if (event.type === "tool_call") {
          res.write(`data: ${JSON.stringify({ type: "tool_call", toolCall: event.toolCall })}\n\n`);
        } else if (event.type === "tool_result") {
          res.write(`data: ${JSON.stringify({ type: "tool_result", toolResult: event.toolResult })}\n\n`);
        } else if (event.type === "done") {
          await chatStorage.createMessage(convId, "assistant", fullResponse);
          res.write(`data: ${JSON.stringify({ type: "done", conversationId: convId })}\n\n`);
        } else if (event.type === "error") {
          res.write(`data: ${JSON.stringify({ type: "error", error: event.error })}\n\n`);
        }
      }

      res.end();
    } catch (error) {
      console.error("Agent chat error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", error: "Agent chat failed" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Agent chat failed" });
      }
    }
  });

  app.get("/api/projects/:projectId/agent/conversations", async (req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/projects/:projectId/agent/conversations/:conversationId", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId);
      const conversation = await chatStorage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(conversationId);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.delete("/api/projects/:projectId/agent/conversations/:conversationId", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId);
      await chatStorage.deleteConversation(conversationId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.get("/api/projects/:projectId/patches", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const patches = await storage.getPendingPatches(projectId);
      res.json({ patches });
    } catch (error) {
      console.error("Error fetching patches:", error);
      res.status(500).json({ error: "Failed to fetch patches" });
    }
  });

  app.post("/api/projects/:projectId/patches/:patchId/apply", async (req: Request, res: Response) => {
    try {
      const { patchId } = req.params;
      
      const patches = await storage.getPatchesByIds([patchId]);
      const patch = patches[0];
      
      if (!patch) {
        return res.status(404).json({ error: "Patch not found" });
      }

      if (patch.status !== "pending") {
        return res.status(400).json({ error: "Patch is not pending" });
      }

      if (patch.blockType && patch.value !== null) {
        const block = await storage.getInfoBlock(patch.projectId, patch.blockType);
        if (block) {
          const currentState = { ...block.blockStateJson };
          setNestedValue(currentState, patch.fieldPath, patch.value);
          
          await storage.updateInfoBlock(block.id, {
            blockStateJson: currentState,
            updatedBy: "user",
            version: (block.version || 1) + 1,
          });
        }
      }

      const updated = await storage.updatePatch(patchId, {
        status: "applied",
        appliedBy: "user",
        appliedAt: new Date(),
      });

      await storage.createAgentAction({
        projectId: patch.projectId,
        actor: "user",
        actionType: "apply_patch",
        actionStatus: "accepted",
        targetBlockType: patch.blockType || undefined,
        targetFieldPath: patch.fieldPath,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error applying patch:", error);
      res.status(500).json({ error: "Failed to apply patch" });
    }
  });

  app.post("/api/projects/:projectId/patches/:patchId/reject", async (req: Request, res: Response) => {
    try {
      const { patchId } = req.params;
      const { feedback } = req.body;
      
      const patches = await storage.getPatchesByIds([patchId]);
      const patch = patches[0];
      
      if (!patch) {
        return res.status(404).json({ error: "Patch not found" });
      }

      if (patch.status !== "pending") {
        return res.status(400).json({ error: "Patch is not pending" });
      }

      const updated = await storage.updatePatch(patchId, {
        status: "rejected",
      });

      await storage.createAgentAction({
        projectId: patch.projectId,
        actor: "user",
        actionType: "reject_patch",
        actionStatus: "rejected",
        targetBlockType: patch.blockType || undefined,
        targetFieldPath: patch.fieldPath,
        userFeedback: feedback,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error rejecting patch:", error);
      res.status(500).json({ error: "Failed to reject patch" });
    }
  });

  app.post("/api/projects/:projectId/agent/action", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { action, params } = req.body;

      if (!action) {
        return res.status(400).json({ success: false, message: "Action is required" });
      }

      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ success: false, message: "Project not found" });
      }

      const impactBlock = await storage.getInfoBlock(projectId, 'impact_model');
      const blockData: any = impactBlock?.data || {};

      switch (action) {
        case 'regenerate_narrative': {
          const { generateNarrativeFromKPIs } = await import('../services/impactModelService');
          const kpis = blockData.quantifiedKPIs || blockData.kpis || [];
          const zones = blockData.selectedZones || [];
          const bundles = blockData.interventionBundles || [];
          const funderPathway = blockData.funderPathway || { primary: 'general' };
          
          const result = await generateNarrativeFromKPIs({
            quantifiedKPIs: kpis,
            selectedZones: zones,
            interventionBundles: bundles,
            funderPathway: funderPathway,
            projectName: project.actionName || 'NBS Project',
            cityName: project.cityName || '',
            projectId,
            lens: params?.lens,
            lensInstructions: params?.lensInstructions,
          });

          if (result.blocks) {
            await storage.upsertInfoBlock(projectId, 'impact_model', {
              data: {
                ...blockData,
                narrativeBlocks: result.blocks,
                narrativeOutline: result.outline,
              },
            });
          }

          return res.json({ success: true, message: `Narrative regenerated with ${result.blocks?.length || 0} sections.` });
        }

        case 'regenerate_block': {
          const { regenerateBlock } = await import('../services/impactModelService');
          const { blockIndex, customPrompt } = params || {};
          const narrativeBlocks = blockData.narrativeBlocks || [];
          
          if (blockIndex === undefined || blockIndex >= narrativeBlocks.length) {
            return res.status(400).json({ success: false, message: "Invalid block index" });
          }

          const targetBlock = narrativeBlocks[blockIndex];
          const result = await regenerateBlock({
            block: targetBlock,
            customPrompt: customPrompt || 'Regenerate this section with improved content.',
            projectContext: {
              projectName: project.actionName,
              cityName: project.cityName,
              zones: blockData.selectedZones,
              interventionBundles: blockData.interventionBundles,
            },
          });

          narrativeBlocks[blockIndex] = result;
          await storage.upsertInfoBlock(projectId, 'impact_model', {
            data: { ...blockData, narrativeBlocks },
          });

          return res.json({ success: true, message: `Section "${targetBlock.title}" has been regenerated.` });
        }

        case 'regenerate_affected': {
          const { regenerateAffectedBlocks } = await import('../services/impactModelService');
          const narrativeBlocks = blockData.narrativeBlocks || [];
          
          const editedCount = narrativeBlocks.filter((b: any) => b.userEdited).length;
          if (editedCount === 0) {
            return res.json({ success: true, message: "No edited blocks detected — nothing to regenerate." });
          }

          const result = await regenerateAffectedBlocks({
            allBlocks: narrativeBlocks,
            selectedZones: blockData.selectedZones || [],
            interventionBundles: blockData.interventionBundles || [],
            funderPathway: blockData.funderPathway || { primary: 'general' },
            projectName: project.actionName || 'NBS Project',
            cityName: project.cityName || '',
            projectId,
            lens: params?.lens,
            lensInstructions: params?.lensInstructions,
          });

          if (result.updatedBlocks) {
            await storage.upsertInfoBlock(projectId, 'impact_model', {
              data: { ...blockData, narrativeBlocks: result.updatedBlocks },
            });
          }

          return res.json({ 
            success: true, 
            message: `Detected ${result.affectedBlockIds?.length || 0} affected sections and regenerated them.`
          });
        }

        case 'regenerate_kpis': {
          const { generateQuantifiedImpacts } = await import('../services/impactModelService');
          const result = await generateQuantifiedImpacts({
            projectId,
            selectedZones: blockData.selectedZones || [],
            interventionBundles: blockData.interventionBundles || [],
            funderPathway: blockData.funderPathway || { primary: 'general' },
            projectName: project.actionName || 'NBS Project',
            cityName: project.cityName || '',
          });

          if (result.kpis) {
            await storage.upsertInfoBlock(projectId, 'impact_model', {
              data: { ...blockData, quantifiedKPIs: result.kpis },
            });
          }

          return res.json({ success: true, message: `Regenerated ${result.kpis?.length || 0} KPIs across zones.` });
        }

        default:
          return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
      }
    } catch (error: any) {
      console.error("Agent action error:", error);
      return res.status(500).json({ success: false, message: error.message || "Action failed" });
    }
  });
}

function setNestedValue(obj: any, path: string, value: any): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}
