import type { Express } from 'express';
import request from 'supertest';
import { SESSION_COOKIE } from '../../src/lib/token.js';

export const TEST_PASSWORD = 'test-password'; // SEED_PASSWORD in vitest.config.ts

// Signs a seeded user in and returns the Cookie header value to send.
export function signIn(app: Express, name: 'nusrat' | 'rafiq' | 'shirin' | 'jashim') {
  return signInEmail(app, `${name}@teslapool.test`);
}

export async function signInEmail(app: Express, email: string, password = TEST_PASSWORD) {
  const res = await request(app).post('/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  const cookie = ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return cookie!.split(';')[0]!;
}
