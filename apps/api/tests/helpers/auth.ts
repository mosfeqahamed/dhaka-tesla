import type { Express } from 'express';
import request from 'supertest';
import { SESSION_COOKIE } from '../../src/lib/token.js';

export const TEST_PASSWORD = 'test-password'; // SEED_PASSWORD in vitest.config.ts

// Signs a seeded user in and returns the Cookie header value to send.
export async function signIn(app: Express, name: 'nusrat' | 'rafiq' | 'shirin' | 'jashim') {
  const res = await request(app)
    .post('/auth/login')
    .send({ email: `${name}@teslapool.test`, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`sign-in failed for ${name}: ${res.status}`);
  const cookie = ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return cookie!.split(';')[0]!;
}
