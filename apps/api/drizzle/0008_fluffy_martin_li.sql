CREATE TABLE "lender_decision_sessions" (
	"application_id" text PRIMARY KEY NOT NULL,
	"encrypted" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lender_agent_policies" (
	"lender_id" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'MANUAL' NOT NULL,
	"policy" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"authorised_by" text NOT NULL,
	"authorised_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lender_agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"lender_id" text NOT NULL,
	"policy_version" integer NOT NULL,
	"step" text NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lender_verified_assessments" (
	"application_id" text PRIMARY KEY NOT NULL,
	"lender_id" text NOT NULL,
	"event_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"offer_id" text NOT NULL,
	"assessment_reference" text NOT NULL,
	"mandate_reference" text NOT NULL,
	"assessed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decision" text NOT NULL,
	"checks" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lender_verified_assessments_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "lender_decision_sessions" ADD CONSTRAINT "lender_decision_sessions_application_id_personal_loan_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."personal_loan_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_decision_sessions" ADD CONSTRAINT "lender_decision_sessions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_agent_policies" ADD CONSTRAINT "lender_agent_policies_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_agent_policies" ADD CONSTRAINT "lender_agent_policies_authorised_by_users_id_fk" FOREIGN KEY ("authorised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_agent_runs" ADD CONSTRAINT "lender_agent_runs_application_id_personal_loan_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."personal_loan_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_agent_runs" ADD CONSTRAINT "lender_agent_runs_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_verified_assessments" ADD CONSTRAINT "lender_verified_assessments_application_id_personal_loan_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."personal_loan_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lender_verified_assessments" ADD CONSTRAINT "lender_verified_assessments_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lender_agent_run_step" ON "lender_agent_runs" USING btree ("application_id","step");