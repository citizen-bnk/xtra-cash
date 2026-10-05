import { BadRequestException, Body, Controller, Delete, Get, Put } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { InjectDb } from '../common/db.module';
import type { Db } from '../db/client';
import { kycProfiles, personalLoanApplications, personalVerifications, serviceDrafts, users } from '../db/schema';
import { decryptIdentity, encryptIdentity } from '../auth/identity-crypto';
import { EMPLOYMENT_LABELS, PROVINCES } from '@xtra/shared';

const money = z.number().int().min(0).max(100000000).nullable().optional();
export const draftSchema = z.object({
  amount: z.number().int().min(50000).max(10000000).nullable().optional(), term: z.number().int().min(1).max(24).optional(), purpose: z.string().max(100).optional(), income: money, expenses: money,
  identityType: z.enum(['ID', 'PASSPORT']).optional(), identityNumber: z.string().max(20).optional(), dob: z.string().max(10).optional(), province: z.string().max(40).optional(), employment: z.string().max(30).optional(), mobile: z.string().max(20).optional(), address: z.string().max(300).optional(),
});
class DraftDto { @IsObject() answers: Record<string, unknown>; }

@Controller('me/service-profile')
export class ServiceProfileController {
  constructor(@InjectDb() private db: Db) {}
  @Get()
  async get(@CurrentUser() u: AuthUser) {
    const [user, kyc, verification, lastApplication, draft] = await Promise.all([
      this.db.query.users.findFirst({ where: eq(users.id, u.id) }),
      this.db.query.kycProfiles.findFirst({ where: eq(kycProfiles.userId, u.id) }),
      this.db.query.personalVerifications.findFirst({ where: eq(personalVerifications.userId, u.id) }),
      this.db.query.personalLoanApplications.findFirst({ where: eq(personalLoanApplications.userId, u.id), orderBy: desc(personalLoanApplications.createdAt) }),
      this.db.query.serviceDrafts.findFirst({ where: eq(serviceDrafts.userId, u.id) }),
    ]);
    const answers = draft && Date.now() - draft.updatedAt.getTime() < 30 * 86400000 ? draftSchema.parse(JSON.parse(decryptIdentity(draft.encrypted))) : {};
    const rawIdentity = user?.identityEncrypted ? decryptIdentity(user.identityEncrypted) : kyc?.idNumber?.replace(/^PASSPORT:/, '') || verification?.identityNumber || '';
    const finance = lastApplication && (!kyc || lastApplication.createdAt >= kyc.updatedAt) ? { income: lastApplication.monthlyIncomeCents, expenses: lastApplication.monthlyExpensesCents, date: lastApplication.createdAt } : { income: kyc?.monthlyIncomeCents ?? null, expenses: kyc?.monthlyExpensesCents ?? null, date: kyc?.updatedAt ?? null };
    return {
      firstName: user?.firstName || '', lastName: user?.lastName || '',
      identityType: user?.identityType || (kyc?.idNumber?.startsWith('PASSPORT:') ? 'PASSPORT' : verification?.identityType || 'ID'),
      identityNumber: rawIdentity, identityStatus: kyc?.status || 'NOT_STARTED',
      dateOfBirth: kyc?.dateOfBirth?.toISOString().slice(0, 10) || '',
      province: kyc?.province || '', employment: kyc?.employmentStatus || '',
      mobile: verification?.mobile || user?.phone || '', address: verification?.address || '',
      income: finance.income, expenses: finance.expenses,
      financialUpdatedAt: finance.date,
      documentStatus: verification?.status || 'NOT_STARTED',
      source: rawIdentity ? 'account-or-verification' : 'missing',
      draft: answers, draftUpdatedAt: draft?.updatedAt || null,
    };
  }
  @Put('draft')
  async save(@CurrentUser() u: AuthUser, @Body() dto: DraftDto) {
    const parsed = draftSchema.safeParse(dto.answers);
    if (!parsed.success) throw new BadRequestException('Check your draft answers');
    const answers = parsed.data;
    if (answers.province && !(PROVINCES as readonly string[]).includes(answers.province)) throw new BadRequestException('Unknown province');
    if (answers.employment && !Object.keys(EMPLOYMENT_LABELS).includes(answers.employment)) throw new BadRequestException('Unknown employment status');
    await this.db.insert(serviceDrafts).values({ userId: u.id, encrypted: encryptIdentity(JSON.stringify(answers)), updatedAt: new Date() }).onConflictDoUpdate({ target: serviceDrafts.userId, set: { encrypted: encryptIdentity(JSON.stringify(answers)), updatedAt: new Date() } });
    return { ok: true };
  }
  @Delete('draft') async discard(@CurrentUser() u: AuthUser) {
    await this.db.delete(serviceDrafts).where(eq(serviceDrafts.userId, u.id));
    return { ok: true };
  }
}
