'use client';

import { BookRideForm } from '@/components/ride/BookRideForm';
import { RideDetailsLink, RideStatusCard } from '@/components/ride/RideStatusCard';
import { ErrorState, Loading } from '@/components/ui';
import { useCurrentRide, useMe } from '@/lib/queries';

export default function RidePage() {
  const { data: me } = useMe();
  const current = useCurrentRide();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Hi {me?.name} 👋</h1>
      {current.isPending ? (
        <Loading label="Checking for a ride in progress…" />
      ) : current.error ? (
        <ErrorState error={current.error} onRetry={() => current.refetch()} />
      ) : current.data ? (
        <>
          <RideStatusCard ride={current.data} />
          <div className="text-center">
            <RideDetailsLink id={current.data.id} />
          </div>
        </>
      ) : (
        <BookRideForm />
      )}
    </div>
  );
}
