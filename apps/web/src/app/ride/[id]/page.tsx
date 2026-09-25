'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { RideStatusCard } from '@/components/ride/RideStatusCard';
import { Timeline } from '@/components/ride/Timeline';
import { Card, EmptyState, ErrorState, Loading } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useRide } from '@/lib/queries';

export default function RideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const ride = useRide(id);

  return (
    <div className="space-y-5">
      <Link href="/ride/history" className="text-sm text-stone-600 hover:underline">
        ← All rides
      </Link>
      {ride.isPending ? (
        <Loading />
      ) : ride.error instanceof ApiError && ride.error.status === 404 ? (
        <EmptyState title="Ride not found">
          It may belong to another account, or the link is wrong.
        </EmptyState>
      ) : ride.error ? (
        <ErrorState error={ride.error} onRetry={() => ride.refetch()} />
      ) : (
        <>
          <RideStatusCard ride={ride.data} />
          {ride.data.timeline && ride.data.timeline.length > 0 && (
            <Card>
              <h2 className="mb-4 font-bold">What happened</h2>
              <Timeline events={ride.data.timeline} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
