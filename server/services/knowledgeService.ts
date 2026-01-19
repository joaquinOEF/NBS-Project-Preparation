import { storage } from "../storage";
import { generateEmbedding, generateEmbeddings, serializeEmbedding, deserializeEmbedding, cosineSimilarity } from "./embeddingService";
import { chunkContent, computeContentHash, type ChunkResult } from "./chunkingService";
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

export interface IngestOptions {
  forceReindex?: boolean;
}

export interface SearchOptions {
  limit?: number;
  blockType?: InfoBlockType;
  sourceType?: KnowledgeSourceType;
  minScore?: number;
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

export async function semanticSearch(
  projectId: string,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult> {
  const limit = options.limit || DEFAULT_SEARCH_LIMIT;
  const minScore = options.minScore || DEFAULT_MIN_SCORE;

  const queryEmbedding = await generateEmbedding(query);

  const allChunks = await storage.getKnowledgeChunksByProject(projectId);

  let filteredChunks = allChunks;

  if (options.blockType) {
    filteredChunks = filteredChunks.filter(c => c.blockType === options.blockType);
  }

  if (options.sourceType) {
    const sources = await storage.getKnowledgeSourcesByProject(projectId);
    const sourceIds = sources
      .filter(s => s.sourceType === options.sourceType)
      .map(s => s.id);
    filteredChunks = filteredChunks.filter(c => sourceIds.includes(c.sourceId));
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
