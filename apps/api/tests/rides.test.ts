import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeDb, db } from '../src/db/client.js';
import { rideRequests, zones } from '../src/db/schema/index.js';
import { seed } from '../src/db/seed.js';
import { signIn } from './helpers/auth.js';
import { resetDb, resetRides } from './helpers/db.js';

const app = createApp();
const zone: Record<string, number> = {};
const cookie: Record<'nusrat' | 'rafiq' | 'shirin' | 'jashim', string> = {
  nusrat: '',
  rafiq: '',
  shirin: '',
  jashim: '',
};

beforeAll(async () => {
  await resetDb();
  await seed();
  for (const z of await db.select().from(zones)) zone[z.name] = z.id;
  for (const who of Object.keys(cookie) as (keyof typeof cookie)[]) {
    cookie[who] = await signIn(app, who);
  }
});
// Each test starts with nobody holding a ride.
beforeEach(resetRides);
afterAll(closeDb);

const nusratTrip = () => ({
  pickupZoneId: zone['Banani'],
  dropoffZoneId: zone['Mohakhali'],
  seats: 1,
});

const requestRide = (
  who: keyof typeof cookie,
  body: object = nusratTrip(),
  key: string | null = randomUUID(),
) => {
  const req = request(app).post('/rides').set('Cookie', cookie[who]);
  if (key) req.set('Idempotency-Key', key);
  return req.send(body);
};

const setStatus = (id: string, status: typeof rideRequests.$inferSelect.status) =>
  db.update(rideRequests).set({ status }).where(eq(rideRequests.id, id));

describe('GET /zones and POST /fares/estimate', () => {
  it('lists the nine Dhaka zones', async () => {
    const res = await request(app).get('/zones');
    expect(res.status).toBe(200);
    expect(res.body.zones).toHaveLength(9);
    expect(res.body.zones.map((z: { name: string }) => z.name)).toContain('Gulshan 1');
  });

  it("quotes Nusrat's trip: ৳70 solo, ৳62 if pooled", async () => {
    const res = await request(app).post('/fares/estimate').send(nusratTrip());
    expect(res.status).toBe(200);
    expect(res.body.estimate.solo.totalFarePaisa).toBe(7000);
    expect(res.body.estimate.pooled.totalFarePaisa).toBe(6200);
  });

  it('rejects a trip that starts and ends in the same zone', async () => {
    const res = await request(app)
      .post('/fares/estimate')
      .send({ ...nusratTrip(), dropoffZoneId: zone['Banani'] });
    expect(res.status).toBe(400);
    expect(res.body.error.details.dropoffZoneId).toBeDefined();
  });

  it('rejects an unknown zone', async () => {
    const res = await request(app)
      .post('/fares/estimate')
      .send({ ...nusratTrip(), dropoffZoneId: 999 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNKNOWN_ZONE');
  });
});

describe('POST /rides', () => {
  it('books Nusrat a ride that waits for a Tesla, with a solo estimate', async () => {
    const res = await requestRide('nusrat');
    expect(res.status).toBe(201);
    expect(res.body.ride).toMatchObject({
      status: 'REQUESTED',
      seats: 1,
      paymentMethod: 'CASH',
      estimatedFarePaisa: 7000,
      pickupZone: { name: 'Banani' },
      dropoffZone: { name: 'Mohakhali' },
    });
  });

  it('requires an Idempotency-Key', async () => {
    const res = await requestRide('nusrat', nusratTrip(), null);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('returns the original ride when a request is retried with the same key', async () => {
    const key = randomUUID();
    const first = await requestRide('nusrat', nusratTrip(), key);
    const retry = await requestRide('nusrat', nusratTrip(), key);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ replayed: true, ride: { id: first.body.ride.id } });
  });

  it('books exactly one ride when two retries race each other', async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      requestRide('rafiq', { ...nusratTrip(), dropoffZoneId: zone['Gulshan 1'] }, key),
      requestRide('rafiq', { ...nusratTrip(), dropoffZoneId: zone['Gulshan 1'] }, key),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.ride.id).toBe(b.body.ride.id);
  });

  it('rejects reusing a key for a different trip', async () => {
    const key = randomUUID();
    await requestRide('nusrat', nusratTrip(), key);
    const res = await requestRide('nusrat', { ...nusratTrip(), seats: 2 }, key);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('allows only one ride in flight per passenger', async () => {
    await requestRide('nusrat');
    const res = await requestRide('nusrat');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_RIDE_EXISTS');
  });

  it('rejects more seats than any Tesla has', async () => {
    const res = await requestRide('shirin', { ...nusratTrip(), seats: 4 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SEATS_EXCEED_CAPACITY');
  });

  it('only passengers can request rides', async () => {
    expect((await requestRide('jashim')).status).toBe(403);
    expect((await request(app).post('/rides').send(nusratTrip())).status).toBe(401);
  });
});

describe('reading rides', () => {
  it("Rafiq cannot see Nusrat's ride", async () => {
    const { body } = await requestRide('nusrat');
    const res = await request(app).get(`/rides/${body.ride.id}`).set('Cookie', cookie.rafiq);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RIDE_NOT_FOUND');
  });

  it('shows the owner a timeline of what happened', async () => {
    const { body } = await requestRide('nusrat');
    const res = await request(app).get(`/rides/${body.ride.id}`).set('Cookie', cookie.nusrat);
    expect(res.status).toBe(200);
    expect(res.body.ride.timeline).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: 'REQUESTED', by: 'YOU' }),
    ]);
  });

  it('treats a malformed ride id as not found', async () => {
    const res = await request(app).get('/rides/not-a-uuid').set('Cookie', cookie.nusrat);
    expect(res.status).toBe(404);
  });

  it('returns the current ride, or null when there is none', async () => {
    const none = await request(app).get('/rides/current').set('Cookie', cookie.shirin);
    expect(none.body.ride).toBeNull();

    const { body } = await requestRide('shirin');
    const current = await request(app).get('/rides/current').set('Cookie', cookie.shirin);
    expect(current.body.ride.id).toBe(body.ride.id);
  });

  it('pages through history newest first, showing only your own rides', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { body } = await requestRide('nusrat');
      ids.push(body.ride.id);
      await setStatus(body.ride.id, 'COMPLETED');
    }
    await requestRide('rafiq');

    const page1 = await request(app).get('/rides?limit=2').set('Cookie', cookie.nusrat);
    expect(page1.body.rides.map((r: { id: string }) => r.id)).toEqual([ids[2], ids[1]]);
    expect(page1.body.nextCursor).toBe(ids[1]);

    const page2 = await request(app)
      .get(`/rides?limit=2&before=${page1.body.nextCursor}`)
      .set('Cookie', cookie.nusrat);
    expect(page2.body.rides.map((r: { id: string }) => r.id)).toEqual([ids[0]]);
    expect(page2.body.nextCursor).toBeNull();
  });
});

describe('POST /rides/:id/cancel', () => {
  const cancel = (who: keyof typeof cookie, id: string, reason?: string) =>
    request(app)
      .post(`/rides/${id}/cancel`)
      .set('Cookie', cookie[who])
      .send(reason ? { reason } : {});

  it('lets Nusrat cancel a waiting ride and records why', async () => {
    const { body } = await requestRide('nusrat');
    const res = await cancel('nusrat', body.ride.id, 'Found a CNG instead');
    expect(res.status).toBe(200);
    expect(res.body.ride.status).toBe('CANCELLED');

    const detail = await request(app).get(`/rides/${body.ride.id}`).set('Cookie', cookie.nusrat);
    expect(detail.body.ride.timeline.at(-1)).toMatchObject({
      fromStatus: 'REQUESTED',
      toStatus: 'CANCELLED',
      reason: 'Found a CNG instead',
      by: 'YOU',
    });
  });

  it('frees the passenger to book again after cancelling', async () => {
    const { body } = await requestRide('nusrat');
    await cancel('nusrat', body.ride.id);
    expect((await requestRide('nusrat')).status).toBe(201);
  });

  it("does not let Rafiq cancel Nusrat's ride", async () => {
    const { body } = await requestRide('nusrat');
    const res = await cancel('rafiq', body.ride.id);
    expect(res.status).toBe(404);
    const [row] = await db.select().from(rideRequests).where(eq(rideRequests.id, body.ride.id));
    expect(row!.status).toBe('REQUESTED');
  });

  it('rejects cancelling twice', async () => {
    const { body } = await requestRide('nusrat');
    await cancel('nusrat', body.ride.id);
    const res = await cancel('nusrat', body.ride.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it.each(['STARTED', 'COMPLETED'] as const)('rejects cancelling a %s ride', async (status) => {
    const { body } = await requestRide('nusrat');
    await setStatus(body.ride.id, status);
    const res = await cancel('nusrat', body.ride.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });
});
