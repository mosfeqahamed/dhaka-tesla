import { z } from 'zod';

export const driverStatusSchema = z.strictObject({
  status: z.enum(['ONLINE', 'OFFLINE']),
  zoneId: z.coerce.number().int().positive().optional(),
});

export const cancelPoolSchema = z.strictObject({
  reason: z.string().trim().max(200).optional(),
});

export const poolHistoryQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.uuid().optional(),
});

export type DriverStatusInput = z.infer<typeof driverStatusSchema>;
export type CancelPoolInput = z.infer<typeof cancelPoolSchema>;
