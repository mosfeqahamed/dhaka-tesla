import { Router } from 'express';

export const healthRouter = Router();

// Liveness only for now; a DB connectivity check is added with the schema.
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});
