import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db, type Tx } from '../../db/client.js';
import {
  payments,
  poolMembers,
  pools,
  rideRequests,
  statusEvents,
  users,
  vehicles,
  zones,
  type PoolStatus,
  type RequestStatus,
} from '../../db/schema/index.js';
import { HttpError } from '../../lib/http-error.js';
import { transitionPool, transitionRequest } from '../lifecycle/transitions.js';
import { activeMembers, lockPool } from './pooling.service.js';

// The driver's side of a trip: arrive, start, complete, cancel, and what
// Jashim sees about the passengers in Bullet.

const notFound = () => new HttpError(404, 'POOL_NOT_FOUND', 'Trip not found');

// Lock the pool and prove it belongs to this driver's Tesla. Another
// driver's pool is a 404, same as a passenger's ride.
async function lockOwnPool(tx: Tx, driverId: string, poolId: string) {
  const pool = await lockPool(tx, poolId);
  if (!pool) throw notFound();
  const [vehicle] = await tx
    .select({ driverId: vehicles.driverId })
    .from(vehicles)
    .where(eq(vehicles.id, pool.vehicleId));
  if (vehicle?.driverId !== driverId) throw notFound();
  return pool;
}

// Pool status -> the status its active passengers move to with it.
const CASCADE: Partial<Record<PoolStatus, RequestStatus>> = {
  DRIVER_ARRIVED: 'DRIVER_ARRIVED',
  STARTED: 'STARTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

type Action = 'arrive' | 'start' | 'complete' | 'cancel';
const TARGET: Record<Action, PoolStatus> = {
  arrive: 'DRIVER_ARRIVED',
  start: 'STARTED',
  complete: 'COMPLETED',
  cancel: 'CANCELLED',
};

/**
 * Move a pool and every passenger still in it to the next stage, in one
 * transaction: either Bullet and all its riders advance together, or
 * nothing changes.
 */
export async function advancePool(
  driverId: string,
  poolId: string,
  action: Action,
  reason?: string,
) {
  await db.transaction(async (tx) => {
    const pool = await lockOwnPool(tx, driverId, poolId);
    const to = TARGET[action];
    const members = await activeMembers(tx, pool.id);

    // Fares are final from here on: joins stop at arrival and cancels at
    // start, so nothing can re-price the trip. The event records the numbers.
    const fares =
      to === 'STARTED' || to === 'COMPLETED'
        ? await tx
            .select({
              rideId: poolMembers.rideRequestId,
              seats: poolMembers.seats,
              distanceM: poolMembers.distanceM,
              baseFarePaisa: poolMembers.baseFarePaisa,
              distanceChargePaisa: poolMembers.distanceChargePaisa,
              poolDiscountPaisa: poolMembers.poolDiscountPaisa,
              totalFarePaisa: poolMembers.totalFarePaisa,
            })
            .from(poolMembers)
            .where(
              and(
                eq(poolMembers.poolId, pool.id),
                inArray(
                  poolMembers.rideRequestId,
                  members.map((m) => m.rideId),
                ),
              ),
            )
        : undefined;

    const cancelReason = `Driver cancelled the trip${reason ? `: ${reason}` : ''}`;

    await transitionPool(tx, {
      id: pool.id,
      from: pool.status,
      to,
      actorId: driverId,
      reason: action === 'cancel' ? cancelReason : undefined,
      metadata: fares ? { fares } : undefined,
    });

    for (const m of members) {
      await transitionRequest(tx, {
        id: m.rideId,
        from: m.status,
        to: CASCADE[to]!,
        actorId: driverId,
        reason: action === 'cancel' ? cancelReason : undefined,
        metadata:
          to === 'COMPLETED' ? { fare: fares?.find((f) => f.rideId === m.rideId) } : undefined,
      });
    }

    if (to === 'CANCELLED') {
      await tx.update(pools).set({ seatsTaken: 0 }).where(eq(pools.id, pool.id));
    }

    // Cash and TeslaPay are both simulated: record the settled amount.
    if (to === 'COMPLETED' && fares?.length) {
      const methods = await tx
        .select({ id: rideRequests.id, method: rideRequests.paymentMethod })
        .from(rideRequests)
        .where(
          inArray(
            rideRequests.id,
            fares.map((f) => f.rideId),
          ),
        );
      await tx.insert(payments).values(
        fares.map((f) => ({
          rideRequestId: f.rideId,
          method: methods.find((m) => m.id === f.rideId)!.method,
          amountPaisa: f.totalFarePaisa,
          status: 'PAID' as const,
        })),
      );
    }
  });
  return getPool(driverId, poolId);
}

const pickupZone = alias(zones, 'pickup_zone');
const dropoffZone = alias(zones, 'dropoff_zone');

// What the driver sees: who is riding, where each is going, and what each
// pays (Jashim collects the cash). Cancelled riders are listed so the driver
// knows who dropped out, but they hold no seat and pay nothing.
async function poolViews(poolIds: string[]) {
  if (poolIds.length === 0) return [];

  const poolRows = await db
    .select({
      id: pools.id,
      status: pools.status,
      capacity: pools.capacity,
      seatsTaken: pools.seatsTaken,
      pickupZone: { id: zones.id, name: zones.name },
      tesla: { name: vehicles.name, plateNo: vehicles.plateNo },
      createdAt: pools.createdAt,
      updatedAt: pools.updatedAt,
    })
    .from(pools)
    .innerJoin(zones, eq(zones.id, pools.pickupZoneId))
    .innerJoin(vehicles, eq(vehicles.id, pools.vehicleId))
    .where(inArray(pools.id, poolIds));

  const memberRows = await db
    .select({
      poolId: poolMembers.poolId,
      rideId: rideRequests.id,
      passengerName: users.name,
      status: rideRequests.status,
      seats: poolMembers.seats,
      paymentMethod: rideRequests.paymentMethod,
      dropoffZone: { id: dropoffZone.id, name: dropoffZone.name },
      pickupZone: { id: pickupZone.id, name: pickupZone.name },
      fare: {
        distanceM: poolMembers.distanceM,
        baseFarePaisa: poolMembers.baseFarePaisa,
        distanceChargePaisa: poolMembers.distanceChargePaisa,
        poolDiscountPaisa: poolMembers.poolDiscountPaisa,
        totalFarePaisa: poolMembers.totalFarePaisa,
      },
      joinedAt: poolMembers.joinedAt,
    })
    .from(poolMembers)
    .innerJoin(rideRequests, eq(rideRequests.id, poolMembers.rideRequestId))
    .innerJoin(users, eq(users.id, rideRequests.passengerId))
    .innerJoin(pickupZone, eq(pickupZone.id, rideRequests.pickupZoneId))
    .innerJoin(dropoffZone, eq(dropoffZone.id, rideRequests.dropoffZoneId))
    .where(inArray(poolMembers.poolId, poolIds))
    .orderBy(poolMembers.joinedAt);

  const byId = new Map(poolRows.map((p) => [p.id, p]));
  return poolIds
    .map((id) => byId.get(id))
    .filter((p) => p !== undefined)
    .map((p) => {
      const passengers = memberRows
        .filter((m) => m.poolId === p.id)
        .map(({ poolId: _poolId, ...m }) => m);
      const riding = passengers.filter((m) => m.status !== 'CANCELLED');
      return {
        ...p,
        seatsFree: p.capacity - p.seatsTaken,
        passengers,
        totalFarePaisa: riding.reduce((sum, m) => sum + m.fare.totalFarePaisa, 0),
      };
    });
}

export type DriverPoolView = Awaited<ReturnType<typeof poolViews>>[number];

async function vehicleOf(driverId: string) {
  const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.driverId, driverId));
  if (!vehicle) throw new HttpError(403, 'NO_TESLA', 'You have no Tesla');
  return vehicle;
}

export async function getPool(driverId: string, poolId: string) {
  const vehicle = await vehicleOf(driverId);
  const [pool] = await db
    .select({ id: pools.id })
    .from(pools)
    .where(and(eq(pools.id, poolId), eq(pools.vehicleId, vehicle.id)));
  if (!pool) throw notFound();

  const [view] = await poolViews([pool.id]);
  const timeline = await db
    .select({
      fromStatus: statusEvents.fromStatus,
      toStatus: statusEvents.toStatus,
      reason: statusEvents.reason,
      at: statusEvents.createdAt,
    })
    .from(statusEvents)
    .where(eq(statusEvents.poolId, pool.id))
    .orderBy(statusEvents.createdAt, statusEvents.id);
  return { ...view!, timeline };
}

export async function getCurrentPool(driverId: string) {
  const vehicle = await vehicleOf(driverId);
  const [pool] = await db
    .select({ id: pools.id })
    .from(pools)
    .where(
      and(
        eq(pools.vehicleId, vehicle.id),
        inArray(pools.status, ['ACCEPTED', 'DRIVER_ARRIVED', 'STARTED']),
      ),
    );
  if (!pool) return null;
  const [view] = await poolViews([pool.id]);
  return view ?? null;
}

// Keyset pagination on (created_at, id), same as passenger history.
export async function listPools(driverId: string, opts: { limit: number; before?: string }) {
  const vehicle = await vehicleOf(driverId);
  const rows = await db
    .select({ id: pools.id })
    .from(pools)
    .where(
      and(
        eq(pools.vehicleId, vehicle.id),
        opts.before
          ? sql`(${pools.createdAt}, ${pools.id}) < (
              SELECT created_at, id FROM pools WHERE id = ${opts.before} AND vehicle_id = ${vehicle.id})`
          : undefined,
      ),
    )
    .orderBy(desc(pools.createdAt), desc(pools.id))
    .limit(opts.limit + 1);

  const page = rows.slice(0, opts.limit);
  return {
    pools: await poolViews(page.map((r) => r.id)),
    nextCursor: rows.length > opts.limit ? (page.at(-1)?.id ?? null) : null,
  };
}
