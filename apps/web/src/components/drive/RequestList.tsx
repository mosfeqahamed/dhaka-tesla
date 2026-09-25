'use client';

import { useState } from 'react';
import { Alert, Button, EmptyState } from '@/components/ui';
import { formatTaka, formatTime } from '@/lib/format';
import { useAcceptRequest } from '@/lib/queries';
import { poolTakesRiders } from '@/lib/status';
import type { DriverPool, WaitingRequest } from '@/lib/types';

export function RequestList({
  requests,
  pool,
  zoneName,
}: {
  requests: WaitingRequest[];
  pool: DriverPool | null;
  zoneName: string | undefined;
}) {
  const accept = useAcceptRequest();
  // Which row the last error belongs to, so it shows next to that request.
  const [failedId, setFailedId] = useState<string | null>(null);

  // Once Jashim has arrived or started, Bullet can't take anyone else.
  const canAccept = !pool || poolTakesRiders(pool.status);

  if (requests.length === 0) {
    return (
      <EmptyState title="No one waiting right now">
        New requests from {zoneName ?? 'your zone'} appear here automatically.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-2">
      {requests.map((r) => (
        <li key={r.id} className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {r.passengerName} → {r.dropoffZone.name}
              </p>
              <p className="text-sm text-stone-500">
                {r.seats} {r.seats === 1 ? 'seat' : 'seats'} · {formatTaka(r.estimatedFarePaisa)}{' '}
                solo · waiting since {formatTime(r.waitingSince)}
              </p>
            </div>
            {canAccept && (
              <Button
                variant={pool ? 'secondary' : 'primary'}
                loading={accept.isPending && accept.variables === r.id}
                disabled={accept.isPending}
                onClick={() => {
                  setFailedId(r.id);
                  accept.mutate(r.id);
                }}
              >
                {pool ? 'Add to trip' : 'Accept'}
              </Button>
            )}
          </div>
          {accept.error && failedId === r.id && (
            <div className="mt-3">
              <Alert>{accept.error.message}</Alert>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
