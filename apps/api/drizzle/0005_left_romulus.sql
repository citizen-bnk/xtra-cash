CREATE TABLE "marketing_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"day" text NOT NULL,
	"status" text DEFAULT 'RESERVED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"device_key" text NOT NULL,
	"platform" text NOT NULL,
	"payload_encrypted" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_devices_device_key_unique" UNIQUE("device_key")
);
--> statement-breakpoint
CREATE TABLE "marketing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_members" (
	"user_id" text PRIMARY KEY NOT NULL,
	"marketing" boolean DEFAULT false NOT NULL,
	"location_enabled" boolean DEFAULT false NOT NULL,
	"location_encrypted" text,
	"located_at" timestamp with time zone,
	"consent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "marketing_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"delivery_id" text NOT NULL,
	"device_id" text NOT NULL,
	"ticket_id" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"lender_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"target" jsonb NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loan_offers" ADD COLUMN "location_target" jsonb;--> statement-breakpoint
ALTER TABLE "marketing_deliveries" ADD CONSTRAINT "marketing_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_deliveries" ADD CONSTRAINT "marketing_deliveries_campaign_id_offer_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."offer_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_deliveries" ADD CONSTRAINT "marketing_deliveries_offer_id_loan_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."loan_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_devices" ADD CONSTRAINT "marketing_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_events" ADD CONSTRAINT "marketing_events_campaign_id_offer_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."offer_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_events" ADD CONSTRAINT "marketing_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_members" ADD CONSTRAINT "marketing_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_receipts" ADD CONSTRAINT "marketing_receipts_delivery_id_marketing_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."marketing_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_receipts" ADD CONSTRAINT "marketing_receipts_device_id_marketing_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."marketing_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_campaigns" ADD CONSTRAINT "offer_campaigns_lender_id_lender_orgs_id_fk" FOREIGN KEY ("lender_id") REFERENCES "public"."lender_orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_campaigns" ADD CONSTRAINT "offer_campaigns_offer_id_loan_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."loan_offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_member_offer_day" ON "marketing_deliveries" USING btree ("user_id","offer_id","day");--> statement-breakpoint
CREATE INDEX "marketing_member_day" ON "marketing_deliveries" USING btree ("user_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_event_member_kind" ON "marketing_events" USING btree ("campaign_id","user_id","kind");--> statement-breakpoint
CREATE INDEX "campaigns_lender_idx" ON "offer_campaigns" USING btree ("lender_id");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "offer_campaigns" USING btree ("status");