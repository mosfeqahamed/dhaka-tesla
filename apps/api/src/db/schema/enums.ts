import { pgEnum } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['PASSENGER', 'DRIVER']);

export const driverStatus = pgEnum('driver_status', ['ONLINE', 'OFFLINE']);

// Per-passenger lifecycle. See docs/ride-lifecycle.md.
export const requestStatus = pgEnum('request_status', [
  'REQUESTED',
  'MATCHED',
  'DRIVER_ARRIVED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
]);

// Per-Tesla-trip lifecycle. See docs/ride-lifecycle.md.
export const poolStatus = pgEnum('pool_status', [
  'ACCEPTED',
  'DRIVER_ARRIVED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
]);

export const paymentMethod = pgEnum('payment_method', ['CASH', 'TESLAPAY']);

export const paymentStatus = pgEnum('payment_status', ['PENDING', 'PAID']);

export type UserRole = (typeof userRole.enumValues)[number];
export type RequestStatus = (typeof requestStatus.enumValues)[number];
export type PoolStatus = (typeof poolStatus.enumValues)[number];
export type PaymentMethod = (typeof paymentMethod.enumValues)[number];

// Statuses after which a request/pool no longer holds a seat or a Tesla.
export const TERMINAL_STATUSES = ['COMPLETED', 'CANCELLED'] as const;
