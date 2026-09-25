import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { CommissionType } from '@xtra/shared';
import { formatZAR } from '@xtra/shared';
import { DbOrTx } from '../db/client';
import { affiliateProfiles, commissions, users } from '../db/schema';
import { SettingsService } from '../common/settings.service';

/**
 * Creates PENDING commissions for the affiliate who referred `sourceUserId`.
 * Idempotent per event through `dedupeKey`. Admin approval moves them to the affiliate's balance.
 */
@Injectable()
export class CommissionService {
  constructor(private settings: SettingsService) {}

  async award(
    conn: DbOrTx,
    input: { sourceUserId: string; type: CommissionType; eventId: string; baseAmountCents?: number },
  ): Promise<void> {
    const source = await conn.query.users.findFirst({ where: eq(users.id, input.sourceUserId) });
    if (!source?.referredById) return;
    const affiliate = await conn.query.users.findFirst({ where: eq(users.id, source.referredById) });
    if (!affiliate || !affiliate.roles.includes('AFFILIATE') || affiliate.status !== 'ACTIVE') return;

    const s = await this.settings.get(conn);
    let amount = 0;
    let description = '';
    const who = `${source.firstName} ${source.lastName}`;
    switch (input.type) {
      case 'CONSUMER_ACTIVATION':
        amount = s.commissionConsumerActivationCents;
        description = `${who} completed KYC and activated XTRA-CASH`;
        break;
      case 'LENDER_ACCREDITED':
        amount = s.commissionLenderAccreditedCents;
        description = `Lender onboarded by ${who} was accredited`;
        break;
      case 'LOAN_ORIGINATION':
        amount = Math.floor(((input.baseAmountCents ?? 0) * s.commissionLoanOriginationBps) / 10_000);
        description = `${who} used ${formatZAR(input.baseAmountCents ?? 0)} XTRA-CASH credit`;
        break;
    }
    if (amount <= 0) return;

    await conn
      .insert(affiliateProfiles)
      .values({ userId: affiliate.id })
      .onConflictDoNothing({ target: affiliateProfiles.userId });
    await conn
      .insert(commissions)
      .values({
        affiliateId: affiliate.id,
        sourceUserId: source.id,
        type: input.type,
        amountCents: amount,
        description,
        dedupeKey: `${input.type}:${input.eventId}`,
      })
      .onConflictDoNothing({ target: commissions.dedupeKey });
  }
}
