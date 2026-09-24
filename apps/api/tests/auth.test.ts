import cookieParser from 'cookie-parser';
import express from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeDb } from '../src/db/client.js';
import { seed } from '../src/db/seed.js';
import { SESSION_COOKIE } from '../src/lib/token.js';
import { requireAuth, requireRole } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { resetDb } from './helpers/db.js';

const PASSWORD = 'test-password'; // SEED_PASSWORD in vitest.config.ts
const app = createApp();

beforeAll(async () => {
  await resetDb();
  await seed();
});
afterAll(closeDb);

const sessionCookie = (res: request.Response) =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));

async function signIn(email: string) {
  const res = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return sessionCookie(res)!.split(';')[0]!;
}

describe('POST /auth/register', () => {
  const karim = {
    name: 'Karim',
    email: 'Karim@TeslaPool.test ',
    phone: '01712-345678',
    password: 'traffic-jam-42',
  };

  it('creates a passenger, signs them in, and never returns the password hash', async () => {
    const res = await request(app).post('/auth/register').send(karim);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      name: 'Karim',
      email: 'karim@teslapool.test',
      phone: '+8801712345678',
      role: 'PASSENGER',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/hash|\$2[aby]\$/i);

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('rejects a duplicate email with 409', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...karim, phone: '01812345678' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects a duplicate phone with 409', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...karim, email: 'karim2@teslapool.test', phone: '+880 1712 345678' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
  });

  it('will not let anyone sign up as a driver', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        ...karim,
        email: 'fake-driver@teslapool.test',
        phone: '01912345678',
        role: 'DRIVER',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('explains which fields are invalid', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'N', email: 'not-an-email', phone: '12345', password: 'short' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.details).sort()).toEqual([
      'email',
      'name',
      'password',
      'phone',
    ]);
  });
});

describe('POST /auth/login', () => {
  it('signs Nusrat in with the seeded password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nusrat@teslapool.test', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Nusrat', role: 'PASSENGER' });
    expect(sessionCookie(res)).toBeDefined();
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/auth/login')
      .send({ email: 'nusrat@teslapool.test', password: 'wrong-password' });
    const unknownEmail = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@teslapool.test', password: 'wrong-password' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(sessionCookie(wrongPassword)).toBeUndefined();
  });
});

describe('GET /me', () => {
  it("returns Nusrat's profile without a vehicle", async () => {
    const res = await request(app)
      .get('/me')
      .set('Cookie', await signIn('nusrat@teslapool.test'));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Nusrat', role: 'PASSENGER', vehicle: null });
  });

  it("returns Jashim's profile with Bullet", async () => {
    const res = await request(app)
      .get('/me')
      .set('Cookie', await signIn('jashim@teslapool.test'));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: 'Jashim',
      role: 'DRIVER',
      vehicle: { name: 'Bullet', capacity: 3, driverStatus: 'OFFLINE', currentZoneName: 'Banani' },
    });
  });

  it('rejects a request with no session', async () => {
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a tampered token', async () => {
    const cookie = await signIn('rafiq@teslapool.test');
    const tampered = cookie.slice(0, -4) + (cookie.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    const res = await request(app).get('/me').set('Cookie', tampered);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expired = await new SignJWT({ role: 'PASSENGER' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('00000000-0000-0000-0000-000000000000')
      .setIssuer('dhaka-tesla-pool')
      .setAudience('dhaka-tesla-pool')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    const res = await request(app).get('/me').set('Cookie', `${SESSION_COOKIE}=${expired}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = await new SignJWT({ role: 'DRIVER' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('00000000-0000-0000-0000-000000000000')
      .setIssuer('dhaka-tesla-pool')
      .setAudience('dhaka-tesla-pool')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('an-attacker-guessed-secret-of-32-chars!!'));
    const res = await request(app).get('/me').set('Cookie', `${SESSION_COOKIE}=${forged}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('clears the session cookie', async () => {
    const res = await request(app).post('/auth/logout');
    expect(res.status).toBe(204);
    expect(sessionCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});

describe('requireRole', () => {
  // A throwaway route: real driver/passenger routes arrive in later branches.
  const guarded = express()
    .use(cookieParser())
    .get('/driver-only', requireAuth, requireRole('DRIVER'), (_req, res) => {
      res.json({ ok: true });
    })
    .use(errorHandler);

  it('lets Jashim through', async () => {
    const res = await request(guarded)
      .get('/driver-only')
      .set('Cookie', await signIn('jashim@teslapool.test'));
    expect(res.status).toBe(200);
  });

  it('stops Shirin with 403', async () => {
    const res = await request(guarded)
      .get('/driver-only')
      .set('Cookie', await signIn('shirin@teslapool.test'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('rate limiting', () => {
  it('blocks repeated failed sign-ins with 429', async () => {
    const fresh = createApp(); // own limiter store, unaffected by other tests
    const attempt = () =>
      request(fresh)
        .post('/auth/login')
        .send({ email: 'rafiq@teslapool.test', password: 'guess-1234' });

    for (let i = 0; i < 20; i++) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});
