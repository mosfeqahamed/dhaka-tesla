import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { parseInput, validateBody } from '../../middleware/validate.js';
import {
  cancelRideSchema,
  createRideSchema,
  historyQuerySchema,
  idempotencyKeySchema,
  type CancelRideInput,
  type CreateRideInput,
} from './rides.schemas.js';
import * as rides from './rides.service.js';

// A malformed id can't belong to anyone, so it's a 404 like any other miss.
const rideId = (raw: unknown) => {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw new HttpError(404, 'RIDE_NOT_FOUND', 'Ride not found');
  return parsed.data;
};

export function ridesRouter() {
  const router = Router();
  router.use(requireAuth, requireRole('PASSENGER'));

  router.post('/', validateBody(createRideSchema), async (req, res) => {
    const header = req.get('Idempotency-Key');
    if (!header) {
      throw new HttpError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Send an Idempotency-Key header (a UUID) so retries never book twice',
      );
    }
    const key = parseInput(idempotencyKeySchema, header);
    const { ride, replayed } = await rides.createRide(
      authOf(req).userId,
      key,
      req.body as CreateRideInput,
    );
    res.status(replayed ? 200 : 201).json({ ride, replayed });
  });

  router.get('/current', async (req, res) => {
    res.json({ ride: await rides.getCurrentRide(authOf(req).userId) });
  });

  router.get('/', async (req, res) => {
    const query = parseInput(historyQuerySchema, req.query);
    res.json(await rides.listRides(authOf(req).userId, query));
  });

  router.get('/:id', async (req, res) => {
    res.json({ ride: await rides.getRide(authOf(req).userId, rideId(req.params.id)) });
  });

  router.post('/:id/cancel', validateBody(cancelRideSchema), async (req, res) => {
    const ride = await rides.cancelRide(
      authOf(req).userId,
      rideId(req.params.id),
      req.body as CancelRideInput,
    );
    res.json({ ride });
  });

  return router;
}
