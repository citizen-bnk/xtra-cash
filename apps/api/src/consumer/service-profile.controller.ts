import { BadRequestException, Body, Controller, Delete, Get, Put } from '@nestjs/common';
import { IsObject } from 'class-validator';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth';
import { InjectDb } from '../common/db.module';
import type { Db } from '../db/client';
import { kycProfiles, personalVerifications, serviceDrafts, users } from '../db/schema';
import { decryptIdentity, encryptIdentity } from '../auth/identity-crypto';
import { EMPLOYMENT_LABELS, PROVINCES } from '@xtra/shared';

const money = z.number().int().min(0).max(100000000).nullable().optional();
export const draftSchema = z.object({
  idempotencyKey: z.string().uuid().optional(),
  amount: z.number().int().min(50000).max(10000000).nullable().optional(), term: z.number().int().min(1).max(24).optional(), purpose: z.string().max(100).optional(), income: money, expenses: money,
  identityType: z.enum(['ID', 'PASSPORT']).optional(), identityNumber: z.string().max(20).optional(), dob: z.string().max(10).optional(), province: z.string().max(40).optional(), employment: z.string().max(30).optional(), mobile: z.string().max(20).optional(), address: z.string().max(300).optional(),
});
class DraftDto { @IsObject() answers: Record<string, unknown>; }

@Controller('me/service-profile')
export class ServiceProfileController {
  constructor(@InjectDb() private db: Db) {}
  @Get()
  async get(@CurrentUser() u: AuthUser) {
    const [user, kyc, verification, draft] = await Promise.all([
      this.db.query.users.findFirst({ where: eq(users.id, u.id) }),
      this.db.query.kycProfiles.findFirst({ where: eq(kycProfiles.userId, u.id) }),
      this.db.query.personalVerifications.findFirst({ where: eq(personalVerifications.userId, u.id) }),
      this.db.query.serviceDrafts.findFirst({ where: eq(serviceDrafts.userId, u.id) }),
    ]);
    const answers = draft && Date.now() - draft.updatedAt.getTime() < 30 * 86400000 ? draftSchema.parse(JSON.parse(decryptIdentity(draft.encrypted))) : {};
    const rawIdentity = user?.identityEncrypted ? decryptIdentity(user.identityEncrypted) : kyc?.idNumber?.replace(/^PASSPORT:/, '') || verification?.identityNumber || '';
    return {
      userId: u.id,
      firstName: user?.firstName || '', lastName: user?.lastName || '',
      identityType: user?.identityType || (kyc?.idNumber?.startsWith('PASSPORT:') ? 'PASSPORT' : verification?.identityType || 'ID'),
      identityNumber: rawIdentity, identityStatus: kyc?.status || 'NOT_STARTED',
      dateOfBirth: kyc?.dateOfBirth?.toISOString().slice(0, 10) || '',
      province: kyc?.province || '', employment: kyc?.employmentStatus || '',
      mobile: verification?.mobile || user?.phone || '', address: verification?.address || '',
      income: kyc?.monthlyIncomeCents ?? null, expenses: kyc?.monthlyExpensesCents ?? null,
      financialUpdatedAt: kyc?.updatedAt ?? null,
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
    await this.db.transaction(async tx => {
      await tx.insert(serviceDrafts).values({ userId: u.id, encrypted: encryptIdentity(JSON.stringify(answers)), updatedAt: new Date() }).onConflictDoUpdate({ target: serviceDrafts.userId, set: { encrypted: encryptIdentity(JSON.stringify(answers)), updatedAt: new Date() } });
      // Financial profile answers become the account's current self-declared values as they are saved.
      // They remain distinct from lender/bureau verification and are always scoped to the signed-in user.
      if (typeof answers.income === 'number' || typeof answers.expenses === 'number') {
        const current = await tx.query.kycProfiles.findFirst({ where: eq(kycProfiles.userId, u.id) });
        if (current) await tx.update(kycProfiles).set({ ...(typeof answers.income === 'number' ? { monthlyIncomeCents: answers.income } : {}), ...(typeof answers.expenses === 'number' ? { monthlyExpensesCents: answers.expenses } : {}), updatedAt: new Date() }).where(eq(kycProfiles.userId, u.id));
      }
    });
    return { ok: true };
  }
  @Delete('draft') async discard(@CurrentUser() u: AuthUser) {
    await this.db.delete(serviceDrafts).where(eq(serviceDrafts.userId, u.id));
    return { ok: true };
  }
}
