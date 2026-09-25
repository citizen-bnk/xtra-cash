import 'dotenv/config';
import path from 'path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

async function main() {
  const { db, pool } = createDb();
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
  await pool.end();
  console.log('Migrations applied');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
