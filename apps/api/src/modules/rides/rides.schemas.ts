import { z } from 'zod';
import { paymentMethod } from '../../db/schema/index.js';

const zoneId = z.coerce.number().int().positive();

const tripShape = {
  pickupZoneId: zoneId,
  dropoffZoneId: zoneId,
  seats: z.coerce.number().int().min(1).max(10).default(1),
};

const differentZones = {
  check: (t: { pickupZoneId: number; dropoffZoneId: number }) => t.pickupZoneId !== t.dropoffZoneId,
  params: { path: ['dropoffZoneId'], message: 'Dropoff must be a different zone from pickup' },
};

// The fare estimate and the ride request share one shape, so the estimate a
// passenger sees was validated exactly like the ride they then book.
export const tripSchema = z
  .strictObject(tripShape)
  .refine(differentZones.check, differentZones.params);

export const createRideSchema = z
  .strictObject({ ...tripShape, paymentMethod: z.enum(paymentMethod.enumValues).default('CASH') })
  .refine(differentZones.check, differentZones.params);

export const idempotencyKeySchema = z.uuid('Idempotency-Key header must be a UUID');

export const cancelRideSchema = z.strictObject({
  reason: z.string().trim().max(200).optional(),
});

export const historyQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.uuid().optional(), // cursor: id of the last ride on the previous page
});

export type TripInput = z.infer<typeof tripSchema>;
export type CreateRideInput = z.infer<typeof createRideSchema>;
export type CancelRideInput = z.infer<typeof cancelRideSchema>;
