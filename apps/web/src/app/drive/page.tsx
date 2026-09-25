'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AvailabilityCard } from '@/components/drive/AvailabilityCard';
import { RequestList } from '@/components/drive/RequestList';
import { TripCard } from '@/components/drive/TripCard';
import { Alert, EmptyState, ErrorState, Loading } from '@/components/ui';
import { formatTaka } from '@/lib/format';
import { useDriverFeed, useMe } from '@/lib/queries';
import type { DriverPool } from '@/lib/types';

export default function DrivePage() {
  const { data: me } = useMe();
  const feed = useDriverFeed();
  const [justCompleted, setJustCompleted] = useState<DriverPool | null>(null);

  if (feed.isPending) return <Loading label="Loading your Tesla…" />;
  if (feed.error) return <ErrorState error={feed.error} onRetry={() => feed.refetch()} />;
  if (!me?.vehicle) return <EmptyState title="No Tesla on this account" />;

  const { online, zone, currentPool, requests } = feed.data;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Hi {me.name} 👋</h1>

      {justCompleted && !currentPool && (
        <Alert tone="success" title="Trip complete">
          {justCompleted.passengers.filter((p) => p.status === 'COMPLETED').length} riders dropped
          off · {formatTaka(justCompleted.totalFarePaisa)} collected.{' '}
          <Link href={`/drive/trips/${justCompleted.id}`} className="font-semibold underline">
            View trip
          </Link>
        </Alert>
      )}

      {/* key: remount when the server-side zone changes so the picker follows it */}
      <AvailabilityCard
        key={zone?.id ?? 'none'}
        vehicle={me.vehicle}
        online={online}
        zone={zone}
        tripActive={currentPool !== null}
      />

      {currentPool && <TripCard pool={currentPool} onCompleted={setJustCompleted} />}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          {currentPool ? 'More riders nearby' : 'Ride requests'}
          {zone && <span className="font-normal text-stone-500"> · {zone.name}</span>}
        </h2>
        {online ? (
          <RequestList requests={requests} pool={currentPool} zoneName={zone?.name} />
        ) : (
          <EmptyState title="You’re offline">
            Go online to see passengers waiting in your zone.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
