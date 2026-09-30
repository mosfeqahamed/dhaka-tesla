import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Boots the env module in a child process with a given environment and
// reports whether it accepted it. (env.ts exits the process on bad config.)
function boot(overrides: Record<string, string | undefined>) {
  const env = {
    PATH: process.env.PATH,
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    JWT_SECRET: 'a-real-secret-that-is-long-enough-to-pass-validation',
    ...overrides,
  };
  const r = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '-e',
      "import('./src/config/env.ts').then(m => console.log(JSON.stringify(m.env)))",
    ],
    { env: env as NodeJS.ProcessEnv, encoding: 'utf8' },
  );
  return { ok: r.status === 0, out: r.stdout, err: r.stderr };
}

describe('environment configuration', () => {
  it('refuses the placeholder secret on an HTTPS deployment', () => {
    const r = boot({ NODE_ENV: 'production', JWT_SECRET: 'replace-with-a-long-random-string' });
    expect(r.ok).toBe(false);
    expect(r.err).toContain('JWT_SECRET');
  });

  it('allows it for a plain-http local run, with a warning', () => {
    const r = boot({
      NODE_ENV: 'production',
      COOKIE_SECURE: 'false',
      JWT_SECRET: 'replace-with-a-long-random-string',
    });
    expect(r.ok).toBe(true);
    expect(r.err).toContain('WARNING');
  });

  it('makes cookies Secure by default in production', () => {
    const r = boot({ NODE_ENV: 'production' });
    expect(JSON.parse(r.out).COOKIE_SECURE).toBe(true);
  });

  it('rejects a short secret anywhere', () => {
    expect(boot({ JWT_SECRET: 'too-short' }).ok).toBe(false);
  });
});
