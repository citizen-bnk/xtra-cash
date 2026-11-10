import { Controller, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CurrentUser, type AuthUser } from '../common/auth';
import { InjectDb } from '../common/db.module';
import { AuditService } from '../common/audit.service';
import type { Db } from '../db/client';
import { lenderSupportSessions } from '../db/schema';

@Controller('support/session')
export class SupportSessionController {
  constructor(@InjectDb() private db: Db, private audit: AuditService) {}
  @HttpCode(200) @Post('end')
  async end(@CurrentUser() actor: AuthUser) {
    if (!actor.supportSessionId) throw new UnauthorizedException('This is not an admin support session.');
    const [row] = await this.db.update(lenderSupportSessions).set({ revokedAt: new Date() }).where(eq(lenderSupportSessions.id, actor.supportSessionId)).returning();
    if (row) await this.audit.log({ id: row.adminUserId, email: actor.supportAdminEmail ?? null, roles: ['ADMIN'] }, 'admin.lender_support_ended', 'lender_support_session', row.id, { lenderUserId: actor.id, supportSessionId: row.id });
    return { ok: true };
  }
}
