const EMBEDDING_DIMENSIONS = 256;

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  tokenCount: number;
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const embedding = generateTextBasedEmbedding(text);
  return {
    text,
    embedding,
    tokenCount: estimateTokens(text),
  };
}

export async function generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
  return texts.map(text => ({
    text,
    embedding: generateTextBasedEmbedding(text),
    tokenCount: estimateTokens(text),
  }));
}

function generateTextBasedEmbedding(text: string): number[] {
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, " ");
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  
  const embedding = new Array(EMBEDDING_DIMENSIONS).fill(0);
  
  for (const word of words) {
    const hash = hashString(word);
    const index = Math.abs(hash) % EMBEDDING_DIMENSIONS;
    embedding[index] += 1;
  }
  
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function serializeEmbedding(embedding: number[]): string {
  return JSON.stringify(embedding);
}

export function deserializeEmbedding(serialized: string): number[] {
  return JSON.parse(serialized);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export { EMBEDDING_DIMENSIONS };
