import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closeDb, db } from '../src/db/client.js';
import {
  poolMembers,
  pools,
  rideRequests,
  users,
  vehicles,
  zones,
} from '../src/db/schema/index.js';
import { seed } from '../src/db/seed.js';
import { hashPassword } from '../src/lib/password.js';
import { acceptRequest } from '../src/modules/pools/pooling.service.js';
import { signIn, signInEmail, TEST_PASSWORD } from './helpers/auth.js';
import { first, resetDb, resetRides } from './helpers/db.js';

const app = createApp();
type Who = 'nusrat' | 'rafiq' | 'shirin' | 'jashim';
const cookie = {} as Record<Who, string>;
const zone: Record<string, number> = {};
let jashimId: string;

beforeAll(async () => {
  await resetDb();
  await seed();
  for (const z of await db.select().from(zones)) zone[z.name] = z.id;
  for (const who of ['nusrat', 'rafiq', 'shirin', 'jashim'] as const) {
    cookie[who] = await signIn(app, who);
  }
  jashimId = first(await db.select().from(users).where(eq(users.name, 'Jashim'))).id;
});
beforeEach(async () => {
  await resetRides();
  await db.update(vehicles).set({ driverStatus: 'ONLINE', currentZoneId: zone['Banani'] });
});
afterAll(closeDb);

const trip = (to: string, seats = 1, from = 'Banani') => ({
  pickupZoneId: zone[from],
  dropoffZoneId: zone[to],
  seats,
});

const requestRide = (who: string, body: object) =>
  request(app)
    .post('/rides')
    .set('Cookie', who in cookie ? cookie[who as Who] : who)
    .set('Idempotency-Key', randomUUID())
    .send(body);

const current = async (who: Who) =>
  (await request(app).get('/rides/current').set('Cookie', cookie[who])).body.ride;

const cancel = (who: Who, id: string) =>
  request(app).post(`/rides/${id}/cancel`).set('Cookie', cookie[who]).send({});

const bulletPool = async () => {
  const rows = await db.select().from(pools);
  return rows.find((p) => p.status !== 'CANCELLED' && p.status !== 'COMPLETED');
};

describe('the Banani rush-hour story', () => {
  it('pools Nusrat and Rafiq into Bullet, prices them fairly, and keeps Shirin waiting', async () => {
    // 8:41 Nusrat books; nobody is driving her way yet.
    const nusrat = await requestRide('nusrat', trip('Mohakhali'));
    expect(nusrat.status).toBe(201);
    expect(nusrat.body.ride).toMatchObject({ status: 'REQUESTED', pool: null, fare: null });

    // Jashim accepts: Bullet's pool starts, 1 of 3 seats taken, solo price.
    await acceptRequest(jashimId, nusrat.body.ride.id);
    expect(await current('nusrat')).toMatchObject({
      status: 'MATCHED',
      pool: {
        status: 'ACCEPTED',
        seatsTaken: 1,
        capacity: 3,
        tesla: { name: 'Bullet' },
        coRiders: 0,
      },
      fare: { totalFarePaisa: 7000, pooled: false },
    });

    // 8:43 Rafiq books Banani → Gulshan 1 and is matched straight away.
    const rafiq = await requestRide('rafiq', trip('Gulshan 1'));
    expect(rafiq.status).toBe(201);
    expect(rafiq.body.ride).toMatchObject({
      status: 'MATCHED',
      pool: { seatsTaken: 2, coRiders: 1, driverName: 'Jashim' },
      fare: {
        baseFarePaisa: 3000,
        distanceChargePaisa: 6000,
        poolDiscountPaisa: 1200,
        totalFarePaisa: 7800,
      },
    });

    // Nusrat's fare dropped to the pooled price when Rafiq joined.
    const nusratNow = await current('nusrat');
    expect(nusratNow.fare).toMatchObject({
      poolDiscountPaisa: 800,
      totalFarePaisa: 6200,
      pooled: true,
    });

    // She sees that she shares, but not with whom or what they pay.
    const body = JSON.stringify(nusratNow);
    expect(body).not.toContain('Rafiq');
    expect(body).not.toContain('7800');

    // Shirin wants 2 seats; only 1 is free, so she keeps waiting.
    const shirin = await requestRide('shirin', trip('Gulshan 1', 2));
    expect(shirin.status).toBe(201);
    expect(shirin.body.ride).toMatchObject({ status: 'REQUESTED', pool: null });
    expect((await bulletPool())!.seatsTaken).toBe(2);
  });
});

describe('cancelling out of a pool', () => {
  it("releases Rafiq's seat, re-prices Nusrat, and cancels the empty pool", async () => {
    const nusrat = await requestRide('nusrat', trip('Mohakhali'));
    await acceptRequest(jashimId, nusrat.body.ride.id);
    const rafiq = await requestRide('rafiq', trip('Gulshan 1'));

    const res = await cancel('rafiq', rafiq.body.ride.id);
    expect(res.status).toBe(200);
    expect(res.body.ride.status).toBe('CANCELLED');

    const n = await current('nusrat');
    expect(n.pool).toMatchObject({ seatsTaken: 1, coRiders: 0 });
    expect(n.fare).toMatchObject({ totalFarePaisa: 7000, pooled: false });

    await cancel('nusrat', nusrat.body.ride.id);
    const [pool] = await db.select().from(pools);
    expect(pool).toMatchObject({ status: 'CANCELLED', seatsTaken: 0 });

    // Bullet is free for a new trip.
    const shirin = await requestRide('shirin', trip('Gulshan 1'));
    await expect(acceptRequest(jashimId, shirin.body.ride.id)).resolves.toBeTypeOf('string');
  });

  it('can cancel after the driver arrives, but not once the trip has started', async () => {
    const nusrat = await requestRide('nusrat', trip('Mohakhali'));
    const poolId = await acceptRequest(jashimId, nusrat.body.ride.id);
    const rafiq = await requestRide('rafiq', trip('Gulshan 1'));

    await db.update(pools).set({ status: 'DRIVER_ARRIVED' }).where(eq(pools.id, poolId));
    await db
      .update(rideRequests)
      .set({ status: 'DRIVER_ARRIVED' })
      .where(inArray(rideRequests.id, [nusrat.body.ride.id, rafiq.body.ride.id]));
    expect((await cancel('rafiq', rafiq.body.ride.id)).status).toBe(200);

    await db.update(pools).set({ status: 'STARTED' }).where(eq(pools.id, poolId));
    await db
      .update(rideRequests)
      .set({ status: 'STARTED' })
      .where(eq(rideRequests.id, nusrat.body.ride.id));
    const res = await cancel('nusrat', nusrat.body.ride.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect((await bulletPool())!.seatsTaken).toBe(1);
  });
});

describe('matching rules', () => {
  it('does not pool dropoffs more than 3 km apart', async () => {
    const nusrat = await requestRide('nusrat', trip('Mohakhali'));
    await acceptRequest(jashimId, nusrat.body.ride.id);

    // Mohakhali ↔ Farmgate is 3.5 km.
    const shirin = await requestRide('shirin', trip('Farmgate'));
    expect(shirin.body.ride.status).toBe('REQUESTED');
    await expect(acceptRequest(jashimId, shirin.body.ride.id)).rejects.toMatchObject({
      code: 'ROUTE_INCOMPATIBLE',
    });
  });

  it('does not pool rides from a different pickup zone', async () => {
    const nusrat = await requestRide('nusrat', trip('Mohakhali'));
    await acceptRequest(jashimId, nusrat.body.ride.id);
    const shirin = await requestRide('shirin', trip('Gulshan 2', 1, 'Gulshan 1'));
    expect(shirin.body.ride.status).toBe('REQUESTED');
  });

  it('stops taking passengers once the driver has arrived', async () => {
    const nusrat = await requestRide('nusrat', trip('Mohakhali'));
    const poolId = await acceptRequest(jashimId, nusrat.body.ride.id);
    await db.update(pools).set({ status: 'DRIVER_ARRIVED' }).where(eq(pools.id, poolId));

    const rafiq = await requestRide('rafiq', trip('Gulshan 1'));
    expect(rafiq.body.ride.status).toBe('REQUESTED');
    await expect(acceptRequest(jashimId, rafiq.body.ride.id)).rejects.toMatchObject({
      code: 'POOL_CLOSED',
    });
  });
});

describe('driver accepting requests', () => {
  it('adds a second waiting request to the pool the driver already has', async () => {
    // Both booked before any Tesla was online, so neither could auto-join.
    await db.update(vehicles).set({ driverStatus: 'OFFLINE' });
    const nusrat = await requestRide('nusrat', trip('Mohakhali'));
    const rafiq = await requestRide('rafiq', trip('Gulshan 1'));
    await db.update(vehicles).set({ driverStatus: 'ONLINE' });

    const first = await acceptRequest(jashimId, nusrat.body.ride.id);
    const second = await acceptRequest(jashimId, rafiq.body.ride.id);
    expect(second).toBe(first);
    expect((await current('nusrat')).fare.totalFarePaisa).toBe(6200);
    expect((await current('rafiq')).fare.totalFarePaisa).toBe(7800);
  });

  it('refuses while offline, from the wrong zone, or for a ride that is gone', async () => {
    const nusrat = await requestRide('nusrat', trip('Mohakhali'));

    await db.update(vehicles).set({ driverStatus: 'OFFLINE' });
    await expect(acceptRequest(jashimId, nusrat.body.ride.id)).rejects.toMatchObject({
      code: 'TESLA_OFFLINE',
    });

    await db.update(vehicles).set({ driverStatus: 'ONLINE', currentZoneId: zone['Uttara'] });
    await expect(acceptRequest(jashimId, nusrat.body.ride.id)).rejects.toMatchObject({
      code: 'WRONG_PICKUP',
    });

    await db.update(vehicles).set({ currentZoneId: zone['Banani'] });
    await cancel('nusrat', nusrat.body.ride.id);
    await expect(acceptRequest(jashimId, nusrat.body.ride.id)).rejects.toMatchObject({
      code: 'RIDE_NOT_AVAILABLE',
    });
    expect(await db.select().from(pools)).toHaveLength(0); // the failed accept left nothing behind
  });

  it('refuses when the ride needs more seats than are free', async () => {
    const rafiq = await requestRide('rafiq', trip('Gulshan 1', 2));
    await acceptRequest(jashimId, rafiq.body.ride.id);
    await db.update(vehicles).set({ driverStatus: 'OFFLINE' }); // stop auto-join, test accept
    const shirin = await requestRide('shirin', trip('Gulshan 1', 2));
    await db.update(vehicles).set({ driverStatus: 'ONLINE' });
    await expect(acceptRequest(jashimId, shirin.body.ride.id)).rejects.toMatchObject({
      code: 'POOL_FULL',
    });
  });
});

describe('concurrency', () => {
  async function extraPassengers(n: number) {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const rows = Array.from({ length: n }, (_, i) => ({
      name: `Commuter ${i + 1}`,
      email: `commuter${i + 1}@teslapool.test`,
      phone: `+88019000000${String(i + 10).padStart(2, '0')}`,
      passwordHash,
      role: 'PASSENGER' as const,
    }));
    await db.insert(users).values(rows).onConflictDoNothing();
    return Promise.all(rows.map((r) => signInEmail(app, r.email)));
  }

  it('Nusrat and Shirin race for Bullet’s last seat: exactly one gets it', async () => {
    const rafiq = await requestRide('rafiq', trip('Gulshan 1', 2));
    await acceptRequest(jashimId, rafiq.body.ride.id); // Bullet: 2 of 3 seats taken

    const [nusrat, shirin] = await Promise.all([
      requestRide('nusrat', trip('Mohakhali')),
      requestRide('shirin', trip('Gulshan 1')),
    ]);
    expect(nusrat.status).toBe(201);
    expect(shirin.status).toBe(201);
    expect([nusrat.body.ride.status, shirin.body.ride.status].sort()).toEqual([
      'MATCHED',
      'REQUESTED',
    ]);

    const pool = (await bulletPool())!;
    expect(pool.seatsTaken).toBe(3);
    expect(await db.select().from(poolMembers).where(eq(poolMembers.poolId, pool.id))).toHaveLength(
      2,
    );
  });

  it('eight commuters stampede for two free seats: exactly two get in', async () => {
    const commuters = await extraPassengers(8);
    const nusrat = await requestRide('nusrat', trip('Mohakhali'));
    await acceptRequest(jashimId, nusrat.body.ride.id); // 1 of 3 taken

    const results = await Promise.all(commuters.map((c) => requestRide(c, trip('Gulshan 1'))));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(results.filter((r) => r.body.ride.status === 'MATCHED')).toHaveLength(2);

    const pool = (await bulletPool())!;
    expect(pool.seatsTaken).toBe(3);
    const seats = await db
      .select({ seats: poolMembers.seats })
      .from(poolMembers)
      .innerJoin(rideRequests, eq(rideRequests.id, poolMembers.rideRequestId))
      .where(and(eq(poolMembers.poolId, pool.id), eq(rideRequests.status, 'MATCHED')));
    expect(seats.reduce((sum, m) => sum + m.seats, 0)).toBe(pool.seatsTaken);
  });

  it('Jashim accepting while Nusrat cancels: one wins, and nothing is half-done', async () => {
    const nusrat = await requestRide('nusrat', trip('Mohakhali'));
    const [accepted, cancelled] = await Promise.allSettled([
      acceptRequest(jashimId, nusrat.body.ride.id),
      cancel('nusrat', nusrat.body.ride.id),
    ]);

    const [ride] = await db
      .select()
      .from(rideRequests)
      .where(eq(rideRequests.id, nusrat.body.ride.id));
    const pool = await bulletPool();
    if (accepted.status === 'fulfilled' && ride!.status === 'MATCHED') {
      // Accept won; the cancel either lost the race (409) or ran after and cancelled cleanly.
      expect(pool!.seatsTaken).toBe(1);
    } else {
      expect(ride!.status).toBe('CANCELLED');
      expect(pool?.seatsTaken ?? 0).toBe(0);
    }
    expect(cancelled.status).toBe('fulfilled');
  });

  it('two quick accepts by Jashim end up in one pool, not two', async () => {
    await db.update(vehicles).set({ driverStatus: 'OFFLINE' });
    const nusrat = await requestRide('nusrat', trip('Mohakhali'));
    const rafiq = await requestRide('rafiq', trip('Gulshan 1'));
    await db.update(vehicles).set({ driverStatus: 'ONLINE' });

    const [a, b] = await Promise.all([
      acceptRequest(jashimId, nusrat.body.ride.id),
      acceptRequest(jashimId, rafiq.body.ride.id),
    ]);
    expect(a).toBe(b);
    const all = await db.select().from(pools);
    expect(all).toHaveLength(1);
    expect(all[0]!.seatsTaken).toBe(2);
  });
});
