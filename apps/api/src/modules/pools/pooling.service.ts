import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, type Tx } from '../../db/client.js';
import {
  poolMembers,
  pools,
  rideRequests,
  statusEvents,
  vehicles,
  type RequestStatus,
} from '../../db/schema/index.js';
import { HttpError } from '../../lib/http-error.js';
import { uniqueViolation } from '../../lib/pg-errors.js';
import { calculateFare } from '../fares/fare.js';
import { transitionPool, transitionRequest } from '../lifecycle/transitions.js';
import { distanceBetween } from '../zones/zones.service.js';

// Matching rule and locking strategy: docs/pooling-and-fares.md.
//
// Lock order, everywhere: pool row first (SELECT ... FOR UPDATE), then the
// ride row (conditional UPDATE). Join, accept and cancel all follow it, so
// they serialise per pool and can never deadlock each other.

export const MAX_DROPOFF_SPREAD_M = 3000;

type Ride = typeof rideRequests.$inferSelect;
type Pool = typeof pools.$inferSelect;

// Requests that still occupy their seat in a pool.
const HOLDS_SEAT: RequestStatus[] = ['MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED'];

type Rejection = 'POOL_CLOSED' | 'WRONG_PICKUP' | 'POOL_FULL' | 'ROUTE_INCOMPATIBLE';

const REJECTION_MESSAGES: Record<Rejection, string> = {
  POOL_CLOSED: 'This pool is no longer taking passengers',
  WRONG_PICKUP: 'This ride starts in a different zone from the pool',
  POOL_FULL: 'Not enough free seats in this Tesla',
  ROUTE_INCOMPATIBLE: 'This dropoff is too far from the other passengers’ dropoffs',
};

async function lockPool(tx: Tx, poolId: string) {
  const [pool] = await tx.select().from(pools).where(eq(pools.id, poolId)).for('update');
  return pool;
}

async function activeMembers(tx: Tx, poolId: string) {
  return tx
    .select({
      memberId: poolMembers.id,
      rideId: rideRequests.id,
      pickupZoneId: rideRequests.pickupZoneId,
      dropoffZoneId: rideRequests.dropoffZoneId,
      seats: poolMembers.seats,
      status: rideRequests.status,
    })
    .from(poolMembers)
    .innerJoin(rideRequests, eq(rideRequests.id, poolMembers.rideRequestId))
    .where(and(eq(poolMembers.poolId, poolId), inArray(rideRequests.status, HOLDS_SEAT)));
}

// Every check runs while the pool row is locked, against committed data, so
// two passengers racing for the last seat can't both pass.
async function checkJoin(tx: Tx, pool: Pool, ride: Ride): Promise<Rejection | null> {
  if (pool.status !== 'ACCEPTED') return 'POOL_CLOSED';
  if (pool.pickupZoneId !== ride.pickupZoneId) return 'WRONG_PICKUP';
  if (pool.seatsTaken + ride.seats > pool.capacity) return 'POOL_FULL';

  for (const member of await activeMembers(tx, pool.id)) {
    if (member.dropoffZoneId === ride.dropoffZoneId) continue; // same zone: 0 km apart
    const spread = await distanceBetween(tx, member.dropoffZoneId, ride.dropoffZoneId);
    if (spread > MAX_DROPOFF_SPREAD_M) return 'ROUTE_INCOMPATIBLE';
  }
  return null;
}

// Recompute every active member's fare. Pooled pricing applies only while at
// least two requests share the Tesla, so if Rafiq leaves, Nusrat's fare goes
// back to solo. Called with the pool row locked.
export async function recomputeFares(tx: Tx, poolId: string) {
  const members = await activeMembers(tx, poolId);
  const pooled = members.length >= 2;
  for (const m of members) {
    const distanceM = await distanceBetween(tx, m.pickupZoneId, m.dropoffZoneId);
    const fare = calculateFare({ distanceM, seats: m.seats, pooled });
    await tx.update(poolMembers).set(fare).where(eq(poolMembers.id, m.memberId));
  }
}

// Claim seats and record membership. Caller holds the pool lock and has
// already run checkJoin.
async function addMember(tx: Tx, pool: Pool, ride: Ride, actorId: string | null) {
  const [updated] = await tx
    .update(pools)
    .set({ seatsTaken: sql`${pools.seatsTaken} + ${ride.seats}` })
    .where(eq(pools.id, pool.id))
    .returning();

  const distanceM = await distanceBetween(tx, ride.pickupZoneId, ride.dropoffZoneId);
  await tx.insert(poolMembers).values({
    poolId: pool.id,
    rideRequestId: ride.id,
    ...calculateFare({ distanceM, seats: ride.seats, pooled: false }),
  });

  // Conditional on REQUESTED: if the passenger cancelled a moment ago this
  // throws 409 and the whole join rolls back.
  await transitionRequest(tx, {
    id: ride.id,
    from: 'REQUESTED',
    to: 'MATCHED',
    actorId,
    reason: actorId ? 'Accepted by driver' : 'Auto-matched into a shared Tesla',
    metadata: { poolId: pool.id, seatsTaken: updated!.seatsTaken, capacity: pool.capacity },
  });

  await recomputeFares(tx, pool.id);
}

/**
 * Called inside the ride-creation transaction. Tries joinable pools oldest
 * first; returns the pool joined, or null if the ride has to wait.
 */
export async function tryAutoJoin(tx: Tx, ride: Ride): Promise<string | null> {
  // Cheap, unlocked pre-filter. Anything it lets through is re-checked
  // under the lock, so a stale read here can only cost a wasted lock.
  const candidates = await tx
    .select({ id: pools.id })
    .from(pools)
    .where(
      and(
        eq(pools.status, 'ACCEPTED'),
        eq(pools.pickupZoneId, ride.pickupZoneId),
        gte(sql`${pools.capacity} - ${pools.seatsTaken}`, ride.seats),
      ),
    )
    .orderBy(asc(pools.createdAt), asc(pools.id)); // fixed lock order across transactions

  for (const { id } of candidates) {
    const pool = await lockPool(tx, id);
    if (!pool || (await checkJoin(tx, pool, ride))) continue;
    await addMember(tx, pool, ride, null);
    return pool.id;
  }
  return null;
}

/**
 * A driver accepts a waiting request. With no active pool this starts one;
 * with a pool still ACCEPTED (not yet arrived) it adds the ride to it, under
 * the same rules as auto-matching.
 */
export async function acceptRequest(driverId: string, rideId: string) {
  try {
    return await db.transaction(async (tx) => {
      // Lock the Tesla first: one driver's accepts are serialised, so two
      // taps on two requests can't both start a pool.
      const [vehicle] = await tx
        .select()
        .from(vehicles)
        .where(eq(vehicles.driverId, driverId))
        .for('update');
      if (!vehicle) throw new HttpError(403, 'NO_TESLA', 'You have no Tesla to accept rides with');
      if (vehicle.driverStatus !== 'ONLINE') {
        throw new HttpError(409, 'TESLA_OFFLINE', 'Go online before accepting rides');
      }

      const [ride] = await tx.select().from(rideRequests).where(eq(rideRequests.id, rideId));
      if (!ride || ride.status !== 'REQUESTED') {
        throw new HttpError(
          409,
          'RIDE_NOT_AVAILABLE',
          'This ride is no longer waiting for a Tesla',
        );
      }

      const [activePool] = await tx
        .select({ id: pools.id })
        .from(pools)
        .where(
          and(
            eq(pools.vehicleId, vehicle.id),
            inArray(pools.status, ['ACCEPTED', 'DRIVER_ARRIVED', 'STARTED']),
          ),
        );

      let pool: Pool;
      if (activePool) {
        pool = (await lockPool(tx, activePool.id))!;
      } else {
        if (vehicle.currentZoneId !== ride.pickupZoneId) {
          throw new HttpError(
            409,
            'WRONG_PICKUP',
            'This ride starts in a different zone from your Tesla',
          );
        }
        const [created] = await tx
          .insert(pools)
          .values({
            vehicleId: vehicle.id,
            pickupZoneId: ride.pickupZoneId,
            capacity: vehicle.capacity,
          })
          .returning();
        pool = created!;
        await tx.insert(statusEvents).values({
          poolId: pool.id,
          fromStatus: null,
          toStatus: 'ACCEPTED',
          actorId: driverId,
          metadata: { vehicle: vehicle.name, capacity: vehicle.capacity },
        });
      }

      const rejection = await checkJoin(tx, pool, ride);
      if (rejection) throw new HttpError(409, rejection, REJECTION_MESSAGES[rejection]);

      await addMember(tx, pool, ride, driverId);
      return pool.id;
    });
  } catch (err) {
    if (uniqueViolation(err) === 'pools_one_active_per_vehicle') {
      throw new HttpError(409, 'TESLA_BUSY', 'Your Tesla already has an active trip');
    }
    throw err;
  }
}

/**
 * Cancel a ride that is in a pool: release its seats, re-price the others,
 * and cancel the pool if nobody is left. Returns false if the ride isn't in
 * a pool (the caller then cancels it as a plain waiting request).
 */
export async function cancelPooledRide(
  tx: Tx,
  rideId: string,
  actorId: string,
  reason: string,
): Promise<boolean> {
  const [membership] = await tx
    .select({ poolId: poolMembers.poolId, seats: poolMembers.seats })
    .from(poolMembers)
    .where(eq(poolMembers.rideRequestId, rideId));
  if (!membership) return false;

  const pool = (await lockPool(tx, membership.poolId))!;
  // Re-read under the pool lock: the driver may have just started the trip.
  const [ride] = await tx.select().from(rideRequests).where(eq(rideRequests.id, rideId));

  await transitionRequest(tx, {
    id: rideId,
    from: ride!.status,
    to: 'CANCELLED',
    actorId,
    reason,
    metadata: { poolId: pool.id, seatsReleased: membership.seats },
  });

  await tx
    .update(pools)
    .set({ seatsTaken: sql`${pools.seatsTaken} - ${membership.seats}` })
    .where(eq(pools.id, pool.id));

  const remaining = await activeMembers(tx, pool.id);
  if (remaining.length === 0) {
    await transitionPool(tx, {
      id: pool.id,
      from: pool.status,
      to: 'CANCELLED',
      actorId: null,
      reason: 'Every passenger cancelled',
    });
  } else {
    await recomputeFares(tx, pool.id);
  }
  return true;
}

// What a passenger may know about the pool they're in: the Tesla, its
// driver, and how many others share it - never who they are or what they pay.
export async function poolInfoForRides(rideIds: string[]) {
  if (rideIds.length === 0) return new Map<string, PassengerPoolInfo>();

  const rows = await db.execute<{
    ride_id: string;
    pool_id: string;
    pool_status: string;
    seats_taken: number;
    capacity: number;
    tesla_name: string;
    plate_no: string;
    driver_name: string;
    co_riders: number;
    distance_m: number;
    base_fare_paisa: number;
    distance_charge_paisa: number;
    pool_discount_paisa: number;
    total_fare_paisa: number;
  }>(sql`
    SELECT m.ride_request_id AS ride_id, p.id AS pool_id, p.status AS pool_status,
           p.seats_taken, p.capacity, v.name AS tesla_name, v.plate_no, d.name AS driver_name,
           m.distance_m, m.base_fare_paisa, m.distance_charge_paisa, m.pool_discount_paisa,
           m.total_fare_paisa,
           (SELECT count(*)::int FROM pool_members o
              JOIN ride_requests r ON r.id = o.ride_request_id
             WHERE o.pool_id = p.id AND o.ride_request_id <> m.ride_request_id
               AND r.status <> 'CANCELLED') AS co_riders
      FROM pool_members m
      JOIN pools p ON p.id = m.pool_id
      JOIN vehicles v ON v.id = p.vehicle_id
      JOIN users d ON d.id = v.driver_id
     WHERE m.ride_request_id IN (${sql.join(
       rideIds.map((id) => sql`${id}::uuid`),
       sql`, `,
     )})
  `);

  return new Map(
    rows.rows.map((r) => [
      r.ride_id,
      {
        pool: {
          id: r.pool_id,
          status: r.pool_status,
          seatsTaken: r.seats_taken,
          capacity: r.capacity,
          tesla: { name: r.tesla_name, plateNo: r.plate_no },
          driverName: r.driver_name,
          coRiders: r.co_riders,
        },
        fare: {
          distanceM: r.distance_m,
          baseFarePaisa: r.base_fare_paisa,
          distanceChargePaisa: r.distance_charge_paisa,
          poolDiscountPaisa: r.pool_discount_paisa,
          totalFarePaisa: r.total_fare_paisa,
          pooled: r.pool_discount_paisa > 0,
        },
      },
    ]),
  );
}

export type PassengerPoolInfo = {
  pool: {
    id: string;
    status: string;
    seatsTaken: number;
    capacity: number;
    tesla: { name: string; plateNo: string };
    driverName: string;
    coRiders: number;
  };
  fare: {
    distanceM: number;
    baseFarePaisa: number;
    distanceChargePaisa: number;
    poolDiscountPaisa: number;
    totalFarePaisa: number;
    pooled: boolean;
  };
};
