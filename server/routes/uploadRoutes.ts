import type { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { saveAndParseUpload } from "../services/fileParser";

const RUNS_DIR = path.join(process.cwd(), 'knowledge', 'runs');

// Multer config — store in memory, then save to run folder
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.xlsx', '.txt', '.md', '.csv', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
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
      );

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
