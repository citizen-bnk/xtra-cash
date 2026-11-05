import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { compare } from "bcryptjs";
import { addMonths, quoteLoan, formatZAR } from "@xtra/shared";
import { z } from "zod";
import { InjectDb } from "../common/db.module";
import { Db, DbOrTx } from "../db/client";
import {
  users,
  personalLoanApplications as applications,
  personalVerifications,
  kycProfiles,
  lenderOrgs,
  loanOffers,
  loans,
  installments,
} from "../db/schema";
import {
  agreements,
  beneficiaries,
  movements,
  moneyEvents,
  applicationEvents,
} from "./settlement.schema";
import { Accounts, LedgerService } from "../common/ledger.service";
import { AuditService } from "../common/audit.service";
import { SettingsService } from "../common/settings.service";
import { AuthUser } from "../common/auth";
import { encryptIdentity, decryptIdentity } from "../auth/identity-crypto";
import { MoneyConnector, MoneyEvent, providerEvent } from "./money-connector";
import { lenderAgentRuns, applicationLenderAccess } from "./lender-ai.schema";
import {
  approveInput,
  acceptInput,
  beneficiaryInput,
  withdrawInput,
} from "./settlement.dto";
const digest = (v: unknown) =>
  createHash("sha256")
    .update(typeof v === "string" ? v : JSON.stringify(v))
    .digest("hex");
const isAdmin = (a: AuthUser) =>
  a.roles.some((r) => r === "ADMIN" || r === "SUPER_ADMIN");
const reserve = (id: string) => `liability:funding_reserved:${id}`;
const hold = (id: string) => `liability:withdrawal_pending:${id}`;
const safeMovement = (m: typeof movements.$inferSelect) => {
  const { requestHash, clientKey, leaseUntil, ...safe } = m;
  return safe;
};
@Injectable()
export class SettlementService {
  constructor(
    @InjectDb() private db: Db,
    private ledger: LedgerService,
    private audit: AuditService,
    private settings: SettingsService,
    private connector: MoneyConnector,
  ) {}
  configuration() {
    return this.connector.readiness();
  }
  async banks() {
    if (!this.configuration().enabled) return [];
    return z
      .array(
        z.object({
          code: z.string().min(2).max(40),
          name: z.string().min(1).max(100),
        }),
      )
      .max(100)
      .parse(await this.connector.call("/v1/banks", { country: "ZA" }));
  }
  private async event(
    tx: DbOrTx,
    id: string,
    actorId: string | null,
    status: string,
    message: string,
  ) {
    await tx
      .insert(applicationEvents)
      .values({ applicationId: id, actorId, status, message });
  }
  private async app(
    a: AuthUser,
    id: string,
    tx: DbOrTx = this.db,
    lock = false,
  ) {
    const query = tx.select().from(applications).where(eq(applications.id, id));
    const [app] = await (lock ? query.for("update") : query);
    if (!app) throw new NotFoundException();
    if (app.userId !== a.id && !isAdmin(a)) {
      const [l] = await tx
        .select()
        .from(lenderOrgs)
        .where(eq(lenderOrgs.ownerUserId, a.id));
      if (!l || l.id !== app.lenderId || l.accreditationStatus !== "ACCREDITED")
        throw new NotFoundException();
    }
    return app;
  }
  private async password(a: AuthUser, password: string) {
    const [u] = await this.db.select().from(users).where(eq(users.id, a.id));
    if (!u?.passwordHash || !(await compare(password, u.passwordHash)))
      throw new UnauthorizedException("Confirm your current account password.");
  }
  private async eligibleUser(id: string, tx: DbOrTx) {
    const [u] = await tx.select().from(users).where(eq(users.id, id));
    const [v] = await tx
      .select()
      .from(personalVerifications)
      .where(eq(personalVerifications.userId, id));
    const [k] = await tx
      .select()
      .from(kycProfiles)
      .where(eq(kycProfiles.userId, id));
    if (
      !u ||
      u.status !== "ACTIVE" ||
      !u.profileComplete ||
      v?.status !== "VERIFIED" ||
      k?.status !== "VERIFIED"
    )
      throw new BadRequestException(
        "Verified identity and an active complete profile are required.",
      );
    if (
      process.env.NODE_ENV === "production" &&
      (/^(DEMO |demo)/i.test(u.firstName) ||
        /(@.*\.invalid$|@example\.com$|^demo\.)/i.test(u.email ?? ""))
    )
      throw new ForbiddenException(
        "Demo accounts cannot use real banking services.",
      );
    return u;
  }
  async detail(a: AuthUser, id: string) {
    // Sharing grants read access to the request only. Mutation helpers retain
    // their original selected-lender checks; agreements and evidence stay private.
    if(a.roles.includes('LENDER')&&!isAdmin(a)){
      const [shared]=await this.db.select({app:applications, viewerLenderId:lenderOrgs.id}).from(applicationLenderAccess)
        .innerJoin(applications,eq(applications.id,applicationLenderAccess.applicationId))
        .innerJoin(lenderOrgs,eq(lenderOrgs.id,applicationLenderAccess.lenderId))
        .where(and(eq(applications.id,id),eq(lenderOrgs.ownerUserId,a.id),eq(lenderOrgs.accreditationStatus,'ACCREDITED'),eq(applicationLenderAccess.active,1)));
      if(shared&&shared.app.lenderId!==shared.viewerLenderId){
        return {sharedReadOnly:true,application:{...shared.app,reviewNotes:null},agreement:null,timeline:[],funding:[],configuration:this.configuration()};
      }
    }
    const app = await this.app(a, id);
    const [agreement] = await this.db
      .select()
      .from(agreements)
      .where(eq(agreements.applicationId, id));
    const timeline = await this.db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, id))
      .orderBy(applicationEvents.createdAt);
    const funding = agreement
      ? await this.db
          .select()
          .from(movements)
          .where(eq(movements.agreementId, agreement.id))
      : [];
    // Underwriting references are internal evidence, not applicant messages.
    const visible = agreement
      ? (() => {
          const {
            assessmentReference,
            mandateReference,
            legalReference,
            ...r
          } = agreement;
          return r;
        })()
      : null;
    const [humanReview]=await this.db.select().from(lenderAgentRuns).where(and(eq(lenderAgentRuns.applicationId,id),eq(lenderAgentRuns.step,"HUMAN_REVIEW"),eq(lenderAgentRuns.result,"OPEN")));
    return {
      humanReviewPending:!!humanReview,
      application: app,
      agreement: visible,
      timeline,
      funding: funding.map(safeMovement),
      configuration: this.configuration(),
    };
  }
  async requestInformation(a: AuthUser, id: string, message: string) {
    return this.db.transaction(async (tx) => {
      const app = await this.app(a, id, tx, true);
      if (app.userId === a.id) throw new ForbiddenException();
      if (
        !["SUBMITTED", "REFERRED", "UNDER_REVIEW", "ACTION_REQUIRED"].includes(
          app.status,
        )
      )
        throw new ConflictException("This application is no longer in review.");
      await tx
        .update(applications)
        .set({
          status: "ACTION_REQUIRED",
          reviewNotes: message,
          reviewedAt: new Date(),
        })
        .where(eq(applications.id, id));
      await this.event(tx, id, a.id, "ACTION_REQUIRED", message);
      await this.audit.log(
        a,
        "personal_loan.information_requested",
        "personal_loan_application",
        id,
        {},
        tx,
      );
      return { ok: true };
    });
  }
  async respond(a: AuthUser, id: string, message: string) {
    return this.db.transaction(async (tx) => {
      const app = await this.app(a, id, tx, true);
      if (app.userId !== a.id || app.status !== "ACTION_REQUIRED")
        throw new ConflictException(
          "No information request is awaiting your reply.",
        );
      await tx
        .update(applications)
        .set({ status: "UNDER_REVIEW" })
        .where(eq(applications.id, id));
      await this.event(tx, id, a.id, "UNDER_REVIEW", message);
      return { ok: true };
    });
  }
  async approve(a: AuthUser, id: string, input: z.infer<typeof approveInput>, conn?: DbOrTx) {
    const now = Date.now(),
      assessed = new Date(input.assessedAt),
      expires = new Date(input.expiresAt);
    if (
      assessed.getTime() > now ||
      now - assessed.getTime() > 7 * 86400000 ||
      expires.getTime() <= now ||
      expires.getTime() >
        Math.min(now + 7 * 86400000, assessed.getTime() + 7 * 86400000)
    )
      throw new BadRequestException(
        "Use a current assessment and an expiry within seven days of that assessment.",
      );
    const perform = async (tx: DbOrTx) => {
      const app = await this.app(a, id, tx, true);
      if (app.userId === a.id)
        throw new ForbiddenException(
          "You cannot approve your own application.",
        );
      if (
        !["SUBMITTED", "REFERRED", "UNDER_REVIEW", "ACTION_REQUIRED"].includes(
          app.status,
        )
      )
        throw new ConflictException("Application already has a decision.");
      const [humanReview]=await tx.select().from(lenderAgentRuns).where(and(eq(lenderAgentRuns.applicationId,id),eq(lenderAgentRuns.step,"HUMAN_REVIEW"),eq(lenderAgentRuns.result,"OPEN")));if(humanReview)throw new BadRequestException("Resolve the requested human review before offering credit.");
      const u = await this.eligibleUser(app.userId, tx);
      if(!app.lenderId||!app.offerId)throw new BadRequestException('An authorised referral must assign a matched lender product before a lending offer can be authorised.');
      const [offer] = await tx
        .select()
        .from(loanOffers)
        .where(eq(loanOffers.id, input.offerId));
      if (
        !offer ||
        !offer.active ||
        offer.productType !== "PERSONAL" ||
        offer.termMonths !== app.termMonths ||
        app.amountCents < offer.minAmountCents ||
        app.amountCents > offer.maxAmountPerUserCents
      )
        throw new BadRequestException(
          "Select a current personal-loan product matching this application.",
        );
      const [lender] = await tx
        .select()
        .from(lenderOrgs)
        .where(eq(lenderOrgs.id, offer.lenderId));
      if (
        !lender ||
        lender.accreditationStatus !== "ACCREDITED" ||
        !lender.ncrNumber ||
        lender.ownerUserId === app.userId
      )
        throw new BadRequestException(
          "An accredited lender with an NCR reference is required.",
        );
      if (!isAdmin(a) && lender.ownerUserId !== a.id)
        throw new ForbiddenException();
      if (app.lenderId && app.lenderId !== lender.id)
        throw new BadRequestException(
          "The selected product belongs to another lender.",
        );
      const settings = await this.settings.get(tx);
      if (
        offer.monthlyInterestRateBps > settings.maxRateBps ||
        offer.monthlyServiceFeeCents > settings.maxMonthlyServiceFeeCents
      )
        throw new BadRequestException(
          "Product exceeds configured pricing limits.",
        );
      const quote = quoteLoan(app.amountCents, offer);
      if (
        quote.monthlyInstallmentCents >
        app.monthlyIncomeCents - app.monthlyExpensesCents
      )
        throw new BadRequestException(
          "Instalment exceeds declared disposable income; the lender must reassess.",
        );
      const terms = {
        offerId: offer.id,
        principalCents: app.amountCents,
        termMonths: offer.termMonths,
        monthlyInterestRateBps: offer.monthlyInterestRateBps,
        initiationFeeCents: offer.initiationFeeCents,
        monthlyServiceFeeCents: offer.monthlyServiceFeeCents,
        totalRepayableCents: quote.totalRepayableCents,
        monthlyInstallmentCents: quote.monthlyInstallmentCents,
      };
      const content = `XTRA-CASH PERSONAL LOAN — PRE-AGREEMENT QUOTATION AND CREDIT AGREEMENT\nApplication: ${app.id}\nBorrower: ${u.firstName} ${u.lastName}\nLender: ${lender.name}\nNCR reference: ${lender.ncrNumber}\nAmount to your XTRA-CASH wallet: ${formatZAR(app.amountCents)}\nMonthly interest: ${(offer.monthlyInterestRateBps / 100).toFixed(2)}%\nInitiation fee financed: ${formatZAR(offer.initiationFeeCents)}\nMonthly service fee: ${formatZAR(offer.monthlyServiceFeeCents)}\nTerm: ${offer.termMonths} months\nFirst monthly instalment: ${formatZAR(quote.monthlyInstallmentCents)}\nTotal repayable: ${formatZAR(quote.totalRepayableCents)}\nTotal credit cost: ${formatZAR(quote.costOfCreditCents)}\nCredit cost multiple: ${(quote.totalRepayableCents / app.amountCents).toFixed(4)}\nInstalment amounts: ${quote.schedule.map((i) => `${i.seq}: ${formatZAR(i.amountCents)}`).join("; ")}\nInstalment dates: monthly from one month after confirmed wallet funding. Exact dates are issued on your funding receipt.\nOffer expires: ${expires.toISOString()}\nAcceptance alone does not confirm funds are available. A bank withdrawal is a separate transfer of your available cash and does not create another loan.\n\nLENDER-APPROVED TERMS\n${input.agreementTerms}`;
      const [agreement] = await tx
        .insert(agreements)
        .values({
          applicationId: id,
          userId: app.userId,
          lenderId: lender.id,
          content,
          digest: digest(content),
          terms,
          assessmentReference: input.assessmentReference,
          mandateReference: input.mandateReference,
          legalReference: input.legalReference,
          assessedAt: assessed,
          approvedBy: a.id,
          expiresAt: expires,
        })
        .returning();
      await tx
        .update(applications)
        .set({
          status: "OFFERED",
          offerId: offer.id,
          lenderId: lender.id,
          reviewNotes:
            "Your lender has prepared an offer. Read the agreement before accepting.",
          reviewedAt: new Date(),
        })
        .where(eq(applications.id, id));
      await this.event(
        tx,
        id,
        a.id,
        "OFFERED",
        "Your personalised quotation and agreement are ready to read.",
      );
      await this.audit.log(
        a,
        "personal_loan.offer_approved",
        "personal_agreement",
        agreement.id,
        { digest: agreement.digest },
        tx,
      );
      return { id: agreement.id, digest: agreement.digest };
    };
    return conn ? perform(conn) : this.db.transaction(perform);
  }
  async accept(a: AuthUser, id: string, input: z.infer<typeof acceptInput>) {
    if (!this.configuration().agreementsEnabled)
      throw new ServiceUnavailableException(
        "Agreement acceptance awaits legal and lender activation. You can read the prepared document.",
      );
    await this.password(a, input.password);
    return this.db.transaction(async (tx) => {
      const app = await this.app(a, id, tx, true);
      const [humanReview]=await tx.select().from(lenderAgentRuns).where(and(eq(lenderAgentRuns.applicationId,id),eq(lenderAgentRuns.step,"HUMAN_REVIEW"),eq(lenderAgentRuns.result,"OPEN")));if(humanReview)throw new BadRequestException("Your requested human review is still pending.");
      if (app.userId !== a.id) throw new ForbiddenException();
      const [ag] = await tx
        .select()
        .from(agreements)
        .where(eq(agreements.applicationId, id))
        .for("update");
      if (!ag || ag.digest !== input.digest)
        throw new ConflictException(
          "The agreement does not match. Reload and read it again.",
        );
      if (app.status === "ACCEPTED" && ag.acceptedBy === a.id)
        return { ok: true };
      if (
        app.status !== "OFFERED" ||
        ag.status !== "OFFERED" ||
        ag.expiresAt.getTime() <= Date.now()
      )
        throw new ConflictException("Offer expired or no longer available.");
      await this.eligibleUser(a.id, tx);
      await tx
        .update(agreements)
        .set({ status: "ACCEPTED", acceptedBy: a.id, acceptedAt: new Date() })
        .where(eq(agreements.id, ag.id));
      await tx
        .update(applications)
        .set({ status: "ACCEPTED" })
        .where(eq(applications.id, id));
      await this.event(
        tx,
        id,
        a.id,
        "ACCEPTED",
        "You accepted the agreement. Funding is subject to final checks and available lender funds.",
      );
      await this.audit.log(
        a,
        "personal_loan.agreement_accepted",
        "personal_agreement",
        ag.id,
        { digest: ag.digest },
        tx,
      );
      return { ok: true };
    });
  }
  async cancel(a: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      const app = await this.app(a, id, tx, true);
      if (app.userId !== a.id) throw new ForbiddenException();
      if (app.status === "CANCELLED") return { ok: true };
      if (
        ![
          "SUBMITTED",
          "REFERRED",
          "UNDER_REVIEW",
          "ACTION_REQUIRED",
          "OFFERED",
          "ACCEPTED",
        ].includes(app.status)
      )
        throw new ConflictException(
          "Funding has started; contact support for cancellation.",
        );
      await tx
        .update(applications)
        .set({ status: "CANCELLED" })
        .where(eq(applications.id, id));
      await tx
        .update(agreements)
        .set({ status: "CANCELLED" })
        .where(eq(agreements.applicationId, id));
      await this.event(
        tx,
        id,
        a.id,
        "CANCELLED",
        "You cancelled this application before funding.",
      );
      await this.audit.log(
        a,
        "personal_loan.cancelled",
        "personal_loan_application",
        id,
        {},
        tx,
      );
      return { ok: true };
    });
  }
  async fund(a: AuthUser, id: string) {
    this.connector.requireReady();
    return this.db.transaction(async (tx) => {
      const app = await this.app(a, id, tx, true);
      if (app.userId === a.id || !isAdmin(a)) throw new ForbiddenException();
      const [ag] = await tx
        .select()
        .from(agreements)
        .where(eq(agreements.applicationId, id))
        .for("update");
      if (!ag) throw new NotFoundException();
      const [prior] = await tx
        .select()
        .from(movements)
        .where(eq(movements.agreementId, ag.id));
      if (prior) return safeMovement(prior);
      if (
        app.status !== "ACCEPTED" ||
        ag.status !== "ACCEPTED" ||
        !ag.acceptedAt ||
        ag.expiresAt.getTime() <= Date.now() ||
        Date.now() - ag.assessedAt.getTime() > 7 * 86400000
      )
        throw new ConflictException(
          "A current accepted agreement and assessment are required.",
        );
      if (ag.approvedBy === a.id)
        throw new ForbiddenException(
          "A different administrator must release the funding.",
        );
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, app.userId))
        .for("update");
      await this.eligibleUser(app.userId, tx);
      const existingLoans = await tx
        .select()
        .from(loans)
        .where(
          and(
            eq(loans.userId, app.userId),
            inArray(loans.status, ["ACTIVE", "IN_ARREARS", "DEFAULTED"]),
          ),
        );
      if (existingLoans.some((l) => l.status !== "ACTIVE"))
        throw new BadRequestException(
          "Overdue borrowing requires lender reassessment.",
        );
      const pending = await tx
        .select({ terms: agreements.terms })
        .from(movements)
        .innerJoin(agreements, eq(movements.agreementId, agreements.id))
        .where(
          and(
            eq(movements.userId, app.userId),
            eq(movements.kind, "FUNDING"),
            inArray(movements.status, ["QUEUED", "PROCESSING", "PENDING"]),
          ),
        );
      const [product] = await tx
        .select()
        .from(loanOffers)
        .where(eq(loanOffers.id, ag.terms.offerId));
      const committedPrincipal =
        existingLoans
          .filter((l) => l.offerId === ag.terms.offerId)
          .reduce((n, l) => n + l.principalCents, 0) +
        pending
          .filter((p) => p.terms.offerId === ag.terms.offerId)
          .reduce((n, p) => n + p.terms.principalCents, 0);
      if (
        !product?.active ||
        committedPrincipal + ag.terms.principalCents >
          product.maxAmountPerUserCents
      )
        throw new BadRequestException(
          "Product capacity changed; request a fresh assessment.",
        );
      const committedInstalments =
        existingLoans.reduce(
          (n, l) => n + quoteLoan(l.principalCents, l).monthlyInstallmentCents,
          0,
        ) + pending.reduce((n, p) => n + p.terms.monthlyInstallmentCents, 0);
      if (
        committedInstalments + ag.terms.monthlyInstallmentCents >
        app.monthlyIncomeCents - app.monthlyExpensesCents
      )
        throw new BadRequestException(
          "Borrowing commitments changed; request a fresh affordability assessment.",
        );
      const [l] = await tx
        .update(lenderOrgs)
        .set({
          availableCents: sql`${lenderOrgs.availableCents}-${ag.terms.principalCents}`,
        })
        .where(
          and(
            eq(lenderOrgs.id, ag.lenderId),
            eq(lenderOrgs.accreditationStatus, "ACCREDITED"),
            gte(lenderOrgs.availableCents, ag.terms.principalCents),
          ),
        )
        .returning();
      if (!l) throw new BadRequestException("Lender cash is unavailable.");
      const [m] = await tx
        .insert(movements)
        .values({
          userId: app.userId,
          kind: "FUNDING",
          agreementId: ag.id,
          amountCents: ag.terms.principalCents,
          clientKey: `FUND-${ag.id}`,
          requestHash: digest(ag.digest),
        })
        .returning();
      await this.ledger.post(
        tx,
        {
          type: "personal_funding_reserved",
          refType: "money_movement",
          refId: m.id,
        },
        [
          { account: Accounts.lenderFunds(l.id), amountCents: m.amountCents },
          { account: reserve(m.id), amountCents: -m.amountCents },
        ],
      );
      await tx
        .update(applications)
        .set({ status: "FUNDING_PENDING" })
        .where(eq(applications.id, id));
      await this.event(
        tx,
        id,
        a.id,
        "FUNDING_PENDING",
        "Lender funds have been reserved. Your wallet will update after banking confirmation.",
      );
      await this.audit.log(
        a,
        "personal_loan.funding_queued",
        "money_movement",
        m.id,
        {},
        tx,
      );
      return safeMovement(m);
    });
  }
  async wallet(a: AuthUser) {
    const [u] = await this.db
      .select({ availableCents: users.walletBalanceCents })
      .from(users)
      .where(eq(users.id, a.id));
    const bs = await this.db
      .select({
        id: beneficiaries.id,
        bankCode: beneficiaries.bankCode,
        last4: beneficiaries.last4,
        status: beneficiaries.status,
        verifiedAt: beneficiaries.verifiedAt,
      })
      .from(beneficiaries)
      .where(eq(beneficiaries.userId, a.id));
    const ms = await this.db
      .select()
      .from(movements)
      .where(eq(movements.userId, a.id))
      .orderBy(desc(movements.createdAt))
      .limit(100);
    const [held] = await this.db
      .select({ total: sql<string>`coalesce(sum(${movements.amountCents}),0)` })
      .from(movements)
      .where(
        and(
          eq(movements.userId, a.id),
          eq(movements.kind, "WITHDRAWAL"),
          inArray(movements.status, ["QUEUED", "PROCESSING", "PENDING"]),
        ),
      );
    return {
      ...u,
      heldCents: Number(held.total),
      beneficiaries: bs,
      movements: ms.map(safeMovement),
      configuration: this.configuration(),
    };
  }
  async addBank(a: AuthUser, input: z.infer<typeof beneficiaryInput>) {
    this.connector.requireReady();
    await this.password(a, input.password);
    const u = await this.eligibleUser(a.id, this.db);
    const [b] = await this.db
      .insert(beneficiaries)
      .values({
        userId: a.id,
        bankCode: input.bankCode,
        last4: input.accountNumber.slice(-4),
        encryptedDetails: encryptIdentity(
          JSON.stringify({
            accountNumber: input.accountNumber,
            accountType: input.accountType,
          }),
        ),
      })
      .returning();
    await this.audit.log(
      a,
      "wallet.bank_added",
      "wallet_beneficiary",
      b.id,
      {},
      this.db,
    );
    return this.verifyBank(a, b.id, u);
  }
  async verifyBank(a: AuthUser, id: string, user?: typeof users.$inferSelect) {
    this.connector.requireReady();
    const [b] = await this.db
      .select()
      .from(beneficiaries)
      .where(and(eq(beneficiaries.id, id), eq(beneficiaries.userId, a.id)));
    if (!b) throw new NotFoundException();
    if (b.status === "VERIFIED")
      return { id: b.id, status: b.status, last4: b.last4 };
    const u = user ?? (await this.eligibleUser(a.id, this.db));
    const [v] = await this.db
      .select()
      .from(personalVerifications)
      .where(eq(personalVerifications.userId, a.id));
    const result = z
      .object({
        status: z.enum(["VERIFIED", "REJECTED", "PENDING"]),
        reference: z.string().min(1).max(150),
        ownershipMatch: z.boolean(),
      })
      .parse(
        await this.connector.call("/v1/beneficiaries/verify", {
          id: b.id,
          userId: a.id,
          firstName: u.firstName,
          lastName: u.lastName,
          identityType: v.identityType,
          identityNumber: v.identityNumber,
          bankCode: b.bankCode,
          ...JSON.parse(decryptIdentity(b.encryptedDetails)),
        }),
      );
    const status =
      result.status === "VERIFIED" && !result.ownershipMatch
        ? "REJECTED"
        : result.status;
    await this.db
      .update(beneficiaries)
      .set({
        status,
        providerReference: result.reference,
        verifiedAt: status === "VERIFIED" ? new Date() : null,
      })
      .where(eq(beneficiaries.id, id));
    return { id, status, last4: b.last4 };
  }
  async withdraw(a: AuthUser, input: z.infer<typeof withdrawInput>) {
    this.connector.requireReady();
    await this.password(a, input.password);
    const requestHash = digest({
      beneficiaryId: input.beneficiaryId,
      amountCents: input.amountCents,
    });
    return this.db.transaction(async (tx) => {
      const [u] = await tx
        .select()
        .from(users)
        .where(eq(users.id, a.id))
        .for("update");
      await this.eligibleUser(a.id, tx);
      const [old] = await tx
        .select()
        .from(movements)
        .where(
          and(
            eq(movements.userId, a.id),
            eq(movements.clientKey, input.clientKey),
          ),
        );
      if (old) {
        if (old.requestHash !== requestHash)
          throw new ConflictException(
            "Transfer key was reused with different details.",
          );
        return safeMovement(old);
      }
      const [b] = await tx
        .select()
        .from(beneficiaries)
        .where(
          and(
            eq(beneficiaries.id, input.beneficiaryId),
            eq(beneficiaries.userId, a.id),
          ),
        );
      if (
        !b ||
        b.status !== "VERIFIED" ||
        !b.providerReference ||
        !b.verifiedAt ||
        Date.now() - b.verifiedAt.getTime() > 30 * 86400000
      )
        throw new BadRequestException(
          "Verify your own bank account before withdrawing.",
        );
      if (u.walletBalanceCents < input.amountCents)
        throw new BadRequestException("Insufficient available wallet cash.");
      const [today] = await tx
        .select({
          total: sql<string>`coalesce(sum(${movements.amountCents}),0)`,
        })
        .from(movements)
        .where(
          and(
            eq(movements.userId, a.id),
            eq(movements.kind, "WITHDRAWAL"),
            inArray(movements.status, [
              "QUEUED",
              "PROCESSING",
              "PENDING",
              "SUCCEEDED",
            ]),
            gte(movements.createdAt, new Date(Date.now() - 86400000)),
          ),
        );
      const limit = Number(process.env.MONEY_DAILY_LIMIT_CENTS ?? 1000000);
      if (
        !Number.isSafeInteger(limit) ||
        limit < 100 ||
        Number(today.total) + input.amountCents > limit
      )
        throw new BadRequestException(
          "Transfer exceeds the rolling 24-hour withdrawal limit.",
        );
      const [m] = await tx
        .insert(movements)
        .values({
          userId: a.id,
          kind: "WITHDRAWAL",
          beneficiaryId: b.id,
          amountCents: input.amountCents,
          clientKey: input.clientKey,
          requestHash,
        })
        .returning();
      await tx
        .update(users)
        .set({
          walletBalanceCents: sql`${users.walletBalanceCents}-${m.amountCents}`,
        })
        .where(eq(users.id, a.id));
      await this.ledger.post(
        tx,
        {
          type: "wallet_withdrawal_hold",
          refType: "money_movement",
          refId: m.id,
        },
        [
          {
            account: Accounts.consumerWallet(a.id),
            amountCents: m.amountCents,
          },
          { account: hold(m.id), amountCents: -m.amountCents },
        ],
      );
      await this.audit.log(
        a,
        "wallet.withdrawal_requested",
        "money_movement",
        m.id,
        { amountCents: m.amountCents },
        tx,
      );
      return safeMovement(m);
    });
  }
  /** A durable DB outbox. Every repeat uses the SAME movement ID at the bridge.
   * Unknown/timeout outcomes retain holds; only verified terminal events release money. */
  async process() {
    this.connector.requireReady();
    const batch = await this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(movements)
        .where(
          and(
            inArray(movements.status, ["QUEUED", "PROCESSING", "PENDING"]),
            lte(movements.nextAttemptAt, new Date()),
            or(
              sql`${movements.leaseUntil} is null`,
              lte(movements.leaseUntil, new Date()),
            ),
          ),
        )
        .limit(10)
        .for("update", { skipLocked: true });
      for (const m of rows)
        await tx
          .update(movements)
          .set({
            leaseUntil: new Date(Date.now() + 120000),
            nextAttemptAt: new Date(Date.now() + 300000),
            attempts: m.attempts + 1,
            status: m.status === "QUEUED" ? "PROCESSING" : m.status,
          })
          .where(eq(movements.id, m.id));
      return rows;
    });
    const results = [];
    for (const m of batch) {
      try {
        const body: Record<string, unknown> = {
          id: m.id,
          kind: m.kind,
          userId: m.userId,
          amountCents: m.amountCents,
          currency: "ZAR",
          programmeReference: process.env.MONEY_PROGRAMME_REFERENCE,
        };
        if (m.kind === "WITHDRAWAL") {
          const [b] = await this.db
            .select()
            .from(beneficiaries)
            .where(eq(beneficiaries.id, m.beneficiaryId!));
          body.beneficiaryReference = b.providerReference;
        } else {
          const [ag] = await this.db
            .select()
            .from(agreements)
            .where(eq(agreements.id, m.agreementId!));
          body.lenderId = ag.lenderId;
          body.agreementId = ag.id;
          body.agreementDigest = ag.digest;
          body.mandateReference = ag.mandateReference;
        }
        const result = providerEvent.parse(
          await this.connector.call("/v1/movements/submit-or-status", body),
        );
        if (result.movementId !== m.id)
          throw new Error("Mismatched banking instruction");
        await this.settle(result);
        results.push({ id: m.id, checked: true });
      } catch {
        results.push({ id: m.id, checked: false });
      } finally {
        await this.db
          .update(movements)
          .set({ leaseUntil: null })
          .where(eq(movements.id, m.id));
      }
    }
    return { checked: results.length, results };
  }
  async settle(event: MoneyEvent) {
    return this.db.transaction(async (tx) => {
      const [m] = await tx
        .select()
        .from(movements)
        .where(eq(movements.id, event.movementId))
        .for("update");
      if (!m) throw new NotFoundException();
      if (
        m.amountCents !== event.amountCents ||
        m.currency !== event.currency ||
        (m.providerReference && m.providerReference !== event.providerReference)
      )
        throw new ConflictException(
          "Provider instruction details do not match.",
        );
      const [seen] = await tx
        .select()
        .from(moneyEvents)
        .where(eq(moneyEvents.id, event.eventId));
      if (seen) {
        if (seen.movementId !== m.id || seen.payloadHash !== digest(event))
          throw new ConflictException("Provider event ID collision.");
        return { ok: true };
      }
      await tx
        .insert(moneyEvents)
        .values({
          id: event.eventId,
          movementId: m.id,
          payloadHash: digest(event),
        });
      if (
        m.status === event.status ||
        (event.status === "PENDING" &&
          ["FAILED", "RETURNED", "SUCCEEDED"].includes(m.status))
      )
        return { ok: true };
      if (
        ["FAILED", "RETURNED"].includes(m.status) ||
        (m.status === "SUCCEEDED" && event.status !== "RETURNED")
      )
        throw new ConflictException(
          "Conflicting terminal payment outcome; reconcile with the provider.",
        );
      if (
        event.status === "RETURNED" &&
        (m.kind !== "WITHDRAWAL" || m.status !== "SUCCEEDED")
      )
        throw new ConflictException("This return requires operations review.");
      const terminal = event.status !== "PENDING";
      if (terminal && m.kind === "FUNDING") {
        const [ag] = await tx
          .select()
          .from(agreements)
          .where(eq(agreements.id, m.agreementId!))
          .for("update");
        if (event.status === "SUCCEEDED") {
          if (ag.loanId)
            throw new ConflictException("Agreement already funded.");
          const t = ag.terms,
            q = quoteLoan(t.principalCents, t),
            now = new Date();
          const [loan] = await tx
            .insert(loans)
            .values({
              userId: m.userId,
              offerId: t.offerId,
              lenderId: ag.lenderId,
              principalCents: t.principalCents,
              termMonths: t.termMonths,
              monthlyInterestRateBps: t.monthlyInterestRateBps,
              initiationFeeCents: t.initiationFeeCents,
              monthlyServiceFeeCents: t.monthlyServiceFeeCents,
              totalRepayableCents: q.totalRepayableCents,
              outstandingCents: q.totalRepayableCents,
            })
            .returning();
          await tx
            .insert(installments)
            .values(
              q.schedule.map((i) => ({
                loanId: loan.id,
                seq: i.seq,
                dueDate: addMonths(now, i.seq),
                amountCents: i.amountCents,
              })),
            );
          await tx
            .update(users)
            .set({
              walletBalanceCents: sql`${users.walletBalanceCents}+${m.amountCents}`,
            })
            .where(eq(users.id, m.userId));
          await tx
            .update(agreements)
            .set({ status: "FUNDED", loanId: loan.id })
            .where(eq(agreements.id, ag.id));
          await tx
            .update(applications)
            .set({ status: "DISBURSED" })
            .where(eq(applications.id, ag.applicationId));
          await this.ledger.post(
            tx,
            {
              type: "personal_wallet_funded",
              refType: "money_movement",
              refId: m.id,
            },
            [
              { account: reserve(m.id), amountCents: m.amountCents },
              {
                account: Accounts.consumerWallet(m.userId),
                amountCents: -m.amountCents,
              },
            ],
          );
          await this.event(
            tx,
            ag.applicationId,
            null,
            "DISBURSED",
            "Funds are available in your wallet. Your loan schedule is ready.",
          );
        } else {
          await tx
            .update(lenderOrgs)
            .set({
              availableCents: sql`${lenderOrgs.availableCents}+${m.amountCents}`,
            })
            .where(eq(lenderOrgs.id, ag.lenderId));
          await this.ledger.post(
            tx,
            {
              type: "personal_funding_failed",
              refType: "money_movement",
              refId: m.id,
            },
            [
              { account: reserve(m.id), amountCents: m.amountCents },
              {
                account: Accounts.lenderFunds(ag.lenderId),
                amountCents: -m.amountCents,
              },
            ],
          );
          await tx
            .update(applications)
            .set({ status: "FUNDING_FAILED" })
            .where(eq(applications.id, ag.applicationId));
          await this.event(
            tx,
            ag.applicationId,
            null,
            "FUNDING_FAILED",
            "Funding did not complete. No loan was created. Contact support for a fresh assessment.",
          );
        }
      } else if (terminal) {
        if (event.status === "SUCCEEDED")
          await this.ledger.post(
            tx,
            {
              type: "wallet_withdrawal_paid",
              refType: "money_movement",
              refId: m.id,
            },
            [
              { account: hold(m.id), amountCents: m.amountCents },
              { account: Accounts.bank, amountCents: -m.amountCents },
            ],
          );
        else {
          await tx
            .update(users)
            .set({
              walletBalanceCents: sql`${users.walletBalanceCents}+${m.amountCents}`,
            })
            .where(eq(users.id, m.userId));
          await this.ledger.post(
            tx,
            {
              type:
                event.status === "RETURNED"
                  ? "wallet_withdrawal_returned"
                  : "wallet_withdrawal_failed",
              refType: "money_movement",
              refId: m.id,
            },
            [
              {
                account:
                  event.status === "RETURNED" ? Accounts.bank : hold(m.id),
                amountCents: m.amountCents,
              },
              {
                account: Accounts.consumerWallet(m.userId),
                amountCents: -m.amountCents,
              },
            ],
          );
        }
      }
      await tx
        .update(movements)
        .set({
          status: event.status,
          providerReference: event.providerReference,
          failureCode: event.failureCode ?? null,
          updatedAt: new Date(),
        })
        .where(eq(movements.id, m.id));
      await this.audit.log(
        null,
        "money.provider_event",
        "money_movement",
        m.id,
        { eventId: event.eventId, status: event.status },
        tx,
      );
      return { ok: true };
    });
  }
  async operations() {
    const rows = await this.db
      .select()
      .from(movements)
      .orderBy(desc(movements.createdAt))
      .limit(200);
    return {
      configuration: this.configuration(),
      movements: rows.map(safeMovement),
      unresolved: rows.filter((m) =>
        ["QUEUED", "PROCESSING", "PENDING"].includes(m.status),
      ).length,
    };
  }
  async reconciliation() {
    const wallet = await this.db.execute<{
      user_id: string;
      available_cents: number;
      ledger_cents: string;
    }>(
      sql`select u.id as user_id,u.wallet_balance_cents as available_cents,coalesce(sum(e.amount_cents),0)::text as ledger_cents from users u left join ledger_entries e on e.account='liability:consumer_wallet:'||u.id group by u.id,u.wallet_balance_cents having u.wallet_balance_cents+coalesce(sum(e.amount_cents),0)<>0`,
    );
    const reservations = await this.db.execute<{
      movement_id: string;
      expected_cents: number;
      ledger_cents: string;
    }>(
      sql`select m.id as movement_id,case when m.status in ('QUEUED','PROCESSING','PENDING') then -m.amount_cents else 0 end as expected_cents,coalesce(sum(e.amount_cents),0)::text as ledger_cents from money_movements m left join ledger_entries e on e.account=(case when m.kind='FUNDING' then 'liability:funding_reserved:' else 'liability:withdrawal_pending:' end)||m.id group by m.id,m.status,m.amount_cents having coalesce(sum(e.amount_cents),0)<>case when m.status in ('QUEUED','PROCESSING','PENDING') then -m.amount_cents else 0 end`,
    );
    return {
      checkedAt: new Date(),
      trialBalanceCents: await this.ledger.trialBalance(),
      bankBookCents: await this.ledger.balance(Accounts.bank),
      walletMismatches: wallet.rows,
      reservationMismatches: reservations.rows,
      externalBankReconciliation: "NOT_CONNECTED",
      note: "Internal accounting checks only. Match actual bank and provider settlement reports before financial sign-off.",
    };
  }
}
