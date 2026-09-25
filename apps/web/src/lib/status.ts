import type { RideStatus } from './types';

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
