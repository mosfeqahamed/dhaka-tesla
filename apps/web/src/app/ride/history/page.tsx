'use client';

import { RideListItem } from '@/components/ride/RideListItem';
import { Button, EmptyState, ErrorState, Loading } from '@/components/ui';
import { useRideHistory } from '@/lib/queries';

export default function RideHistoryPage() {
  const history = useRideHistory();
  const rides = history.data?.pages.flatMap((p) => p.rides) ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Your rides</h1>
      {history.isPending ? (
        <Loading />
      ) : history.error ? (
        <ErrorState error={history.error} onRetry={() => history.refetch()} />
      ) : rides.length === 0 ? (
        <EmptyState title="No rides yet">
          Your trips will show up here once you book one.
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-2">
            {rides.map((r) => (
              <RideListItem key={r.id} ride={r} />
            ))}
          </ul>
          {history.hasNextPage && (
            <Button
              variant="secondary"
              className="w-full"
              loading={history.isFetchingNextPage}
              onClick={() => history.fetchNextPage()}
            >
              Load older rides
            </Button>
          )}
        </>
      )}
    </div>
  );
}
