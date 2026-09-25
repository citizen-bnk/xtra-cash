import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, lt, ne, SQL, sql } from 'drizzle-orm';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { cardTransactions, installments, lenderOrgs, loans, repayments, users } from '../db/schema';
import { Accounts, LedgerService } from '../common/ledger.service';
import { SettingsService } from '../common/settings.service';
import { PAYMENT_GATEWAY } from '../integrations/integrations.module';
import type { PaymentGateway } from '../integrations/payments';
import { paginated, pageParams } from '../common/pagination';

type LoanRow = typeof loans.$inferSelect & {
  lender: { name: string };
  offer: { name: string };
  installments: (typeof installments.$inferSelect)[];
  user?: { id: string; firstName: string; lastName: string; email: string };
};

export function presentLoan(l: LoanRow, withSchedule = false) {
  const { lender, offer, installments: inst, ...rest } = l;
  const sorted = [...inst].sort((a, b) => a.seq - b.seq);
  return {
    ...rest,
    lenderName: lender.name,
    offerName: offer.name,
    nextDue: sorted.find((i) => i.status !== 'PAID') ?? null,
    ...(withSchedule ? { installments: sorted } : {}),
  };
}

const loanWith = {
  lender: { columns: { name: true } },
  offer: { columns: { name: true } },
  installments: true,
} as const;

@Injectable()
export class LoansService {
  constructor(
    @InjectDb() private db: Db,
    private ledger: LedgerService,
    private settings: SettingsService,
    @Inject(PAYMENT_GATEWAY) private gateway: PaymentGateway,
  ) {}

  async listForUser(userId: string) {
    const rows = await this.db.query.loans.findMany({ where: eq(loans.userId, userId), with: loanWith, orderBy: desc(loans.createdAt) });
    return rows.map((l) => presentLoan(l));
  }

  async getForUser(userId: string, loanId: string) {
    const l = await this.db.query.loans.findFirst({ where: and(eq(loans.id, loanId), eq(loans.userId, userId)), with: loanWith });
    if (!l) throw new NotFoundException('Loan not found');
    return presentLoan(l, true);
  }

  async page(filter: { userId?: string; lenderId?: string; status?: string }, q: { page?: any; pageSize?: any }) {
    const { page, pageSize, offset } = pageParams(q);
    const where: SQL[] = [];
    if (filter.userId) where.push(eq(loans.userId, filter.userId));
    if (filter.lenderId) where.push(eq(loans.lenderId, filter.lenderId));
    if (filter.status) where.push(eq(loans.status, filter.status as any));
    const cond = where.length ? and(...where) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db.query.loans.findMany({
        where: cond,
        with: { ...loanWith, user: { columns: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: desc(loans.createdAt),
        limit: pageSize,
        offset,
      }),
      this.db.select({ total: count() }).from(loans).where(cond),
    ]);
    return paginated(rows.map((l) => presentLoan(l)), total, page, pageSize);
  }

  async transactions(userId: string, q: { page?: any }) {
    const { page, pageSize, offset } = pageParams(q);
    const [rows, [{ total }]] = await Promise.all([
      this.db.query.cardTransactions.findMany({
        where: eq(cardTransactions.userId, userId),
        orderBy: desc(cardTransactions.createdAt),
        limit: pageSize,
        offset,
        with: { loans: { columns: { id: true, principalCents: true }, with: { lender: { columns: { name: true } } } } },
      }),
      this.db.select({ total: count() }).from(cardTransactions).where(eq(cardTransactions.userId, userId)),
    ]);
    const items = rows.map((t) => ({ ...t, loans: t.loans.map((l) => ({ id: l.id, principalCents: l.principalCents, lenderName: l.lender.name })) }));
    return paginated(items, total, page, pageSize);
  }

  /** Mock wallet top-up. Production: redirect to the pay-in gateway and credit on its signed webhook. */
  async topUp(userId: string, amountCents: number) {
    if (process.env.ENABLE_SIMULATION !== 'true') throw new ForbiddenException('Direct top-ups are disabled; use the payment page');
    const pay = await this.gateway.collect({ amountCents, reference: `TOPUP-${userId}`, payerUserId: userId });
    if (!pay.success) throw new BadRequestException('Payment failed');
    return this.db.transaction(async (tx) => {
      const [u] = await tx
        .update(users)
        .set({ walletBalanceCents: sql`${users.walletBalanceCents} + ${amountCents}` })
        .where(eq(users.id, userId))
        .returning({ walletBalanceCents: users.walletBalanceCents });
      await this.ledger.post(tx, { type: 'wallet_topup', refType: 'payment', refId: pay.providerRef }, [
        { account: Accounts.bank, amountCents },
        { account: Accounts.consumerWallet(userId), amountCents: -amountCents },
      ]);
      return u;
    });
  }

  /** Repays a loan from the consumer's wallet, oldest installment first. */
  async repay(userId: string, loanId: string, requestedCents: number, method = 'WALLET') {
    const s = await this.settings.get();
    await this.db.transaction(async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
      const [loan] = await tx.select().from(loans).where(and(eq(loans.id, loanId), eq(loans.userId, userId))).for('update');
      if (!loan) throw new NotFoundException('Loan not found');
      if (loan.status === 'SETTLED') throw new BadRequestException('This loan is already settled');
      const amount = Math.min(requestedCents, loan.outstandingCents);
      if (user.walletBalanceCents < amount) {
        throw new BadRequestException('Not enough money in your wallet. Top up first.');
      }

      const open = await tx
        .select()
        .from(installments)
        .where(and(eq(installments.loanId, loanId), ne(installments.status, 'PAID')))
        .orderBy(asc(installments.seq));
      let left = amount;
      for (const i of open) {
        if (left <= 0) break;
        const pay = Math.min(left, i.amountCents - i.paidCents);
        left -= pay;
        const paid = i.paidCents + pay;
        await tx
          .update(installments)
          .set({ paidCents: paid, status: paid >= i.amountCents ? 'PAID' : i.status })
          .where(eq(installments.id, i.id));
      }

      const platformShare = Math.floor((amount * s.platformShareBps) / 10_000);
      const lenderShare = amount - platformShare;
      const outstanding = loan.outstandingCents - amount;
      const [{ overdue }] = await tx
        .select({ overdue: count() })
        .from(installments)
        .where(and(eq(installments.loanId, loanId), eq(installments.status, 'OVERDUE')));

      await tx
        .update(loans)
        .set({
          outstandingCents: outstanding,
          status: outstanding <= 0 ? 'SETTLED' : overdue > 0 ? loan.status : loan.status === 'IN_ARREARS' ? 'ACTIVE' : loan.status,
          settledAt: outstanding <= 0 ? new Date() : null,
        })
        .where(eq(loans.id, loanId));
      await tx.update(users).set({ walletBalanceCents: sql`${users.walletBalanceCents} - ${amount}` }).where(eq(users.id, userId));
      await tx.update(lenderOrgs).set({ availableCents: sql`${lenderOrgs.availableCents} + ${lenderShare}` }).where(eq(lenderOrgs.id, loan.lenderId));
      const [r] = await tx
        .insert(repayments)
        .values({ loanId, amountCents: amount, lenderShareCents: lenderShare, platformShareCents: platformShare, method })
        .returning({ id: repayments.id });
      await this.ledger.post(tx, { type: 'loan_repayment', refType: 'repayment', refId: r.id }, [
        { account: Accounts.consumerWallet(userId), amountCents: amount },
        { account: Accounts.lenderFunds(loan.lenderId), amountCents: -lenderShare },
        { account: Accounts.platformRevenue, amountCents: -platformShare },
      ]);
    });
    return this.getForUser(userId, loanId);
  }

  /** Marks missed installments overdue and flags loans in arrears (runs daily, or on demand by admin). */
  async runArrears(now = new Date()) {
    return this.db.transaction(async (tx) => {
      const overdue = await tx
        .update(installments)
        .set({ status: 'OVERDUE' })
        .where(and(eq(installments.status, 'DUE'), lt(installments.dueDate, now)))
        .returning({ loanId: installments.loanId });
      const loanIds = [...new Set(overdue.map((o) => o.loanId))];
      let flagged = 0;
      if (loanIds.length) {
        const r = await tx
          .update(loans)
          .set({ status: 'IN_ARREARS' })
          .where(and(inArray(loans.id, loanIds), eq(loans.status, 'ACTIVE')))
          .returning({ id: loans.id });
        flagged = r.length;
      }
      // 90+ days overdue => default (reported to lender; collections/bureau listing handled off-platform).
      const cutoff = new Date(now.getTime() - 90 * 86_400_000);
      const defaulted = await tx
        .select({ loanId: installments.loanId })
        .from(installments)
        .where(and(eq(installments.status, 'OVERDUE'), lt(installments.dueDate, cutoff)));
      if (defaulted.length) {
        await tx
          .update(loans)
          .set({ status: 'DEFAULTED' })
          .where(and(inArray(loans.id, [...new Set(defaulted.map((d) => d.loanId))]), eq(loans.status, 'IN_ARREARS')));
      }
      return { overdueInstallments: overdue.length, loansInArrears: flagged };
    });
  }

  /** Sum of repayments received by a lender (for lender stats). */
  async lenderRepaid(lenderId: string) {
    const [r] = await this.db
      .select({ total: sql<string>`coalesce(sum(${repayments.lenderShareCents}), 0)` })
      .from(repayments)
      .innerJoin(loans, eq(repayments.loanId, loans.id))
      .where(eq(loans.lenderId, lenderId));
    return Number(r.total);
  }
}

