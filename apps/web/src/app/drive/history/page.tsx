'use client';

import { PoolListItem } from '@/components/drive/PoolListItem';
import { Button, EmptyState, ErrorState, Loading } from '@/components/ui';
import { usePoolHistory } from '@/lib/queries';

export default function DriveHistoryPage() {
  const history = usePoolHistory();
  const pools = history.data?.pages.flatMap((p) => p.pools) ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Your trips</h1>
      {history.isPending ? (
        <Loading />
      ) : history.error ? (
        <ErrorState error={history.error} onRetry={() => history.refetch()} />
      ) : pools.length === 0 ? (
        <EmptyState title="No trips yet">
          Accept a ride request and it will show up here.
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-2">
            {pools.map((p) => (
              <PoolListItem key={p.id} pool={p} />
            ))}
          </ul>
          {history.hasNextPage && (
            <Button
              variant="secondary"
              className="w-full"
              loading={history.isFetchingNextPage}
              onClick={() => history.fetchNextPage()}
            >
              Load older trips
            </Button>
          )}
        </>
      )}
    </div>
  );
}
