CREATE TABLE "vault_application_validations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"term_months" integer NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"model" text DEFAULT 'RULES_V1' NOT NULL,
	"result" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_candidate_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"lender_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"decision_payload" jsonb NOT NULL,
	"monthly_installment_cents" integer NOT NULL,
	"total_repayable_cents" integer NOT NULL,
	"cost_of_credit_cents" integer NOT NULL,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_loan_applications" ADD COLUMN "vault_validation_id" text;--> statement-breakpoint
ALTER TABLE "vault_application_validations" ADD CONSTRAINT "vault_application_validations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_candidate_offers" ADD CONSTRAINT "application_candidate_offers_application_id_personal_loan_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."personal_loan_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_candidate_offers" ADD CONSTRAINT "application_candidate_offers_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_candidate_offers" ADD CONSTRAINT "application_candidate_offers_offer_id_loan_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."loan_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vault_validation_user_created" ON "vault_application_validations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_offer_application_lender" ON "application_candidate_offers" USING btree ("application_id","lender_id");