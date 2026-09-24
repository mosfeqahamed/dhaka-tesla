import type { AuthClaims } from '../lib/token.js';

declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth; absent on public routes.
      auth?: AuthClaims;
    }
  }
}

export {};
