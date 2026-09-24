import { sql } from 'drizzle-orm';
import { check, pgTable, smallint, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { driverStatus, userRole } from './enums.js';
import { zones } from './geography.js';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 100 }).notNull(),
  role: userRole('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// A driver's Tesla. driver_status/current_zone_id live here, not on users,
// because they only mean something for a driver who has a vehicle.
export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    driverId: uuid('driver_id')
      .notNull()
      .unique() // one Tesla per driver
      .references(() => users.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 64 }).notNull(),
    plateNo: varchar('plate_no', { length: 32 }).notNull().unique(),
    capacity: smallint('capacity').notNull(),
    driverStatus: driverStatus('driver_status').notNull().default('OFFLINE'),
    currentZoneId: smallint('current_zone_id').references(() => zones.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('vehicles_capacity_positive', sql`${t.capacity} > 0`)],
);
