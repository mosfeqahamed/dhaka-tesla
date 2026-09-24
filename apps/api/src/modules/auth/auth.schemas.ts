import { z } from 'zod';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email'));

// Accepts the ways people actually type Bangladeshi mobiles
// (01712-345678, 8801712345678, +880 1712 345678) and stores one form.
const phone = z
  .string()
  .transform((raw) => {
    const digits = raw.replace(/[\s-]/g, '');
    if (digits.startsWith('01')) return `+88${digits}`;
    if (digits.startsWith('8801')) return `+${digits}`;
    return digits;
  })
  .pipe(
    z.string().regex(/^\+8801[3-9]\d{8}$/, 'Enter a Bangladeshi mobile number, e.g. 01712345678'),
  );

// bcrypt only uses the first 72 bytes; reject longer instead of silently truncating.
const password = z.string().min(8, 'Use at least 8 characters').max(72);

// strictObject: unknown keys (e.g. "role": "DRIVER") are rejected, not ignored.
export const registerSchema = z.strictObject({
  name: z.string().trim().min(2).max(100),
  email,
  phone,
  password,
});

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(72),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
