import { Injectable } from '@nestjs/common';
import { auditLogs } from '../db/schema';
import { Db, DbOrTx } from '../db/client';
import { InjectDb } from './db.module';
import type { AuthUser } from './auth';

@Injectable()
export class AuditService {
  constructor(@InjectDb() private db: Db) {}

  async log(
    actor: AuthUser | null,
    action: string,
    entityType: string,
    entityId: string | null,
    meta?: Record<string, unknown>,
    conn: DbOrTx = this.db,
  ) {
    await conn.insert(auditLogs).values({
      actorId: actor?.id ?? null,
      actorEmail: actor?.email ?? null,
      action,
      entityType,
      entityId,
      meta: meta ?? null,
    });
  }
}
