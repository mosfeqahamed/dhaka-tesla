import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  varchar,
} from 'drizzle-orm/pg-core';

// Predefined Dhaka areas. lat/lng are for display only; no routing uses them.
export const zones = pgTable('zones', {
  id: smallint('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', { length: 64 }).notNull().unique(),
  lat: numeric('lat', { precision: 9, scale: 6 }).notNull(),
  lng: numeric('lng', { precision: 9, scale: 6 }).notNull(),
});

// Curated road distances, stored in both directions so a lookup is a PK hit.
export const zoneDistances = pgTable(
  'zone_distances',
  {
    fromZoneId: smallint('from_zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'restrict' }),
    toZoneId: smallint('to_zone_id')
      .notNull()
      .references(() => zones.id, { onDelete: 'restrict' }),
    distanceM: integer('distance_m').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.fromZoneId, t.toZoneId] }),
    check('zone_distances_distinct_zones', sql`${t.fromZoneId} <> ${t.toZoneId}`),
    check('zone_distances_positive', sql`${t.distanceM} > 0`),
  ],
);
