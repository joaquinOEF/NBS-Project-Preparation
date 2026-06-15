// Coordinator auth — admin-provisioned email+password + opaque session cookie.
// scrypt for hashing (Node built-in, no native dep). See Phase 3c in
// docs/cbo-platform-architecture.md.

import crypto from 'crypto';
import { promisify } from 'util';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { eq, and, gt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db';
import { coordinators, coordinatorSessions, type Coordinator } from '@shared/coordinator-schema';

const scryptAsync = promisify(crypto.scrypt) as (pw: string, salt: string, keylen: number) => Promise<Buffer>;
const KEYLEN = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const COORD_COOKIE = 'coord_session';

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, KEYLEN)).toString('hex');
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, 'hex');
  const testBuf = await scryptAsync(password, salt, KEYLEN);
  return hashBuf.length === testBuf.length && crypto.timingSafeEqual(hashBuf, testBuf);
}

export async function createCoordinator(input: {
  email: string; password: string; name?: string; cohortId?: string | null;
}): Promise<Coordinator> {
  const passwordHash = await hashPassword(input.password);
  const [c] = await db.insert(coordinators).values({
    email: input.email.trim().toLowerCase(),
    passwordHash,
    name: input.name ?? null,
    cohortId: input.cohortId ?? null,
  }).returning();
  return c;
}

/** Verify credentials and mint a session. Returns null on bad email/password. */
export async function login(email: string, password: string): Promise<{ token: string; coordinator: Coordinator } | null> {
  const [c] = await db.select().from(coordinators).where(eq(coordinators.email, email.trim().toLowerCase())).limit(1);
  if (!c) return null;
  if (!(await verifyPassword(password, c.passwordHash))) return null;
  const token = nanoid(40);
  await db.insert(coordinatorSessions).values({ token, coordinatorId: c.id, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
  return { token, coordinator: c };
}

export async function getCoordinatorBySession(token: string | undefined): Promise<Coordinator | null> {
  if (!token) return null;
  const [s] = await db.select().from(coordinatorSessions)
    .where(and(eq(coordinatorSessions.token, token), gt(coordinatorSessions.expiresAt, new Date())))
    .limit(1);
  if (!s) return null;
  const [c] = await db.select().from(coordinators).where(eq(coordinators.id, s.coordinatorId)).limit(1);
  return c ?? null;
}

export async function logout(token: string | undefined): Promise<void> {
  if (token) await db.delete(coordinatorSessions).where(eq(coordinatorSessions.token, token));
}

/** Public coordinator shape (never expose the password hash). */
export function publicCoordinator(c: Coordinator) {
  return { id: c.id, email: c.email, name: c.name, cohortId: c.cohortId };
}

// Auth middleware — NOT applied to any route yet (Phase 3c-i ships the machinery;
// Phase 3c-ii flips this on over the orchestrator/cohort routes once a
// coordinator account is provisioned, so the live dashboard isn't locked out).
export interface CoordinatorRequest extends Request {
  coordinator?: Coordinator;
}
export function requireCoordinator(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = (req as any).cookies?.[COORD_COOKIE];
    const coordinator = await getCoordinatorBySession(token);
    if (!coordinator) { res.status(401).json({ error: 'coordinator auth required' }); return; }
    (req as CoordinatorRequest).coordinator = coordinator;
    next();
  };
}
