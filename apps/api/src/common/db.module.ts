import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { createDb, Db } from '../db/client';

export const DB = Symbol('DB');
export const PG_POOL = Symbol('PG_POOL');
export const InjectDb = () => Inject(DB);

@Global()
@Module({
  providers: [
    {
      provide: 'DB_BUNDLE',
      useFactory: () => createDb(),
    },
    { provide: DB, useFactory: (b: { db: Db }) => b.db, inject: ['DB_BUNDLE'] },
    { provide: PG_POOL, useFactory: (b: { pool: Pool }) => b.pool, inject: ['DB_BUNDLE'] },
  ],
  exports: [DB, PG_POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private pool: Pool) {}
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
