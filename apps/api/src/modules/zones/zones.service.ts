import { and, asc, eq } from 'drizzle-orm';
import { db, type Db, type Tx } from '../../db/client.js';
import { zoneDistances, zones } from '../../db/schema/index.js';
import { HttpError } from '../../lib/http-error.js';

export async function listZones() {
  return db
    .select({ id: zones.id, name: zones.name, lat: zones.lat, lng: zones.lng })
    .from(zones)
    .orderBy(asc(zones.name));
}

// Curated road distance between two different zones. A missing row means one
// of the ids isn't a real zone (every real pair is seeded).
export async function distanceBetween(conn: Db | Tx, fromZoneId: number, toZoneId: number) {
  const [row] = await conn
    .select({ distanceM: zoneDistances.distanceM })
    .from(zoneDistances)
    .where(and(eq(zoneDistances.fromZoneId, fromZoneId), eq(zoneDistances.toZoneId, toZoneId)));
  if (!row) throw new HttpError(422, 'UNKNOWN_ZONE', 'Pickup or dropoff is not a known zone');
  return row.distanceM;
}
