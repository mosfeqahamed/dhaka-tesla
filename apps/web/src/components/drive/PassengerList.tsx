import { Badge } from '@/components/ui';
import { formatTaka } from '@/lib/format';
import { STATUS_LABEL } from '@/lib/status';
import type { PoolPassenger } from '@/lib/types';

// Who is in the Tesla, where each is going and what each pays. Riders who
// cancelled stay listed (struck through) so the driver knows who dropped out.
export function PassengerList({ passengers }: { passengers: PoolPassenger[] }) {
  return (
    <ul className="divide-y divide-stone-100">
      {passengers.map((p) => {
        const gone = p.status === 'CANCELLED';
        return (
          <li key={p.rideId} className="flex items-center justify-between gap-3 py-3">
            <div className={gone ? 'text-stone-400' : undefined}>
              <p className={`font-semibold ${gone ? 'line-through' : ''}`}>{p.passengerName}</p>
              <p className="text-sm">
                to {p.dropoffZone.name} · {p.seats} {p.seats === 1 ? 'seat' : 'seats'}
              </p>
            </div>
            <div className="text-right">
              {gone ? (
                <Badge tone="muted">{STATUS_LABEL.CANCELLED}</Badge>
              ) : (
                <>
                  <p className="font-semibold">{formatTaka(p.fare.totalFarePaisa)}</p>
                  <p className="text-xs text-stone-500">
                    {p.paymentMethod === 'CASH' ? 'Cash' : 'TeslaPay'}
                    {p.fare.poolDiscountPaisa > 0 && ' · pooled'}
                  </p>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
