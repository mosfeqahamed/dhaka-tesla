import { defineConfig } from 'drizzle-kit';

// `generate` only diffs the TS schema against ./drizzle and needs no database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
});
