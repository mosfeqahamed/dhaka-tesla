import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';
import { HttpError } from '../../lib/http-error.js';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '../../lib/token.js';
import { authOf, requireAuth } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from './auth.schemas.js';
import * as auth from './auth.service.js';

// Built per app instance so each gets its own in-memory limiter store.
export function authRouter() {
  const router = Router();

  // Only failed attempts count, so Nusrat signing in normally is never blocked
  // but password guessing is. In-memory store: fine for one instance.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.AUTH_RATE_LIMIT,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new HttpError(429, 'RATE_LIMITED', 'Too many attempts, try again in a few minutes')),
  });

  router.post('/register', limiter, validateBody(registerSchema), async (req, res) => {
    const user = await auth.registerPassenger(req.body as RegisterInput);
    res.cookie(
      SESSION_COOKIE,
      await signSession({ userId: user.id, role: user.role }),
      sessionCookieOptions(),
    );
    res.status(201).json({ user });
  });

  router.post('/login', limiter, validateBody(loginSchema), async (req, res) => {
    const user = await auth.login(req.body as LoginInput);
    res.cookie(
      SESSION_COOKIE,
      await signSession({ userId: user.id, role: user.role }),
      sessionCookieOptions(),
    );
    res.json({ user });
  });

  router.post('/logout', (_req, res) => {
    const { maxAge: _maxAge, ...opts } = sessionCookieOptions();
    res.clearCookie(SESSION_COOKIE, opts);
    res.status(204).end();
  });

  return router;
}

export function meRouter() {
  const router = Router();
  router.get('/', requireAuth, async (req, res) => {
    res.json({ user: await auth.getProfile(authOf(req).userId) });
  });
  return router;
}
