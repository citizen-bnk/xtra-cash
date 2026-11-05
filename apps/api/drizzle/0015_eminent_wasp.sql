CREATE TABLE "external_loan_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"agreement_id" text NOT NULL,
	"deposit_reference" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"note" text NOT NULL,
	"confirmed_by" text NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_loan_payments_application_id_unique" UNIQUE("application_id"),
	CONSTRAINT "external_loan_payments_agreement_id_unique" UNIQUE("agreement_id"),
	CONSTRAINT "external_loan_payments_deposit_reference_unique" UNIQUE("deposit_reference")
);
--> statement-breakpoint
ALTER TABLE "external_loan_payments" ADD CONSTRAINT "external_loan_payments_application_id_personal_loan_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."personal_loan_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_loan_payments" ADD CONSTRAINT "external_loan_payments_agreement_id_personal_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."personal_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_loan_payments" ADD CONSTRAINT "external_loan_payments_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;