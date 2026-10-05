import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, arrayContains, count, desc, eq, gte, ilike, or, sql, SQL } from 'drizzle-orm';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import {
  accreditationDocuments,
  affiliateProfiles,
  auditLogs,
  cardTransactions,
  cards,
  commissions,
  kycProfiles,
  lenderFunding,
  lenderOrgs,
  loanOffers,
  loans,
  payouts,
  users,
  ledgerEntries, ledgerJournals, personalLoanApplications,
} from '../db/schema';
import { AuditService } from '../common/audit.service';
import { Accounts, LedgerService } from '../common/ledger.service';
import { paginated, pageParams, sanitizeUser } from '../common/pagination';
import type { AuthUser } from '../common/auth';
import { CommissionService } from '../affiliate/commission.service';
import { LenderService, presentDoc } from '../lender/lender.service';
import { LoansService, presentLoan } from '../consumer/loans.service';
import { AuthService } from '../auth/auth.service';

const num = (v: unknown) => Number(v ?? 0);
const userCols = { columns: { id: true, firstName: true, lastName: true, email: true } } as const;

@Injectable()
export class AdminService {
  constructor(
    @InjectDb() private db: Db,
    private audit: AuditService,
    private ledger: LedgerService,
    private commissions: CommissionService,
    private lenders: LenderService,
    private loans: LoansService,
    private auth: AuthService,
  ) {}

  async stats() {
    const since7 = new Date(Date.now() - 7 * 86_400_000);
    const since30 = new Date(Date.now() - 30 * 86_400_000);
    const [u] = await this.db
      .select({
        total: count(),
        consumers: sql`count(*) filter (where 'CONSUMER' = any(${users.roles}))`,
        lenders: sql`count(*) filter (where 'LENDER' = any(${users.roles}))`,
        affiliates: sql`count(*) filter (where 'AFFILIATE' = any(${users.roles}))`,
        new7: sql`count(*) filter (where ${users.createdAt} >= ${since7.toISOString()})`,
      })
      .from(users);
    const [[kyc], [lp], [fp], [pp], [cp]] = await Promise.all([
      this.db.select({ n: count() }).from(kycProfiles).where(eq(kycProfiles.status, 'PENDING')),
      this.db.select({ n: count() }).from(lenderOrgs).where(sql`${lenderOrgs.accreditationStatus} in ('SUBMITTED','UNDER_REVIEW')`),
      this.db.select({ n: count() }).from(lenderFunding).where(eq(lenderFunding.status, 'PENDING')),
      this.db.select({ n: count() }).from(payouts).where(eq(payouts.status, 'REQUESTED')),
      this.db.select({ n: count() }).from(commissions).where(eq(commissions.status, 'PENDING')),
    ]);
    const [l] = await this.db
      .select({
        active: sql`count(*) filter (where ${loans.status} = 'ACTIVE')`,
        arrears: sql`count(*) filter (where ${loans.status} = 'IN_ARREARS')`,
        outstanding: sql`coalesce(sum(${loans.outstandingCents}) filter (where ${loans.status} <> 'SETTLED'), 0)`,
        advanced: sql`coalesce(sum(${loans.principalCents}), 0)`,
      })
      .from(loans);
    const [t] = await this.db
      .select({
        n: sql`count(*) filter (where ${cardTransactions.status} = 'APPROVED')`,
        volume: sql`coalesce(sum(${cardTransactions.amountCents}) filter (where ${cardTransactions.status} = 'APPROVED'), 0)`,
        credit: sql`coalesce(sum(${cardTransactions.fromCreditCents}) filter (where ${cardTransactions.status} = 'APPROVED'), 0)`,
        declined: sql`count(*) filter (where ${cardTransactions.status} = 'DECLINED')`,
        all: count(),
      })
      .from(cardTransactions)
      .where(gte(cardTransactions.createdAt, since30));
    const [liq] = await this.db.select({ total: sql`coalesce(sum(${lenderOrgs.availableCents}), 0)` }).from(lenderOrgs);
    const daily = await this.db.execute<{ date: string; wallet: string; credit: string }>(sql`
      select to_char(d::date, 'YYYY-MM-DD') as date,
             coalesce(sum(t.from_wallet_cents), 0) as wallet,
             coalesce(sum(t.from_credit_cents), 0) as credit
      from generate_series(current_date - interval '29 days', current_date, interval '1 day') d
      left join card_transactions t on t.created_at::date = d::date and t.status = 'APPROVED'
      group by d order by d`);
    const revenue = -(await this.ledger.balance(Accounts.platformRevenue));
    const [applications] = await this.db.select({ n: count() }).from(personalLoanApplications);

    return {
      users: { total: u.total, consumers: num(u.consumers), lenders: num(u.lenders), affiliates: num(u.affiliates), newLast7Days: num(u.new7) },
      kycPending: kyc.n,
      lendersPendingReview: lp.n,
      fundingPending: fp.n,
      payoutsPending: pp.n,
      commissionsPending: cp.n,
      loans: { active: num(l.active), inArrears: num(l.arrears), outstandingCents: num(l.outstanding), advancedCents: num(l.advanced) },
      transactions: {
        last30DaysCount: num(t.n),
        last30DaysVolumeCents: num(t.volume),
        last30DaysCreditCents: num(t.credit),
        declineRate: t.all ? num(t.declined) / t.all : 0,
      },
      lenderLiquidityCents: num(liq.total),
      platformRevenueCents: revenue,
      personalApplications: applications.n,
      dailyVolume: daily.rows.map((r) => ({ date: r.date, walletCents: num(r.wallet), creditCents: num(r.credit) })),
    };
  }

  async users(q: { q?: string; role?: string; page?: string; pageSize?: string }) {
    const { page, pageSize, offset } = pageParams(q);
    const where: SQL[] = [];
    if (q.q) {
      const like = `%${q.q.trim()}%`;
      where.push(or(ilike(users.email, like), ilike(users.firstName, like), ilike(users.lastName, like), ilike(users.phone, like))!);
    }
    if (q.role) where.push(arrayContains(users.roles, [q.role as any]));
    const cond = where.length ? and(...where) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ user: users, kycStatus: sql<string>`coalesce(${kycProfiles.status}::text, 'NOT_STARTED')` })
        .from(users)
        .leftJoin(kycProfiles, eq(kycProfiles.userId, users.id))
        .where(cond)
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset(offset),
      this.db.select({ total: count() }).from(users).where(cond),
    ]);
    return paginated(rows.map((r) => ({ ...sanitizeUser(r.user), kycStatus: r.kycStatus })), total, page, pageSize);
  }

  async user(id: string) {
    const u = await this.db.query.users.findFirst({ where: eq(users.id, id), with: { kyc: true, lender: true, affiliate: true } });
    if (!u) throw new NotFoundException();
    const [userLoans, txs, userCards] = await Promise.all([
      this.db.query.loans.findMany({
        where: eq(loans.userId, id),
        with: { lender: { columns: { name: true } }, offer: { columns: { name: true } }, installments: true },
        orderBy: desc(loans.createdAt),
      }),
      this.db.query.cardTransactions.findMany({ where: eq(cardTransactions.userId, id), orderBy: desc(cardTransactions.createdAt), limit: 50 }),
      this.db.query.cards.findMany({ where: eq(cards.userId, id) }),
    ]);
    const { kyc, lender, affiliate, ...rest } = sanitizeUser(u);
    return {
      ...rest,
      kyc: kyc ?? null,
      lender: lender ?? null,
      affiliate: affiliate ?? null,
      loans: userLoans.map((l) => presentLoan(l)),
      transactions: txs,
      cards: userCards.map(({ processorRef: _p, ...c }) => c),
    };
  }

  async setUserStatus(actor: AuthUser, id: string, status: 'ACTIVE' | 'SUSPENDED') {
    if (id === actor.id) throw new BadRequestException('You cannot change your own status');
    const [u] = await this.db.update(users).set({ status }).where(eq(users.id, id)).returning();
    if (!u) throw new NotFoundException();
    if (status === 'SUSPENDED') {
      await this.auth.revokeAll(id);
      await this.db.update(cards).set({ status: 'FROZEN' }).where(and(eq(cards.userId, id), eq(cards.status, 'ACTIVE')));
    }
    await this.audit.log(actor, `user.${status.toLowerCase()}`, 'user', id);
    return sanitizeUser(u);
  }

  async setUserRoles(actor: AuthUser, id: string, roles: string[]) {
    if (id === actor.id && !roles.includes('SUPER_ADMIN')) throw new BadRequestException('You cannot remove your own super-admin role');
    const [u] = await this.db.update(users).set({ roles: roles as any }).where(eq(users.id, id)).returning();
    if (!u) throw new NotFoundException();
    if (roles.includes('AFFILIATE')) {
      await this.db.insert(affiliateProfiles).values({ userId: id }).onConflictDoNothing({ target: affiliateProfiles.userId });
    }
    await this.auth.revokeAll(id);
    await this.audit.log(actor, 'user.roles_changed', 'user', id, { roles });
    return sanitizeUser(u);
  }

  kycQueue(status = 'PENDING') {
    return this.db.query.kycProfiles.findMany({
      where: eq(kycProfiles.status, status as any),
      with: { user: userCols },
      orderBy: desc(kycProfiles.updatedAt),
      limit: 200,
    });
  }

  lendersList(status?: string) {
    return this.db.query.lenderOrgs.findMany({
      where: status ? eq(lenderOrgs.accreditationStatus, status as any) : undefined,
      with: { owner: userCols },
      orderBy: desc(lenderOrgs.updatedAt),
    });
  }

  async lender(id: string) {
    const l = await this.db.query.lenderOrgs.findFirst({
      where: eq(lenderOrgs.id, id),
      with: { documents: true, offers: true, funding: { orderBy: desc(lenderFunding.createdAt), limit: 50 }, owner: userCols },
    });
    if (!l) throw new NotFoundException();
    return { ...l, documents: l.documents.map((d) => ({ ...presentDoc(d), url: `/admin/lenders/${id}/documents/${d.id}/file` })), stats: await this.lenders.stats(id) };
  }

  async reviewLender(actor: AuthUser, id: string, status: string, notes?: string) {
    const allowed = ['UNDER_REVIEW', 'ACCREDITED', 'REJECTED', 'SUSPENDED'];
    if (!allowed.includes(status)) throw new BadRequestException('Invalid status');
    return this.db.transaction(async (tx) => {
      const [l] = await tx.select().from(lenderOrgs).where(eq(lenderOrgs.id, id)).for('update');
      if (!l) throw new NotFoundException();
      if (status === 'ACCREDITED') {
        if (l.assistedAccreditation && !l.accreditationFeePaid) throw new BadRequestException('The assisted accreditation fee has not been paid');
        if (!l.ncrNumber) throw new BadRequestException('Capture the lender NCR registration number before accrediting');
      }
      if ((status === 'REJECTED' || status === 'SUSPENDED') && !notes) throw new BadRequestException('Notes are required');
      const [updated] = await tx
        .update(lenderOrgs)
        .set({
          accreditationStatus: status as any,
          reviewNotes: notes ?? l.reviewNotes,
          accreditedAt: status === 'ACCREDITED' ? l.accreditedAt ?? new Date() : l.accreditedAt,
        })
        .where(eq(lenderOrgs.id, id))
        .returning();
      if (status === 'ACCREDITED') {
        await this.commissions.award(tx, { sourceUserId: l.ownerUserId, type: 'LENDER_ACCREDITED', eventId: l.id });
      }
      await this.audit.log(actor, `lender.${status.toLowerCase()}`, 'lender', id, { notes }, tx);
      return updated;
    });
  }

  /** Lets back-office staff capture the NCR number while helping an assisted lender. */
  async setLenderNcr(actor: AuthUser, id: string, ncrNumber: string) {
    const [l] = await this.db.update(lenderOrgs).set({ ncrNumber }).where(eq(lenderOrgs.id, id)).returning();
    if (!l) throw new NotFoundException();
    await this.audit.log(actor, 'lender.ncr_captured', 'lender', id, { ncrNumber });
    return l;
  }

  async reviewDocument(actor: AuthUser, lenderId: string, docId: string, status: 'ACCEPTED' | 'REJECTED') {
    const [d] = await this.db
      .update(accreditationDocuments)
      .set({ status })
      .where(and(eq(accreditationDocuments.id, docId), eq(accreditationDocuments.lenderId, lenderId)))
      .returning();
    if (!d) throw new NotFoundException();
    await this.audit.log(actor, `document.${status.toLowerCase()}`, 'document', docId, { lenderId });
    return presentDoc(d);
  }

  funding(status?: string) {
    return this.db.query.lenderFunding.findMany({
      where: status ? eq(lenderFunding.status, status as any) : undefined,
      with: { lender: { columns: { id: true, name: true } } },
      orderBy: desc(lenderFunding.createdAt),
      limit: 200,
    });
  }

  offers() {
    return this.db.query.loanOffers.findMany({ with: { lender: { columns: { id: true, name: true } } }, orderBy: desc(loanOffers.createdAt) });
  }

  async setOfferActive(actor: AuthUser, id: string, active: boolean) {
    const [o] = await this.db.update(loanOffers).set({ active }).where(eq(loanOffers.id, id)).returning();
    if (!o) throw new NotFoundException();
    await this.audit.log(actor, active ? 'offer.enabled' : 'offer.disabled', 'offer', id);
    return o;
  }

  async transactions(q: { page?: string; status?: string; userId?: string }) {
    const { page, pageSize, offset } = pageParams(q);
    const where: SQL[] = [];
    if (q.status) where.push(eq(cardTransactions.status, q.status as any));
    if (q.userId) where.push(eq(cardTransactions.userId, q.userId));
    const cond = where.length ? and(...where) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db.query.cardTransactions.findMany({ where: cond, with: { user: userCols }, orderBy: desc(cardTransactions.createdAt), limit: pageSize, offset }),
      this.db.select({ total: count() }).from(cardTransactions).where(cond),
    ]);
    return paginated(rows, total, page, pageSize);
  }

  commissionsList(status?: string) {
    return this.db.query.commissions.findMany({
      where: status ? eq(commissions.status, status as any) : undefined,
      with: { affiliate: userCols },
      orderBy: desc(commissions.createdAt),
      limit: 200,
    });
  }

  payoutsList(status?: string) {
    return this.db.query.payouts.findMany({
      where: status ? eq(payouts.status, status as any) : undefined,
      with: { affiliate: userCols },
      orderBy: desc(payouts.createdAt),
      limit: 200,
    });
  }

  async auditLog(q: { page?: string }) {
    const { page, pageSize, offset } = pageParams({ ...q, pageSize: 50 });
    const [rows, [{ total }]] = await Promise.all([
      this.db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(pageSize).offset(offset),
      this.db.select({ total: count() }).from(auditLogs),
    ]);
    return paginated(rows, total, page, pageSize);
  }

  async ledgerCheck() {
    return { trialBalanceCents: await this.ledger.trialBalance(), balanced: (await this.ledger.trialBalance()) === 0 };
  }
  async revenueDetails() {
    const [revenueCents, trialBalanceCents, entries] = await Promise.all([
      this.ledger.balance(Accounts.platformRevenue), this.ledger.trialBalance(),
      this.db.select({ id: ledgerEntries.id, amountCents: ledgerEntries.amountCents, type: ledgerJournals.type, reference: ledgerJournals.refId, memo: ledgerJournals.memo, createdAt: ledgerJournals.createdAt }).from(ledgerEntries).innerJoin(ledgerJournals, eq(ledgerEntries.journalId, ledgerJournals.id)).where(eq(ledgerEntries.account, Accounts.platformRevenue)).orderBy(desc(ledgerJournals.createdAt)).limit(100),
    ]);
    return { revenueCents: -revenueCents, trialBalanceCents, balanced: trialBalanceCents === 0, entries: entries.map(e => ({ ...e, amountCents: -e.amountCents })) };
  }

  loansPage(q: { page?: string; status?: string; lenderId?: string; userId?: string }) {
    return this.loans.page({ status: q.status, lenderId: q.lenderId, userId: q.userId }, q);
  }
}
