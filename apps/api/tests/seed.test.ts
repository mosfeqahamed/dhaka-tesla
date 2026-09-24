import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '../src/db/client.js';
import { users, vehicles, zoneDistances, zones } from '../src/db/schema/index.js';
import { seed } from '../src/db/seed.js';
import { DISTANCES_M, ZONES } from '../src/db/seed-data.js';
import { first, resetDb } from './helpers/db.js';

beforeAll(async () => {
  await resetDb();
  await seed();
});
afterAll(closeDb);

const distance = async (from: string, to: string) => {
  const [row] = await db
    .execute<{ distance_m: number }>(
      sql`
    SELECT d.distance_m FROM zone_distances d
    JOIN zones f ON f.id = d.from_zone_id
    JOIN zones t ON t.id = d.to_zone_id
    WHERE f.name = ${from} AND t.name = ${to}
  `,
    )
    .then((r) => r.rows);
  return row?.distance_m;
};

describe('seed', () => {
  it('seeds the story cast with the right roles', async () => {
    const rows = await db.select({ name: users.name, role: users.role }).from(users);
    expect(rows).toEqual(
      expect.arrayContaining([
        { name: 'Nusrat', role: 'PASSENGER' },
        { name: 'Rafiq', role: 'PASSENGER' },
        { name: 'Shirin', role: 'PASSENGER' },
        { name: 'Jashim', role: 'DRIVER' },
      ]),
    );
  });

  it('gives Jashim a three-seat Bullet parked in Banani', async () => {
    const [bullet] = await db
      .select({
        name: vehicles.name,
        capacity: vehicles.capacity,
        zone: zones.name,
        driver: users.name,
      })
      .from(vehicles)
      .innerJoin(users, eq(users.id, vehicles.driverId))
      .innerJoin(zones, eq(zones.id, vehicles.currentZoneId));
    expect(bullet).toEqual({ name: 'Bullet', capacity: 3, zone: 'Banani', driver: 'Jashim' });
  });

  it('never stores plain-text passwords', async () => {
    const rows = await db.select({ hash: users.passwordHash }).from(users);
    for (const { hash } of rows) expect(hash).toMatch(/^\$2[aby]\$10\$/);
  });

  it('has a symmetric distance for every pair of zones', async () => {
    const n = ZONES.length;
    expect(DISTANCES_M).toHaveLength((n * (n - 1)) / 2);
    const { count } = first(
      await db.select({ count: sql<number>`count(*)::int` }).from(zoneDistances),
    );
    expect(count).toBe(n * (n - 1));
    expect(await distance('Mohakhali', 'Farmgate')).toBe(await distance('Farmgate', 'Mohakhali'));
  });

  it('uses the documented story distances', async () => {
    expect(await distance('Banani', 'Mohakhali')).toBe(2000);
    expect(await distance('Banani', 'Gulshan 1')).toBe(3000);
    expect(await distance('Mohakhali', 'Gulshan 1')).toBe(2500);
  });

  it('is idempotent', async () => {
    await seed();
    const { count } = first(await db.select({ count: sql<number>`count(*)::int` }).from(users));
    expect(count).toBe(4);
  });
});
