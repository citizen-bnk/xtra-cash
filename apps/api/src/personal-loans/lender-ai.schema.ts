import { randomUUID } from "crypto";
import {
  pgTable,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users, lenderOrgs, personalLoanApplications } from "../db/schema";
const time = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
export const applicationLenderAccess = pgTable("application_lender_access", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  applicationId: text("application_id").notNull().references(() => personalLoanApplications.id),
  lenderId: text("lender_id").notNull().references(() => lenderOrgs.id),
  grantedBy: text("granted_by").notNull().references(() => users.id),
  authorityReference: text("authority_reference").notNull(),
  active: integer("active").notNull().default(1),
  updatedAt: time("updated_at").notNull().defaultNow(),
}, t => [uniqueIndex("application_lender_access_pair").on(t.applicationId,t.lenderId)]);
export interface DecisionDraft {
  offerId?: string;
  assessmentReference?: string;
  mandateReference?: string;
  legalReference?: string;
  assessedAt?: string;
  expiresAt?: string;
  agreementTerms?: string;
}
export interface AgentPolicy {
  offerId: string;
  amountLimitCents: number;
  dailyOfferLimit: number;
  expiryHours: number;
  legalReference: string;
  agreementTerms: string;
  automationReviewReference: string;
}
export interface DecisionConversation {
  messages: { role: "user" | "assistant"; content: string }[];
  draft: DecisionDraft;
  provenance: Record<string, string>;
  requestKeys: string[];
  nextAction:
    | "PREPARE_OFFER"
    | "REQUEST_INFORMATION"
    | "REVIEW"
    | "RESOLVE_HUMAN_REVIEW";
  informationMessage: string;
  lastAppliedDigest?: string;
}
export const decisionSessions = pgTable("lender_decision_sessions", {
  applicationId: text("application_id")
    .primaryKey()
    .references(() => personalLoanApplications.id),
  encrypted: text("encrypted").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("DRAFT"),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => users.id),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const lenderAgentPolicies = pgTable("lender_agent_policies", {
  lenderId: text("lender_id")
    .primaryKey()
    .references(() => lenderOrgs.id),
  mode: text("mode").notNull().default("MANUAL"),
  policy: jsonb("policy").notNull().$type<AgentPolicy>(),
  version: integer("version").notNull().default(1),
  authorisedBy: text("authorised_by")
    .notNull()
    .references(() => users.id),
  authorisedAt: time("authorised_at").notNull().defaultNow(),
});
export const lenderAssessments = pgTable("lender_verified_assessments", {
  applicationId: text("application_id")
    .primaryKey()
    .references(() => personalLoanApplications.id),
  lenderId: text("lender_id")
    .notNull()
    .references(() => lenderOrgs.id),
  eventId: text("event_id").notNull().unique(),
  payloadHash: text("payload_hash").notNull(),
  offerId: text("offer_id").notNull(),
  assessmentReference: text("assessment_reference").notNull(),
  mandateReference: text("mandate_reference").notNull(),
  assessedAt: time("assessed_at").notNull(),
  expiresAt: time("expires_at").notNull(),
  decision: text("decision").notNull(),
  checks: jsonb("checks")
    .notNull()
    .$type<{
      identity: boolean;
      income: boolean;
      credit: boolean;
      affordability: boolean;
      mandate: boolean;
    }>(),
  createdAt: time("created_at").notNull().defaultNow(),
});
export const lenderAgentRuns = pgTable(
  "lender_agent_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    applicationId: text("application_id")
      .notNull()
      .references(() => personalLoanApplications.id),
    lenderId: text("lender_id")
      .notNull()
      .references(() => lenderOrgs.id),
    policyVersion: integer("policy_version").notNull(),
    step: text("step").notNull(),
    result: text("result").notNull(),
    createdAt: time("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("lender_agent_run_step").on(t.applicationId, t.step)],
);
export const workAssistantPreferences = pgTable("work_assistant_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  mode: text("mode").notNull().default("MANUAL"),
  instructions: text("instructions").notNull().default(""),
  maxAmountRand: integer("max_amount_rand").notNull().default(5000),
  updatedAt: time("updated_at").notNull().defaultNow(),
});
export const workAssistantTasks = pgTable("work_assistant_tasks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  scope: text("scope").notNull(),
  encrypted: text("encrypted").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
});
