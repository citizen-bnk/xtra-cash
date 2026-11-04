CREATE TABLE "personal_agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"user_id" text NOT NULL,
	"lender_id" text NOT NULL,
	"status" text DEFAULT 'OFFERED' NOT NULL,
	"content" text NOT NULL,
	"digest" text NOT NULL,
	"terms" jsonb NOT NULL,
	"assessment_reference" text NOT NULL,
	"mandate_reference" text NOT NULL,
	"legal_reference" text NOT NULL,
	"assessed_at" timestamp with time zone NOT NULL,
	"approved_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"loan_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_agreements_application_id_unique" UNIQUE("application_id"),
	CONSTRAINT "personal_agreements_loan_id_unique" UNIQUE("loan_id")
);
--> statement-breakpoint
CREATE TABLE "personal_application_events" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"actor_id" text,
	"status" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_beneficiaries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"bank_code" text NOT NULL,
	"encrypted_details" text NOT NULL,
	"last4" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"provider_reference" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_events" (
	"id" text PRIMARY KEY NOT NULL,
	"movement_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"agreement_id" text,
	"beneficiary_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"client_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"provider_reference" text,
	"failure_code" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_movements_agreement_id_unique" UNIQUE("agreement_id"),
	CONSTRAINT "money_movements_provider_reference_unique" UNIQUE("provider_reference")
);
--> statement-breakpoint
ALTER TABLE "personal_agreements" ADD CONSTRAINT "personal_agreements_application_id_personal_loan_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."personal_loan_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_agreements" ADD CONSTRAINT "personal_agreements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_agreements" ADD CONSTRAINT "personal_agreements_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_agreements" ADD CONSTRAINT "personal_agreements_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_agreements" ADD CONSTRAINT "personal_agreements_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_agreements" ADD CONSTRAINT "personal_agreements_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_application_events" ADD CONSTRAINT "personal_application_events_application_id_personal_loan_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."personal_loan_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_application_events" ADD CONSTRAINT "personal_application_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_beneficiaries" ADD CONSTRAINT "wallet_beneficiaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_events" ADD CONSTRAINT "money_events_movement_id_money_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."money_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_agreement_id_personal_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."personal_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_movements" ADD CONSTRAINT "money_movements_beneficiary_id_wallet_beneficiaries_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."wallet_beneficiaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "money_movement_idempotency" ON "money_movements" USING btree ("user_id","client_key");