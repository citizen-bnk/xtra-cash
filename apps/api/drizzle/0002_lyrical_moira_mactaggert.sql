CREATE TABLE "offer_assistant_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"lender_id" text NOT NULL,
	"model" text NOT NULL,
	"response" jsonb NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_loan_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"term_months" integer NOT NULL,
	"purpose" text NOT NULL,
	"monthly_income_cents" integer NOT NULL,
	"monthly_expenses_cents" integer NOT NULL,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"lender_id" text,
	"offer_id" text,
	"idempotency_key" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"identity_type" text NOT NULL,
	"identity_number" text NOT NULL,
	"mobile" text NOT NULL,
	"address" text NOT NULL,
	"identity_file_key" text NOT NULL,
	"address_file_key" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reason" text,
	"reviewed_by_id" text,
	"consent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_verifications_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "loan_offers" ADD COLUMN "product_type" text DEFAULT 'BNPL' NOT NULL;--> statement-breakpoint
ALTER TABLE "offer_assistant_generations" ADD CONSTRAINT "offer_assistant_generations_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_loan_applications" ADD CONSTRAINT "personal_loan_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_loan_applications" ADD CONSTRAINT "personal_loan_applications_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_loan_applications" ADD CONSTRAINT "personal_loan_applications_offer_id_loan_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."loan_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_verifications" ADD CONSTRAINT "personal_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_verifications" ADD CONSTRAINT "personal_verifications_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "personal_application_idempotency" ON "personal_loan_applications" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "personal_application_lender" ON "personal_loan_applications" USING btree ("lender_id");--> statement-breakpoint
CREATE INDEX "personal_application_user" ON "personal_loan_applications" USING btree ("user_id");