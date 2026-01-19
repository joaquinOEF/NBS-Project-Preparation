import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { 
  ingestBlockState, 
  ingestEvidence, 
  ingestConversation,
  ingestDocument,
  semanticSearch,
  getKnowledgeStats,
} from "../services/knowledgeService";
import { parsePdfFile } from "../services/pdfService";
import type { InfoBlockType } from "@shared/schema";
import type { DocumentMetadata } from "@shared/document-knowledge-registry";
import { 
  GLOBAL_PROJECT_ID, 
  INITIAL_KNOWLEDGE_DOCUMENTS,
  DOCUMENT_CATEGORY_LABELS 
} from "@shared/document-knowledge-registry";

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

  app.get("/api/knowledge/documents", async (_req: Request, res: Response) => {
    try {
      const sources = await storage.getKnowledgeSourcesByProject(GLOBAL_PROJECT_ID);
      const documents = sources.filter(s => s.sourceType === "document");
      
      res.json({
        documents: documents.map(doc => ({
          id: doc.sourceRef.replace("document:", ""),
          title: doc.title,
          metadata: doc.metadata,
          chunkCount: doc.chunkCount,
          tokenCount: doc.tokenCount,
          lastIndexedAt: doc.lastIndexedAt,
          isActive: doc.isActive,
        })),
        categories: DOCUMENT_CATEGORY_LABELS,
      });
    } catch (error) {
      console.error("Get documents error:", error);
      res.status(500).json({ error: "Failed to get documents" });
    }
  });

  app.post("/api/knowledge/documents/ingest", async (req: Request, res: Response) => {
    try {
      const { documentId, title, filePath, metadata, forceReindex } = req.body as {
        documentId: string;
        title: string;
        filePath: string;
        metadata: DocumentMetadata;
        forceReindex?: boolean;
      };

      if (!documentId || !title || !filePath || !metadata) {
        return res.status(400).json({ 
          error: "documentId, title, filePath, and metadata are required" 
        });
      }

      const pdfResult = await parsePdfFile(filePath);
      
      const source = await ingestDocument(
        documentId,
        title,
        pdfResult.text,
        metadata,
        { forceReindex }
      );

      res.json({
        success: true,
        source: {
          id: source.id,
          documentId,
          title: source.title,
          chunkCount: source.chunkCount,
          tokenCount: source.tokenCount,
          numPages: pdfResult.numPages,
        },
      });
    } catch (error) {
      console.error("Document ingest error:", error);
      res.status(500).json({ error: `Failed to ingest document: ${error}` });
    }
  });

  app.post("/api/knowledge/documents/seed", async (_req: Request, res: Response) => {
    try {
      const results = {
        success: [] as string[],
        errors: [] as string[],
      };

      for (const doc of INITIAL_KNOWLEDGE_DOCUMENTS) {
        try {
          const pdfResult = await parsePdfFile(doc.filePath);
          
          await ingestDocument(
            doc.id,
            doc.title,
            pdfResult.text,
            doc.metadata
          );
          
          results.success.push(doc.id);
          console.log(`Seeded document: ${doc.id} (${pdfResult.numPages} pages)`);
        } catch (error) {
          results.errors.push(`${doc.id}: ${error}`);
          console.error(`Failed to seed ${doc.id}:`, error);
        }
      }

      res.json({
        message: "Knowledge base seeding complete",
        seeded: results.success.length,
        failed: results.errors.length,
        details: results,
      });
    } catch (error) {
      console.error("Seed error:", error);
      res.status(500).json({ error: "Failed to seed knowledge base" });
    }
  });

  app.delete("/api/knowledge/documents/:documentId", async (req: Request, res: Response) => {
    try {
      const { documentId } = req.params;
      const sourceRef = `document:${documentId}`;
      
      const source = await storage.getKnowledgeSourceByRef(GLOBAL_PROJECT_ID, "document", sourceRef);
      
      if (!source) {
        return res.status(404).json({ error: "Document not found" });
      }

      await storage.deleteChunksBySource(source.id);
      await storage.deleteKnowledgeSource(source.id);

      res.json({ success: true, message: `Document ${documentId} deleted` });
    } catch (error) {
      console.error("Delete document error:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  app.get("/api/knowledge/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await getKnowledgeStats(GLOBAL_PROJECT_ID);
      res.json({
        ...stats,
        projectId: GLOBAL_PROJECT_ID,
        description: "Global knowledge base statistics",
      });
    } catch (error) {
      console.error("Global knowledge stats error:", error);
      res.status(500).json({ error: "Failed to get global stats" });
    }
  });
}
