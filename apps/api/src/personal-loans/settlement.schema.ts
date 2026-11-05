import { randomUUID } from "crypto";
import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  users,
  personalLoanApplications,
  loans,
  lenderOrgs,
} from "../db/schema";
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());
const time = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
export const agreements = pgTable("personal_agreements", {
  id: id(),
  applicationId: text("application_id")
    .notNull()
    .unique()
    .references(() => personalLoanApplications.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  lenderId: text("lender_id")
    .notNull()
    .references(() => lenderOrgs.id),
  status: text("status").notNull().default("OFFERED"),
  content: text("content").notNull(),
  digest: text("digest").notNull(),
  terms: jsonb("terms")
    .notNull()
    .$type<{
      offerId: string;
      principalCents: number;
      termMonths: number;
      monthlyInterestRateBps: number;
      initiationFeeCents: number;
      monthlyServiceFeeCents: number;
      totalRepayableCents: number;
      monthlyInstallmentCents: number;
      depositReference?: string;
    }>(),
  assessmentReference: text("assessment_reference").notNull(),
  mandateReference: text("mandate_reference").notNull(),
  legalReference: text("legal_reference").notNull(),
  assessedAt: time("assessed_at").notNull(),
  approvedBy: text("approved_by")
    .notNull()
    .references(() => users.id),
  expiresAt: time("expires_at").notNull(),
  acceptedAt: time("accepted_at"),
  acceptedBy: text("accepted_by").references(() => users.id),
  loanId: text("loan_id")
    .unique()
    .references(() => loans.id),
  createdAt: time("created_at").notNull().defaultNow(),
});
export const beneficiaries = pgTable("wallet_beneficiaries", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  bankCode: text("bank_code").notNull(),
  encryptedDetails: text("encrypted_details").notNull(),
  last4: text("last4").notNull(),
  status: text("status").notNull().default("PENDING"),
  providerReference: text("provider_reference"),
  verifiedAt: time("verified_at"),
  createdAt: time("created_at").notNull().defaultNow(),
});
export const externalLoanPayments = pgTable('external_loan_payments', {
  id: id(),
  applicationId: text('application_id').notNull().unique().references(() => personalLoanApplications.id),
  agreementId: text('agreement_id').notNull().unique().references(() => agreements.id),
  depositReference: text('deposit_reference').notNull().unique(),
  amountCents: integer('amount_cents').notNull(),
  note: text('note').notNull(),
  confirmedBy: text('confirmed_by').notNull().references(() => users.id),
  confirmedAt: time('confirmed_at').notNull().defaultNow(),
});
export const movements = pgTable(
  "money_movements",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(),
    agreementId: text("agreement_id")
      .unique()
      .references(() => agreements.id),
    beneficiaryId: text("beneficiary_id").references(() => beneficiaries.id),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("ZAR"),
    status: text("status").notNull().default("QUEUED"),
    clientKey: text("client_key").notNull(),
    requestHash: text("request_hash").notNull(),
    providerReference: text("provider_reference").unique(),
    failureCode: text("failure_code"),
    attempts: integer("attempts").notNull().default(0),
    leaseUntil: time("lease_until"),
    nextAttemptAt: time("next_attempt_at").notNull().defaultNow(),
    createdAt: time("created_at").notNull().defaultNow(),
    updatedAt: time("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("money_movement_idempotency").on(t.userId, t.clientKey)],
);
export const moneyEvents = pgTable("money_events", {
  id: text("id").primaryKey(),
  movementId: text("movement_id")
    .notNull()
    .references(() => movements.id),
  payloadHash: text("payload_hash").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
});
export const applicationEvents = pgTable("personal_application_events", {
  id: id(),
  applicationId: text("application_id")
    .notNull()
    .references(() => personalLoanApplications.id),
  actorId: text("actor_id").references(() => users.id),
  status: text("status").notNull(),
  message: text("message").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
});
