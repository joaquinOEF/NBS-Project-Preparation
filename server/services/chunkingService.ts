import { estimateTokens } from "./embeddingService";
import type { InfoBlockType } from "@shared/schema";
import type { ChunkingOptions } from "@shared/knowledge-schema";
import type { DocumentMetadata } from "@shared/document-knowledge-registry";

export interface ChunkResult {
  content: string;
  tokenCount: number;
  chunkIndex: number;
  blockType?: string;
  fieldPath?: string;
  metadata: Record<string, unknown>;
}

export interface ContentToChunk {
  sourceType: "block_state" | "evidence" | "conversation" | "document";
  content: unknown;
  blockType?: InfoBlockType;
  metadata?: Record<string, unknown>;
  documentMetadata?: DocumentMetadata;
}

const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_OVERLAP = 50;

export function chunkContent(
  input: ContentToChunk,
  options: ChunkingOptions = {}
): ChunkResult[] {
  const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  const overlap = options.overlap || DEFAULT_OVERLAP;

  switch (input.sourceType) {
    case "block_state":
      return chunkBlockState(input.content, input.blockType, maxTokens, overlap);
    case "evidence":
      return chunkEvidence(input.content, maxTokens, overlap);
    case "conversation":
      return chunkConversation(input.content, maxTokens, overlap);
    case "document":
      return chunkDocument(input.content as string, input.documentMetadata, maxTokens, overlap);
    default:
      return chunkGenericText(String(input.content), maxTokens, overlap);
  }
}

function chunkBlockState(
  content: unknown,
  blockType?: InfoBlockType,
  maxTokens: number = DEFAULT_MAX_TOKENS,
  overlap: number = DEFAULT_OVERLAP
): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  const flattenedPaths = flattenObject(content as Record<string, unknown>, "");

  let currentChunk = "";
  let currentPaths: string[] = [];
  let chunkIndex = 0;

  for (const [path, value] of Object.entries(flattenedPaths)) {
    const valueStr = formatValue(value);
    const line = `${path}: ${valueStr}\n`;
    const lineTokens = estimateTokens(line);

    if (estimateTokens(currentChunk) + lineTokens > maxTokens && currentChunk) {
      chunks.push({
        content: currentChunk.trim(),
        tokenCount: estimateTokens(currentChunk),
        chunkIndex,
        blockType,
        fieldPath: currentPaths.join(", "),
        metadata: { paths: currentPaths, blockType },
      });
      chunkIndex++;

      const overlapLines = currentChunk.split("\n").slice(-2).join("\n");
      currentChunk = overlapLines + "\n" + line;
      currentPaths = [path];
    } else {
      currentChunk += line;
      currentPaths.push(path);
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      tokenCount: estimateTokens(currentChunk),
      chunkIndex,
      blockType,
      fieldPath: currentPaths.join(", "),
      metadata: { paths: currentPaths, blockType },
    });
  }

  return chunks;
}

function chunkEvidence(
  content: unknown,
  maxTokens: number = DEFAULT_MAX_TOKENS,
  overlap: number = DEFAULT_OVERLAP
): ChunkResult[] {
  const evidence = content as {
    title?: string;
    summary?: string;
    sourceUrl?: string;
    sourceLabel?: string;
    linkedPaths?: string[];
    linkedBlockTypes?: string[];
    confidence?: string;
  };

  const text = [
    evidence.title ? `Title: ${evidence.title}` : "",
    evidence.summary ? `Summary: ${evidence.summary}` : "",
    evidence.sourceLabel ? `Source: ${evidence.sourceLabel}` : "",
    evidence.sourceUrl ? `URL: ${evidence.sourceUrl}` : "",
    evidence.confidence ? `Confidence: ${evidence.confidence}` : "",
    evidence.linkedPaths?.length ? `Related fields: ${evidence.linkedPaths.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [{
    content: text,
    tokenCount: estimateTokens(text),
    chunkIndex: 0,
    fieldPath: evidence.linkedPaths?.join(", "),
    metadata: {
      linkedBlockTypes: evidence.linkedBlockTypes,
      confidence: evidence.confidence,
    },
  }];
}

function chunkConversation(
  content: unknown,
  maxTokens: number = DEFAULT_MAX_TOKENS,
  overlap: number = DEFAULT_OVERLAP
): ChunkResult[] {
  const messages = content as Array<{ role: string; content: string }>;
  const chunks: ChunkResult[] = [];

  let currentChunk = "";
  let chunkIndex = 0;
  let messageRange: [number, number] = [0, 0];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const line = `${msg.role}: ${msg.content}\n\n`;
    const lineTokens = estimateTokens(line);

    if (estimateTokens(currentChunk) + lineTokens > maxTokens && currentChunk) {
      chunks.push({
        content: currentChunk.trim(),
        tokenCount: estimateTokens(currentChunk),
        chunkIndex,
        metadata: { messageRange: [...messageRange] },
      });
      chunkIndex++;

      currentChunk = line;
      messageRange = [i, i];
    } else {
      currentChunk += line;
      messageRange[1] = i;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      tokenCount: estimateTokens(currentChunk),
      chunkIndex,
      metadata: { messageRange: [...messageRange] },
    });
  }

  return chunks;
}

function chunkDocument(
  text: string,
  documentMetadata?: DocumentMetadata,
  maxTokens: number = DEFAULT_MAX_TOKENS,
  overlap: number = DEFAULT_OVERLAP
): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  
  const sections = detectDocumentSections(text);
  let chunkIndex = 0;
  
  for (const section of sections) {
    const sectionChunks = chunkSectionText(section.content, maxTokens, overlap);
    
    for (const content of sectionChunks) {
      chunks.push({
        content,
        tokenCount: estimateTokens(content),
        chunkIndex,
        metadata: {
          section: section.title,
          category: documentMetadata?.category,
          tags: documentMetadata?.tags,
          usableBy: documentMetadata?.usableBy,
          documentType: documentMetadata?.documentType,
          region: documentMetadata?.region,
        },
      });
      chunkIndex++;
    }
  }
  
  return chunks;
}

interface DocumentSection {
  title: string;
  content: string;
}

function detectDocumentSections(text: string): DocumentSection[] {
  const sectionPatterns = [
    /^#{1,3}\s+(.+)$/gm,
    /^([A-Z][A-Za-z\s]+)$/gm,
    /^(\d+\.?\s+[A-Z][A-Za-z\s]+)$/gm,
  ];
  
  const lines = text.split('\n');
  const sections: DocumentSection[] = [];
  let currentTitle = "Introduction";
  let currentContent: string[] = [];
  
  for (const line of lines) {
    const isHeading = 
      /^#{1,3}\s+/.test(line) ||
      (/^[A-Z][A-Za-z\s]{5,50}$/.test(line.trim()) && line.trim().length < 60);
    
    if (isHeading && currentContent.length > 0) {
      sections.push({
        title: currentTitle,
        content: currentContent.join('\n').trim(),
      });
      currentTitle = line.replace(/^#{1,3}\s+/, '').trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  
  if (currentContent.length > 0) {
    sections.push({
      title: currentTitle,
      content: currentContent.join('\n').trim(),
    });
  }
  
  if (sections.length === 0) {
    sections.push({
      title: "Content",
      content: text,
    });
  }
  
  return sections.filter(s => s.content.length > 50);
}

function chunkSectionText(
  text: string,
  maxTokens: number,
  overlap: number
): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  
  let currentChunk = "";
  
  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) continue;
    
    const paragraphTokens = estimateTokens(trimmedParagraph);
    
    if (paragraphTokens > maxTokens) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      
      const sentences = trimmedParagraph.split(/(?<=[.!?])\s+/);
      let sentenceChunk = "";
      
      for (const sentence of sentences) {
        if (estimateTokens(sentenceChunk + " " + sentence) > maxTokens && sentenceChunk) {
          chunks.push(sentenceChunk.trim());
          const overlapWords = sentenceChunk.split(' ').slice(-10).join(' ');
          sentenceChunk = overlapWords + " " + sentence;
        } else {
          sentenceChunk += (sentenceChunk ? " " : "") + sentence;
        }
      }
      
      if (sentenceChunk.trim()) {
        currentChunk = sentenceChunk;
      }
    } else if (estimateTokens(currentChunk) + paragraphTokens > maxTokens) {
      chunks.push(currentChunk.trim());
      const overlapSentences = currentChunk.split(/(?<=[.!?])\s+/).slice(-2).join(' ');
      currentChunk = (overlapSentences ? overlapSentences + "\n\n" : "") + trimmedParagraph + "\n\n";
    } else {
      currentChunk += trimmedParagraph + "\n\n";
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

function chunkGenericText(
  text: string,
  maxTokens: number = DEFAULT_MAX_TOKENS,
  overlap: number = DEFAULT_OVERLAP
): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  const paragraphs = text.split(/\n\n+/);

  let currentChunk = "";
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);

    if (paragraphTokens > maxTokens) {
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          tokenCount: estimateTokens(currentChunk),
          chunkIndex,
          metadata: {},
        });
        chunkIndex++;
        currentChunk = "";
      }

      const words = paragraph.split(/\s+/);
      let wordChunk = "";

      for (const word of words) {
        if (estimateTokens(wordChunk + " " + word) > maxTokens && wordChunk) {
          chunks.push({
            content: wordChunk.trim(),
            tokenCount: estimateTokens(wordChunk),
            chunkIndex,
            metadata: {},
          });
          chunkIndex++;
          wordChunk = word;
        } else {
          wordChunk += (wordChunk ? " " : "") + word;
        }
      }

      if (wordChunk.trim()) {
        currentChunk = wordChunk + "\n\n";
      }
    } else if (estimateTokens(currentChunk) + paragraphTokens > maxTokens) {
      chunks.push({
        content: currentChunk.trim(),
        tokenCount: estimateTokens(currentChunk),
        chunkIndex,
        metadata: {},
      });
      chunkIndex++;
      currentChunk = paragraph + "\n\n";
    } else {
      currentChunk += paragraph + "\n\n";
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      tokenCount: estimateTokens(currentChunk),
      chunkIndex,
      metadata: {},
    });
  }

  return chunks;
}

function flattenObject(
  obj: Record<string, unknown>,
  prefix: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      
      if (typeof value[0] === "object" && value[0] !== null) {
        value.forEach((item, index) => {
          if (typeof item === "object" && item !== null) {
            Object.assign(result, flattenObject(item as Record<string, unknown>, `${newKey}[${index}]`));
          } else {
            result[`${newKey}[${index}]`] = item;
          }
        });
      } else {
        result[newKey] = value.join(", ");
      }
    } else if (typeof value === "object") {
      Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function computeContentHash(content: unknown): string {
  const str = typeof content === "string" ? content : JSON.stringify(content);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
