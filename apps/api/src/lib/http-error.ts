// Errors thrown from services/routes carry a stable machine-readable code
// (e.g. POOL_FULL) so the frontend can branch on it without parsing messages.
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
