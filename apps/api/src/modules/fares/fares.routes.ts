import { Router } from 'express';
import { validateBody } from '../../middleware/validate.js';
import { tripSchema, type TripInput } from '../rides/rides.schemas.js';
import { estimateFare } from './fares.service.js';

export function faresRouter() {
  const router = Router();
  router.post('/estimate', validateBody(tripSchema), async (req, res) => {
    res.json({ estimate: await estimateFare(req.body as TripInput) });
  });
  return router;
}
