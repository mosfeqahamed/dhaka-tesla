import type { RequestHandler } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/http-error.js';

// Replaces req.body with the parsed (trimmed, normalised) value, so handlers
// only ever see data that passed the schema.
export const validateBody =
  (schema: z.ZodType): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Request body is invalid',
        z.flattenError(result.error).fieldErrors,
      );
    }
    req.body = result.data;
    next();
  };
