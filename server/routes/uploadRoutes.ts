import type { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { saveAndParseUpload } from "../services/fileParser";
import { transcribeAudio } from "../services/fileExtract";
import { getCboState, setCboState, debouncedPersist } from "../services/cboAgent";
import { createDocument, getOrgIdForCboState, updateDocumentStorageKey, getDocumentById } from "../services/documentPersistence";
import { putObject, getObject, blobKey } from "../services/blobStorage";
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

// Voice-note recorder uploads — audio only, smaller ceiling. A spoken answer
// is short; cap well under the transcription endpoint's ~25MB limit.
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const audioExts = ['.webm', '.mp4', '.m4a', '.ogg', '.oga', '.opus', '.mp3', '.wav', '.aac', '.flac'];
    if ((file.mimetype || '').startsWith('audio/') || (file.mimetype || '').startsWith('video/webm') || audioExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Audio type ${file.mimetype || ext} not supported`));
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
          const doc = await createDocument({
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
          // Phase 2b: persist the ORIGINAL file durably (object storage) so it
          // survives container recycle and can be re-opened/re-processed.
          // Best-effort — a blob failure leaves the full text intact.
          const key = await putObject(blobKey(orgId, doc.id, file.originalname), file.buffer);
          if (key) await updateDocumentStorageKey(doc.id, key);
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

  // Voice-note transcription for the chat composer. Unlike /api/upload/cbo/:id
  // (which stores a durable evidence document), this is a throwaway: the user
  // taps the mic, speaks an answer, and gets the transcript back to REVIEW and
  // edit in the input box before sending. Nothing is persisted — no doc row, no
  // blob, no manifest entry. The mic feeds the same composer the keyboard does,
  // so the agent never sees audio, only the (user-confirmed) text.
  // Reuses the existing Replit AI transcription path — no new API keys.
  app.post("/api/cbo/:id/transcribe", audioUpload.single('audio'), async (req: Request, res: Response) => {
    try {
      const file = (req as any).file;
      if (!file) { res.status(400).json({ error: "No audio uploaded" }); return; }
      // MediaRecorder names the blob by mime (webm/mp4/ogg); fall back to webm.
      const ext = (path.extname(file.originalname).replace('.', '').toLowerCase())
        || ((file.mimetype || '').split('/')[1] || 'webm').split(';')[0];
      const lang = typeof req.body?.lang === 'string' ? req.body.lang.slice(0, 5) : undefined;
      const r = await transcribeAudio(file.buffer, ext, lang);
      if (!r.ok) { res.status(422).json({ error: r.reason, fix: r.fix }); return; }
      res.json({ text: r.text });
    } catch (error: any) {
      console.error('[transcribe] Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Download the durable ORIGINAL of a document (Phase 2b). The id is an
  // unguessable UUID; org-capability scoping will tighten this in Phase 3
  // enforcement. Streams the blob with its original filename + mime type.
  app.get("/api/documents/:id/original", async (req: Request, res: Response) => {
    try {
      const doc = await getDocumentById(req.params.id);
      if (!doc || !doc.storageKey) { res.status(404).json({ error: "original not available" }); return; }
      const buf = await getObject(doc.storageKey);
      if (!buf) { res.status(404).json({ error: "original not available" }); return; }
      res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.filename)}"`);
      res.send(buf);
    } catch (error: any) {
      console.error('[upload] original download error:', error.message);
      res.status(500).json({ error: error.message });
    }
  });
}
