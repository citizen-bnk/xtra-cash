CREATE TYPE "public"."accreditation_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACCREDITED', 'REJECTED', 'SUSPENDED');--> statement-breakpoint
CREATE TYPE "public"."card_kind" AS ENUM('VIRTUAL', 'PHYSICAL');--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('ACTIVE', 'FROZEN', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('PENDING', 'APPROVED', 'PAID', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."commission_type" AS ENUM('CONSUMER_ACTIVATION', 'LENDER_ACCREDITED', 'LOAN_ORIGINATION');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('UPLOADED', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('NCR_CERTIFICATE', 'CIPC_REGISTRATION', 'TAX_CLEARANCE', 'BANK_CONFIRMATION', 'DIRECTOR_ID', 'FICA_PROOF_OF_ADDRESS');--> statement-breakpoint
CREATE TYPE "public"."employment_status" AS ENUM('EMPLOYED_FULL_TIME', 'EMPLOYED_PART_TIME', 'SELF_EMPLOYED', 'INFORMAL_TRADER', 'GIG_WORKER', 'UNEMPLOYED', 'STUDENT', 'PENSIONER');--> statement-breakpoint
CREATE TYPE "public"."funding_status" AS ENUM('PENDING', 'CONFIRMED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."funding_type" AS ENUM('LOAD', 'WITHDRAWAL');--> statement-breakpoint
CREATE TYPE "public"."installment_status" AS ENUM('DUE', 'PAID', 'OVERDUE');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."loan_status" AS ENUM('ACTIVE', 'IN_ARREARS', 'SETTLED', 'DEFAULTED');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('REQUESTED', 'PAID', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('CONSUMER', 'LENDER', 'AFFILIATE', 'ADMIN', 'SUPER_ADMIN');--> statement-breakpoint
CREATE TYPE "public"."tx_channel" AS ENUM('ONLINE', 'IN_STORE', 'MARKETPLACE');--> statement-breakpoint
CREATE TYPE "public"."tx_status" AS ENUM('APPROVED', 'DECLINED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "accreditation_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"lender_id" text NOT NULL,
	"type" "document_type" NOT NULL,
	"file_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"status" "document_status" DEFAULT 'UPLOADED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "affiliate_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"commission_balance_cents" integer DEFAULT 0 NOT NULL,
	"lifetime_earned_cents" integer DEFAULT 0 NOT NULL,
	"bank_name" text,
	"bank_account_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"actor_email" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"user_id" text NOT NULL,
	"merchant_name" text NOT NULL,
	"merchant_category" text,
	"channel" "tx_channel" NOT NULL,
	"amount_cents" integer NOT NULL,
	"from_wallet_cents" integer DEFAULT 0 NOT NULL,
	"from_credit_cents" integer DEFAULT 0 NOT NULL,
	"status" "tx_status" NOT NULL,
	"decline_reason" text,
	"idempotency_key" text NOT NULL,
	"network_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"last4" text NOT NULL,
	"masked_pan" text NOT NULL,
	"expiry_month" integer NOT NULL,
	"expiry_year" integer NOT NULL,
	"status" "card_status" DEFAULT 'ACTIVE' NOT NULL,
	"kind" "card_kind" DEFAULT 'VIRTUAL' NOT NULL,
	"processor_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_processor_ref_unique" UNIQUE("processor_ref")
);
--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"source_user_id" text,
	"type" "commission_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "commission_status" DEFAULT 'PENDING' NOT NULL,
	"description" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commissions_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"seq" integer NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"status" "installment_status" DEFAULT 'DUE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"id_number" text NOT NULL,
	"date_of_birth" timestamp with time zone NOT NULL,
	"province" text NOT NULL,
	"employment_status" "employment_status" NOT NULL,
	"employer_name" text,
	"monthly_income_cents" integer NOT NULL,
	"monthly_expenses_cents" integer NOT NULL,
	"credit_score" integer,
	"bureau_reference" text,
	"consent_at" timestamp with time zone NOT NULL,
	"status" "kyc_status" DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kyc_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "kyc_profiles_id_number_unique" UNIQUE("id_number")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"journal_id" text NOT NULL,
	"account" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_journals" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" text NOT NULL,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lender_funding" (
	"id" text PRIMARY KEY NOT NULL,
	"lender_id" text NOT NULL,
	"type" "funding_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"reference" text NOT NULL,
	"status" "funding_status" DEFAULT 'PENDING' NOT NULL,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lender_funding_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "lender_orgs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"trading_name" text,
	"registration_number" text,
	"ncr_number" text,
	"contact_email" text NOT NULL,
	"contact_phone" text NOT NULL,
	"accreditation_status" "accreditation_status" DEFAULT 'DRAFT' NOT NULL,
	"assisted_accreditation" boolean DEFAULT false NOT NULL,
	"accreditation_fee_cents" integer DEFAULT 0 NOT NULL,
	"accreditation_fee_paid" boolean DEFAULT false NOT NULL,
	"review_notes" text,
	"accredited_at" timestamp with time zone,
	"available_cents" integer DEFAULT 0 NOT NULL,
	"total_loaded_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lender_orgs_owner_user_id_unique" UNIQUE("owner_user_id")
);
--> statement-breakpoint
CREATE TABLE "loan_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"lender_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"monthly_interest_rate_bps" integer NOT NULL,
	"term_months" integer NOT NULL,
	"initiation_fee_cents" integer DEFAULT 0 NOT NULL,
	"monthly_service_fee_cents" integer DEFAULT 0 NOT NULL,
	"min_amount_cents" integer DEFAULT 10000 NOT NULL,
	"max_amount_per_user_cents" integer NOT NULL,
	"min_monthly_income_cents" integer DEFAULT 0 NOT NULL,
	"min_credit_score" integer DEFAULT 0 NOT NULL,
	"min_age" integer DEFAULT 18 NOT NULL,
	"max_age" integer DEFAULT 75 NOT NULL,
	"employment_statuses" "employment_status"[] DEFAULT '{}' NOT NULL,
	"provinces" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"lender_id" text NOT NULL,
	"transaction_id" text,
	"principal_cents" integer NOT NULL,
	"monthly_interest_rate_bps" integer NOT NULL,
	"term_months" integer NOT NULL,
	"initiation_fee_cents" integer NOT NULL,
	"monthly_service_fee_cents" integer NOT NULL,
	"total_repayable_cents" integer NOT NULL,
	"outstanding_cents" integer NOT NULL,
	"status" "loan_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"affiliate_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "payout_status" DEFAULT 'REQUESTED' NOT NULL,
	"bank_name" text NOT NULL,
	"bank_account_number" text NOT NULL,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "repayments" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"lender_share_cents" integer NOT NULL,
	"platform_share_cents" integer NOT NULL,
	"method" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"roles" "role"[] NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"referral_code" text NOT NULL,
	"referred_by_id" text,
	"wallet_balance_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
ALTER TABLE "accreditation_documents" ADD CONSTRAINT "accreditation_documents_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_transactions" ADD CONSTRAINT "card_transactions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_transactions" ADD CONSTRAINT "card_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_affiliate_id_users_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_profiles" ADD CONSTRAINT "kyc_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_journal_id_ledger_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_funding" ADD CONSTRAINT "lender_funding_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_orgs" ADD CONSTRAINT "lender_orgs_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_offers" ADD CONSTRAINT "loan_offers_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_offer_id_loan_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."loan_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_transaction_id_card_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."card_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_affiliate_id_users_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tx_user_created_idx" ON "card_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tx_created_idx" ON "card_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "commissions_affiliate_status_idx" ON "commissions" USING btree ("affiliate_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "installments_loan_seq_uq" ON "installments" USING btree ("loan_id","seq");--> statement-breakpoint
CREATE INDEX "installments_status_due_idx" ON "installments" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "kyc_status_idx" ON "kyc_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ledger_account_idx" ON "ledger_entries" USING btree ("account");--> statement-breakpoint
CREATE INDEX "journal_ref_idx" ON "ledger_journals" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "funding_status_idx" ON "lender_funding" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lender_accreditation_idx" ON "lender_orgs" USING btree ("accreditation_status");--> statement-breakpoint
CREATE INDEX "offers_lender_active_idx" ON "loan_offers" USING btree ("lender_id","active");--> statement-breakpoint
CREATE INDEX "loans_user_status_idx" ON "loans" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "loans_lender_status_idx" ON "loans" USING btree ("lender_id","status");--> statement-breakpoint
CREATE INDEX "users_referred_by_idx" ON "users" USING btree ("referred_by_id");