import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { CurrentUser, Roles, type AuthUser } from "../common/auth";
import { InjectDb } from "../common/db.module";
import { Db, DbOrTx } from "../db/client";
import { AuditService } from "../common/audit.service";
import {
  users,
  lenderOrgs,
  loanOffers,
  personalLoanApplications as applications,
  personalVerifications,
  kycProfiles,
} from "../db/schema";
import {
  loanCompetitions,
  loanNotificationReceipts,
  routingRequests,
  lenderAssessments,
  decisionSessions,
  lenderAgentPolicies,
  competitionConsents,
  applicationCandidateOffers,
} from "./lender-ai.schema";
import { applicationEvents, agreements, externalLoanPayments } from "./settlement.schema";
import { SettlementService } from "./settlement.service";
import { RoutingService, distanceKm } from "./routing";
import { CreditService } from "../consumer/credit.service";
import { offerCapacity } from "../consumer/credit-engine";
import { LenderService } from "../lender/lender.service";
import { parse } from "../payday/payday.dto";
import { approveInput } from "./settlement.dto";
import { decryptIdentity, encryptIdentity } from "../auth/identity-crypto";
import { quoteLoan } from "@xtra/shared";
const openStates: (typeof applications.$inferSelect.status)[] = [
  "SUBMITTED",
  "REFERRED",
  "UNDER_REVIEW",
  "ACTION_REQUIRED",
];
const office = (a: AuthUser) =>
  a.roles.some((r) => r === "ADMIN" || r === "SUPER_ADMIN");
const releaseInput = z
  .object({
    authorityReference: z.string().trim().min(5).max(500),
    confirmed: z.literal(true),
  })
  .strict();
const customProductInput = z
  .object({
    name: z.string().trim().min(3).max(80),
    monthlyInterestRateBps: z.number().int().min(0).max(2000),
    initiationFeeCents: z.number().int().min(0).max(200000),
    monthlyServiceFeeCents: z.number().int().min(0).max(100000),
    minCreditScore: z.number().int().min(0).max(999),
    minMonthlyIncomeCents: z.number().int().min(0).max(100000000),
    confirmed: z.literal(true),
  })
  .strict();
@Injectable()
export class LoanOperationsService {
  constructor(
    @InjectDb() private db: Db,
    private audit: AuditService,
    private routing: RoutingService,
    private settlement: SettlementService,
    private credit: CreditService,
    private lender: LenderService,
  ) {}
  private async org(a: AuthUser, conn: DbOrTx = this.db) {
    const [org] = await conn
      .select({ org: lenderOrgs, roles: users.roles })
      .from(lenderOrgs)
      .innerJoin(users, eq(users.id, lenderOrgs.ownerUserId))
      .where(
        and(
          eq(lenderOrgs.ownerUserId, a.id),
          eq(users.status, "ACTIVE"),
          eq(lenderOrgs.accreditationStatus, "ACCREDITED"),
        ),
      );
    if (!org || !org.roles.includes("LENDER")) throw new NotFoundException();
    return org.org;
  }
  private async visible(id: string, conn: DbOrTx = this.db) {
    const [row] = await conn
      .select({ competition: loanCompetitions, app: applications })
      .from(loanCompetitions)
      .innerJoin(
        applications,
        eq(applications.id, loanCompetitions.applicationId),
      )
      .where(
        and(
          eq(loanCompetitions.applicationId, id),
          eq(loanCompetitions.status, "OPEN"),
          inArray(applications.status, openStates),
        ),
      );
    if (!row)
      throw new NotFoundException("This opportunity is closed or unavailable.");
    return row;
  }
  async release(a: AuthUser, id: string, input: z.infer<typeof releaseInput>) {
    return this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .for("update");
      if (!app) throw new NotFoundException();
      if (!openStates.includes(app.status))
        throw new ConflictException(
          "A decided application cannot enter a competition.",
        );
      const [agreement] = await tx
        .select()
        .from(agreements)
        .where(eq(agreements.applicationId, id));
      const [assessment] = await tx
        .select()
        .from(lenderAssessments)
        .where(eq(lenderAssessments.applicationId, id));
      if (agreement || assessment)
        throw new ConflictException(
          "An agreement or lender assessment already exists. Use a fresh request for a different lending process.",
        );
      const [routing] = await tx
        .select()
        .from(competitionConsents)
        .where(eq(competitionConsents.applicationId, id));
      if (!routing?.consentAt)
        throw new BadRequestException(
          "The applicant must explicitly consent to an all-lender offer competition first.",
        );
      const [v] = await tx
        .select()
        .from(personalVerifications)
        .where(eq(personalVerifications.userId, app.userId));
      if (v?.status !== "VERIFIED")
        throw new BadRequestException(
          "Complete identity/address review before releasing this request.",
        );
      const [existing] = await tx
        .select()
        .from(loanCompetitions)
        .where(eq(loanCompetitions.applicationId, id));
      if (existing?.status === "OPEN") return { ok: true };
      if (existing)
        throw new ConflictException("This competition has already closed.");
      await tx.insert(loanCompetitions).values({
        applicationId: id,
        releasedBy: a.id,
        authorityReference: input.authorityReference,
      });
      await tx
        .update(applications)
        .set({
          lenderId: null,
          offerId: null,
          status: "UNDER_REVIEW",
          reviewNotes:
            "Your request is open to accredited lenders for a suitable offer.",
        })
        .where(eq(applications.id, id));
      await tx
        .update(decisionSessions)
        .set({
          encrypted: encryptIdentity(
            JSON.stringify({
              messages: [],
              draft: {},
              provenance: {},
              requestKeys: [],
              nextAction: "PREPARE_OFFER",
              informationMessage: "",
            }),
          ),
          version: sql`${decisionSessions.version}+1`,
          status: "DRAFT",
          updatedBy: a.id,
          updatedAt: new Date(),
        })
        .where(eq(decisionSessions.applicationId, id));
      await this.audit.log(
        a,
        "personal_loan.competition_released",
        "personal_loan_application",
        id,
        {
          authorityReference: input.authorityReference,
          audience: "ALL_ACTIVE_ACCREDITED_LENDERS",
        },
        tx,
      );
      await tx.insert(applicationEvents).values({
        applicationId: id,
        actorId: a.id,
        status: "UNDER_REVIEW",
        message:
          "Administration released your consented request to accredited lenders. The first valid authorised offer will be presented for your acceptance.",
      });
      return { ok: true };
    });
  }
  async consent(a: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(applications)
        .where(and(eq(applications.id, id), eq(applications.userId, a.id)))
        .for("update");
      if (!app) throw new NotFoundException();
      if (!openStates.includes(app.status))
        throw new ConflictException("This request already has a decision.");
      await tx
        .insert(competitionConsents)
        .values({ applicationId: id, userId: a.id })
        .onConflictDoNothing();
      await this.audit.log(
        a,
        "personal_loan.competition_consent",
        "personal_loan_application",
        id,
        { audience: "ALL_ACTIVE_ACCREDITED_LENDERS" },
        tx,
      );
      return { ok: true };
    });
  }
  async state(a: AuthUser, id: string) {
    const app = await this.db.query.personalLoanApplications.findFirst({
      where: eq(applications.id, id),
    });
    const [competition] = await this.db
      .select()
      .from(loanCompetitions)
      .where(eq(loanCompetitions.applicationId, id));
    const isApplicant = app?.userId === a.id;
    const canSeeAsLender = !office(a) && !isApplicant && a.roles.includes("LENDER") && competition?.status === "OPEN"
      ? !!(await this.org(a))
      : false;
    if (!app || (!office(a) && !isApplicant && !canSeeAsLender))
      throw new NotFoundException();
    const [r] = await this.db
      .select()
      .from(competitionConsents)
      .where(eq(competitionConsents.applicationId, id));
    return {
      competition: competition
        ? {
            status: competition.status,
            version: competition.version,
            winnerLenderId: competition.winnerLenderId,
          }
        : null,
      consented: !!r?.consentAt,
    };
  }
  async queue(a: AuthUser) {
    const org = await this.org(a);
    const rows = await this.db
      .select({
        competition: loanCompetitions,
        app: applications,
        province: kycProfiles.province,
      })
      .from(loanCompetitions)
      .innerJoin(
        applications,
        eq(applications.id, loanCompetitions.applicationId),
      )
      .innerJoin(kycProfiles, eq(kycProfiles.userId, applications.userId))
      .where(
        and(
          eq(loanCompetitions.status, "OPEN"),
          inArray(applications.status, openStates),
        ),
      )
      .orderBy(desc(loanCompetitions.createdAt))
      .limit(100);
    return rows
      .filter((r) => r.app.userId !== org.ownerUserId)
      .map((r) => ({
        id: r.app.id,
        amountCents: r.app.amountCents,
        termMonths: r.app.termMonths,
        purpose: r.app.purpose,
        province: r.province,
        version: r.competition.version,
      }));
  }
  async detail(a: AuthUser, id: string) {
    await this.org(a);
    const { app } = await this.visible(id);
    if (app.userId === a.id) throw new NotFoundException();
    await this.audit.log(
      a,
      "personal_loan.competition_viewed",
      "personal_loan_application",
      id,
      {},
    );
    const [profile] = await this.db
      .select({ province: kycProfiles.province })
      .from(kycProfiles)
      .where(eq(kycProfiles.userId, app.userId));
    return {
      application: {
        id: app.id,
        amountCents: app.amountCents,
        termMonths: app.termMonths,
        purpose: app.purpose,
        monthlyIncomeCents: app.monthlyIncomeCents,
        monthlyExpensesCents: app.monthlyExpensesCents,
        province: profile?.province,
      },
      message:
        "The applicant consented to lender review. Obtain genuine assessment and repayment evidence through the approved secure process. No credit decision is implied by these declared figures.",
    };
  }
  async createProduct(
    a: AuthUser,
    id: string,
    input: z.infer<typeof customProductInput>,
  ) {
    const { app } = await this.visible(id);
    await this.org(a);
    if (app.userId === a.id) throw new NotFoundException();
    const [profile] = await this.db
      .select()
      .from(kycProfiles)
      .where(eq(kycProfiles.userId, app.userId));
    const product = await this.lender.createOffer(a, {
      productType: "PERSONAL",
      name: input.name,
      description:
        "Personal-loan product prepared from a consented request. Final affordability and lender approval are required.",
      active: true,
      monthlyInterestRateBps: input.monthlyInterestRateBps,
      initiationFeeCents: input.initiationFeeCents,
      monthlyServiceFeeCents: input.monthlyServiceFeeCents,
      termMonths: app.termMonths,
      minAmountCents: app.amountCents,
      maxAmountPerUserCents: app.amountCents,
      minMonthlyIncomeCents: input.minMonthlyIncomeCents,
      minCreditScore: input.minCreditScore,
      minAge: 18,
      maxAge: 75,
      employmentStatuses: [],
      provinces: profile ? [profile.province] : [],
    });
    await this.audit.log(
      a,
      "personal_loan.competition_product_created",
      "personal_loan_application",
      id,
      { offerId: product.id },
    );
    return product;
  }
  async offer(a: AuthUser, id: string, input: z.infer<typeof approveInput>) {
    return this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .for("update");
      if (!app) throw new NotFoundException();
      const { competition } = await this.visible(id, tx);
      const org = await this.org(a, tx);
      if (app.userId === a.id) throw new NotFoundException();
      const [product] = await tx
        .select()
        .from(loanOffers)
        .where(
          and(
            eq(loanOffers.id, input.offerId),
            eq(loanOffers.lenderId, org.id),
            eq(loanOffers.active, true),
            eq(loanOffers.productType, "PERSONAL"),
          ),
        );
      if (!product)
        throw new BadRequestException(
          "Choose your own active personal-loan product.",
        );
      const ctx = await this.credit.context(app.userId, tx, "PERSONAL", app),
        match = ctx.eligible.find((x) => x.offerId === product.id);
      if (
        !match ||
        match.termMonths !== app.termMonths ||
        app.amountCents < match.minAmountCents ||
        app.amountCents > offerCapacity(match, ctx.affordableCents)
      )
        throw new BadRequestException(
          "The product, current capacity or application criteria do not match.",
        );
      const policy = await this.routing.policy(tx);
      if (policy.geography === "VICINITY") {
        const [routing] = await tx
          .select()
          .from(routingRequests)
          .where(eq(routingRequests.applicationId, id));
        if (!routing?.encryptedLocation || !product.locationTarget)
          throw new BadRequestException(
            "Location evidence and product service area are required.",
          );
        const distance = distanceKm(
          JSON.parse(decryptIdentity(routing.encryptedLocation)),
          product.locationTarget,
        );
        if (
          distance > policy.radiusKm ||
          distance * 1000 > product.locationTarget.radiusMeters
        )
          throw new BadRequestException(
            "Outside the configured lender vicinity.",
          );
      }
      const quote = quoteLoan(app.amountCents, product);
      const [result] = await tx.insert(applicationCandidateOffers).values({
        applicationId: id,
        lenderId: org.id,
        offerId: product.id,
        decisionPayload: input,
        monthlyInstallmentCents: quote.monthlyInstallmentCents,
        totalRepayableCents: quote.totalRepayableCents,
        costOfCreditCents: quote.costOfCreditCents,
      }).onConflictDoUpdate({ target: [applicationCandidateOffers.applicationId, applicationCandidateOffers.lenderId], set: { offerId: product.id, decisionPayload: input, monthlyInstallmentCents: quote.monthlyInstallmentCents, totalRepayableCents: quote.totalRepayableCents, costOfCreditCents: quote.costOfCreditCents, status: 'SUBMITTED', updatedAt: new Date() } }).returning();
      await this.audit.log(
        a,
        "personal_loan.candidate_offer_submitted",
        "personal_loan_application",
        id,
        { offerId: product.id, candidateOfferId: result.id },
        tx,
      );
      return result;
    });
  }

  async candidateOffers(a: AuthUser, id: string) {
    const app = await this.db.query.personalLoanApplications.findFirst({ where: and(eq(applications.id, id), eq(applications.userId, a.id)) });
    if (!app) throw new NotFoundException();
    const rows = await this.db.select({ candidate: applicationCandidateOffers, lenderName: lenderOrgs.name, offerName: loanOffers.name, monthlyInterestRateBps: loanOffers.monthlyInterestRateBps, initiationFeeCents: loanOffers.initiationFeeCents, monthlyServiceFeeCents: loanOffers.monthlyServiceFeeCents }).from(applicationCandidateOffers).innerJoin(lenderOrgs, eq(lenderOrgs.id, applicationCandidateOffers.lenderId)).innerJoin(loanOffers, eq(loanOffers.id, applicationCandidateOffers.offerId)).where(and(eq(applicationCandidateOffers.applicationId, id), eq(applicationCandidateOffers.status, 'SUBMITTED'))).orderBy(asc(applicationCandidateOffers.totalRepayableCents), asc(applicationCandidateOffers.createdAt)).limit(3);
    return rows.map((r, index) => ({ id: r.candidate.id, rank: index + 1, lenderName: r.lenderName, offerName: r.offerName, monthlyInterestRateBps: r.monthlyInterestRateBps, initiationFeeCents: r.initiationFeeCents, monthlyServiceFeeCents: r.monthlyServiceFeeCents, monthlyInstallmentCents: r.candidate.monthlyInstallmentCents, totalRepayableCents: r.candidate.totalRepayableCents, costOfCreditCents: r.candidate.costOfCreditCents, createdAt: r.candidate.createdAt }));
  }

  async selectCandidate(a: AuthUser, id: string, candidateId: string) {
    return this.db.transaction(async (tx) => {
      const [app] = await tx.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, a.id))).for('update');
      if (!app || !openStates.includes(app.status)) throw new ConflictException('This request can no longer select an offer.');
      const [row] = await tx.select({ candidate: applicationCandidateOffers, ownerUserId: lenderOrgs.ownerUserId }).from(applicationCandidateOffers).innerJoin(lenderOrgs, eq(lenderOrgs.id, applicationCandidateOffers.lenderId)).where(and(eq(applicationCandidateOffers.id, candidateId), eq(applicationCandidateOffers.applicationId, id), eq(applicationCandidateOffers.status, 'SUBMITTED')));
      if (!row) throw new NotFoundException();
      const available = await tx.select({ id: applicationCandidateOffers.id }).from(applicationCandidateOffers).where(and(eq(applicationCandidateOffers.applicationId, id), eq(applicationCandidateOffers.status, 'SUBMITTED')));
      if (available.length < 3) throw new ConflictException('Three lender offers are required before the applicant can compare and select.');
      const topThree = await tx.select({ id: applicationCandidateOffers.id }).from(applicationCandidateOffers).where(and(eq(applicationCandidateOffers.applicationId, id), eq(applicationCandidateOffers.status, 'SUBMITTED'))).orderBy(asc(applicationCandidateOffers.totalRepayableCents), asc(applicationCandidateOffers.createdAt)).limit(3);
      if (!topThree.some((offer) => offer.id === candidateId)) throw new ConflictException('Only one of the three best current offers can be selected.');
      await tx.update(applications).set({ lenderId: row.candidate.lenderId, offerId: row.candidate.offerId, status: 'REFERRED' }).where(eq(applications.id, id));
      const agreement = await this.settlement.approve({ id: row.ownerUserId, email: null, roles: ['LENDER'] }, id, approveInput.parse(row.candidate.decisionPayload), tx);
      await tx.update(applicationCandidateOffers).set({ status: sql`CASE WHEN ${applicationCandidateOffers.id} = ${candidateId} THEN 'SELECTED' ELSE 'NOT_SELECTED' END`, updatedAt: new Date() }).where(eq(applicationCandidateOffers.applicationId, id));
      await tx.update(loanCompetitions).set({ status: 'CLOSED', winnerLenderId: row.candidate.lenderId, version: sql`${loanCompetitions.version} + 1` }).where(eq(loanCompetitions.applicationId, id));
      await this.audit.log(a, 'personal_loan.candidate_offer_selected', 'personal_loan_application', id, { candidateOfferId: candidateId, agreementId: agreement.id }, tx);
      return agreement;
    });
  }
  async notifications(a: AuthUser) {
    const notifications: {
      key: string;
      applicationId: string;
      title: string;
      description: string;
      cta: string;
      kind: string;
      owner: string;
      read?: boolean;
    }[] = [];
    let rows: (typeof applications.$inferSelect)[] = [];
    if (office(a)) rows = [];
    else if (a.roles.includes("LENDER")) {
      const account = await this.db.query.lenderOrgs.findFirst({
        where: eq(lenderOrgs.ownerUserId, a.id),
      });
      if (account?.accreditationStatus !== "ACCREDITED")
        return {
          notifications: [],
          delivery: "IN_APP",
          externalDeliveryConfigured: false,
        };
      const org = await this.org(a);
      rows = await this.db
        .select()
        .from(applications)
        .where(or(inArray(applications.status, openStates), eq(applications.lenderId, org.id)))
        .orderBy(desc(applications.createdAt))
        .limit(100);
    } else
      rows = await this.db
        .select()
        .from(applications)
        .where(eq(applications.userId, a.id))
        .orderBy(desc(applications.createdAt))
        .limit(100);
    const paidExternally = new Set((rows.length ? await this.db.select({id: externalLoanPayments.applicationId}).from(externalLoanPayments).where(inArray(externalLoanPayments.applicationId,rows.map(r=>r.id))) : []).map(r=>r.id));
    for (const app of rows) {
      let title = "",
        description = "",
        cta = "",
        owner = "";
      if (office(a) && openStates.includes(app.status)) {
        title = app.lenderId
          ? "Review lending progress"
          : "Match lenders or release for offers";
        description =
          "Review the request, manage consent and match a lender or open an offer competition.";
        cta = "Review application";
        owner = "Admin";
      } else if (office(a) && app.status === "ACCEPTED") {
        title = "Release wallet funding";
        description =
          "The applicant accepted. A separate authorised administrator must release funding when banking is active.";
        cta = "Review funding";
        owner = "Finance admin";
      } else if (a.roles.includes("LENDER") && openStates.includes(app.status)) {
        title = "Complete the lending assessment";
        description =
          "Review this customer request and submit an offer if it fits your lending criteria. XTRA-CASH ranks the customer’s three best current offers.";
        cta = "Review and make offer";
        owner = "Lender";
      } else if (app.userId === a.id && app.status === "ACTION_REQUIRED") {
        title = "Your application needs information";
        description = app.reviewNotes ?? "Please reply to the request.";
        cta = "Reply now";
        owner = "Applicant";
      } else if (app.userId === a.id && app.status === "OFFERED") {
        title = "Your loan offer is ready";
        description =
          "Read the quotation and agreement. Accept only if you agree to the lender’s terms.";
        cta = "Read offer";
        owner = "Applicant";
      } else if (app.userId === a.id && app.status === "DISBURSED") {
        title = paidExternally.has(app.id) ? 'Your loan payment was sent' : "Manage your wallet";
        description =
          paidExternally.has(app.id) ? 'Administration confirmed the external bank payment. View the payment reference and repayment schedule.' : "Confirmed loan proceeds are in your wallet. EFT requires an activated banking connection and a verified own-name bank account.";
        cta = paidExternally.has(app.id) ? 'View payment and loan' : "Open wallet";
        owner = "Applicant";
      } else if (
        app.userId === a.id &&
        ["DECLINED", "FUNDING_FAILED"].includes(app.status)
      ) {
        title = "Review your application update";
        description =
          app.reviewNotes ??
          "Read the latest decision and available next steps.";
        cta = "View update";
        owner = "Applicant";
      }
      if (title)
        notifications.push({
          key: `application:${app.id}:${app.status}`,
          applicationId: app.id,
          title,
          description,
          cta,
          kind: app.status === "DISBURSED" && !paidExternally.has(app.id) ? "WALLET" : "APPLICATION",
          owner,
        });
    }
    if (!office(a) && !a.roles.includes('LENDER') && rows.length) {
      const candidateRows = await this.db.select({ applicationId: applicationCandidateOffers.applicationId }).from(applicationCandidateOffers).where(and(inArray(applicationCandidateOffers.applicationId, rows.map((r) => r.id)), eq(applicationCandidateOffers.status, 'SUBMITTED')));
      const counts = candidateRows.reduce((map, row) => map.set(row.applicationId, (map.get(row.applicationId) ?? 0) + 1), new Map<string, number>());
      for (const [applicationId, count] of counts) if (count >= 3) notifications.unshift({ key: `application:${applicationId}:TOP_OFFERS:${count}`, applicationId, title: 'Your top loan offers are ready', description: 'Compare the three lowest-cost current offers. Select one to generate the agreement; no funds move until you accept and sign.', cta: 'Compare top offers', kind: 'APPLICATION', owner: 'Applicant' });
    }
    const receipts = await this.db
      .select()
      .from(loanNotificationReceipts)
      .where(eq(loanNotificationReceipts.userId, a.id));
    return {
      notifications: notifications.slice(0, 100).map((n) => ({
        ...n,
        read: receipts.some((r) => r.notificationKey === n.key),
      })),
      delivery: "IN_APP",
      externalDeliveryConfigured: false,
    };
  }
  async read(a: AuthUser, key: string) {
    const current = await this.notifications(a);
    if (!current.notifications.some((n) => n.key === key))
      throw new NotFoundException();
    await this.db
      .insert(loanNotificationReceipts)
      .values({ userId: a.id, notificationKey: key })
      .onConflictDoNothing();
    return { ok: true };
  }
  async close(a: AuthUser, id: string, input: z.infer<typeof releaseInput>) {
    return this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .for("update");
      if (!app) throw new NotFoundException();
      const [competition] = await tx
        .select()
        .from(loanCompetitions)
        .where(eq(loanCompetitions.applicationId, id));
      if (
        !competition ||
        competition.status !== "OPEN" ||
        !openStates.includes(app.status)
      )
        throw new ConflictException(
          "This competition is already closed or has a winning offer.",
        );
      await tx
        .update(loanCompetitions)
        .set({ status: "CLOSED", version: competition.version + 1 })
        .where(eq(loanCompetitions.applicationId, id));
      await tx
        .update(applications)
        .set({
          status: "SUBMITTED",
          reviewNotes:
            "Administration closed the offer competition and is reviewing your next step.",
        })
        .where(eq(applications.id, id));
      await tx
        .update(routingRequests)
        .set({ mode: "PRIVATE" })
        .where(eq(routingRequests.applicationId, id));
      await this.audit.log(
        a,
        "personal_loan.competition_closed",
        "personal_loan_application",
        id,
        { reason: input.authorityReference },
        tx,
      );
      await tx
        .insert(applicationEvents)
        .values({
          applicationId: id,
          actorId: a.id,
          status: "SUBMITTED",
          message:
            "Administration closed the offer competition and returned your request to private review.",
        });
      return { ok: true };
    });
  }
  async requestConsent(a: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .for("update");
      if (!app) throw new NotFoundException();
      if (!openStates.includes(app.status))
        throw new ConflictException("This request already has a decision.");
      const message =
        "Please confirm whether you consent to all active accredited lenders reviewing your request and preparing a matching offer. Open your application and use Confirm competition consent.";
      await tx
        .update(applications)
        .set({ status: "ACTION_REQUIRED", reviewNotes: message })
        .where(eq(applications.id, id));
      await tx
        .insert(applicationEvents)
        .values({
          applicationId: id,
          actorId: a.id,
          status: "ACTION_REQUIRED",
          message,
        });
      await this.audit.log(
        a,
        "personal_loan.competition_consent_requested",
        "personal_loan_application",
        id,
        {},
        tx,
      );
      return { ok: true };
    });
  }
  async evidence(a: AuthUser, id: string) {
    const app = await this.db.query.personalLoanApplications.findFirst({
      where: eq(applications.id, id),
    });
    if (!app || app.userId === a.id) throw new NotFoundException();
    let lenderId = app.lenderId;
    if (!office(a)) {
      const org = await this.org(a);
      if (app.lenderId !== org.id) await this.visible(id);
      lenderId = org.id;
    }
    const [assessment] = await this.db
      .select()
      .from(lenderAssessments)
      .where(eq(lenderAssessments.applicationId, id));
    const [policy] = lenderId
      ? await this.db
          .select()
          .from(lenderAgentPolicies)
          .where(eq(lenderAgentPolicies.lenderId, lenderId))
      : [];
    return {
      assessmentReferences:
        assessment?.lenderId === lenderId
          ? [assessment.assessmentReference]
          : [],
      mandateReferences:
        assessment?.lenderId === lenderId ? [assessment.mandateReference] : [],
      legalTemplates:
        policy?.policy.legalReference && policy.policy.agreementTerms
          ? [
              {
                reference: policy.policy.legalReference,
                terms: policy.policy.agreementTerms,
              },
            ]
          : [],
    };
  }
}
@Controller("loan-operations")
export class LoanOperationsController {
  constructor(private service: LoanOperationsService) {}
  @Get("notifications") notifications(@CurrentUser() a: AuthUser) {
    return this.service.notifications(a);
  }
  @Post("notifications/read") read(
    @CurrentUser() a: AuthUser,
    @Body() b: unknown,
  ) {
    return this.service.read(
      a,
      parse(z.object({ key: z.string().min(1).max(250) }).strict(), b).key,
    );
  }
  @Roles("ADMIN", "SUPER_ADMIN", "LENDER") @Get("evidence/:id") evidence(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
  ) {
    return this.service.evidence(a, id);
  }
  @Get("competitions/:id/state") state(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
  ) {
    return this.service.state(a, id);
  }
  @Roles("LENDER") @Get("competitions") queue(@CurrentUser() a: AuthUser) {
    return this.service.queue(a);
  }
  @Roles("LENDER") @Get("competitions/:id") detail(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
  ) {
    return this.service.detail(a, id);
  }
  @Roles("LENDER") @Post("competitions/:id/products") product(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.createProduct(a, id, parse(customProductInput, b));
  }
  @Roles("LENDER") @Post("competitions/:id/offer") offer(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.offer(a, id, parse(approveInput, b));
  }
  @Get("competitions/:id/offers") candidateOffers(@CurrentUser() a: AuthUser, @Param("id") id: string) {
    return this.service.candidateOffers(a, id);
  }
  @Post("competitions/:id/offers/:candidateId/select") selectCandidate(@CurrentUser() a: AuthUser, @Param("id") id: string, @Param("candidateId") candidateId: string) {
    return this.service.selectCandidate(a, id, candidateId);
  }
}
