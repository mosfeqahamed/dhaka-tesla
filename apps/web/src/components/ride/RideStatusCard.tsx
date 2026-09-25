'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { formatTaka, formatTime } from '@/lib/format';
import { useCancelRide } from '@/lib/queries';
import { canCancel, STATUS_LABEL } from '@/lib/status';
import type { Ride } from '@/lib/types';
import { FareBreakdown } from './FareBreakdown';
import { StatusStepper } from './StatusStepper';

export function RideStatusCard({ ride }: { ride: Ride }) {
  return (
    <Card className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">Booked {formatTime(ride.createdAt)}</p>
          <h2 className="text-lg font-bold">
            {ride.pickupZone.name} → {ride.dropoffZone.name}
          </h2>
          <p className="text-sm text-stone-600">
            {ride.seats} {ride.seats === 1 ? 'seat' : 'seats'} ·{' '}
            {ride.paymentMethod === 'CASH' ? 'Cash' : 'TeslaPay'}
          </p>
        </div>
        <Badge tone={ride.status === 'CANCELLED' ? 'muted' : 'brand'}>
          {STATUS_LABEL[ride.status]}
        </Badge>
      </div>

      {ride.status === 'CANCELLED' ? (
        <Alert tone="info" title="This ride was cancelled">
          {ride.timeline?.at(-1)?.reason}
        </Alert>
      ) : (
        <StatusStepper status={ride.status} />
      )}

      {ride.status === 'REQUESTED' && (
        <p className="text-sm text-stone-600">
          Looking for a Tesla in {ride.pickupZone.name}. You’ll be matched automatically if one with
          a free seat is heading your way.
        </p>
      )}

      {ride.pool && <TeslaInfo pool={ride.pool} />}

      <div className="rounded-xl bg-stone-50 p-4">
        {ride.fare ? (
          <FareBreakdown fare={ride.fare} seats={ride.seats} />
        ) : (
          <p className="flex justify-between text-sm">
            <span className="text-stone-600">Estimated fare (solo)</span>
            <span className="font-bold">{formatTaka(ride.estimatedFarePaisa)}</span>
          </p>
        )}
        {ride.fare && ride.status !== 'COMPLETED' && ride.status !== 'STARTED' && (
          <p className="mt-2 text-xs text-stone-500">
            Final once the trip starts. It drops if someone joins.
          </p>
        )}
      </div>

      {canCancel(ride.status) && <CancelButton rideId={ride.id} />}
    </Card>
  );
}

function TeslaInfo({ pool }: { pool: NonNullable<Ride['pool']> }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-stone-200 p-4">
      <div>
        <p className="font-semibold">{pool.tesla.name}</p>
        <p className="whitespace-nowrap text-xs text-stone-500">{pool.tesla.plateNo}</p>
        <p className="text-sm text-stone-600">Driver: {pool.driverName}</p>
      </div>
      <div className="text-right text-sm">
        <p className="font-semibold">
          {pool.coRiders === 0
            ? 'Just you so far'
            : `Sharing with ${pool.coRiders} ${pool.coRiders === 1 ? 'other' : 'others'}`}
        </p>
        <p className="text-stone-500">
          {pool.seatsTaken}/{pool.capacity} seats taken
        </p>
      </div>
    </div>
  );
}

// Two-step so a stray tap in a moving rickshaw doesn't cancel the ride.
function CancelButton({ rideId }: { rideId: string }) {
  const cancel = useCancelRide();
  const [confirming, setConfirming] = useState(false);

  const lostRace = cancel.error instanceof ApiError && cancel.error.code === 'INVALID_TRANSITION';

  return (
    <div className="space-y-3">
      {cancel.error && (
        <Alert>
          {lostRace
            ? 'Your ride moved on before we could cancel it — the latest status is shown above.'
            : cancel.error.message}
        </Alert>
      )}
      {confirming ? (
        <div className="flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            loading={cancel.isPending}
            onClick={() => cancel.mutate({ id: rideId }, { onSettled: () => setConfirming(false) })}
          >
            Yes, cancel ride
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
            Keep ride
          </Button>
        </div>
      ) : (
        <Button variant="ghost" className="w-full" onClick={() => setConfirming(true)}>
          Cancel ride
        </Button>
      )}
    </div>
  );
}

export function RideDetailsLink({ id }: { id: string }) {
  return (
    <Link href={`/ride/${id}`} className="text-sm font-semibold text-brand-700 hover:underline">
      View details
    </Link>
  );
}
