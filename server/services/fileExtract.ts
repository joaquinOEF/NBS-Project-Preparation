// Unified upload extractor — turns any supported file into grounding text.
//
// Inspired by the OEF Knowledge Base MCP / Funga `file-extract.ts` leaf module,
// adapted to this repo's infra: instead of pulling in the Anthropic SDK +
// OpenAI Whisper key, it reuses the Replit AI Integrations OpenAI-compatible
// client that's already configured here (server/services/openaiClient.ts) for
// BOTH image vision and audio transcription — so no new API keys are needed.
//
// Coverage: pdf · docx · xlsx · csv/tsv/txt/md/json/xml/yaml · images (vision)
//           · audio (transcription).
//
// Contract: parser failures THROW (caller can distinguish transient errors);
// "unsupported / too big / bad format" return { ok:false, reason, fix } with an
// actionable, user-facing fix string.

import fs from "fs/promises";
import path from "path";
import { toFile } from "openai";
import { openai } from "./openaiClient";

export type ExtractKind = "pdf" | "docx" | "xlsx" | "text" | "image" | "audio";
export type ExtractResult =
  | { ok: true; kind: ExtractKind; text: string }
  | { ok: false; reason: string; fix?: string };

// Replit AI Integrations models. Vision goes through the chat-completions
// endpoint with an image_url block; transcription through the audio endpoint.
const VISION_MODEL = process.env.UPLOAD_VISION_MODEL || "gpt-5.2";
const TRANSCRIBE_MODEL = process.env.UPLOAD_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";

const MAX_IMAGE_BYTES = 18 * 1024 * 1024; // generous; data-url base64 inflates ~33%
const MAX_AUDIO_BYTES = 24 * 1024 * 1024; // transcription endpoint ceiling is ~25MB

const AUDIO_EXT = new Set(["mp3", "wav", "m4a", "webm", "ogg", "oga", "opus", "aac", "flac", "mp4", "mpeg", "mpga"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const TEXT_EXT = new Set(["txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "log", "html", "htm"]);

function extOf(filename: string): string {
  return path.extname(filename).replace(".", "").toLowerCase();
}

function imageMediaType(ext: string): string | null {
  switch (ext) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    default: return null;
  }
}

const IMAGE_PROMPT =
  "Transcribe and describe this image so it can be used as grounding context for a project profile. " +
  "Transcribe any visible text verbatim and preserve its structure (headings, tables, lists). " +
  "Then briefly describe what is shown (e.g. a site photo, a hand-drawn plan, a budget table). " +
  "Be faithful and literal — only report what is actually visible; never infer or invent. " +
  "Respond in the language of the document, or English if there is no text.";

/**
 * Main entry — route a buffer to the right extractor by extension/mime.
 */
export async function extractUpload(
  buf: Buffer,
  opts: { filename: string; mimeType?: string },
): Promise<ExtractResult> {
  const ext = extOf(opts.filename);
  const mime = (opts.mimeType || "").toLowerCase();

  if (AUDIO_EXT.has(ext) || mime.startsWith("audio/")) return extractAudio(buf, opts.filename, ext);
  if (IMAGE_EXT.has(ext) || mime.startsWith("image/")) return extractImage(buf, ext, mime);
  if (ext === "pdf" || mime === "application/pdf") return { ok: true, kind: "pdf", text: await extractPdf(buf) };
  if (ext === "docx" || mime.includes("wordprocessingml")) return { ok: true, kind: "docx", text: await extractDocx(buf) };
  if (ext === "xlsx" || mime.includes("spreadsheetml")) return { ok: true, kind: "xlsx", text: await extractXlsx(buf) };
  if (TEXT_EXT.has(ext) || mime.startsWith("text/")) return { ok: true, kind: "text", text: buf.toString("utf-8") };

  if (ext === "doc") return { ok: false, reason: "Legacy .doc isn't supported.", fix: "Save as .docx or PDF and re-upload." };
  if (ext === "pptx" || ext === "ppt") return { ok: false, reason: "Slides aren't supported here yet.", fix: "Export the slides as PDF and re-upload." };
  return { ok: false, reason: `Unsupported file type: .${ext || "?"}`, fix: "Try a PDF, Word doc, image, spreadsheet, or audio recording." };
}

const MAX_PDF_VISION_BYTES = 25 * 1024 * 1024;
const PDF_VISION_PROMPT =
  "This PDF's text layer was empty or sparse — it's likely a scan, a photo, or an image-heavy " +
  "one-pager. Read it visually: transcribe all legible text verbatim (preserve headings, tables, " +
  "lists), and briefly describe any diagrams, plans, or photos. Be faithful and literal — only " +
  "report what is actually visible. Respond in the language of the document.";

async function extractPdf(buf: Buffer): Promise<string> {
  // Text-first: pdf-parse v2 exports a PDFParse class (not the old default fn).
  const { createRequire } = (await import("module")) as any;
  const req = createRequire(import.meta.url);
  const { PDFParse } = req("pdf-parse");
  const parser = new PDFParse(new Uint8Array(buf));
  await parser.load();
  const result = await parser.getText();
  const pages: any[] = result.pages || [];
  const pageCount = pages.length || 1;
  const text = pages.map((p: any) => p.text).join("\n\n").trim();

  // Most proposals/reports are real text PDFs — return the cheap, exact text.
  // Only fall back to a (pricier) vision pass when the text layer is empty or
  // suspiciously thin (avg < ~100 chars/page), which means a scan / photo /
  // image-only deck where pdf-parse gets nothing useful.
  const thin = text.length < Math.max(200, pageCount * 100);
  if (!thin) return text;

  const visioned = await pdfVisionFallback(buf).catch((e) => {
    console.error("[fileExtract] PDF vision fallback failed:", e?.message || e);
    return "";
  });
  if (visioned.trim()) {
    return text ? `${text}\n\n[Vision pass over scanned/visual pages]\n${visioned}` : visioned;
  }
  return text || "[No selectable text in this PDF — it may be a scan. Describe it in chat or upload a photo of the key page.]";
}

// Send the whole PDF to a vision-capable model via the Responses API (the same
// endpoint openaiClient uses). The model renders the pages internally, so we
// avoid a heavy local PDF→image render dependency. Best-effort: the caller
// treats any throw / empty return as "no vision available" and keeps the text.
async function pdfVisionFallback(buf: Buffer): Promise<string> {
  if (buf.length > MAX_PDF_VISION_BYTES) return "";
  const dataUrl = `data:application/pdf;base64,${buf.toString("base64")}`;
  const resp: any = await openai.responses.create({
    model: VISION_MODEL,
    max_output_tokens: 4096,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: PDF_VISION_PROMPT },
        { type: "input_file", filename: "document.pdf", file_data: dataUrl },
      ],
    }],
  } as any);
  // Pull text out of the Responses output (mirrors openaiClient's extractor).
  const out: any[] = resp?.output || [];
  return out
    .filter((i: any) => i.type === "message")
    .flatMap((i: any) => i.content || [])
    .filter((p: any) => p.type === "output_text")
    .map((p: any) => p.text)
    .join("")
    .trim();
}

async function extractDocx(buf: Buffer): Promise<string> {
  const mammoth: any = await import("mammoth");
  // Prefer markdown (keeps headings/lists); fall back to raw text.
  try {
    const r = await mammoth.convertToMarkdown({ buffer: buf });
    if (r?.value?.trim()) return r.value;
  } catch { /* fall through */ }
  const r = await mammoth.extractRawText({ buffer: buf });
  return r.value;
}

async function extractXlsx(buf: Buffer): Promise<string> {
  const ExcelJS: any = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const MAX_ROWS = 500, MAX_COLS = 30;
  const out: string[] = [];
  wb.eachSheet((sheet: any) => {
    out.push(`## Sheet: ${sheet.name}`);
    let rowCount = 0;
    sheet.eachRow({ includeEmpty: false }, (row: any) => {
      if (rowCount++ >= MAX_ROWS) return;
      const cells: string[] = [];
      for (let c = 1; c <= Math.min(sheet.columnCount || MAX_COLS, MAX_COLS); c++) {
        const v = row.getCell(c).value as any;
        cells.push(cellToText(v));
      }
      out.push(cells.join(" | "));
    });
    if ((sheet.rowCount || 0) > MAX_ROWS) out.push(`(…truncated at ${MAX_ROWS} rows)`);
  });
  return out.join("\n");
}

function cellToText(v: any): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("text" in v) return String(v.text);                 // hyperlink / richtext
    if ("result" in v) return String(v.result);             // formula result
    if ("richText" in v) return v.richText.map((t: any) => t.text).join("");
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

async function extractImage(buf: Buffer, ext: string, mime: string): Promise<ExtractResult> {
  if (buf.length > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "That image is too large to read.", fix: "Re-export it under 18MB (a phone photo is usually fine)." };
  }
  const mediaType = imageMediaType(ext) || (mime.startsWith("image/") ? mime : null);
  if (!mediaType) {
    return { ok: false, reason: `Can't read .${ext} images.`, fix: "Convert to PNG or JPG and re-upload." };
  }
  const dataUrl = `data:${mediaType};base64,${buf.toString("base64")}`;
  const resp = await openai.chat.completions.create({
    model: VISION_MODEL,
    max_completion_tokens: 4096, // headroom: gpt-5.2 spends some budget on reasoning
    messages: [{
      role: "user",
      content: [
        { type: "text", text: IMAGE_PROMPT },
        { type: "image_url", image_url: { url: dataUrl } } as any,
      ] as any,
    }],
  });
  const text = resp.choices[0]?.message?.content?.toString().trim() || "";
  return { ok: true, kind: "image", text: text || "[Image uploaded — no readable content detected.]" };
}

async function extractAudio(buf: Buffer, filename: string, ext: string): Promise<ExtractResult> {
  if (buf.length > MAX_AUDIO_BYTES) {
    return { ok: false, reason: "That recording is too long to transcribe.", fix: "Send a clip under ~20MB, or split it into parts." };
  }
  // Pass the real filename so the transcription endpoint detects the format.
  const file = await toFile(buf, `audio.${ext || "mp3"}`);
  const resp = await openai.audio.transcriptions.create({ file, model: TRANSCRIBE_MODEL });
  const text = (resp as any).text?.trim() || "";
  return { ok: true, kind: "audio", text: text ? `[Transcription of ${filename}]\n${text}` : "[Audio uploaded — no speech detected.]" };
}

/**
 * Convenience wrapper for the disk path: read the saved file and extract.
 * Used by saveAndParseUpload. Returns a plain string (extracted text, or a
 * human-readable fallback for unsupported / failed files) so existing callers
 * that feed the agent a string keep working.
 */
export async function extractFromPath(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return extractToString(buf, path.basename(filePath));
}

export async function extractToString(buf: Buffer, filename: string, mimeType?: string): Promise<string> {
  try {
    const r = await extractUpload(buf, { filename, mimeType });
    if (r.ok) return r.text;
    return `[Couldn't read ${filename}: ${r.reason}${r.fix ? ` ${r.fix}` : ""}]`;
  } catch (e: any) {
    console.error(`[fileExtract] ${filename} failed:`, e?.message || e);
    return `[Couldn't read ${filename} — it may be corrupt or in an unexpected format. Tell me what's in it and we'll keep going.]`;
  }
}
