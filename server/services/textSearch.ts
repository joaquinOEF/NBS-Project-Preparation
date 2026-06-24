// Lightweight lexical search — keyword scoring + excerpt extraction, no
// embeddings/vector store. Mirrors the proven OEF Knowledge-Base-MCP (Funga)
// retrieval pattern: cheap, zero-infra, good for a curated/modest corpus. Used
// by the CBO agent's search_org_documents + search_knowledge tools so it pulls
// the RELEVANT passage from a large doc instead of dumping (or blunt-truncating)
// the whole thing.

// Small EN + PT-BR stopword set — enough to stop common words from dominating
// the score; not exhaustive.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on', 'for', 'is', 'are', 'be', 'with', 'as', 'at', 'by',
  'we', 'our', 'this', 'that', 'it', 'from', 'how', 'what', 'who', 'do', 'does',
  'que', 'de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'para', 'com', 'um', 'uma',
  'em', 'no', 'na', 'nos', 'nas', 'se', 'por', 'como', 'qual', 'nosso', 'nossa',
]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Tokenize a query into scorable terms (lowercased, stopwords + 1-char dropped). */
export function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/[^0-9a-zà-ÿ]/gi, '')) // keep Latin + PT-accented chars; avoid \p{} (needs higher tsc target)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/** Score a text blob against query terms — term presence + capped frequency. */
export function scoreText(text: string, terms: string[]): number {
  if (terms.length === 0) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const matches = (lower.match(new RegExp(escapeRegex(term), 'g')) || []).length;
    if (matches > 0) score += 5 + Math.min(matches * 3, 15);
  }
  return score;
}

/** Pull a ~window-sized excerpt around the first matching term, with ellipses. */
export function extractExcerpt(text: string, terms: string[], maxLength = 500): string {
  if (!text) return '';
  const lower = text.toLowerCase();
  let pos = -1;
  for (const term of terms) {
    const p = lower.indexOf(term);
    if (p !== -1) { pos = p; break; }
  }
  if (pos === -1) return text.slice(0, maxLength).trim() + (text.length > maxLength ? '…' : '');
  const start = Math.max(0, pos - Math.floor(maxLength / 3));
  const end = Math.min(text.length, start + maxLength);
  const slice = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${slice}${end < text.length ? '…' : ''}`;
}
