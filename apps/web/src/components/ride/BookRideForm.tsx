'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Card, ErrorState, Field, Loading, Select } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { formatDistance, formatTaka } from '@/lib/format';
import { useBookRide, useFareEstimate, useZones, type Trip } from '@/lib/queries';
import type { PaymentMethod } from '@/lib/types';

export function BookRideForm() {
  const zones = useZones();
  const book = useBookRide();
  const [pickup, setPickup] = useState<number | ''>('');
  const [dropoff, setDropoff] = useState<number | ''>('');
  const [seats, setSeats] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');

  const trip: Trip | null =
    pickup !== '' && dropoff !== '' && pickup !== dropoff
      ? { pickupZoneId: pickup, dropoffZoneId: dropoff, seats }
      : null;
  const estimate = useFareEstimate(trip);

  // One Idempotency-Key per distinct booking. Resubmitting the same trip
  // (double tap, timeout, flaky 3G) reuses the key, so the API returns the
  // ride it already created instead of booking twice. Any change to the trip
  // gets a fresh key.
  const lastAttempt = useRef<{ signature: string; key: string } | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!trip) return;
    const signature = JSON.stringify({ ...trip, paymentMethod });
    if (lastAttempt.current?.signature !== signature) {
      lastAttempt.current = { signature, key: crypto.randomUUID() };
    }
    book.mutate({ ...trip, paymentMethod, idempotencyKey: lastAttempt.current.key });
  }

  if (zones.isPending) return <Loading label="Loading zones…" />;
  if (zones.error) return <ErrorState error={zones.error} onRetry={() => zones.refetch()} />;

  const sameZone = pickup !== '' && pickup === dropoff;

  return (
    <Card>
      <h2 className="text-lg font-bold">Where to?</h2>
      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pickup">
            <Select
              value={pickup}
              onChange={(e) => setPickup(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Choose…</option>
              {zones.data.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dropoff" error={sameZone ? 'Pick a different zone' : undefined}>
            <Select
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Choose…</option>
              {zones.data.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Seats">
            <Select value={seats} onChange={(e) => setSeats(Number(e.target.value))}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'seat' : 'seats'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pay with">
            <Select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            >
              <option value="CASH">Cash</option>
              <option value="TESLAPAY">TeslaPay</option>
            </Select>
          </Field>
        </div>

        <Quote trip={trip} estimate={estimate} />

        {book.error && (
          <Alert title="Couldn’t book this ride">
            {book.error instanceof ApiError && book.error.code === 'ACTIVE_RIDE_EXISTS'
              ? 'You already have a ride in progress — showing it now.'
              : book.error.message}
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={!trip} loading={book.isPending}>
          {estimate.data
            ? `Request ride · from ${formatTaka(estimate.data.pooled.totalFarePaisa)}`
            : 'Request ride'}
        </Button>
      </form>
    </Card>
  );
}

function Quote({
  trip,
  estimate,
}: {
  trip: Trip | null;
  estimate: ReturnType<typeof useFareEstimate>;
}) {
  if (!trip) {
    return <p className="text-sm text-stone-500">Choose pickup and dropoff to see the fare.</p>;
  }
  if (estimate.error) return <Alert>{(estimate.error as Error).message}</Alert>;
  if (!estimate.data) return <Loading label="Pricing your trip…" />;

  const { solo, pooled } = estimate.data;
  return (
    <div
      className={`grid grid-cols-2 gap-3 transition-opacity ${estimate.isPlaceholderData ? 'opacity-60' : ''}`}
      aria-live="polite"
    >
      <div className="rounded-xl border border-stone-200 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Solo</p>
        <p className="mt-1 text-xl font-bold">{formatTaka(solo.totalFarePaisa)}</p>
        <p className="text-xs text-stone-500">{formatDistance(solo.distanceM)}</p>
      </div>
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-700">If pooled</p>
        <p className="mt-1 text-xl font-bold text-brand-700">{formatTaka(pooled.totalFarePaisa)}</p>
        <p className="text-xs text-brand-700">save {formatTaka(pooled.poolDiscountPaisa)}</p>
      </div>
      <p className="col-span-2 text-xs text-stone-500">
        You pay the pooled price only if someone actually shares your Tesla.
      </p>
    </div>
  );
}
