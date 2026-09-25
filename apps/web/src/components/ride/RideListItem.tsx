import Link from 'next/link';
import { Badge } from '@/components/ui';
import { formatDateTime, formatTaka } from '@/lib/format';
import { STATUS_LABEL } from '@/lib/status';
import type { Ride } from '@/lib/types';

export function RideListItem({ ride }: { ride: Ride }) {
  const amount = ride.fare?.totalFarePaisa ?? ride.estimatedFarePaisa;
  return (
    <li>
      <Link
        href={`/ride/${ride.id}`}
        className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white px-4 py-3 hover:border-brand-500"
      >
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {ride.pickupZone.name} → {ride.dropoffZone.name}
          </p>
          <p className="text-xs text-stone-500">
            {formatDateTime(ride.createdAt)}
            {ride.pool && ` · ${ride.pool.tesla.name}`}
            {ride.fare?.pooled && ' · pooled'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`font-semibold ${ride.status === 'CANCELLED' ? 'text-stone-400 line-through' : ''}`}
          >
            {formatTaka(amount)}
          </p>
          <Badge
            tone={
              ride.status === 'COMPLETED'
                ? 'success'
                : ride.status === 'CANCELLED'
                  ? 'muted'
                  : 'brand'
            }
          >
            {STATUS_LABEL[ride.status]}
          </Badge>
        </div>
      </Link>
    </li>
  );
}
