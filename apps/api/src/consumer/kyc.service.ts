import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { ageOn, parseSaId, PROVINCES } from '@xtra/shared';
import { InjectDb } from '../common/db.module';
import { Db, DbOrTx } from '../db/client';
import { kycProfiles, users } from '../db/schema';
import { CREDIT_BUREAU } from '../integrations/integrations.module';
import type { CreditBureau } from '../integrations/credit-bureau';
import { CommissionService } from '../affiliate/commission.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth';
import { CardsService } from './cards.service';
import { KycDto } from './consumer.dto';

@Injectable()
export class KycService {
  constructor(
    @InjectDb() private db: Db,
    @Inject(CREDIT_BUREAU) private bureau: CreditBureau,
    private commissions: CommissionService,
    private cards: CardsService,
    private audit: AuditService,
  ) {}

  async submit(userId: string, dto: KycDto) {
    if (!dto.consentCreditCheck) throw new BadRequestException('Consent to a credit check is required to receive credit offers');
    if (!(PROVINCES as readonly string[]).includes(dto.province)) throw new BadRequestException('Unknown province');
    const id = parseSaId(dto.idNumber);
    if (!id.valid) throw new BadRequestException(id.reason);

    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundException();
    const existing = await this.db.query.kycProfiles.findFirst({ where: eq(kycProfiles.userId, userId) });
    if (existing?.status === 'VERIFIED' && existing.idNumber !== dto.idNumber) {
      throw new BadRequestException('Your ID number is already verified and cannot be changed. Contact support.');
    }
    const taken = await this.db.query.kycProfiles.findFirst({ where: and(eq(kycProfiles.idNumber, dto.idNumber), ne(kycProfiles.userId, userId)) });
    if (taken) throw new ConflictException('This ID number is already linked to another account');

    const bureau = await this.bureau.fetchScore({ idNumber: dto.idNumber, firstName: user.firstName, lastName: user.lastName });
    const age = ageOn(id.dateOfBirth!);

    // Automated checks. Production: add Home Affairs identity verification + liveness (e.g. Smile ID / VerifyID).
    let status: 'VERIFIED' | 'PENDING' | 'REJECTED' = 'VERIFIED';
    let rejectionReason: string | null = null;
    if (age < 18) {
      status = 'REJECTED';
      rejectionReason = 'You must be 18 or older to use XTRA-CASH credit';
    } else if (process.env.AUTO_KYC === 'false') {
      status = 'PENDING';
    }

    const values = {
      userId,
      idNumber: dto.idNumber,
      dateOfBirth: id.dateOfBirth!,
      province: dto.province,
      employmentStatus: dto.employmentStatus,
      employerName: dto.employerName ?? null,
      monthlyIncomeCents: dto.monthlyIncomeCents,
      monthlyExpensesCents: dto.monthlyExpensesCents,
      creditScore: bureau.score,
      bureauReference: bureau.reference,
      consentAt: new Date(),
      status,
      rejectionReason,
      verifiedAt: status === 'VERIFIED' ? existing?.verifiedAt ?? new Date() : null,
    };

    const profile = await this.db.transaction(async (tx) => {
      const [p] = await tx
        .insert(kycProfiles)
        .values(values)
        .onConflictDoUpdate({ target: kycProfiles.userId, set: { ...values, updatedAt: new Date() } })
        .returning();
      await this.audit.log({ id: userId, email: user.email, roles: user.roles }, 'kyc.submitted', 'kyc', p.id, { status }, tx);
      if (status === 'VERIFIED') await this.onVerified(userId, tx);
      return p;
    });
    return profile;
  }

  /** Called on automatic or manual verification: first card + affiliate activation commission. */
  async onVerified(userId: string, conn: DbOrTx) {
    const u = await conn.query.users.findFirst({ where: eq(users.id, userId) });
    if (u && !u.roles.includes('CONSUMER')) {
      await conn.update(users).set({ roles: [...u.roles, 'CONSUMER'] }).where(eq(users.id, userId));
    }
    await this.cards.ensureCard(userId, conn);
    await this.commissions.award(conn, { sourceUserId: userId, type: 'CONSUMER_ACTIVATION', eventId: userId });
  }

  async decide(actor: AuthUser, userId: string, approve: boolean, reason?: string) {
    const kyc = await this.db.query.kycProfiles.findFirst({ where: eq(kycProfiles.userId, userId) });
    if (!kyc) throw new NotFoundException('No KYC submission for this user');
    if (!approve && !reason) throw new BadRequestException('A reason is required when rejecting');
    return this.db.transaction(async (tx) => {
      const [p] = await tx
        .update(kycProfiles)
        .set({
          status: approve ? 'VERIFIED' : 'REJECTED',
          rejectionReason: approve ? null : reason,
          verifiedAt: approve ? new Date() : null,
        })
        .where(eq(kycProfiles.userId, userId))
        .returning();
      if (approve) await this.onVerified(userId, tx);
      await this.audit.log(actor, approve ? 'kyc.approved' : 'kyc.rejected', 'kyc', p.id, { userId, reason }, tx);
      return p;
    });
  }
}
