import fs from 'fs/promises';
import path from 'path';
import { extractFromPath, extractUpload } from './fileExtract';

/**
 * Parse an uploaded file (on disk) into grounding text.
 * Coverage now spans pdf · docx · xlsx · csv/txt/md/json · images (vision) ·
 * audio (transcription) — see fileExtract.ts. Kept as a thin wrapper so any
 * existing callers of parseFile() keep working.
 */
export async function parseFile(filePath: string): Promise<string> {
  return extractFromPath(filePath);
}

/**
 * Save an uploaded file buffer and extract its text.
 * Returns { savedPath, content }. The file is persisted for the audit trail;
 * extraction works off the in-memory buffer (no double read).
 */
export async function saveAndParseUpload(
  buffer: Buffer,
  filename: string,
  runDir: string,
  mimeType?: string,
): Promise<{ savedPath: string; content: string; parseError: string | null }> {
  const uploadsDir = path.join(runDir, 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const savedPath = path.join(uploadsDir, safeName);
  await fs.writeFile(savedPath, buffer);

  // Use the STRUCTURED extractor result rather than extractToString, which
  // flattens `{ ok: false, reason }` into the string
  //   "[Couldn't read X: reason]"
  // and hands it back as if it were the document's text. Downstream that
  // placeholder was stored as `fullText`, summarised into the org's context
  // pack, and posted to the agent under the heading "Parsed content:" — so an
  // unreadable file was recorded as a read one, and the agent was asked to
  // extract facts from an apology.
  //
  // The file is already on disk at this point, so a failure costs us the text,
  // never the upload itself. Extraction is an ENRICHMENT of a file we have.
  try {
    const r = await extractUpload(buffer, { filename, mimeType });
    if (!r.ok) {
      const parseError = [r.reason, r.fix].filter(Boolean).join(' ').slice(0, 500);
      console.warn(`[fileParser] Could not read ${safeName} (file kept): ${parseError}`);
      return { savedPath, content: '', parseError };
    }
    // Extractors can succeed and still yield nothing — a scanned PDF with no
    // text layer, an empty sheet. That is not a readable document either.
    if (!r.text.trim()) {
      console.warn(`[fileParser] ${safeName} extracted to empty text (file kept)`);
      return {
        savedPath,
        content: '',
        parseError: 'No text could be extracted from the file.',
      };
    }
    console.log(`[fileParser] Extracted ${safeName}: ${r.text.length} chars`);
    return { savedPath, content: r.text, parseError: null };
  } catch (e: any) {
    const parseError = String(e?.message ?? e).slice(0, 500);
    console.error(`[fileParser] Extraction threw for ${safeName} (file kept): ${parseError}`);
    return { savedPath, content: '', parseError };
  }
}
