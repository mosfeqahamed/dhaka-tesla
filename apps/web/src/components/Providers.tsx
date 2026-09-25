'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';

// A session that expires mid-use (401 on any call other than the /me probe)
// sends the user back to sign in instead of leaving broken screens.
function onError(err: unknown) {
  if (err instanceof ApiError && err.status === 401 && window.location.pathname !== '/login') {
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError }),
        mutationCache: new MutationCache({ onError }),
        defaultOptions: {
          queries: {
            // Don't retry what won't change: auth, permission, not-found, rule violations.
            retry: (count, err) =>
              !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
