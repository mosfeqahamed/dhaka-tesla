import type { RequestHandler } from 'express';
import type { UserRole } from '../db/schema/index.js';
import { HttpError } from '../lib/http-error.js';
import { SESSION_COOKIE, verifySession, type AuthClaims } from '../lib/token.js';

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  const claims = typeof token === 'string' ? await verifySession(token) : null;
  if (!claims) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  req.auth = claims;
  next();
};

// Use after requireAuth. Passengers can't call driver endpoints and vice versa.
export const requireRole =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      throw new HttpError(403, 'FORBIDDEN', 'Your account type cannot do this');
    }
    next();
  };

// Narrows req.auth for handlers mounted behind requireAuth.
export function authOf(req: { auth?: AuthClaims }): AuthClaims {
  if (!req.auth) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');
  return req.auth;
}
