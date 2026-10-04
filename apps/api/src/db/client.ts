import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
/** A Drizzle transaction handle — same query API as Db. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

export function createDb(url = process.env.DATABASE_URL): { db: Db; pool: Pool } {
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString: url, // Serverless (Vercel): each instance keeps only a few connections so many instances fit the database's limit.
    max: Number(process.env.DB_POOL_SIZE ?? (process.env.VERCEL ? 3 : 10)), });
  return { db: drizzle(pool, { schema }), pool };
}
