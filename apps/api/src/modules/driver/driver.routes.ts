import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { parseInput, validateBody } from '../../middleware/validate.js';
import { acceptRequest } from '../pools/pooling.service.js';
import * as trips from '../pools/trips.service.js';
import {
  cancelPoolSchema,
  driverStatusSchema,
  poolHistoryQuerySchema,
  type CancelPoolInput,
  type DriverStatusInput,
} from './driver.schemas.js';
import { requestFeed, setDriverStatus } from './driver.service.js';

const idParam = (raw: unknown, code: string, message: string) => {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) throw new HttpError(404, code, message);
  return parsed.data;
};
const rideId = (raw: unknown) => idParam(raw, 'RIDE_NOT_FOUND', 'Ride not found');
const poolId = (raw: unknown) => idParam(raw, 'POOL_NOT_FOUND', 'Trip not found');

// /driver: being available and picking up requests.
export function driverRouter() {
  const router = Router();
  router.use(requireAuth, requireRole('DRIVER'));

  router.patch('/status', validateBody(driverStatusSchema), async (req, res) => {
    res.json({
      vehicle: await setDriverStatus(authOf(req).userId, req.body as DriverStatusInput),
    });
  });

  router.get('/requests', async (req, res) => {
    res.json(await requestFeed(authOf(req).userId));
  });

  router.post('/requests/:id/accept', async (req, res) => {
    const driverId = authOf(req).userId;
    const id = await acceptRequest(driverId, rideId(req.params.id));
    res.json({ pool: await trips.getPool(driverId, id) });
  });

  return router;
}

// /pools: the trip Bullet is on, and the ones it has done.
export function poolsRouter() {
  const router = Router();
  router.use(requireAuth, requireRole('DRIVER'));

  router.get('/current', async (req, res) => {
    res.json({ pool: await trips.getCurrentPool(authOf(req).userId) });
  });

  router.get('/', async (req, res) => {
    const query = parseInput(poolHistoryQuerySchema, req.query);
    res.json(await trips.listPools(authOf(req).userId, query));
  });

  router.get('/:id', async (req, res) => {
    res.json({ pool: await trips.getPool(authOf(req).userId, poolId(req.params.id)) });
  });

  for (const action of ['arrive', 'start', 'complete'] as const) {
    router.post(`/:id/${action}`, async (req, res) => {
      res.json({
        pool: await trips.advancePool(authOf(req).userId, poolId(req.params.id), action),
      });
    });
  }

  router.post('/:id/cancel', validateBody(cancelPoolSchema), async (req, res) => {
    const { reason } = req.body as CancelPoolInput;
    res.json({
      pool: await trips.advancePool(authOf(req).userId, poolId(req.params.id), 'cancel', reason),
    });
  });

  return router;
}
