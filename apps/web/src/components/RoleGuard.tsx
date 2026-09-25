'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useMe } from '@/lib/queries';
import type { Role } from '@/lib/types';
import { ErrorState, Loading } from './ui';

export const homeFor = (role: Role) => (role === 'DRIVER' ? '/drive' : '/ride');

// UX only: sends people to the right screen. The API enforces every rule
// (401/403/404) regardless of what the browser shows.
export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const { data: me, isPending, error, refetch } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (me === null) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    else if (me && me.role !== role) router.replace(homeFor(me.role));
  }, [me, role, router]);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (isPending || !me || me.role !== role) return <Loading />;
  return <>{children}</>;
}
