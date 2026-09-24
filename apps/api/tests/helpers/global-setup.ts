import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

// Create the test database if needed and bring it to the latest migration.
export default async function setup(project: TestProject) {
  const testUrl = new URL(project.config.env.DATABASE_URL as string);
  const dbName = testUrl.pathname.slice(1);

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  await admin.end();

  const pool = new pg.Pool({ connectionString: testUrl.toString() });
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  await pool.end();
}
