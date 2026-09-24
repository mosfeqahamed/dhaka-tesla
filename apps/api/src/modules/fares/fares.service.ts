import { db } from '../../db/client.js';
import { distanceBetween } from '../zones/zones.service.js';
import type { TripInput } from '../rides/rides.schemas.js';
import { calculateFare } from './fare.js';

// Both prices up front: what you pay alone, and what you'd pay if the ride
// ends up pooled. The pooled price only applies if someone actually joins.
export async function estimateFare({ pickupZoneId, dropoffZoneId, seats }: TripInput) {
  const distanceM = await distanceBetween(db, pickupZoneId, dropoffZoneId);
  return {
    solo: calculateFare({ distanceM, seats, pooled: false }),
    pooled: calculateFare({ distanceM, seats, pooled: true }),
  };
}
