// Coordinator auth routes — login / logout / me. Phase 3c-i: the auth flow is
// fully functional but not yet REQUIRED by the orchestrator/cohort routes
// (that gate flips on in 3c-ii after an account is provisioned).

import type { Express, Request, Response } from 'express';
import { login, logout, getCoordinatorBySession, getCoordinatorByEmail, createCoordinator, publicCoordinator, COORD_COOKIE } from '../services/coordinatorAuth';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function registerCoordinatorRoutes(app: Express): void {
  app.post('/api/coordinator/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {};
      if (!email || !password) { res.status(400).json({ error: 'email and password required' }); return; }
      const result = await login(String(email), String(password));
      if (!result) { res.status(401).json({ error: 'invalid email or password' }); return; }
      res.cookie(COORD_COOKIE, result.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: THIRTY_DAYS_MS,
        path: '/',
      });
      res.json({ coordinator: publicCoordinator(result.coordinator) });
    } catch (e: any) {
      console.error('[coordinator] login error', e);
      res.status(500).json({ error: 'internal error' });
    }
  });

  app.post('/api/coordinator/logout', async (req: Request, res: Response) => {
    try {
      await logout((req as any).cookies?.[COORD_COOKIE]);
      res.clearCookie(COORD_COOKIE, { path: '/' });
      res.json({ ok: true });
    } catch (e: any) {
      console.error('[coordinator] logout error', e);
      res.status(500).json({ error: 'internal error' });
    }
  });

  app.get('/api/coordinator/me', async (req: Request, res: Response) => {
    try {
      const coordinator = await getCoordinatorBySession((req as any).cookies?.[COORD_COOKIE]);
      if (!coordinator) { res.status(401).json({ error: 'not authenticated' }); return; }
      res.json({ coordinator: publicCoordinator(coordinator) });
    } catch (e: any) {
      console.error('[coordinator] me error', e);
      res.status(500).json({ error: 'internal error' });
    }
  });

  // Bootstrap a coordinator over HTTP — the simple, env-agnostic way to provision
  // accounts in BOTH dev and prod: same call, hit the dev URL → dev DB, hit the
  // prod URL → prod DB (each deployment talks to its own database). DISABLED
  // unless BOOTSTRAP_COORDINATOR_SECRET is set, and every call must carry it in
  // the x-bootstrap-secret header. Idempotent: if the email already exists it's
  // returned unchanged (never silently resets a password). Set the secret, create
  // your coordinators, then optionally unset it to close the endpoint entirely.
  app.post('/api/coordinator/bootstrap', async (req: Request, res: Response) => {
    try {
      const secret = process.env.BOOTSTRAP_COORDINATOR_SECRET;
      if (!secret) { res.status(404).json({ error: 'not found' }); return; } // disabled when unset
      if (req.header('x-bootstrap-secret') !== secret) { res.status(401).json({ error: 'bad bootstrap secret' }); return; }

      const { email, password, name, cohortId } = req.body ?? {};
      if (!email || !password) { res.status(400).json({ error: 'email and password required' }); return; }

      const existing = await getCoordinatorByEmail(String(email));
      if (existing) { res.json({ created: false, coordinator: publicCoordinator(existing) }); return; }

      const c = await createCoordinator({
        email: String(email),
        password: String(password),
        name: name ? String(name) : undefined,
        cohortId: typeof cohortId === 'string' ? cohortId : null, // null = admin
      });
      res.status(201).json({ created: true, coordinator: publicCoordinator(c) });
    } catch (e: any) {
      console.error('[coordinator] bootstrap error', e);
      res.status(500).json({ error: 'internal error' });
    }
  });
}
