// Thin fetch wrapper. Every call goes to /api/* on this origin (proxied to the
// Express API), and every failure becomes an ApiError carrying the API's
// stable error `code`, so components branch on codes, never on message text.

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
}

export async function api<T>(path: string, { method = 'GET', body, headers }: ApiOptions = {}) {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK',
      'Can’t reach Dhaka Tesla Pool. Check your connection and try again.',
    );
  }

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const error = json?.error;
    throw new ApiError(
      res.status,
      error?.code ?? `HTTP_${res.status}`,
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
    );
  }
  return json as T;
}
