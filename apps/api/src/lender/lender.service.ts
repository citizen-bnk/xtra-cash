import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { and, count, desc, eq, gte, inArray, lte, sql, SQL } from 'drizzle-orm';
import { REQUIRED_DOCUMENTS, type PlatformSettings } from '@xtra/shared';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { accreditationDocuments, kycProfiles, lenderFunding, lenderOrgs, loanOffers, loans } from '../db/schema';
import { SettingsService } from '../common/settings.service';
import { AuditService } from '../common/audit.service';
import { Accounts, LedgerService } from '../common/ledger.service';
import { FILE_STORAGE, PAYMENT_GATEWAY } from '../integrations/integrations.module';
import type { FileStorage } from '../integrations/storage';
import type { PaymentGateway } from '../integrations/payments';
import type { AuthUser } from '../common/auth';
import { CriteriaDto, FundingDto, LenderOrgDto, OfferDto } from './lender.dto';

const EDITABLE = ['DRAFT', 'REJECTED', 'SUBMITTED'];

@Injectable()
export class LenderService {
  constructor(
    @InjectDb() private db: Db,
    private settings: SettingsService,
    private audit: AuditService,
    private ledger: LedgerService,
    @Inject(FILE_STORAGE) private storage: FileStorage,
    @Inject(PAYMENT_GATEWAY) private gateway: PaymentGateway,
  ) {}

  async orgFor(userId: string) {
    const org = await this.db.query.lenderOrgs.findFirst({
      where: eq(lenderOrgs.ownerUserId, userId),
      with: { documents: { orderBy: desc(accreditationDocuments.createdAt) } },
    });
    if (!org) throw new NotFoundException('No lender organisation for this account');
    return { ...org, documents: org.documents.map(presentDoc) };
  }

  async saveOrg(user: AuthUser, dto: LenderOrgDto) {
    const existing = await this.db.query.lenderOrgs.findFirst({ where: eq(lenderOrgs.ownerUserId, user.id) });
    if (!existing) {
      await this.db.insert(lenderOrgs).values({ ownerUserId: user.id, ...dto });
    } else {
      // Legal identity is locked once accreditation is under way; contact details stay editable.
      const locked = !EDITABLE.includes(existing.accreditationStatus);
      const patch = locked ? { contactEmail: dto.contactEmail, contactPhone: dto.contactPhone, tradingName: dto.tradingName } : dto;
      await this.db.update(lenderOrgs).set(patch).where(eq(lenderOrgs.id, existing.id));
    }
    return this.orgFor(user.id);
  }

  async uploadDocument(user: AuthUser, type: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException('Only PDF, JPG or PNG files are accepted');
    const org = await this.orgFor(user.id);
    const key = await this.storage.put(file.buffer, file.originalname);
    const [doc] = await this.db
      .insert(accreditationDocuments)
      .values({ lenderId: org.id, type: type as any, fileName: file.originalname.slice(0, 200), storageKey: key })
      .returning();
    return presentDoc(doc);
  }

  async documentFile(lenderId: string, docId: string) {
    const doc = await this.db.query.accreditationDocuments.findFirst({
      where: and(eq(accreditationDocuments.id, docId), eq(accreditationDocuments.lenderId, lenderId)),
    });
    if (!doc) throw new NotFoundException();
    return { doc, buffer: await this.storage.get(doc.storageKey) };
  }

  async submitAccreditation(user: AuthUser, assisted: boolean) {
    const org = await this.orgFor(user.id);
    if (!EDITABLE.includes(org.accreditationStatus)) throw new BadRequestException(`Accreditation is already ${org.accreditationStatus}`);
    const s = await this.settings.get();
    if (!assisted) {
      const have = new Set(org.documents.filter((d) => d.status !== 'REJECTED').map((d) => d.type));
      const missing = REQUIRED_DOCUMENTS.filter((d) => !have.has(d));
      if (missing.length) throw new BadRequestException(`Upload the required documents first: ${missing.join(', ')}`);
      if (!org.ncrNumber) {
        throw new BadRequestException('An NCR registration number is required. Choose assisted accreditation if you need help registering.');
      }
    }
    await this.db
      .update(lenderOrgs)
      .set({
        accreditationStatus: 'SUBMITTED',
        assistedAccreditation: assisted,
        accreditationFeeCents: assisted ? s.assistedAccreditationFeeCents : 0,
      })
      .where(eq(lenderOrgs.id, org.id));
    await this.audit.log(user, 'lender.accreditation_submitted', 'lender', org.id, { assisted });
    return this.orgFor(user.id);
  }

  async payAccreditationFee(user: AuthUser) {
    const org = await this.orgFor(user.id);
    if (!org.assistedAccreditation || org.accreditationFeePaid) throw new BadRequestException('No accreditation fee is due');
    const pay = await this.gateway.collect({ amountCents: org.accreditationFeeCents, reference: `ACCR-${org.id}`, payerUserId: user.id });
    if (!pay.success) throw new BadRequestException('Payment failed');
    await this.db.transaction(async (tx) => {
      await tx.update(lenderOrgs).set({ accreditationFeePaid: true }).where(eq(lenderOrgs.id, org.id));
      await this.ledger.post(tx, { type: 'accreditation_fee', refType: 'lender', refId: org.id }, [
        { account: Accounts.bank, amountCents: org.accreditationFeeCents },
        { account: Accounts.platformRevenue, amountCents: -org.accreditationFeeCents },
      ]);
      await this.audit.log(user, 'lender.fee_paid', 'lender', org.id, { amountCents: org.accreditationFeeCents, providerRef: pay.providerRef }, tx);
    });
    return this.orgFor(user.id);
  }

  async stats(lenderId: string) {
    const org = await this.db.query.lenderOrgs.findFirst({ where: eq(lenderOrgs.id, lenderId) });
    if (!org) throw new NotFoundException();
    const [agg] = await this.db
      .select({
        outstanding: sql<string>`coalesce(sum(${loans.outstandingCents}) filter (where ${loans.status} in ('ACTIVE','IN_ARREARS','DEFAULTED')), 0)`,
        active: sql<string>`count(*) filter (where ${loans.status} in ('ACTIVE','IN_ARREARS'))`,
        arrears: sql<string>`count(*) filter (where ${loans.status} = 'IN_ARREARS')`,
        advanced: sql<string>`coalesce(sum(${loans.principalCents}), 0)`,
      })
      .from(loans)
      .where(eq(loans.lenderId, lenderId));
    const [repaid] = await this.db.execute<{ total: string }>(
      sql`select coalesce(sum(r.lender_share_cents),0) as total from repayments r join loans l on l.id = r.loan_id where l.lender_id = ${lenderId}`,
    ).then((r) => r.rows);
    const [{ offers }] = await this.db
      .select({ offers: count() })
      .from(loanOffers)
      .where(and(eq(loanOffers.lenderId, lenderId), eq(loanOffers.active, true)));
    return {
      availableCents: org.availableCents,
      totalLoadedCents: org.totalLoadedCents,
      outstandingCents: Number(agg.outstanding),
      activeLoans: Number(agg.active),
      loansInArrears: Number(agg.arrears),
      totalAdvancedCents: Number(agg.advanced),
      totalRepaidCents: Number(repaid.total),
      activeOffers: offers,
    };
  }

  // ---------------- funding ----------------
  async listFunding(lenderId: string) {
    return this.db.query.lenderFunding.findMany({ where: eq(lenderFunding.lenderId, lenderId), orderBy: desc(lenderFunding.createdAt) });
  }

  async requestFunding(user: AuthUser, dto: FundingDto) {
    const org = await this.orgFor(user.id);
    const reference = `XCF-${randomBytes(4).toString('hex').toUpperCase()}`;
    if (dto.type === 'WITHDRAWAL') {
      // Reserve the funds immediately so they can't be lent out while the payout is pending.
      return this.db.transaction(async (tx) => {
        const r = await tx
          .update(lenderOrgs)
          .set({ availableCents: sql`${lenderOrgs.availableCents} - ${dto.amountCents}` })
          .where(and(eq(lenderOrgs.id, org.id), gte(lenderOrgs.availableCents, dto.amountCents)))
          .returning({ id: lenderOrgs.id });
        if (!r.length) throw new BadRequestException('Withdrawal exceeds your available funds');
        const [f] = await tx.insert(lenderFunding).values({ lenderId: org.id, type: 'WITHDRAWAL', amountCents: dto.amountCents, reference }).returning();
        await this.audit.log(user, 'lender.withdrawal_requested', 'funding', f.id, { amountCents: dto.amountCents }, tx);
        return f;
      });
    }
    if (org.accreditationStatus === 'REJECTED' || org.accreditationStatus === 'SUSPENDED') {
      throw new ForbiddenException('Your stall cannot accept new funds in its current status');
    }
    const [f] = await this.db.insert(lenderFunding).values({ lenderId: org.id, type: 'LOAD', amountCents: dto.amountCents, reference }).returning();
    await this.audit.log(user, 'lender.load_requested', 'funding', f.id, { amountCents: dto.amountCents });
    return f;
  }

  /** Admin: confirm an EFT load was received / a withdrawal was paid out, or reject it. */
  async decideFunding(actor: AuthUser, fundingId: string, approve: boolean) {
    return this.db.transaction(async (tx) => {
      const [f] = await tx.select().from(lenderFunding).where(eq(lenderFunding.id, fundingId)).for('update');
      if (!f) throw new NotFoundException();
      if (f.status !== 'PENDING') throw new BadRequestException('Already decided');
      const status = approve ? 'CONFIRMED' : 'REJECTED';
      const [updated] = await tx
        .update(lenderFunding)
        .set({ status, decidedById: actor.id, decidedAt: new Date() })
        .where(eq(lenderFunding.id, f.id))
        .returning();
      if (f.type === 'LOAD' && approve) {
        await tx
          .update(lenderOrgs)
          .set({
            availableCents: sql`${lenderOrgs.availableCents} + ${f.amountCents}`,
            totalLoadedCents: sql`${lenderOrgs.totalLoadedCents} + ${f.amountCents}`,
          })
          .where(eq(lenderOrgs.id, f.lenderId));
        await this.ledger.post(tx, { type: 'lender_load', refType: 'funding', refId: f.id }, [
          { account: Accounts.bank, amountCents: f.amountCents },
          { account: Accounts.lenderFunds(f.lenderId), amountCents: -f.amountCents },
        ]);
      }
      if (f.type === 'WITHDRAWAL') {
        if (approve) {
          await this.ledger.post(tx, { type: 'lender_withdrawal', refType: 'funding', refId: f.id }, [
            { account: Accounts.lenderFunds(f.lenderId), amountCents: f.amountCents },
            { account: Accounts.bank, amountCents: -f.amountCents },
          ]);
        } else {
          await tx.update(lenderOrgs).set({ availableCents: sql`${lenderOrgs.availableCents} + ${f.amountCents}` }).where(eq(lenderOrgs.id, f.lenderId));
        }
      }
      await this.audit.log(actor, `funding.${status.toLowerCase()}`, 'funding', f.id, { type: f.type, amountCents: f.amountCents }, tx);
      return updated;
    });
  }

  // ---------------- offers ----------------
  private validateOffer(dto: Partial<Record<keyof OfferDto, unknown>> & Partial<Pick<OfferDto, "monthlyInterestRateBps" | "monthlyServiceFeeCents" | "minAmountCents" | "maxAmountPerUserCents" | "minAge" | "maxAge">>, s: PlatformSettings) {
    if (dto.monthlyInterestRateBps !== undefined && dto.monthlyInterestRateBps > s.maxRateBps) {
      throw new BadRequestException(`Monthly interest may not exceed ${s.maxRateBps / 100}% (regulatory cap)`);
    }
    if (dto.monthlyServiceFeeCents !== undefined && dto.monthlyServiceFeeCents > s.maxMonthlyServiceFeeCents) {
      throw new BadRequestException(`Monthly service fee may not exceed R${s.maxMonthlyServiceFeeCents / 100}`);
    }
    if (dto.minAmountCents !== undefined && dto.maxAmountPerUserCents !== undefined && dto.minAmountCents > dto.maxAmountPerUserCents) {
      throw new BadRequestException('Minimum amount must not exceed the maximum per consumer');
    }
    if (dto.minAge !== undefined && dto.maxAge !== undefined && dto.minAge > dto.maxAge) throw new BadRequestException('minAge must be ≤ maxAge');
  }

  listOffers(lenderId: string) {
    return this.db.query.loanOffers.findMany({ where: eq(loanOffers.lenderId, lenderId), orderBy: desc(loanOffers.createdAt) });
  }

  async createOffer(user: AuthUser, dto: OfferDto) {
    const org = await this.orgFor(user.id);
    this.validateOffer(dto, await this.settings.get());
    const [o] = await this.db.insert(loanOffers).values({ ...dto, lenderId: org.id }).returning();
    await this.audit.log(user, 'offer.created', 'offer', o.id, { name: o.name });
    return o;
  }

  async updateOffer(user: AuthUser, id: string, dto: Partial<OfferDto>) {
    const org = await this.orgFor(user.id);
    const existing = await this.db.query.loanOffers.findFirst({ where: and(eq(loanOffers.id, id), eq(loanOffers.lenderId, org.id)) });
    if (!existing) throw new NotFoundException('Offer not found');
    this.validateOffer({ ...existing, ...dto }, await this.settings.get());
    const [o] = await this.db.update(loanOffers).set(dto).where(eq(loanOffers.id, id)).returning();
    await this.audit.log(user, 'offer.updated', 'offer', o.id, dto as any);
    return o;
  }

  /** How many verified consumers would match these criteria — helps lenders target their stall. */
  async previewReach(c: CriteriaDto) {
    const now = new Date();
    const youngestDob = new Date(Date.UTC(now.getUTCFullYear() - c.minAge, now.getUTCMonth(), now.getUTCDate()));
    const oldestDob = new Date(Date.UTC(now.getUTCFullYear() - c.maxAge - 1, now.getUTCMonth(), now.getUTCDate() + 1));
    const where: SQL[] = [
      eq(kycProfiles.status, 'VERIFIED'),
      gte(kycProfiles.monthlyIncomeCents, c.minMonthlyIncomeCents),
      gte(kycProfiles.creditScore, c.minCreditScore),
      lte(kycProfiles.dateOfBirth, youngestDob),
      gte(kycProfiles.dateOfBirth, oldestDob),
    ];
    if (c.employmentStatuses.length) where.push(inArray(kycProfiles.employmentStatus, c.employmentStatuses));
    if (c.provinces.length) where.push(inArray(kycProfiles.province, c.provinces));
    const [[{ eligible }], [{ total }]] = await Promise.all([
      this.db.select({ eligible: count() }).from(kycProfiles).where(and(...where)),
      this.db.select({ total: count() }).from(kycProfiles).where(eq(kycProfiles.status, 'VERIFIED')),
    ]);
    return { eligibleConsumers: eligible, totalConsumers: total };
  }
}

export function presentDoc(d: typeof accreditationDocuments.$inferSelect) {
  const { storageKey: _k, ...rest } = d;
  return { ...rest, url: `/lender/documents/${d.id}/file` };
}
