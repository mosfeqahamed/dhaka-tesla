import { z } from 'zod';

// Fail fast on boot if the environment is misconfigured, instead of
// discovering it on the first request.
const PLACEHOLDER_SECRET = 'replace-with-a-long-random-string';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_TTL_HOURS: z.coerce.number().int().positive().default(12),
    // Number of reverse proxies in front of the API (Render/Next.js rewrite = 1),
    // so rate limiting sees the real client IP instead of the proxy's.
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    // Failed sign-in/sign-up attempts allowed per IP per 15 minutes.
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.JWT_SECRET !== PLACEHOLDER_SECRET, {
    path: ['JWT_SECRET'],
    message: 'JWT_SECRET is still the .env.example placeholder',
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
