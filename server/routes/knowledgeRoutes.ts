import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { 
  ingestBlockState, 
  ingestEvidence, 
  ingestConversation,
  semanticSearch,
  getKnowledgeStats,
} from "../services/knowledgeService";
import type { InfoBlockType } from "@shared/schema";

export function registerKnowledgeRoutes(app: Express): void {
  app.post("/api/projects/:projectId/knowledge/search", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { query, blockType, sourceType, limit, minScore } = req.body;

      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      const result = await semanticSearch(projectId, query, {
        blockType,
        sourceType,
        limit,
        minScore,
      });

      res.json(result);
    } catch (error) {
      console.error("Knowledge search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.get("/api/projects/:projectId/knowledge/stats", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const stats = await getKnowledgeStats(projectId);
      res.json(stats);
    } catch (error) {
      console.error("Knowledge stats error:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  app.get("/api/projects/:projectId/knowledge/sources", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const sources = await storage.getKnowledgeSourcesByProject(projectId);
      res.json({ sources });
    } catch (error) {
      console.error("Knowledge sources error:", error);
      res.status(500).json({ error: "Failed to get sources" });
    }
  });

  app.post("/api/projects/:projectId/knowledge/ingest/block", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { blockType, forceReindex } = req.body;

      if (!blockType) {
        return res.status(400).json({ error: "blockType is required" });
      }

      const block = await storage.getInfoBlock(projectId, blockType as InfoBlockType);
      if (!block) {
        return res.status(404).json({ error: "Block not found" });
      }

      const source = await ingestBlockState(
        projectId,
        blockType as InfoBlockType,
        block.blockStateJson as Record<string, unknown>,
        { forceReindex }
      );

      res.json({ source, message: "Block ingested successfully" });
    } catch (error) {
      console.error("Block ingest error:", error);
      res.status(500).json({ error: "Failed to ingest block" });
    }
  });

  app.post("/api/projects/:projectId/knowledge/ingest/all", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { forceReindex } = req.body;

      const blocks = await storage.getInfoBlocksByProject(projectId);
      const evidence = await storage.getEvidenceByProject(projectId);

      const results = {
        blocks: [] as string[],
        evidence: [] as string[],
        errors: [] as string[],
      };

      for (const block of blocks) {
        try {
          if (block.blockStateJson && Object.keys(block.blockStateJson).length > 0) {
            await ingestBlockState(
              projectId,
              block.blockType as InfoBlockType,
              block.blockStateJson as Record<string, unknown>,
              { forceReindex }
            );
            results.blocks.push(block.blockType);
          }
        } catch (error) {
          results.errors.push(`Block ${block.blockType}: ${error}`);
        }
      }

      for (const ev of evidence) {
        try {
          await ingestEvidence(projectId, ev.id, {
            title: ev.title || undefined,
            summary: ev.summary || undefined,
            sourceUrl: ev.sourceUrl || undefined,
            sourceLabel: ev.sourceLabel || undefined,
            linkedPaths: ev.linkedPaths || [],
            linkedBlockTypes: ev.linkedBlockTypes || [],
            confidence: ev.confidence || undefined,
          }, { forceReindex });
          results.evidence.push(ev.id);
        } catch (error) {
          results.errors.push(`Evidence ${ev.id}: ${error}`);
        }
      }

      res.json({
        message: "Ingestion complete",
        ingested: {
          blocks: results.blocks.length,
          evidence: results.evidence.length,
        },
        errors: results.errors,
      });
    } catch (error) {
      console.error("Full ingest error:", error);
      res.status(500).json({ error: "Failed to ingest all content" });
    }
  });
}
