import { pgTable, text, timestamp, uuid, integer, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export type KnowledgeSourceType = "block_state" | "evidence" | "conversation" | "document" | "external";

export const knowledgeSources = pgTable("knowledge_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: text("project_id").notNull(),
  sourceType: text("source_type").notNull().$type<KnowledgeSourceType>(),
  sourceRef: text("source_ref").notNull(),
  title: text("title"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  contentHash: text("content_hash"),
  tokenCount: integer("token_count").default(0),
  chunkCount: integer("chunk_count").default(0),
  isActive: boolean("is_active").default(true),
  lastIndexedAt: timestamp("last_indexed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("knowledge_sources_project_idx").on(table.projectId),
  index("knowledge_sources_type_idx").on(table.sourceType),
]);

export const knowledgeChunks = pgTable("knowledge_chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: text("project_id").notNull(),
  sourceId: uuid("source_id").notNull().references(() => knowledgeSources.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  tokenCount: integer("token_count").default(0),
  blockType: text("block_type"),
  fieldPath: text("field_path"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  embedding: text("embedding"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("knowledge_chunks_project_idx").on(table.projectId),
  index("knowledge_chunks_source_idx").on(table.sourceId),
  index("knowledge_chunks_block_type_idx").on(table.blockType),
]);

export const insertKnowledgeSourceSchema = createInsertSchema(knowledgeSources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKnowledgeChunkSchema = createInsertSchema(knowledgeChunks).omit({
  id: true,
  createdAt: true,
});

export type InsertKnowledgeSource = z.infer<typeof insertKnowledgeSourceSchema>;
export type InsertKnowledgeChunk = z.infer<typeof insertKnowledgeChunkSchema>;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
export type KnowledgeChunk = typeof knowledgeChunks.$inferSelect;

export interface ChunkWithScore extends KnowledgeChunk {
  score: number;
  source?: KnowledgeSource;
}

export interface SearchResult {
  chunks: ChunkWithScore[];
  totalCount: number;
  query: string;
}

export interface ChunkingOptions {
  maxTokens?: number;
  overlap?: number;
  preserveFieldPaths?: boolean;
}

export const DEFAULT_CHUNKING_OPTIONS: ChunkingOptions = {
  maxTokens: 500,
  overlap: 50,
  preserveFieldPaths: true,
};
