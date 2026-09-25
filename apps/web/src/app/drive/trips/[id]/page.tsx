'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PassengerList } from '@/components/drive/PassengerList';
import { Timeline } from '@/components/ride/Timeline';
import { Badge, Card, EmptyState, ErrorState, Loading } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { formatDateTime, formatTaka } from '@/lib/format';
import { usePool } from '@/lib/queries';
import { POOL_STATUS_LABEL } from '@/lib/status';

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const pool = usePool(id);

  return (
    <div className="space-y-5">
      <Link href="/drive/history" className="text-sm text-stone-600 hover:underline">
        ← All trips
      </Link>
      {pool.isPending ? (
        <Loading />
      ) : pool.error instanceof ApiError && pool.error.status === 404 ? (
        <EmptyState title="Trip not found">
          It may belong to another Tesla, or the link is wrong.
        </EmptyState>
      ) : pool.error ? (
        <ErrorState error={pool.error} onRetry={() => pool.refetch()} />
      ) : (
        <>
          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-stone-500">{formatDateTime(pool.data.createdAt)}</p>
                <h2 className="text-lg font-bold">
                  {pool.data.tesla.name} from {pool.data.pickupZone.name}
                </h2>
              </div>
              <Badge tone={pool.data.status === 'COMPLETED' ? 'success' : 'muted'}>
                {POOL_STATUS_LABEL[pool.data.status]}
              </Badge>
            </div>
            <PassengerList passengers={pool.data.passengers} />
            <div className="flex justify-between border-t border-stone-200 pt-3 font-bold">
              <span>{pool.data.status === 'COMPLETED' ? 'Collected' : 'Total'}</span>
              <span>{formatTaka(pool.data.totalFarePaisa)}</span>
            </div>
          </Card>
          {pool.data.timeline && pool.data.timeline.length > 0 && (
            <Card>
              <h2 className="mb-4 font-bold">What happened</h2>
              <Timeline events={pool.data.timeline} labels={POOL_STATUS_LABEL} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
