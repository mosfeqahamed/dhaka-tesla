import { Router } from 'express';
import { pingDb } from '../db/client.js';

export const healthRouter = Router();

// Used by the Docker healthcheck and the hosting platform: 503 when the
// database is unreachable so traffic isn't routed to a broken instance.
healthRouter.get('/', async (_req, res) => {
  const dbUp = await pingDb();
  res.status(dbUp ? 200 : 503).json({
    status: dbUp ? 'ok' : 'degraded',
    db: dbUp ? 'up' : 'down',
    uptimeSeconds: Math.round(process.uptime()),
  });
});
