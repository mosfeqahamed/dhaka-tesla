import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeDb, db } from '../src/db/client.js';
import { payments, pools, statusEvents, users, vehicles, zones } from '../src/db/schema/index.js';
import { seed } from '../src/db/seed.js';
import { hashPassword } from '../src/lib/password.js';
import { signIn, signInEmail, TEST_PASSWORD } from './helpers/auth.js';
import { resetDb, resetRides } from './helpers/db.js';

const app = createApp();
type Who = 'nusrat' | 'rafiq' | 'shirin' | 'jashim' | 'babul';
const cookie = {} as Record<Who, string>;
const zone: Record<string, number> = {};

beforeAll(async () => {
  await resetDb();
  await seed();
  for (const z of await db.select().from(zones)) zone[z.name] = z.id;

  // A second driver, only so we can prove drivers can't touch each other's trips.
  const [babul] = await db
    .insert(users)
    .values({
      name: 'Babul',
      email: 'babul@teslapool.test',
      phone: '+8801700000202',
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: 'DRIVER',
    })
    .returning();
  await db.insert(vehicles).values({
    driverId: babul!.id,
    name: 'Rocket',
    plateNo: 'DHAKA-TESLA-0915',
    capacity: 3,
    currentZoneId: zone['Banani'],
  });

  for (const who of ['nusrat', 'rafiq', 'shirin', 'jashim'] as const) {
    cookie[who] = await signIn(app, who);
  }
  cookie.babul = await signInEmail(app, 'babul@teslapool.test');
});
beforeEach(async () => {
  await resetRides();
  await db.update(vehicles).set({ driverStatus: 'OFFLINE', currentZoneId: zone['Banani'] });
});
afterAll(closeDb);

const as = (who: Who) => ({
  get: (path: string) => request(app).get(path).set('Cookie', cookie[who]),
  post: (path: string, body: object = {}) =>
    request(app).post(path).set('Cookie', cookie[who]).send(body),
  patch: (path: string, body: object) =>
    request(app).patch(path).set('Cookie', cookie[who]).send(body),
});

const book = (who: Who, to: string, seats = 1, paymentMethod = 'CASH') =>
  request(app)
    .post('/rides')
    .set('Cookie', cookie[who])
    .set('Idempotency-Key', randomUUID())
    .send({ pickupZoneId: zone['Banani'], dropoffZoneId: zone[to], seats, paymentMethod });

const goOnline = () =>
  as('jashim').patch('/driver/status', { status: 'ONLINE', zoneId: zone['Banani'] });

async function bulletWithNusratAndRafiq() {
  await goOnline();
  const nusrat = await book('nusrat', 'Mohakhali');
  const accepted = await as('jashim').post(`/driver/requests/${nusrat.body.ride.id}/accept`);
  const rafiq = await book('rafiq', 'Gulshan 1', 1, 'TESLAPAY');
  return {
    poolId: accepted.body.pool.id as string,
    nusratId: nusrat.body.ride.id,
    rafiqId: rafiq.body.ride.id,
  };
}

describe("Jashim's morning, start to finish", () => {
  it('goes online, accepts, pools, arrives, starts, completes, and gets paid', async () => {
    const online = await goOnline();
    expect(online.status).toBe(200);
    expect(online.body.vehicle).toEqual({ driverStatus: 'ONLINE', currentZoneId: zone['Banani'] });

    // Nusrat books and shows up in Jashim's feed.
    const nusrat = await book('nusrat', 'Mohakhali');
    const feed = await as('jashim').get('/driver/requests');
    expect(feed.body).toMatchObject({ online: true, zone: { name: 'Banani' }, currentPool: null });
    expect(feed.body.requests).toEqual([
      expect.objectContaining({
        passengerName: 'Nusrat',
        seats: 1,
        dropoffZone: expect.objectContaining({ name: 'Mohakhali' }),
      }),
    ]);

    // Accept: Bullet's pool starts with Nusrat.
    const accepted = await as('jashim').post(`/driver/requests/${nusrat.body.ride.id}/accept`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.pool).toMatchObject({ status: 'ACCEPTED', seatsTaken: 1, seatsFree: 2 });
    const poolId = accepted.body.pool.id;

    // Rafiq is auto-matched; Jashim sees both riders and what each pays.
    await book('rafiq', 'Gulshan 1', 1, 'TESLAPAY');
    const current = await as('jashim').get('/pools/current');
    expect(
      current.body.pool.passengers.map(
        (p: { passengerName: string; fare: { totalFarePaisa: number } }) => [
          p.passengerName,
          p.fare.totalFarePaisa,
        ],
      ),
    ).toEqual([
      ['Nusrat', 6200],
      ['Rafiq', 7800],
    ]);
    expect(current.body.pool).toMatchObject({ seatsTaken: 2, seatsFree: 1, totalFarePaisa: 14000 });

    // Shirin needs 2 seats: she stays in the feed, not in the Tesla.
    await book('shirin', 'Gulshan 1', 2);
    const feed2 = await as('jashim').get('/driver/requests');
    expect(feed2.body.requests.map((r: { passengerName: string }) => r.passengerName)).toEqual([
      'Shirin',
    ]);

    // Arrive → both riders see the driver has arrived.
    expect((await as('jashim').post(`/pools/${poolId}/arrive`)).body.pool.status).toBe(
      'DRIVER_ARRIVED',
    );
    expect((await as('nusrat').get('/rides/current')).body.ride.status).toBe('DRIVER_ARRIVED');

    // Start → fares are frozen into the audit log.
    expect((await as('jashim').post(`/pools/${poolId}/start`)).body.pool.status).toBe('STARTED');
    const [startEvent] = await db
      .select()
      .from(statusEvents)
      .where(eq(statusEvents.poolId, poolId))
      .then((rows) => rows.filter((e) => e.toStatus === 'STARTED'));
    expect(startEvent!.metadata).toMatchObject({
      fares: expect.arrayContaining([
        expect.objectContaining({ totalFarePaisa: 6200 }),
        expect.objectContaining({ totalFarePaisa: 7800 }),
      ]),
    });

    // Complete → rides done, one payment each, in the method each chose.
    const done = await as('jashim').post(`/pools/${poolId}/complete`);
    expect(done.body.pool.status).toBe('COMPLETED');
    const paid = await db.select().from(payments);
    expect(paid.map((p) => [p.method, p.amountPaisa, p.status]).sort()).toEqual([
      ['CASH', 6200, 'PAID'],
      ['TESLAPAY', 7800, 'PAID'],
    ]);

    // Nusrat's history tells the whole story, including who did what.
    const ride = await as('nusrat').get(`/rides/${nusrat.body.ride.id}`);
    expect(
      ride.body.ride.timeline.map((t: { toStatus: string; by: string }) => `${t.toStatus}:${t.by}`),
    ).toEqual([
      'REQUESTED:YOU',
      'MATCHED:DRIVER',
      'DRIVER_ARRIVED:DRIVER',
      'STARTED:DRIVER',
      'COMPLETED:DRIVER',
    ]);
    expect(ride.body.ride.fare.totalFarePaisa).toBe(6200);

    // The trip is in Jashim's history, and Bullet is free to go offline.
    const history = await as('jashim').get('/pools');
    expect(history.body.pools).toHaveLength(1);
    expect(history.body.pools[0]).toMatchObject({
      id: poolId,
      status: 'COMPLETED',
      totalFarePaisa: 14000,
    });
    expect((await as('jashim').patch('/driver/status', { status: 'OFFLINE' })).status).toBe(200);
  });
});

describe('trip state transitions', () => {
  it('rejects steps out of order', async () => {
    const { poolId } = await bulletWithNusratAndRafiq();
    const start = await as('jashim').post(`/pools/${poolId}/start`);
    expect(start.status).toBe(409);
    expect(start.body.error.code).toBe('INVALID_TRANSITION');
    expect((await as('jashim').post(`/pools/${poolId}/complete`)).status).toBe(409);

    await as('jashim').post(`/pools/${poolId}/arrive`);
    expect((await as('jashim').post(`/pools/${poolId}/arrive`)).status).toBe(409);
  });

  it('cannot cancel a trip that has started, and fares stay frozen', async () => {
    const { poolId, rafiqId } = await bulletWithNusratAndRafiq();
    await as('jashim').post(`/pools/${poolId}/arrive`);
    await as('jashim').post(`/pools/${poolId}/start`);

    expect((await as('jashim').post(`/pools/${poolId}/cancel`)).status).toBe(409);
    expect((await as('rafiq').post(`/rides/${rafiqId}/cancel`)).status).toBe(409);
    const current = await as('jashim').get('/pools/current');
    expect(current.body.pool.totalFarePaisa).toBe(14000);
  });

  it('driver cancelling cancels every rider, with the reason, and frees them to rebook', async () => {
    const { poolId, nusratId } = await bulletWithNusratAndRafiq();
    const res = await as('jashim').post(`/pools/${poolId}/cancel`, {
      reason: 'Flat tyre on Road 11',
    });
    expect(res.status).toBe(200);
    expect(res.body.pool).toMatchObject({ status: 'CANCELLED', seatsTaken: 0, totalFarePaisa: 0 });

    const ride = await as('nusrat').get(`/rides/${nusratId}`);
    expect(ride.body.ride.status).toBe('CANCELLED');
    expect(ride.body.ride.timeline.at(-1)).toMatchObject({
      reason: 'Driver cancelled the trip: Flat tyre on Road 11',
      by: 'DRIVER',
    });
    expect((await book('nusrat', 'Mohakhali')).status).toBe(201);
    expect(await db.select().from(payments)).toHaveLength(0);
  });
});

describe('going online and offline', () => {
  it('shows an empty feed while offline', async () => {
    await book('nusrat', 'Mohakhali');
    const feed = await as('jashim').get('/driver/requests');
    expect(feed.body).toMatchObject({ online: false, requests: [] });
  });

  it('only shows requests from the zone Bullet is parked in', async () => {
    await as('jashim').patch('/driver/status', { status: 'ONLINE', zoneId: zone['Gulshan 1'] });
    await book('nusrat', 'Mohakhali'); // from Banani
    expect((await as('jashim').get('/driver/requests')).body.requests).toEqual([]);
  });

  it('cannot go offline or move zone with passengers on board', async () => {
    await bulletWithNusratAndRafiq();
    const offline = await as('jashim').patch('/driver/status', { status: 'OFFLINE' });
    expect(offline.status).toBe(409);
    expect(offline.body.error.code).toBe('ACTIVE_TRIP');
    const move = await as('jashim').patch('/driver/status', {
      status: 'ONLINE',
      zoneId: zone['Uttara'],
    });
    expect(move.status).toBe(409);
  });

  it('rejects an unknown zone', async () => {
    const res = await as('jashim').patch('/driver/status', { status: 'ONLINE', zoneId: 999 });
    expect(res.status).toBe(422);
  });

  it('accepting while offline is refused', async () => {
    const nusrat = await book('nusrat', 'Mohakhali');
    const res = await as('jashim').post(`/driver/requests/${nusrat.body.ride.id}/accept`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TESLA_OFFLINE');
  });
});

describe('who can do what', () => {
  it("Babul can't see or drive Jashim's trip", async () => {
    const { poolId } = await bulletWithNusratAndRafiq();
    expect((await as('babul').get(`/pools/${poolId}`)).status).toBe(404);
    const arrive = await as('babul').post(`/pools/${poolId}/arrive`);
    expect(arrive.status).toBe(404);
    const [pool] = await db.select().from(pools).where(eq(pools.id, poolId));
    expect(pool!.status).toBe('ACCEPTED');
  });

  it('passengers cannot use driver endpoints', async () => {
    const { poolId } = await bulletWithNusratAndRafiq();
    expect((await as('nusrat').get('/driver/requests')).status).toBe(403);
    expect((await as('nusrat').post(`/pools/${poolId}/start`)).status).toBe(403);
  });

  it('drivers cannot use passenger endpoints', async () => {
    expect((await as('jashim').get('/rides/current')).status).toBe(403);
  });
});
