import type { CookieOptions } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '../config/env.js';
import type { UserRole } from '../db/schema/index.js';

export const SESSION_COOKIE = 'dtp_session';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'dhaka-tesla-pool';

export interface AuthClaims {
  userId: string;
  role: UserRole;
}

export async function signSession({ userId, role }: AuthClaims) {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_TTL_HOURS}h`)
    .sign(secret);
}

// Returns null for anything invalid: bad signature, expired, wrong alg/issuer.
export async function verifySession(token: string): Promise<AuthClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: ISSUER,
    });
    if (typeof payload.sub !== 'string') return null;
    if (payload.role !== 'PASSENGER' && payload.role !== 'DRIVER') return null;
    return { userId: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

// httpOnly: page scripts can't read the token (limits XSS damage).
// SameSite=Lax: the browser won't attach it to cross-site POSTs (CSRF).
export const sessionCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.NODE_ENV === 'production',
  path: '/',
  maxAge: env.JWT_TTL_HOURS * 60 * 60 * 1000,
});
