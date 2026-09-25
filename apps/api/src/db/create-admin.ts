/**
 * Creates the first super-admin on a fresh (production) database, where the demo seed refuses to run.
 * Idempotent: does nothing when ADMIN_EMAIL / ADMIN_PASSWORD are unset or the user already exists,
 * so it is safe to run on every deploy.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... [ADMIN_PHONE=+27...] node dist/db/create-admin.js
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { createDb } from './client';
import { users } from './schema';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set; skipping super-admin creation');
    return;
  }
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');

  const { db, pool } = createDb();
  try {
    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (existing) {
      console.log(`Super-admin ${email} already exists`);
      return;
    }
    await db.insert(users).values({
      email,
      phone: process.env.ADMIN_PHONE?.trim() || '+27000000000',
      firstName: 'Super',
      lastName: 'Admin',
      roles: ['SUPER_ADMIN', 'ADMIN'],
      passwordHash: await bcrypt.hash(password, 12),
      referralCode: `XCADM${randomBytes(4).toString('hex').toUpperCase()}`,
    });
    console.log(`Created super-admin ${email}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
