import Link from 'next/link';
import { Badge } from '@/components/ui';
import { formatDateTime, formatTaka } from '@/lib/format';
import { POOL_STATUS_LABEL } from '@/lib/status';
import type { DriverPool } from '@/lib/types';

export function PoolListItem({ pool }: { pool: DriverPool }) {
  const riders = pool.passengers.filter((p) => p.status !== 'CANCELLED');
  return (
    <li>
      <Link
        href={`/drive/trips/${pool.id}`}
        className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white px-4 py-3 hover:border-brand-500"
      >
        <div className="min-w-0">
          <p className="truncate font-semibold">
            From {pool.pickupZone.name} ·{' '}
            {riders.length ? riders.map((p) => p.passengerName).join(', ') : 'no riders'}
          </p>
          <p className="text-xs text-stone-500">{formatDateTime(pool.createdAt)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold">{formatTaka(pool.totalFarePaisa)}</p>
          <Badge
            tone={
              pool.status === 'COMPLETED'
                ? 'success'
                : pool.status === 'CANCELLED'
                  ? 'muted'
                  : 'brand'
            }
          >
            {POOL_STATUS_LABEL[pool.status]}
          </Badge>
        </div>
      </Link>
    </li>
  );
}
