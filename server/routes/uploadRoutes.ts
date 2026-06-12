import type { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { saveAndParseUpload } from "../services/fileParser";
import { getCboState, setCboState, debouncedPersist } from "../services/cboAgent";
import { createDocument, getOrgIdForCboState } from "../services/documentPersistence";
import type { DocumentKind } from "@shared/document-schema";

// Map an upload to the document kind (mirrors fileExtract's routing).
function kindFromUpload(filename: string, mime?: string): DocumentKind {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const m = (mime || '').toLowerCase();
  if (m.startsWith('audio/') || ['mp3','wav','m4a','webm','ogg','oga','opus','aac','flac'].includes(ext)) return 'audio';
  if (m.startsWith('image/') || ['png','jpg','jpeg','gif','webp'].includes(ext)) return 'image';
  if (ext === 'pdf' || m === 'application/pdf') return 'pdf';
  if (ext === 'docx' || m.includes('wordprocessingml')) return 'docx';
  if (ext === 'xlsx' || m.includes('spreadsheetml')) return 'xlsx';
  if (['txt','md','csv','tsv','json','xml','yaml','yml'].includes(ext) || m.startsWith('text/')) return 'text';
  return 'other';
}

const RUNS_DIR = path.join(process.cwd(), 'knowledge', 'runs');

// Multer config — store in memory, then save to run folder. The allow-list
// mirrors what fileExtract.ts can actually turn into grounding text:
// documents, spreadsheets, images (vision), and audio (transcription).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — audio recordings run larger than docs
  fileFilter: (_req, file, cb) => {
    const allowed = [
      '.pdf', '.docx', '.xlsx', '.txt', '.md', '.csv', '.tsv', '.json',      // docs
      '.png', '.jpg', '.jpeg', '.gif', '.webp',                              // images
      '.mp3', '.wav', '.m4a', '.webm', '.ogg', '.oga', '.opus', '.aac', '.flac', // audio
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || (file.mimetype || '').startsWith('audio/') || (file.mimetype || '').startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not supported`));
    }
  },
});

export function registerUploadRoutes(app: Express): void {
  // Upload a file for a concept note or CBO session
  // POST /api/upload/:type/:sessionId
  // type = "concept-note" or "cbo"
  app.post("/api/upload/:type/:sessionId", upload.single('file'), async (req: Request, res: Response) => {
    try {
      const { type, sessionId } = req.params;
      const file = (req as any).file;

      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const runPrefix = type === 'cbo' ? `cbo-${sessionId}` : sessionId;
      const runDir = path.join(RUNS_DIR, runPrefix);

      const { savedPath, content } = await saveAndParseUpload(
        file.buffer,
        file.originalname,
        runDir,
        file.mimetype,
      );

      // Record the upload two ways:
      //  - cbo_states.uploadedFiles: lightweight manifest for the live session
      //    UI (kept for backward-compat; will be deprecated once the doc store
      //    fully replaces it).
      //  - documents table: the durable, org-scoped evidence locker holding the
      //    FULL extracted text, referenceable across every future session.
      if (type === 'cbo') {
        const state = getCboState(sessionId);
        if (state) {
          state.uploadedFiles.push({
            name: file.originalname,
            path: savedPath,
            parsedAt: new Date().toISOString(),
            summary: content.slice(0, 280),
          });
          setCboState(sessionId, state);
          debouncedPersist(sessionId);
        }
        // Best-effort: a doc-store failure must not fail the upload.
        try {
          const orgId = await getOrgIdForCboState(sessionId);
          await createDocument({
            orgId,
            cboStateId: sessionId,
            filename: file.originalname,
            mimeType: file.mimetype,
            kind: kindFromUpload(file.originalname, file.mimetype),
            sizeBytes: file.size,
            fullText: content,
            summary: content.slice(0, 280),
            droppedInPhase: state?.phase ?? null,
            source: 'upload',
          });
        } catch (e: any) {
          console.error('[upload] doc-store write failed (continuing):', e?.message || e);
        }
      }

      res.json({
        filename: file.originalname,
        size: file.size,
        savedPath,
        contentLength: content.length,
        // Return first 10K chars of parsed content
        content: content.slice(0, 10000),
        truncated: content.length > 10000,
      });
    } catch (error: any) {
      console.error('[upload] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });
}
