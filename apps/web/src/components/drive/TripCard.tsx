'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Card, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { formatTaka } from '@/lib/format';
import { usePoolAction } from '@/lib/queries';
import { canCancelPool, NEXT_POOL_ACTION, POOL_STATUS_LABEL, poolTakesRiders } from '@/lib/status';
import type { DriverPool } from '@/lib/types';
import { PassengerList } from './PassengerList';

export function TripCard({
  pool,
  onCompleted,
}: {
  pool: DriverPool;
  onCompleted: (pool: DriverPool) => void;
}) {
  const action = usePoolAction();
  const next = NEXT_POOL_ACTION[pool.status];

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">Current trip · from {pool.pickupZone.name}</p>
          <h2 className="text-lg font-bold">{POOL_STATUS_LABEL[pool.status]}</h2>
        </div>
        <Badge tone="brand">
          {pool.seatsTaken}/{pool.capacity} seats
        </Badge>
      </div>

      <SeatBar taken={pool.seatsTaken} capacity={pool.capacity} />

      <PassengerList passengers={pool.passengers} />

      <div className="flex justify-between border-t border-stone-200 pt-3 font-bold">
        <span>To collect</span>
        <span>{formatTaka(pool.totalFarePaisa)}</span>
      </div>

      {poolTakesRiders(pool.status) && pool.seatsFree > 0 && (
        <p className="text-sm text-stone-600">
          {pool.seatsFree} {pool.seatsFree === 1 ? 'seat' : 'seats'} free — compatible riders can
          still join until you mark arrival.
        </p>
      )}
      {pool.status === 'DRIVER_ARRIVED' && (
        <p className="text-sm text-stone-600">
          The trip is closed to new riders. Fares become final when you start.
        </p>
      )}

      {action.error && (
        <Alert>
          {action.error instanceof ApiError && action.error.code === 'INVALID_TRANSITION'
            ? 'This trip already moved on — showing the latest state.'
            : action.error.message}
        </Alert>
      )}

      {next && (
        <Button
          className="w-full"
          loading={action.isPending && action.variables?.action === next.action}
          disabled={action.isPending}
          onClick={() =>
            action.mutate(
              { poolId: pool.id, action: next.action },
              { onSuccess: ({ pool: done }) => done.status === 'COMPLETED' && onCompleted(done) },
            )
          }
        >
          {next.label}
        </Button>
      )}

      {canCancelPool(pool.status) && <CancelTrip poolId={pool.id} disabled={action.isPending} />}
    </Card>
  );
}

function SeatBar({ taken, capacity }: { taken: number; capacity: number }) {
  return (
    <div className="flex gap-1.5" aria-label={`${taken} of ${capacity} seats taken`}>
      {Array.from({ length: capacity }, (_, i) => (
        <span
          key={i}
          className={`h-2 flex-1 rounded-full ${i < taken ? 'bg-brand-600' : 'bg-stone-200'}`}
        />
      ))}
    </div>
  );
}

function CancelTrip({ poolId, disabled }: { poolId: string; disabled: boolean }) {
  const action = usePoolAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (!open) {
    return (
      <Button variant="ghost" className="w-full" disabled={disabled} onClick={() => setOpen(true)}>
        Cancel trip
      </Button>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-3">
      <p className="text-sm text-red-900">Every rider will be cancelled and told why.</p>
      <Input
        placeholder="Reason (optional), e.g. flat tyre"
        value={reason}
        maxLength={200}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <Button
          variant="danger"
          className="flex-1"
          loading={action.isPending}
          onClick={() =>
            action.mutate({ poolId, action: 'cancel', reason: reason.trim() || undefined })
          }
        >
          Cancel trip
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
          Keep trip
        </Button>
      </div>
    </div>
  );
}
