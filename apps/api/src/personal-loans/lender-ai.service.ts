import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { quoteLoan } from "@xtra/shared";
import { InjectDb } from "../common/db.module";
import { Db, DbOrTx } from "../db/client";
import { AuthUser } from "../common/auth";
import { AuditService } from "../common/audit.service";
import {
  users,
  lenderOrgs,
  loanOffers,
  personalLoanApplications as applications,
  personalVerifications,
} from "../db/schema";
import { applicationEvents, agreements } from "./settlement.schema";
import { approveInput } from "./settlement.dto";
import { SettlementService } from "./settlement.service";
import {
  decisionSessions,
  lenderAgentPolicies,
  lenderAssessments,
  lenderAgentRuns,
  type DecisionConversation,
  type DecisionDraft,
  type AgentPolicy,
} from "./lender-ai.schema";
import {
  decisionChatInput,
  decisionAdvanceInput,
  lenderPolicyInput,
  assessmentEventInput,
} from "./lender-ai.dto";
import { LenderAiModel } from "./lender-ai-model";
import { decryptIdentity, encryptIdentity } from "../auth/identity-crypto";
const hash = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const reviewable = ["SUBMITTED", "REFERRED", "UNDER_REVIEW", "ACTION_REQUIRED"];
const admin = (a: AuthUser) =>
  a.roles.some((r) => r === "ADMIN" || r === "SUPER_ADMIN");
const blankPolicy: AgentPolicy = {
  offerId: "",
  amountLimitCents: 300000,
  dailyOfferLimit: 5,
  expiryHours: 24,
  legalReference: "",
  agreementTerms: "",
  automationReviewReference: "",
};
const required = [
  "offerId",
  "assessmentReference",
  "mandateReference",
  "legalReference",
  "assessedAt",
  "expiresAt",
  "agreementTerms",
] as const;
export function applyGroundedUpdates(
  draft: DecisionDraft,
  updates: {
    field: keyof Omit<DecisionDraft, "expiresAt">;
    value: string;
    sourceQuote: string;
  }[],
  userMessages: string[],
  products: { id: string }[],
) {
  const next = { ...draft },
    provenance: Record<string, string> = {},
    source = userMessages.join("\n");
  for (const u of updates) {
    if (u.field === "offerId") {
      if (!products.some((p) => p.id === u.value))
        throw new BadRequestException("AI selected an unavailable product.");
      next.offerId = u.value;
      provenance.offerId = "Existing lender product";
      continue;
    }
    if (!u.sourceQuote.trim() || !source.includes(u.sourceQuote))
      throw new BadRequestException(
        "The draft contains an unsupported source. Please restate the missing requirement.",
      );
    if (
      u.field === "assessedAt" &&
      u.value === "TODAY" &&
      /\b(?:completed|finished|performed|done|assessed)\b.*\btoday\b|\btoday\b.*\b(?:completed|finished|performed|done|assessed)\b/i.test(
        u.sourceQuote,
      )
    ) {
      next.assessedAt = new Date().toISOString();
      provenance.assessedAt = "Reviewer states assessment completed today";
      continue;
    }
    if (!u.sourceQuote.includes(u.value) || !u.value.trim())
      throw new BadRequestException(
        "AI cannot invent evidence references or agreement wording. Supply the actual approved value.",
      );
    next[u.field] = u.value.trim();
    provenance[u.field] = "Supplied by reviewer in chat";
  }
  return { draft: next, provenance };
}
@Injectable()
export class LenderAiService {
  constructor(
    @InjectDb() private db: Db,
    private settlement: SettlementService,
    private model: LenderAiModel,
    private audit: AuditService,
  ) {}
  private async org(a: AuthUser, tx: DbOrTx = this.db) {
    const [l] = await tx
      .select()
      .from(lenderOrgs)
      .where(eq(lenderOrgs.ownerUserId, a.id));
    if (!l || l.accreditationStatus !== "ACCREDITED")
      throw new ForbiddenException("An accredited lender account is required.");
    return l;
  }
  private async application(a: AuthUser, id: string, tx: DbOrTx = this.db) {
    const [app] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, id));
    if (!app || app.userId === a.id) throw new NotFoundException();
    if (!admin(a)) {
      const l = await this.org(a, tx);
      if (app.lenderId !== l.id) throw new NotFoundException();
    }
    return app;
  }
  private async products(a: AuthUser, app: typeof applications.$inferSelect) {
    const available = await this.db
      .select({ offer: loanOffers, lender: lenderOrgs })
      .from(loanOffers)
      .innerJoin(lenderOrgs, eq(loanOffers.lenderId, lenderOrgs.id))
      .where(
        and(
          eq(loanOffers.active, true),
          eq(loanOffers.productType, "PERSONAL"),
          eq(lenderOrgs.accreditationStatus, "ACCREDITED"),
        ),
      );
    return available
      .filter(
        (x) =>
          (!app.lenderId || x.lender.id === app.lenderId) &&
          (admin(a) || x.lender.ownerUserId === a.id) &&
          x.offer.termMonths === app.termMonths &&
          x.offer.minAmountCents <= app.amountCents &&
          x.offer.maxAmountPerUserCents >= app.amountCents,
      )
      .map((x) => x.offer);
  }
  private async seed(
    app: typeof applications.$inferSelect,
    base?: DecisionConversation,
  ) {
    const conversation: DecisionConversation = base
      ? JSON.parse(JSON.stringify(base))
      : {
          messages: [],
          draft: {},
          provenance: {},
          requestKeys: [],
          nextAction: "PREPARE_OFFER",
          informationMessage: "",
        };
    const [policy] = app.lenderId
      ? await this.db
          .select()
          .from(lenderAgentPolicies)
          .where(eq(lenderAgentPolicies.lenderId, app.lenderId))
      : [];
    const [assessment] = await this.db
      .select()
      .from(lenderAssessments)
      .where(eq(lenderAssessments.applicationId, app.id));
    const productPolicy=policy?.policy.offerId===app.offerId?policy:undefined;
    const defaults: DecisionDraft = {
      offerId: app.offerId ?? policy?.policy.offerId,
      legalReference: productPolicy?.policy.legalReference,
      agreementTerms: productPolicy?.policy.agreementTerms,
    };
    for (const k of ["offerId", "legalReference", "agreementTerms"] as const)
      if (!conversation.draft[k] && defaults[k]) {
        conversation.draft[k] = defaults[k];
        conversation.provenance[k] =
          k === "offerId"
            ? "Applicant-selected product or lender policy"
            : "Lender-approved policy";
      }
    if (
      assessment?.decision === "APPROVED" &&
      assessment.expiresAt.getTime() > Date.now() &&
      Object.values(assessment.checks).every(Boolean)
    ) {
      for (const [k, v] of Object.entries({
        offerId: assessment.offerId,
        assessmentReference: assessment.assessmentReference,
        mandateReference: assessment.mandateReference,
        assessedAt: assessment.assessedAt.toISOString(),
      }) as [keyof DecisionDraft, string][])
        if (!conversation.draft[k]) {
          conversation.draft[k] = v;
          conversation.provenance[k] = "Verified lender assessment";
        }
    }
    if (conversation.draft.assessedAt) {
      const at = new Date(conversation.draft.assessedAt).getTime();
      if (Number.isFinite(at)) {
        conversation.draft.expiresAt = new Date(
          Math.min(
            Date.now() + (policy?.policy.expiryHours ?? 24) * 3600000,
            at + 7 * 86400000,
          ),
        ).toISOString();
        conversation.provenance.expiresAt =
          "Server-calculated within assessment validity";
      }
    }
    return conversation;
  }
  private view(
    session: typeof decisionSessions.$inferSelect | undefined,
    c: DecisionConversation,
    products: (typeof loanOffers.$inferSelect)[],
    verified: boolean,
  ) {
    const parsed = approveInput.safeParse({
      ...c.draft,
      responsibleLendingConfirmed: true,
    });
    const missing: string[] = required.filter((k) => !c.draft[k]);
    if (!verified) missing.push("Verified identity and address");
    if (c.draft.assessedAt) {
      const at = new Date(c.draft.assessedAt).getTime();
      if (
        !Number.isFinite(at) ||
        at > Date.now() ||
        Date.now() - at > 7 * 86400000
      )
        missing.push("Current completed assessment");
    }
    if (!parsed.success && missing.length === 0)
      missing.push("Valid evidence references and approved terms");
    const product = products.find((p) => p.id === c.draft.offerId);
    if (!product) missing.push("Available personal-loan product");
    return {
      version: session?.version ?? 0,
      status: session?.status ?? "DRAFT",
      messages: c.messages,
      draft: c.draft,
      provenance: c.provenance,
      nextAction: c.nextAction,
      informationMessage: c.informationMessage,
      draftDigest: hash({
        draft: c.draft,
        nextAction: c.nextAction,
        informationMessage: c.informationMessage,
      }),
      missing: [...new Set(missing)],
      ready:
        (c.nextAction === "REVIEW" ||
          (["REQUEST_INFORMATION", "RESOLVE_HUMAN_REVIEW"].includes(
            c.nextAction,
          ) &&
            c.informationMessage.trim().length >= 3) ||
          (!!parsed.success && missing.length === 0)) &&
        session?.status !== "EXECUTED",
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        termMonths: p.termMonths,
      })),
      quote: null,
    };
  }
  async state(a: AuthUser, id: string) {
    const app = await this.application(a, id);
    const [session] = await this.db
      .select()
      .from(decisionSessions)
      .where(eq(decisionSessions.applicationId, id));
    const c = session
      ? (JSON.parse(decryptIdentity(session.encrypted)) as DecisionConversation)
      : await this.seed(app);
    const products = await this.products(a, app);
    const [v] = await this.db
      .select()
      .from(personalVerifications)
      .where(eq(personalVerifications.userId, app.userId));
    const view = this.view(session, c, products, v?.status === "VERIFIED");
    if (!app.lenderId || !app.offerId) {
      view.missing.push("Applicant must select one matched lender");
      view.ready = false;
    }
    const p = products.find((x) => x.id === c.draft.offerId);
    return {
      ...view,
      quote: p ? quoteLoan(app.amountCents, p) : null,
      applicationStatus: app.status,
    };
  }
  async chat(
    a: AuthUser,
    id: string,
    input: z.infer<typeof decisionChatInput>,
  ) {
    const app = await this.application(a, id);
    if (!reviewable.includes(app.status)) {
      const [human] = await this.db
        .select()
        .from(lenderAgentRuns)
        .where(
          and(
            eq(lenderAgentRuns.applicationId, id),
            eq(lenderAgentRuns.step, "HUMAN_REVIEW"),
            eq(lenderAgentRuns.result, "OPEN"),
          ),
        );
      if (app.status !== "OFFERED" || !human)
        throw new ConflictException(
          "This application already has a lending decision.",
        );
    }
    if (
      /\b(?:\d[ -]?){13}\b|(?:\+27|0)[6-8](?:[ -]?\d){8}\b|(?:password|pin|otp)\s*[:=]\s*\S+/i.test(
        input.message,
      )
    )
      throw new BadRequestException(
        "Keep identity numbers, phone numbers, account credentials and banking details out of this preparation chat.",
      );
    const [session] = await this.db
      .select()
      .from(decisionSessions)
      .where(eq(decisionSessions.applicationId, id));
    if (
      session &&
      JSON.parse(decryptIdentity(session.encrypted)).requestKeys.includes(
        input.clientKey,
      )
    )
      return this.state(a, id);
    if ((session?.version ?? 0) !== input.version)
      throw new ConflictException(
        "The workspace changed. Reload the latest conversation.",
      );
    const c = await this.seed(
      app,
      session ? JSON.parse(decryptIdentity(session.encrypted)) : undefined,
    );
    if (c.messages.length >= 40)
      throw new BadRequestException(
        "This preparation conversation has reached its limit. Contact operations to review the saved draft.",
      );
    const products = await this.products(a, app);
    const response = await this.model.prepare({
      messages: [
        ...c.messages.slice(-12),
        { role: "user", content: input.message },
      ],
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        termMonths: p.termMonths,
      })),
      missing: required.filter((k) => !c.draft[k]),
    });
    const grounded = applyGroundedUpdates(
      c.draft,
      response.updates,
      [
        ...c.messages.filter((x) => x.role === "user").map((x) => x.content),
        input.message,
      ],
      products,
    );
    c.draft = grounded.draft;
    c.provenance = { ...c.provenance, ...grounded.provenance };
    const seeded = await this.seed(app, c);
    seeded.nextAction = response.nextAction;
    seeded.informationMessage = response.informationMessage ?? "";
    seeded.messages.push(
      { role: "user", content: input.message },
      { role: "assistant", content: response.message },
    );
    seeded.requestKeys.push(input.clientKey);
    await this.db.transaction(async (tx) => {
      if (session) {
        const [updated] = await tx
          .update(decisionSessions)
          .set({
            encrypted: encryptIdentity(JSON.stringify(seeded)),
            version: session.version + 1,
            updatedBy: a.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(decisionSessions.applicationId, id),
              eq(decisionSessions.version, session.version),
              eq(decisionSessions.status, "DRAFT"),
            ),
          )
          .returning();
        if (!updated)
          throw new ConflictException(
            "Workspace changed. Reload before continuing.",
          );
      } else {
        const [created] = await tx
          .insert(decisionSessions)
          .values({
            applicationId: id,
            encrypted: encryptIdentity(JSON.stringify(seeded)),
            updatedBy: a.id,
          })
          .onConflictDoNothing()
          .returning();
        if (!created)
          throw new ConflictException(
            "Workspace was opened elsewhere. Reload.",
          );
      }
      await this.audit.log(
        a,
        "lender_ai.draft_prepared",
        "personal_loan_application",
        id,
        { fields: Object.keys(grounded.provenance) },
        tx,
      );
    });
    return this.state(a, id);
  }
  async advance(
    a: AuthUser,
    id: string,
    input: z.infer<typeof decisionAdvanceInput>,
  ) {
    await this.application(a, id);
    return this.db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .for("update");
      await this.application(a, id, tx);
      const [s] = await tx
        .select()
        .from(decisionSessions)
        .where(eq(decisionSessions.applicationId, id))
        .for("update");
      if (!s) throw new NotFoundException();
      const c = JSON.parse(
        decryptIdentity(s.encrypted),
      ) as DecisionConversation;
      if (c.lastAppliedDigest === input.draftDigest) return { ok: true };
      if (
        hash({
          draft: c.draft,
          nextAction: c.nextAction,
          informationMessage: c.informationMessage,
        }) !== input.draftDigest
      )
        throw new ConflictException(
          "The prepared decision changed. Review the current summary.",
        );
      if (s.status === "EXECUTED") return { ok: true };
      if (s.version !== input.version)
        throw new ConflictException("Reload the latest decision summary.");
      if (
        !reviewable.includes(application.status) &&
        !(
          application.status === "OFFERED" &&
          c.nextAction === "RESOLVE_HUMAN_REVIEW"
        )
      )
        throw new ConflictException("Application already has a decision.");
      if (c.nextAction !== "PREPARE_OFFER") {
        const message =
          c.nextAction === "REVIEW"
            ? "Your lender has started the application review."
            : c.informationMessage;
        if (message.trim().length < 3 || message.length > 500)
          throw new BadRequestException("Review the applicant-facing update.");
        if (c.nextAction === "RESOLVE_HUMAN_REVIEW") {
          const [request] = await tx
            .update(lenderAgentRuns)
            .set({ result: "RESOLVED" })
            .where(
              and(
                eq(lenderAgentRuns.applicationId, id),
                eq(lenderAgentRuns.step, "HUMAN_REVIEW"),
                eq(lenderAgentRuns.result, "OPEN"),
              ),
            )
            .returning();
          if (!request)
            throw new BadRequestException("No open human-review request.");
        }
        const status =
          c.nextAction === "REQUEST_INFORMATION"
            ? "ACTION_REQUIRED"
            : application.status === "OFFERED"
              ? "OFFERED"
              : "UNDER_REVIEW";
        await tx
          .update(applications)
          .set({ status, reviewNotes: message, reviewedAt: new Date() })
          .where(eq(applications.id, id));
        await tx
          .insert(applicationEvents)
          .values({ applicationId: id, actorId: a.id, status, message });
        c.lastAppliedDigest = input.draftDigest;
        c.nextAction = "PREPARE_OFFER";
        c.informationMessage = "";
        c.messages.push({
          role: "assistant",
          content:
            "Your authorised update was recorded. Continue preparing the offer when the required evidence is available.",
        });
        await tx
          .update(decisionSessions)
          .set({
            encrypted: encryptIdentity(JSON.stringify(c)),
            version: s.version + 1,
            updatedAt: new Date(),
            updatedBy: a.id,
          })
          .where(eq(decisionSessions.applicationId, id));
        await this.audit.log(
          a,
          "lender_ai.review_step_authorised",
          "personal_loan_application",
          id,
          { status, draftDigest: input.draftDigest },
          tx,
        );
        return { ok: true };
      }
      const result = approveInput.safeParse({
        ...c.draft,
        responsibleLendingConfirmed: true,
      });
      if (!result.success)
        throw new BadRequestException(
          "The required evidence and terms are not complete. Continue the chat.",
        );
      const [human] = await tx
        .select()
        .from(lenderAgentRuns)
        .where(
          and(
            eq(lenderAgentRuns.applicationId, id),
            eq(lenderAgentRuns.step, "HUMAN_REVIEW"),
            eq(lenderAgentRuns.result, "OPEN"),
          ),
        );
      if (human)
        throw new BadRequestException(
          "Complete and record the requested human review first.",
        );
      await this.settlement.approve(a, id, result.data, tx);
      await tx
        .update(decisionSessions)
        .set({
          status: "EXECUTED",
          version: s.version + 1,
          updatedAt: new Date(),
          updatedBy: a.id,
        })
        .where(eq(decisionSessions.applicationId, id));
      await this.audit.log(
        a,
        "lender_ai.prepared_decision_authorised",
        "personal_loan_application",
        id,
        { draftDigest: input.draftDigest, version: s.version },
        tx,
      );
      return { ok: true };
    });
  }
  async settings(a: AuthUser) {
    const l = await this.org(a);
    const [setting] = await this.db
      .select()
      .from(lenderAgentPolicies)
      .where(eq(lenderAgentPolicies.lenderId, l.id));
    const offers = await this.db
      .select({ id: loanOffers.id, name: loanOffers.name })
      .from(loanOffers)
      .where(
        and(
          eq(loanOffers.lenderId, l.id),
          eq(loanOffers.productType, "PERSONAL"),
          eq(loanOffers.active, true),
        ),
      );
    const runs = await this.db
      .select()
      .from(lenderAgentRuns)
      .where(eq(lenderAgentRuns.lenderId, l.id))
      .orderBy(desc(lenderAgentRuns.createdAt))
      .limit(30);
    return {
      mode: setting?.mode ?? "MANUAL",
      version: setting?.version ?? 0,
      policy: setting?.policy ?? blankPolicy,
      offers,
      runs,
      automaticOffersEnabled: process.env.LENDER_AUTO_OFFERS_ENABLED === "true",
      assessmentConnectionConfigured:
        (process.env.LENDER_ASSESSMENT_WEBHOOK_SECRET?.length ?? 0) >= 32,
    };
  }
  async requestHumanReview(a: AuthUser, id: string, message: string) {
    return this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .for("update");
      if (!app || app.userId !== a.id || !app.lenderId)
        throw new NotFoundException();
      if (![...reviewable, "OFFERED"].includes(app.status))
        throw new ConflictException(
          "This application is no longer awaiting a decision.",
        );
      const [created] = await tx
        .insert(lenderAgentRuns)
        .values({
          applicationId: id,
          lenderId: app.lenderId,
          policyVersion: 0,
          step: "HUMAN_REVIEW",
          result: "OPEN",
        })
        .onConflictDoNothing()
        .returning();
      if (!created) {
        await tx
          .update(lenderAgentRuns)
          .set({ result: "OPEN" })
          .where(
            and(
              eq(lenderAgentRuns.applicationId, id),
              eq(lenderAgentRuns.step, "HUMAN_REVIEW"),
            ),
          );
      }
      await tx
        .update(decisionSessions)
        .set({
          status: "DRAFT",
          version: sql`${decisionSessions.version}+1`,
          updatedAt: new Date(),
        })
        .where(eq(decisionSessions.applicationId, id));
      await tx.insert(applicationEvents).values({
        applicationId: id,
        actorId: a.id,
        status: app.status,
        message: "Applicant requested human review: " + message,
      });
      await this.audit.log(
        a,
        "lender_ai.human_review_requested",
        "personal_loan_application",
        id,
        {},
        tx,
      );
      return { ok: true };
    });
  }
  async saveSettings(a: AuthUser, input: z.infer<typeof lenderPolicyInput>) {
    const l = await this.org(a);
    const { version, mode, confirmed, ...policy } = input;
    if (mode !== "MANUAL") {
      const [p] = await this.db
        .select()
        .from(loanOffers)
        .where(
          and(
            eq(loanOffers.id, policy.offerId),
            eq(loanOffers.lenderId, l.id),
            eq(loanOffers.active, true),
            eq(loanOffers.productType, "PERSONAL"),
          ),
        );
      if (!p || policy.amountLimitCents > p.maxAmountPerUserCents)
        throw new BadRequestException(
          "Choose your own active product and a limit within its terms.",
        );
    }
    if (
      mode === "AUTO_OFFER" &&
      (policy.agreementTerms.trim().length < 100 ||
        policy.legalReference.trim().length < 5 ||
        policy.automationReviewReference.trim().length < 5)
    )
      throw new BadRequestException(
        "Approved agreement terms and automation/legal review references are required.",
      );
    await this.db.transaction(async (tx) => {
      if (version === 0) {
        const [row] = await tx
          .insert(lenderAgentPolicies)
          .values({ lenderId: l.id, mode, policy, authorisedBy: a.id })
          .onConflictDoNothing()
          .returning();
        if (!row) throw new ConflictException("Policy changed; reload.");
      } else {
        const [row] = await tx
          .update(lenderAgentPolicies)
          .set({
            mode,
            policy,
            version: version + 1,
            authorisedBy: a.id,
            authorisedAt: new Date(),
          })
          .where(
            and(
              eq(lenderAgentPolicies.lenderId, l.id),
              eq(lenderAgentPolicies.version, version),
            ),
          )
          .returning();
        if (!row) throw new ConflictException("Policy changed; reload.");
      }
      await this.audit.log(
        a,
        "lender_ai.policy_authorised",
        "lender",
        l.id,
        { mode, version: version + 1, policyDigest: hash(policy) },
        tx,
      );
    });
    return this.settings(a);
  }
  async receiveAssessment(
    raw: Buffer,
    timestamp: string,
    signature: string,
    input: z.infer<typeof assessmentEventInput>,
  ) {
    const secret = process.env.LENDER_ASSESSMENT_WEBHOOK_SECRET;
    const expected = secret
        ? Buffer.from(
            createHmac("sha256", secret)
              .update(timestamp + ".")
              .update(raw)
              .digest("hex"),
          )
        : Buffer.alloc(0),
      given = Buffer.from(signature ?? "");
    if (
      !secret ||
      secret.length < 32 ||
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() - Number(timestamp) * 1000) > 300000 ||
      expected.length !== given.length ||
      !timingSafeEqual(expected, given)
    )
      throw new ForbiddenException("Invalid underwriting provider signature.");
    const [app] = await this.db
      .select()
      .from(applications)
      .where(eq(applications.id, input.applicationId));
    if (!app || app.lenderId !== input.lenderId) throw new NotFoundException();
    if(app.offerId!==input.offerId)throw new BadRequestException('Assessment must refer to the applicant-selected product.');
    const [existing] = await this.db
      .select()
      .from(lenderAssessments)
      .where(eq(lenderAssessments.applicationId, app.id));
    if (existing) {
      if (existing.payloadHash !== hash(input))
        throw new ConflictException(
          "Assessment is immutable; request a new application for a changed assessment.",
        );
      return { ok: true };
    }
    if (!reviewable.includes(app.status))
      throw new ConflictException(
        "Application is no longer awaiting assessment.",
      );
    const at = new Date(input.assessedAt),
      expiry = new Date(input.expiresAt);
    if (
      at.getTime() > Date.now() ||
      Date.now() - at.getTime() > 7 * 86400000 ||
      expiry.getTime() <= Date.now() ||
      expiry.getTime() > at.getTime() + 7 * 86400000
    )
      throw new BadRequestException(
        "Assessment dates are outside the supported validity window.",
      );
    await this.db.transaction(async (tx) => {
      await tx.insert(lenderAssessments).values({
        applicationId: app.id,
        lenderId: input.lenderId,
        eventId: input.eventId,
        payloadHash: hash(input),
        offerId: input.offerId,
        assessmentReference: input.assessmentReference,
        mandateReference: input.mandateReference,
        assessedAt: at,
        expiresAt: expiry,
        decision: input.decision,
        checks: input.checks,
      });
      await this.audit.log(
        null,
        "lender_ai.verified_assessment_received",
        "personal_loan_application",
        app.id,
        { eventId: input.eventId, decision: input.decision },
        tx,
      );
    });
    return { ok: true };
  }
  /** Automated engagement is a recorded in-app acknowledgement; never an unsolicited SMS.
   * Automatic offer creation executes a verified lender decision under a delegated policy.
   * No LLM evaluates a person's eligibility, signs their agreement or releases funding. */
  async process(a?: AuthUser) {
    const policies = await this.db
      .select()
      .from(lenderAgentPolicies)
      .where(inArray(lenderAgentPolicies.mode, ["AUTO_ENGAGE", "AUTO_OFFER"]));
    const owned = a ? await this.org(a) : null;
    const outcomes = [];
    for (const policy of policies
      .filter((p) => !owned || p.lenderId === owned.id)
      .slice(0, 20)) {
      const apps = await this.db
        .select()
        .from(applications)
        .where(
          and(
            eq(applications.lenderId, policy.lenderId),
            inArray(applications.status, ["REFERRED", "UNDER_REVIEW"]),
          ),
        )
        .orderBy(sql`coalesce((select max(r.created_at) from lender_agent_runs r where r.application_id=${applications.id} and r.step='CHECK'),timestamptz '1970-01-01') asc`,applications.createdAt)
        .limit(20);
      for (const candidate of apps) {
        try {
          const result = await this.db.transaction(async (tx) => {
            const [p] = await tx
              .select()
              .from(lenderAgentPolicies)
              .where(eq(lenderAgentPolicies.lenderId, policy.lenderId))
              .for("update");
            if (!p || p.mode === "MANUAL") return "MANUAL";
            const [l] = await tx
              .select()
              .from(lenderOrgs)
              .where(eq(lenderOrgs.id, p.lenderId));
            const [owner] = l
              ? await tx.select().from(users).where(eq(users.id, l.ownerUserId))
              : [];
            if (
              !l ||
              l.accreditationStatus !== "ACCREDITED" ||
              owner?.status !== "ACTIVE" ||
              !owner.roles.includes("LENDER")
            )
              return "LENDER_UNAVAILABLE";
            const [app] = await tx
              .select()
              .from(applications)
              .where(eq(applications.id, candidate.id))
              .for("update");
            if (!app || !["REFERRED", "UNDER_REVIEW"].includes(app.status))
              return "ALREADY_REVIEWED";
            const [engaged] = await tx
              .select()
              .from(lenderAgentRuns)
              .where(
                and(
                  eq(lenderAgentRuns.applicationId, app.id),
                  eq(lenderAgentRuns.step, "ENGAGE"),
                ),
              );
            const [humanReview] = await tx
              .select()
              .from(lenderAgentRuns)
              .where(
                and(
                  eq(lenderAgentRuns.applicationId, app.id),
                  eq(lenderAgentRuns.step, "HUMAN_REVIEW"),
                  eq(lenderAgentRuns.result, "OPEN"),
                ),
              );
            if (humanReview) return "HUMAN_REVIEW_REQUESTED";
            if (!engaged) {
              await tx
                .update(applications)
                .set({
                  status: "UNDER_REVIEW",
                  reviewNotes:
                    "Your selected lender has acknowledged your application. You can request a human review at any time.",
                })
                .where(eq(applications.id, app.id));
              await tx.insert(applicationEvents).values({
                applicationId: app.id,
                status: "UNDER_REVIEW",
                message:
                  "Your lender’s XTRA-Lender-AI workflow has started the review. No lending offer or payment has been authorised yet.",
              });
              await tx.insert(lenderAgentRuns).values({
                applicationId: app.id,
                lenderId: l.id,
                policyVersion: p.version,
                step: "ENGAGE",
                result: "ACKNOWLEDGED",
              });
            }
            if (p.mode !== "AUTO_OFFER") return "ENGAGED";
            if (process.env.LENDER_AUTO_OFFERS_ENABLED !== "true")
              return "AWAITING_AUTOMATION_ACTIVATION";
            const [assessment] = await tx
              .select()
              .from(lenderAssessments)
              .where(eq(lenderAssessments.applicationId, app.id));
            if (
              !assessment ||
              assessment.decision !== "APPROVED" ||
              assessment.expiresAt.getTime() <= Date.now() ||
              !Object.values(assessment.checks).every(Boolean)
            )
              return "AWAITING_VERIFIED_LENDER_DECISION";
            if (
              assessment.lenderId !== l.id ||
              assessment.offerId !== p.policy.offerId ||
              app.amountCents > p.policy.amountLimitCents
            )
              return "OUTSIDE_POLICY";
            const [today] = await tx
              .select({ n: count() })
              .from(lenderAgentRuns)
              .where(
                and(
                  eq(lenderAgentRuns.lenderId, l.id),
                  eq(lenderAgentRuns.step, "OFFER"),
                  gte(
                    lenderAgentRuns.createdAt,
                    new Date(Date.now() - 86400000),
                  ),
                ),
              );
            if (today.n >= p.policy.dailyOfferLimit) return "DAILY_LIMIT";
            const outstanding = await tx
              .select({ principal: agreements.terms })
              .from(agreements)
              .where(
                and(
                  eq(agreements.lenderId, l.id),
                  inArray(agreements.status, ["OFFERED", "ACCEPTED"]),
                  gte(agreements.expiresAt, new Date()),
                ),
              );
            if (
              l.availableCents <
              app.amountCents +
                outstanding.reduce((n, x) => n + x.principal.principalCents, 0)
            )
              return "LENDER_CAPACITY";
            const actor: AuthUser = {
              id: owner.id,
              email: owner.email,
              roles: owner.roles,
            };
            const expiresAt = new Date(
              Math.min(
                Date.now() + p.policy.expiryHours * 3600000,
                assessment.expiresAt.getTime(),
              ),
            ).toISOString();
            await this.settlement.approve(
              actor,
              app.id,
              {
                offerId: assessment.offerId,
                assessmentReference: assessment.assessmentReference,
                mandateReference: assessment.mandateReference,
                assessedAt: assessment.assessedAt.toISOString(),
                expiresAt,
                legalReference: p.policy.legalReference,
                agreementTerms: p.policy.agreementTerms,
                responsibleLendingConfirmed: true,
              },
              tx,
            );
            await tx.insert(lenderAgentRuns).values({
              applicationId: app.id,
              lenderId: l.id,
              policyVersion: p.version,
              step: "OFFER",
              result: "VERIFIED_LENDER_DECISION_EXECUTED",
            });
            await this.audit.log(
              null,
              "lender_ai.delegated_offer_created",
              "personal_loan_application",
              app.id,
              {
                lenderId: l.id,
                policyVersion: p.version,
                authorisedBy: p.authorisedBy,
                assessmentEventId: assessment.eventId,
              },
              tx,
            );
            return "OFFERED";
          });
          await this.db.insert(lenderAgentRuns).values({applicationId:candidate.id,lenderId:policy.lenderId,policyVersion:policy.version,step:'CHECK',result}).onConflictDoUpdate({target:[lenderAgentRuns.applicationId,lenderAgentRuns.step],set:{result,policyVersion:policy.version,createdAt:new Date()}});
          outcomes.push({ applicationId: candidate.id, result });
        } catch {
          outcomes.push({
            applicationId: candidate.id,
            result: "HUMAN_REVIEW_REQUIRED",
          });
        }
      }
    }
    return { processed: outcomes.length, outcomes };
  }
}
