import { execSync } from 'node:child_process';
import express, { type Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { registerRoutes } from './routes';
import { setupVite, serveStatic, log } from './vite';
import { autoSeedKnowledgeBase } from './services/knowledgeService';

/** The commit this process is running, best-effort. Absent in a build with no
 *  .git (a Replit Deployment), where the env stamp is the next best thing. */
function buildStamp(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    if (sha) return sha;
  } catch { /* no git here — fall through */ }
  return process.env.REPL_DEPLOYMENT_ID || process.env.REPLIT_DEPLOYMENT || 'unknown (no git)';
}


const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false, limit: '5mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (path.startsWith('/api')) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + '…';
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get('env') === 'development') {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(
    {
      port,
      host: '0.0.0.0',
      reusePort: true,
    },
    async () => {
      log(`serving on port ${port}`);
      // WHICH BUILD IS THIS? A deployment running older code looks exactly like
      // a broken fix: three separate rounds of "still not working" turned out
      // to be a server that had not picked up the merge. One line at boot ends
      // that question — compare it against `git log --oneline -1` on main.
      log(`build ${buildStamp()}`);

      // Probe for CBO tables — logs a loud message if `npm run db:push`
      // hasn't been run yet so the dev catches it on boot, not on first chat.
      try {
        const { checkCboTablesExist } = await import('./services/cboPersistence');
        await checkCboTablesExist();
      } catch (error) {
        console.error('[cbo] table check failed', error);
      }

      // Auto-seed knowledge base on startup (seeds only missing documents)
      try {
        await autoSeedKnowledgeBase();
      } catch (error) {
        console.error('Failed to auto-seed knowledge base:', error);
      }

      // ⚠️ Repair the bairro risk percentiles frozen before the 2026-08-03 fix.
      // Runs on every boot rather than waiting for someone to remember a script
      // against the right database — the failure being repaired is a number
      // nobody noticed for a month, and it decides which solutions an
      // organisation is offered. Only writes records that actually disagree
      // with the published rank, so a healthy database is untouched and the
      // second boot says so in one line. Never blocks and never throws.
      // SKIP_RISK_BACKFILL=1 turns it off.
      void import('./services/bairroRiskBackfill')
        .then(m => m.runBairroRiskBackfillAtBoot())
        .catch(err => console.error('[bairro-risk] boot hook failed:', err?.message || err));
    }
  );
})();
