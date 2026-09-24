import { and, desc, eq, max, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../db/client.js';
import {
  rideRequests,
  statusEvents,
  TERMINAL_STATUSES,
  users,
  vehicles,
  zones,
} from '../../db/schema/index.js';
import { HttpError } from '../../lib/http-error.js';
import { uniqueViolation } from '../../lib/pg-errors.js';
import { calculateFare } from '../fares/fare.js';
import { transitionRequest } from '../lifecycle/transitions.js';
import { distanceBetween } from '../zones/zones.service.js';
import type { CancelRideInput, CreateRideInput } from './rides.schemas.js';

const pickupZone = alias(zones, 'pickup_zone');
const dropoffZone = alias(zones, 'dropoff_zone');

// What a passenger sees about their own ride. Deliberately built from an
// explicit column list so nothing about other passengers can leak in.
const rideView = {
  id: rideRequests.id,
  status: rideRequests.status,
  seats: rideRequests.seats,
  paymentMethod: rideRequests.paymentMethod,
  estimatedFarePaisa: rideRequests.estimatedFarePaisa,
  pickupZone: { id: pickupZone.id, name: pickupZone.name },
  dropoffZone: { id: dropoffZone.id, name: dropoffZone.name },
  createdAt: rideRequests.createdAt,
  updatedAt: rideRequests.updatedAt,
};

const ridesQuery = () =>
  db
    .select(rideView)
    .from(rideRequests)
    .innerJoin(pickupZone, eq(pickupZone.id, rideRequests.pickupZoneId))
    .innerJoin(dropoffZone, eq(dropoffZone.id, rideRequests.dropoffZoneId));

export type RideView = Awaited<ReturnType<typeof ridesQuery>>[number];

const notFound = () => new HttpError(404, 'RIDE_NOT_FOUND', 'Ride not found');

// Other passengers' rides are 404, not 403: the API doesn't confirm they exist.
async function findOwnRide(passengerId: string, rideId: string) {
  const [ride] = await ridesQuery().where(
    and(eq(rideRequests.id, rideId), eq(rideRequests.passengerId, passengerId)),
  );
  if (!ride) throw notFound();
  return ride;
}

async function findByIdempotencyKey(passengerId: string, key: string) {
  const [row] = await db
    .select()
    .from(rideRequests)
    .where(and(eq(rideRequests.passengerId, passengerId), eq(rideRequests.idempotencyKey, key)));
  return row;
}

// A retried request (same key) returns the original ride. The same key with
// a different trip is a client bug, not a retry, so it's rejected.
async function replay(passengerId: string, key: string, input: CreateRideInput) {
  const existing = await findByIdempotencyKey(passengerId, key);
  if (!existing) return undefined;
  const sameTrip =
    existing.pickupZoneId === input.pickupZoneId &&
    existing.dropoffZoneId === input.dropoffZoneId &&
    existing.seats === input.seats &&
    existing.paymentMethod === input.paymentMethod;
  if (!sameTrip) {
    throw new HttpError(
      422,
      'IDEMPOTENCY_KEY_REUSED',
      'This Idempotency-Key was already used for a different ride request',
    );
  }
  return findOwnRide(passengerId, existing.id);
}

export async function createRide(
  passengerId: string,
  idempotencyKey: string,
  input: CreateRideInput,
): Promise<{ ride: RideView; replayed: boolean }> {
  const replayed = await replay(passengerId, idempotencyKey, input);
  if (replayed) return { ride: replayed, replayed: true };

  // No Tesla in the fleet could ever carry this many seats.
  const [{ largest } = { largest: null }] = await db
    .select({ largest: max(vehicles.capacity) })
    .from(vehicles);
  if (largest === null || input.seats > largest) {
    throw new HttpError(
      422,
      'SEATS_EXCEED_CAPACITY',
      `No Tesla can carry ${input.seats} passengers (largest has ${largest ?? 0} seats)`,
    );
  }

  const distanceM = await distanceBetween(db, input.pickupZoneId, input.dropoffZoneId);
  const estimate = calculateFare({ distanceM, seats: input.seats, pooled: false });

  try {
    const id = await db.transaction(async (tx) => {
      const [ride] = await tx
        .insert(rideRequests)
        .values({
          passengerId,
          idempotencyKey,
          pickupZoneId: input.pickupZoneId,
          dropoffZoneId: input.dropoffZoneId,
          seats: input.seats,
          paymentMethod: input.paymentMethod,
          estimatedFarePaisa: estimate.totalFarePaisa,
        })
        .returning({ id: rideRequests.id });
      await tx.insert(statusEvents).values({
        rideRequestId: ride!.id,
        fromStatus: null,
        toStatus: 'REQUESTED',
        actorId: passengerId,
        metadata: { estimate },
      });
      return ride!.id;
    });
    return { ride: await findOwnRide(passengerId, id), replayed: false };
  } catch (err) {
    const constraint = uniqueViolation(err);
    // Two copies of the same request raced; the other one won. Return it.
    if (constraint === 'ride_requests_passenger_idempotency_key') {
      const winner = await replay(passengerId, idempotencyKey, input);
      if (winner) return { ride: winner, replayed: true };
    }
    if (constraint === 'ride_requests_one_active_per_passenger') {
      throw new HttpError(
        409,
        'ACTIVE_RIDE_EXISTS',
        'You already have a ride in progress; cancel it or wait for it to finish',
      );
    }
    throw err;
  }
}

export async function getRide(passengerId: string, rideId: string) {
  const ride = await findOwnRide(passengerId, rideId);

  const events = await db
    .select({
      fromStatus: statusEvents.fromStatus,
      toStatus: statusEvents.toStatus,
      reason: statusEvents.reason,
      at: statusEvents.createdAt,
      actorId: statusEvents.actorId,
      actorRole: users.role,
    })
    .from(statusEvents)
    .leftJoin(users, eq(users.id, statusEvents.actorId))
    .where(eq(statusEvents.rideRequestId, rideId))
    .orderBy(statusEvents.createdAt, statusEvents.id);

  // Who did it, without exposing other users' ids to the passenger.
  const timeline = events.map(({ actorId, actorRole, ...e }) => ({
    ...e,
    by: actorId === null ? 'SYSTEM' : actorId === passengerId ? 'YOU' : (actorRole ?? 'SYSTEM'),
  }));

  return { ...ride, timeline };
}

export async function getCurrentRide(passengerId: string) {
  const [ride] = await ridesQuery()
    .where(
      and(
        eq(rideRequests.passengerId, passengerId),
        notInArray(rideRequests.status, [...TERMINAL_STATUSES]),
      ),
    )
    .limit(1);
  return ride ?? null;
}

// Keyset pagination: `before` is the id of the last ride on the previous page.
// Comparing (created_at, id) in SQL keeps microsecond precision and breaks
// ties, so no ride is skipped or repeated between pages.
export async function listRides(passengerId: string, opts: { limit: number; before?: string }) {
  const rides = await ridesQuery()
    .where(
      and(
        eq(rideRequests.passengerId, passengerId),
        opts.before
          ? sql`(${rideRequests.createdAt}, ${rideRequests.id}) < (
              SELECT created_at, id FROM ride_requests
              WHERE id = ${opts.before} AND passenger_id = ${passengerId})`
          : undefined,
      ),
    )
    .orderBy(desc(rideRequests.createdAt), desc(rideRequests.id))
    .limit(opts.limit + 1); // one extra tells us whether there's another page

  const page = rides.slice(0, opts.limit);
  return {
    rides: page,
    nextCursor: rides.length > opts.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function cancelRide(passengerId: string, rideId: string, input: CancelRideInput) {
  const ride = await findOwnRide(passengerId, rideId);

  await db.transaction(async (tx) => {
    // transitionRequest rejects anything the lifecycle doesn't allow
    // (e.g. STARTED -> CANCELLED) and anything that changed under us.
    await transitionRequest(tx, {
      id: ride.id,
      from: ride.status,
      to: 'CANCELLED',
      actorId: passengerId,
      reason: input.reason ?? 'Cancelled by passenger',
    });
  });

  return findOwnRide(passengerId, rideId);
}
