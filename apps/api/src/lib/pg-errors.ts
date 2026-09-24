// Drizzle wraps driver errors in DrizzleQueryError; the Postgres error with
// the SQLSTATE code and constraint name is on `cause`.
interface PgError {
  code?: string;
  constraint?: string;
}

function pgError(err: unknown): PgError | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const cause = (err as { cause?: unknown }).cause;
  const candidate = (typeof cause === 'object' && cause !== null ? cause : err) as PgError;
  return typeof candidate.code === 'string' ? candidate : undefined;
}

export function uniqueViolation(err: unknown): string | undefined {
  const e = pgError(err);
  return e?.code === '23505' ? e.constraint : undefined;
}
