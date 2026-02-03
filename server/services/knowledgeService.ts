import { storage } from "../storage";
import { generateEmbedding, generateEmbeddings, serializeEmbedding, deserializeEmbedding, cosineSimilarity } from "./embeddingService";
import { chunkContent, computeContentHash, type ChunkResult } from "./chunkingService";
import { parsePdfFile } from "./pdfService";
import type { 
  KnowledgeSource, 
  KnowledgeChunk, 
  InsertKnowledgeSource, 
  InsertKnowledgeChunk,
  ChunkWithScore,
  SearchResult,
  KnowledgeSourceType,
  InfoBlockType,
} from "@shared/schema";
import type { DocumentMetadata, ModuleUsability } from "@shared/document-knowledge-registry";
import { GLOBAL_PROJECT_ID, INITIAL_KNOWLEDGE_DOCUMENTS } from "@shared/document-knowledge-registry";

export interface IngestOptions {
  forceReindex?: boolean;
}

export interface SearchOptions {
  limit?: number;
  blockType?: InfoBlockType;
  sourceType?: KnowledgeSourceType;
  minScore?: number;
  includeGlobalKnowledge?: boolean;
  tags?: string[];
  category?: string;
  usableByModule?: ModuleUsability;
}

const DEFAULT_SEARCH_LIMIT = 5;
const DEFAULT_MIN_SCORE = 0.1;

export async function ingestBlockState(
  projectId: string,
  blockType: InfoBlockType,
  blockState: Record<string, unknown>,
  options: IngestOptions = {}
): Promise<KnowledgeSource> {
  const sourceRef = `block:${blockType}`;
  const contentHash = computeContentHash(blockState);

  const existingSource = await storage.getKnowledgeSourceByRef(projectId, "block_state", sourceRef);

  if (existingSource && existingSource.contentHash === contentHash && !options.forceReindex) {
    return existingSource;
  }

  if (existingSource) {
    await storage.deleteChunksBySource(existingSource.id);
  }

  const chunkResults = chunkContent({
    sourceType: "block_state",
    content: blockState,
    blockType,
  });

  const embeddings = await generateEmbeddings(chunkResults.map(c => c.content));

  const source = existingSource 
    ? await storage.updateKnowledgeSource(existingSource.id, {
        contentHash,
        tokenCount: embeddings.reduce((sum, e) => sum + e.tokenCount, 0),
        chunkCount: chunkResults.length,
        lastIndexedAt: new Date(),
      })
    : await storage.createKnowledgeSource({
        projectId,
        sourceType: "block_state",
        sourceRef,
        title: `${blockType} block state`,
        contentHash,
        tokenCount: embeddings.reduce((sum, e) => sum + e.tokenCount, 0),
        chunkCount: chunkResults.length,
        lastIndexedAt: new Date(),
      });

  if (!source) {
    throw new Error("Failed to create/update knowledge source");
  }

  const chunks: InsertKnowledgeChunk[] = chunkResults.map((chunk, idx) => ({
    projectId,
    sourceId: source.id,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    tokenCount: embeddings[idx].tokenCount,
    blockType: chunk.blockType,
    fieldPath: chunk.fieldPath,
    metadata: chunk.metadata,
    embedding: serializeEmbedding(embeddings[idx].embedding),
  }));

  await storage.createKnowledgeChunks(chunks);

  return source;
}

export async function ingestEvidence(
  projectId: string,
  evidenceId: string,
  evidenceData: {
    title?: string;
    summary?: string;
    sourceUrl?: string;
    sourceLabel?: string;
    linkedPaths?: string[];
    linkedBlockTypes?: string[];
    confidence?: string;
  },
  options: IngestOptions = {}
): Promise<KnowledgeSource> {
  const sourceRef = `evidence:${evidenceId}`;
  const contentHash = computeContentHash(evidenceData);

  const existingSource = await storage.getKnowledgeSourceByRef(projectId, "evidence", sourceRef);

  if (existingSource && existingSource.contentHash === contentHash && !options.forceReindex) {
    return existingSource;
  }

  if (existingSource) {
    await storage.deleteChunksBySource(existingSource.id);
  }

  const chunkResults = chunkContent({
    sourceType: "evidence",
    content: evidenceData,
  });

  const embeddings = await generateEmbeddings(chunkResults.map(c => c.content));

  const source = existingSource
    ? await storage.updateKnowledgeSource(existingSource.id, {
        contentHash,
        tokenCount: embeddings.reduce((sum, e) => sum + e.tokenCount, 0),
        chunkCount: chunkResults.length,
        lastIndexedAt: new Date(),
      })
    : await storage.createKnowledgeSource({
        projectId,
        sourceType: "evidence",
        sourceRef,
        title: evidenceData.title || `Evidence ${evidenceId}`,
        contentHash,
        tokenCount: embeddings.reduce((sum, e) => sum + e.tokenCount, 0),
        chunkCount: chunkResults.length,
        lastIndexedAt: new Date(),
      });

  if (!source) {
    throw new Error("Failed to create/update knowledge source");
  }

  const chunks: InsertKnowledgeChunk[] = chunkResults.map((chunk, idx) => ({
    projectId,
    sourceId: source.id,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    tokenCount: embeddings[idx].tokenCount,
    blockType: evidenceData.linkedBlockTypes?.[0],
    fieldPath: chunk.fieldPath,
    metadata: chunk.metadata,
    embedding: serializeEmbedding(embeddings[idx].embedding),
  }));

  await storage.createKnowledgeChunks(chunks);

  return source;
}

export async function ingestConversation(
  projectId: string,
  conversationId: number,
  messages: Array<{ role: string; content: string }>,
  options: IngestOptions = {}
): Promise<KnowledgeSource> {
  const sourceRef = `conversation:${conversationId}`;
  const contentHash = computeContentHash(messages);

  const existingSource = await storage.getKnowledgeSourceByRef(projectId, "conversation", sourceRef);

  if (existingSource && existingSource.contentHash === contentHash && !options.forceReindex) {
    return existingSource;
  }

  if (existingSource) {
    await storage.deleteChunksBySource(existingSource.id);
  }

  const chunkResults = chunkContent({
    sourceType: "conversation",
    content: messages,
  });

  const embeddings = await generateEmbeddings(chunkResults.map(c => c.content));

  const source = existingSource
    ? await storage.updateKnowledgeSource(existingSource.id, {
        contentHash,
        tokenCount: embeddings.reduce((sum, e) => sum + e.tokenCount, 0),
        chunkCount: chunkResults.length,
        lastIndexedAt: new Date(),
      })
    : await storage.createKnowledgeSource({
        projectId,
        sourceType: "conversation",
        sourceRef,
        title: `Conversation ${conversationId}`,
        contentHash,
        tokenCount: embeddings.reduce((sum, e) => sum + e.tokenCount, 0),
        chunkCount: chunkResults.length,
        lastIndexedAt: new Date(),
      });

  if (!source) {
    throw new Error("Failed to create/update knowledge source");
  }

  const chunks: InsertKnowledgeChunk[] = chunkResults.map((chunk, idx) => ({
    projectId,
    sourceId: source.id,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    tokenCount: embeddings[idx].tokenCount,
    metadata: chunk.metadata,
    embedding: serializeEmbedding(embeddings[idx].embedding),
  }));

  await storage.createKnowledgeChunks(chunks);

  return source;
}

export async function ingestDocument(
  documentId: string,
  title: string,
  content: string,
  metadata: DocumentMetadata,
  options: IngestOptions = {}
): Promise<KnowledgeSource> {
  const projectId = GLOBAL_PROJECT_ID;
  const sourceRef = `document:${documentId}`;
  const contentHash = computeContentHash(content);
  const metadataHash = computeContentHash(metadata);
  const combinedHash = `${contentHash}:${metadataHash}`;

  const existingSource = await storage.getKnowledgeSourceByRef(projectId, "document", sourceRef);

  if (existingSource && existingSource.contentHash === combinedHash && !options.forceReindex) {
    console.log(`Document ${documentId} unchanged (content and metadata), skipping reindex`);
    return existingSource;
  }
  
  if (existingSource && existingSource.contentHash?.split(':')[0] === contentHash && !options.forceReindex) {
    console.log(`Document ${documentId} content unchanged, updating metadata only`);
    const updatedSource = await storage.updateKnowledgeSource(existingSource.id, {
      title,
      metadata: metadata as unknown as Record<string, unknown>,
      contentHash: combinedHash,
      lastIndexedAt: new Date(),
    });
    return updatedSource!;
  }

  if (existingSource) {
    console.log(`Document ${documentId} changed, re-indexing...`);
    await storage.deleteChunksBySource(existingSource.id);
  }

  const chunkResults = chunkContent({
    sourceType: "document",
    content,
    documentMetadata: metadata,
  });

  console.log(`Chunked document ${documentId} into ${chunkResults.length} chunks`);

  const embeddings = await generateEmbeddings(chunkResults.map(c => c.content));

  const source = existingSource
    ? await storage.updateKnowledgeSource(existingSource.id, {
        title,
        contentHash: combinedHash,
        tokenCount: embeddings.reduce((sum, e) => sum + e.tokenCount, 0),
        chunkCount: chunkResults.length,
        metadata: metadata as unknown as Record<string, unknown>,
        lastIndexedAt: new Date(),
      })
    : await storage.createKnowledgeSource({
        projectId,
        sourceType: "document",
        sourceRef,
        title,
        contentHash: combinedHash,
        tokenCount: embeddings.reduce((sum, e) => sum + e.tokenCount, 0),
        chunkCount: chunkResults.length,
        metadata: metadata as unknown as Record<string, unknown>,
        lastIndexedAt: new Date(),
      });

  if (!source) {
    throw new Error("Failed to create/update knowledge source");
  }

  const chunks: InsertKnowledgeChunk[] = chunkResults.map((chunk, idx) => ({
    projectId,
    sourceId: source.id,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    tokenCount: embeddings[idx].tokenCount,
    metadata: chunk.metadata,
    embedding: serializeEmbedding(embeddings[idx].embedding),
  }));

  await storage.createKnowledgeChunks(chunks);

  console.log(`Indexed document ${documentId}: ${chunkResults.length} chunks, ${source.tokenCount} tokens`);

  return source;
}

export async function semanticSearch(
  projectId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult> {
  const limit = options.limit || DEFAULT_SEARCH_LIMIT;
  const minScore = options.minScore || DEFAULT_MIN_SCORE;
  const includeGlobal = options.includeGlobalKnowledge !== false;

  const queryEmbedding = await generateEmbedding(query);

  const projectChunks = await storage.getKnowledgeChunksByProject(projectId);
  
  let allChunks = [...projectChunks];
  
  if (includeGlobal && projectId !== GLOBAL_PROJECT_ID) {
    const globalChunks = await storage.getKnowledgeChunksByProject(GLOBAL_PROJECT_ID);
    allChunks = [...allChunks, ...globalChunks];
  }

  let filteredChunks = allChunks;

  if (options.blockType) {
    filteredChunks = filteredChunks.filter(c => c.blockType === options.blockType);
  }

  if (options.sourceType) {
    const projectSources = await storage.getKnowledgeSourcesByProject(projectId);
    let allSources = [...projectSources];
    
    if (includeGlobal && projectId !== GLOBAL_PROJECT_ID) {
      const globalSources = await storage.getKnowledgeSourcesByProject(GLOBAL_PROJECT_ID);
      allSources = [...allSources, ...globalSources];
    }
    
    const sourceIds = allSources
      .filter(s => s.sourceType === options.sourceType)
      .map(s => s.id);
    filteredChunks = filteredChunks.filter(c => sourceIds.includes(c.sourceId));
  }

  if (options.tags && options.tags.length > 0) {
    filteredChunks = filteredChunks.filter(chunk => {
      const chunkTags = (chunk.metadata as any)?.tags as string[] | undefined;
      if (!chunkTags) return false;
      return options.tags!.some(tag => chunkTags.includes(tag));
    });
  }

  if (options.category) {
    filteredChunks = filteredChunks.filter(chunk => {
      const chunkCategory = (chunk.metadata as any)?.category;
      return chunkCategory === options.category;
    });
  }

  if (options.usableByModule) {
    filteredChunks = filteredChunks.filter(chunk => {
      const usableBy = (chunk.metadata as any)?.usableBy as string[] | undefined;
      if (!usableBy) return true;
      return usableBy.includes(options.usableByModule!) || usableBy.includes("all");
    });
  }

  const scoredChunks: ChunkWithScore[] = filteredChunks
    .filter(chunk => chunk.embedding)
    .map(chunk => {
      const chunkEmbedding = deserializeEmbedding(chunk.embedding!);
      const score = cosineSimilarity(queryEmbedding.embedding, chunkEmbedding);
      return { ...chunk, score };
    })
    .filter(chunk => chunk.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const sourceIds = Array.from(new Set(scoredChunks.map(c => c.sourceId)));
  const sources = await Promise.all(sourceIds.map(id => storage.getKnowledgeSource(id)));
  const sourceMap = new Map(sources.filter(Boolean).map(s => [s!.id, s!]));

  const chunksWithSources = scoredChunks.map(chunk => ({
    ...chunk,
    source: sourceMap.get(chunk.sourceId),
  }));

  return {
    chunks: chunksWithSources,
    totalCount: chunksWithSources.length,
    query,
  };
}

export async function getKnowledgeStats(projectId: string): Promise<{
  sourceCount: number;
  chunkCount: number;
  totalTokens: number;
  bySourceType: Record<string, number>;
}> {
  const sources = await storage.getKnowledgeSourcesByProject(projectId);
  
  const bySourceType: Record<string, number> = {};
  let totalTokens = 0;
  let chunkCount = 0;

  for (const source of sources) {
    bySourceType[source.sourceType] = (bySourceType[source.sourceType] || 0) + 1;
    totalTokens += source.tokenCount || 0;
    chunkCount += source.chunkCount || 0;
  }

  return {
    sourceCount: sources.length,
    chunkCount,
    totalTokens,
    bySourceType,
  };
}

export async function autoSeedKnowledgeBase(): Promise<{
  seeded: string[];
  skipped: string[];
  errors: string[];
}> {
  const results = {
    seeded: [] as string[],
    skipped: [] as string[],
    errors: [] as string[],
  };

  console.log(`📚 Checking knowledge base for ${INITIAL_KNOWLEDGE_DOCUMENTS.length} documents...`);

  for (const doc of INITIAL_KNOWLEDGE_DOCUMENTS) {
    try {
      const sourceRef = `document:${doc.id}`;
      const existingSource = await storage.getKnowledgeSourceByRef(GLOBAL_PROJECT_ID, "document", sourceRef);
      
      if (existingSource) {
        results.skipped.push(doc.id);
        continue;
      }

      console.log(`📄 Seeding: ${doc.title}...`);
      const pdfResult = await parsePdfFile(doc.filePath);
      
      await ingestDocument(
        doc.id,
        doc.title,
        pdfResult.text,
        doc.metadata
      );
      
      results.seeded.push(doc.id);
      console.log(`✅ Seeded: ${doc.id} (${pdfResult.numPages} pages)`);
    } catch (error) {
      results.errors.push(`${doc.id}: ${error}`);
      console.error(`❌ Failed to seed ${doc.id}:`, error);
    }
  }

  if (results.seeded.length > 0) {
    console.log(`📚 Knowledge base seeding complete: ${results.seeded.length} new, ${results.skipped.length} existing`);
  } else if (results.skipped.length > 0) {
    console.log(`📚 Knowledge base up to date (${results.skipped.length} documents)`);
  }

  return results;
}
