CREATE TABLE "application_routing_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"lender_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_routing" (
	"application_id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"consent_at" timestamp with time zone,
	"encrypted_location" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_routing_invitations" ADD CONSTRAINT "application_routing_invitations_application_id_personal_loan_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."personal_loan_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_routing_invitations" ADD CONSTRAINT "application_routing_invitations_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_routing_invitations" ADD CONSTRAINT "application_routing_invitations_offer_id_loan_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."loan_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_routing" ADD CONSTRAINT "application_routing_application_id_personal_loan_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."personal_loan_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "routing_invitation_pair" ON "application_routing_invitations" USING btree ("application_id","lender_id");