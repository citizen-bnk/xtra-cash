CREATE TABLE "application_lender_access" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"lender_id" text NOT NULL,
	"granted_by" text NOT NULL,
	"authority_reference" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_lender_access" ADD CONSTRAINT "application_lender_access_application_id_personal_loan_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."personal_loan_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_lender_access" ADD CONSTRAINT "application_lender_access_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_lender_access" ADD CONSTRAINT "application_lender_access_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_lender_access_pair" ON "application_lender_access" USING btree ("application_id","lender_id");