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
  Put,
} from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { quoteLoan } from "@xtra/shared";
import { InjectDb } from "../common/db.module";
import { Db, DbOrTx } from "../db/client";
import { CurrentUser, Roles, type AuthUser } from "../common/auth";
import { AuditService } from "../common/audit.service";
import {
  platformSettings,
  personalLoanApplications as applications,
  personalVerifications,
  lenderOrgs,
  loanOffers,
  users,
} from "../db/schema";
import { CreditService } from "../consumer/credit.service";
import { offerCapacity } from "../consumer/credit-engine";
import {
  routingRequests,
  routingInvitations,
  decisionSessions as lenderDecisionSessions,
  lenderAssessments,
  loanCompetitions,
} from "./lender-ai.schema";
import { applicationEvents, agreements } from "./settlement.schema";
import { parse } from "../payday/payday.dto";
import { decryptIdentity, encryptIdentity } from "../auth/identity-crypto";
const key = "personalLoanRouting";
export const routingPolicySchema = z
  .object({
    mode: z.enum(["ADMIN", "APPLICANT", "OPEN_POOL"]),
    automation: z.enum(["OFF", "PREPARE", "ASSIGN"]),
    maxLenders: z.number().int().min(1).max(10),
    geography: z.enum(["PRODUCT_AREA", "VICINITY"]),
    radiusKm: z.number().int().min(1).max(200),
    version: z.number().int().min(0),
    confirmed: z.literal(true),
  })
  .strict();
export const defaultRoutingPolicy = {
  mode: "ADMIN" as const,
  automation: "OFF" as const,
  maxLenders: 1,
  geography: "PRODUCT_AREA" as const,
  radiusKm: 25,
  version: 0,
};
const changeSchema = z
  .object({
    action: z.enum(["ASSIGN", "CLEAR", "DECLINE"]),
    offerIds: z.array(z.string().min(1).max(100)).max(10),
    reason: z.string().trim().min(5).max(500),
    confirmed: z.literal(true),
  })
  .strict();
const consentSchema = z
  .object({
    confirmed: z.literal(true),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict()
  .refine(
    (x) => (x.latitude === undefined) === (x.longitude === undefined),
    "Provide both location coordinates",
  );
const openStates = ["SUBMITTED", "REFERRED", "UNDER_REVIEW", "ACTION_REQUIRED"];
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180,
    dl = (b.latitude - a.latitude) * rad,
    dn = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dl / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dn / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
@Injectable()
export class RoutingService {
  constructor(
    @InjectDb() private db: Db,
    private credit: CreditService,
    private audit: AuditService,
  ) {}
  async policy(conn: DbOrTx = this.db) {
    const [row] = await conn
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, key));
    if (!row) return defaultRoutingPolicy;
    const parsed = routingPolicySchema.safeParse({
      ...(row.value as object),
      confirmed: true,
    });
    if (!parsed.success)
      throw new BadRequestException(
        "Routing policy needs administrator correction",
      );
    const { confirmed, ...policy } = parsed.data;
    return policy;
  }
  async save(actor: AuthUser, input: z.infer<typeof routingPolicySchema>) {
    return this.db.transaction(async (tx) => {
      await tx
        .insert(platformSettings)
        .values({ key, value: defaultRoutingPolicy })
        .onConflictDoNothing();
      await tx
        .select()
        .from(platformSettings)
        .where(eq(platformSettings.key, key))
        .for("update");
      const current = await this.policy(tx);
      if (input.version !== current.version)
        throw new ConflictException(
          "Routing policy changed. Refresh before saving.",
        );
      if (input.mode !== "ADMIN" && input.automation !== "OFF")
        throw new BadRequestException(
          "Automatic administration applies only in admin matching mode.",
        );
      const { confirmed, ...next } = input;
      next.version = current.version + 1;
      await tx
        .update(platformSettings)
        .set({ value: next, updatedAt: new Date() })
        .where(eq(platformSettings.key, key));
      await this.audit.log(
        actor,
        "personal_loan.routing_policy_updated",
        "settings",
        null,
        next,
        tx,
      );
      return next;
    });
  }
  async candidates(id: string, conn: DbOrTx = this.db) {
    const app = await conn.query.personalLoanApplications.findFirst({
      where: eq(applications.id, id),
    });
    if (!app) throw new NotFoundException();
    const [verification] = await conn
      .select()
      .from(personalVerifications)
      .where(eq(personalVerifications.userId, app.userId));
    if (verification?.status !== "VERIFIED") return [];
    const ctx = await this.credit.context(app.userId, conn, "PERSONAL", app),
      policy = await this.policy(conn);
    const [routing] = await conn
      .select()
      .from(routingRequests)
      .where(eq(routingRequests.applicationId, id));
    const location = routing?.encryptedLocation
      ? (JSON.parse(decryptIdentity(routing.encryptedLocation)) as {
          latitude: number;
          longitude: number;
        })
      : null;
    const result = [];
    for (const o of ctx.eligible) {
      if (
        o.termMonths !== app.termMonths ||
        app.amountCents < o.minAmountCents ||
        app.amountCents > offerCapacity(o, ctx.affordableCents)
      )
        continue;
      const [owner] = await conn
        .select({ id: lenderOrgs.id })
        .from(lenderOrgs)
        .innerJoin(users, eq(users.id, lenderOrgs.ownerUserId))
        .where(and(eq(lenderOrgs.id, o.lenderId), eq(users.status, "ACTIVE")));
      if (!owner) continue;
      const [product] = await conn
        .select()
        .from(loanOffers)
        .where(eq(loanOffers.id, o.offerId));
      let distance: number | null = null;
      if (policy.geography === "VICINITY") {
        if (!location || !product.locationTarget) continue;
        distance = distanceKm(location, product.locationTarget);
        if (
          distance > policy.radiusKm ||
          distance * 1000 > product.locationTarget.radiusMeters
        )
          continue;
      }
      const q = quoteLoan(app.amountCents, o);
      result.push({
        offerId: o.offerId,
        lenderId: o.lenderId,
        lenderName: o.lenderName,
        offerName: o.offerName,
        totalRepayableCents: q.totalRepayableCents,
        distanceKm: distance,
        province: ctx.profile?.province,
      });
    }
    return result.sort(
      (a, b) =>
        (a.distanceKm ?? 0) - (b.distanceKm ?? 0) ||
        a.totalRepayableCents - b.totalRepayableCents ||
        a.offerId.localeCompare(b.offerId),
    );
  }
  async record(
    id: string,
    mode: string,
    consent: boolean,
    location?: { latitude: number; longitude: number },
    conn: DbOrTx = this.db,
  ) {
    const values = {
      applicationId: id,
      mode,
      consentMode:mode,
      consentAt: consent ? new Date() : null,
      encryptedLocation: location
        ? encryptIdentity(JSON.stringify(location))
        : null,
      updatedAt: new Date(),
    };
    await conn
      .insert(routingRequests)
      .values(values)
      .onConflictDoUpdate({
        target: routingRequests.applicationId,
        set: values,
      });
  }
  async consent(
    actor: AuthUser,
    id: string,
    input: z.infer<typeof consentSchema>,
  ) {
    return this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(applications)
        .where(and(eq(applications.id, id), eq(applications.userId, actor.id)))
        .for("update");
      if (!app) throw new NotFoundException();
      if (!openStates.includes(app.status))
        throw new ConflictException("This application already has a decision.");
      const policy = await this.policy(tx),
        [prior] = await tx
          .select()
          .from(routingRequests)
          .where(eq(routingRequests.applicationId, id));
      await this.record(
        id,
        policy.mode,
        true,
        input.latitude !== undefined
          ? { latitude: input.latitude, longitude: input.longitude! }
          : undefined,
        tx,
      );
      if(prior?.mode==='PRIVATE')await tx.update(routingRequests).set({mode:'PRIVATE'}).where(eq(routingRequests.applicationId,id));
      await this.audit.log(
        actor,
        "personal_loan.routing_consent",
        "personal_loan_application",
        id,
        { mode: policy.mode, locationSupplied: input.latitude !== undefined },
        tx,
      );
      return { ok: true };
    });
  }
  async state(id: string) {
    const app = await this.db.query.personalLoanApplications.findFirst({
      where: eq(applications.id, id),
    });
    if (!app) throw new NotFoundException();
    const [request] = await this.db
      .select()
      .from(routingRequests)
      .where(eq(routingRequests.applicationId, id));
    return {
      policy: await this.policy(),
      consentRecorded: !!request?.consentAt&&request.consentMode===(await this.policy()).mode,
      candidates: await this.candidates(id),
      invitations: await this.db
        .select()
        .from(routingInvitations)
        .where(
          and(
            eq(routingInvitations.applicationId, id),
            eq(routingInvitations.active, 1),
          ),
        ),
      selectedOfferId: app.offerId,
    };
  }
  private async change(
    actor: AuthUser,
    id: string,
    input: z.infer<typeof changeSchema>,
    conn: DbOrTx,
  ) {
    const [app] = await conn
      .select()
      .from(applications)
      .where(eq(applications.id, id))
      .for("update");
    if (!app) throw new NotFoundException();
    if (!openStates.includes(app.status))
      throw new ConflictException("Cannot reroute a decided application.");
    const [agreement] = await conn
      .select()
      .from(agreements)
      .where(eq(agreements.applicationId, id));
    if (agreement) throw new ConflictException("An agreement already exists.");
    const [competition]=await conn.select().from(loanCompetitions).where(and(eq(loanCompetitions.applicationId,id),eq(loanCompetitions.status,'OPEN')));if(competition)throw new ConflictException('This request is in a first-offer competition. Close the competition before changing matching.');
    const [assessment]=await conn.select().from(lenderAssessments).where(eq(lenderAssessments.applicationId,id));
    if(assessment&&input.action!=='DECLINE')throw new ConflictException('A lender assessment is recorded. Start a fresh application to change the assigned lender or product.');
    const policy = await this.policy(conn),
      [request] = await conn
        .select()
        .from(routingRequests)
        .where(eq(routingRequests.applicationId, id));
    let lenderId: string | null = null,
      offerId: string | null = null;
    const chosen: Awaited<ReturnType<RoutingService["candidates"]>> = [];
    if (input.action === "ASSIGN") {
      if (
        !request?.consentAt ||
        request.consentMode !== policy.mode
      )
        throw new BadRequestException(
          "Applicant routing consent for the current policy is required before administrative referral.",
        );
      if (!input.offerIds.length || input.offerIds.length > policy.maxLenders)
        throw new BadRequestException(
          "Choose products within the routing policy lender limit.",
        );
      const candidates = await this.candidates(id, conn);
      for (const product of input.offerIds) {
        const c = candidates.find((x) => x.offerId === product);
        if (!c)
          throw new BadRequestException(
            "A selected product is no longer eligible. Refresh candidates.",
          );
        if (chosen.some((x) => x.lenderId === c.lenderId))
          throw new BadRequestException("Choose one product per lender.");
        chosen.push(c);
      }
      if (chosen.length === 1) {
        lenderId = chosen[0].lenderId;
        offerId = chosen[0].offerId;
      }
    }
    await conn
      .update(routingInvitations)
      .set({ active: 0 })
      .where(eq(routingInvitations.applicationId, id));
    await conn
      .update(routingRequests)
      .set({
        mode: input.action === "ASSIGN" ? policy.mode : "PRIVATE",
        updatedAt: new Date(),
      })
      .where(eq(routingRequests.applicationId, id));
    for (const c of chosen)
      await conn
        .insert(routingInvitations)
        .values({
          applicationId: id,
          lenderId: c.lenderId,
          offerId: c.offerId,
          active: 1,
        })
        .onConflictDoUpdate({
          target: [
            routingInvitations.applicationId,
            routingInvitations.lenderId,
          ],
          set: { offerId: c.offerId, active: 1 },
        });
    const status =
      input.action === "DECLINE"
        ? "DECLINED"
        : lenderId
          ? "REFERRED"
          : "SUBMITTED";
    await conn
      .update(applications)
      .set({
        lenderId,
        offerId,
        status,
        reviewNotes: input.action === "DECLINE" ? input.reason : null,
      })
      .where(eq(applications.id, id));
    // Do not expose the prior lender's chat or reuse its evidence after rerouting.
    await conn
      .update(lenderDecisionSessions)
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
        version: sql`${lenderDecisionSessions.version}+1`,
        status: "DRAFT",
        updatedBy: actor.id,
        updatedAt: new Date(),
      })
      .where(eq(lenderDecisionSessions.applicationId, id));
    await this.audit.log(
      actor,
      "personal_loan.routing_" + input.action.toLowerCase(),
      "personal_loan_application",
      id,
      { offerIds: input.offerIds, reason: input.reason },
      conn,
    );
    await conn
      .insert(applicationEvents)
      .values({
        applicationId: id,
        actorId: actor.id,
        status,
        message:
          input.action === "DECLINE"
            ? input.reason
            : input.action === "CLEAR"
              ? "Administration returned your request to the private matching queue."
              : chosen.length === 1
                ? "Administration matched your request to an eligible lender."
                : "Administration shortlisted eligible lenders. Your request is awaiting one lender to take responsibility.",
      });
    return { ok: true, status };
  }
  async assign(
    actor: AuthUser,
    id: string,
    input: z.infer<typeof changeSchema>,
  ) {
    return this.db.transaction((tx) => this.change(actor, id, input, tx));
  }
  async automate(actor: AuthUser, id: string) {
    return this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .for("update");
      if (!app) throw new NotFoundException();
      const policy = await this.policy(tx);
      if (policy.mode !== "ADMIN" || policy.automation === "OFF")
        return { applied: false, reason: "Automatic matching is off." };
      if (
        app.lenderId ||
        !["SUBMITTED", "ACTION_REQUIRED"].includes(app.status)
      )
        return {
          applied: false,
          reason: "An administrator or lender already owns this request.",
        };
      const [routing] = await tx
        .select()
        .from(routingRequests)
        .where(eq(routingRequests.applicationId, id));
      if (!routing?.consentAt || routing.mode === "PRIVATE")
        return {
          applied: false,
          reason: "Awaiting consent or administrator intervention.",
        };
      const [existing] = await tx
        .select()
        .from(routingInvitations)
        .where(
          and(
            eq(routingInvitations.applicationId, id),
            eq(routingInvitations.active, 1),
          ),
        );
      if (existing)
        return { applied: false, reason: "Existing shortlist retained." };
      const unique = new Map<
        string,
        Awaited<ReturnType<RoutingService["candidates"]>>[number]
      >();
      for (const c of await this.candidates(id, tx))
        if (!unique.has(c.lenderId)) unique.set(c.lenderId, c);
      const candidates = [...unique.values()].slice(0, policy.maxLenders);
      if (policy.automation === "PREPARE" || !candidates.length)
        return {
          applied: false,
          candidates,
          reason: "Prepared for human review; no decision made.",
        };
      await this.change(
        actor,
        id,
        {
          action: "ASSIGN",
          offerIds: candidates.map((c) => c.offerId),
          reason:
            "Automatic matching under authorised policy version " +
            policy.version,
          confirmed: true,
        },
        tx,
      );
      return { applied: true, candidates };
    });
  }
  async queue(actor: AuthUser) {
    const org = await this.db.query.lenderOrgs.findFirst({
      where: eq(lenderOrgs.ownerUserId, actor.id),
    });
    if (!org || org.accreditationStatus !== "ACCREDITED") return [];
    const policy = await this.policy(),
      out = [];
    const requests = await this.db
      .select({ app: applications, routing: routingRequests })
      .from(routingRequests)
      .innerJoin(
        applications,
        eq(applications.id, routingRequests.applicationId),
      )
      .where(
        and(
          inArray(applications.status, ["SUBMITTED", "ACTION_REQUIRED"]),
          eq(routingRequests.mode, policy.mode),
        ),
      )
      .limit(100);
    for (const { app, routing } of requests) {
      if (app.lenderId || !routing.consentAt) continue;
      const [competition]=await this.db.select().from(loanCompetitions).where(and(eq(loanCompetitions.applicationId,app.id),eq(loanCompetitions.status,'OPEN')));if(competition)continue;
      const [invitation] = await this.db
        .select()
        .from(routingInvitations)
        .where(
          and(
            eq(routingInvitations.applicationId, app.id),
            eq(routingInvitations.lenderId, org.id),
            eq(routingInvitations.active, 1),
          ),
        );
      if (!invitation && policy.mode !== "OPEN_POOL") continue;
      const choices = (await this.candidates(app.id)).filter(
        (c) =>
          c.lenderId === org.id &&
          (!invitation || c.offerId === invitation.offerId),
      );
      if (choices.length)
        out.push({
          id: app.id,
          amountCents: app.amountCents,
          termMonths: app.termMonths,
          purpose: app.purpose,
          province: choices[0].province,
          offerId: choices[0].offerId,
          offerName: choices[0].offerName,
          accessMode: invitation ? "INVITED" : "OPEN_POOL",
        });
    }
    return out;
  }
  async claim(actor: AuthUser, id: string, offerId: string) {
    return this.db.transaction(async (tx) => {
      const [app] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, id))
        .for("update");
      if (!app) throw new NotFoundException();
      if (
        app.lenderId ||
        !["SUBMITTED", "ACTION_REQUIRED"].includes(app.status)
      )
        throw new ConflictException(
          "This application has already been assigned or decided.",
        );
      const [competition]=await tx.select().from(loanCompetitions).where(and(eq(loanCompetitions.applicationId,id),eq(loanCompetitions.status,'OPEN')));if(competition)throw new ConflictException('This request is won by the first valid offer, not by claiming it.');
      const org = await tx.query.lenderOrgs.findFirst({
        where: eq(lenderOrgs.ownerUserId, actor.id),
      });
      if (!org || org.accreditationStatus !== "ACCREDITED")
        throw new NotFoundException();
      const policy = await this.policy(tx),
        [r] = await tx
          .select()
          .from(routingRequests)
          .where(eq(routingRequests.applicationId, id));
      const [invite] = await tx
        .select()
        .from(routingInvitations)
        .where(
          and(
            eq(routingInvitations.applicationId, id),
            eq(routingInvitations.lenderId, org.id),
            eq(routingInvitations.offerId, offerId),
            eq(routingInvitations.active, 1),
          ),
        );
      if (
        !r?.consentAt ||
        r.mode !== policy.mode ||
        (!invite && policy.mode !== "OPEN_POOL")
      )
        throw new NotFoundException();
      if (
        !(await this.candidates(id, tx)).some(
          (c) => c.offerId === offerId && c.lenderId === org.id,
        )
      )
        throw new BadRequestException(
          "This product no longer matches the request.",
        );
      await tx
        .update(applications)
        .set({ lenderId: org.id, offerId, status: "REFERRED" })
        .where(eq(applications.id, id));
      await tx
        .update(routingInvitations)
        .set({ active: 0 })
        .where(eq(routingInvitations.applicationId, id));
      await this.audit.log(
        actor,
        "personal_loan.routing_claimed",
        "personal_loan_application",
        id,
        { offerId, policyVersion: policy.version },
        tx,
      );
      await tx
        .insert(applicationEvents)
        .values({
          applicationId: id,
          actorId: actor.id,
          status: "REFERRED",
          message:
            "An eligible lender has taken responsibility for reviewing your request. This is not credit approval.",
        });
      return { ok: true };
    });
  }
}
@Controller("personal-loans/routing")
export class RoutingController {
  constructor(private service: RoutingService) {}
  @Get("policy") policy() {
    return this.service.policy();
  }
  @Roles("ADMIN", "SUPER_ADMIN") @Put("policy") save(
    @CurrentUser() a: AuthUser,
    @Body() b: unknown,
  ) {
    return this.service.save(a, parse(routingPolicySchema, b));
  }
  @Roles("ADMIN", "SUPER_ADMIN") @Get("applications/:id") state(
    @Param("id") id: string,
  ) {
    return this.service.state(id);
  }
  @Roles("ADMIN", "SUPER_ADMIN") @Post("applications/:id") assign(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.assign(a, id, parse(changeSchema, b));
  }
  @Roles("ADMIN", "SUPER_ADMIN") @Post("applications/:id/automate") automate(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
  ) {
    return this.service.automate(a, id);
  }
  @Post("applications/:id/consent") consent(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.consent(a, id, parse(consentSchema, b));
  }
  @Roles("LENDER") @Get("queue") queue(@CurrentUser() a: AuthUser) {
    return this.service.queue(a);
  }
  @Roles("LENDER") @Post("applications/:id/claim") claim(
    @CurrentUser() a: AuthUser,
    @Param("id") id: string,
    @Body() b: unknown,
  ) {
    return this.service.claim(
      a,
      id,
      parse(
        z
          .object({
            offerId: z.string().min(1).max(100),
            confirmed: z.literal(true),
          })
          .strict(),
        b,
      ).offerId,
    );
  }
}
