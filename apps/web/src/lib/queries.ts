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
import type { FareEstimate, PaymentMethod, Ride, RidesPage, User, Zone } from './types';

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
