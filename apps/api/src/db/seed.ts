/**
 * Demo data for local development.
 *
 *   pnpm db:seed          # wipes and re-seeds (refuses when NODE_ENV=production)
 */
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import { AppModule } from '../app.module';
import { DB } from '../common/db.module';
import { Db } from './client';
import { buildDemoData, DEMO_ADMIN_PASSWORD as ADMIN_PASSWORD, DEMO_PASSWORD as PASSWORD, SEED_STAFF } from './demo-data';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');
  process.env.ENABLE_SIMULATION = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const db = app.get<Db>(DB);

  console.log('Resetting database…');
  const tables = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const names = tables.rows.map((r) => `"${r.tablename}"`).join(', ');
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));

  const { affiliateReferralCode: ref } = await buildDemoData(app, SEED_STAFF);

  console.log(`\nSeed complete. Logins:
  Super-admin  superadmin@xtracash.co.za / ${ADMIN_PASSWORD}
  Admin        ops@xtracash.co.za        / ${ADMIN_PASSWORD}
  Consumer     naledi@example.com        / ${PASSWORD}   (salaried, Gauteng)
  Consumer     sipho@example.com         / ${PASSWORD}   (gig worker, KZN)
  Consumer     ayanda@example.com        / ${PASSWORD}   (student — no matching offers)
  Consumer     kagiso@example.com        / ${PASSWORD}   (KYC pending manual review)
  Lender       lindiwe@kasicapital.co.za / ${PASSWORD}   (accredited)
  Lender       bongani@ubuntucredit.co.za/ ${PASSWORD}   (accredited, assisted)
  Lender       fatima@mzansiquick.co.za  / ${PASSWORD}   (awaiting review)
  Affiliate    thabo.affiliate@example.com / ${PASSWORD} (referral code ${ref})
`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
