import fs from 'fs/promises';
import path from 'path';

/**
 * Parse uploaded files into text content.
 * Supports: .pdf, .docx, .xlsx, .txt, .md
 */
export async function parseFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.txt':
    case '.md':
      return await fs.readFile(filePath, 'utf-8');

    case '.docx':
      return await parseDocx(filePath);

    case '.pdf':
      return await parsePdf(filePath);

    case '.xlsx':
      return await parseXlsx(filePath);

    default:
      return `[Unsupported file type: ${ext}]`;
  }
}

async function parseDocx(filePath: string): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (e: any) {
    console.error('[fileParser] DOCX error:', e.message);
    return `[Error parsing DOCX: ${e.message}]`;
  }
}

async function parsePdf(filePath: string): Promise<string> {
  try {
    // pdf-parse v2 exports a PDFParse class, not a function
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const { PDFParse } = req('pdf-parse');

    const buffer = await fs.readFile(filePath);
    const uint8Array = new Uint8Array(buffer);
    const parser = new PDFParse(uint8Array);
    await parser.load();
    const result = await parser.getText();
    const pages: any[] = result.pages || [];
    const text = pages.map((p: any) => p.text).join('\n\n').trim();
    return text || '[No text extracted from PDF]';
  } catch (e: any) {
    console.error('[fileParser] PDF error:', e.message);
    return `[Error parsing PDF: ${e.message}]`;
  }
}

async function parseXlsx(filePath: string): Promise<string> {
  // Basic xlsx — suggest CSV for better results
  try {
    const buffer = await fs.readFile(filePath);
    return `[Excel file: ${(buffer.length / 1024).toFixed(0)}KB — for best results, save as CSV and re-upload]`;
  } catch {
    return `[Excel file uploaded — convert to CSV for better parsing]`;
  }
}

/**
 * Save an uploaded file buffer and parse it.
 * Returns { savedPath, content }
 */
export async function saveAndParseUpload(
  buffer: Buffer,
  filename: string,
  runDir: string,
): Promise<{ savedPath: string; content: string }> {
  const uploadsDir = path.join(runDir, 'uploads');
  await fs.mkdir(uploadsDir, { recursive: true });

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const savedPath = path.join(uploadsDir, safeName);
  await fs.writeFile(savedPath, buffer);

  const content = await parseFile(savedPath);
  console.log(`[fileParser] Parsed ${safeName}: ${content.length} chars`);

  return { savedPath, content };
}
