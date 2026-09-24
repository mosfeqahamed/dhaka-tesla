import bcrypt from 'bcryptjs';

// bcryptjs (pure JS) instead of native bcrypt/argon2: no build toolchain in
// the Docker image, and cost 10 is ~70 ms per hash - fine for sign-in rates.
const COST = 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);

export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// Compared against when the email doesn't exist, so "unknown email" and
// "wrong password" take the same time and can't be told apart.
export const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);
