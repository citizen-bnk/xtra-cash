import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { affiliateProfiles, commissions, kycProfiles, payouts, users } from '../db/schema';
import { SettingsService } from '../common/settings.service';
import { AuditService } from '../common/audit.service';
import { Accounts, LedgerService } from '../common/ledger.service';
import type { AuthUser } from '../common/auth';

export class PayoutDto {
  @IsInt() @Min(100) @Max(100_000_000) amountCents: number;
}
export class BankDto {
  @IsString() @MinLength(2) @MaxLength(60) bankName: string;
  @Matches(/^\d{6,16}$/, { message: 'bankAccountNumber must be 6–16 digits' }) bankAccountNumber: string;
}

@Injectable()
export class AffiliateService {
  constructor(
    @InjectDb() private db: Db,
    private settings: SettingsService,
    private audit: AuditService,
    private ledger: LedgerService,
  ) {}

  private async profile(userId: string) {
    const p = await this.db.query.affiliateProfiles.findFirst({ where: eq(affiliateProfiles.userId, userId) });
    if (!p) throw new NotFoundException('Join the affiliate programme first');
    return p;
  }

  async join(user: AuthUser) {
    await this.db.transaction(async (tx) => {
      const [u] = await tx.select().from(users).where(eq(users.id, user.id)).for('update');
      if (!u.roles.includes('AFFILIATE')) await tx.update(users).set({ roles: [...u.roles, 'AFFILIATE'] }).where(eq(users.id, user.id));
      await tx.insert(affiliateProfiles).values({ userId: user.id }).onConflictDoNothing({ target: affiliateProfiles.userId });
    });
    return this.summary(user.id);
  }

  async summary(userId: string) {
    const p = await this.profile(userId);
    const [{ pending }] = await this.db
      .select({ pending: sql<string>`coalesce(sum(${commissions.amountCents}), 0)` })
      .from(commissions)
      .where(and(eq(commissions.affiliateId, userId), eq(commissions.status, 'PENDING')));
    const [{ refs }] = await this.db.select({ refs: sql<string>`count(*)` }).from(users).where(eq(users.referredById, userId));
    return {
      commissionBalanceCents: p.commissionBalanceCents,
      lifetimeEarnedCents: p.lifetimeEarnedCents,
      pendingCents: Number(pending),
      referrals: Number(refs),
      bankName: p.bankName,
      bankAccountNumber: p.bankAccountNumber,
    };
  }

  async referrals(userId: string) {
    await this.profile(userId);
    const rows = await this.db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        roles: users.roles,
        createdAt: users.createdAt,
        kycStatus: sql<string>`coalesce(${kycProfiles.status}::text, 'NOT_STARTED')`,
      })
      .from(users)
      .leftJoin(kycProfiles, eq(kycProfiles.userId, users.id))
      .where(eq(users.referredById, userId))
      .orderBy(desc(users.createdAt));
    // Privacy (POPIA): affiliates see first name + surname initial only.
    return rows.map((r) => ({ ...r, lastName: r.lastName ? `${r.lastName[0]}.` : '' }));
  }

  commissions(userId: string) {
    return this.db.query.commissions.findMany({ where: eq(commissions.affiliateId, userId), orderBy: desc(commissions.createdAt) });
  }

  payouts(userId: string) {
    return this.db.query.payouts.findMany({ where: eq(payouts.affiliateId, userId), orderBy: desc(payouts.createdAt) });
  }

  async saveBank(userId: string, dto: BankDto) {
    await this.profile(userId);
    await this.db.update(affiliateProfiles).set(dto).where(eq(affiliateProfiles.userId, userId));
    return this.summary(userId);
  }

  async requestPayout(user: AuthUser, amountCents: number) {
    const s = await this.settings.get();
    if (amountCents < s.minPayoutCents) throw new BadRequestException(`Minimum payout is R${s.minPayoutCents / 100}`);
    return this.db.transaction(async (tx) => {
      const [p] = await tx.select().from(affiliateProfiles).where(eq(affiliateProfiles.userId, user.id)).for('update');
      if (!p) throw new NotFoundException('Join the affiliate programme first');
      if (!p.bankName || !p.bankAccountNumber) throw new BadRequestException('Add your bank details first');
      const r = await tx
        .update(affiliateProfiles)
        .set({ commissionBalanceCents: sql`${affiliateProfiles.commissionBalanceCents} - ${amountCents}` })
        .where(and(eq(affiliateProfiles.id, p.id), gte(affiliateProfiles.commissionBalanceCents, amountCents)))
        .returning({ id: affiliateProfiles.id });
      if (!r.length) throw new BadRequestException('Amount exceeds your approved commission balance');
      const [payout] = await tx
        .insert(payouts)
        .values({ affiliateId: user.id, amountCents, bankName: p.bankName, bankAccountNumber: p.bankAccountNumber })
        .returning();
      await this.audit.log(user, 'payout.requested', 'payout', payout.id, { amountCents }, tx);
      return payout;
    });
  }

  // ---------- admin decisions ----------
  async decideCommission(actor: AuthUser, id: string, approve: boolean) {
    return this.db.transaction(async (tx) => {
      const [c] = await tx.select().from(commissions).where(eq(commissions.id, id)).for('update');
      if (!c) throw new NotFoundException();
      if (c.status !== 'PENDING') throw new BadRequestException('Already decided');
      const [updated] = await tx
        .update(commissions)
        .set({ status: approve ? 'APPROVED' : 'REJECTED' })
        .where(eq(commissions.id, id))
        .returning();
      if (approve) {
        await tx
          .update(affiliateProfiles)
          .set({
            commissionBalanceCents: sql`${affiliateProfiles.commissionBalanceCents} + ${c.amountCents}`,
            lifetimeEarnedCents: sql`${affiliateProfiles.lifetimeEarnedCents} + ${c.amountCents}`,
          })
          .where(eq(affiliateProfiles.userId, c.affiliateId));
        await this.ledger.post(tx, { type: 'commission', refType: 'commission', refId: c.id }, [
          { account: Accounts.commissionExpense, amountCents: c.amountCents },
          { account: Accounts.affiliatePayable(c.affiliateId), amountCents: -c.amountCents },
        ]);
      }
      await this.audit.log(actor, approve ? 'commission.approved' : 'commission.rejected', 'commission', id, { amountCents: c.amountCents }, tx);
      return updated;
    });
  }

  async decidePayout(actor: AuthUser, id: string, approve: boolean, reference?: string) {
    return this.db.transaction(async (tx) => {
      const [p] = await tx.select().from(payouts).where(eq(payouts.id, id)).for('update');
      if (!p) throw new NotFoundException();
      if (p.status !== 'REQUESTED') throw new BadRequestException('Already decided');
      if (approve && !reference) throw new BadRequestException('Enter the EFT payment reference');
      const [updated] = await tx
        .update(payouts)
        .set({ status: approve ? 'PAID' : 'REJECTED', reference: reference ?? null, decidedAt: new Date() })
        .where(eq(payouts.id, id))
        .returning();
      if (approve) {
        await this.ledger.post(tx, { type: 'affiliate_payout', refType: 'payout', refId: p.id }, [
          { account: Accounts.affiliatePayable(p.affiliateId), amountCents: p.amountCents },
          { account: Accounts.bank, amountCents: -p.amountCents },
        ]);
      } else {
        await tx
          .update(affiliateProfiles)
          .set({ commissionBalanceCents: sql`${affiliateProfiles.commissionBalanceCents} + ${p.amountCents}` })
          .where(eq(affiliateProfiles.userId, p.affiliateId));
      }
      await this.audit.log(actor, approve ? 'payout.paid' : 'payout.rejected', 'payout', id, { amountCents: p.amountCents, reference }, tx);
      return updated;
    });
  }
}
