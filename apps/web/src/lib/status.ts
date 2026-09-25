import type { PoolStatus, RideStatus } from './types';

export const RIDE_STEPS: { status: RideStatus; label: string }[] = [
  { status: 'REQUESTED', label: 'Finding a Tesla' },
  { status: 'MATCHED', label: 'Tesla on the way' },
  { status: 'DRIVER_ARRIVED', label: 'Driver has arrived' },
  { status: 'STARTED', label: 'On the road' },
  { status: 'COMPLETED', label: 'Arrived' },
];

export const STATUS_LABEL: Record<RideStatus, string> = {
  REQUESTED: 'Waiting for a Tesla',
  MATCHED: 'Matched',
  DRIVER_ARRIVED: 'Driver arrived',
  STARTED: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const isFinished = (s: RideStatus) => s === 'COMPLETED' || s === 'CANCELLED';

// Mirrors the API's rule: passengers can cancel until the trip starts.
export const canCancel = (s: RideStatus) =>
  s === 'REQUESTED' || s === 'MATCHED' || s === 'DRIVER_ARRIVED';

export const stepIndex = (s: RideStatus) => RIDE_STEPS.findIndex((step) => step.status === s);

export const POOL_STATUS_LABEL: Record<PoolStatus, string> = {
  ACCEPTED: 'Heading to pickup',
  DRIVER_ARRIVED: 'At pickup',
  STARTED: 'On the road',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

// The one button the driver needs next, per trip stage.
export const NEXT_POOL_ACTION: Partial<
  Record<PoolStatus, { action: 'arrive' | 'start' | 'complete'; label: string }>
> = {
  ACCEPTED: { action: 'arrive', label: 'I’ve arrived at pickup' },
  DRIVER_ARRIVED: { action: 'start', label: 'Start trip' },
  STARTED: { action: 'complete', label: 'Complete trip' },
};

// Mirrors the API: a trip can be cancelled until it starts.
export const canCancelPool = (s: PoolStatus) => s === 'ACCEPTED' || s === 'DRIVER_ARRIVED';

// New riders can join only while the Tesla is still heading to pickup.
export const poolTakesRiders = (s: PoolStatus) => s === 'ACCEPTED';
