import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { closeDb, db } from './client.js';
import { users, vehicles, zoneDistances, zones } from './schema/index.js';
import { BULLET, DISTANCES_M, DRIVER, PASSENGERS, ZONES } from './seed-data.js';
import { logger } from '../lib/logger.js';

// Idempotent: safe to run on every `docker compose up`. Existing rows are
// left alone (ON CONFLICT DO NOTHING), so a re-seed never wipes ride history.
export async function seed() {
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('SEED_PASSWORD must be set to seed demo accounts');
  const passwordHash = await bcrypt.hash(password, 10);

  await db.transaction(async (tx) => {
    await tx
      .insert(zones)
      .values([...ZONES])
      .onConflictDoNothing({ target: zones.name });
    const zoneRows = await tx.select({ id: zones.id, name: zones.name }).from(zones);
    const zoneId = (name: string) => {
      const row = zoneRows.find((z) => z.name === name);
      if (!row) throw new Error(`Unknown zone in seed data: ${name}`);
      return row.id;
    };

    await tx
      .insert(zoneDistances)
      .values(
        DISTANCES_M.flatMap(([a, b, distanceM]) => [
          { fromZoneId: zoneId(a), toZoneId: zoneId(b), distanceM },
          { fromZoneId: zoneId(b), toZoneId: zoneId(a), distanceM },
        ]),
      )
      .onConflictDoNothing();

    await tx
      .insert(users)
      .values([
        ...PASSENGERS.map((p) => ({ ...p, passwordHash, role: 'PASSENGER' as const })),
        { ...DRIVER, passwordHash, role: 'DRIVER' as const },
      ])
      .onConflictDoNothing({ target: users.email });

    const [jashim] = await tx.select().from(users).where(eq(users.email, DRIVER.email));
    if (!jashim) throw new Error('Driver was not seeded');

    await tx
      .insert(vehicles)
      .values({
        driverId: jashim.id,
        name: BULLET.name,
        plateNo: BULLET.plateNo,
        capacity: BULLET.capacity,
        currentZoneId: zoneId(BULLET.homeZone),
      })
      .onConflictDoNothing({ target: vehicles.driverId });
  });

  logger.info(
    { zones: ZONES.length, distancePairs: DISTANCES_M.length, users: PASSENGERS.length + 1 },
    'seed complete',
  );
}

// Run directly (npm run db:seed), not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .catch((err) => {
      logger.error({ err }, 'seed failed');
      process.exitCode = 1;
    })
    .finally(closeDb);
}
