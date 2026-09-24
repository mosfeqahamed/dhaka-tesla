import type { RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';

// Parse untrusted input or throw a 400 listing the invalid fields.
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request is invalid',
      z.flattenError(result.error).fieldErrors,
    );
  }
  return result.data;
}

// Replaces req.body with the parsed (trimmed, normalised) value, so handlers
// only ever see data that passed the schema. (req.query is read-only in
// Express 5, so query strings are parsed in the handler with parseInput.)
export const validateBody =
  (schema: z.ZodType): RequestHandler =>
  (req, _res, next) => {
    req.body = parseInput(schema, req.body ?? {});
    next();
  };
