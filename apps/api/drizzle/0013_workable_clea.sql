CREATE TABLE "loan_competitions" (
	"application_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"released_by" text NOT NULL,
	"authority_reference" text NOT NULL,
	"winner_lender_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_demo_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"stage" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_notification_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"notification_key" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loan_competitions" ADD CONSTRAINT "loan_competitions_application_id_personal_loan_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."personal_loan_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_competitions" ADD CONSTRAINT "loan_competitions_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_competitions" ADD CONSTRAINT "loan_competitions_winner_lender_id_lender_orgs_id_fk" FOREIGN KEY ("winner_lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_notification_receipts" ADD CONSTRAINT "loan_notification_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "loan_notification_receipt_user_key" ON "loan_notification_receipts" USING btree ("user_id","notification_key");