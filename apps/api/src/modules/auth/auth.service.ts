import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users, vehicles, zones } from '../../db/schema/index.js';
import { HttpError } from '../../lib/http-error.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../lib/password.js';
import { uniqueViolation } from '../../lib/pg-errors.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

const publicUser = {
  id: users.id,
  name: users.name,
  email: users.email,
  phone: users.phone,
  role: users.role,
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'PASSENGER' | 'DRIVER';
};

// Self sign-up is passenger-only: a driver needs a Tesla with a plate and a
// fixed capacity, which is onboarded by the operator (the seed, in the MVP).
export async function registerPassenger(input: RegisterInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  try {
    const [user] = await db
      .insert(users)
      .values({ ...input, passwordHash, role: 'PASSENGER' })
      .returning(publicUser);
    return user!;
  } catch (err) {
    // Rely on the unique constraint rather than a pre-check, so two
    // simultaneous sign-ups with the same email can't both succeed.
    const constraint = uniqueViolation(err);
    if (constraint === 'users_email_unique') {
      throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    }
    if (constraint === 'users_phone_unique') {
      throw new HttpError(409, 'PHONE_TAKEN', 'An account with this phone number already exists');
    }
    throw err;
  }
}

export async function login({ email, password }: LoginInput): Promise<PublicUser> {
  const [user] = await db
    .select({ ...publicUser, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email));

  // Always run bcrypt, even for unknown emails, so response time doesn't
  // reveal which emails are registered.
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  const { passwordHash: _omit, ...rest } = user;
  return rest;
}

export async function getProfile(userId: string) {
  const [row] = await db
    .select({
      user: publicUser,
      vehicle: {
        id: vehicles.id,
        name: vehicles.name,
        plateNo: vehicles.plateNo,
        capacity: vehicles.capacity,
        driverStatus: vehicles.driverStatus,
        currentZoneId: vehicles.currentZoneId,
        currentZoneName: zones.name,
      },
    })
    .from(users)
    .leftJoin(vehicles, eq(vehicles.driverId, users.id))
    .leftJoin(zones, eq(zones.id, vehicles.currentZoneId))
    .where(eq(users.id, userId));

  // A valid token for a user that no longer exists is treated as signed out.
  if (!row) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in to continue');

  // The vehicle object mixes columns from two left-joined tables, so Drizzle
  // can't null it for us: a passenger gets an object of nulls. Collapse it.
  const { vehicle } = row;
  return { ...row.user, vehicle: vehicle.id === null ? null : vehicle };
}
