ALTER TYPE "public"."role" ADD VALUE 'SALES_REP';--> statement-breakpoint
CREATE TABLE "payday_awards" (
	"id" text PRIMARY KEY NOT NULL,
	"employer_id" text NOT NULL,
	"rep_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"approved_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_by" text,
	"paid_at" timestamp with time zone,
	"payment_reference" text,
	CONSTRAINT "payday_awards_employer_id_unique" UNIQUE("employer_id")
);
--> statement-breakpoint
CREATE TABLE "payday_completions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"module_id" text NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payday_employees" (
	"user_id" text PRIMARY KEY NOT NULL,
	"employee_number" text NOT NULL,
	"territory" text DEFAULT 'Sandton, Gauteng' NOT NULL,
	"status" text DEFAULT 'ONBOARDING' NOT NULL,
	"basic_cents" integer DEFAULT 550000 NOT NULL,
	"weekly_hours" integer DEFAULT 40 NOT NULL,
	"start_date" text NOT NULL,
	"employment_reference" text NOT NULL,
	"emergency_contact" text,
	"password_change_required" boolean DEFAULT false NOT NULL,
	"onboarding_acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payday_employees_employee_number_unique" UNIQUE("employee_number")
);
--> statement-breakpoint
CREATE TABLE "payday_employers" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"created_by" text NOT NULL,
	"client_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"legal_name" text NOT NULL,
	"registration_number" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_channel" text NOT NULL,
	"address" text NOT NULL,
	"headcount" integer NOT NULL,
	"permission_reference" text NOT NULL,
	"next_action" text NOT NULL,
	"follow_up_at" timestamp with time zone NOT NULL,
	"stage" text DEFAULT 'NEW' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"agreement_reference" text,
	"lender_reference" text,
	"payroll_reference" text,
	"policy_version" text NOT NULL,
	"commission_cents" integer NOT NULL,
	"buffer_cents" integer NOT NULL,
	"onboarding_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payday_employers_registration_number_unique" UNIQUE("registration_number")
);
--> statement-breakpoint
CREATE TABLE "payday_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"employer_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"reference" text NOT NULL,
	"evidence" text NOT NULL,
	"lender_id" text,
	"reverses_id" text,
	"created_by" text NOT NULL,
	"verified_by" text,
	"rejected_at" timestamp with time zone,
	"settled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payday_entries_reference_unique" UNIQUE("reference"),
	CONSTRAINT "payday_entries_reverses_id_unique" UNIQUE("reverses_id")
);
--> statement-breakpoint
CREATE TABLE "payday_kit" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"item" text NOT NULL,
	"quantity" integer NOT NULL,
	"issued_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"returned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payday_statement_awards" (
	"id" text PRIMARY KEY NOT NULL,
	"statement_id" text NOT NULL,
	"award_id" text NOT NULL,
	CONSTRAINT "payday_statement_awards_award_id_unique" UNIQUE("award_id")
);
--> statement-breakpoint
CREATE TABLE "payday_statements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"period" text NOT NULL,
	"basic_cents" integer NOT NULL,
	"other_cents" integer DEFAULT 0 NOT NULL,
	"commission_cents" integer NOT NULL,
	"deductions" jsonb NOT NULL,
	"net_cents" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"payroll_evidence" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"paid_by" text,
	"paid_at" timestamp with time zone,
	"payment_reference" text,
	CONSTRAINT "payday_statements_payment_reference_unique" UNIQUE("payment_reference")
);
--> statement-breakpoint
CREATE TABLE "payday_training" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payday_visits" (
	"id" text PRIMARY KEY NOT NULL,
	"employer_id" text NOT NULL,
	"rep_id" text NOT NULL,
	"client_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"outcome" text NOT NULL,
	"notes" text NOT NULL,
	"next_action" text NOT NULL,
	"follow_up_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payday_awards" ADD CONSTRAINT "payday_awards_employer_id_payday_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."payday_employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_awards" ADD CONSTRAINT "payday_awards_rep_id_users_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_awards" ADD CONSTRAINT "payday_awards_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_awards" ADD CONSTRAINT "payday_awards_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_completions" ADD CONSTRAINT "payday_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_completions" ADD CONSTRAINT "payday_completions_module_id_payday_training_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."payday_training"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_employees" ADD CONSTRAINT "payday_employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_employers" ADD CONSTRAINT "payday_employers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_employers" ADD CONSTRAINT "payday_employers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_entries" ADD CONSTRAINT "payday_entries_employer_id_payday_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."payday_employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_entries" ADD CONSTRAINT "payday_entries_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_entries" ADD CONSTRAINT "payday_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_entries" ADD CONSTRAINT "payday_entries_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_kit" ADD CONSTRAINT "payday_kit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_kit" ADD CONSTRAINT "payday_kit_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_statement_awards" ADD CONSTRAINT "payday_statement_awards_statement_id_payday_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."payday_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_statement_awards" ADD CONSTRAINT "payday_statement_awards_award_id_payday_awards_id_fk" FOREIGN KEY ("award_id") REFERENCES "public"."payday_awards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_statements" ADD CONSTRAINT "payday_statements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_statements" ADD CONSTRAINT "payday_statements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_statements" ADD CONSTRAINT "payday_statements_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_statements" ADD CONSTRAINT "payday_statements_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_training" ADD CONSTRAINT "payday_training_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_visits" ADD CONSTRAINT "payday_visits_employer_id_payday_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."payday_employers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payday_visits" ADD CONSTRAINT "payday_visits_rep_id_users_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payday_training_completion" ON "payday_completions" USING btree ("user_id","module_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "payday_lead_sync_key" ON "payday_employers" USING btree ("created_by","client_key");--> statement-breakpoint
CREATE INDEX "payday_lead_owner" ON "payday_employers" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "payday_entries_employer" ON "payday_entries" USING btree ("employer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payday_visit_sync_key" ON "payday_visits" USING btree ("rep_id","client_key");