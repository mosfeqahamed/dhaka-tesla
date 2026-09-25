import { formatDistance, formatTaka } from '@/lib/format';
import type { FareBreakdown as Fare } from '@/lib/types';

// Every line of the fare, so a passenger can check it by hand:
// base + distance − pool discount.
export function FareBreakdown({ fare, seats }: { fare: Fare; seats: number }) {
  return (
    <dl className="space-y-1 text-sm">
      <Row label="Base fare" value={formatTaka(fare.baseFarePaisa)} />
      <Row
        label={`Distance · ${formatDistance(fare.distanceM)}${seats > 1 ? ` × ${seats} seats` : ''}`}
        value={formatTaka(fare.distanceChargePaisa)}
      />
      {fare.poolDiscountPaisa > 0 && (
        <Row label="Pool discount (20%)" value={`−${formatTaka(fare.poolDiscountPaisa)}`} accent />
      )}
      <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 font-bold">
        <dt>Your fare</dt>
        <dd>{formatTaka(fare.totalFarePaisa)}</dd>
      </div>
    </dl>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex justify-between ${accent ? 'text-emerald-700' : 'text-stone-600'}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
