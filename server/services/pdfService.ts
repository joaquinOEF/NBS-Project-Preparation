import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const ALLOWED_DIRECTORIES = [
  'attached_assets',
  'uploads',
  'knowledge_documents',
];

export interface PdfParseResult {
  text: string;
  numPages: number;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
  };
}

function validateFilePath(filePath: string): string {
  const normalizedPath = path.normalize(filePath);
  
  if (path.isAbsolute(normalizedPath)) {
    throw new Error('Absolute paths are not allowed');
  }
  
  if (normalizedPath.includes('..')) {
    throw new Error('Path traversal is not allowed');
  }
  
  const pathParts = normalizedPath.split(path.sep);
  const topDirectory = pathParts[0];
  
  if (!ALLOWED_DIRECTORIES.includes(topDirectory)) {
    throw new Error(`Access denied: files must be in allowed directories (${ALLOWED_DIRECTORIES.join(', ')})`);
  }
  
  return path.join(process.cwd(), normalizedPath);
}

export async function parsePdfFile(filePath: string): Promise<PdfParseResult> {
  const absolutePath = validateFilePath(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const buffer = fs.readFileSync(absolutePath);
  const uint8Array = new Uint8Array(buffer);
  
  const pdfParseModule = require('pdf-parse');
  const PDFParse = pdfParseModule.PDFParse;
  
  const parser = new PDFParse(uint8Array);
  await parser.load();
  
  const textResult = await parser.getText();
  
  const pages = textResult.pages || [];
  const fullText = pages.map((p: any) => p.text).join('\n\n');
  
  let info: any = {};
  try {
    info = await parser.getInfo();
  } catch (e) {
  }

  return {
    text: fullText,
    numPages: textResult.total || pages.length,
    metadata: {
      title: info?.Title,
      author: info?.Author,
      subject: info?.Subject,
      creator: info?.Creator,
    },
  };
}

export async function parsePdfBuffer(buffer: Buffer): Promise<PdfParseResult> {
  const uint8Array = new Uint8Array(buffer);
  
  const pdfParseModule = require('pdf-parse');
  const PDFParse = pdfParseModule.PDFParse;
  
  const parser = new PDFParse(uint8Array);
  await parser.load();
  
  const textResult = await parser.getText();
  
  const pages = textResult.pages || [];
  const fullText = pages.map((p: any) => p.text).join('\n\n');
  
  let info: any = {};
  try {
    info = await parser.getInfo();
  } catch (e) {
  }

  return {
    text: fullText,
    numPages: textResult.total || pages.length,
    metadata: {
      title: info?.Title,
      author: info?.Author,
      subject: info?.Subject,
      creator: info?.Creator,
    },
  };
}
