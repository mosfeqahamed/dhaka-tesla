'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { homeFor } from '@/components/RoleGuard';
import { ErrorState, Loading } from '@/components/ui';
import { useMe } from '@/lib/queries';

export default function Home() {
  const { data: me, error, refetch } = useMe();
  const router = useRouter();

  useEffect(() => {
    if (me === null) router.replace('/login');
    else if (me) router.replace(homeFor(me.role));
  }, [me, router]);

  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  return <Loading />;
}
