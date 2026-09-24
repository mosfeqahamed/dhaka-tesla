import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../db/client.js';
import {
  poolStatus,
  pools,
  requestStatus,
  rideRequests,
  statusEvents,
  type PoolStatus,
  type RequestStatus,
} from '../../db/schema/index.js';
import { HttpError } from '../../lib/http-error.js';

// The two state machines from docs/ride-lifecycle.md. Anything not listed
// here is an invalid transition, full stop.
export const REQUEST_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  REQUESTED: ['MATCHED', 'CANCELLED'],
  MATCHED: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED'],
  STARTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const POOL_TRANSITIONS: Record<PoolStatus, readonly PoolStatus[]> = {
  ACCEPTED: ['DRIVER_ARRIVED', 'CANCELLED'],
  DRIVER_ARRIVED: ['STARTED', 'CANCELLED'],
  STARTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

// Sanity check at import time: every enum value has an entry.
for (const s of requestStatus.enumValues) if (!(s in REQUEST_TRANSITIONS)) throw new Error(s);
for (const s of poolStatus.enumValues) if (!(s in POOL_TRANSITIONS)) throw new Error(s);

export const canTransitionRequest = (from: RequestStatus, to: RequestStatus) =>
  REQUEST_TRANSITIONS[from].includes(to);

export const canTransitionPool = (from: PoolStatus, to: PoolStatus) =>
  POOL_TRANSITIONS[from].includes(to);

const invalid = (kind: string, from: string, to: string) =>
  new HttpError(409, 'INVALID_TRANSITION', `A ${kind} cannot go from ${from} to ${to}`, {
    from,
    to,
  });

interface TransitionArgs<S> {
  id: string;
  from: S;
  to: S;
  actorId: string | null; // null = system
  reason?: string;
  metadata?: Record<string, unknown>;
}

// Every request status change goes through here: checks the map, updates
// only if the row is still in `from` (so a concurrent change makes this a
// no-op instead of a lost update), and writes the audit event in the same
// transaction.
export async function transitionRequest(tx: Tx, args: TransitionArgs<RequestStatus>) {
  const { id, from, to, actorId, reason, metadata } = args;
  if (!canTransitionRequest(from, to)) throw invalid('ride', from, to);

  const [updated] = await tx
    .update(rideRequests)
    .set({ status: to })
    .where(and(eq(rideRequests.id, id), eq(rideRequests.status, from)))
    .returning();
  if (!updated) throw invalid('ride', `${from} (changed concurrently)`, to);

  await tx.insert(statusEvents).values({
    rideRequestId: id,
    fromStatus: from,
    toStatus: to,
    actorId,
    reason,
    metadata,
  });
  return updated;
}

export async function transitionPool(tx: Tx, args: TransitionArgs<PoolStatus>) {
  const { id, from, to, actorId, reason, metadata } = args;
  if (!canTransitionPool(from, to)) throw invalid('pool', from, to);

  const [updated] = await tx
    .update(pools)
    .set({ status: to })
    .where(and(eq(pools.id, id), eq(pools.status, from)))
    .returning();
  if (!updated) throw invalid('pool', `${from} (changed concurrently)`, to);

  await tx.insert(statusEvents).values({
    poolId: id,
    fromStatus: from,
    toStatus: to,
    actorId,
    reason,
    metadata,
  });
  return updated;
}
