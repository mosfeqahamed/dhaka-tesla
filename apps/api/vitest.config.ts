import { defineConfig } from 'vitest/config';

// Tests run against a real Postgres, in a separate `<db>_test` database on the
// same server so they never touch dev data. CI can set DATABASE_URL directly.
try {
  process.loadEnvFile('../../.env');
} catch {
  // no .env file: rely on the environment
}

const devUrl = new URL(
  process.env.DATABASE_URL ?? 'postgres://tesla:tesla@localhost:5432/dhaka_tesla',
);
const testUrl = new URL(devUrl);
if (!testUrl.pathname.endsWith('_test')) testUrl.pathname = `${testUrl.pathname}_test`;

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/helpers/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testUrl.toString(),
      SEED_PASSWORD: 'test-password',
      JWT_SECRET: 'test-only-secret-that-is-at-least-32-characters-long',
    },
    // Test files share one database; run them one at a time.
    fileParallelism: false,
  },
});
