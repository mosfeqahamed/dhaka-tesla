import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { paymentMethod, paymentStatus, poolStatus, requestStatus } from './enums.js';
import { zones } from './geography.js';
import { users, vehicles } from './users.js';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// One passenger's trip; holds the per-passenger status.
export const rideRequests = pgTable(
  'ride_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passengerId: uuid('passenger_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    pickupZoneId: smallint('pickup_zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'restrict' }),
    dropoffZoneId: smallint('dropoff_zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'restrict' }),
    seats: smallint('seats').notNull(),
    status: requestStatus('status').notNull().default('REQUESTED'),
    paymentMethod: paymentMethod('payment_method').notNull().default('CASH'),
    estimatedFarePaisa: integer('estimated_fare_paisa').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('ride_requests_seats_positive', sql`${t.seats} >= 1`),
    check('ride_requests_distinct_zones', sql`${t.pickupZoneId} <> ${t.dropoffZoneId}`),
    check('ride_requests_fare_non_negative', sql`${t.estimatedFarePaisa} >= 0`),
    unique('ride_requests_passenger_idempotency_key').on(t.passengerId, t.idempotencyKey),
    // A passenger has at most one ride in flight.
    uniqueIndex('ride_requests_one_active_per_passenger')
      .on(t.passengerId)
      .where(sql`${t.status} NOT IN ('COMPLETED', 'CANCELLED')`),
    index('ride_requests_status_pickup_idx').on(t.status, t.pickupZoneId),
    index('ride_requests_passenger_created_idx').on(t.passengerId, t.createdAt),
  ],
);

// One trip of one Tesla from one pickup zone; holds the per-trip status.
// seats_taken is the row every seat claim locks (SELECT ... FOR UPDATE).
export const pools = pgTable(
  'pools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'restrict' }),
    pickupZoneId: smallint('pickup_zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'restrict' }),
    status: poolStatus('status').notNull().default('ACCEPTED'),
    capacity: smallint('capacity').notNull(),
    seatsTaken: smallint('seats_taken').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('pools_capacity_positive', sql`${t.capacity} > 0`),
    check('pools_seats_within_capacity', sql`${t.seatsTaken} BETWEEN 0 AND ${t.capacity}`),
    // A Tesla runs at most one pool at a time.
    uniqueIndex('pools_one_active_per_vehicle')
      .on(t.vehicleId)
      .where(sql`${t.status} NOT IN ('COMPLETED', 'CANCELLED')`),
    index('pools_status_pickup_idx').on(t.status, t.pickupZoneId),
    index('pools_vehicle_created_idx').on(t.vehicleId, t.createdAt),
  ],
);

// A request's seat in a pool, with its fare breakdown. distance_m is a
// snapshot so the fare stays explainable if zone distances change later.
export const poolMembers = pgTable(
  'pool_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    poolId: uuid('pool_id')
      .notNull()
      .references(() => pools.id, { onDelete: 'restrict' }),
    rideRequestId: uuid('ride_request_id')
      .notNull()
      .unique()
      .references(() => rideRequests.id, { onDelete: 'restrict' }),
    seats: smallint('seats').notNull(),
    distanceM: integer('distance_m').notNull(),
    baseFarePaisa: integer('base_fare_paisa').notNull(),
    distanceChargePaisa: integer('distance_charge_paisa').notNull(),
    poolDiscountPaisa: integer('pool_discount_paisa').notNull().default(0),
    totalFarePaisa: integer('total_fare_paisa').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('pool_members_seats_positive', sql`${t.seats} >= 1`),
    check('pool_members_distance_positive', sql`${t.distanceM} > 0`),
    check(
      'pool_members_fare_components_non_negative',
      sql`${t.baseFarePaisa} >= 0 AND ${t.distanceChargePaisa} >= 0 AND ${t.poolDiscountPaisa} >= 0`,
    ),
    check(
      'pool_members_fare_adds_up',
      sql`${t.totalFarePaisa} = ${t.baseFarePaisa} + ${t.distanceChargePaisa} - ${t.poolDiscountPaisa}`,
    ),
    index('pool_members_pool_idx').on(t.poolId),
  ],
);

// Append-only audit log: one row per transition, written in the same
// transaction as the transition itself.
export const statusEvents = pgTable(
  'status_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    rideRequestId: uuid('ride_request_id').references(() => rideRequests.id, {
      onDelete: 'restrict',
    }),
    poolId: uuid('pool_id').references(() => pools.id, { onDelete: 'restrict' }),
    fromStatus: varchar('from_status', { length: 32 }),
    toStatus: varchar('to_status', { length: 32 }).notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'restrict' }), // null = system
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    check('status_events_one_entity', sql`num_nonnulls(${t.rideRequestId}, ${t.poolId}) = 1`),
    index('status_events_request_created_idx').on(t.rideRequestId, t.createdAt),
    index('status_events_pool_created_idx').on(t.poolId, t.createdAt),
  ],
);

// Simulated settlement (Cash or TeslaPay), one per completed request.
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rideRequestId: uuid('ride_request_id')
      .notNull()
      .unique()
      .references(() => rideRequests.id, { onDelete: 'restrict' }),
    method: paymentMethod('method').notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    status: paymentStatus('status').notNull().default('PENDING'),
    createdAt: createdAt(),
  },
  (t) => [check('payments_amount_non_negative', sql`${t.amountPaisa} >= 0`)],
);
