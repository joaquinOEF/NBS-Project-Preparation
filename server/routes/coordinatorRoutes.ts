// Coordinator auth routes — login / logout / me. Phase 3c-i: the auth flow is
// fully functional but not yet REQUIRED by the orchestrator/cohort routes
// (that gate flips on in 3c-ii after an account is provisioned).

import type { Express, Request, Response } from 'express';
import { login, logout, getCoordinatorBySession, publicCoordinator, COORD_COOKIE } from '../services/coordinatorAuth';

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
}
