import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, db } from './client.js';
import { logger } from '../lib/logger.js';

// Resolves to apps/api/drizzle from both src/db (tsx) and dist/db (node),
// so the production image runs migrations without drizzle-kit installed.
export const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
);

async function main() {
  logger.info({ migrationsFolder }, 'running migrations');
  await migrate(db, { migrationsFolder });
  logger.info('migrations complete');
}

main()
  .catch((err) => {
    logger.error({ err }, 'migration failed');
    process.exitCode = 1;
  })
  .finally(closeDb);
