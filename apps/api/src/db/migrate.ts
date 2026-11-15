import 'dotenv/config';
import path from 'path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

async function main() {
  const { db, pool } = createDb();
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  if (process.env.VERCEL_ENV === 'production') {
    const { rows } = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM audit_logs WHERE action = 'lender.capacity_initialized'",
    );
    console.log(`Lenders initialised from reconciled funds: ${rows[0].count}`);
    const welcome = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM loan_offers WHERE welcome_only AND active",
    );
    console.log(`Active Welcome BNPL offers: ${welcome.rows[0].count}`);
  }
  await pool.end();
  console.log('Migrations applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
