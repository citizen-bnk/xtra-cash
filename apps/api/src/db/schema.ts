/**
 * XTRA-CASH data model (Drizzle ORM / PostgreSQL).
 * All money is integer cents (ZAR). Interest rates are monthly basis points.
 */
import { randomUUID } from 'crypto';
import { relations } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/** Raw file bytes (Postgres bytea). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

const id = () => text('id').primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const roleEnum = pgEnum('role', ['CONSUMER', 'LENDER', 'AFFILIATE', 'ADMIN', 'SUPER_ADMIN']);
export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'SUSPENDED']);
export const kycStatusEnum = pgEnum('kyc_status', ['NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED']);
export const employmentEnum = pgEnum('employment_status', [
  'EMPLOYED_FULL_TIME',
  'EMPLOYED_PART_TIME',
  'SELF_EMPLOYED',
  'INFORMAL_TRADER',
  'GIG_WORKER',
  'UNEMPLOYED',
  'STUDENT',
  'PENSIONER',
]);
export const accreditationEnum = pgEnum('accreditation_status', ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACCREDITED', 'REJECTED', 'SUSPENDED']);
export const documentTypeEnum = pgEnum('document_type', [
  'NCR_CERTIFICATE',
  'CIPC_REGISTRATION',
  'TAX_CLEARANCE',
  'BANK_CONFIRMATION',
  'DIRECTOR_ID',
  'FICA_PROOF_OF_ADDRESS',
]);
export const documentStatusEnum = pgEnum('document_status', ['UPLOADED', 'ACCEPTED', 'REJECTED']);
export const fundingTypeEnum = pgEnum('funding_type', ['LOAD', 'WITHDRAWAL']);
export const fundingStatusEnum = pgEnum('funding_status', ['PENDING', 'CONFIRMED', 'REJECTED']);
export const cardStatusEnum = pgEnum('card_status', ['ACTIVE', 'FROZEN', 'CANCELLED']);
export const cardKindEnum = pgEnum('card_kind', ['VIRTUAL', 'PHYSICAL']);
export const txStatusEnum = pgEnum('tx_status', ['APPROVED', 'DECLINED', 'REVERSED']);
export const txChannelEnum = pgEnum('tx_channel', ['ONLINE', 'IN_STORE', 'MARKETPLACE']);
export const loanStatusEnum = pgEnum('loan_status', ['ACTIVE', 'IN_ARREARS', 'SETTLED', 'DEFAULTED']);
export const installmentStatusEnum = pgEnum('installment_status', ['DUE', 'PAID', 'OVERDUE']);
export const commissionTypeEnum = pgEnum('commission_type', ['CONSUMER_ACTIVATION', 'LENDER_ACCREDITED', 'LOAN_ORIGINATION']);
export const commissionStatusEnum = pgEnum('commission_status', ['PENDING', 'APPROVED', 'PAID', 'REJECTED']);
export const payoutStatusEnum = pgEnum('payout_status', ['REQUESTED', 'PAID', 'REJECTED']);

// ---------------------------------------------------------------- users & auth
export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull().unique(),
    phone: text('phone').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    roles: roleEnum('roles').array().notNull(),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    referralCode: text('referral_code').notNull().unique(),
    referredById: text('referred_by_id'),
    walletBalanceCents: integer('wallet_balance_cents').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index('users_referred_by_idx').on(t.referredById)],
);

export const refreshTokens = pgTable('refresh_tokens', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  createdAt: createdAt(),
});

export const kycProfiles = pgTable(
  'kyc_profiles',
  {
    id: id(),
    userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
    idNumber: text('id_number').notNull().unique(),
    dateOfBirth: ts('date_of_birth').notNull(),
    province: text('province').notNull(),
    employmentStatus: employmentEnum('employment_status').notNull(),
    employerName: text('employer_name'),
    monthlyIncomeCents: integer('monthly_income_cents').notNull(),
    monthlyExpensesCents: integer('monthly_expenses_cents').notNull(),
    creditScore: integer('credit_score'),
    bureauReference: text('bureau_reference'),
    consentAt: ts('consent_at').notNull(),
    status: kycStatusEnum('status').notNull().default('PENDING'),
    rejectionReason: text('rejection_reason'),
    verifiedAt: ts('verified_at'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index('kyc_status_idx').on(t.status)],
);

// ---------------------------------------------------------------- credit mall (lenders)
export const lenderOrgs = pgTable(
  'lender_orgs',
  {
    id: id(),
    ownerUserId: text('owner_user_id').notNull().unique().references(() => users.id),
    name: text('name').notNull(),
    tradingName: text('trading_name'),
    registrationNumber: text('registration_number'),
    ncrNumber: text('ncr_number'),
    contactEmail: text('contact_email').notNull(),
    contactPhone: text('contact_phone').notNull(),
    accreditationStatus: accreditationEnum('accreditation_status').notNull().default('DRAFT'),
    assistedAccreditation: boolean('assisted_accreditation').notNull().default(false),
    accreditationFeeCents: integer('accreditation_fee_cents').notNull().default(0),
    accreditationFeePaid: boolean('accreditation_fee_paid').notNull().default(false),
    reviewNotes: text('review_notes'),
    accreditedAt: ts('accredited_at'),
    availableCents: integer('available_cents').notNull().default(0),
    totalLoadedCents: integer('total_loaded_cents').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index('lender_accreditation_idx').on(t.accreditationStatus)],
);

export const accreditationDocuments = pgTable('accreditation_documents', {
  id: id(),
  lenderId: text('lender_id').notNull().references(() => lenderOrgs.id, { onDelete: 'cascade' }),
  type: documentTypeEnum('type').notNull(),
  fileName: text('file_name').notNull(),
  storageKey: text('storage_key').notNull(),
  status: documentStatusEnum('status').notNull().default('UPLOADED'),
  createdAt: createdAt(),
});

export const lenderFunding = pgTable(
  'lender_funding',
  {
    id: id(),
    lenderId: text('lender_id').notNull().references(() => lenderOrgs.id),
    type: fundingTypeEnum('type').notNull(),
    amountCents: integer('amount_cents').notNull(),
    reference: text('reference').notNull().unique(),
    status: fundingStatusEnum('status').notNull().default('PENDING'),
    decidedById: text('decided_by_id'),
    decidedAt: ts('decided_at'),
    createdAt: createdAt(),
  },
  (t) => [index('funding_status_idx').on(t.status)],
);

export const loanOffers = pgTable(
  'loan_offers',
  {
    id: id(),
    lenderId: text('lender_id').notNull().references(() => lenderOrgs.id),
    name: text('name').notNull(),
    description: text('description'),
    active: boolean('active').notNull().default(true),
    monthlyInterestRateBps: integer('monthly_interest_rate_bps').notNull(),
    termMonths: integer('term_months').notNull(),
    initiationFeeCents: integer('initiation_fee_cents').notNull().default(0),
    monthlyServiceFeeCents: integer('monthly_service_fee_cents').notNull().default(0),
    minAmountCents: integer('min_amount_cents').notNull().default(10000),
    maxAmountPerUserCents: integer('max_amount_per_user_cents').notNull(),
    // Targeting criteria
    minMonthlyIncomeCents: integer('min_monthly_income_cents').notNull().default(0),
    minCreditScore: integer('min_credit_score').notNull().default(0),
    minAge: integer('min_age').notNull().default(18),
    maxAge: integer('max_age').notNull().default(75),
    employmentStatuses: employmentEnum('employment_statuses').array().notNull().default([]),
    provinces: text('provinces').array().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index('offers_lender_active_idx').on(t.lenderId, t.active)],
);

// ---------------------------------------------------------------- cards & transactions
export const cards = pgTable('cards', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id),
  last4: text('last4').notNull(),
  maskedPan: text('masked_pan').notNull(),
  expiryMonth: integer('expiry_month').notNull(),
  expiryYear: integer('expiry_year').notNull(),
  status: cardStatusEnum('status').notNull().default('ACTIVE'),
  kind: cardKindEnum('kind').notNull().default('VIRTUAL'),
  processorRef: text('processor_ref').notNull().unique(),
  createdAt: createdAt(),
});

export const cardTransactions = pgTable(
  'card_transactions',
  {
    id: id(),
    cardId: text('card_id').notNull().references(() => cards.id),
    userId: text('user_id').notNull().references(() => users.id),
    merchantName: text('merchant_name').notNull(),
    merchantCategory: text('merchant_category'),
    channel: txChannelEnum('channel').notNull(),
    amountCents: integer('amount_cents').notNull(),
    fromWalletCents: integer('from_wallet_cents').notNull().default(0),
    fromCreditCents: integer('from_credit_cents').notNull().default(0),
    status: txStatusEnum('status').notNull(),
    declineReason: text('decline_reason'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    networkRef: text('network_ref'),
    createdAt: createdAt(),
  },
  (t) => [index('tx_user_created_idx').on(t.userId, t.createdAt), index('tx_created_idx').on(t.createdAt)],
);

// ---------------------------------------------------------------- loans
export const loans = pgTable(
  'loans',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id),
    offerId: text('offer_id').notNull().references(() => loanOffers.id),
    lenderId: text('lender_id').notNull().references(() => lenderOrgs.id),
    transactionId: text('transaction_id').references(() => cardTransactions.id),
    principalCents: integer('principal_cents').notNull(),
    monthlyInterestRateBps: integer('monthly_interest_rate_bps').notNull(),
    termMonths: integer('term_months').notNull(),
    initiationFeeCents: integer('initiation_fee_cents').notNull(),
    monthlyServiceFeeCents: integer('monthly_service_fee_cents').notNull(),
    totalRepayableCents: integer('total_repayable_cents').notNull(),
    outstandingCents: integer('outstanding_cents').notNull(),
    status: loanStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: createdAt(),
    settledAt: ts('settled_at'),
  },
  (t) => [index('loans_user_status_idx').on(t.userId, t.status), index('loans_lender_status_idx').on(t.lenderId, t.status)],
);

export const installments = pgTable(
  'installments',
  {
    id: id(),
    loanId: text('loan_id').notNull().references(() => loans.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    dueDate: ts('due_date').notNull(),
    amountCents: integer('amount_cents').notNull(),
    paidCents: integer('paid_cents').notNull().default(0),
    status: installmentStatusEnum('status').notNull().default('DUE'),
  },
  (t) => [uniqueIndex('installments_loan_seq_uq').on(t.loanId, t.seq), index('installments_status_due_idx').on(t.status, t.dueDate)],
);

export const repayments = pgTable('repayments', {
  id: id(),
  loanId: text('loan_id').notNull().references(() => loans.id),
  amountCents: integer('amount_cents').notNull(),
  lenderShareCents: integer('lender_share_cents').notNull(),
  platformShareCents: integer('platform_share_cents').notNull(),
  method: text('method').notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- affiliates
export const affiliateProfiles = pgTable('affiliate_profiles', {
  id: id(),
  userId: text('user_id').notNull().unique().references(() => users.id),
  commissionBalanceCents: integer('commission_balance_cents').notNull().default(0),
  lifetimeEarnedCents: integer('lifetime_earned_cents').notNull().default(0),
  bankName: text('bank_name'),
  bankAccountNumber: text('bank_account_number'),
  createdAt: createdAt(),
});

export const commissions = pgTable(
  'commissions',
  {
    id: id(),
    affiliateId: text('affiliate_id').notNull().references(() => users.id),
    sourceUserId: text('source_user_id'),
    type: commissionTypeEnum('type').notNull(),
    amountCents: integer('amount_cents').notNull(),
    status: commissionStatusEnum('status').notNull().default('PENDING'),
    description: text('description').notNull(),
    /** Prevents paying the same event twice, e.g. "CONSUMER_ACTIVATION:<userId>" */
    dedupeKey: text('dedupe_key').notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [index('commissions_affiliate_status_idx').on(t.affiliateId, t.status)],
);

export const payouts = pgTable('payouts', {
  id: id(),
  affiliateId: text('affiliate_id').notNull().references(() => users.id),
  amountCents: integer('amount_cents').notNull(),
  status: payoutStatusEnum('status').notNull().default('REQUESTED'),
  bankName: text('bank_name').notNull(),
  bankAccountNumber: text('bank_account_number').notNull(),
  reference: text('reference'),
  createdAt: createdAt(),
  decidedAt: ts('decided_at'),
});

// ---------------------------------------------------------------- ledger, settings, audit
/** Double-entry ledger: every money movement writes a journal whose entries sum to zero. */
export const ledgerJournals = pgTable(
  'ledger_journals',
  {
    id: id(),
    type: text('type').notNull(),
    refType: text('ref_type').notNull(),
    refId: text('ref_id').notNull(),
    memo: text('memo'),
    createdAt: createdAt(),
  },
  (t) => [index('journal_ref_idx').on(t.refType, t.refId)],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: id(),
    journalId: text('journal_id').notNull().references(() => ledgerJournals.id, { onDelete: 'cascade' }),
    account: text('account').notNull(),
    amountCents: integer('amount_cents').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('ledger_account_idx').on(t.account)],
);

export const platformSettings = pgTable('platform_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorId: text('actor_id'),
    actorEmail: text('actor_email'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    meta: jsonb('meta'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_created_idx').on(t.createdAt)],
);

// ---------------------------------------------------------------- relations (for relational queries)
export const usersRelations = relations(users, ({ one, many }) => ({
  kyc: one(kycProfiles, { fields: [users.id], references: [kycProfiles.userId] }),
  lender: one(lenderOrgs, { fields: [users.id], references: [lenderOrgs.ownerUserId] }),
  affiliate: one(affiliateProfiles, { fields: [users.id], references: [affiliateProfiles.userId] }),
  cards: many(cards),
  loans: many(loans),
}));
export const kycRelations = relations(kycProfiles, ({ one }) => ({
  user: one(users, { fields: [kycProfiles.userId], references: [users.id] }),
}));
export const lenderRelations = relations(lenderOrgs, ({ one, many }) => ({
  owner: one(users, { fields: [lenderOrgs.ownerUserId], references: [users.id] }),
  documents: many(accreditationDocuments),
  offers: many(loanOffers),
  funding: many(lenderFunding),
  loans: many(loans),
}));
export const documentRelations = relations(accreditationDocuments, ({ one }) => ({
  lender: one(lenderOrgs, { fields: [accreditationDocuments.lenderId], references: [lenderOrgs.id] }),
}));
export const fundingRelations = relations(lenderFunding, ({ one }) => ({
  lender: one(lenderOrgs, { fields: [lenderFunding.lenderId], references: [lenderOrgs.id] }),
}));
export const offerRelations = relations(loanOffers, ({ one, many }) => ({
  lender: one(lenderOrgs, { fields: [loanOffers.lenderId], references: [lenderOrgs.id] }),
  loans: many(loans),
}));
export const cardRelations = relations(cards, ({ one, many }) => ({
  user: one(users, { fields: [cards.userId], references: [users.id] }),
  transactions: many(cardTransactions),
}));
export const txRelations = relations(cardTransactions, ({ one, many }) => ({
  card: one(cards, { fields: [cardTransactions.cardId], references: [cards.id] }),
  user: one(users, { fields: [cardTransactions.userId], references: [users.id] }),
  loans: many(loans),
}));
export const loanRelations = relations(loans, ({ one, many }) => ({
  user: one(users, { fields: [loans.userId], references: [users.id] }),
  lender: one(lenderOrgs, { fields: [loans.lenderId], references: [lenderOrgs.id] }),
  offer: one(loanOffers, { fields: [loans.offerId], references: [loanOffers.id] }),
  transaction: one(cardTransactions, { fields: [loans.transactionId], references: [cardTransactions.id] }),
  installments: many(installments),
  repayments: many(repayments),
}));
export const installmentRelations = relations(installments, ({ one }) => ({
  loan: one(loans, { fields: [installments.loanId], references: [loans.id] }),
}));
export const repaymentRelations = relations(repayments, ({ one }) => ({
  loan: one(loans, { fields: [repayments.loanId], references: [loans.id] }),
}));
export const commissionRelations = relations(commissions, ({ one }) => ({
  affiliate: one(users, { fields: [commissions.affiliateId], references: [users.id] }),
}));
export const payoutRelations = relations(payouts, ({ one }) => ({
  affiliate: one(users, { fields: [payouts.affiliateId], references: [users.id] }),
}));
export const journalRelations = relations(ledgerJournals, ({ many }) => ({ entries: many(ledgerEntries) }));
export const entryRelations = relations(ledgerEntries, ({ one }) => ({
  journal: one(ledgerJournals, { fields: [ledgerEntries.journalId], references: [ledgerJournals.id] }),
}));

/**
 * Uploaded files (lender accreditation documents). Kept in the database because the API runs as
 * serverless functions on Vercel, where the local disk is read-only and not shared between instances.
 */
export const storedFiles = pgTable('stored_files', {
  key: text('key').primaryKey(),
  originalName: text('original_name').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  content: bytea('content').notNull(),
  createdAt: createdAt(),
});
