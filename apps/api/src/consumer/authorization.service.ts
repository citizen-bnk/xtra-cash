import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import { addMonths, quoteLoan } from '@xtra/shared';
import { InjectDb } from '../common/db.module';
import { Db, Tx } from '../db/client';
import { cardTransactions, cards, installments, lenderOrgs, loans, users } from '../db/schema';
import { Accounts, LedgerService } from '../common/ledger.service';
import { CommissionService } from '../affiliate/commission.service';
import { CreditService } from './credit.service';
import { allocate } from './credit-engine';

export interface AuthorizeInput {
  /** Either our card id (in-app / simulation) or the processor's card reference (network webhook). */
  cardId?: string;
  processorRef?: string;
  /** When set, the card must belong to this user. */
  userId?: string;
  amountCents: number;
  merchantName: string;
  merchantCategory?: string | null;
  channel: 'ONLINE' | 'IN_STORE' | 'MARKETPLACE';
  idempotencyKey: string;
  networkRef?: string | null;
}

class Decline extends Error {}

/**
 * Point-of-payment decision engine ("XTRA-CASH at the till").
 *
 * The consumer's own wallet pays first. Any shortfall is funded instantly by one or more
 * micro-lender offers the consumer qualifies for (cheapest first, affordability-capped),
 * creating a loan with a fixed installment schedule. Everything happens in one DB transaction
 * with the consumer row locked, so concurrent swipes can't overspend wallet or lender funds.
 */
@Injectable()
export class AuthorizationService {
  private log = new Logger(AuthorizationService.name);

  constructor(
    @InjectDb() private db: Db,
    private credit: CreditService,
    private ledger: LedgerService,
    private commissions: CommissionService,
  ) {}

  async authorize(input: AuthorizeInput) {
    const prior = await this.findByKey(input.idempotencyKey);
    if (prior) return prior;

    const card = await this.db.query.cards.findFirst({
      where: input.cardId ? eq(cards.id, input.cardId) : eq(cards.processorRef, input.processorRef ?? '__none__'),
    });
    if (!card || (input.userId && card.userId !== input.userId)) throw new NotFoundException('Card not found');

    try {
      const txId = await this.db.transaction(async (tx) => this.approve(tx, card, input));
      return (await this.findByKey(input.idempotencyKey, txId))!;
    } catch (e: any) {
      if (e?.code === '23505' && String(e?.constraint ?? '').includes('idempotency')) {
        return (await this.findByKey(input.idempotencyKey))!;
      }
      if (!(e instanceof Decline)) throw e;
      await this.db
        .insert(cardTransactions)
        .values({
          cardId: card.id,
          userId: card.userId,
          merchantName: input.merchantName,
          merchantCategory: input.merchantCategory ?? null,
          channel: input.channel,
          amountCents: input.amountCents,
          status: 'DECLINED',
          declineReason: e.message,
          idempotencyKey: input.idempotencyKey,
          networkRef: input.networkRef ?? null,
        })
        .onConflictDoNothing({ target: cardTransactions.idempotencyKey });
      return (await this.findByKey(input.idempotencyKey))!;
    }
  }

  private async approve(tx: Tx, card: typeof cards.$inferSelect, input: AuthorizeInput): Promise<string> {
    // Serialise all money movement for this consumer.
    const [user] = await tx.select().from(users).where(eq(users.id, card.userId)).for('update');
    if (card.status !== 'ACTIVE') throw new Decline(card.status === 'FROZEN' ? 'Card is frozen' : 'Card is not active');
    if (user.status !== 'ACTIVE') throw new Decline('Account suspended');
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Decline('Invalid amount');

    const fromWallet = Math.min(user.walletBalanceCents, input.amountCents);
    const shortfall = input.amountCents - fromWallet;

    let plan: ReturnType<typeof allocate>['allocations'] = [];
    if (shortfall > 0) {
      const ctx = await this.credit.context(user.id, tx);
      if (!ctx.profile) throw new Decline(ctx.reasonIfNone ?? 'Credit not available');
      const result = allocate(ctx.eligible, shortfall, ctx.affordableCents);
      if (result.remainderCents > 0) throw new Decline('Insufficient XTRA-Balance');
      plan = result.allocations;
    }

    const [txn] = await tx
      .insert(cardTransactions)
      .values({
        cardId: card.id,
        userId: user.id,
        merchantName: input.merchantName,
        merchantCategory: input.merchantCategory ?? null,
        channel: input.channel,
        amountCents: input.amountCents,
        fromWalletCents: fromWallet,
        fromCreditCents: shortfall,
        status: 'APPROVED',
        idempotencyKey: input.idempotencyKey,
        networkRef: input.networkRef ?? null,
      })
      .returning({ id: cardTransactions.id });

    if (fromWallet > 0) {
      const debited = await tx
        .update(users)
        .set({ walletBalanceCents: sql`${users.walletBalanceCents} - ${fromWallet}` })
        .where(and(eq(users.id, user.id), gte(users.walletBalanceCents, fromWallet)))
        .returning({ id: users.id });
      if (!debited.length) throw new Decline('Wallet balance changed, please retry');
    }

    const now = new Date();
    for (const a of plan) {
      const reserved = await tx
        .update(lenderOrgs)
        .set({ availableCents: sql`${lenderOrgs.availableCents} - ${a.principalCents}` })
        .where(and(eq(lenderOrgs.id, a.offer.lenderId), gte(lenderOrgs.availableCents, a.principalCents)))
        .returning({ id: lenderOrgs.id });
      if (!reserved.length) throw new Decline('Lender funds changed, please retry');

      const q = quoteLoan(a.principalCents, a.offer);
      const [loan] = await tx
        .insert(loans)
        .values({
          userId: user.id,
          offerId: a.offer.offerId,
          lenderId: a.offer.lenderId,
          transactionId: txn.id,
          principalCents: a.principalCents,
          monthlyInterestRateBps: a.offer.monthlyInterestRateBps,
          termMonths: a.offer.termMonths,
          initiationFeeCents: a.offer.initiationFeeCents,
          monthlyServiceFeeCents: a.offer.monthlyServiceFeeCents,
          totalRepayableCents: q.totalRepayableCents,
          outstandingCents: q.totalRepayableCents,
        })
        .returning({ id: loans.id });
      await tx.insert(installments).values(
        q.schedule.map((i) => ({ loanId: loan.id, seq: i.seq, dueDate: addMonths(now, i.seq), amountCents: i.amountCents })),
      );
      await this.commissions.award(tx, { sourceUserId: user.id, type: 'LOAN_ORIGINATION', eventId: loan.id, baseAmountCents: a.principalCents });
    }

    await this.ledger.post(tx, { type: 'card_purchase', refType: 'card_transaction', refId: txn.id, memo: input.merchantName }, [
      { account: Accounts.consumerWallet(user.id), amountCents: fromWallet },
      ...plan.map((a) => ({ account: Accounts.lenderFunds(a.offer.lenderId), amountCents: a.principalCents })),
      { account: Accounts.merchantSettlement, amountCents: -input.amountCents },
    ]);

    this.log.log(`Approved ${txn.id}: R${input.amountCents / 100} (wallet ${fromWallet}, credit ${shortfall}, ${plan.length} loan(s))`);
    return txn.id;
  }

  async findByKey(idempotencyKey: string, id?: string) {
    const t = await this.db.query.cardTransactions.findFirst({
      where: id ? eq(cardTransactions.id, id) : eq(cardTransactions.idempotencyKey, idempotencyKey),
      with: { loans: { columns: { id: true, principalCents: true }, with: { lender: { columns: { name: true } } } } },
    });
    if (!t) return null;
    return {
      ...t,
      loans: t.loans.map((l) => ({ id: l.id, principalCents: l.principalCents, lenderName: l.lender.name })),
    };
  }
}
