import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Public } from './common/auth';
import { InjectDb } from './common/db.module';
import { Db } from './db/client';

@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectDb() private db: Db) {}

  @Get()
  async health() {
    await this.db.execute(sql`select 1`);
    return { status: 'ok', time: new Date().toISOString() };
  }
}
