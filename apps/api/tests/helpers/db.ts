import { sql } from 'drizzle-orm';
import { db } from '../../src/db/client.js';

// Empty every table (keeps the schema). Tests call this, then seed what they need.
export async function resetDb() {
  await db.execute(sql`
    TRUNCATE payments, status_events, pool_members, pools, ride_requests,
             vehicles, users, zone_distances, zones
    RESTART IDENTITY CASCADE
  `);
}

// First row of a query result, failing loudly instead of returning undefined.
export function first<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error('expected at least one row');
  return row;
}
