import { and, asc, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../db/client.js';
import { pools, rideRequests, users, vehicles, zones } from '../../db/schema/index.js';
import { HttpError } from '../../lib/http-error.js';
import { getCurrentPool } from '../pools/trips.service.js';

const ACTIVE_POOL = ['ACCEPTED', 'DRIVER_ARRIVED', 'STARTED'] as const;

export async function setDriverStatus(
  driverId: string,
  input: { status: 'ONLINE' | 'OFFLINE'; zoneId?: number },
) {
  return db.transaction(async (tx) => {
    // Same lock acceptRequest takes, so going offline can't slip in between
    // Jashim's accept and the pool being created.
    const [vehicle] = await tx
      .select()
      .from(vehicles)
      .where(eq(vehicles.driverId, driverId))
      .for('update');
    if (!vehicle) throw new HttpError(403, 'NO_TESLA', 'You have no Tesla');

    const zoneId = input.zoneId ?? vehicle.currentZoneId;
    if (input.status === 'ONLINE' && zoneId === null) {
      throw new HttpError(400, 'ZONE_REQUIRED', 'Choose the zone you are waiting in');
    }

    const [activePool] = await tx
      .select({ id: pools.id })
      .from(pools)
      .where(and(eq(pools.vehicleId, vehicle.id), inArray(pools.status, [...ACTIVE_POOL])));
    // Passengers are counting on this Tesla: it can't vanish or move mid-trip.
    if (activePool && (input.status === 'OFFLINE' || zoneId !== vehicle.currentZoneId)) {
      throw new HttpError(
        409,
        'ACTIVE_TRIP',
        'Finish or cancel your current trip before going offline or changing zone',
      );
    }

    if (zoneId !== null) {
      const [zone] = await tx.select({ id: zones.id }).from(zones).where(eq(zones.id, zoneId));
      if (!zone) throw new HttpError(422, 'UNKNOWN_ZONE', 'That is not a known zone');
    }

    const [updated] = await tx
      .update(vehicles)
      .set({ driverStatus: input.status, currentZoneId: zoneId })
      .where(eq(vehicles.id, vehicle.id))
      .returning({
        driverStatus: vehicles.driverStatus,
        currentZoneId: vehicles.currentZoneId,
      });
    return updated!;
  });
}

const dropoffZone = alias(zones, 'dropoff_zone');

// Waiting requests in the zone Jashim is parked in, oldest first - the
// people who have waited longest are at the top.
export async function requestFeed(driverId: string) {
  const [vehicle] = await db
    .select({
      id: vehicles.id,
      driverStatus: vehicles.driverStatus,
      currentZoneId: vehicles.currentZoneId,
      zoneName: zones.name,
    })
    .from(vehicles)
    .leftJoin(zones, eq(zones.id, vehicles.currentZoneId))
    .where(eq(vehicles.driverId, driverId));
  if (!vehicle) throw new HttpError(403, 'NO_TESLA', 'You have no Tesla');

  const zone =
    vehicle.currentZoneId === null ? null : { id: vehicle.currentZoneId, name: vehicle.zoneName };
  const currentPool = await getCurrentPool(driverId);

  if (vehicle.driverStatus !== 'ONLINE' || vehicle.currentZoneId === null) {
    return { online: false, zone, currentPool, requests: [] };
  }

  const requests = await db
    .select({
      id: rideRequests.id,
      passengerName: users.name,
      seats: rideRequests.seats,
      dropoffZone: { id: dropoffZone.id, name: dropoffZone.name },
      estimatedFarePaisa: rideRequests.estimatedFarePaisa,
      paymentMethod: rideRequests.paymentMethod,
      waitingSince: rideRequests.createdAt,
    })
    .from(rideRequests)
    .innerJoin(users, eq(users.id, rideRequests.passengerId))
    .innerJoin(dropoffZone, eq(dropoffZone.id, rideRequests.dropoffZoneId))
    .where(
      and(
        eq(rideRequests.status, 'REQUESTED'),
        eq(rideRequests.pickupZoneId, vehicle.currentZoneId),
      ),
    )
    .orderBy(asc(rideRequests.createdAt))
    .limit(50);

  return { online: true, zone, currentPool, requests };
}
