import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, db } from '../src/db/client.js';
import {
  poolMembers,
  pools,
  rideRequests,
  statusEvents,
  users,
  vehicles,
  zones,
} from '../src/db/schema/index.js';
import { seed } from '../src/db/seed.js';
import { first, resetDb } from './helpers/db.js';

// These tests bypass the service layer on purpose: they prove the database
// itself refuses invalid data, even if a future service has a bug.

let bulletId: string;
let nusratId: string;
let banani: number;
let mohakhali: number;

beforeEach(async () => {
  await resetDb();
  await seed();
  const zoneRows = await db.select().from(zones);
  banani = zoneRows.find((z) => z.name === 'Banani')!.id;
  mohakhali = zoneRows.find((z) => z.name === 'Mohakhali')!.id;
  bulletId = first(await db.select({ id: vehicles.id }).from(vehicles)).id;
  nusratId = first(
    await db.select({ id: users.id }).from(users).where(eq(users.name, 'Nusrat')),
  ).id;
});
afterAll(closeDb);

// Drizzle wraps driver errors; the Postgres constraint name is on the cause.
async function expectViolation(promise: Promise<unknown>, constraint: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e as { cause?: { constraint?: string } },
  );
  expect(err, `expected ${constraint} to be violated`).not.toBeNull();
  expect(err?.cause?.constraint).toBe(constraint);
}

const newPool = (overrides: Partial<typeof pools.$inferInsert> = {}) =>
  db
    .insert(pools)
    .values({ vehicleId: bulletId, pickupZoneId: banani, capacity: 3, ...overrides })
    .returning();

const newRequest = (overrides: Partial<typeof rideRequests.$inferInsert> = {}) =>
  db
    .insert(rideRequests)
    .values({
      passengerId: nusratId,
      pickupZoneId: banani,
      dropoffZoneId: mohakhali,
      seats: 1,
      estimatedFarePaisa: 7000,
      idempotencyKey: randomUUID(),
      ...overrides,
    })
    .returning();

describe('database constraints', () => {
  it("Bullet's pool can never hold more seats than its capacity", async () => {
    const [pool] = await newPool({ seatsTaken: 3 });
    await expectViolation(
      db.update(pools).set({ seatsTaken: 4 }).where(eq(pools.id, pool!.id)),
      'pools_seats_within_capacity',
    );
  });

  it('a Tesla cannot run two active pools at once', async () => {
    await newPool();
    await expectViolation(newPool(), 'pools_one_active_per_vehicle');
  });

  it('a Tesla can start a new pool once the previous one is completed', async () => {
    const [first] = await newPool();
    await db.update(pools).set({ status: 'COMPLETED' }).where(eq(pools.id, first!.id));
    await expect(newPool()).resolves.toHaveLength(1);
  });

  it('a passenger cannot have two rides in flight', async () => {
    await newRequest();
    await expectViolation(newRequest(), 'ride_requests_one_active_per_passenger');
  });

  it('retrying with the same idempotency key is rejected', async () => {
    const key = randomUUID();
    const [first] = await newRequest({ idempotencyKey: key });
    await db
      .update(rideRequests)
      .set({ status: 'CANCELLED' })
      .where(eq(rideRequests.id, first!.id));
    await expectViolation(
      newRequest({ idempotencyKey: key }),
      'ride_requests_passenger_idempotency_key',
    );
  });

  it('pickup and dropoff must differ', async () => {
    await expectViolation(newRequest({ dropoffZoneId: banani }), 'ride_requests_distinct_zones');
  });

  it('a request must ask for at least one seat', async () => {
    await expectViolation(newRequest({ seats: 0 }), 'ride_requests_seats_positive');
  });

  it("a fare breakdown must add up (Nusrat's pooled ৳62)", async () => {
    const [pool] = await newPool({ seatsTaken: 1 });
    const [request] = await newRequest();
    const member = {
      poolId: pool!.id,
      rideRequestId: request!.id,
      seats: 1,
      distanceM: 2000,
      baseFarePaisa: 3000,
      distanceChargePaisa: 4000,
      poolDiscountPaisa: 800,
    };
    await expectViolation(
      db.insert(poolMembers).values({ ...member, totalFarePaisa: 7000 }),
      'pool_members_fare_adds_up',
    );
    await expect(
      db
        .insert(poolMembers)
        .values({ ...member, totalFarePaisa: 6200 })
        .returning(),
    ).resolves.toHaveLength(1);
  });

  it('a request can join only one pool', async () => {
    const [pool] = await newPool({ seatsTaken: 1 });
    const [request] = await newRequest();
    const member = {
      poolId: pool!.id,
      rideRequestId: request!.id,
      seats: 1,
      distanceM: 2000,
      baseFarePaisa: 3000,
      distanceChargePaisa: 4000,
      totalFarePaisa: 7000,
    };
    await db.insert(poolMembers).values(member);
    await expectViolation(
      db.insert(poolMembers).values(member),
      'pool_members_ride_request_id_unique',
    );
  });

  it('an audit event belongs to exactly one entity', async () => {
    const [pool] = await newPool();
    const [request] = await newRequest();
    await expectViolation(
      db.insert(statusEvents).values({ toStatus: 'MATCHED' }),
      'status_events_one_entity',
    );
    await expectViolation(
      db
        .insert(statusEvents)
        .values({ toStatus: 'MATCHED', rideRequestId: request!.id, poolId: pool!.id }),
      'status_events_one_entity',
    );
  });
});
