import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { logger } from './lib/logger.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';

// Built as a factory so tests can mount the app without opening a port.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use('/health', healthRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
