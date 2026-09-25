import { Injectable } from '@nestjs/common';
import { eq, like, sql } from 'drizzle-orm';
import { ledgerEntries, ledgerJournals } from '../db/schema';
import { Db, DbOrTx } from '../db/client';
import { InjectDb } from './db.module';

/** Chart of accounts. Positive = debit, negative = credit. Every journal sums to zero. */
export const Accounts = {
  bank: 'asset:bank_settlement',
  merchantSettlement: 'liability:merchant_settlement',
  consumerWallet: (userId: string) => `liability:consumer_wallet:${userId}`,
  lenderFunds: (lenderId: string) => `liability:lender_funds:${lenderId}`,
  affiliatePayable: (userId: string) => `liability:affiliate_payable:${userId}`,
  platformRevenue: 'income:platform_revenue',
  commissionExpense: 'expense:affiliate_commission',
};

export interface LedgerLine {
  account: string;
  amountCents: number;
}

@Injectable()
export class LedgerService {
  constructor(@InjectDb() private db: Db) {}

  async post(
    conn: DbOrTx,
    journal: { type: string; refType: string; refId: string; memo?: string },
    lines: LedgerLine[],
  ) {
    const nonZero = lines.filter((l) => l.amountCents !== 0);
    const sum = nonZero.reduce((s, l) => s + l.amountCents, 0);
    if (sum !== 0) throw new Error(`Unbalanced journal ${journal.type}: sums to ${sum}`);
    if (!nonZero.length) return;
    const [j] = await conn.insert(ledgerJournals).values(journal).returning({ id: ledgerJournals.id });
    await conn.insert(ledgerEntries).values(nonZero.map((l) => ({ journalId: j.id, account: l.account, amountCents: l.amountCents })));
  }

  async balance(account: string, conn: DbOrTx = this.db): Promise<number> {
    const [r] = await conn
      .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amountCents}), 0)` })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.account, account));
    return Number(r.total);
  }

  async balanceByPrefix(prefix: string, conn: DbOrTx = this.db): Promise<number> {
    const [r] = await conn
      .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amountCents}), 0)` })
      .from(ledgerEntries)
      .where(like(ledgerEntries.account, `${prefix}%`));
    return Number(r.total);
  }

  /** Trial balance — should always be zero. Exposed to admin for reconciliation. */
  async trialBalance(conn: DbOrTx = this.db): Promise<number> {
    const [r] = await conn.select({ total: sql<string>`coalesce(sum(${ledgerEntries.amountCents}), 0)` }).from(ledgerEntries);
    return Number(r.total);
  }
}
