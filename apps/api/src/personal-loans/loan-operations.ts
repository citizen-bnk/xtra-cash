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
import { createHash } from 'node:crypto';
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
  vaultDocuments,
  vaultDocumentReviews,
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
import { createApplicationOffer } from './application-offer';
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
      const [template] = await tx
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
      if (!template || (template.applicationId && template.applicationId !== id))
        throw new BadRequestException(
          "Choose your own active personal-loan product.",
        );
      const product = input.applicationOnly ? await createApplicationOffer(tx, template, app) : template;
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
      const decisionPayload = { ...input, applicationOnly: undefined, offerId: product.id };
      const [result] = await tx.insert(applicationCandidateOffers).values({
        applicationId: id,
        lenderId: org.id,
        offerId: product.id,
        decisionPayload,
        monthlyInstallmentCents: quote.monthlyInstallmentCents,
        totalRepayableCents: quote.totalRepayableCents,
        costOfCreditCents: quote.costOfCreditCents,
      }).onConflictDoUpdate({
        target: [applicationCandidateOffers.applicationId, applicationCandidateOffers.lenderId],
        set: {
          offerId: product.id, decisionPayload, monthlyInstallmentCents: quote.monthlyInstallmentCents,
          totalRepayableCents: quote.totalRepayableCents, costOfCreditCents: quote.costOfCreditCents,
          status: 'SUBMITTED', updatedAt: new Date(),
        },
      }).returning();
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

  private async currentCandidates(app: typeof applications.$inferSelect, conn: DbOrTx = this.db) {
    const rows = await conn.select({
      candidate: applicationCandidateOffers, product: loanOffers,
      lenderName: lenderOrgs.name, ownerUserId: lenderOrgs.ownerUserId,
    }).from(applicationCandidateOffers)
      .innerJoin(lenderOrgs, eq(lenderOrgs.id, applicationCandidateOffers.lenderId))
      .innerJoin(loanOffers, and(eq(loanOffers.id, applicationCandidateOffers.offerId), eq(loanOffers.lenderId, lenderOrgs.id)))
      .where(and(eq(applicationCandidateOffers.applicationId, app.id), eq(applicationCandidateOffers.status, 'SUBMITTED'),
        eq(lenderOrgs.accreditationStatus, 'ACCREDITED'), eq(loanOffers.active, true), eq(loanOffers.productType, 'PERSONAL')))
      .orderBy(asc(applicationCandidateOffers.totalRepayableCents), asc(applicationCandidateOffers.createdAt), asc(applicationCandidateOffers.id));
    return rows.filter(({ candidate, product }) => {
      const decision = approveInput.safeParse(candidate.decisionPayload);
      if (!decision.success || (decision.data.expiresAt && Date.parse(decision.data.expiresAt) <= Date.now())) return false;
      if (app.termMonths !== product.termMonths || app.amountCents < product.minAmountCents || app.amountCents > product.maxAmountPerUserCents) return false;
      const quote = quoteLoan(app.amountCents, product);
      return quote.totalRepayableCents === candidate.totalRepayableCents
        && quote.monthlyInstallmentCents === candidate.monthlyInstallmentCents;
    }).slice(0, 3);
  }

  async candidateOffers(a: AuthUser, id: string) {
    const app = await this.db.query.personalLoanApplications.findFirst({ where: and(eq(applications.id, id), eq(applications.userId, a.id)) });
    if (!app) throw new NotFoundException();
    if (!openStates.includes(app.status)) return [];
    return (await this.currentCandidates(app)).map(({ candidate, product, lenderName }, index) => ({
      id: candidate.id, rank: index + 1, lenderName, offerName: product.name,
      monthlyInterestRateBps: product.monthlyInterestRateBps, initiationFeeCents: product.initiationFeeCents,
      monthlyServiceFeeCents: product.monthlyServiceFeeCents, monthlyInstallmentCents: candidate.monthlyInstallmentCents,
      totalRepayableCents: candidate.totalRepayableCents, costOfCreditCents: candidate.costOfCreditCents, createdAt: candidate.createdAt,
    }));
  }

  async selectCandidate(a: AuthUser, id: string, candidateId: string) {
    return this.db.transaction(async (tx) => {
      const [app] = await tx.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, a.id))).for('update');
      if (!app || !openStates.includes(app.status)) throw new ConflictException('This request can no longer select an offer.');
      const row = (await this.currentCandidates(app, tx)).find(offer => offer.candidate.id === candidateId);
      if (!row) throw new ConflictException('This offer is no longer available. Refresh to see current offers.');
      const [product] = await tx.select().from(loanOffers).where(eq(loanOffers.id, row.product.id)).for('share');
      if (!product?.active || product.updatedAt.getTime() !== row.product.updatedAt.getTime())
        throw new ConflictException('This offer changed. Refresh to see current offers.');
      const credit = await this.credit.context(app.userId, tx, 'PERSONAL', app);
      const match = credit.eligible.find(offer => offer.offerId === product.id);
      if (!match || app.amountCents > offerCapacity(match, credit.affordableCents))
        throw new ConflictException('Eligibility or lender capacity changed. Refresh to see available offers.');
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
    let lenderOrganizationId: string | null = null;
    if (office(a)) rows = await this.db.select().from(applications)
      .where(or(inArray(applications.status, openStates), eq(applications.status, 'OFFERED'), eq(applications.status, 'ACCEPTED'), eq(applications.status, 'DISBURSED')))
      .orderBy(desc(applications.createdAt)).limit(100);
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
      lenderOrganizationId = org.id;
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
    const offeredProductIds = [...new Set(rows.filter(row => row.status === 'OFFERED' && row.offerId).map(row => row.offerId!))];
    const inactiveOffers = new Set((offeredProductIds.length
      ? await this.db.select({ id: loanOffers.id }).from(loanOffers)
          .where(and(inArray(loanOffers.id, offeredProductIds), eq(loanOffers.active, false)))
      : []).map(offer => offer.id));
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
      } else if (office(a) && app.status === "OFFERED") {
        title = "Customer offers are ready";
        description = "The applicant has offers to compare. Monitor progress if support is needed.";
        cta = "View application";
        owner = "Platform admin";
      } else if (office(a) && app.status === "ACCEPTED") {
        title = "Confirm deposit and credit wallet";
        description =
          "The applicant accepted. Confirm the lender's deposit has reached the XTRA-CASH settlement account, then credit the applicant's wallet.";
        cta = "Confirm receipt";
        owner = "Finance admin";
      } else if (a.roles.includes("LENDER") && openStates.includes(app.status)) {
        title = "Complete the lending assessment";
        description =
          "Review this customer request and submit an offer if it fits your lending criteria. XTRA-CASH ranks the customer’s three best current offers.";
        cta = "Review and make offer";
        owner = "Lender";
      } else if (a.roles.includes("LENDER") && app.lenderId && app.lenderId === lenderOrganizationId && app.status === "ACCEPTED") {
        title = "Applicant accepted your offer";
        description = "Review the signed agreement and funding status for this loan.";
        cta = "Open application";
        owner = "Lender";
      } else if (app.userId === a.id && app.status === "ACTION_REQUIRED") {
        title = "Your application needs information";
        description = app.reviewNotes ?? "Please reply to the request.";
        cta = "Reply now";
        owner = "Applicant";
      } else if (app.userId === a.id && app.status === "UNDER_REVIEW" && app.reviewNotes) {
        title = "Your application is under review";
        description = app.reviewNotes;
        cta = "View application";
        owner = "Applicant";
      } else if (app.userId === a.id && app.status === "OFFERED" && !inactiveOffers.has(app.offerId ?? '')) {
        title = "Your loan offer is ready";
        description =
          "Read the quotation and agreement. Accept only if you agree to the lender’s terms.";
        cta = "Read offer";
        owner = "Applicant";
      } else if (app.userId === a.id && app.status === "DISBURSED") {
        title = paidExternally.has(app.id) ? 'Your loan payment was sent' : "Manage your wallet";
        description =
          paidExternally.has(app.id) ? 'The lender deposit was received and credited to your XTRA-CASH wallet. View the payment reference and repayment schedule.' : "Confirmed loan proceeds are in your wallet. EFT requires an activated banking connection and a verified own-name bank account.";
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
    if (!office(a) && !a.roles.includes('LENDER')) {
      const [pendingDocs, flaggedReviews] = await Promise.all([
        this.db.select({ id: vaultDocuments.id, type: vaultDocuments.type }).from(vaultDocuments).where(and(eq(vaultDocuments.userId, a.id), inArray(vaultDocuments.status, ['PROCESSING', 'RECEIVED']))).orderBy(desc(vaultDocuments.createdAt)).limit(20),
        this.db.select({ id: vaultDocumentReviews.id, applicationId: vaultDocumentReviews.applicationId, status: vaultDocumentReviews.status, comment: vaultDocumentReviews.comment, documentId: vaultDocumentReviews.documentId }).from(vaultDocumentReviews).where(and(eq(vaultDocumentReviews.userId, a.id), inArray(vaultDocumentReviews.status, ['REJECTED', 'REVOKED']))).orderBy(desc(vaultDocumentReviews.createdAt)).limit(20),
      ]);
      for (const doc of pendingDocs) notifications.unshift({ key: `vault:${doc.id}:processing`, applicationId: 'vault', title: 'Document received · review pending', description: 'This document is safely stored in your profile vault. Automated extraction is waiting for the OCR provider; no profile match or discrepancy has been confirmed yet.', cta: 'Open my data vault', kind: 'VAULT', owner: 'Applicant' });
      for (const review of flaggedReviews) notifications.unshift({ key: `vault-review:${review.id}`, applicationId: review.applicationId, title: review.status === 'REVOKED' ? 'Document acceptance was revoked' : 'Document needs attention', description: review.comment, cta: 'Review document', kind: 'VAULT', owner: 'Applicant' });
    }
    const openCustomerApplications = rows.filter(row => row.userId === a.id && openStates.includes(row.status));
    if (!office(a) && !a.roles.includes('LENDER') && openCustomerApplications.length) {
      const candidates = await this.db.selectDistinct({ applicationId: applicationCandidateOffers.applicationId })
        .from(applicationCandidateOffers)
        .innerJoin(loanOffers, eq(loanOffers.id, applicationCandidateOffers.offerId))
        .innerJoin(lenderOrgs, eq(lenderOrgs.id, applicationCandidateOffers.lenderId))
        .where(and(inArray(applicationCandidateOffers.applicationId, openCustomerApplications.map(row => row.id)),
          eq(applicationCandidateOffers.status, 'SUBMITTED'), eq(loanOffers.active, true), eq(lenderOrgs.accreditationStatus, 'ACCREDITED')));
      const ids = new Set(candidates.map(row => row.applicationId));
      for (const app of openCustomerApplications.filter(row => ids.has(row.id))) {
        const offers = await this.currentCandidates(app);
        if (!offers.length) continue;
        const revision = createHash('sha256').update(JSON.stringify(offers.map(({ candidate }) => [candidate.id, candidate.updatedAt]))).digest('hex');
        notifications.unshift({
          key: `candidate-offer:${app.id}:${revision}`,
          applicationId: app.id,
          title: offers.length === 1 ? 'Your loan offer is ready' : 'Your loan offers are ready',
          description: 'Review the offer terms and choose an agreement to read.',
          cta: 'View offers', kind: 'APPLICATION', owner: 'Applicant',
        });
      }
    }
    const updates = await this.db.execute<{
      id: string; application_id: string | null; title: string; description: string;
    }>(sql`
      SELECT id,application_id,title,description FROM lender_offer_updates
      WHERE user_id = ${a.id} ORDER BY created_at DESC LIMIT 20
    `);
    for (const update of updates.rows.reverse()) notifications.unshift({
      key: `offer-update:${update.id}`,
      applicationId: update.application_id ?? 'offers',
      title: update.title,
      description: update.description,
      cta: update.application_id ? 'View application' : 'View offers',
      kind: update.application_id ? 'APPLICATION' : 'OFFERS',
      owner: 'Applicant',
    });
    const receipts = await this.db
      .select()
      .from(loanNotificationReceipts)
      .where(eq(loanNotificationReceipts.userId, a.id));
    const guarantees = await this.db.execute<{ id: string; status: string; signer: boolean }>(sql`
      SELECT g.id,g.status,g.signer_id=${a.id} AS signer FROM personal_guarantees g
      JOIN personal_loan_applications a ON a.id=g.application_id
      WHERE (g.signer_id=${a.id} AND g.status='READY' AND g.expires_at>now()
        AND a.status IN ('SUBMITTED','REFERRED','UNDER_REVIEW','ACTION_REQUIRED'))
        OR (g.applicant_id=${a.id} AND g.status IN ('SIGNED','DECLINED'))
      ORDER BY g.created_at LIMIT 20
    `);
    for (const guarantee of guarantees.rows) notifications.unshift({
      key: `guarantee:${guarantee.id}:${guarantee.status}`, applicationId: guarantee.id,
      title: guarantee.signer ? 'Review a guarantee request' : guarantee.status === 'SIGNED' ? 'Your guarantor signed' : 'Guarantee request declined',
      description: guarantee.signer ? 'Read the terms and decide whether to sign.' : 'View the status of your guarantee request.',
      cta: 'View guarantees', kind: 'GUARANTEE', owner: guarantee.signer ? 'Guarantor' : 'Applicant',
    });
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
        "Please confirm whether you consent to all active accredited lenders reviewing your loan request. Open your application and use Confirm competition consent.";
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
