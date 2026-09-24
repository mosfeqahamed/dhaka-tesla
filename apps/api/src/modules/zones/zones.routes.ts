import { Router } from 'express';
import { listZones } from './zones.service.js';

export function zonesRouter() {
  const router = Router();
  router.get('/', async (_req, res) => {
    res.json({ zones: await listZones() });
  });
  return router;
}
