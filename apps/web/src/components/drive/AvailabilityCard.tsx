'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Select } from '@/components/ui';
import { useSetDriverStatus, useZones } from '@/lib/queries';
import type { User, Zone } from '@/lib/types';

// Online/offline and where Bullet is parked. Locked while a trip is active:
// passengers are counting on the Tesla staying put (the API enforces it too).
export function AvailabilityCard({
  vehicle,
  online,
  zone,
  tripActive,
}: {
  vehicle: NonNullable<User['vehicle']>;
  online: boolean;
  zone: Zone | null;
  tripActive: boolean;
}) {
  const zones = useZones();
  const setStatus = useSetDriverStatus();
  const [zoneId, setZoneId] = useState<number | ''>(zone?.id ?? '');

  const goOnline = () => zoneId !== '' && setStatus.mutate({ status: 'ONLINE', zoneId });

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{vehicle.name}</h2>
          <p className="text-sm text-stone-500">
            {vehicle.plateNo} · {vehicle.capacity} seats
          </p>
        </div>
        <Badge tone={online ? 'success' : 'muted'}>{online ? 'Online' : 'Offline'}</Badge>
      </div>

      <Field
        label="Waiting in"
        hint={tripActive ? 'Finish or cancel your trip to change zone.' : undefined}
      >
        <Select
          value={zoneId}
          disabled={tripActive || zones.isPending}
          onChange={(e) => {
            const next = e.target.value ? Number(e.target.value) : '';
            setZoneId(next);
            if (online && next !== '') setStatus.mutate({ status: 'ONLINE', zoneId: next });
          }}
        >
          <option value="">Choose a zone…</option>
          {zones.data?.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </Select>
      </Field>

      {setStatus.error && <Alert>{setStatus.error.message}</Alert>}

      {online ? (
        <Button
          variant="secondary"
          className="w-full"
          disabled={tripActive}
          loading={setStatus.isPending}
          onClick={() => setStatus.mutate({ status: 'OFFLINE' })}
        >
          {tripActive ? 'Can’t go offline during a trip' : 'Go offline'}
        </Button>
      ) : (
        <Button
          className="w-full"
          disabled={zoneId === ''}
          loading={setStatus.isPending}
          onClick={goOnline}
        >
          Go online
        </Button>
      )}
    </Card>
  );
}
