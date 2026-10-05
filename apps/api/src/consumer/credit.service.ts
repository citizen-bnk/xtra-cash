import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { addMonths, quoteLoan, type MatchedOffer, type QuoteResponse, type XtraBalance } from '@xtra/shared';
import { InjectDb } from '../common/db.module';
import { Db, DbOrTx } from '../db/client';
import { kycProfiles, lenderOrgs, loanOffers, loans, users } from '../db/schema';
import { SettingsService } from '../common/settings.service';
import {
  affordableInstallmentCents,
  allocate,
  CandidateOffer,
  ConsumerProfile,
  ineligibilityReason,
  offerCapacity,
  costRank,
} from './credit-engine';

export interface CreditContext {
  profile: ConsumerProfile | null;
  walletCents: number;
  eligible: CandidateOffer[];
  affordableCents: number;
  reasonIfNone: string | null;
}

const OPEN_LOAN = ['ACTIVE', 'IN_ARREARS'] as const;

@Injectable()
export class CreditService {
  constructor(@InjectDb() private db: Db, private settings: SettingsService) {}

  /** Loads everything needed for a credit decision. Call inside the authorisation transaction. */
  async context(userId: string, conn: DbOrTx = this.db, productType: 'BNPL' | 'PERSONAL' = 'BNPL', declared?: { monthlyIncomeCents: number; monthlyExpensesCents: number }): Promise<CreditContext> {
    const user = await conn.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundException('User not found');
    const kyc = await conn.query.kycProfiles.findFirst({ where: eq(kycProfiles.userId, userId) });
    const base = { walletCents: user.walletBalanceCents, eligible: [], affordableCents: 0 };

    if (user.status !== 'ACTIVE') return { ...base, profile: null, reasonIfNone: 'Your account is suspended.' };
    if (!kyc || kyc.status !== 'VERIFIED') {
      return { ...base, profile: null, reasonIfNone: 'Complete your profile verification (KYC) to unlock XTRA-CASH credit offers.' };
    }
    const profile: ConsumerProfile = {
      dateOfBirth: kyc.dateOfBirth,
      province: kyc.province,
      employmentStatus: kyc.employmentStatus,
      monthlyIncomeCents: kyc.monthlyIncomeCents,
      monthlyExpensesCents: kyc.monthlyExpensesCents,
      creditScore: kyc.creditScore,
      ...declared,
    };

    const open = await conn.query.loans.findMany({ where: and(eq(loans.userId, userId), inArray(loans.status, [...OPEN_LOAN])) });
    if (open.some((l) => l.status === 'IN_ARREARS')) {
      return { ...base, profile, reasonIfNone: 'You have an overdue installment. Settle it to unlock new credit.' };
    }
    const existingInstallments = open.reduce((s, l) => s + quoteLoan(l.principalCents, l).monthlyInstallmentCents, 0);
    const openByOffer = new Map<string, number>();
    for (const l of open) openByOffer.set(l.offerId, (openByOffer.get(l.offerId) ?? 0) + l.principalCents);

    const s = await this.settings.get(conn);
    const affordable = affordableInstallmentCents(profile, existingInstallments, s.affordabilityRatioBps);

    const rows = await conn
      .select({ offer: loanOffers, lenderName: lenderOrgs.name, lenderAvailable: lenderOrgs.availableCents })
      .from(loanOffers)
      .innerJoin(lenderOrgs, eq(loanOffers.lenderId, lenderOrgs.id))
      .where(and(eq(loanOffers.active, true), eq(loanOffers.productType, productType), eq(lenderOrgs.accreditationStatus, 'ACCREDITED'), sql`${lenderOrgs.ownerUserId} <> ${userId}`));

    const eligible = rows
      .map<CandidateOffer>(({ offer, lenderName, lenderAvailable }) => ({
        offerId: offer.id,
        offerName: offer.name,
        lenderId: offer.lenderId,
        lenderName,
        monthlyInterestRateBps: offer.monthlyInterestRateBps,
        termMonths: offer.termMonths,
        initiationFeeCents: offer.initiationFeeCents,
        monthlyServiceFeeCents: offer.monthlyServiceFeeCents,
        minAmountCents: offer.minAmountCents,
        maxAmountPerUserCents: offer.maxAmountPerUserCents,
        minMonthlyIncomeCents: offer.minMonthlyIncomeCents,
        minCreditScore: offer.minCreditScore,
        minAge: offer.minAge,
        maxAge: offer.maxAge,
        employmentStatuses: offer.employmentStatuses,
        provinces: offer.provinces,
        lenderAvailableCents: lenderAvailable,
        userOpenPrincipalCents: openByOffer.get(offer.id) ?? 0,
      }))
      .filter((o) => ineligibilityReason(profile, o) === null);

    let reasonIfNone: string | null = null;
    if (!rows.length) reasonIfNone = 'No lenders are offering credit right now. Check back soon.';
    else if (!eligible.length) reasonIfNone = 'None of the current lender offers match your profile yet.';
    else if (affordable <= 0) reasonIfNone = 'Your current commitments leave no room for new installments under responsible-lending rules.';

    return { profile, walletCents: user.walletBalanceCents, eligible, affordableCents: affordable, reasonIfNone };
  }

  async balance(userId: string): Promise<XtraBalance> {
    const ctx = await this.context(userId);
    const total = allocate(ctx.eligible, Infinity, ctx.affordableCents);
    const offers: MatchedOffer[] = ctx.eligible
      .map((o) => {
        const available = offerCapacity(o, ctx.affordableCents);
        const example = available > 0 ? quoteLoan(Math.min(100_000, available), o) : null;
        return {
          offerId: o.offerId,
          offerName: o.offerName,
          lenderId: o.lenderId,
          lenderName: o.lenderName,
          monthlyInterestRateBps: o.monthlyInterestRateBps,
          termMonths: o.termMonths,
          initiationFeeCents: o.initiationFeeCents,
          monthlyServiceFeeCents: o.monthlyServiceFeeCents,
          availableCents: available,
          exampleQuote: example && {
            principalCents: example.principalCents,
            monthlyInstallmentCents: example.monthlyInstallmentCents,
            totalRepayableCents: example.totalRepayableCents,
          },
          _rank: costRank(o),
        };
      })
      .sort((a, b) => a._rank - b._rank)
      .map(({ _rank, ...o }) => o);

    const creditCents = total.fundedCents;
    return {
      walletCents: ctx.walletCents,
      creditCents,
      xtraBalanceCents: ctx.walletCents + creditCents,
      affordableInstallmentCents: ctx.affordableCents,
      offers,
      reasonIfNone: creditCents > 0 ? null : ctx.reasonIfNone ?? 'No credit is available right now.',
    };
  }

  async quote(userId: string, offerId: string, amountCents: number): Promise<QuoteResponse> {
    const ctx = await this.context(userId);
    const offer = ctx.eligible.find((o) => o.offerId === offerId);
    if (!offer) throw new BadRequestException(ctx.reasonIfNone ?? 'This offer is not available to you');
    const cap = offerCapacity(offer, ctx.affordableCents);
    if (amountCents < offer.minAmountCents) throw new BadRequestException(`Minimum amount for this offer is R${offer.minAmountCents / 100}`);
    if (amountCents > cap) throw new BadRequestException(`You can borrow up to R${(cap / 100).toFixed(2)} from this offer`);
    const q = quoteLoan(amountCents, offer);
    const now = new Date();
    return {
      principalCents: q.principalCents,
      financedCents: q.financedCents,
      monthlyInstallmentCents: q.monthlyInstallmentCents,
      totalRepayableCents: q.totalRepayableCents,
      costOfCreditCents: q.costOfCreditCents,
      schedule: q.schedule.map((i) => ({ seq: i.seq, amountCents: i.amountCents, dueDate: addMonths(now, i.seq).toISOString() })),
    };
  }
}
