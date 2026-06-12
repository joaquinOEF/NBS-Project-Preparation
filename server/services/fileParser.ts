import fs from 'fs/promises';
import path from 'path';
import { extractFromPath, extractToString } from './fileExtract';

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
): Promise<{ savedPath: string; content: string }> {
  const uploadsDir = path.join(runDir, 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const savedPath = path.join(uploadsDir, safeName);
  await fs.writeFile(savedPath, buffer);

  const content = await extractToString(buffer, filename, mimeType);
  console.log(`[fileParser] Extracted ${safeName}: ${content.length} chars`);

  return { savedPath, content };
}
