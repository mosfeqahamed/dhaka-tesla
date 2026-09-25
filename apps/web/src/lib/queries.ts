'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { api, ApiError } from './api';
import { isFinished } from './status';
import type {
  DriverFeed,
  DriverPool,
  FareEstimate,
  PaymentMethod,
  PoolAction,
  PoolsPage,
  Ride,
  RidesPage,
  User,
  Zone,
} from './types';

// How often an in-progress ride refreshes. Polling rather than WebSockets:
// see docs/architecture.md.
export const POLL_MS = 4000;

export const keys = {
  me: ['me'] as const,
  zones: ['zones'] as const,
  estimate: (t: object) => ['estimate', t] as const,
  currentRide: ['rides', 'current'] as const,
  ride: (id: string) => ['rides', 'detail', id] as const,
  rideHistory: ['rides', 'history'] as const,
  driverFeed: ['driver', 'feed'] as const,
  pool: (id: string) => ['driver', 'pool', id] as const,
  poolHistory: ['driver', 'pools'] as const,
};

// ---- session ----

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return (await api<{ user: User }>('/me')).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null; // signed out
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api<{ user: User }>('/auth/login', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; email: string; phone: string; password: string }) =>
      api<{ user: User }>('/auth/register', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => qc.clear(), // nobody else's data survives a sign-out
  });
}

// ---- zones and fares ----

export function useZones() {
  return useQuery({
    queryKey: keys.zones,
    queryFn: async () => (await api<{ zones: Zone[] }>('/zones')).zones,
    staleTime: Infinity, // the zone list only changes with a deploy
  });
}

export interface Trip {
  pickupZoneId: number;
  dropoffZoneId: number;
  seats: number;
}

export function useFareEstimate(trip: Trip | null) {
  return useQuery({
    queryKey: keys.estimate(trip ?? {}),
    queryFn: async () =>
      (await api<{ estimate: FareEstimate }>('/fares/estimate', { method: 'POST', body: trip }))
        .estimate,
    enabled: trip !== null,
    placeholderData: keepPreviousData, // keep the old price visible while re-quoting
  });
}

// ---- rides ----

export function useCurrentRide() {
  return useQuery({
    queryKey: keys.currentRide,
    queryFn: async () => (await api<{ ride: Ride | null }>('/rides/current')).ride,
    // Only poll while there is something to watch.
    refetchInterval: (q) => (q.state.data && !isFinished(q.state.data.status) ? POLL_MS : false),
  });
}

export function useRide(id: string) {
  return useQuery({
    queryKey: keys.ride(id),
    queryFn: async () => (await api<{ ride: Ride }>(`/rides/${id}`)).ride,
    refetchInterval: (q) => (q.state.data && !isFinished(q.state.data.status) ? POLL_MS : false),
  });
}

export function useRideHistory() {
  return useInfiniteQuery({
    queryKey: keys.rideHistory,
    queryFn: ({ pageParam }) =>
      api<RidesPage>(`/rides?limit=10${pageParam ? `&before=${pageParam}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useBookRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      idempotencyKey,
      ...body
    }: Trip & { paymentMethod: PaymentMethod; idempotencyKey: string }) =>
      api<{ ride: Ride; replayed: boolean }>('/rides', {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
    onSuccess: ({ ride }) => {
      qc.setQueryData(keys.currentRide, ride);
      qc.invalidateQueries({ queryKey: keys.rideHistory });
    },
    onError: (err) => {
      // Somebody (another tab?) already booked: show that ride instead.
      if (err instanceof ApiError && err.code === 'ACTIVE_RIDE_EXISTS') {
        qc.invalidateQueries({ queryKey: keys.currentRide });
      }
    },
  });
}

export function useCancelRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api<{ ride: Ride }>(`/rides/${id}/cancel`, {
        method: 'POST',
        body: reason ? { reason } : {},
      }),
    onSettled: (_data, _err, { id }) => {
      // Refetch on failure too: a 409 means the ride moved on without us.
      qc.invalidateQueries({ queryKey: ['rides'] });
      qc.invalidateQueries({ queryKey: keys.ride(id) });
    },
  });
}

// ---- driver ----

// Feed + current trip in one call. Polled while online so new requests,
// auto-matched riders and passenger cancellations show up on their own.
export function useDriverFeed() {
  return useQuery({
    queryKey: keys.driverFeed,
    queryFn: () => api<DriverFeed>('/driver/requests'),
    refetchInterval: (q) => (q.state.data?.online || q.state.data?.currentPool ? POLL_MS : false),
  });
}

export function useSetDriverStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { status: 'ONLINE' | 'OFFLINE'; zoneId?: number }) =>
      api('/driver/status', { method: 'PATCH', body: input }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: keys.driverFeed });
      qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}

export function useAcceptRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rideId: string) =>
      api<{ pool: DriverPool }>(`/driver/requests/${rideId}/accept`, { method: 'POST' }),
    // Refetch on failure too: a 409 usually means the feed is stale.
    onSettled: () => qc.invalidateQueries({ queryKey: ['driver'] }),
  });
}

export function usePoolAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      poolId,
      action,
      reason,
    }: {
      poolId: string;
      action: PoolAction;
      reason?: string;
    }) =>
      api<{ pool: DriverPool }>(`/pools/${poolId}/${action}`, {
        method: 'POST',
        body: action === 'cancel' && reason ? { reason } : {},
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['driver'] }),
  });
}

export function usePool(id: string) {
  return useQuery({
    queryKey: keys.pool(id),
    queryFn: async () => (await api<{ pool: DriverPool }>(`/pools/${id}`)).pool,
  });
}

export function usePoolHistory() {
  return useInfiniteQuery({
    queryKey: keys.poolHistory,
    queryFn: ({ pageParam }) =>
      api<PoolsPage>(`/pools?limit=10${pageParam ? `&before=${pageParam}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}
